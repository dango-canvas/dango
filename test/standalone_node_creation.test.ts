// test/standalone_node_creation.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { state, history } from '../dango/js/modules/state.js';
import { createStandaloneNode, createNodeAt } from '../dango/js/modules/actions.js';
import { initShortcuts, keys } from '../dango/js/modules/shortcuts.js';
import type { CanvasNode } from '../dango/js/modules/types.js';

describe('Standalone Node Creation Specification (Enter on Empty Selection)', () => {
    let prevDoc: any;
    let prevWin: any;
    let keydownHandler: ((e: any) => void) | null = null;
    let editedElement: HTMLElement | null = null;
    let forcedEdit: boolean | undefined = undefined;
    let renderCalled = false;

    beforeEach(() => {
        prevDoc = (globalThis as any).document;
        prevWin = (globalThis as any).window;

        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set<string>();
        state.view = { x: 500, y: 300, scale: 1.0 };
        state.isReadonly = false;
        history.length = 0;
        editedElement = null;
        forcedEdit = undefined;
        renderCalled = false;

        Object.keys(keys).forEach(k => delete keys[k]);

        const elementMap = new Map<string, any>();

        (globalThis as any).document = {
            body: {
                classList: {
                    add: () => {},
                    remove: () => {},
                    contains: () => false
                }
            },
            getElementById: (id: string) => null,
            querySelector: (selector: string) => {
                const match = selector.match(/\.node\[data-id="([^"]+)"\]/);
                if (match) {
                    const id = match[1];
                    if (!elementMap.has(id)) {
                        elementMap.set(id, {
                            getAttribute: (attr: string) => (attr === 'data-id' ? id : null),
                            classList: {
                                contains: () => false,
                                add: () => {},
                                remove: () => {}
                            },
                            focus: () => {}
                        });
                    }
                    return elementMap.get(id);
                }
                return null;
            },
            querySelectorAll: () => []
        };

        (globalThis as any).window = {
            innerWidth: 1000,
            innerHeight: 800,
            addEventListener: (type: string, fn: any) => {
                if (type === 'keydown') keydownHandler = fn;
            },
            removeEventListener: () => {}
        };

        initShortcuts({
            render: () => { renderCalled = true; },
            undo: () => {},
            redo: () => {},
            handleNodeEdit: (el: HTMLElement, force?: boolean) => {
                editedElement = el;
                forcedEdit = force;
            },
            exportJson: () => {}
        });
    });

    afterEach(() => {
        (globalThis as any).document = prevDoc;
        (globalThis as any).window = prevWin;
        state.isReadonly = false;
    });

    it('creates standalone node at viewport center when canvas has default view', () => {
        // window: 1000x800 -> center (500, 400)
        // state.view: x=500, y=300, scale=1.0
        // worldPos: ((500 - 500)/1, (400 - 300)/1) = (0, 100)
        // node centered: x = 0 - 60 = -60, y = 100 - 22 = 78
        const node = createStandaloneNode();

        expect(node).toBeDefined();
        expect(node.w).toBe(120);
        expect(node.h).toBe(44);
        expect(node.x).toBe(-60);
        expect(node.y).toBe(78);
        expect(node.text).toBe('');
        expect(node.color).toBe('c-white');

        // Added to nodes and selected
        expect(state.nodes.length).toBe(1);
        expect(state.selection.has(node.id)).toBe(true);
        expect(state.selection.size).toBe(1);
    });

    it('cascades downward to avoid stacking if center position is already occupied', () => {
        // Create first node at center
        const first = createStandaloneNode();
        expect(first.y).toBe(78);

        // Create second node at center: should avoid first and step down by (44 + 20 = 64px)
        const second = createStandaloneNode();
        expect(second.x).toBe(-60);
        expect(second.y).toBe(78 + 64);

        // Create third node at center: should cascade down further
        const third = createStandaloneNode();
        expect(third.x).toBe(-60);
        expect(third.y).toBe(78 + 64 + 64);

        expect(state.nodes.length).toBe(3);
        expect(state.selection.size).toBe(1);
        expect(state.selection.has(third.id)).toBe(true);
    });

    it('inherits color from nearest node within 300px threshold', () => {
        // Place a node with color 'c-blue' near the center
        state.nodes.push({
            id: 'blue-parent',
            text: 'Blue Topic',
            x: 0,
            y: 120,
            w: 120,
            h: 44,
            color: 'c-blue'
        });

        const newNode = createStandaloneNode();
        expect(newNode.color).toBe('c-blue');
    });

    it('creates standalone node and activates forced editing upon pressing Enter with empty selection', () => {
        expect(state.selection.size).toBe(0);

        let defaultPrevented = false;
        keydownHandler!({
            code: 'Enter',
            key: 'Enter',
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: () => { defaultPrevented = true; }
        });

        expect(defaultPrevented).toBe(true);
        expect(renderCalled).toBe(true);
        expect(state.nodes.length).toBe(1);
        expect(editedElement).not.toBeNull();
        expect(forcedEdit).toBe(true);
    });

    it('enters edit mode on existing node rather than creating new node when selection size is 1', () => {
        const existingNode: CanvasNode = {
            id: 'node-existing',
            text: 'Hello',
            x: 100,
            y: 100,
            w: 120,
            h: 44,
            color: 'c-white'
        };
        state.nodes.push(existingNode);
        state.selection.add(existingNode.id);

        let defaultPrevented = false;
        keydownHandler!({
            code: 'Enter',
            key: 'Enter',
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: () => { defaultPrevented = true; }
        });

        expect(defaultPrevented).toBe(true);
        expect(state.nodes.length).toBe(1); // No new node created
        expect(editedElement).not.toBeNull();
        expect(editedElement!.getAttribute('data-id')).toBe('node-existing');
        expect(forcedEdit).toBe(true);
    });

    it('does not create standalone node when state.isReadonly is true', () => {
        state.isReadonly = true;
        expect(state.selection.size).toBe(0);

        let defaultPrevented = false;
        keydownHandler!({
            code: 'Enter',
            key: 'Enter',
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: () => { defaultPrevented = true; }
        });

        expect(defaultPrevented).toBe(false);
        expect(state.nodes.length).toBe(0);
        expect(editedElement).toBeNull();
    });

    it('does not create standalone node when modifiers (Shift, Ctrl, Alt) are active', () => {
        expect(state.selection.size).toBe(0);

        // Shift + Enter
        keydownHandler!({
            code: 'Enter',
            key: 'Enter',
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: true,
            preventDefault: () => {}
        });
        expect(state.nodes.length).toBe(0);

        // Ctrl + Enter
        keydownHandler!({
            code: 'Enter',
            key: 'Enter',
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: () => {}
        });
        expect(state.nodes.length).toBe(0);
    });
});
