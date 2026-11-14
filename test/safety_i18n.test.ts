// test/safety_i18n.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { getTexts, toggleLang, getCurrentLang } from '../dango/js/modules/i18n.js';
import { state } from '../dango/js/modules/state.js';
import { updateFloatingDock } from '../dango/js/modules/dock.js';

describe('Safety Shield Multi-Language Link & Tooltip Localization', () => {
    it('provides correct Chinese safety blog url and tooltip', () => {
        if (getCurrentLang() !== 'zh') toggleLang();
        const texts = getTexts();
        expect(texts.safety_url).toBe('https://dango-canvas.github.io/blog/why-dango-is-secure.html');
        expect(texts.safety_tooltip).toBe('为什么 Dango 是安全的？');
    });

    it('provides correct English safety blog url and tooltip upon language toggle', () => {
        toggleLang(); // switch to en
        expect(getCurrentLang()).toBe('en');
        const texts = getTexts();
        expect(texts.safety_url).toBe('https://dango-canvas.github.io/blog/why-dango-is-secure-en.html');
        expect(texts.safety_tooltip).toBe('Why is Dango secure?');

        // Restore back to zh
        toggleLang();
        expect(getCurrentLang()).toBe('zh');
    });

    it('provides correct Chinese and English privacy and terms URLs and updates data-i18n-href DOM anchors', () => {
        const { updateI18n } = require('../dango/js/modules/i18n.js');
        const { readFileSync } = require('fs');
        const { resolve } = require('path');

        // Check index.html markup
        const html = readFileSync(resolve(__dirname, '../dango/index.html'), 'utf-8');
        expect(html).toContain('id="link-privacy"');
        expect(html).toContain('id="link-terms"');
        expect(html).toContain('data-i18n-href="privacy_url"');
        expect(html).toContain('data-i18n-href="terms_url"');
        expect(html).not.toContain('<a href="#" target="_blank" rel="noopener noreferrer" class="about-link-item"');

        // Test Chinese URLs
        if (getCurrentLang() !== 'zh') toggleLang();
        const zh = getTexts();
        expect(zh.privacy_url).toBe('https://dango-canvas.github.io/blog/privacy.html');
        expect(zh.terms_url).toBe('https://dango-canvas.github.io/blog/terms.html');

        // Mock anchor DOM for updateI18n
        const mockAnchors: any[] = [
            { getAttribute: (attr: string) => attr === 'data-i18n-href' ? 'privacy_url' : null, href: '' },
            { getAttribute: (attr: string) => attr === 'data-i18n-href' ? 'terms_url' : null, href: '' }
        ];
        (globalThis as any).document = {
            title: '',
            querySelectorAll: (sel: string) => {
                if (sel === '[data-i18n-href]') return mockAnchors;
                return [];
            },
            querySelector: () => null,
            getElementById: () => null
        };

        updateI18n();
        expect(mockAnchors[0].href).toBe('https://dango-canvas.github.io/blog/privacy.html');
        expect(mockAnchors[1].href).toBe('https://dango-canvas.github.io/blog/terms.html');

        // Test English URLs
        toggleLang();
        expect(getCurrentLang()).toBe('en');
        const en = getTexts();
        expect(en.privacy_url).toBe('https://dango-canvas.github.io/blog/privacy-en.html');
        expect(en.terms_url).toBe('https://dango-canvas.github.io/blog/terms-en.html');

        updateI18n();
        expect(mockAnchors[0].href).toBe('https://dango-canvas.github.io/blog/privacy-en.html');
        expect(mockAnchors[1].href).toBe('https://dango-canvas.github.io/blog/terms-en.html');

        toggleLang(); // restore zh
    });

    it('synchronizes body.has-selection on dock state updates for mobile safety shield avoidance', () => {
        const classes = new Set<string>();
        const mockBody = {
            classList: {
                contains: (c: string) => classes.has(c),
                add: (c: string) => classes.add(c),
                remove: (c: string) => classes.delete(c)
            }
        };
        const mockDockContainer = { id: 'dango-dock-container', classList: { add: () => {}, remove: () => {} } };
        const mockDockEl = { id: 'dango-dock', innerHTML: '' };

        (globalThis as any).document = {
            body: mockBody,
            getElementById: (id: string) => {
                if (id === 'dango-dock-container') return mockDockContainer;
                if (id === 'dango-dock') return mockDockEl;
                return null;
            },
            querySelectorAll: () => []
        };

        state.isEmbed = false;
        state.settings.hideToolbar = false;

        // 0 nodes: no avoidance
        state.selection.clear();
        updateFloatingDock(true);
        expect(mockBody.classList.contains('has-selection')).toBe(false);

        // 1 node: compact single dock, no shield avoidance needed
        state.selection.add('node-1');
        updateFloatingDock(true);
        expect(mockBody.classList.contains('has-selection')).toBe(false);

        // 2+ nodes: wide multi-node dock, trigger shield avoidance
        state.selection.add('node-2');
        updateFloatingDock(true);
        expect(mockBody.classList.contains('has-selection')).toBe(true);

        // Back to 1 node: restore shield
        state.selection.delete('node-2');
        updateFloatingDock(true);
        expect(mockBody.classList.contains('has-selection')).toBe(false);

        // Back to 0 nodes: restore shield
        state.selection.clear();
        updateFloatingDock(true);
        expect(mockBody.classList.contains('has-selection')).toBe(false);
    });
});
