// test/safety_i18n.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { getTexts, toggleLang, getCurrentLang } from '../dango/js/modules/i18n.js';
import { state } from '../dango/js/modules/state.js';
import { updateFloatingDock } from '../dango/js/modules/dock.js';

describe('Safety Shield Multi-Language Link & Tooltip Localization', () => {
    it('provides correct Chinese safety blog url and tooltip', () => {
        if (getCurrentLang() !== 'zh') toggleLang();
        const texts = getTexts();
        expect(texts.safety_url).toBe('https://blog.dango.ink/why-dango-is-secure');
        expect(texts.safety_tooltip).toBe('为什么 Dango 是安全的？');
    });

    it('provides correct English safety blog url and tooltip upon language toggle', () => {
        toggleLang(); // switch to en
        expect(getCurrentLang()).toBe('en');
        const texts = getTexts();
        expect(texts.safety_url).toBe('https://blog.dango.ink/why-dango-is-secure-en');
        expect(texts.safety_tooltip).toBe('Why is Dango secure?');

        // Restore back to zh
        toggleLang();
        expect(getCurrentLang()).toBe('zh');
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

        state.selection.clear();
        updateFloatingDock(true);
        expect(mockBody.classList.contains('has-selection')).toBe(false);

        state.selection.add('node-1');
        state.selection.add('node-2');
        updateFloatingDock(true);
        expect(mockBody.classList.contains('has-selection')).toBe(true);

        state.selection.clear();
        updateFloatingDock(true);
        expect(mockBody.classList.contains('has-selection')).toBe(false);
    });
});
