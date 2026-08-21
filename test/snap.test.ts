// test/snap.test.ts
import { expect, test, describe, beforeEach } from "bun:test";
import { state } from "../dango/js/modules/state.js";
import { calculateMagneticSnap, SNAP_THRESHOLD, MAX_SNAP_NEIGHBOR_DIST } from "../dango/js/modules/interactions.js";

describe("Subtle Magnetic Snap Guides", () => {
    beforeEach(() => {
        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set();
    });

    test("No candidate neighbors: preserves raw delta without snapping", () => {
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 };
        state.nodes = [n1];
        state.selection = new Set(['n1']);

        const initialPos = { n1: { x: 100, y: 100 } };
        const res = calculateMagneticSnap('n1', 20, 30, initialPos);

        expect(res.effectiveDx).toBe(20);
        expect(res.effectiveDy).toBe(30);
        expect(res.guides.length).toBe(0);
    });

    test("X-axis center alignment (Vertical Guide) within 5px threshold", () => {
        // n1 initial: x=100, y=100, w=100, h=50 -> center (150, 125)
        // n2 target: x=152, y=200, w=100, h=50 -> center (202, 225)
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 152, y: 200, w: 100, h: 50 };
        state.nodes = [n1, n2];
        state.selection = new Set(['n1']);

        const initialPos = { n1: { x: 100, y: 100 } };
        // rawDx=50 -> proposed n1.x=150, cx=200. n2.cx=202. Diff=2px <= 5px
        const res = calculateMagneticSnap('n1', 50, 0, initialPos);

        expect(res.effectiveDx).toBe(52); // snapped to 202 - 150 = 52
        expect(res.effectiveDy).toBe(0);
        expect(res.guides.length).toBe(1);
        expect(res.guides[0].type).toBe('vertical');
        expect(res.guides[0].x1).toBe(202);
        expect(res.guides[0].x2).toBe(202);
        expect(res.guides[0].y1).toBe(125);
        expect(res.guides[0].y2).toBe(225);
    });

    test("Y-axis center alignment (Horizontal Guide) within 5px threshold", () => {
        // n1 initial: x=100, y=100, w=100, h=50 -> center (150, 125)
        // n2 target: x=250, y=103, w=100, h=50 -> center (300, 128)
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 250, y: 103, w: 100, h: 50 };
        state.nodes = [n1, n2];
        state.selection = new Set(['n1']);

        const initialPos = { n1: { x: 100, y: 100 } };
        // rawDy=0 -> proposed n1.y=100, cy=125. n2.cy=128. Diff=3px <= 5px
        const res = calculateMagneticSnap('n1', 0, 0, initialPos);

        expect(res.effectiveDx).toBe(0);
        expect(res.effectiveDy).toBe(3); // snapped to 128 - 125 = 3
        expect(res.guides.length).toBe(1);
        expect(res.guides[0].type).toBe('horizontal');
        expect(res.guides[0].y1).toBe(128);
        expect(res.guides[0].y2).toBe(128);
        expect(res.guides[0].x1).toBe(150);
        expect(res.guides[0].x2).toBe(300);
    });

    test("Does not snap when distance exceeds 5px threshold", () => {
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 160, y: 200, w: 100, h: 50 }; // n2.cx=210
        state.nodes = [n1, n2];
        state.selection = new Set(['n1']);

        const initialPos = { n1: { x: 100, y: 100 } };
        // rawDx=50 -> proposed cx=200. Diff = |210 - 200| = 10 > 5px
        const res = calculateMagneticSnap('n1', 50, 0, initialPos);

        expect(res.effectiveDx).toBe(50);
        expect(res.effectiveDy).toBe(0);
        expect(res.guides.length).toBe(0);
    });

    test("Does not snap when neighbor is far away (> 350px)", () => {
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 }; // cx=150, cy=125
        const n2 = { id: 'n2', x: 100, y: 600, w: 100, h: 50 }; // cx=150, cy=625. dist = 500px > 350px
        state.nodes = [n1, n2];
        state.selection = new Set(['n1']);

        const initialPos = { n1: { x: 100, y: 100 } };
        const res = calculateMagneticSnap('n1', 0, 0, initialPos);

        expect(res.effectiveDx).toBe(0);
        expect(res.effectiveDy).toBe(0);
        expect(res.guides.length).toBe(0);
    });

    test("Both X and Y axis simultaneously snap", () => {
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 202, y: 200, w: 100, h: 50 }; // ocx=252
        const n3 = { id: 'n3', x: 100, y: 128, w: 100, h: 50 }; // ocy=153
        state.nodes = [n1, n2, n3];
        state.selection = new Set(['n1']);

        const initialPos = { n1: { x: 100, y: 100 } };
        // rawDx=100 -> cx=250. Diff with n2.cx(252)=2px.
        // rawDy=25 -> cy=150. Diff with n3.cy(153)=3px.
        const res = calculateMagneticSnap('n1', 100, 25, initialPos);

        expect(res.effectiveDx).toBe(102);
        expect(res.effectiveDy).toBe(28);
        expect(res.guides.length).toBe(2);
        expect(res.guides.some(g => g.type === 'vertical')).toBe(true);
        expect(res.guides.some(g => g.type === 'horizontal')).toBe(true);
    });

    test("Excludes other selected nodes from snap candidate references", () => {
        const n1 = { id: 'n1', x: 100, y: 100, w: 100, h: 50 };
        const n2 = { id: 'n2', x: 102, y: 200, w: 100, h: 50 }; // also selected
        state.nodes = [n1, n2];
        state.selection = new Set(['n1', 'n2']);

        const initialPos = { n1: { x: 100, y: 100 }, n2: { x: 102, y: 200 } };
        const res = calculateMagneticSnap('n1', 0, 0, initialPos);

        expect(res.guides.length).toBe(0);
        expect(res.effectiveDx).toBe(0);
        expect(res.effectiveDy).toBe(0);
    });
});
