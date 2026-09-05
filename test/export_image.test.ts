import { describe, test, expect, beforeEach } from "bun:test";
import { 
    calculateExportBounds, 
    getExportImageFilename, 
    resolveExportBackground,
    renderTodoCheckboxSvg,
    collectExportStyles, 
    exportImage 
} from "../dango/js/modules/io.js";
import { state } from "../dango/js/modules/state.js";

describe("High-Fidelity 3x Retina PNG Export Engine", () => {
    beforeEach(() => {
        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set();
        state.theme = 'light';
        state.settings.hideGrid = false;
        state.settings.handDrawn = false;
    });

    describe("calculateExportBounds", () => {
        test("returns null when both nodes and groups are empty", () => {
            const bounds = calculateExportBounds([], []);
            expect(bounds).toBeNull();
        });

        test("calculates bounds for a single node with default 60px padding", () => {
            const nodes = [{ x: 100, y: 200, w: 120, h: 50 }];
            const bounds = calculateExportBounds(nodes, []);
            expect(bounds).not.toBeNull();
            if (!bounds) return;

            expect(bounds.minX).toBe(100);
            expect(bounds.minY).toBe(200);
            expect(bounds.maxX).toBe(220); // 100 + 120
            expect(bounds.maxY).toBe(250); // 200 + 50
            expect(bounds.width).toBe(120 + 60 * 2); // 240
            expect(bounds.height).toBe(50 + 60 * 2); // 170
            expect(bounds.offsetX).toBe(60 - 100); // -40
            expect(bounds.offsetY).toBe(60 - 200); // -140

            // Normalization check: minX + offsetX === padding
            expect(bounds.minX + bounds.offsetX).toBe(60);
            expect(bounds.minY + bounds.offsetY).toBe(60);
        });

        test("calculates joint bounds for multiple nodes and groups with custom padding", () => {
            const nodes = [
                { x: 50, y: 80, w: 100, h: 40 },
                { x: 300, y: 400, w: 150, h: 60 }
            ];
            const groups = [
                { x: 20, y: 50, w: 450, h: 450 }
            ];
            const padding = 80;
            const bounds = calculateExportBounds(nodes, groups, padding);
            expect(bounds).not.toBeNull();
            if (!bounds) return;

            expect(bounds.minX).toBe(20);
            expect(bounds.minY).toBe(50);
            expect(bounds.maxX).toBe(470); // group: 20 + 450
            expect(bounds.maxY).toBe(500); // group: 50 + 450
            expect(bounds.width).toBe((470 - 20) + 80 * 2); // 450 + 160 = 610
            expect(bounds.height).toBe((500 - 50) + 80 * 2); // 450 + 160 = 610
            expect(bounds.minX + bounds.offsetX).toBe(80);
            expect(bounds.minY + bounds.offsetY).toBe(80);
        });

        test("applies fallback dimensions (60x40) if node dimensions are missing", () => {
            const nodes = [{ x: 10, y: 20 }];
            const bounds = calculateExportBounds(nodes, [], 30);
            expect(bounds).not.toBeNull();
            if (!bounds) return;

            expect(bounds.maxX).toBe(10 + 60);
            expect(bounds.maxY).toBe(20 + 40);
            expect(bounds.width).toBe(60 + 30 * 2);
            expect(bounds.height).toBe(40 + 30 * 2);
        });
    });

    describe("getExportImageFilename", () => {
        test("generates dango_<Title>_<Timestamp>.png filename", () => {
            state.nodes = [
                { id: "1", text: "# Architecture Blueprint", x: 0, y: 0, w: 100, h: 40, color: "c-white" }
            ];
            const filename = getExportImageFilename(state);
            expect(filename.startsWith("dango_Architecture_Blueprint_") || filename.startsWith("dango_Architecture Blueprint_")).toBe(true);
            expect(filename.endsWith(".png")).toBe(true);
        });

        test("falls back to canvas when title is empty", () => {
            state.nodes = [];
            const filename = getExportImageFilename(state);
            expect(filename).toMatch(/^dango_canvas_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.png$/);
        });
    });

    describe("resolveExportBackground (Settings Linkage & Parameter Overrides)", () => {
        test("links grid setting by default: hideGrid=false means grid is drawn", () => {
            const res = resolveExportBackground('auto', false);
            expect(res.isTransparent).toBe(false);
            expect(res.shouldDrawGrid).toBe(true);
        });

        test("links grid setting by default: hideGrid=true means clean background without grid", () => {
            const res = resolveExportBackground('auto', true);
            expect(res.isTransparent).toBe(false);
            expect(res.shouldDrawGrid).toBe(false);
        });

        test("defaults to 'auto' if no background option passed", () => {
            const res1 = resolveExportBackground(undefined, false);
            expect(res1.shouldDrawGrid).toBe(true);

            const res2 = resolveExportBackground(undefined, true);
            expect(res2.shouldDrawGrid).toBe(false);
        });

        test("explicit 'grid' forces grid even if hideGrid is true", () => {
            const res = resolveExportBackground('grid', true);
            expect(res.isTransparent).toBe(false);
            expect(res.shouldDrawGrid).toBe(true);
        });

        test("explicit 'clean' forces no grid even if hideGrid is false", () => {
            const res = resolveExportBackground('clean', false);
            expect(res.isTransparent).toBe(false);
            expect(res.shouldDrawGrid).toBe(false);
        });

        test("explicit 'transparent' forces transparent background", () => {
            const res = resolveExportBackground('transparent', false);
            expect(res.isTransparent).toBe(true);
            expect(res.shouldDrawGrid).toBe(false);
        });
    });

    describe("Todo Checkbox Vector Rendering (renderTodoCheckboxSvg)", () => {
        test("generates unchecked empty rounded square SVG for [ ]", () => {
            const svg = renderTodoCheckboxSvg(false);
            expect(svg).toContain('<svg width="14" height="14"');
            expect(svg).toContain('fill="var(--c-white-bg, #ffffff)"');
            expect(svg).toContain('stroke="var(--link-color, #94a3b8)"');
            expect(svg).toContain('stroke-width="1.2"');
            expect(svg).toContain('rx="2.5"');
            expect(svg).not.toContain('<path'); // No checkmark
        });

        test("generates checked filled rounded square SVG with checkmark path for [x]", () => {
            const svg = renderTodoCheckboxSvg(true);
            expect(svg).toContain('<svg width="14" height="14"');
            expect(svg).toContain('fill="var(--select-color, #258292)"');
            expect(svg).toContain('stroke="var(--select-color, #258292)"');
            expect(svg).toContain('<path');
            expect(svg).toContain('d="M3 7.2L5.4 9.6L10.8 4.2"');
            expect(svg).toContain('stroke="#ffffff"');
            expect(svg).toContain('stroke-width="1.6"');
        });
    });

    describe("exportImage environment guard", () => {
        test("safely handles empty canvas and returns null", async () => {
            state.nodes = [];
            state.groups = [];
            const result = await exportImage({ scope: "all" });
            expect(result).toBeNull();
        });
    });
});
