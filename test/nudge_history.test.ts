import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { state, history, undo } from '../dango/js/modules/state.js';
import { initShortcuts, endNudgeSession } from '../dango/js/modules/shortcuts.js';
import type { CanvasNode } from '../dango/js/modules/types.js';

describe('Arrow Key Nudge Undo Session & Stack Preservation', () => {
    let listeners: Record<string, ((e: any) => void)[]> = {};

    beforeEach(() => {
        listeners = {};
        (globalThis as any).window = {
            addEventListener: (type: string, fn: (e: any) => void) => {
                listeners[type] = listeners[type] || [];
                listeners[type].push(fn);
            },
            removeEventListener: (type: string, fn: (e: any) => void) => {
                if (listeners[type]) {
                    listeners[type] = listeners[type].filter(f => f !== fn);
                }
            }
        };

        (globalThis as any).document = {
            body: {
                classList: {
                    add: () => {},
                    remove: () => {},
                    contains: () => false
                }
            },
            getElementById: () => null
        };

        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set<string>();
        history.undo = [];
        history.redo = [];

        endNudgeSession();

        initShortcuts({
            render: () => {},
            undo: () => undo(() => {}),
            redo: () => {},
            handleNodeEdit: () => {},
            exportJson: () => {}
        });
    });

    afterEach(() => {
        endNudgeSession();
    });

    const triggerKeydown = (code: string, opts: Partial<KeyboardEvent> = {}) => {
        let prevented = false;
        const ev = {
            code,
            key: code,
            altKey: false,
            ctrlKey: false,
            metaKey: false,
            shiftKey: false,
            preventDefault: () => { prevented = true; },
            stopPropagation: () => {},
            target: null,
            ...opts
        };
        listeners['keydown']?.forEach(fn => fn(ev));
        return { prevented };
    };

    it('groups 30 consecutive arrow nudges into a single undo history entry without exhausting the 50-step stack', () => {
        const node: CanvasNode = { id: 'n1', text: 'Node', x: 200, y: 200, w: 100, h: 40, color: 'c-white' };
        state.nodes = [node];
        state.selection = new Set(['n1']);

        // Simulate user holding ArrowUp (30 repeat keydown events)
        for (let i = 0; i < 30; i++) {
            triggerKeydown('ArrowUp');
        }

        // Each step is 10px, so 30 steps moved it by 300px
        expect(state.nodes[0].y).toBe(200 - 30 * 10); // -100

        // Only ONE history snapshot should have been pushed, leaving the remaining 49 slots intact!
        expect(history.undo.length).toBe(1);

        // One Ctrl+Z cleanly restores the node back to its starting coordinate (y = 200)
        undo(() => {});
        expect(state.nodes[0].y).toBe(200);
    });

    it('does not push history or prevent default when arrow keys are pressed with empty selection', () => {
        const node: CanvasNode = { id: 'n1', text: 'Node', x: 200, y: 200, w: 100, h: 40, color: 'c-white' };
        state.nodes = [node];
        state.selection = new Set(); // Empty selection

        const { prevented } = triggerKeydown('ArrowUp');
        expect(prevented).toBe(false);
        expect(history.undo.length).toBe(0);
        expect(state.nodes[0].y).toBe(200);
    });

    it('terminates nudge session when another shortcut or key is pressed', () => {
        const node: CanvasNode = { id: 'n1', text: 'Node', x: 200, y: 200, w: 100, h: 40, color: 'c-white' };
        state.nodes = [node];
        state.selection = new Set(['n1']);

        // First nudge sequence (5 steps up)
        for (let i = 0; i < 5; i++) {
            triggerKeydown('ArrowUp');
        }
        expect(history.undo.length).toBe(1);
        expect(state.nodes[0].y).toBe(150);

        // User presses a non-nudge key (e.g. Tab)
        triggerKeydown('Tab');

        // Second nudge sequence (3 steps right)
        for (let i = 0; i < 3; i++) {
            triggerKeydown('ArrowRight');
        }

        // Second sequence pushed its own undo entry
        expect(history.undo.length).toBe(2);
        expect(state.nodes[0].x).toBe(230);

        // First undo reverts horizontal nudge
        undo(() => {});
        expect(state.nodes[0].x).toBe(200);
        expect(state.nodes[0].y).toBe(150);

        // Second undo reverts vertical nudge back to original
        undo(() => {});
        expect(state.nodes[0].y).toBe(200);
    });
});
