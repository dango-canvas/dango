/**
 * modules/version.ts
 * 管理构建元信息与控制台徽标输出、界面版本展示
 */

declare const __APP_VERSION__: string | undefined;
declare const __BUILD_DATE__: string | undefined;
declare const __BUILD_HASH__: string | undefined;

export function getAppVersion(): string {
    return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
}

export function getBuildDate(): string {
    return typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'dev';
}

export function getBuildHash(): string {
    return typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'local';
}

export function initVersionDisplay(): void {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
    const versionEl = document.querySelector('.about-version');
    if (!versionEl) return;

    if (typeof __APP_VERSION__ !== 'undefined') {
        const dateStr = typeof __BUILD_DATE__ !== 'undefined' && __BUILD_DATE__ !== 'dev'
            ? ` (${__BUILD_DATE__})`
            : '';
        versionEl.textContent = `v${__APP_VERSION__}${dateStr}`;
    } else if (!versionEl.textContent?.trim()) {
        versionEl.textContent = `v${getAppVersion()} (dev)`;
    }
}

export function initVersionBadge(): void {
    const version = getAppVersion();
    const date = getBuildDate();
    const hash = getBuildHash();

    console.log(
        `%c🍡 Dango %cv${version} (${date} · ${hash})`,
        'font-size: 11px; font-weight: bold; color: #fff; background: #ea580c; border-radius: 3px 0 0 3px; padding: 2px 6px;',
        'font-size: 11px; color: #7c2d12; background: #ffedd5; border-radius: 0 3px 3px 0; padding: 2px 6px; font-weight: 500;'
    );

    initVersionDisplay();
}
