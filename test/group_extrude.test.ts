// test/group_extrude.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { state } from '../dango/js/modules/state.js';
import {
    handleDirectionalCreateStart,
    handleDirectionalCreateEnd,
    clearDirectionalGhost,
    realignDirectionalNodeAfterEdit
} from '../dango/js/modules/directional.js';
import { initFloatingDock } from '../dango/js/modules/dock.js';

class MockElement {
    tagName: string;
    id: string;
    className: string;
    innerHTML: string = '';
    style: Record<string, string>;
    attributes: Record<string, string>;
    children: MockElement[] = [];
    parentNode: MockElement | null = null;
    offsetWidth: number = 102;
    offsetHeight: number = 44;

    constructor(id: string = '', tagName: string = 'div') {
        this.id = id;
        this.tagName = tagName.toUpperCase();
        this.className = '';
        this.style = {};
        this.attributes = {};
    }

    setAttribute(k: string, v: string) {
        this.attributes[k] = v;
    }

    getAttribute(k: string) {
        return this.attributes[k];
    }

    removeAttribute(k: string) {
        delete this.attributes[k];
    }

    appendChild(child: MockElement) {
        this.children.push(child);
        child.parentNode = this;
        return child;
    }

    removeChild(child: MockElement) {
        this.children = this.children.filter(c => c !== child);
        child.parentNode = null;
        return child;
    }

    remove() {
        if (this.parentNode) {
            this.parentNode.removeChild(this);
        }
    }

    private _listeners: Record<string, Function[]> = {};

    addEventListener(type: string, fn: Function) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(fn);
    }

    removeEventListener(type: string, fn: Function) {
        if (this._listeners[type]) {
            this._listeners[type] = this._listeners[type].filter(f => f !== fn);
        }
    }

    dispatchEvent(event: any) {
        const listeners = (this._listeners[event.type] || []).slice();
        listeners.forEach(fn => fn(event));
    }

    classList = {
        add: (c: string) => { this.className += ` ${c}`; },
        remove: (c: string) => { this.className = this.className.replace(c, '').trim(); },
        contains: (c: string) => this.className.includes(c)
    };
}

