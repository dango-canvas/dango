// test/mobile_touch.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { state } from '../dango/js/modules/state.js';
import { screenToWorld } from '../dango/js/modules/utils.js';

describe('Mobile Touch Interactions & Pinch-Pan Anchor Mathematics', () => {
    beforeEach(() => {
        state.view = { x: 100, y: 50, scale: 1.0 };
        state.nodes = [
            { id: 'node-1', text: 'Hello', x: 200, y: 150, w: 100, h: 40, color: 'c-white' }
        ];
        state.selection = new Set(['node-1']);
    });

    it('correctly anchors the world coordinate at pinch center when zooming', () => {
        // Initial pinch center on screen: (300, 250)
        const initialScreenCenter = { x: 300, y: 250 };
        const pinchWorldCenter = screenToWorld(initialScreenCenter.x, initialScreenCenter.y, state.view);
        // (300 - 100) / 1.0 = 200, (250 - 50) / 1.0 = 200
        expect(pinchWorldCenter.x).toBe(200);
        expect(pinchWorldCenter.y).toBe(200);

        // User zooms in by 1.5x, and moves fingers to (350, 300) simultaneously (Pinch + Pan)
        const newScale = 1.5;
        const newScreenCenter = { x: 350, y: 300 };

        // Apply our anchor locking formula:
        state.view.scale = newScale;
        state.view.x = newScreenCenter.x - pinchWorldCenter.x * newScale;
        state.view.y = newScreenCenter.y - pinchWorldCenter.y * newScale;

        // Verify that the new screen coordinates of pinchWorldCenter exactly match newScreenCenter!
        const projectedScreenX = state.view.x + pinchWorldCenter.x * state.view.scale;
        const projectedScreenY = state.view.y + pinchWorldCenter.y * state.view.scale;

        expect(projectedScreenX).toBe(350);
        expect(projectedScreenY).toBe(300);
    });

    it('preserves node coordinates and relative distance during canvas pan', () => {
        const initialNodePos = { ...state.nodes[0] };
        
        // Single finger pan: view moves by (+50, +30)
        state.view.x += 50;
        state.view.y += 30;

        // Node world coordinates must not change!
        expect(state.nodes[0].x).toBe(initialNodePos.x);
        expect(state.nodes[0].y).toBe(initialNodePos.y);
    });
});
