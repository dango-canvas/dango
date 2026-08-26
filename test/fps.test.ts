// test/fps.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FPS, toggleFPS } from '../dango/js/modules/fps.js';

describe('FPS Monitor Debug Tool (FPS)', () => {
    let mockBodyChildren: any[] = [];
    const originalDocument = (globalThis as any).document;
    const originalRaf = (globalThis as any).requestAnimationFrame;
    const originalCaf = (globalThis as any).cancelAnimationFrame;

    beforeEach(() => {
        mockBodyChildren = [];
        (globalThis as any).document = {
            createElement: (tag: string) => {
                const el: any = {
                    tagName: tag.toUpperCase(),
                    id: '',
                    style: { cssText: '', display: 'block' },
                    title: '',
                    innerHTML: '',
                    parentNode: null,
                    onclick: null
                };
                return el;
            },
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
        (globalThis as any).document = originalDocument;
        (globalThis as any).requestAnimationFrame = originalRaf;
        (globalThis as any).cancelAnimationFrame = originalCaf;
    });

    it('toggles FPS panel on and off with FPS() and alias toggleFPS()', () => {
        // 1. First toggle with FPS(): Turn ON
        const on = FPS();
        expect(on).toBe(true);
        expect(mockBodyChildren.length).toBe(1);
        expect(mockBodyChildren[0].id).toBe('dango-fps-monitor');

        // 2. Second toggle with toggleFPS(): Turn OFF
        const off = toggleFPS();
        expect(off).toBe(false);
        expect(mockBodyChildren.length).toBe(0);
    });
});
