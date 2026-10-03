// test/directional_edit_activation.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { state } from '../dango/js/modules/state.js';
import { initRender } from '../dango/js/modules/render.js';
import { els } from '../dango/js/modules/dom.js';
import { initInteractions, handleNodeEdit } from '../dango/js/modules/interactions.js';
import { handleDirectionalCreateStart, handleDirectionalCreateEnd, clearDirectionalGhost } from '../dango/js/modules/directional.js';
import type { CanvasNode } from '../dango/js/modules/types.js';

class MockElement {
    tagName: string;
    id: string;
    className: string;
    innerText: string = '';
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    attributes: Record<string, string> = {};
    children: MockElement[] = [];
    parentNode: MockElement | null = null;
    offsetWidth: number = 100;
    offsetHeight: number = 44;
    contentEditable: string = 'false';
    isConnected: boolean = true;
    private _listeners: Record<string, Function[]> = {};

    constructor(id = '', tagName = 'div', className = '') {
        this.id = id;
        this.tagName = tagName.toUpperCase();
        this.className = className;
    }

    setAttribute(k: string, v: string) { this.attributes[k] = v; }
    getAttribute(k: string) { return this.attributes[k] ?? null; }
    removeAttribute(k: string) { delete this.attributes[k]; }

    appendChild(child: MockElement) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    remove() {
        if (this.parentNode) {
            const idx = this.parentNode.children.indexOf(this);
            if (idx !== -1) this.parentNode.children.splice(idx, 1);
            this.parentNode = null;
        }
    }

    closest(selector: string): MockElement | null {
        if (selector === '.node' && (this.className.includes('node') || this.id.startsWith('node'))) return this;
        if (selector === '.group' && this.className.includes('group')) return this;
        if (selector === '#ui-layer' && this.id === 'ui-layer') return this;
        return this.parentNode ? this.parentNode.closest(selector) : null;
    }

    addEventListener(type: string, fn: Function) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(fn);
    }

    removeEventListener(type: string, fn: Function) {
        if (this._listeners[type]) {
            this._listeners[type] = this._listeners[type].filter(f => f !== fn);
        }
    }

    dispatchEvent(event: any): boolean {
        const listeners = this._listeners[event.type] || [];
        listeners.forEach(fn => fn(event));
        return true;
    }

    focus() {}
    blur() {}

    classList = {
        add: (c: string) => {
            const parts = this.className.split(' ').filter(Boolean);
            if (!parts.includes(c)) parts.push(c);
            this.className = parts.join(' ');
        },
        remove: (c: string) => {
            const parts = this.className.split(' ').filter(Boolean);
            this.className = parts.filter(p => p !== c).join(' ');
        },
        contains: (c: string) => this.className.split(' ').filter(Boolean).includes(c)
    };
}

