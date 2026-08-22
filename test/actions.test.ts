// test/actions.test.ts
import { expect, test, describe, beforeEach } from "bun:test";
import { state, history, pushHistory, undo, redo } from "../dango/js/modules/state.js";
import {
    createNodesFromInput,
    deleteSelection,
    colorSelection,
    nudgeSelection,
    toggleGroupSelection
} from "../dango/js/modules/actions.js";
import { createNodeAt } from "../dango/js/modules/interactions.js";
import { initRender, renderNode } from "../dango/js/modules/render.js";

describe("Canvas Actions & History Management", () => {
    beforeEach(() => {
        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set();
        history.undo = [];
        history.redo = [];
        initRender(state, {});
    });

    test("createNodesFromInput: parses comma-separated items", () => {
        createNodesFromInput("Alpha, Beta, Gamma");
        expect(state.nodes.length).toBe(3);
        expect(state.nodes[0].text).toBe("Alpha");
        expect(state.nodes[1].text).toBe("Beta");
        expect(state.nodes[2].text).toBe("Gamma");
    });

    test("createNodesFromInput: parses multiline grid items", () => {
        createNodesFromInput("Row1_A, Row1_B\nRow2_A, Row2_B");
        expect(state.nodes.length).toBe(4);
        expect(state.nodes[0].text).toBe("Row1_A");
        expect(state.nodes[1].text).toBe("Row1_B");
        expect(state.nodes[2].text).toBe("Row2_A");
        expect(state.nodes[3].text).toBe("Row2_B");
    });

    test("createNodesFromInput: preserves commas inside quotes", () => {
        createNodesFromInput('"Hello, World", Plain Item, “Chinese, Quote”');
        expect(state.nodes.length).toBe(3);
        expect(state.nodes[0].text).toBe("Hello, World");
        expect(state.nodes[1].text).toBe("Plain Item");
        expect(state.nodes[2].text).toBe("Chinese, Quote");
    });

    test("deleteSelection: cascades to attached links and cleans up group members", () => {
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 300, y: 100, w: 100, h: 50 };
        const n3 = { id: 'n3', x: 500, y: 100, w: 100, h: 50 };
        state.nodes = [n1, n2, n3];

        state.links = [
            { id: 'l1', sourceId: 'n1', targetId: 'n2', direction: 'none', strokeStyle: 'solid' },
            { id: 'l2', sourceId: 'n2', targetId: 'n3', direction: 'target', strokeStyle: 'solid' }
        ];

        state.groups = [
            { id: 'g1', x: 80, y: 80, w: 500, h: 100, memberIds: ['n1', 'n2', 'n3'] }
        ];

        // Delete n2
        state.selection = new Set(['n2']);
        deleteSelection();

        expect(state.nodes.map(n => n.id)).toEqual(['n1', 'n3']);
        // Both links connected to n2 should be removed
        expect(state.links.length).toBe(0);
        // Group memberIds should no longer contain n2
        expect(state.groups[0].memberIds).toEqual(['n1', 'n3']);
    });

    test("colorSelection: changes color only for selected nodes", () => {
        const n1 = { id: 'n1', color: 'c-white' };
        const n2 = { id: 'n2', color: 'c-white' };
        state.nodes = [n1, n2];
        state.selection = new Set(['n1']);

        colorSelection('c-blue');
        expect(n1.color).toBe('c-blue');
        expect(n2.color).toBe('c-white');
    });

    test("nudgeSelection: shifts positions by 10px according to arrow keys", () => {
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 };
        state.nodes = [n1];
        state.selection = new Set(['n1']);

        nudgeSelection('ArrowRight');
        expect(n1.x).toBe(110);
        expect(n1.y).toBe(100);

        nudgeSelection('ArrowDown');
        expect(n1.x).toBe(110);
        expect(n1.y).toBe(110);

        nudgeSelection('ArrowLeft');
        expect(n1.x).toBe(100);
        expect(n1.y).toBe(110);

        nudgeSelection('ArrowUp');
        expect(n1.x).toBe(100);
        expect(n1.y).toBe(100);
    });

    test("undo / redo stack manages state history snapshots", () => {
        const n1 = { id: 'n1', text: 'Initial', x: 100, y: 100, w: 100, h: 50 };
        state.nodes = [n1];

        // Push snapshot and modify
        pushHistory();
        state.nodes = [{ id: 'n1', text: 'Modified', x: 150, y: 150, w: 100, h: 50 }];

        expect(history.undo.length).toBe(1);

        // Undo
        undo(() => {});
        expect(state.nodes[0].text).toBe('Initial');
        expect(state.nodes[0].x).toBe(100);
        expect(history.redo.length).toBe(1);

        // Redo
        redo(() => {});
        expect(state.nodes[0].text).toBe('Modified');
        expect(state.nodes[0].x).toBe(150);
    });

    test("createNodeAt on empty canvas initializes node with solid default color 'c-white'", () => {
        state.nodes = [];
        const newNode = createNodeAt({ x: 200, y: 300 });
        expect(newNode.color).toBe('c-white');
        expect(typeof newNode.color).toBe('string');
        expect(newNode.color).not.toBe(0);
    });

    test("createNodeAt near colored neighbor inherits neighbor's valid color string", () => {
        state.nodes = [{ id: 'n1', text: 'Parent', x: 200, y: 200, w: 100, h: 50, color: 'c-red' }];
        const newNode = createNodeAt({ x: 250, y: 220 });
        expect(newNode.color).toBe('c-red');
    });

    test("renderNode correctly maps numeric color 0 to 'c-white' avoiding transparent node bug", () => {
        // Minimal DOM mock if in pure node/bun environment
        const classSet = new Set<string>();
        const mockEl = {
            setAttribute: () => {},
            classList: {
                contains: (cls: string) => classSet.has(cls),
                add: (cls: string) => classSet.add(cls),
                remove: (cls: string) => classSet.delete(cls)
            },
            style: {},
            dataset: {},
            className: '',
            querySelector: () => null,
            appendChild: () => {}
        } as any;

        // Legacy node with numeric color 0
        renderNode(mockEl, { id: 'legacy_1', text: 'Legacy Node', x: 0, y: 0, w: 100, h: 40, color: 0 as any });
        expect(mockEl.className).toContain('c-white');
        expect(mockEl.className).not.toContain('c-0');
    });
});
