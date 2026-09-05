import { getTexts, toggleLang, updateI18n } from './i18n.js';
import { downloadBlob, getTimestamp } from './utils.js';
import { processDangoFile } from './io.js';
import { els, setSafeSVG } from './dom.js';
import { updateFloatingDock, toggleFloatingDock } from './dock.js';
import type { CanvasState } from './types.js';

// --- 模块内部变量 ---
let appState: CanvasState;
let callbacks: any;
let currentHelpPage = 0;
let lastHelpWheelAt = 0;
let resetAboutEasterEgg: (() => void) | null = null;
let hasBoundBackgroundLifecycle = false;

const BACKGROUND_WAIT_TIMEOUT_MS = 1800;

const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';

// --- 主题切换 ---
function updateTheme(themeBtn: HTMLElement | null): void {
    if (!themeBtn) return;
    const isDark = appState.theme === 'dark';
    if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    setSafeSVG(themeBtn, isDark ? ICON_SUN : ICON_MOON);
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cc-theme', appState.theme);
    }
    
    // 主题切换后刷新背景遮罩
    applySettings();
}

// --- 关于弹窗 ---
function closeAbout(aboutOverlay: HTMLElement): void {
    aboutOverlay.classList.remove('show');
    if (typeof resetAboutEasterEgg === 'function') resetAboutEasterEgg();
}

function getHelpPages(): HTMLElement[] {
    return els.helpModal ? Array.from(els.helpModal.querySelectorAll<HTMLElement>('.help-page')) : [];
}

function getHelpPageDots(): HTMLElement[] {
    return els.helpModal ? Array.from(els.helpModal.querySelectorAll<HTMLElement>('.help-page-dot')) : [];
}

function syncHelpPageHeight(): void {
    if (!els.helpModal) return;
    const pagesContainer = els.helpModal.querySelector<HTMLElement>('.help-pages');
    const pages = getHelpPages();
    if (!pagesContainer || pages.length === 0) return;

    const maxHeight = pages.reduce((height, page) => Math.max(height, page.scrollHeight), 0);
    if (maxHeight > 0) {
        pagesContainer.style.height = `${maxHeight}px`;
    }
}

function setHelpPage(pageIndex: number): void {
    if (!els.helpModal) return;
    const pages = getHelpPages();
    const dots = getHelpPageDots();
    const clampedIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
    currentHelpPage = clampedIndex;
    pages.forEach((page, index) => page.classList.toggle('active', index === clampedIndex));
    dots.forEach((dot, index) => dot.classList.toggle('active', index === clampedIndex));
}

function resetHelpPage(): void {
    setHelpPage(0);
}

function normalizeBgUrl(bgUrl?: string): string {
    return (bgUrl || '').trim();
}

function hasLoadedWallpaper(): boolean {
    const image = els.bgWallpaperImage;
    return Boolean(image && image.complete && image.naturalWidth > 0);
}

function setWallpaperVisible(isVisible: boolean): void {
    if (!els.bgWallpaperLayer) return;
    els.bgWallpaperLayer.classList.toggle('visible', isVisible);
}

function updateBackgroundMask(hasWallpaper: boolean): void {
    const mask = els.bgWallpaperMask;
    if (!mask) return;

    if (hasWallpaper) {
        const isDark = appState?.theme === 'dark';
        mask.style.backgroundColor = isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(127, 127, 127, 0.2)';
    } else {
        mask.style.backgroundColor = '';
    }
}

function getCurrentBackgroundUrl(currentState: CanvasState = appState): string {
    return normalizeBgUrl(currentState?.settings?.bgUrl);
}

function waitForWallpaperReady(timeoutMs = BACKGROUND_WAIT_TIMEOUT_MS): Promise<boolean> {
    const image = els.bgWallpaperImage;
    const targetUrl = image?.dataset.bgUrl || '';

    if (!image || !targetUrl) {
        setWallpaperVisible(false);
        return Promise.resolve(false);
    }

    if (hasLoadedWallpaper()) {
        setWallpaperVisible(true);
        return Promise.resolve(true);
    }

    return new Promise(resolve => {
        let done = false;
        let timerId = 0;

        const cleanup = () => {
            image.removeEventListener('load', handleLoad);
            image.removeEventListener('error', handleError);
            if (timerId) window.clearTimeout(timerId);
        };

        const finish = (loaded: boolean) => {
            if (done) return;
            done = true;
            cleanup();
            setWallpaperVisible(loaded);
            resolve(loaded);
        };

        const handleLoad = () => finish(true);
        const handleError = () => finish(false);

        image.addEventListener('load', handleLoad);
        image.addEventListener('error', handleError);

        if (timeoutMs > 0) {
            timerId = window.setTimeout(() => finish(false), timeoutMs);
        }
    });
}

