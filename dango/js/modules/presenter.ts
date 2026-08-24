// modules/presenter.ts
import { state, pushHistory, saveData } from './state.js';
import { getTexts } from './i18n.js';
import { showToast, showPersistentToast, dismissPersistentToast } from './ui.js';
import type { CanvasState, CanvasNode, CanvasGroup, CanvasLink } from './types.js';

const TAGGING_TOAST_ID = 'dango-tagging-toast';

let appState: CanvasState = state;
let callbacks: {
    render: () => void;
    animateView: (targetX: number, targetY: number, targetScale: number, duration?: number) => void;
    fitView: (padding?: number, animated?: boolean, duration?: number) => void;
    saveData?: () => void;
} = {
    render: () => {},
    animateView: () => {},
    fitView: () => {},
    saveData: () => {}
};

let isTaggingActive = false;
let isPresentingActive = false;
let currentStepIndex = 0;
let currentStepNumber = 0;

export function initPresenter(
    _state: CanvasState,
    _callbacks: {
        render: () => void;
        animateView: (targetX: number, targetY: number, targetScale: number, duration?: number) => void;
        fitView: (padding?: number, animated?: boolean, duration?: number) => void;
        saveData?: () => void;
    }
): void {
    appState = _state;
    callbacks = _callbacks;
}

export function isTaggingModeActive(): boolean {
    return isTaggingActive;
}

export function isPresentationModeActive(): boolean {
    return isPresentingActive;
}

export function getCurrentStep(): number {
    return currentStepNumber;
}

export function getStepBadgeText(step?: number): string {
    if (!step || step <= 0) return '';
    return String(step);
}

export function getUniqueSteps(
    nodes: CanvasNode[] = appState.nodes,
    groups: CanvasGroup[] = appState.groups
): number[] {
    const set = new Set<number>();
    nodes.forEach(n => {
        if (typeof n.step === 'number' && n.step > 0) set.add(n.step);
    });
    groups.forEach(g => {
        if (typeof g.step === 'number' && g.step > 0) set.add(g.step);
    });
    return Array.from(set).sort((a, b) => a - b);
}

export function getMaxStep(
    nodes: CanvasNode[] = appState.nodes,
    groups: CanvasGroup[] = appState.groups
): number {
    let max = 0;
    nodes.forEach(n => {
        if (typeof n.step === 'number' && n.step > max) max = n.step;
    });
    groups.forEach(g => {
        if (typeof g.step === 'number' && g.step > max) max = g.step;
    });
    return max;
}

function updateTaggingToast(): void {
    if (!isTaggingActive) return;
    const texts = getTexts();
    const uniqueSteps = getUniqueSteps(appState.nodes, appState.groups);
    const pillHtml = uniqueSteps.length > 0 
        ? `<span class="toast-step-pill">${uniqueSteps.length}</span>` 
        : '';
    const message = `<span>${texts.toast_tagging_enter}</span>${pillHtml}`;

    const popoverHtml = `
        <ul class="toast-popover-list">
            <li class="toast-popover-item">${texts.tagging_guide_tip1}</li>
            <li class="toast-popover-item">${texts.tagging_guide_tip2}</li>
        </ul>
    `;

    const actions: { text: string; onClick: () => void; className?: string; popoverHtml?: string }[] = [
        {
            text: texts.btn_tagging_present,
            onClick: () => {
                exitTaggingMode(false);
                enterPresentationMode();
            },
            className: 'btn-toast-primary'
        },
        {
            text: texts.btn_tagging_exit,
            onClick: () => exitTaggingMode(true)
        },
        {
            text: '?',
            onClick: () => {},
            className: 'btn-toast-help',
            popoverHtml
        }
    ];

    showPersistentToast(TAGGING_TOAST_ID, message, actions);
}

export function clearAllSteps(): void {
    if (isPresentingActive) return;
    const uniqueSteps = getUniqueSteps(appState.nodes, appState.groups);
    if (uniqueSteps.length === 0) return;
    pushHistory();
    appState.nodes.forEach(n => { delete n.step; });
    appState.groups.forEach(g => { delete g.step; });
    updateTaggingToast();
    callbacks.render();
    if (callbacks.saveData) callbacks.saveData();
}

