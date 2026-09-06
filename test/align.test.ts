// test/align.test.ts
import { expect, test, describe, beforeEach } from "bun:test";
import { state } from "../dango/js/modules/state.js";
import { alignSelection, distributeSelection } from "../dango/js/modules/actions.js";

describe("Alignment & Distribution Algorithms (Alt + Arrows / Alt + .)", () => {
    beforeEach(() => {
        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set();
    });

    test("alignSelection('left') aligns all selected items to leftmost X", () => {
        const n1 = { id: 'n1', x: 50, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 120, y: 200, w: 100, h: 50 };
        const n3 = { id: 'n3', x: 200, y: 300, w: 100, h: 50 };
        state.nodes = [n1, n2, n3];
        state.selection = new Set(['n1', 'n2', 'n3']);

        alignSelection('left');
        expect(n1.x).toBe(50);
        expect(n2.x).toBe(50);
        expect(n3.x).toBe(50);
    });

    test("alignSelection('centerX') centers all selected items around bounding box center", () => {
        // n1: x=0, w=100 (range 0..100)
        // n2: x=200, w=60 (range 200..260)
        // Total bounding box X: minX=0, maxX=260 -> centerX=130
        const n1 = { id: 'n1', x: 0, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 200, y: 200, w: 60, h: 50 };
        state.nodes = [n1, n2];
        state.selection = new Set(['n1', 'n2']);

        alignSelection('centerX');
        // n1.x = 130 - 100/2 = 80
        expect(n1.x).toBe(80);
        // n2.x = 130 - 60/2 = 100
        expect(n2.x).toBe(100);
    });

    test("alignSelection('top') aligns all selected items to topmost Y", () => {
        const n1 = { id: 'n1', x: 100, y: 40, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 200, y: 150, w: 100, h: 50 };
        state.nodes = [n1, n2];
        state.selection = new Set(['n1', 'n2']);

        alignSelection('top');
        expect(n1.y).toBe(40);
        expect(n2.y).toBe(40);
    });

    test("alignSelection('centerY') centers all selected items vertically", () => {
        // n1: y=0, h=100 (range 0..100)
        // n2: y=200, h=40 (range 200..240)
        // Total bounding box Y: minY=0, maxY=240 -> centerY=120
        const n1 = { id: 'n1', x: 100, y: 0, w: 100, h: 100 };
        const n2 = { id: 'n2', x: 200, y: 200, w: 100, h: 40 };
        state.nodes = [n1, n2];
        state.selection = new Set(['n1', 'n2']);

        alignSelection('centerY');
        // n1.y = 120 - 100/2 = 70
        expect(n1.y).toBe(70);
        // n2.y = 120 - 40/2 = 100
        expect(n2.y).toBe(100);
    });

    test("distributeSelection('h') evenly spaces nodes horizontally", () => {
        // 3 nodes each with w=100
        // span from x=0 to x=500 (total span = 500 - 0 = 500)
        // total node widths = 300, remaining gap = 200 / (3-1) = 100
        const n1 = { id: 'n1', x: 0, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 50, y: 100, w: 100, h: 50 }; // misplaced
        const n3 = { id: 'n3', x: 400, y: 100, w: 100, h: 50 }; // end at 500
        state.nodes = [n1, n2, n3];
        state.selection = new Set(['n1', 'n2', 'n3']);

        distributeSelection('h');
        expect(n1.x).toBe(0);
        expect(n2.x).toBe(200); // 0 + 100 + 100
        expect(n3.x).toBe(400); // 200 + 100 + 100
    });

    test("distributeSelection('v') evenly spaces nodes vertically", () => {
        // 3 nodes each with h=50
        // span from y=0 to y=250 (n3 ends at 250)
        // total heights = 150, remaining gap = 100 / 2 = 50
        const n1 = { id: 'n1', x: 100, y: 0, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 100, y: 30, w: 100, h: 50 };
        const n3 = { id: 'n3', x: 100, y: 200, w: 100, h: 50 };
        state.nodes = [n1, n2, n3];
        state.selection = new Set(['n1', 'n2', 'n3']);

        distributeSelection('v');
        expect(n1.y).toBe(0);
        expect(n2.y).toBe(100); // 0 + 50 + 50
        expect(n3.y).toBe(200); // 100 + 50 + 50
    });

    test("alignSelection('right') aligns all selected items to rightmost X + W", () => {
        const n1 = { id: 'n1', x: 0, y: 100, w: 100, h: 50 }; // right edge: 100
        const n2 = { id: 'n2', x: 50, y: 200, w: 250, h: 50 }; // right edge: 300
        const n3 = { id: 'n3', x: 20, y: 300, w: 80, h: 50 }; // right edge: 100
        state.nodes = [n1, n2, n3];
        state.selection = new Set(['n1', 'n2', 'n3']);

        alignSelection('right');
        // maxX = 300
        expect(n1.x).toBe(200); // 300 - 100
        expect(n2.x).toBe(50);  // 300 - 250
        expect(n3.x).toBe(220); // 300 - 80
        expect(n1.x + n1.w).toBe(300);
        expect(n2.x + n2.w).toBe(300);
        expect(n3.x + n3.w).toBe(300);
    });

    test("alignSelection('right') synchronizes live DOM dimensions when node.w is stale (e.g. font switch)", () => {
        const n1 = { id: 'n1', x: 0, y: 100, w: 75, h: 44 };
        const n2 = { id: 'n2', x: 0, y: 200, w: 220, h: 44 }; // stale width in memory
        state.nodes = [n1, n2];
        state.selection = new Set(['n1', 'n2']);

        // Mock live DOM with updated font dimensions (e.g. handwritten font)
        const origDocument = (globalThis as any).document;
        (globalThis as any).document = {
            getElementById: () => null,
            querySelector: (sel: string) => {
                if (sel === '.node[data-id="n1"]') return { offsetWidth: 85, offsetHeight: 44 };
                if (sel === '.node[data-id="n2"]') return { offsetWidth: 360, offsetHeight: 44 };
                return null;
            }
        };

        try {
            alignSelection('right');
            // Live DOM synced: n1.w = 85, n2.w = 360
            // n2 was at x=0, so maxX = 0 + 360 = 360
            expect(n2.w).toBe(360);
            expect(n1.w).toBe(85);
            expect(n2.x).toBe(0); // 360 - 360
            expect(n1.x).toBe(275); // 360 - 85
            // Both right edges perfectly line up to 360
            expect(n1.x + n1.w).toBe(360);
            expect(n2.x + n2.w).toBe(360);
        } finally {
            (globalThis as any).document = origDocument;
        }
    });
});
