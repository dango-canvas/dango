// test/transformed_node_geometry.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { state } from '../dango/js/modules/state.js';
import { initRender, render } from '../dango/js/modules/render.js';
import { alignSelection } from '../dango/js/modules/actions.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Mock minimal DOM environment for render tests
class MockElement {
    tagName: string;
    id: string;
    className: string;
    innerHTML: string;
    innerText: string;
    textContent: string;
    style: Record<string, string>;
    dataset: Record<string, string>;
    children: MockElement[] = [];
    parentNode: MockElement | null = null;
    attributes: Record<string, string> = {};
    _offsetWidth: number = 0;
    _offsetHeight: number = 0;

    constructor(id: string = '', tagName: string = 'div') {
        this.id = id;
        this.tagName = tagName.toUpperCase();
        this.className = '';
        this.innerHTML = '';
        this.innerText = '';
        this.textContent = '';
        this.style = {};
        this.dataset = {};
    }

    get offsetWidth(): number {
        return this._offsetWidth;
    }
    set offsetWidth(val: number) {
        this._offsetWidth = val;
    }
    get offsetHeight(): number {
        return this._offsetHeight;
    }
    set offsetHeight(val: number) {
        this._offsetHeight = val;
    }

    classList = {
        contains: (c: string) => this.className.split(/\s+/).includes(c),
        add: (c: string) => {
            const set = new Set(this.className.split(/\s+/).filter(Boolean));
            set.add(c);
            this.className = Array.from(set).join(' ');
        },
        remove: (c: string) => {
            const set = new Set(this.className.split(/\s+/).filter(Boolean));
            set.delete(c);
            this.className = Array.from(set).join(' ');
        },
        toggle: (c: string, force?: boolean) => {
            const has = this.classList.contains(c);
            const add = force !== undefined ? force : !has;
            if (add) this.classList.add(c); else this.classList.remove(c);
            return add;
        }
    };

    setAttribute(name: string, value: string) {
        this.attributes[name] = value;
    }
    getAttribute(name: string) {
        return this.attributes[name] || null;
    }
    removeAttribute(name: string) {
        delete this.attributes[name];
    }

    appendChild(child: MockElement) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    querySelector(selector: string): any {
        if (selector === '.node-text') return this.children.find(c => c.className.includes('node-text')) || null;
        if (selector === '.link-btn') return this.children.find(c => c.className.includes('link-btn')) || null;
        if (selector === '.node-image') return this.children.find(c => c.className.includes('node-image')) || null;
        if (selector === '.image-size-btn') return this.children.find(c => c.className.includes('image-size-btn')) || null;
        return null;
    }

    remove() {
        if (this.parentNode) {
            this.parentNode.children = this.parentNode.children.filter(c => c !== this);
            this.parentNode = null;
        }
    }
}

