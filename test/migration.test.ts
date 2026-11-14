import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
    shouldShowMigrationNotice,
    MIGRATION_STORAGE_KEY,
    MIGRATION_TOAST_ID,
    MIGRATION_BLOG_URL_ZH,
    MIGRATION_BLOG_URL_EN
} from '../dango/js/modules/migration.js';

describe('Domain Migration Notice Module', () => {
    it('shows migration notice exclusively on dango.ink and its subdomains', () => {
        expect(shouldShowMigrationNotice('dango.ink', false, false)).toBe(true);
        expect(shouldShowMigrationNotice('app.dango.ink', false, false)).toBe(true);
        expect(shouldShowMigrationNotice('DANGO.INK', false, false)).toBe(true);
    });

    it('does NOT show notice on localhost, IP addresses, or GitHub Pages', () => {
        expect(shouldShowMigrationNotice('localhost', false, false)).toBe(false);
        expect(shouldShowMigrationNotice('127.0.0.1', false, false)).toBe(false);
        expect(shouldShowMigrationNotice('dango-canvas.github.io', false, false)).toBe(false);
        expect(shouldShowMigrationNotice('', false, false)).toBe(false);
    });

    it('does NOT show notice if user has already read the guide (hasRead = true)', () => {
        expect(shouldShowMigrationNotice('dango.ink', true, false)).toBe(false);
        expect(shouldShowMigrationNotice('app.dango.ink', true, false)).toBe(false);
    });

    it('does NOT show notice in embedded mode (isEmbed = true) to prevent obstructing compact viewports', () => {
        expect(shouldShowMigrationNotice('dango.ink', false, true)).toBe(false);
        expect(shouldShowMigrationNotice('app.dango.ink', false, true)).toBe(false);
    });

    it('exports valid constants and target URLs', () => {
        expect(MIGRATION_STORAGE_KEY).toBe('dango_migration_read');
        expect(MIGRATION_TOAST_ID).toBe('domain-migration-notice');
        expect(MIGRATION_BLOG_URL_ZH).toContain('migrating-to-github-pages.html');
        expect(MIGRATION_BLOG_URL_EN).toContain('migrating-to-github-pages-en.html');
    });
});