function revealBodyAfterWallpaper(timeoutMs = BACKGROUND_WAIT_TIMEOUT_MS): Promise<boolean> {
    if (!getCurrentBackgroundUrl()) {
        document.body.classList.remove('cloak');
        return Promise.resolve(false);
    }

    document.body.classList.add('cloak');
    return waitForWallpaperReady(timeoutMs).then((loaded) => new Promise(resolve => {
        requestAnimationFrame(() => {
            document.body.classList.remove('cloak');
            resolve(loaded);
        });
    }));
}

function bindBackgroundLifecycle(): void {
    if (hasBoundBackgroundLifecycle) return;
    hasBoundBackgroundLifecycle = true;

    if (els.bgWallpaperImage) {
        els.bgWallpaperImage.addEventListener('load', () => setWallpaperVisible(true));
        els.bgWallpaperImage.addEventListener('error', () => setWallpaperVisible(false));
    }

    document.addEventListener('visibilitychange', () => {
        if (!getCurrentBackgroundUrl()) return;

        if (document.visibilityState === 'hidden') {
            document.body.classList.add('cloak');
            return;
        }

        void revealBodyAfterWallpaper(1200);
    });

    window.addEventListener('pageshow', (event) => {
        if (!getCurrentBackgroundUrl()) return;

        if (!event.persisted) {
            setWallpaperVisible(hasLoadedWallpaper());
            return;
        }

        void revealBodyAfterWallpaper(1200);
    });
}

export function waitForInitialBackground(): Promise<boolean> {
    return waitForWallpaperReady();
}

export function applyBackgroundImage(bgUrl: string): void {
    const normalizedBgUrl = normalizeBgUrl(bgUrl);
    const image = els.bgWallpaperImage;

    updateBackgroundMask(Boolean(normalizedBgUrl));

    if (!image) return;

    if (!normalizedBgUrl) {
        delete image.dataset.bgUrl;
        image.removeAttribute('src');
        setWallpaperVisible(false);
        return;
    }

    if (image.dataset.bgUrl === normalizedBgUrl) {
        setWallpaperVisible(hasLoadedWallpaper());
        return;
    }

    image.crossOrigin = 'anonymous';
    image.dataset.bgUrl = normalizedBgUrl;
    setWallpaperVisible(false);
    image.src = normalizedBgUrl;
}

export function isBgUnlocked(currentState?: CanvasState): boolean {
    if (typeof localStorage === 'undefined') return false;
    const s = currentState || appState;
    return localStorage.getItem('cc-bg-unlocked') === 'true' || Boolean(s?.settings?.bgUrl);
}

export function isToolbarUnlocked(currentState?: CanvasState): boolean {
    if (typeof localStorage === 'undefined') return false;
    const s = currentState || appState;
    return localStorage.getItem('cc-bg-unlocked') === 'true' || Boolean(s?.settings?.hideToolbar);
}

// --- 设置 ---
export function applySettings(currentState?: CanvasState): void {
    const s = currentState || appState; 
    if (!s) return;

    if (typeof document !== 'undefined') {
        const checkHideToolbarEl = document.getElementById('check-hide-toolbar') as HTMLInputElement | null;
        if (checkHideToolbarEl) checkHideToolbarEl.checked = s.settings.hideToolbar === true;
        const hideGridEl = document.getElementById('check-hide-grid') as HTMLInputElement | null;
        if (hideGridEl) hideGridEl.checked = s.settings.hideGrid;
        const altAsCtrlEl = document.getElementById('check-alt-as-ctrl') as HTMLInputElement | null;
        if (altAsCtrlEl) altAsCtrlEl.checked = s.settings.altAsCtrl;
        const handDrawnEl = document.getElementById('check-hand-drawn') as HTMLInputElement | null;
        if (handDrawnEl) handDrawnEl.checked = s.settings.handDrawn;

        const isUnlocked = isBgUnlocked(s);
        const settingsBgItem = document.getElementById('settings-bg-item');
        if (settingsBgItem) {
            settingsBgItem.classList.toggle('hidden', !isUnlocked);
        }

        const toolbarUnlocked = isToolbarUnlocked(s);
        const settingsHideToolbarItem = document.getElementById('settings-hide-toolbar-item');
        if (settingsHideToolbarItem) {
            settingsHideToolbarItem.classList.toggle('hidden', !toolbarUnlocked);
        }
        
        const bgUrlInput = document.getElementById('input-bg-url') as HTMLInputElement | null;
        if (bgUrlInput) {
            bgUrlInput.value = s.settings.bgUrl || '';
        }

        if (document.body) {
            document.body.classList.toggle('hide-grid', s.settings.hideGrid);
        }

        const dockContainer = document.getElementById('dango-dock-container');
        if (dockContainer) {
            dockContainer.classList.toggle('hidden-dock', s.settings.hideToolbar === true);
        }
    }
    
    applyHandDrawnStyle(s);

    const finalBgUrl = normalizeBgUrl(s.settings.bgUrl);
    applyBackgroundImage(finalBgUrl);
}

