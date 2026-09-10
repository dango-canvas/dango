// modules/spotlight.ts
import { els } from './dom.js';

let lastScreenMouse: { x: number; y: number } = { x: -1, y: -1 };

/**
 * 更新聚光灯层上的 CSS 坐标变量 (--mouse-x, --mouse-y)
 */
export function updateSpotlightPosition(clientX?: number, clientY?: number): void {
    if (typeof document === 'undefined') return;

    if (clientX !== undefined && clientY !== undefined) {
        lastScreenMouse.x = clientX;
        lastScreenMouse.y = clientY;
    }

    const spotlight = els.spotlight;
    if (!spotlight) return;

    let x = lastScreenMouse.x;
    let y = lastScreenMouse.y;

    if (x < 0 || y < 0) {
        if (typeof window !== 'undefined' && window.innerWidth && window.innerHeight) {
            x = window.innerWidth / 2;
            y = window.innerHeight / 2;
        } else {
            x = 0;
            y = 0;
        }
    }

    spotlight.style.setProperty('--mouse-x', `${x}px`);
    spotlight.style.setProperty('--mouse-y', `${y}px`);
}

/**
 * 记录鼠标屏幕坐标，并在聚光灯激活时同步更新样式
 */
export function trackSpotlightMouse(e: { clientX: number; clientY: number }): void {
    lastScreenMouse.x = e.clientX;
    lastScreenMouse.y = e.clientY;

    if (typeof document !== 'undefined' && document.body?.classList?.contains('spotlight-active')) {
        updateSpotlightPosition(e.clientX, e.clientY);
    }
}

/**
 * 激活聚光灯模式：先同步设置当前鼠标位置，再开启样式激活类，杜绝位置跳动
 */
export function activateSpotlight(clientX?: number, clientY?: number): void {
    if (typeof document === 'undefined') return;
    updateSpotlightPosition(clientX, clientY);
    document.body?.classList?.add('spotlight-active');
}

/**
 * 取消聚光灯模式
 */
export function deactivateSpotlight(): void {
    if (typeof document === 'undefined') return;
    document.body?.classList?.remove('spotlight-active');
}

/**
 * 检查当前聚光灯是否激活
 */
export function isSpotlightActive(): boolean {
    if (typeof document === 'undefined') return false;
    return Boolean(document.body?.classList?.contains('spotlight-active'));
}

/**
 * 获取当前缓存的鼠标屏幕坐标（供单测或调试使用）
 */
export function getLastMouseScreenPos(): { x: number; y: number } {
    return { ...lastScreenMouse };
}

/**
 * 重置聚光灯内部状态（供单测使用）
 */
export function resetSpotlightState(): void {
    lastScreenMouse = { x: -1, y: -1 };
    deactivateSpotlight();
}