export function clearStepsOfSelection(): void {
    if (isPresentingActive || !isTaggingActive) return;

    const selectedNodes = appState.nodes.filter(n => appState.selection.has(n.id));
    const selectedGroups = appState.groups.filter(g => appState.selection.has(g.id));
    const targetNodes = selectedNodes.length > 0 ? selectedNodes : (appState.selection.size === 0 ? appState.nodes : []);
    const targetGroups = selectedGroups.length > 0 ? selectedGroups : (appState.selection.size === 0 ? appState.groups : []);

    const hasAnySteps = targetNodes.some(n => typeof n.step === 'number' && n.step > 0) ||
                        targetGroups.some(g => typeof g.step === 'number' && g.step > 0);
    if (!hasAnySteps) return;

    pushHistory();
    targetNodes.forEach(n => { delete n.step; });
    targetGroups.forEach(g => {
        delete g.step;
        if (g.memberIds) {
            g.memberIds.forEach(mid => {
                const m = appState.nodes.find(n => n.id === mid);
                if (m) delete m.step;
            });
        }
    });

    updateTaggingToast();
    callbacks.render();
    if (callbacks.saveData) callbacks.saveData();
}

export function enterTaggingMode(): void {
    if (isPresentingActive) exitPresentationMode();
    appState.selection.clear();
    isTaggingActive = true;
    if (typeof document !== 'undefined') {
        document.body.classList.add('mode-tagging');
    }

    updateTaggingToast();
    callbacks.render();
}

export function exitTaggingMode(): void {
    if (!isTaggingActive) return;
    isTaggingActive = false;
    appState.selection.clear();
    if (typeof document !== 'undefined') {
        document.body.classList.remove('mode-tagging');
    }
    dismissPersistentToast(TAGGING_TOAST_ID);
    callbacks.render();
}

export function tagItemDirect(item: CanvasNode | CanvasGroup): void {
    if (isPresentingActive) return;
    if (!isTaggingActive) {
        enterTaggingMode();
    }
    pushHistory();

    if (typeof item.step === 'number' && item.step > 0) {
        // Toggle 清除当前项的 step
        const oldStep = item.step;
        delete item.step;
        if ('memberIds' in item && item.memberIds) {
            item.memberIds.forEach(mid => {
                const m = appState.nodes.find(n => n.id === mid);
                if (m && m.step === oldStep) delete m.step;
            });
        }
    } else {
        // 赋予下一个自增序号
        const nextStep = getMaxStep(appState.nodes, appState.groups) + 1;
        item.step = nextStep;
        if ('memberIds' in item && item.memberIds) {
            item.memberIds.forEach(mid => {
                const m = appState.nodes.find(n => n.id === mid);
                if (m && typeof m.step !== 'number') {
                    m.step = nextStep;
                }
            });
        }
    }

    updateTaggingToast();
    callbacks.render();
    if (callbacks.saveData) callbacks.saveData();
}

export function tagItemsBatch(items: (CanvasNode | CanvasGroup)[]): void {
    if (isPresentingActive || items.length === 0) return;
    if (!isTaggingActive) {
        enterTaggingMode();
    }
    pushHistory();

    const allHaveSteps = items.every(it => typeof it.step === 'number' && it.step > 0);

    if (allHaveSteps) {
        // Toggle 清除（所有项已带有步骤标号时，全部清除）
        items.forEach(it => {
            const oldStep = it.step;
            delete it.step;
            if ('memberIds' in it && it.memberIds) {
                it.memberIds.forEach(mid => {
                    const m = appState.nodes.find(n => n.id === mid);
                    if (m && m.step === oldStep) delete m.step;
                });
            }
        });
    } else {
        const nextStep = getMaxStep(appState.nodes, appState.groups) + 1;
        items.forEach(it => {
            it.step = nextStep;
            if ('memberIds' in it && it.memberIds) {
                it.memberIds.forEach(mid => {
                    const m = appState.nodes.find(n => n.id === mid);
                    if (m && typeof m.step !== 'number') {
                        m.step = nextStep;
                    }
                });
            }
        });
    }

    updateTaggingToast();
    callbacks.render();
    if (callbacks.saveData) callbacks.saveData();
}