describe('Group Node Extrude & Directional Creation', () => {
    let mockElements: Record<string, MockElement>;
    let windowListeners: Record<string, Function[]>;

    beforeEach(() => {
        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set();
        state.settings.showToolbar = true;
        clearDirectionalGhost();

        windowListeners = {};
        (globalThis as any).window = {
            addEventListener: (type: string, fn: Function) => {
                if (!windowListeners[type]) windowListeners[type] = [];
                windowListeners[type].push(fn);
            },
            removeEventListener: (type: string, fn: Function) => {
                if (windowListeners[type]) {
                    windowListeners[type] = windowListeners[type].filter(f => f !== fn);
                }
            },
            dispatchEvent: (event: any) => {
                const listeners = (windowListeners[event.type] || []).slice();
                listeners.forEach(fn => fn(event));
            }
        };

        mockElements = {
            'dango-dock-container': new MockElement('dango-dock-container'),
            'dango-dock': new MockElement('dango-dock'),
            'btn-dock-extrude': new MockElement('btn-dock-extrude'),
            'nodes-layer': new MockElement('nodes-layer'),
            'connections-layer': new MockElement('connections-layer'),
            'single-color-dot': new MockElement('single-color-dot'),
            'check-hide-toolbar': new MockElement('check-hide-toolbar')
        };

        const mockBody = new MockElement('body', 'body');
        (globalThis as any).document = {
            body: mockBody,
            getElementById: (id: string) => mockElements[id] || null,
            createElement: (tag: string) => new MockElement('', tag),
            createElementNS: (_ns: string, tag: string) => new MockElement('', tag),
            querySelector: () => null,
            querySelectorAll: () => []
        };
    });

    it('handleDirectionalCreateStart & End: creates new external node linked from Group', () => {
        const m1 = { id: 'm1', x: 100, y: 100, w: 100, h: 50 };
        const g1 = { id: 'g1', x: 80, y: 80, w: 200, h: 140, memberIds: ['m1'], isGroup: true, color: 'c-blue' };
        state.nodes = [m1];
        state.groups = [g1];
        state.selection = new Set(['g1']);

        // Start directional create to the right (ArrowRight)
        const started = handleDirectionalCreateStart('ArrowRight');
        expect(started).toBe(true);

        let rendered = false;
        const callbacks = {
            render: () => { rendered = true; },
            handleNodeEdit: () => {}
        };

        // Key up modifier and arrow
        handleDirectionalCreateEnd('ArrowRight', callbacks, 'arrow');
        handleDirectionalCreateEnd('ArrowRight', callbacks, 'modifier');

        // New node created
        expect(state.nodes.length).toBe(2);
        const newNode = state.nodes.find(n => n.id !== 'm1');
        expect(newNode).toBeDefined();

        // New node coordinates: x = g1.x + g1.w + 48 = 80 + 200 + 48 = 328
        // y: centered along g1's height -> g1.y + (140 - 44)/2 = 80 + 48 = 128
        expect(newNode!.x).toBe(328);
        expect(newNode!.y).toBe(128);

        // Inherits group color
        expect(newNode!.color).toBe('c-blue');

        // New node is NOT added to group.memberIds (prevents parent-child loop)
        expect(g1.memberIds).toEqual(['m1']);
        expect(g1.memberIds.includes(newNode!.id)).toBe(false);

        // Created link from Group -> newNode
        expect(state.links.length).toBe(1);
        expect(state.links[0].sourceId).toBe('g1');
        expect(state.links[0].targetId).toBe(newNode!.id);
        expect(state.links[0].direction).toBe('target');

        // Selection switches to new node
        expect(state.selection.has(newNode!.id)).toBe(true);
        expect(state.selection.has('g1')).toBe(false);
    });

    it('realignDirectionalNodeAfterEdit: anchors correctly to Group source', () => {
        const m1 = { id: 'm1', x: 100, y: 100, w: 100, h: 50 };
        const g1 = { id: 'g1', x: 80, y: 80, w: 200, h: 140, memberIds: ['m1'], isGroup: true };
        state.nodes = [m1];
        state.groups = [g1];
        state.selection = new Set(['g1']);

        handleDirectionalCreateStart('ArrowDown');
        handleDirectionalCreateEnd('ArrowDown', { render: () => {} }, 'arrow');
        handleDirectionalCreateEnd('ArrowDown', { render: () => {} }, 'modifier');

        const newNode = state.nodes.find(n => n.id !== 'm1')!;
        // Simulate text expansion in node: w = 150, h = 60
        newNode.w = 150;
        newNode.h = 60;

        const moved = realignDirectionalNodeAfterEdit(newNode);
        expect(moved).toBe(true);
        // Down position: x centered relative to g1: g1.x + (200 - 150)/2 = 80 + 25 = 105
        // y: g1.y + g1.h + 48 = 80 + 140 + 48 = 268
        expect(newNode.x).toBe(105);
        expect(newNode.y).toBe(268);
    });

    it('Dock extrude: short-point click on Group creates external node with vertical center alignment', () => {
        const m1 = { id: 'm1', x: 100, y: 100, w: 100, h: 50 };
        const g1 = { id: 'g1', x: 80, y: 80, w: 240, h: 160, memberIds: ['m1'], isGroup: true, color: 'c-red' };
        state.nodes = [m1];
        state.groups = [g1];
        state.selection = new Set(['g1']);

        let renderCalled = false;
        initFloatingDock({
            render: () => { renderCalled = true; },
            undo: () => {},
            redo: () => {},
            handleNodeEdit: () => {}
        });

        const extrudeBtn = mockElements['btn-dock-extrude'];
        expect(extrudeBtn).toBeDefined();

        // Simulate mousedown
        extrudeBtn.dispatchEvent({
            type: 'mousedown',
            button: 0,
            clientX: 100,
            clientY: 100,
            stopPropagation: () => {}
        });

        // Simulate mouseup without moving > 10px (click / short-point)
        (globalThis as any).window.dispatchEvent({
            type: 'mouseup',
            clientX: 102,
            clientY: 101
        });

        expect(renderCalled).toBe(true);
        expect(state.nodes.length).toBe(2);
        const newNode = state.nodes.find(n => n.id !== 'm1');
        expect(newNode).toBeDefined();

        // Check geometry: x = g1.x + g1.w + 48 = 80 + 240 + 48 = 368
        // y = g1.y + (g1.h - 44)/2 = 80 + (160 - 44)/2 = 80 + 58 = 138
        expect(newNode!.x).toBe(368);
        expect(newNode!.y).toBe(138);
        expect(newNode!.color).toBe('c-red');

        // Verify Anti-Cycle Guard: newNode is NOT added to g1.memberIds
        expect(g1.memberIds).toEqual(['m1']);
        expect(g1.memberIds.includes(newNode!.id)).toBe(false);

        // Verify link from g1 -> newNode
        expect(state.links.length).toBe(1);
        expect(state.links[0].sourceId).toBe('g1');
        expect(state.links[0].targetId).toBe(newNode!.id);
        expect(state.links[0].direction).toBe('target');

        // Selection switches to new node
        expect(state.selection.has(newNode!.id)).toBe(true);
        expect(state.selection.has('g1')).toBe(false);
    });

    it('Dock extrude: drag-to-extrude from Group creates external node at drop coordinates', () => {
        const m1 = { id: 'm1', x: 100, y: 100, w: 100, h: 50 };
        const g1 = { id: 'g1', x: 80, y: 80, w: 200, h: 100, memberIds: ['m1'], isGroup: true };
        state.nodes = [m1];
        state.groups = [g1];
        state.selection = new Set(['g1']);
        state.view = { x: 0, y: 0, scale: 1 };

        initFloatingDock({
            render: () => {},
            undo: () => {},
            redo: () => {},
            handleNodeEdit: () => {}
        });

        const extrudeBtn = mockElements['btn-dock-extrude'];

        // Start drag at (100, 100)
        extrudeBtn.dispatchEvent({
            type: 'mousedown',
            button: 0,
            clientX: 100,
            clientY: 100,
            stopPropagation: () => {}
        });

        // Drag to (500, 300) (> 10px screen movement)
        (globalThis as any).window.dispatchEvent({
            type: 'mousemove',
            clientX: 500,
            clientY: 300
        });

        // Drop at (500, 300)
        (globalThis as any).window.dispatchEvent({
            type: 'mouseup',
            clientX: 500,
            clientY: 300
        });

        expect(state.nodes.length).toBe(2);
        const newNode = state.nodes.find(n => n.id !== 'm1')!;
        expect(newNode).toBeDefined();

        // Dropped at world coordinates - half dimensions:
        // x = 500 - 51 = 449, y = 300 - 22 = 278
        expect(newNode.x).toBe(449);
        expect(newNode.y).toBe(278);

        // Verify Anti-Cycle Guard: newNode is NOT added to g1.memberIds
        expect(g1.memberIds).toEqual(['m1']);
        expect(g1.memberIds.includes(newNode.id)).toBe(false);

        // Verify link from g1 -> newNode
        expect(state.links.length).toBe(1);
        expect(state.links[0].sourceId).toBe('g1');
        expect(state.links[0].targetId).toBe(newNode.id);
    });
});

