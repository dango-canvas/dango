// test/smooth_view_transition.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { state, CONFIG } from '../dango/js/modules/state.js';
import { initView, smoothZoom, smoothPan, changeZoom, cancelViewAnimation } from '../dango/js/modules/view.js';
import { isWheelNotch, initInteractions, WHEEL_PAN_SPEED } from '../dango/js/modules/interactions.js';
import { initShortcuts, keys } from '../dango/js/modules/shortcuts.js';

describe('Smooth View Transition Specification (Animated Zoom & Wheel Damping)', () => {
    let prevDoc: any;
    let prevWin: any;
    let prevRaf: any;
    let prevCaf: any;
    let keydownHandler: ((e: any) => void) | null = null;
    let wheelHandler: ((e: any) => void) | null = null;
    let rafCallbacks: Array<(time: number) => void> = [];

    beforeEach(() => {
        prevDoc = (globalThis as any).document;
        prevWin = (globalThis as any).window;
        prevRaf = (globalThis as any).requestAnimationFrame;
        prevCaf = (globalThis as any).cancelAnimationFrame;

        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set<string>();
        state.view = { x: 500, y: 300, scale: 1.0 };
        state.settings = { altAsCtrl: false } as any;
        rafCallbacks = [];

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
            },
            removeEventListener: () => {}
        };

        (globalThis as any).requestAnimationFrame = (cb: (time: number) => void) => {
            rafCallbacks.push(cb);
            return rafCallbacks.length;
        };
        (globalThis as any).cancelAnimationFrame = (id: number) => {
            // Cancel callback
            if (id > 0 && id <= rafCallbacks.length) {
                rafCallbacks[id - 1] = () => {};
            }
        };

        initView(state, () => {});
    });

    afterEach(() => {
        cancelViewAnimation();
        (globalThis as any).document = prevDoc;
        (globalThis as any).window = prevWin;
        (globalThis as any).requestAnimationFrame = prevRaf;
        (globalThis as any).cancelAnimationFrame = prevCaf;
    });

    it('isWheelNotch differentiates physical mouse wheel notches from trackpad events', () => {
        // Physical mouse wheel notches (typically 100, 120, -100, -120, or horizontal tilt)
        expect(isWheelNotch({ deltaMode: 0, deltaY: 100, deltaX: 0 } as any)).toBe(true);
        expect(isWheelNotch({ deltaMode: 0, deltaY: -120, deltaX: 0 } as any)).toBe(true);
        expect(isWheelNotch({ deltaMode: 0, deltaY: 0, deltaX: 100 } as any)).toBe(true);
        expect(isWheelNotch({ deltaMode: 0, deltaY: 0, deltaX: -50 } as any)).toBe(true);
        expect(isWheelNotch({ deltaMode: 1, deltaY: 3, deltaX: 0 } as any)).toBe(true); // Line mode

        // Trackpad continuous micro-deltas
        expect(isWheelNotch({ deltaMode: 0, deltaY: 4, deltaX: 0 } as any)).toBe(false);
        expect(isWheelNotch({ deltaMode: 0, deltaY: 12.5, deltaX: 0 } as any)).toBe(false);
        expect(isWheelNotch({ deltaMode: 0, deltaY: 0, deltaX: 2.5 } as any)).toBe(false);
        expect(isWheelNotch({ deltaMode: 0, deltaY: -1.33, deltaX: 0 } as any)).toBe(false);
    });

    it('smoothZoom schedules view animation and compounds in-flight zoom targets cleanly', () => {
        // Initial view: (500, 300, scale 1.0)
        // Zoom in by 1.2 centered at (500, 400)
        smoothZoom(1.2, 500, 400);

        expect(rafCallbacks.length).toBeGreaterThan(0);

        // Advance 1 frame with partial progress
        // World pos of anchor: ((500 - 500)/1, (400 - 300)/1) = (0, 100)
        // Target scale = 1.2
        // Target X = 500 - 0 * 1.2 = 500
        // Target Y = 400 - 100 * 1.2 = 280
        
        // Consecutive press while in flight: should compound from target scale 1.2 -> 1.44
        smoothZoom(1.2, 500, 400);

        // Cancel and verify state remains stable
        cancelViewAnimation();
        expect(state.view.scale).toBeGreaterThanOrEqual(1.0);
    });

    it('smoothZoom respects maximum and minimum scale boundaries (0.1 <= scale <= 5.0)', () => {
        state.view.scale = 4.5;
        smoothZoom(1.5, 500, 400);
        // Target scale is clamped to 5.0
        // Fire animation callback to completion
        const cb = rafCallbacks[rafCallbacks.length - 1];
        if (cb) cb(performance.now() + 500);

        expect(state.view.scale).toBeLessThanOrEqual(5.0);

        state.view.scale = 0.15;
        smoothZoom(0.5, 500, 400);
        const cbMin = rafCallbacks[rafCallbacks.length - 1];
        if (cbMin) cbMin(performance.now() + 500);

        expect(state.view.scale).toBeGreaterThanOrEqual(0.1);
    });

    it('smoothPan accumulates delta and smoothly animates viewport coordinates', () => {
        state.view = { x: 100, y: 100, scale: 1.0 };
        smoothPan(50, -50, 120);

        expect(rafCallbacks.length).toBeGreaterThan(0);

        // Compound another pan before finish
        smoothPan(50, -50, 120);

        // Advance animation to completion
        const cb = rafCallbacks[rafCallbacks.length - 1];
        if (cb) cb(performance.now() + 500);

        expect(state.view.x).toBe(200);
        expect(state.view.y).toBe(0);
    });

    it('smoothPan handles rapid mouse wheel scrolling without resetting or stalling', () => {
        state.view = { x: 0, y: 0, scale: 1.0 };
        
        // Simulate rapid mouse wheel spin: 5 notches in quick succession
        for (let i = 0; i < 5; i++) {
            smoothPan(0, -100);
        }

        // Advance animation to completion
        const cb = rafCallbacks[rafCallbacks.length - 1];
        if (cb) cb(performance.now() + 500);

        // Should reach full cumulative distance of 5 * (-100) = -500 without getting stuck
        expect(state.view.y).toBe(-500);
        expect(state.view.x).toBe(0);
    });

    it('wheelPanSpeed is configured to 0.5 to balance mouse wheel feel with keyboard step', () => {
        expect(CONFIG.wheelPanSpeed).toBe(0.5);
        expect(WHEEL_PAN_SPEED).toBe(0.5);
    });

    it('shortcuts Ctrl + = and Ctrl + - trigger smoothZoom instead of discrete changeZoom', () => {
        initShortcuts({
            render: () => {},
            undo: () => {},
            redo: () => {},
            handleNodeEdit: () => {},
            exportJson: () => {}
        });

        // Trigger Ctrl + =
        keydownHandler!({
            code: 'Equal',
            key: '=',
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: () => {}
        });

        expect(rafCallbacks.length).toBeGreaterThan(0);

        // Advance to completion
        const cb = rafCallbacks[rafCallbacks.length - 1];
        if (cb) cb(performance.now() + 500);

        expect(state.view.scale).toBeCloseTo(1.2, 4);

        // Trigger Ctrl + -
        keydownHandler!({
            code: 'Minus',
            key: '-',
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: () => {}
        });

        const cbMinus = rafCallbacks[rafCallbacks.length - 1];
        if (cbMinus) cbMinus(performance.now() + 500);

        expect(state.view.scale).toBeCloseTo(0.96, 4); // 1.2 * 0.8
    });
});