export function tagSelectionStep(): void {
    if (isPresentingActive) return;

    if (isTaggingActive) {
        exitTaggingMode(true);
    } else {
        enterTaggingMode();
    }
}

export function isItemGhostedInTagging(item: { step?: number }): boolean {
    if (!isTaggingActive) return false;
    return typeof item.step !== 'number' || item.step <= 0;
}

export function isLinkGhostedInTagging(link: CanvasLink): boolean {
    if (!isTaggingActive) return false;
    const n1 = appState.nodes.find(n => n.id === link.sourceId);
    const n2 = appState.nodes.find(n => n.id === link.targetId);
    if (!n1 || !n2) return true;
    return isItemGhostedInTagging(n1) || isItemGhostedInTagging(n2);
}

export function isItemVisibleInPresentation(item: { step?: number }): boolean {
    if (!isPresentingActive) return true;
    const maxStep = getMaxStep(appState.nodes, appState.groups);

    // 未标记节点：在 Grand Finale 阶段全部绽放
    if (typeof item.step !== 'number' || item.step <= 0) {
        return currentStepNumber > maxStep;
    }

    return item.step <= currentStepNumber;
}

export function isLinkVisibleInPresentation(link: CanvasLink): boolean {
    if (!isPresentingActive) return true;
    const n1 = appState.nodes.find(n => n.id === link.sourceId);
    const n2 = appState.nodes.find(n => n.id === link.targetId);
    if (!n1 || !n2) return false;

    return isItemVisibleInPresentation(n1) && isItemVisibleInPresentation(n2);
}

const FINALE_TOAST_ID = 'dango-finale-toast';

let savedViewBeforePresentation: { x: number; y: number; scale: number } | null = null;

