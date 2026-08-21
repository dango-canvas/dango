// test/links.test.ts
import { expect, test, describe } from "bun:test";
import { getEdgeIntersection, getNodeCenter } from "../dango/js/modules/utils.js";
import {
    cycleLinkStrokeStyle,
    packLinkStrokeStyle,
    unpackLinkStrokeStyle,
    buildStraightLinkPath,
    buildAutoCurveLinkPath,
    buildWavyLinkPath,
    buildLinkPathData,
    getLinkOpacity
} from "../dango/js/modules/links.js";

describe("Links & Geometry Algorithms", () => {
    test("getEdgeIntersection correctly finds rectangle borders", () => {
        const source = { x: 100, y: 100, w: 100, h: 50 }; // center (150, 125)
        const target = { x: 350, y: 100, w: 100, h: 50 }; // center (400, 125)

        // Directly horizontal right
        const pt = getEdgeIntersection(source, target);
        expect(pt.x).toBe(350); // Left edge of target
        expect(pt.y).toBe(125); // Vertical center of target

        // Directly vertical bottom
        const targetBottom = { x: 100, y: 300, w: 100, h: 50 }; // center (150, 325)
        const ptBottom = getEdgeIntersection(source, targetBottom);
        expect(ptBottom.x).toBe(150); // Horizontal center
        expect(ptBottom.y).toBe(300); // Top edge of target
    });

    test("getNodeCenter returns precise centroid", () => {
        const node = { x: 200, y: 150, w: 120, h: 80 };
        const center = getNodeCenter(node);
        expect(center.x).toBe(260);
        expect(center.y).toBe(190);
    });

    test("cycleLinkStrokeStyle cycles solid -> dashed -> wavy -> solid", () => {
        const link = { strokeStyle: 'solid' };
        expect(cycleLinkStrokeStyle(link)).toBe('dashed');
        expect(link.strokeStyle).toBe('dashed');

        expect(cycleLinkStrokeStyle(link)).toBe('wavy');
        expect(link.strokeStyle).toBe('wavy');

        expect(cycleLinkStrokeStyle(link)).toBe('solid');
        expect(link.strokeStyle).toBe('solid');
    });

    test("pack and unpack link stroke style integer codes", () => {
        expect(packLinkStrokeStyle('solid')).toBe(0);
        expect(packLinkStrokeStyle('dashed')).toBe(1);
        expect(packLinkStrokeStyle('wavy')).toBe(2);

        expect(unpackLinkStrokeStyle(0)).toBe('solid');
        expect(unpackLinkStrokeStyle(1)).toBe('dashed');
        expect(unpackLinkStrokeStyle(2)).toBe('wavy');
        expect(unpackLinkStrokeStyle(999)).toBe('solid'); // fallback
    });

    test("buildAutoCurveLinkPath generates straight path when distance is tiny", () => {
        const p1 = { x: 100, y: 100 };
        const p2 = { x: 102, y: 102 };
        const path = buildAutoCurveLinkPath(p1, p2);
        expect(path).toBe("M 100 100 L 102 102");
    });

    test("buildAutoCurveLinkPath generates quadratic bezier when displaced", () => {
        const p1 = { x: 100, y: 100 };
        const p2 = { x: 300, y: 250 };
        const path = buildAutoCurveLinkPath(p1, p2);
        expect(path.startsWith("M 100 100 Q")).toBe(true);
        expect(path.endsWith("300 250")).toBe(true);
    });

    test("buildWavyLinkPath generates multiple bezier wave segments", () => {
        const p1 = { x: 100, y: 100 };
        const p2 = { x: 400, y: 100 }; // 300px long
        const path = buildWavyLinkPath(p1, p2);
        expect(path.startsWith("M 100 100")).toBe(true);
        expect(path.includes("Q")).toBe(true);
        expect(path.endsWith("400 100")).toBe(true);
    });

    test("getLinkOpacity respects directional and stroke style rules", () => {
        expect(getLinkOpacity({ strokeStyle: 'solid', direction: 'none' })).toBe(0.42);
        expect(getLinkOpacity({ strokeStyle: 'solid', direction: 'target' })).toBe(0.6);
        expect(getLinkOpacity({ strokeStyle: 'dashed', direction: 'none' })).toBe(0.38);
        expect(getLinkOpacity({ strokeStyle: 'dashed', direction: 'target' })).toBe(0.56);
        expect(getLinkOpacity({ strokeStyle: 'wavy', direction: 'none' })).toBe(0.44);
        expect(getLinkOpacity({ strokeStyle: 'wavy', direction: 'target' })).toBe(0.62);
    });
});