// --- 手写风格 ---
function loadHandDrawnFonts(): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById('hand-drawn-fonts')) return;
    const link = document.createElement('link');
    link.id = 'hand-drawn-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=LXGW+WenKai+Mono+TC&display=swap';
    document.head.appendChild(link);
}

export function applyHandDrawnStyle(currentState?: CanvasState): void {
    const s = currentState || appState;
    if (!s || typeof document === 'undefined' || !document.body) return;
    if (s.settings.handDrawn) {
        loadHandDrawnFonts();
        document.body.classList.add('hand-drawn-style');
    } else {
        document.body.classList.remove('hand-drawn-style');
    }
}

// --- 节日 Logo ---
export function getSeasonalEmoji(dateObj: Date = new Date()): string {
    const month = dateObj.getMonth() + 1;
    const date = dateObj.getDate();

    // 1月: 元旦 (1.1-1.3)
    if (month === 1 && date <= 3) return "🎉";
    // 2月: 春节 (2.5-2.12), 情人节 (2.14), 元宵节 (2.19-2.21)
    if (month === 2) {
        if (date >= 5 && date <= 12) return "🧧";
        if (date === 14) return "💖";
        if (date >= 19 && date <= 21) return "🏮";
    }
    // 3月: 植树日 (3.12), 白色情人节/Pi Day (3.14)
    if (month === 3) {
        if (date === 12) return "🌱";
        if (date === 14) return "🥧";
    }
    // 4月: 愚人节 (4.1), 世界地球日 (4.22)
    if (month === 4) {
        if (date === 1) return "🤡";
        if (date === 22) return "🌱";
    }
    // 6月: 儿童节 (6.1), 端午节 (6.18-6.20)
    if (month === 6) {
        if (date === 1) return "🎈";
        if (date >= 18 && date <= 20) return "🛶";
    }
    // 8月: 七夕节 (8.18-8.20)
    if (month === 8 && date >= 18 && date <= 20) return "🌌";
    // 9月: 中秋节 (9.24-9.26)
    if (month === 9 && date >= 24 && date <= 26) return "🥮";
    // 10月: 万圣节 (10.28-10.31)
    if (month === 10 && date >= 28) return "🎃";
    // 11月: 感恩节 (11.25-11.27)
    if (month === 11 && date >= 25 && date <= 27) return "🦃";
    // 12月: 圣诞季 (12.23-12.26), 跨年 (12.31)
    if (month === 12) {
        if (date >= 23 && date <= 26) return "🎄";
        if (date === 31) return "🎉";
    }

    return "✨";
}

function updateSeasonalLogo(): void {
    const logoBox = document.getElementById('ui-logo-box');
    if (!logoBox) return;
    logoBox.innerText = getSeasonalEmoji();
}

function createDangoConfettiBurst(originX: number, originY: number): void {
    const layer = document.createElement('div');
    layer.className = 'dango-confetti-layer';
    document.body.appendChild(layer);

    const colors = ['#ff9eaa', '#ffffff', '#88d8b0'];
    const pieceCount = 42;
    let remainingPieces = pieceCount;

    const removeLayerIfEmpty = () => {
        remainingPieces--;
        if (remainingPieces <= 0) layer.remove();
    };

    for (let index = 0; index < pieceCount; index++) {
        const piece = document.createElement('span');
        const isDot = Math.random() < 0.45;
        const angle = Math.random() * Math.PI * 2;
        const burstDistance = 45 + Math.random() * 120;
        const burstX = Math.cos(angle) * burstDistance;
        const burstY = Math.sin(angle) * burstDistance - 24;
        const landX = burstX + (Math.random() - 0.5) * 110;
        const landY = burstY + 150 + Math.random() * 190;
        const duration = 1200 + Math.random() * 650;
        const delay = Math.random() * 80;
        const size = 5 + Math.random() * 5;
        const color = colors[index % colors.length];

        piece.className = `dango-confetti-piece ${isDot ? 'is-dot' : 'is-strip'}`;
        piece.style.left = `${originX}px`;
        piece.style.top = `${originY}px`;
        piece.style.width = `${size}px`;
        piece.style.height = isDot ? `${size}px` : `${size * (1.6 + Math.random() * 0.9)}px`;
        piece.style.backgroundColor = color;
        piece.style.borderColor = color === '#ffffff' ? 'rgba(51, 65, 85, 0.18)' : 'transparent';
        piece.style.animationDuration = `${duration}ms`;
        piece.style.animationDelay = `${delay}ms`;
        piece.style.setProperty('--burst-x', `${burstX}px`);
        piece.style.setProperty('--burst-y', `${burstY}px`);
        piece.style.setProperty('--land-x', `${landX}px`);
        piece.style.setProperty('--land-y', `${landY}px`);
        piece.style.setProperty('--spin-start', `${Math.random() * 240 - 120}deg`);
        piece.style.setProperty('--spin-end', `${Math.random() * 980 - 490}deg`);
        piece.style.setProperty('--tilt-start', `${Math.random() * 180 - 90}deg`);
        piece.style.setProperty('--tilt-end', `${Math.random() * 720 - 360}deg`);
        piece.style.setProperty('--flip-end', `${Math.random() * 720 - 360}deg`);

        let didRemove = false;
        const removePiece = () => {
            if (didRemove) return;
            didRemove = true;
            piece.remove();
            removeLayerIfEmpty();
        };

        piece.addEventListener('animationend', removePiece, { once: true });
        setTimeout(removePiece, duration + delay + 250);
        layer.appendChild(piece);
    }
}

