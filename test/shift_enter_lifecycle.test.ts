import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
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

describe('Shift+Enter Multiline & Enter-Enter No-Op Invariance', () => {
    let prevRaf: any;
    beforeEach(() => {
        state.nodes = [
            { id: 'node-test', text: '', x: 0, y: 0, w: 100, h: 40, color: 'c-white' }
        ];
        state.selection = new Set(['node-test']);

        const mockElements: Record<string, any> = {
            'connections-layer': new MockDOMElement('connections-layer'),
            'nodes-layer': new MockDOMElement('nodes-layer'),
            'groups-layer': new MockDOMElement('groups-layer'),
            'snap-guides-layer': new MockDOMElement('snap-guides-layer'),
            'container': new MockDOMElement('container'),
            'ui-layer': new MockDOMElement('ui-layer')
        };

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
        prevRaf = (globalThis as any).requestAnimationFrame;
        (globalThis as any).requestAnimationFrame = (fn: Function) => fn();

        initRender(state, {
            handleNodeEdit: () => {}
        });
    });

    afterEach(() => {
        (globalThis as any).requestAnimationFrame = prevRaf;
    });

    it('Scenario 1: typing -1\\n-2\\n-3\\n-4\\n ending with Shift+Enter preserves exactly 1 trailing newline', () => {
        const nodeEl = new MockDOMElement('node-test', '');
        handleNodeEdit(nodeEl as any);

        // In Blink/Gecko/WebKit, 4 lines ending with Shift+Enter yields a caret placeholder newline:
        nodeEl.innerText = '-1\n-2\n-3\n-4\n\n';
        nodeEl.dispatchEvent({ type: 'input' });

        nodeEl.blur();

        const node = state.nodes.find(n => n.id === 'node-test');
        // Must strip the extra caret placeholder, preserving exactly one trailing newline:
        expect(node?.text).toBe('-1\n-2\n-3\n-4\n');
        expect(nodeEl.classList.contains('editing')).toBe(false);
    });

    it('Scenario 2: Enter-Enter (open and immediately blur without modification) preserves text invariant', () => {
        const initialText = '-1\n-2\n-3\n-4\n';
        const node = state.nodes.find(n => n.id === 'node-test')!;
        node.text = initialText;

        const nodeEl = new MockDOMElement('node-test', initialText);

        // Perform 5 consecutive edit-and-immediately-exit cycles (e.g. user pressing Enter then Enter)
        for (let cycle = 1; cycle <= 5; cycle++) {
            handleNodeEdit(nodeEl as any);
            expect(nodeEl.contentEditable).toBe('true');
            expect(nodeEl.classList.contains('editing')).toBe(true);

            // User did NOT type or dispatch input, simply blurred / pressed Enter
            nodeEl.blur();

            expect(nodeEl.contentEditable).toBe('false');
            expect(nodeEl.classList.contains('editing')).toBe(false);
            expect(node.text).toBe(initialText); // Invariant must hold across all cycles!
        }
    });

    it('Scenario 3: user edits text after entering, changes are correctly updated and trailing caret stripped', () => {
        const node = state.nodes.find(n => n.id === 'node-test')!;
        node.text = '-1\n-2';

        const nodeEl = new MockDOMElement('node-test', node.text);
        handleNodeEdit(nodeEl as any);

        // User typed -3 and pressed Shift+Enter
        nodeEl.innerText = '-1\n-2\n-3\n\n';
        nodeEl.dispatchEvent({ type: 'input' });
        nodeEl.blur();

        expect(node.text).toBe('-1\n-2\n-3\n');
    });

    it('Scenario 4: user deletes trailing newline via Backspace', () => {
        const node = state.nodes.find(n => n.id === 'node-test')!;
        node.text = 'line1\n';

        const nodeEl = new MockDOMElement('node-test', node.text);
        handleNodeEdit(nodeEl as any);

        // User pressed backspace, eliminating the trailing newline
        nodeEl.innerText = 'line1';
        nodeEl.dispatchEvent({ type: 'input' });
        nodeEl.blur();

        expect(node.text).toBe('line1');
    });
});
