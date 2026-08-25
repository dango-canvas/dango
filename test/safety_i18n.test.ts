// test/safety_i18n.test.ts
import { describe, it, expect } from 'bun:test';
import { getTexts, toggleLang, getCurrentLang } from '../dango/js/modules/i18n.js';

describe('Safety Shield Multi-Language Link & Tooltip Localization', () => {
    it('provides correct Chinese safety blog url and tooltip', () => {
        if (getCurrentLang() !== 'zh') toggleLang();
        const texts = getTexts();
        expect(texts.safety_url).toBe('https://blog.dango.ink/why-dango-is-secure');
        expect(texts.safety_tooltip).toBe('为什么 Dango 安全可靠？');
    });

    it('provides correct English safety blog url and tooltip upon language toggle', () => {
        toggleLang(); // switch to en
        expect(getCurrentLang()).toBe('en');
        const texts = getTexts();
        expect(texts.safety_url).toBe('https://blog.dango.ink/why-dango-is-secure-en');
        expect(texts.safety_tooltip).toBe('Why is Dango secure and private?');

        // Restore back to zh
        toggleLang();
        expect(getCurrentLang()).toBe('zh');
    });
});