function initEasterEggs(): void {
    let logoClickCount = 0;
    let logoComboCount = 0;
    let logoClickTimer: any = null;
    const logoBox = document.getElementById('ui-logo-box');
    if (logoBox) {
        logoBox.onclick = () => {
            logoClickCount++;
            clearTimeout(logoClickTimer);
            if (logoClickCount >= 5) {
                logoClickCount = 0;
                logoComboCount++;
                const comboSuffix = logoComboCount > 1 ? ` x${logoComboCount}` : '';
                showToast(`${getTexts().toast_easter_dango}${comboSuffix}`);
                logoBox.classList.remove('easter-pop');
                void logoBox.offsetWidth;
                logoBox.classList.add('easter-pop');
                setTimeout(() => { logoBox.classList.remove('easter-pop'); }, 500);
            }
            logoClickTimer = setTimeout(() => {
                logoClickCount = 0;
                logoComboCount = 0;
            }, 1000);
        };
    }

    let aboutClickCount = 0;
    let aboutClickTimer: any = null;
    const aboutLogo = document.querySelector<HTMLElement>('#about-card .dango-easter-egg');
    const resetAboutClicks = () => {
        aboutClickCount = 0;
        clearTimeout(aboutClickTimer);
    };
    resetAboutEasterEgg = resetAboutClicks;
    if (aboutLogo) {
        aboutLogo.addEventListener('click', (e: MouseEvent) => {
            aboutClickCount++;
            clearTimeout(aboutClickTimer);
            if (aboutClickCount >= 5) {
                aboutClickCount = 0;
                createDangoConfettiBurst(e.clientX, e.clientY);
            }
            aboutClickTimer = setTimeout(resetAboutClicks, 800);
        });
    }

    const starBtns = document.querySelectorAll<HTMLElement>('.btn-star');
    starBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('cc-bg-unlocked', 'true');
            }
            const settingsBgItem = document.getElementById('settings-bg-item');
            if (settingsBgItem) settingsBgItem.classList.remove('hidden');
            const settingsHideToolbarItem = document.getElementById('settings-hide-toolbar-item');
            if (settingsHideToolbarItem) settingsHideToolbarItem.classList.remove('hidden');

            const span = btn.querySelector('span');
            if (span) {
                const texts = getTexts();
                span.innerText = texts.star_thanks;
            }
        });
    });
}