describe('Transformed Node Geometry & Alignment Fidelity', () => {
    beforeEach(() => {
        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set();
    });

    it('CSS: .node.editing.has-multiline uses white-space: pre to prevent soft-wrap squish', () => {
        const cssContent = readFileSync(resolve(__dirname, '../dango/css/partials/_canvas.css'), 'utf-8');
        expect(cssContent).toMatch(/\.node\.editing\.has-multiline\s*\{[^}]*white-space:\s*pre;/);
        expect(cssContent).not.toMatch(/\.node\.editing\.has-multiline\s*\{[^}]*white-space:\s*pre-wrap;/);
    });

    it('CSS: .node.image-node specifies box-sizing: border-box for pixel-perfect bounding box', () => {
        const cssContent = readFileSync(resolve(__dirname, '../dango/css/partials/_canvas.css'), 'utf-8');
        expect(cssContent).toMatch(/\.node\.image-node\s*\{[^}]*box-sizing:\s*border-box;/);
    });

    it('Link Node: updates node.w and node.h to capsule offset dimensions rather than raw text length', () => {
        const nodesLayer = new MockElement('nodes-layer');
        const groupsLayer = new MockElement('groups-layer');
        const connectionsLayer = new MockElement('connections-layer', 'svg');
        const mockBody = new MockElement('body', 'body');
        (globalThis as any).document = {
            body: mockBody,
            createElement: (tag: string) => new MockElement('', tag),
            createElementNS: (_ns: string, tag: string) => new MockElement('', tag),
            getElementById: (id: string) => {
                if (id === 'nodes-layer') return nodesLayer;
                if (id === 'groups-layer') return groupsLayer;
                if (id === 'connections-layer') return connectionsLayer;
                return null;
            },
            querySelector: (sel: string) => null,
            querySelectorAll: () => []
        };
        (globalThis as any).window = {};

        initRender(state, {});

        // A node with a very long URL text
        const longUrl = 'https://example.com/very/long/nested/path/to/resource?query=1&token=abcdef1234567890';
        const node: any = {
            id: 'link1',
            x: 100,
            y: 100,
            w: 350, // Stale pre-transform text editing box width
            h: 44,  // Stale pre-transform text editing box height
            text: longUrl,
            color: 'c-white'
        };
        state.nodes = [node];

        // Simulate DOM element created for this node with capsule offset dimensions (e.g. 240 x 32)
        const nodeEl = new MockElement('link1');
        nodeEl.dataset.id = 'link1';
        nodeEl.offsetWidth = 240;
        nodeEl.offsetHeight = 32;
        nodesLayer.children.push(nodeEl);

        render();

        // node.w and node.h must have synced to the capsule offset dimensions (240 x 32), not 350 x 44!
        expect(node.w).toBe(240);
        expect(node.h).toBe(32);

        delete (globalThis as any).document;
        delete (globalThis as any).window;
    });

    it('Alignment: Aligning link node with normal node uses capsule center instead of pre-transform center', () => {
        // Link node (capsule 240 x 32) at x=0
        // Normal node (100 x 40) at x=300
        // Expected bounding box X: minX = 0, maxX = 300 + 100 = 400
        // Center X = 200
        // Target Link Node x = 200 - 240/2 = 80
        // Target Normal Node x = 200 - 100/2 = 150
        const linkNode: any = {
            id: 'n_link',
            x: 0,
            y: 100,
            w: 240, // Correctly updated capsule width
            h: 32,
            text: 'https://example.com',
            color: 'c-white'
        };
        const normalNode: any = {
            id: 'n_norm',
            x: 300,
            y: 100,
            w: 100,
            h: 40,
            text: 'Normal Node',
            color: 'c-white'
        };
        state.nodes = [linkNode, normalNode];
        state.selection = new Set(['n_link', 'n_norm']);

        alignSelection('centerX');

        expect(linkNode.x).toBe(80);
        expect(normalNode.x).toBe(150);
        // Centers match exactly: 80 + 120 = 200, 150 + 50 = 200
        expect(linkNode.x + linkNode.w / 2).toBe(200);
        expect(normalNode.x + normalNode.w / 2).toBe(200);
    });

    it('Persistence: pushHistory, undo, and redo automatically serialize state to localStorage', () => {
        const mockStorage: Record<string, string> = {};
        (globalThis as any).localStorage = {
            getItem: (k: string) => mockStorage[k] || null,
            setItem: (k: string, v: string) => { mockStorage[k] = v; },
            removeItem: (k: string) => { delete mockStorage[k]; },
            clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
        };

        const { history, pushHistory, undo, redo, saveData } = require('../dango/js/modules/state.js');
        history.undo = [];
        history.redo = [];

        state.nodes = [{ id: 'n_persisted', text: 'Persistent Node', x: 10, y: 20, w: 100, h: 40, color: 'c-white' }];
        pushHistory();

        const saved = JSON.parse(mockStorage['cc-canvas-data'] || '{}');
        expect(saved.nodes?.length).toBe(1);
        expect(saved.nodes[0].text).toBe('Persistent Node');

        // Delete node: pushHistory saves the current state before deletion, then nodes are emptied
        pushHistory();
        state.nodes = [];
        saveData();
        expect(JSON.parse(mockStorage['cc-canvas-data']).nodes.length).toBe(0);

        undo(() => {});
        expect(JSON.parse(mockStorage['cc-canvas-data']).nodes.length).toBe(1);
        expect(JSON.parse(mockStorage['cc-canvas-data']).nodes[0].text).toBe('Persistent Node');

        redo(() => {});
        expect(JSON.parse(mockStorage['cc-canvas-data']).nodes.length).toBe(0);

        delete (globalThis as any).localStorage;
    });

    it('CSS: .node uses line-height 1.44 (1.2x of baseline 1.2)', () => {
        const cssContent = readFileSync(resolve(__dirname, '../dango/css/partials/_canvas.css'), 'utf-8');
        expect(cssContent).toMatch(/\.node\s*\{[^}]*line-height:\s*1\.44;/);
        expect(cssContent).toMatch(/\.node\s+\.todo-item\s*\{[^}]*line-height:\s*1\.44;/);
    });

    it('Markdown: parseMarkdown preserves multiline breaks including trailing newline from Shift+Enter', () => {
        const { parseMarkdown } = require('../dango/js/modules/render.js');
        // Standard two lines
        const htmlTwo = parseMarkdown('第一行\n第二行');
        expect(htmlTwo).toBe('第一行<br>第二行');

        // Explicit Shift+Enter ending with blank line
        const htmlTrailing = parseMarkdown('第一行\n');
        expect(htmlTrailing).toBe('第一行<br><br>');
    });
});
