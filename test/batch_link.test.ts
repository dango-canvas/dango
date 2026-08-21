// test/batch_link.test.ts
import { expect, test, describe, beforeEach } from "bun:test";
import { state } from "../dango/js/modules/state.js";
import { toggleLink, toggleLinkStrokeStyle, resolveLinkingPairs } from "../dango/js/modules/actions.js";

describe("Batch Link & Star Topology (Ctrl+L)", () => {
    beforeEach(() => {
        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set();
        state.selectionSource = 'click';
    });

    test("Two-node 4-state cycle: Target -> None -> Source -> Delete", () => {
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 300, y: 100, w: 100, h: 50 };
        state.nodes = [n1, n2];
        state.selection = new Set(['n1', 'n2']);

        // 1. None -> Target (n1 -> n2)
        toggleLink();
        expect(state.links.length).toBe(1);
        expect(state.links[0].sourceId).toBe('n1');
        expect(state.links[0].targetId).toBe('n2');
        expect(state.links[0].direction).toBe('target');

        // 2. Target -> None (n1 - n2)
        toggleLink();
        expect(state.links.length).toBe(1);
        expect(state.links[0].direction).toBe('none');

        // 3. None -> Source (n1 <- n2)
        toggleLink();
        expect(state.links.length).toBe(1);
        expect(state.links[0].direction).toBe('source');

        // 4. Source -> Delete
        toggleLink();
        expect(state.links.length).toBe(0);

        // 5. Next call -> Target again
        toggleLink();
        expect(state.links.length).toBe(1);
        expect(state.links[0].direction).toBe('target');
    });

    test("Multi-node sequential click: strict chronological order [n3, n1, n2]", () => {
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 300, y: 50, w: 100, h: 50 };
        const n3 = { id: 'n3', x: 300, y: 150, w: 100, h: 50 };
        state.nodes = [n1, n2, n3];
        // User clicked n3, then n1, then n2
        state.selection = new Set(['n3', 'n1', 'n2']);
        state.selectionSource = 'click';

        const pairs = resolveLinkingPairs([n3, n1, n2], 'click');
        expect(pairs).toEqual([
            { sourceId: 'n3', targetId: 'n1' },
            { sourceId: 'n1', targetId: 'n2' }
        ]);

        toggleLink();
        expect(state.links.length).toBe(2);
        expect(state.links.find(l => l.sourceId === 'n3' && l.targetId === 'n1')?.direction).toBe('target');
        expect(state.links.find(l => l.sourceId === 'n1' && l.targetId === 'n2')?.direction).toBe('target');
    });

    test("Multi-node box select: Star topology (Left 1 Right 2)", () => {
        const root = { id: 'root', x: 100, y: 100, w: 100, h: 50 }; // cx=150, cy=125
        const child1 = { id: 'c1', x: 350, y: 50, w: 100, h: 50 };  // cx=400, cy=75
        const child2 = { id: 'c2', x: 350, y: 150, w: 100, h: 50 }; // cx=400, cy=175
        state.nodes = [child1, root, child2]; // unordered
        state.selection = new Set(['c1', 'root', 'c2']);
        state.selectionSource = 'box';

        const pairs = resolveLinkingPairs(state.nodes, 'box');
        expect(pairs).toEqual([
            { sourceId: 'root', targetId: 'c1' },
            { sourceId: 'root', targetId: 'c2' }
        ]);

        // 1st press -> Target
        toggleLink();
        expect(state.links.length).toBe(2);
        expect(state.links.every(l => l.sourceId === 'root' && l.direction === 'target')).toBe(true);

        // 2nd press -> None
        toggleLink();
        expect(state.links.length).toBe(2);
        expect(state.links.every(l => l.direction === 'none')).toBe(true);

        // 3rd press -> Clear
        toggleLink();
        expect(state.links.length).toBe(0);
    });

    test("Multi-node box select: Star topology (Top 1 Bottom 2)", () => {
        const root = { id: 'root', x: 200, y: 50, w: 100, h: 50 };   // cx=250, cy=75
        const child1 = { id: 'c1', x: 100, y: 250, w: 100, h: 50 }; // cx=150, cy=275
        const child2 = { id: 'c2', x: 300, y: 250, w: 100, h: 50 }; // cx=350, cy=275
        state.nodes = [child2, root, child1];
        state.selection = new Set(['c2', 'root', 'c1']);
        state.selectionSource = 'box';

        const pairs = resolveLinkingPairs(state.nodes, 'box');
        expect(pairs).toEqual([
            { sourceId: 'root', targetId: 'c1' },
            { sourceId: 'root', targetId: 'c2' }
        ]);
    });

    test("Multi-node box select: Horizontal linear chain", () => {
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 250, y: 110, w: 100, h: 50 };
        const n3 = { id: 'n3', x: 400, y: 95, w: 100, h: 50 };
        state.nodes = [n3, n1, n2];
        state.selection = new Set(['n3', 'n1', 'n2']);
        state.selectionSource = 'box';

        const pairs = resolveLinkingPairs(state.nodes, 'box');
        expect(pairs).toEqual([
            { sourceId: 'n1', targetId: 'n2' },
            { sourceId: 'n2', targetId: 'n3' }
        ]);

        toggleLink();
        expect(state.links.length).toBe(2);
        expect(state.links.find(l => l.sourceId === 'n1' && l.targetId === 'n2')?.direction).toBe('target');
        expect(state.links.find(l => l.sourceId === 'n2' && l.targetId === 'n3')?.direction).toBe('target');
    });

    test("Multi-node partial links: completes missing links first", () => {
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 250, y: 100, w: 100, h: 50 };
        const n3 = { id: 'n3', x: 400, y: 100, w: 100, h: 50 };
        state.nodes = [n1, n2, n3];
        state.selection = new Set(['n1', 'n2', 'n3']);
        state.selectionSource = 'box';

        // Pre-existing link n1 -> n2
        state.links = [{
            id: 'l1',
            sourceId: 'n1',
            targetId: 'n2',
            direction: 'target',
            strokeStyle: 'solid'
        }];

        // Press Ctrl+L -> should complete n2 -> n3 and keep n1 -> n2
        toggleLink();
        expect(state.links.length).toBe(2);
        expect(state.links.find(l => l.sourceId === 'n1' && l.targetId === 'n2')?.direction).toBe('target');
        expect(state.links.find(l => l.sourceId === 'n2' && l.targetId === 'n3')?.direction).toBe('target');

        // Next press -> all none
        toggleLink();
        expect(state.links.every(l => l.direction === 'none')).toBe(true);

        // Next press -> all deleted
        toggleLink();
        expect(state.links.length).toBe(0);
    });

    test("toggleLinkStrokeStyle across multi-node links", () => {
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 250, y: 100, w: 100, h: 50 };
        const n3 = { id: 'n3', x: 400, y: 100, w: 100, h: 50 };
        state.nodes = [n1, n2, n3];
        state.selection = new Set(['n1', 'n2', 'n3']);
        state.selectionSource = 'box';

        toggleLink(); // creates 2 links with solid
        expect(state.links.every(l => l.strokeStyle === 'solid')).toBe(true);

        toggleLinkStrokeStyle(); // -> dashed
        expect(state.links.every(l => l.strokeStyle === 'dashed')).toBe(true);

        toggleLinkStrokeStyle(); // -> wavy
        expect(state.links.every(l => l.strokeStyle === 'wavy')).toBe(true);

        toggleLinkStrokeStyle(); // -> solid
        expect(state.links.every(l => l.strokeStyle === 'solid')).toBe(true);
    });
});