// --- 手动复制弹窗 (针对沙盒环境) ---
function showManualCopyModal(url: string): void {
    const texts = getTexts();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.style.zIndex = '4000';
    
    const card = document.createElement('div');
    card.className = 'about-card';
    card.style.maxWidth = '400px';
    card.style.padding = '24px';
    card.style.textAlign = 'center';
    
    const title = document.createElement('h3');
    title.innerText = texts.modal_copy_title;
    title.style.marginTop = '0';
    title.style.color = 'var(--ui-text)';
    
    const desc = document.createElement('p');
    desc.innerText = texts.modal_copy_desc;
    desc.style.fontSize = '14px';
    desc.style.lineHeight = '1.6';
    desc.style.color = 'var(--ui-text-dim)';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = url;
    input.readOnly = true;
    input.style.width = '100%';
    input.style.padding = '12px';
    input.style.marginTop = '20px';
    input.style.border = 'none';
    input.style.borderRadius = '8px';
    input.style.background = 'var(--ui-hover-bg)';
    input.style.color = 'var(--ui-text)';
    input.style.outline = 'none';
    input.style.textAlign = 'center';
    input.style.fontSize = '13px';
    input.style.fontFamily = 'monospace';
    
    const btnClose = document.createElement('button');
    btnClose.innerText = texts.modal_copy_btn;
    btnClose.style.marginTop = '24px';
    btnClose.style.padding = '10px 32px';
    btnClose.style.borderRadius = '8px';
    btnClose.style.border = 'none';
    btnClose.style.background = 'var(--c-white-bg)';
    btnClose.style.color = 'var(--c-white-text)';
    btnClose.style.boxShadow = 'var(--node-shadow)';
    btnClose.style.fontSize = '14px';
    btnClose.style.fontWeight = '500';
    btnClose.style.cursor = 'pointer';
    btnClose.style.transition = 'opacity 0.2s ease';
    btnClose.onmouseover = () => btnClose.style.opacity = '0.8';
    btnClose.onmouseout = () => btnClose.style.opacity = '1';
    btnClose.onclick = () => {
        overlay.remove();
        showToast(getTexts().toast_manual_copy_done);
    };

    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(input);
    card.appendChild(btnClose);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    setTimeout(() => {
        input.focus();
        input.select();
    }, 100);

    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

// --- Toast 通知 ---
export interface ToastActionButton {
    text: string;
    onClick: () => void;
    className?: string;
    title?: string;
    popoverHtml?: string;
}

interface ToastQueueItem {
    message: string;
    safetySnapshot: any;
}

const toastQueue: ToastQueueItem[] = [];
let activeToasts = 0;
const MAX_VISIBLE_TOASTS = 3;

function renderToastActions(actionsEl: HTMLElement, actions: ToastActionButton[]): void {
    actionsEl.innerHTML = '';
    actions.forEach(act => {
        const btn = document.createElement('button');
        btn.className = act.className ? `btn-toast ${act.className}` : 'btn-toast';
        btn.innerText = act.text;
        if (act.title) btn.title = act.title;

        if (act.popoverHtml) {
            const wrap = document.createElement('div');
            wrap.className = 'toast-help-wrap';
            
            const popover = document.createElement('div');
            popover.className = 'toast-popover';
            popover.innerHTML = act.popoverHtml;

            let hideTimer: any = null;
            const showPop = () => {
                clearTimeout(hideTimer);
                popover.classList.add('show');
                btn.classList.add('active');
            };
            const hidePop = () => {
                hideTimer = setTimeout(() => {
                    popover.classList.remove('show');
                    btn.classList.remove('active');
                }, 220);
            };

            btn.onmouseenter = showPop;
            btn.onmouseleave = hidePop;
            popover.onmouseenter = showPop;
            popover.onmouseleave = hidePop;

            btn.onclick = (e) => {
                e.stopPropagation();
                if (popover.classList.contains('show')) {
                    popover.classList.remove('show');
                    btn.classList.remove('active');
                } else {
                    showPop();
                }
                act.onClick();
            };

            wrap.appendChild(btn);
            wrap.appendChild(popover);
            actionsEl.appendChild(wrap);
        } else {
            btn.onclick = (e) => {
                e.stopPropagation();
                act.onClick();
            };
            actionsEl.appendChild(btn);
        }
    });
}

export function showToast(message: string, safetySnapshot: any = null): void {
    if (typeof document === 'undefined') return;
    toastQueue.push({ message, safetySnapshot });
    processToastQueue();
}

export function showPersistentToast(id: string, message: string, actions: ToastActionButton[] = []): void {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('toast-container');
    if (!container) return;

    let existing = container.querySelector<HTMLElement>(`.toast[data-toast-id="${id}"]`);
    if (existing) {
        if (existing.dataset.dismissing === 'true') {
            if ((existing as any)._dismissTimer) {
                clearTimeout((existing as any)._dismissTimer);
                delete (existing as any)._dismissTimer;
            }
            delete existing.dataset.dismissing;
            existing.classList.add('show');
        }
        const textNode = existing.querySelector<HTMLElement>('.toast-title-wrap');
        if (textNode) {
            textNode.innerHTML = message;
        }
        let actionsEl = existing.querySelector<HTMLElement>('.toast-actions');
        if (actions.length > 0) {
            if (!actionsEl) {
                actionsEl = document.createElement('div');
                actionsEl.className = 'toast-actions';
                existing.appendChild(actionsEl);
            }
            renderToastActions(actionsEl, actions);
        } else if (actionsEl) {
            actionsEl.remove();
        }
        return;
    }

    const toast = document.createElement('div');
    toast.className = 'toast persistent-toast';
    toast.dataset.toastId = id;
    
    const textNode = document.createElement('span');
    textNode.className = 'toast-title-wrap';
    textNode.innerHTML = message;
    toast.appendChild(textNode);

    if (actions.length > 0) {
        const actionsEl = document.createElement('div');
        actionsEl.className = 'toast-actions';
        renderToastActions(actionsEl, actions);
        toast.appendChild(actionsEl);
    }

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
}

export function dismissPersistentToast(id: string): void {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = container.querySelector<HTMLElement>(`.toast[data-toast-id="${id}"]`);
    if (toast) {
        if (document.body.classList.contains('mode-presenting') || document.body.classList.contains('view-animating')) {
            if ((toast as any)._dismissTimer) clearTimeout((toast as any)._dismissTimer);
            toast.remove();
            return;
        }
        toast.classList.remove('show');
        toast.dataset.dismissing = 'true';
        if ((toast as any)._dismissTimer) {
            clearTimeout((toast as any)._dismissTimer);
        }
        (toast as any)._dismissTimer = setTimeout(() => {
            toast.remove();
        }, 400);
    }
}

function processToastQueue(): void {
    if (activeToasts >= MAX_VISIBLE_TOASTS || toastQueue.length === 0) return;

    const item = toastQueue.shift();
    if (!item) return;
    const { message, safetySnapshot } = item;
    activeToasts++;

    const texts = getTexts();
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    const textNode = document.createElement('span');
    textNode.innerText = message;
    toast.appendChild(textNode);

    const removeToast = () => {
        if (toast.parentNode) {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                    activeToasts--;
                    processToastQueue();
                }
            }, 400);
        }
    };

    if (safetySnapshot) {
        const actions = document.createElement('div');
        actions.className = 'toast-actions';
        const btnUndo = document.createElement('button');
        btnUndo.className = 'btn-toast';
        btnUndo.innerText = texts.toast_undo;
        btnUndo.onclick = () => { 
            callbacks.undo(); 
            removeToast();
        };
        const btnExport = document.createElement('button');
        btnExport.className = 'btn-toast';
        btnExport.innerText = texts.toast_export_prev;
        btnExport.onclick = () => {
            const data = JSON.stringify(safetySnapshot, null, 2);
            downloadBlob(data, `safety-backup_${getTimestamp()}.dango`, 'application/json');
            removeToast();
        };
        actions.appendChild(btnUndo);
        actions.appendChild(btnExport);
        toast.appendChild(actions);
    }

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);

    const delay = safetySnapshot ? 6000 : 3000;
    setTimeout(removeToast, delay);
}

