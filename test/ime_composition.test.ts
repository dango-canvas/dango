// test/ime_composition.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { state } from '../dango/js/modules/state.js';
import { initRender } from '../dango/js/modules/render.js';
import { handleNodeEdit } from '../dango/js/modules/interactions.js';

class MockDOMElement {
    tagName: string;
    id: string;
    className: string;
    innerText: string;
    style: Record<string, string>;
    dataset: Record<string, string>;
    contentEditable: string = 'false';
    offsetWidth: number = 100;
    offsetHeight: number = 40;
    isConnected: boolean = true;
    children: any[] = [];
    classList: {
        contains: (c: string) => boolean;
        add: (c: string) => void;
        remove: (c: string) => void;
        toggle: (c: string) => void;
    };
    private _listeners: Record<string, Function[]> = {};

    constructor(id: string = '', text: string = '') {
        this.id = id;
        this.tagName = 'DIV';
        this.className = 'node';
        this.innerText = text;
        this.style = {};
        this.dataset = { id };
        const classes = new Set<string>(['node']);
        this.classList = {
            contains: (c: string) => classes.has(c),
            add: (c: string) => { classes.add(c); this.className = Array.from(classes).join(' '); },
            remove: (c: string) => { classes.delete(c); this.className = Array.from(classes).join(' '); },
            toggle: (c: string) => { if (classes.has(c)) classes.delete(c); else classes.add(c); this.className = Array.from(classes).join(' '); }
        };
    }

    addEventListener(event: string, fn: Function) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(fn);
    }

    removeEventListener(event: string, fn: Function) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(l => l !== fn);
    }

    dispatchEvent(event: { type: string }) {
        const fns = this._listeners[event.type] || [];
        fns.forEach(fn => fn(event));
    }

    attributes: Record<string, string> = {};

    setAttribute(name: string, value: string) {
        this.attributes[name] = value;
        if (name === 'contenteditable') this.contentEditable = value;
    }

    getAttribute(name: string) {
        if (name === 'contenteditable') return this.contentEditable;
        return this.attributes[name] || null;
    }

    removeAttribute(name: string) {
        delete this.attributes[name];
    }

    querySelector(selector: string): any {
        return null;
    }

    querySelectorAll(selector: string): any[] {
        return [];
    }

    appendChild(child: any) {
        this.children.push(child);
        child.parentNode = this;
        return child;
    }

    removeChild(child: any) {
        this.children = this.children.filter(c => c !== child);
        child.parentNode = null;
        return child;
    }

    focus() {}
    blur() {
        if ((this as any).onblur) (this as any).onblur();
    }
}

describe('IME Composition Guard for Node Editing', () => {
    beforeEach(() => {
        state.nodes = [
            { id: 'node-1', text: '初始文本', x: 0, y: 0, w: 100, h: 40, color: 'c-white' }
        ];
        state.selection = new Set(['node-1']);

        const mockElements: Record<string, any> = {
            'connections-layer': new MockDOMElement('connections-layer'),
            'nodes-layer': new MockDOMElement('nodes-layer'),
            'groups-layer': new MockDOMElement('groups-layer'),
            'snap-guides-layer': new MockDOMElement('snap-guides-layer'),
            'container': new MockDOMElement('container'),
            'ui-layer': new MockDOMElement('ui-layer')
        };

        // Mock window / document globals needed by handleNodeEdit
        (globalThis as any).window = {
            getSelection: () => ({
                removeAllRanges: () => {},
                addRange: () => {},
                rangeCount: 0
            })
        };
        const mockBody = new MockDOMElement('body');
        const mockHtml = new MockDOMElement('html');
        (globalThis as any).getComputedStyle = () => ({
            getPropertyValue: () => ''
        });
        (globalThis as any).document = {
            body: mockBody,
            documentElement: mockHtml,
            getElementById: (id: string) => mockElements[id] || null,
            createRange: () => ({
                selectNodeContents: () => {},
                collapse: () => {}
            }),
            createElement: (tag: string) => new MockDOMElement('', tag),
            createElementNS: () => new MockDOMElement('', 'svg'),
            querySelector: () => null,
            querySelectorAll: () => []
        };
        (globalThis as any).requestAnimationFrame = (fn: Function) => fn();

        initRender(state, {
            handleNodeEdit: () => {}
        });
    });

    it('does not clobber innerText with zero-width space during active IME composition', () => {
        const nodeEl = new MockDOMElement('node-1', '初始文本');
        handleNodeEdit(nodeEl as any);

        expect(nodeEl.contentEditable).toBe('true');
        expect(nodeEl.classList.contains('editing')).toBe(true);

        // 1. IME 开始输入（例如搜狗输入法键入拼音 'ni'）
        nodeEl.dispatchEvent({ type: 'compositionstart' });

        // 2. 模拟输入法在输入拼音阶段清空或输入暂存拼音，触发 input 事件
        nodeEl.innerText = 'n';
        nodeEl.dispatchEvent({ type: 'input' });

        // 处于 composition 期间，handleInput 不应把 innerText 强制改写为 '\u200B'
        expect(nodeEl.innerText).toBe('n');

        // 3. 模拟输入法继续输入拼音 'nihao'
        nodeEl.innerText = 'nihao';
        nodeEl.dispatchEvent({ type: 'input' });
        expect(nodeEl.innerText).toBe('nihao');

        // 4. 输入法选词完成，汉字“你好”上屏
        nodeEl.innerText = '你好';
        nodeEl.dispatchEvent({ type: 'compositionend' });

        // 5. 完成编辑 blur
        nodeEl.blur();

        const node = state.nodes.find(n => n.id === 'node-1');
        expect(node?.text).toBe('你好');
        expect(nodeEl.contentEditable).toBe('false');
        expect(nodeEl.classList.contains('editing')).toBe(false);
    });

    it('does not add has-multiline for single line IME input ending with trailing newline', () => {
        const nodeEl = new MockDOMElement('node-1', '');
        handleNodeEdit(nodeEl as any);

        // 模拟中文输入法上屏，DOM 中尾随自动生成的换行占位符 <br>
        nodeEl.innerText = '搜狗输入法\n';
        nodeEl.dispatchEvent({ type: 'input' });

        // 不应被误判为多行而贴左
        expect(nodeEl.classList.contains('has-multiline')).toBe(false);

        // 完成编辑保存，末尾占位符换行应被剥离，防止污染数据
        nodeEl.blur();
        const node = state.nodes.find(n => n.id === 'node-1');
        expect(node?.text).toBe('搜狗输入法');
    });

    it('correctly marks genuine multiline text with has-multiline', () => {
        const nodeEl = new MockDOMElement('node-1', '');
        handleNodeEdit(nodeEl as any);

        nodeEl.innerText = '第一行\n第二行\n';
        nodeEl.dispatchEvent({ type: 'input' });

        expect(nodeEl.classList.contains('has-multiline')).toBe(true);

        nodeEl.blur();
        const node = state.nodes.find(n => n.id === 'node-1');
        expect(node?.text).toBe('第一行\n第二行');
    });

    it('handleNodeEdit with force=true enters editing mode unconditionally', () => {
        const nodeEl = new MockDOMElement('node-1', '');
        handleNodeEdit(nodeEl as any, true);

        expect(nodeEl.contentEditable).toBe('true');
        expect(nodeEl.classList.contains('editing')).toBe(true);
    });
});
