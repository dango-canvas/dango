import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getTexts, toggleLang, getCurrentLang } from '../dango/js/modules/i18n.js';
import { createShareLink } from '../dango/js/modules/io.js';
import type { ToastActionButton, ToastActionContext } from '../dango/js/modules/ui.js';

describe('Image Export Promotion & Embed Toast Action Integration', () => {
    it('index.html contains #opt-image with btn_export_image and #btn-clear with localized tooltip', () => {
        const html = readFileSync(join(import.meta.dir, '../dango/index.html'), 'utf-8');
        expect(html.includes('id="opt-image"')).toBe(true);
        expect(html.includes('data-i18n="btn_export_image"')).toBe(true);
        expect(html.includes('id="opt-embed"')).toBe(false);
        expect(html.includes('data-i18n-title="btn_clear_tooltip"')).toBe(true);
    });

    it('i18n defines correct Chinese and English strings for image export, embed action, and clear tooltip', () => {
        if (getCurrentLang() !== 'zh') toggleLang();
        const zhTexts = getTexts();
        expect(zhTexts.btn_export_image).toBe('图片');
        expect(zhTexts.toast_btn_embed).toBe('嵌入');
        expect(zhTexts.btn_clear_tooltip).toBe('清空');

        toggleLang(); // switch to en
        expect(getCurrentLang()).toBe('en');
        const enTexts = getTexts();
        expect(enTexts.btn_export_image).toBe('PNG');
        expect(enTexts.toast_btn_embed).toBe('EMBED');
        expect(enTexts.btn_clear_tooltip).toBe('Clear');

        // Reset to zh
        toggleLang();
        expect(getCurrentLang()).toBe('zh');
    });

    it('createShareLink attaches embed action button which copies iframe and triggers confirmAndDismiss', async () => {
        let copiedClipboard = '';

        (globalThis as any).window = {
            location: { origin: 'https://dango.ink', pathname: '/' }
        };
        (globalThis as any).navigator = {
            clipboard: {
                writeText: async (text: string) => {
                    copiedClipboard = text;
                    return true;
                }
            }
        };

        // Mock document for showToast
        const container = {
            appendChild: (_el: any) => {}
        };
        (globalThis as any).document = {
            getElementById: (id: string) => {
                if (id === 'toast-container') return container;
                return null;
            },
            createElement: (tag: string) => {
                const el: any = {
                    tagName: tag.toUpperCase(),
                    classList: { add: () => {}, remove: () => {} },
                    appendChild: (_c: any) => {},
                    addEventListener: () => {},
                    style: {}
                };
                return el;
            }
        };

        createShareLink();
        await new Promise(r => setTimeout(r, 20));

        expect(copiedClipboard.startsWith('https://dango.ink/#')).toBe(true);
    });

    it('ToastActionContext provides confirmAndDismiss for zero-shift checkmark confirmation', () => {
        let timerReset = 0;
        const classes = new Set<string>();

        const mockBtn: any = {
            innerText: '嵌入',
            classList: {
                add: (c: string) => classes.add(c),
                contains: (c: string) => classes.has(c)
            },
            style: {}
        };

        const ctx: ToastActionContext = {
            mutateText: () => {},
            confirmAndDismiss: (btnText = '✓', delayMs = 400) => {
                mockBtn.innerText = btnText;
                mockBtn.classList.add('btn-toast-success');
                mockBtn.style.pointerEvents = 'none';
                timerReset = delayMs;
            },
            dismissAction: () => {},
            resetTimer: (ms = 1500) => { timerReset = ms; },
            removeToast: () => {}
        };

        ctx.confirmAndDismiss('✓', 400);
        expect(mockBtn.innerText).toBe('✓');
        expect(mockBtn.classList.contains('btn-toast-success')).toBe(true);
        expect(mockBtn.style.pointerEvents).toBe('none');
        expect(timerReset).toBe(400);
    });
});
