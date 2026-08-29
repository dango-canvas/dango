// modules/view.ts
import { screenToWorld } from './utils.js';
import { updateViewTransform } from './render.js';
import type { CanvasState } from './types.js';

let renderRef: (() => void) | null = null;
let stateRef: CanvasState | null = null;
let viewAnimationId: number | null = null;

export function initView(state: CanvasState, render: () => void): void {
    stateRef = state;
    renderRef = render;
}

// 停止当前所有视口动画
export function cancelViewAnimation(): void {
    if (viewAnimationId) {
        cancelAnimationFrame(viewAnimationId);
        viewAnimationId = null;
    }
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('view-animating');
    }
}

// 通用缩放函数
export function changeZoom(
    factor: number,
    mouseX = typeof window !== 'undefined' ? window.innerWidth / 2 : 500,
    mouseY = typeof window !== 'undefined' ? window.innerHeight / 2 : 500
): void {
    if (!stateRef || !renderRef) return;
    cancelViewAnimation();
    
    const worldPos = screenToWorld(mouseX, mouseY, stateRef.view);
    const oldScale = stateRef.view.scale;
    stateRef.view.scale = Math.max(0.1, Math.min(5, oldScale * factor));
    
    stateRef.view.x = mouseX - worldPos.x * stateRef.view.scale;
    stateRef.view.y = mouseY - worldPos.y * stateRef.view.scale;
    renderRef();
}

/**
 * 回归中心视图
 * 1. 选中项优先：若有选中节点/分组，平移至选中项包围盒的几何中心（兼顾“寻回/聚焦”作用）
 * 2. 画布内容兜底：若未选中任何项，平移至全画布所有节点/分组包围盒的几何中心（四周皆可顾及）
 * 3. 空白画布：平移至世界坐标原点 (0, 0)
 */
export function resetViewToCenter(animated = true): void {
    if (!stateRef || !renderRef) return;
    const targetScale = 1.2;
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;

    let targetWorldCenterX = 0;
    let targetWorldCenterY = 0;

    if (stateRef.selection.size > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let count = 0;
        stateRef.selection.forEach(id => {
            const item = stateRef!.nodes.find(n => n.id === id) || stateRef!.groups.find(g => g.id === id);
            if (item) {
                minX = Math.min(minX, item.x);
                minY = Math.min(minY, item.y);
                maxX = Math.max(maxX, item.x + (item.w || 0));
                maxY = Math.max(maxY, item.y + (item.h || 0));
                count++;
            }
        });
        if (count > 0) {
            targetWorldCenterX = minX + (maxX - minX) / 2;
            targetWorldCenterY = minY + (maxY - minY) / 2;
        }
    } else if (stateRef.nodes.length > 0 || stateRef.groups.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        stateRef.nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + (n.w || 0));
            maxY = Math.max(maxY, n.y + (n.h || 0));
        });
        stateRef.groups.forEach(g => {
            minX = Math.min(minX, g.x);
            minY = Math.min(minY, g.y);
            maxX = Math.max(maxX, g.x + (g.w || 0));
            maxY = Math.max(maxY, g.y + (g.h || 0));
        });
        targetWorldCenterX = minX + (maxX - minX) / 2;
        targetWorldCenterY = minY + (maxY - minY) / 2;
    }

    const targetX = winW / 2 - targetWorldCenterX * targetScale;
    const targetY = winH / 2 - targetWorldCenterY * targetScale;

    if (animated) {
        animateView(targetX, targetY, targetScale);
    } else {
        stateRef.view.x = targetX;
        stateRef.view.y = targetY;
        stateRef.view.scale = targetScale;
        renderRef();
    }
}

/**
 * 自动缩放并平移，使所有节点都可见
 */
export function fitView(padding = 40, animated = true, duration = 400): void {
    if (!stateRef || !renderRef) return;

    if (!stateRef.nodes.length && !stateRef.groups.length) {
        resetViewToCenter(animated);
        return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    stateRef.nodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + (n.w || 0));
        maxY = Math.max(maxY, n.y + (n.h || 0));
    });

    stateRef.groups.forEach(g => {
        minX = Math.min(minX, g.x);
        minY = Math.min(minY, g.y);
        maxX = Math.max(maxX, g.x + (g.w || 0));
        maxY = Math.max(maxY, g.y + (g.h || 0));
    });

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const centerWorldX = minX + contentW / 2;
    const centerWorldY = minY + contentH / 2;

    const winW = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;

    const availableW = winW - padding * 2;
    const availableH = winH - padding * 2;

    // 计算适合的缩放比例
    let targetScale = Math.min(availableW / contentW, availableH / contentH);
    // 限制最大缩放比例，避免只有一两个节点时缩放太大
    targetScale = Math.min(targetScale, 1.0);
    // 限制最小缩放比例
    targetScale = Math.max(targetScale, 0.2);

    const targetX = winW / 2 - centerWorldX * targetScale;
    const targetY = winH / 2 - centerWorldY * targetScale;

    if (animated) {
        animateView(targetX, targetY, targetScale, duration);
    } else {
        stateRef.view.x = targetX;
        stateRef.view.y = targetY;
        stateRef.view.scale = targetScale;
        renderRef();
    }
}

export function animateView(targetX: number, targetY: number, targetScale: number, duration = 400): void {
    if (!stateRef || !renderRef) return;
    cancelViewAnimation();
    const startX = stateRef.view.x;
    const startY = stateRef.view.y;
    const startScale = stateRef.view.scale;

    // 如果已经在目标位置，直接精准对齐并返回，避免冗余空跑
    if (Math.abs(startX - targetX) < 0.001 &&
        Math.abs(startY - targetY) < 0.001 &&
        Math.abs(startScale - targetScale) < 0.0001) {
        stateRef.view.x = targetX;
        stateRef.view.y = targetY;
        stateRef.view.scale = targetScale;
        updateViewTransform();
        return;
    }

    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.add('view-animating');
    }

    const startTime = performance.now();
    let lastStepTime = startTime;

    function step(now: number) {
        if (!stateRef || !renderRef) return;

        if (typeof window !== 'undefined' && (window as any).__DANGO_PERF__) {
            const perf = (window as any).__DANGO_PERF__;
            const delta = now - lastStepTime;
            if (perf.recording === 'A') perf.phaseAFrames.push({ timestamp: now, delta, progress: Math.min((now - startTime) / duration, 1) });
            if (perf.recording === 'B') perf.phaseBFrames.push({ timestamp: now, delta, progress: Math.min((now - startTime) / duration, 1) });
        }
        lastStepTime = now;

        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = progress >= 1 ? 1 : 1 - Math.pow(1 - progress, 3);
        
        stateRef.view.x = progress >= 1 ? targetX : startX + (targetX - startX) * ease;
        stateRef.view.y = progress >= 1 ? targetY : startY + (targetY - startY) * ease;
        stateRef.view.scale = progress >= 1 ? targetScale : startScale + (targetScale - startScale) * ease;

        if (progress < 1) {
            updateViewTransform();
            viewAnimationId = requestAnimationFrame(step);
        } else {
            viewAnimationId = null;
            if (typeof document !== 'undefined' && document.body) {
                document.body.classList.remove('view-animating');
            }
            updateViewTransform();
            renderRef();
        }
    }
    viewAnimationId = requestAnimationFrame(step);
}

