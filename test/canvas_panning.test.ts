// test/canvas_panning.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { state } from '../dango/js/modules/state.js';
import { initView, panViewBy } from '../dango/js/modules/view.js';
import { initShortcuts, keys } from '../dango/js/modules/shortcuts.js';
import type { CanvasNode } from '../dango/js/modules/types.js';

describe('Canvas Keyboard Panning Specification', () => {
    let prevDoc: any;
    let prevWin: any;
    let keydownHandler: ((e: any) => void) | null = null;
    let keyupHandler: ((e: any) => void) | null = null;
    let nudgedDirection: string | null = null;

    beforeEach(() => {
        prevDoc = (globalThis as any).document;
        prevWin = (globalThis as any).window;

        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set<string>();
        state.view = { x: 500, y: 300, scale: 1.0 };
        state.isReadonly = false;
        nudgedDirection = null;

        Object.keys(keys).forEach(k => delete keys[k]);

        (globalThis as any).document = {
            body: {
                classList: {
                    add: () => {},
                    remove: () => {},
                    contains: () => false
                }
            },
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => []
        };

        (globalThis as any).window = {
            innerWidth: 1000,
            innerHeight: 800,
            addEventListener: (type: string, fn: any) => {
                if (type === 'keydown') keydownHandler = fn;
                if (type === 'keyup') keyupHandler = fn;
            },
            removeEventListener: () => {}
        };

        initView(state, () => {});
        initShortcuts({
            render: () => {},
            undo: () => {},
            redo: () => {},
            handleNodeEdit: () => {},
            exportJson: () => {}
        });
    });

    afterEach(() => {
        (globalThis as any).document = prevDoc;
        (globalThis as any).window = prevWin;
        state.isReadonly = false;
        Object.keys(keys).forEach(k => delete keys[k]);
    });

    it('panViewBy directly adjusts state.view coordinates', () => {
        panViewBy(50, -50);
        expect(state.view.x).toBe(550);
        expect(state.view.y).toBe(250);
    });

    it('pans canvas on Arrow keys when selection is empty', () => {
        expect(state.selection.size).toBe(0);

        // ArrowUp: camera moves UP -> view.y increases by 50
        keydownHandler?.({ code: 'ArrowUp', key: 'ArrowUp', preventDefault: () => {} });
        expect(state.view.y).toBe(350);

        // ArrowDown: camera moves DOWN -> view.y decreases by 50
        keydownHandler?.({ code: 'ArrowDown', key: 'ArrowDown', preventDefault: () => {} });
        expect(state.view.y).toBe(300);

        // ArrowLeft: camera moves LEFT -> view.x increases by 50
        keydownHandler?.({ code: 'ArrowLeft', key: 'ArrowLeft', preventDefault: () => {} });
        expect(state.view.x).toBe(550);

        // ArrowRight: camera moves RIGHT -> view.x decreases by 50
        keydownHandler?.({ code: 'ArrowRight', key: 'ArrowRight', preventDefault: () => {} });
        expect(state.view.x).toBe(500);
    });

    it('nudges selected nodes instead of panning when nodes are selected and Space is not held', () => {
        const node: CanvasNode = { id: 'node-1', text: 'Test', x: 100, y: 100, w: 100, h: 44, color: 'c-white' };
        state.nodes = [node];
        state.selection = new Set(['node-1']);

        const initialViewX = state.view.x;
        const initialViewY = state.view.y;

        // ArrowRight nudges selection (10px), does NOT pan canvas
        keydownHandler?.({ code: 'ArrowRight', key: 'ArrowRight', preventDefault: () => {} });
        expect(state.view.x).toBe(initialViewX);
        expect(state.view.y).toBe(initialViewY);
        expect(node.x).toBe(110);
    });

    it('forces canvas pan when Space + Arrow is pressed even with active selection', () => {
        const node: CanvasNode = { id: 'node-1', text: 'Test', x: 100, y: 100, w: 100, h: 44, color: 'c-white' };
        state.nodes = [node];
        state.selection = new Set(['node-1']);

        // Space key is held down
        keydownHandler?.({ code: 'Space', key: ' ', preventDefault: () => {} });
        expect(keys.Space).toBe(true);

        const initialNodeX = node.x;

        // Press ArrowRight while Space is held
        keydownHandler?.({ code: 'ArrowRight', key: 'ArrowRight', preventDefault: () => {} });

        // Canvas pans right (-50 X)
        expect(state.view.x).toBe(450);
        // Node position must NOT be nudged!
        expect(node.x).toBe(initialNodeX);
    });

    it('allows canvas pan via Arrow keys in readonly mode', () => {
        state.isReadonly = true;
        expect(state.selection.size).toBe(0);

        keydownHandler?.({ code: 'ArrowDown', key: 'ArrowDown', preventDefault: () => {} });
        expect(state.view.y).toBe(250);
    });

    it('animates smoothly via smoothPan when requestAnimationFrame is present and compounds rapid keys', () => {
        const rafCallbacks: Array<(t: number) => void> = [];
        (globalThis as any).requestAnimationFrame = (cb: any) => {
            rafCallbacks.push(cb);
            return rafCallbacks.length;
        };
        (globalThis as any).cancelAnimationFrame = (id: number) => {
            if (id > 0 && id <= rafCallbacks.length) rafCallbacks[id - 1] = () => {};
        };

        state.view = { x: 500, y: 300, scale: 1.0 };
        expect(state.selection.size).toBe(0);

        // Press ArrowRight (moves view.x by -50)
        keydownHandler?.({ code: 'ArrowRight', key: 'ArrowRight', preventDefault: () => {} });
        expect(rafCallbacks.length).toBeGreaterThan(0);

        // Rapid consecutive press: ArrowRight again
        keydownHandler?.({ code: 'ArrowRight', key: 'ArrowRight', preventDefault: () => {} });

        // Advance to finish
        const cb = rafCallbacks[rafCallbacks.length - 1];
        if (cb) cb(performance.now() + 500);

        // Target compounded: 500 - 50 - 50 = 400
        expect(state.view.x).toBe(400);

        delete (globalThis as any).requestAnimationFrame;
        delete (globalThis as any).cancelAnimationFrame;
    });
});