describe('Directional Create & Drag-to-Edit Transition Lifecycle', () => {
    let prevDoc: any;
    let prevWin: any;
    let prevRaf: any;
    let prevCaf: any;
    let prevComputedStyle: any;
    let containerEl: MockElement;
    let nodesLayerEl: MockElement;
    let connectionsLayerEl: MockElement;
    let uiLayerEl: MockElement;

    beforeEach(() => {
        prevDoc = (globalThis as any).document;
        prevWin = (globalThis as any).window;
        prevRaf = (globalThis as any).requestAnimationFrame;
        prevCaf = (globalThis as any).cancelAnimationFrame;
        prevComputedStyle = (globalThis as any).getComputedStyle;

        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set<string>();
        clearDirectionalGhost();

        containerEl = new MockElement('canvas-container', 'div');
        nodesLayerEl = new MockElement('nodes-layer', 'div');
        connectionsLayerEl = new MockElement('connections-layer', 'svg');
        uiLayerEl = new MockElement('ui-layer', 'div');

        const allElements: Record<string, MockElement> = {
            'canvas-container': containerEl,
            'nodes-layer': nodesLayerEl,
            'connections-layer': connectionsLayerEl,
            'ui-layer': uiLayerEl
        };

        (globalThis as any).document = {
            body: new MockElement('body', 'body'),
            getElementById: (id: string) => allElements[id] || null,
            querySelector: (sel: string) => {
                const match = sel.match(/\.node\[data-id="([^"]+)"\]/);
                if (match) {
                    return allElements[match[1]] || null;
                }
                return null;
            },
            querySelectorAll: () => [],
            createElement: (tag: string) => new MockElement('', tag),
            createElementNS: (_ns: string, tag: string) => new MockElement('', tag),
            addEventListener: () => {},
            removeEventListener: () => {}
        };

        (globalThis as any).requestAnimationFrame = (cb: Function) => setTimeout(cb, 0);
        (globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
        const mockComputedStyle = () => ({
            paddingLeft: '12px',
            paddingRight: '12px',
            paddingTop: '8px',
            paddingBottom: '8px',
            borderLeftWidth: '1px',
            borderRightWidth: '1px',
            borderTopWidth: '1px',
            borderBottomWidth: '1px'
        });
        (globalThis as any).getComputedStyle = mockComputedStyle;

        (globalThis as any).window = {
            addEventListener: () => {},
            removeEventListener: () => {},
            innerWidth: 1200,
            innerHeight: 800,
            requestAnimationFrame: (globalThis as any).requestAnimationFrame,
            cancelAnimationFrame: (globalThis as any).cancelAnimationFrame,
            getComputedStyle: mockComputedStyle,
            getSelection: () => ({ removeAllRanges: () => {}, addRange: () => {} })
        };

        initRender(state, {});
        initInteractions();
    });

    afterEach(() => {
        (globalThis as any).document = prevDoc;
        (globalThis as any).window = prevWin;
        (globalThis as any).requestAnimationFrame = prevRaf;
        (globalThis as any).cancelAnimationFrame = prevCaf;
        (globalThis as any).getComputedStyle = prevComputedStyle;
    });

    it('ensures mouseup resets drag motion flag so subsequent Ctrl+Arrow enters edit mode', () => {
        const root: CanvasNode = { id: 'node-root', text: 'Root', x: 200, y: 200, w: 100, h: 44, color: 'c-white' };
        state.nodes = [root];
        state.selection = new Set(['node-root']);

        const rootEl = new MockElement('node-root', 'div', 'node');
        rootEl.dataset.id = 'node-root';
        nodesLayerEl.appendChild(rootEl);
        ((globalThis as any).document as any).getElementById = (id: string) => {
            if (id === 'node-root') return rootEl;
            if (id === 'nodes-layer') return nodesLayerEl;
            if (id === 'connections-layer') return connectionsLayerEl;
            return null;
        };

        // 1. Simulate mouse drag on the root node
        containerEl.dispatchEvent({
            type: 'mousedown',
            button: 0,
            clientX: 200,
            clientY: 200,
            target: rootEl
        });

        // Mouse moved > 3px (triggers hasMovedDuringDrag = true)
        containerEl.dispatchEvent({
            type: 'mousemove',
            clientX: 250,
            clientY: 250
        });

        // User releases mouse
        containerEl.dispatchEvent({
            type: 'mouseup',
            button: 0,
            clientX: 250,
            clientY: 250
        });

        // 2. User immediately presses Ctrl+ArrowRight to create a branch
        handleDirectionalCreateStart('ArrowRight');

        let createdNodeEl: MockElement | null = null;
        const callbacks = {
            render: () => {},
            handleNodeEdit: (el: any, force?: boolean) => {
                handleNodeEdit(el, force);
            }
        };

        (globalThis as any).document.querySelector = (sel: string) => {
            const match = sel.match(/\.node\[data-id="([^"]+)"\]/);
            if (match) {
                const targetNode = state.nodes.find(n => n.id === match[1]);
                if (targetNode) {
                    if (!createdNodeEl) {
                        createdNodeEl = new MockElement(targetNode.id, 'div', 'node');
                        createdNodeEl.dataset.id = targetNode.id;
                    }
                    return createdNodeEl;
                }
            }
            return null;
        };

        // Release keys
        handleDirectionalCreateEnd('ArrowRight', callbacks, 'arrow');
        handleDirectionalCreateEnd('ArrowRight', callbacks, 'modifier');

        // Verify the newly created node successfully entered editing mode!
        expect(createdNodeEl).not.toBeNull();
        expect(createdNodeEl!.classList.contains('editing')).toBe(true);
        expect(createdNodeEl!.contentEditable).toBe('true');
    });
});
