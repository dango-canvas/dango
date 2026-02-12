// modules/view.js
import { screenToWorld } from './utils.js';

let renderRef = null;
let stateRef = null;
let viewAnimationId = null;

export function initView(state, render) {
    stateRef = state;
    renderRef = render;
}

// 停止当前所有视口动画
export function cancelViewAnimation() {
    if (viewAnimationId) {
        cancelAnimationFrame(viewAnimationId);
        viewAnimationId = null;
    }
}

// 通用缩放函数
export function changeZoom(factor, mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2) {
    cancelViewAnimation();
    
    const worldPos = screenToWorld(mouseX, mouseY, stateRef.view);
    const oldScale = stateRef.view.scale;
    stateRef.view.scale = Math.max(0.1, Math.min(5, oldScale * factor));
    
    stateRef.view.x = mouseX - worldPos.x * stateRef.view.scale;
    stateRef.view.y = mouseY - worldPos.y * stateRef.view.scale;
    renderRef();
}

export function resetViewToCenter(animated = true) {
    const targetX = window.innerWidth / 2;
    const targetY = window.innerHeight / 2;
    const targetScale = stateRef.isEmbed ? 0.8 : 1.2;

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
export function fitView(padding = 40, animated = true) {
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

    const availableW = window.innerWidth - padding * 2;
    const availableH = window.innerHeight - padding * 2;

    // 计算适合的缩放比例
    let targetScale = Math.min(availableW / contentW, availableH / contentH);
    // 限制最大缩放比例，避免只有一两个节点时缩放太大
    targetScale = Math.min(targetScale, stateRef.isEmbed ? 0.8 : 1.0);
    // 限制最小缩放比例
    targetScale = Math.max(targetScale, 0.2);

    const targetX = window.innerWidth / 2 - centerWorldX * targetScale;
    const targetY = window.innerHeight / 2 - centerWorldY * targetScale;

    if (animated) {
        animateView(targetX, targetY, targetScale);
    } else {
        stateRef.view.x = targetX;
        stateRef.view.y = targetY;
        stateRef.view.scale = targetScale;
        renderRef();
    }
}

export function animateView(targetX, targetY, targetScale, duration = 400) {
    cancelViewAnimation();
    const startX = stateRef.view.x;
    const startY = stateRef.view.y;
    const startScale = stateRef.view.scale;
    const startTime = performance.now();

    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(2, -10 * progress);
        
        stateRef.view.x = startX + (targetX - startX) * ease;
        stateRef.view.y = startY + (targetY - startY) * ease;
        stateRef.view.scale = startScale + (targetScale - startScale) * ease;
        renderRef();

        if (progress < 1) {
            viewAnimationId = requestAnimationFrame(step);
        } else {
            viewAnimationId = null;
        }
    }
    viewAnimationId = requestAnimationFrame(step);
}