// --- 统一初始化函数 ---
export function initUI(_state: CanvasState, _callbacks: any): void {
    appState = _state;
    callbacks = _callbacks;
    bindBackgroundLifecycle();

    // 1. 关于弹窗
    const aboutOverlay = document.getElementById('about-overlay') as HTMLElement;
    const btnSettings = document.getElementById('btn-settings') as HTMLElement;
    const modalSettings = document.getElementById('settings-modal') as HTMLElement;
    const btnTriggerAbout = document.getElementById('trigger-about') as HTMLElement;
    const btnCloseAbout = document.getElementById('btn-close-about') as HTMLElement;
    const syncFloatingPanelState = () => {
        const isAnyOpen = els.helpModal?.classList.contains('show') || modalSettings.classList.contains('show');
        if (els.uiLayer) {
            els.uiLayer.classList.toggle('mobile-active', isAnyOpen);
        }
    };
    const closeFloatingPanels = () => {
        els.helpModal?.classList.remove('show');
        els.btnHelp?.classList.remove('active');
        modalSettings.classList.remove('show');
        btnSettings.classList.remove('active');
        els.btnHelp?.blur();
        btnSettings.blur();
        syncFloatingPanelState();
    };
    if (btnTriggerAbout) {
        btnTriggerAbout.onclick = (e) => {
            e.stopPropagation();
            closeFloatingPanels();
            btnTriggerAbout.blur();
            aboutOverlay.classList.add('show');
        };
    }
    if (btnCloseAbout) {
        btnCloseAbout.onclick = () => closeAbout(aboutOverlay);
    }
    if (aboutOverlay) {
        aboutOverlay.onclick = (e) => { if (e.target === aboutOverlay) closeAbout(aboutOverlay); };
    }
    
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.code === 'Escape') {
            if (aboutOverlay?.classList.contains('show')) {
                closeAbout(aboutOverlay);
                e.stopPropagation(); 
            } else if (els.helpModal?.classList.contains('show') || modalSettings.classList.contains('show')) {
                closeFloatingPanels();
                e.stopPropagation();
            }
        }
    });

    // 2. 主题切换
    const themeBtn = document.getElementById('btn-theme') as HTMLElement | null;
    appState.theme = (localStorage.getItem('cc-theme') as any) || 'light';
    if ((appState.theme as string) === 'auto') appState.theme = 'light';
    updateTheme(themeBtn);
    if (themeBtn) {
        themeBtn.onclick = (e: MouseEvent) => {
            appState.theme = appState.theme === 'light' ? 'dark' : 'light';
            updateTheme(themeBtn);
            callbacks.render();
            (e.currentTarget as HTMLElement).blur();
        };
    }

    // 2.2 嵌入模式：处理打开完整页面的逻辑
    const btnOpenFull = document.getElementById('btn-open-full') as HTMLAnchorElement | null;
    if (btnOpenFull) {
        btnOpenFull.onclick = (e: MouseEvent) => {
            e.preventDefault();
            const url = btnOpenFull.href;
            
            try {
                const newWindow = window.open(url, '_blank');
                if (newWindow && !newWindow.closed && typeof newWindow.closed !== 'undefined') {
                    newWindow.opener = null;
                    return;
                }
            } catch (err) {
                console.warn("window.open blocked:", err);
            }

            showManualCopyModal(url);
        };
    }

    // 2.5 添加按钮
    const btnAdd = document.getElementById('btn-add');
    if (btnAdd && callbacks.createNodesFromInput) {
        btnAdd.onclick = (e) => {
            e.stopPropagation();
            callbacks.createNodesFromInput();
        };
    }
    if (els.input && callbacks.createNodesFromInput) {
        els.input.addEventListener('keydown', (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                callbacks.createNodesFromInput();
            }
        });
    }

    // 3. 设置面板
    if (btnSettings && modalSettings) {
        btnSettings.onclick = (e) => {
            e.stopPropagation();
            const isShowing = modalSettings.classList.toggle('show');
            btnSettings.classList.toggle('active', isShowing);
            if (isShowing && els.helpModal && els.btnHelp) {
                els.helpModal.classList.remove('show');
                els.btnHelp.classList.remove('active');
            }
            syncFloatingPanelState();
        };
    }
    const helpPageDots = getHelpPageDots();
    helpPageDots.forEach(dot => {
        dot.onclick = (e) => {
            e.stopPropagation();
            const pageIndex = Number(dot.dataset.helpPageTarget || '0');
            setHelpPage(pageIndex);
        };
    });
    if (els.helpModal) {
        els.helpModal.addEventListener('wheel', (e: WheelEvent) => {
            if (!els.helpModal!.classList.contains('show')) return;
            const now = Date.now();
            if (now - lastHelpWheelAt < 180) {
                e.preventDefault();
                return;
            }
            if (Math.abs(e.deltaY) < 4) return;

            const pages = getHelpPages();
            if (pages.length <= 1) return;

            const nextPage = currentHelpPage + (e.deltaY > 0 ? 1 : -1);
            const clampedPage = Math.max(0, Math.min(nextPage, pages.length - 1));
            if (clampedPage === currentHelpPage) {
                e.preventDefault();
                return;
            }

            e.preventDefault();
            lastHelpWheelAt = now;
            setHelpPage(clampedPage);
        }, { passive: false });
    }

    const checkHideToolbar = document.getElementById('check-hide-toolbar') as HTMLInputElement | null;
    if (checkHideToolbar) {
        checkHideToolbar.onchange = (e: Event) => {
            const checked = (e.target as HTMLInputElement).checked;
            toggleFloatingDock(!checked);
        };
    }

    const checkHideGrid = document.getElementById('check-hide-grid') as HTMLInputElement | null;
    if (checkHideGrid) {
        checkHideGrid.onchange = (e: Event) => {
            const checked = (e.target as HTMLInputElement).checked;
            appState.settings.hideGrid = checked;
            localStorage.setItem('cc-hide-grid', String(checked));
            document.body.classList.toggle('hide-grid', checked);
        };
    }

    const checkAltAsCtrl = document.getElementById('check-alt-as-ctrl') as HTMLInputElement | null;
    if (checkAltAsCtrl) {
        checkAltAsCtrl.onchange = (e: Event) => {
            const checked = (e.target as HTMLInputElement).checked;
            appState.settings.altAsCtrl = checked;
            localStorage.setItem('cc-alt-as-ctrl', String(checked));
        };
    }
    
    const inputBgUrl = document.getElementById('input-bg-url') as HTMLInputElement | null;
    if (inputBgUrl) {
        inputBgUrl.onchange = (e: Event) => {
            const url = (e.target as HTMLInputElement).value.trim();
            appState.settings.bgUrl = url;
            if (url) {
                localStorage.setItem('cc-bg-url', url);
            } else {
                localStorage.removeItem('cc-bg-url');
            }
            applySettings();
        };
        inputBgUrl.onkeydown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
            }
        };
    }

    const checkHandDrawn = document.getElementById('check-hand-drawn') as HTMLInputElement | null;
    if (checkHandDrawn) {
        checkHandDrawn.onchange = (e: Event) => {
            const checked = (e.target as HTMLInputElement).checked;
            appState.settings.handDrawn = checked;
            localStorage.setItem('cc-hand-drawn', String(checked));
            callbacks.applyHandDrawnStyle(); 
        };
    }

    // 4. 帮助面板
    if (els.btnHelp && els.helpModal) {
        els.btnHelp.onclick = (e) => {
            e.stopPropagation();
            const isShowing = els.helpModal!.classList.toggle('show');
            els.btnHelp!.classList.toggle('active', isShowing);
            if (isShowing) {
                resetHelpPage();
                syncHelpPageHeight();
                modalSettings.classList.remove('show');
                btnSettings.classList.remove('active');
            }
            syncFloatingPanelState();
        };
    }

    // 5. 点击外部关闭弹窗
    window.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as Node;
        if (!btnSettings.contains(target) && !modalSettings.contains(target)) {
            modalSettings.classList.remove('show');
            btnSettings.classList.remove('active');
            btnSettings.blur();
        }
        if (els.btnHelp && els.helpModal && !els.btnHelp.contains(target) && !els.helpModal.contains(target)) {
            els.helpModal.classList.remove('show');
            els.btnHelp.classList.remove('active');
            els.btnHelp.blur();
        }
        syncFloatingPanelState();
    });

    // 6. 节日 Logo & 彩蛋
    updateSeasonalLogo();
    initEasterEggs();

    // 7. 清空按钮
    let clearConfirm = false;
    const btnClear = document.getElementById('btn-clear') as HTMLButtonElement | null;
    if (btnClear) {
        btnClear.onclick = () => {
            const texts = getTexts();
            if (!clearConfirm) {
                clearConfirm = true;
                btnClear.innerText = texts['confirm_clear'];
                btnClear.classList.add('btn-danger');
                setTimeout(() => {
                    if (clearConfirm) {
                        clearConfirm = false;
                        btnClear.innerText = "🗑️";
                        btnClear.classList.remove('btn-danger');
                    }
                }, 3000);
            } else {
                callbacks.clearCanvas();
                clearConfirm = false;
                btnClear.innerText = "🗑️";
                btnClear.classList.remove('btn-danger');
            }
        };
    }
    
    // 8. 嵌入模式UI
    if (appState.isEmbed) {
        document.body.setAttribute('data-mode', 'embed');
        const btnInfo = document.getElementById('btn-info-embed');
        const infoCard = document.getElementById('embed-info-card');
        if (btnInfo && infoCard) {
            btnInfo.onclick = (e) => {
                e.stopPropagation();
                const isVisible = infoCard.style.opacity === "1";
                infoCard.style.opacity = isVisible ? "0" : "1";
                infoCard.style.pointerEvents = isVisible ? "none" : "auto";
                infoCard.style.transform = isVisible ? "translateY(10px) scale(0.95)" : "translateY(0) scale(1)";
            };
            window.addEventListener('click', () => {
                infoCard.style.opacity = "0";
                infoCard.style.pointerEvents = "none";
                infoCard.style.transform = "translateY(10px) scale(0.95)";
            });
        }
    }

    // 9. 导出/导入按钮
    const actionStack = document.getElementById('action-stack');
    const btnExportMain = document.getElementById('btn-export-main');
    let exportResetTimer: any = null;
    const resetActionStack = () => {
        actionStack?.classList.remove('is-exporting');
        clearTimeout(exportResetTimer);
    };
    if (btnExportMain && actionStack) {
        const toggleExportStack = (e: Event) => {
            e.stopPropagation();
            if (e.type === 'touchstart') e.preventDefault();
            actionStack.classList.toggle('is-exporting');
            clearTimeout(exportResetTimer);
            if (actionStack.classList.contains('is-exporting')) {
                exportResetTimer = setTimeout(resetActionStack, 6000);
            }
        };
        btnExportMain.addEventListener('click', toggleExportStack);
        btnExportMain.addEventListener('touchstart', toggleExportStack, { passive: false });
    }

    const bindExportAction = (id: string, callback: () => void) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const trigger = (e: Event) => {
            e.stopPropagation();
            e.preventDefault();
            callback();
            resetActionStack();
        };
        btn.addEventListener('click', trigger);
        btn.addEventListener('touchend', trigger, { passive: false });
    };

    bindExportAction('opt-json', callbacks.exportJson);
    bindExportAction('opt-link', callbacks.createShareLink);
    bindExportAction('opt-embed', callbacks.createEmbedCode);

    document.addEventListener('click', (e) => {
        if (actionStack?.classList.contains('is-exporting') && !actionStack.contains(e.target as Node)) {
            resetActionStack();
        }
    });
    document.getElementById('btn-import-main')?.addEventListener('click', () => { document.getElementById('file-input')?.click(); });

    // 10. 语言切换
    document.getElementById('btn-lang')?.addEventListener('click', (e) => {
        toggleLang();
        updateI18n();
        updateFloatingDock(true);
        syncHelpPageHeight();
        applySettings();
        (e.currentTarget as HTMLElement).blur();
    });

    // 11. 文件导入
    const fileInput = document.getElementById('file-input') as HTMLInputElement | null;
    if (fileInput) {
        fileInput.onchange = (e: Event) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files[0]) {
                processDangoFile(files[0]);
            }
            (e.target as HTMLInputElement).value = ''; 
        };
    }
}
