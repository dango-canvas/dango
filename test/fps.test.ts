// test/fps.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FPS, toggleFPS } from '../dango/js/modules/fps.js';

describe('FPS Monitor Debug Tool (FPS)', () => {
    let mockBodyChildren: any[] = [];
    const originalDocument = (globalThis as any).document;
    const originalRaf = (globalThis as any).requestAnimationFrame;
    const originalCaf = (globalThis as any).cancelAnimationFrame;

    function createMockElement(tag: string): any {
        const children: any[] = [];
        const el: any = {
            tagName: tag.toUpperCase(),
            id: '',
            style: { cssText: '', display: 'flex' },
            title: '',
            innerHTML: '',
            parentNode: null,
            onclick: null,
            children,
            appendChild: (child: any) => {
                child.parentNode = el;
                children.push(child);
                return child;
            },
            removeChild: (child: any) => {
                const idx = children.indexOf(child);
                if (idx !== -1) children.splice(idx, 1);
                child.parentNode = null;
            },
            querySelector: (selector: string) => {
                if (selector.startsWith('#')) {
                    const id = selector.slice(1);
                    if (el.id === id) return el;
                    for (const c of children) {
                        const found = c.querySelector ? c.querySelector(selector) : (c.id === id ? c : null);
                        if (found) return found;
                    }
                } else if (selector === 'canvas') {
                    if (el.tagName === 'CANVAS') return el;
                    for (const c of children) {
                        const found = c.querySelector ? c.querySelector(selector) : (c.tagName === 'CANVAS' ? c : null);
                        if (found) return found;
                    }
                }
                return null;
            },
            getContext: (type: string) => {
                if (tag.toLowerCase() === 'canvas') {
                    return {
                        clearRect: () => {},
                        beginPath: () => {},
                        moveTo: () => {},
                        lineTo: () => {},
                        bezierCurveTo: () => {},
                        stroke: () => {},
                        fill: () => {},
                        save: () => {},
                        restore: () => {},
                        scale: () => {},
                        strokeStyle: '',
                        fillStyle: '',
                        lineWidth: 1,
                        lineCap: 'round',
                        lineJoin: 'round'
                    };
                }
                return null;
            }
        };
        return el;
    }

    beforeEach(() => {
        mockBodyChildren = [];
        (globalThis as any).document = {
            createElement: (tag: string) => createMockElement(tag),
            body: {
                appendChild: (el: any) => {
                    el.parentNode = (globalThis as any).document.body;
                    mockBodyChildren.push(el);
                },
                removeChild: (el: any) => {
                    mockBodyChildren = mockBodyChildren.filter(item => item !== el);
                    el.parentNode = null;
                }
            }
        };
        (globalThis as any).requestAnimationFrame = (fn: Function) => 123;
        (globalThis as any).cancelAnimationFrame = (id: number) => {};
    });

    afterEach(() => {
        // Ensure clean state if active
        if (mockBodyChildren.length > 0) {
            FPS();
        }
        (globalThis as any).document = originalDocument;
        (globalThis as any).requestAnimationFrame = originalRaf;
        (globalThis as any).cancelAnimationFrame = originalCaf;
    });

    it('toggles FPS panel on and off with FPS() and alias toggleFPS()', () => {
        // 1. First toggle with FPS(): Turn ON
        const on = FPS();
        expect(on).toBe(true);
        expect(mockBodyChildren.length).toBe(1);
        const panel = mockBodyChildren[0];
        expect(panel.id).toBe('dango-fps-monitor');
        expect(panel.querySelector('canvas')).not.toBeNull();

        // 2. Second toggle with toggleFPS(): Turn OFF
        const off = toggleFPS();
        expect(off).toBe(false);
        expect(mockBodyChildren.length).toBe(0);
    });

    it('creates HUD with canvas and indicators', () => {
        const on = FPS();
        expect(on).toBe(true);
        const panel = mockBodyChildren[0];
        expect(panel).not.toBeNull();
        expect(typeof panel.onclick).toBe('function');

        // Verify sub elements exist in structure
        const canvas = panel.querySelector('canvas');
        expect(canvas).not.toBeNull();

        // Turn OFF
        FPS();
        expect(mockBodyChildren.length).toBe(0);
    });
});
