// test/version.test.ts
import { describe, it, expect } from 'bun:test';
import { getAppVersion, getBuildDate, getBuildHash, initVersionBadge } from '../dango/js/modules/version.js';

describe('Version & Build Metadata Module', () => {
    it('Provides valid app version string with fallback', () => {
        const ver = getAppVersion();
        expect(typeof ver).toBe('string');
        expect(ver.length).toBeGreaterThan(0);
    });

    it('Provides valid build date and build hash fallbacks', () => {
        expect(typeof getBuildDate()).toBe('string');
        expect(typeof getBuildHash()).toBe('string');
    });

    it('Executes initVersionBadge without throwing', () => {
        expect(() => initVersionBadge()).not.toThrow();
    });
});
