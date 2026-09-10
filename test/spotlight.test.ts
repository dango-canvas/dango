import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { 
    activateSpotlight, 
    deactivateSpotlight, 
    isSpotlightActive, 
    trackSpotlightMouse, 
    updateSpotlightPosition, 
    getLastMouseScreenPos, 
    resetSpotlightState 
} from '../dango/js/modules/spotlight.js';

describe('Spotlight Module (Q 键聚光灯瞬时跟随与追踪)', () => {
    let mockSpotlightEl: {
        styleProperties: Record<string, string>;
        style: {
            setProperty: (k: string, v: string) => void;
            getPropertyValue: (k: string) => string;
        };
    };

    let mockClassList: Set<string>;
    const origDocument = (globalThis as any).document;
    const origWindow = (globalThis as any).window;

    beforeEach(() => {
        mockClassList = new Set<string>();
        mockSpotlightEl = {
            styleProperties: {},
            style: {
                setProperty: (k: string, v: string) => {
                    mockSpotlightEl.styleProperties[k] = v;
                },
                getPropertyValue: (k: string) => mockSpotlightEl.styleProperties[k] || ''
            }
        };

        (globalThis as any).document = {
            getElementById: (id: string) => {
                if (id === 'spotlight-layer') return mockSpotlightEl;
                return null;
            },
            body: {
                classList: {
                    add: (cls: string) => mockClassList.add(cls),
                    remove: (cls: string) => mockClassList.delete(cls),
                    contains: (cls: string) => mockClassList.has(cls)
                }
            }
        };

        (globalThis as any).window = {
            innerWidth: 1200,
            innerHeight: 800
        };

        resetSpotlightState();
    });

    afterEach(() => {
        (globalThis as any).document = origDocument;
        (globalThis as any).window = origWindow;
    });

    it('Initial state is inactive and mouse pos is uninitialized', () => {
        expect(isSpotlightActive()).toBe(false);
        expect(getLastMouseScreenPos()).toEqual({ x: -1, y: -1 });
    });

    it('Tracks mousemove without mutating spotlight styles when inactive (zero style-recalc overhead)', () => {
        trackSpotlightMouse({ clientX: 350, clientY: 220 });

        expect(getLastMouseScreenPos()).toEqual({ x: 350, y: 220 });
        // Inactive: must NOT touch DOM style properties to avoid document-wide layout recalculations
        expect(mockSpotlightEl.styleProperties['--mouse-x']).toBeUndefined();
        expect(mockSpotlightEl.styleProperties['--mouse-y']).toBeUndefined();
    });

    it('Activates spotlight instantly aligned to current mouse cursor without requiring mouse movement', () => {
        // 1. Mouse is hovering at (420, 310)
        trackSpotlightMouse({ clientX: 420, clientY: 310 });

        // 2. User presses Q without moving mouse
        activateSpotlight();

        // 3. Immediately active with exact cursor center
        expect(isSpotlightActive()).toBe(true);
        expect(mockClassList.has('spotlight-active')).toBe(true);
        expect(mockSpotlightEl.styleProperties['--mouse-x']).toBe('420px');
        expect(mockSpotlightEl.styleProperties['--mouse-y']).toBe('310px');
    });

    it('Continuously tracks mouse movements while spotlight is active', () => {
        trackSpotlightMouse({ clientX: 100, clientY: 100 });
        activateSpotlight();
        expect(mockSpotlightEl.styleProperties['--mouse-x']).toBe('100px');

        // Mouse moves while holding Q
        trackSpotlightMouse({ clientX: 550, clientY: 650 });
        expect(mockSpotlightEl.styleProperties['--mouse-x']).toBe('550px');
        expect(mockSpotlightEl.styleProperties['--mouse-y']).toBe('650px');
    });

    it('Deactivates cleanly when key is released', () => {
        trackSpotlightMouse({ clientX: 200, clientY: 200 });
        activateSpotlight();
        expect(isSpotlightActive()).toBe(true);

        deactivateSpotlight();
        expect(isSpotlightActive()).toBe(false);
        expect(mockClassList.has('spotlight-active')).toBe(false);
    });

    it('Falls back to viewport center if Q is pressed before any mouse event occurred', () => {
        // Fresh start without prior mouse movements
        activateSpotlight();

        expect(isSpotlightActive()).toBe(true);
        expect(mockSpotlightEl.styleProperties['--mouse-x']).toBe('600px'); // 1200 / 2
        expect(mockSpotlightEl.styleProperties['--mouse-y']).toBe('400px'); // 800 / 2
    });
});