export function enterPresentationMode(): void {
    if (isTaggingActive) exitTaggingMode(false);
    dismissPersistentToast(FINALE_TOAST_ID);

    savedViewBeforePresentation = {
        x: appState.view.x,
        y: appState.view.y,
        scale: appState.view.scale
    };

    appState.selection.clear();
    isPresentingActive = true;

    if (typeof document !== 'undefined') {
        document.body?.classList?.add('mode-presenting');
        if (!document.fullscreenElement && document.documentElement?.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    }

    const steps = getUniqueSteps(appState.nodes, appState.groups);
    if (steps.length === 0) {
        // 画布无打标节点时，作为全景预览沉浸展示
        currentStepIndex = 0;
        currentStepNumber = 1;
        callbacks.fitView(60, true, 600);
    } else {
        currentStepIndex = 0;
        currentStepNumber = steps[0];
        checkAndSoftPanToStep(currentStepNumber);
    }

    callbacks.render();
}

export function exitPresentationMode(): void {
    if (!isPresentingActive) return;
    dismissPersistentToast(FINALE_TOAST_ID);
    dismissPersistentToast(TAGGING_TOAST_ID);
    isPresentingActive = false;
    isTaggingActive = false;
    currentStepNumber = 0;
    currentStepIndex = 0;

    if (typeof document !== 'undefined') {
        document.body?.classList?.remove('mode-presenting', 'mode-tagging', 'spotlight-active');
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    }

    if (savedViewBeforePresentation) {
        callbacks.animateView(
            savedViewBeforePresentation.x,
            savedViewBeforePresentation.y,
            savedViewBeforePresentation.scale,
            500
        );
        savedViewBeforePresentation = null;
    } else {
        callbacks.render();
    }
}

function showFinaleToast(): void {
    const texts = getTexts();
    showPersistentToast(FINALE_TOAST_ID, texts.toast_presentation_finished, [
        {
            text: texts.btn_presentation_exit,
            onClick: () => {
                dismissPersistentToast(FINALE_TOAST_ID);
                exitPresentationMode();
            },
            className: 'btn-toast-primary'
        }
    ]);
}

export function nextStep(): void {
    if (!isPresentingActive) return;
    const steps = getUniqueSteps(appState.nodes, appState.groups);

    if (steps.length === 0) {
        callbacks.fitView(60, true, 600);
        return;
    }

    if (currentStepIndex < steps.length - 1) {
        dismissPersistentToast(FINALE_TOAST_ID);
        currentStepIndex++;
        currentStepNumber = steps[currentStepIndex];
        checkAndSoftPanToStep(currentStepNumber);
        callbacks.render();
    } else if (currentStepIndex === steps.length - 1) {
        // 终章全景（The Grand Finale）
        currentStepIndex++;
        currentStepNumber = (steps[steps.length - 1] || 0) + 1;
        callbacks.fitView(60, true, 800);
        callbacks.render();
        showFinaleToast();
    } else {
        // 全景下再次按键：收官退出演示，回到标记模式
        dismissPersistentToast(FINALE_TOAST_ID);
        exitPresentationMode();
    }
}

export function prevStep(): void {
    if (!isPresentingActive) return;
    dismissPersistentToast(FINALE_TOAST_ID);
    const steps = getUniqueSteps(appState.nodes, appState.groups);

    if (currentStepIndex > 0) {
        currentStepIndex--;
        currentStepNumber = steps[currentStepIndex];
        checkAndSoftPanToStep(currentStepNumber);
        callbacks.render();
    }
}

export function revealAll(): void {
    if (!isPresentingActive) return;
    const steps = getUniqueSteps(appState.nodes, appState.groups);
    currentStepIndex = steps.length;
    currentStepNumber = (steps[steps.length - 1] || 0) + 1;
    callbacks.fitView(60, true, 800);
    callbacks.render();
    showFinaleToast();
}

export function checkAndSoftPanToStep(step: number): void {
    if (typeof window === 'undefined') return;

    const nodesInStep = appState.nodes.filter(n => n.step === step);
    const groupsInStep = appState.groups.filter(g => g.step === step);

    if (nodesInStep.length === 0 && groupsInStep.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    nodesInStep.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + (n.w || 100));
        maxY = Math.max(maxY, n.y + (n.h || 40));
    });

    groupsInStep.forEach(g => {
        minX = Math.min(minX, g.x);
        minY = Math.min(minY, g.y);
        maxX = Math.max(maxX, g.x + (g.w || 120));
        maxY = Math.max(maxY, g.y + (g.h || 60));
    });

    const scale = appState.view.scale || 1;
    const screenX1 = minX * scale + appState.view.x;
    const screenY1 = minY * scale + appState.view.y;
    const screenX2 = maxX * scale + appState.view.x;
    const screenY2 = maxY * scale + appState.view.y;

    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const safeMarginX = Math.max(80, winW * 0.15);
    const safeMarginY = Math.max(80, winH * 0.15);

    const isInsideSafeZone =
        screenX1 >= safeMarginX &&
        screenX2 <= (winW - safeMarginX) &&
        screenY1 >= safeMarginY &&
        screenY2 <= (winH - safeMarginY);

    // 智能纯平移软跟焦：当前步骤节点若已在舒适视口安全区内，镜头保持静止不晃动
    if (isInsideSafeZone) {
        return;
    }

    // 严格保持当前缩放不变（字号不缩水），仅平移镜头至新节点中心
    const centerWorldX = (minX + maxX) / 2;
    const centerWorldY = (minY + maxY) / 2;

    const targetX = winW / 2 - centerWorldX * scale;
    const targetY = winH / 2 - centerWorldY * scale;

    callbacks.animateView(targetX, targetY, scale, 600);
}

export function handlePresenterKeyDown(e: KeyboardEvent): boolean {
    if (!isPresentingActive) return false;

    if (e.code === 'Escape') {
        e.preventDefault();
        exitPresentationMode();
        return true;
    }

    if (e.code === 'KeyQ') {
        if (typeof document !== 'undefined') {
            document.body.classList.add('spotlight-active');
        }
        return true;
    }

    if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'PageDown') {
        e.preventDefault();
        nextStep();
        return true;
    }

    if (e.code === 'ArrowLeft' || e.code === 'PageUp') {
        e.preventDefault();
        prevStep();
        return true;
    }

    if (e.code === 'KeyA' || e.code === 'Home') {
        e.preventDefault();
        revealAll();
        return true;
    }

    // 允许修饰键正常流转
    if (['ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        return false;
    }

    // 阻止其他快捷键干扰演示
    e.preventDefault();
    return true;
}
