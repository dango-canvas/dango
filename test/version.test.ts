import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getAppVersion, getBuildDate, getBuildHash, initVersionBadge, initVersionDisplay } from '../dango/js/modules/version.js';

describe('Version & Build Metadata Module', () => {
    let mockVersionEl: any;
    const origDocument = (globalThis as any).document;

    beforeEach(() => {
        mockVersionEl = { textContent: '' };
        (globalThis as any).document = {
            querySelector: (sel: string) => {
                if (sel === '.about-version') return mockVersionEl;
                return null;
            }
        };
    });

    afterEach(() => {
        (globalThis as any).document = origDocument;
    });

    it('Provides valid app version string with semantic format or dev fallback', () => {
        const ver = getAppVersion();
        expect(typeof ver).toBe('string');
        expect(ver).toMatch(/^(dev|\d+\.\d+\.\d+)/);
    });

    it('Provides valid build date and build hash fallbacks', () => {
        const date = getBuildDate();
        const hash = getBuildHash();
        expect(typeof date).toBe('string');
        expect(date.length).toBeGreaterThan(0);
        expect(typeof hash).toBe('string');
        expect(hash.length).toBeGreaterThan(0);
    });

    it('Executes initVersionBadge and populates about-version DOM element', () => {
        initVersionBadge();
        expect(mockVersionEl.textContent).toMatch(/^v(dev|\d+\.\d+\.\d+)/);
    });
});
