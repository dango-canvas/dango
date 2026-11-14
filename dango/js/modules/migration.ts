/**
 * modules/migration.ts
 *
 * [TEMPORARY / EASILY STRIPPABLE]
 * Temporary migration notice shown exclusively on the expiring dango.ink domain.
 * Once the domain officially expires and traffic ceases, or when the domain is reclaimed,
 * this entire module and its single caller in main.ts can be cleanly removed or toggled.
 */

import { showPersistentToast, dismissPersistentToast } from './ui.js';
import { getCurrentLang } from './i18n.js';

export const MIGRATION_STORAGE_KEY = 'dango_migration_read';
export const MIGRATION_TOAST_ID = 'domain-migration-notice';

export const MIGRATION_BLOG_URL_ZH = 'https://dango-canvas.github.io/blog/migrating-to-github-pages.html';
export const MIGRATION_BLOG_URL_EN = 'https://dango-canvas.github.io/blog/migrating-to-github-pages-en.html';

/**
 * Pure helper function to determine if the migration notice should be displayed.
 */
export function shouldShowMigrationNotice(
    hostname: string,
    hasRead: boolean,
    isEmbed: boolean = false
): boolean {
    if (hasRead) return false;
    if (isEmbed) return false; // Avoid obstructing compact embedded viewports (e.g. Notion/Obsidian)
    const normalized = (hostname || '').toLowerCase();
    return normalized === 'dango.ink' || normalized.endsWith('.dango.ink');
}

/**
 * Initializes the migration notice toast.
 */
export function initMigrationNotice(delayMs = 1200): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const hostname = window.location?.hostname || '';
    let hasRead = false;
    try {
        hasRead = localStorage.getItem(MIGRATION_STORAGE_KEY) === 'true';
    } catch {
        hasRead = false;
    }

    const isEmbed = typeof window.location?.search === 'string' &&
        new URLSearchParams(window.location.search).has('embed');

    if (!shouldShowMigrationNotice(hostname, hasRead, isEmbed)) {
        return;
    }

    setTimeout(() => {
        try {
            if (localStorage.getItem(MIGRATION_STORAGE_KEY) === 'true') return;
        } catch {}

        let isEn = false;
        try {
            isEn = getCurrentLang() === 'en';
        } catch {
            isEn = false;
        }

        const message = isEn
            ? '📢 dango.ink is expiring soon. Dango is moving to GitHub Pages. Remember to press Ctrl+S to export.'
            : '📢 域名 dango.ink 即将到期，应用将迁移至 GitHub Pages。请记得按 Ctrl+S 导出备份。';
        const btnText = isEn ? 'Migration Guide' : '迁移指引';
        const guideUrl = isEn ? MIGRATION_BLOG_URL_EN : MIGRATION_BLOG_URL_ZH;

        showPersistentToast(MIGRATION_TOAST_ID, message, [
            {
                text: btnText,
                className: 'btn-migration-guide',
                onClick: () => {
                    try {
                        localStorage.setItem(MIGRATION_STORAGE_KEY, 'true');
                    } catch {}
                    window.open(guideUrl, '_blank', 'noopener,noreferrer');
                    dismissPersistentToast(MIGRATION_TOAST_ID);
                }
            }
        ]);
    }, delayMs);
}
