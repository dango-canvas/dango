// modules/interactions.ts
import { state, history, pushHistory, MAX_HISTORY, saveData, CONFIG } from './state.js';
import { render, updateViewTransform } from './render.js';
import { uid, screenToWorld, getStandardRect, isIntersect } from './utils.js';
import { changeZoom, cancelViewAnimation, fitView, animateView } from './view.js';
import { keys, isModifier } from './shortcuts.js';
import { processDangoFile } from './io.js';
import { els } from './dom.js';
import { realignDirectionalNodeAfterEdit } from './directional.js';
import { isPresentationModeActive, isTaggingModeActive, tagItemDirect, tagItemsBatch, nextStep, prevStep, exitPresentationMode } from './presenter.js';
import type { CanvasNode, CanvasGroup, CanvasItem } from './types.js';

let dragStart: any = null;
let mode: string | null = null;
let stateBeforeDrag: string | null = null;
let isPrepareToClone = false;
let targetAlreadySelectedAtStart = false;
let targetIdAtMouseDown: string | null = null;
let hasMovedDuringDrag = false;
let activeEditFinish: (() => void) | null = null;
let lastMiddleClickTime = 0;
let middleClickCount = 0;
let isGlobalViewActive = false;
let preGlobalViewScale = 1;

export const SNAP_THRESHOLD = 5;
export const MAX_SNAP_NEIGHBOR_DIST = 350;

export interface SnapGuide {
    type: 'vertical' | 'horizontal';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export function calculateMagneticSnap(
    leadNodeId: string | null,
    rawDx: number,
    rawDy: number,
    initialPosSnapshot: Record<string, { x: number; y: number; type?: string }>
): {
    effectiveDx: number;
    effectiveDy: number;
    guides: SnapGuide[];
} {
    if (!initialPosSnapshot) {
        return { effectiveDx: rawDx, effectiveDy: rawDy, guides: [] };
    }

    const leadId = leadNodeId || Array.from(state.selection)[0];
    const draggedNode = state.nodes.find(n => n.id === leadId);
    const initPos = initialPosSnapshot[leadId];

    if (!draggedNode || !initPos) {
        return { effectiveDx: rawDx, effectiveDy: rawDy, guides: [] };
    }

    const nodeW = typeof draggedNode.w === 'number' && draggedNode.w > 0 ? draggedNode.w : 120;
    const nodeH = typeof draggedNode.h === 'number' && draggedNode.h > 0 ? draggedNode.h : 60;
    const rawX = initPos.x + rawDx;
    const rawY = initPos.y + rawDy;
    const nodeCx = rawX + nodeW / 2;
    const nodeCy = rawY + nodeH / 2;

    const candidateNodes = state.nodes.filter(n => !state.selection.has(n.id));
    if (candidateNodes.length === 0) {
        return { effectiveDx: rawDx, effectiveDy: rawDy, guides: [] };
    }

    let minDeltaX = Infinity;
    let bestCandX: { other: CanvasNode; ocx: number; ocy: number; offset: number } | null = null;
    let minDeltaY = Infinity;
    let bestCandY: { other: CanvasNode; ocx: number; ocy: number; offset: number } | null = null;

    for (const other of candidateNodes) {
        const ow = typeof other.w === 'number' && other.w > 0 ? other.w : 120;
        const oh = typeof other.h === 'number' && other.h > 0 ? other.h : 60;
        const ocx = other.x + ow / 2;
        const ocy = other.y + oh / 2;
        const dist = Math.hypot(ocx - nodeCx, ocy - nodeCy);

        if (dist > MAX_SNAP_NEIGHBOR_DIST) continue;

        // X轴（垂直中心对齐）
        const deltaX = Math.abs(ocx - nodeCx);
        if (deltaX <= SNAP_THRESHOLD && deltaX < minDeltaX) {
            minDeltaX = deltaX;
            bestCandX = { other, ocx, ocy, offset: ocx - nodeCx };
        }

        // Y轴（水平中心对齐）
        const deltaY = Math.abs(ocy - nodeCy);
        if (deltaY <= SNAP_THRESHOLD && deltaY < minDeltaY) {
            minDeltaY = deltaY;
            bestCandY = { other, ocx, ocy, offset: ocy - nodeCy };
        }
    }

    const snapDx = bestCandX ? bestCandX.offset : 0;
    const snapDy = bestCandY ? bestCandY.offset : 0;
    const finalNodeCx = nodeCx + snapDx;
    const finalNodeCy = nodeCy + snapDy;

    const guides: SnapGuide[] = [];
    if (bestCandX) {
        guides.push({
            type: 'vertical',
            x1: bestCandX.ocx,
            y1: Math.min(finalNodeCy, bestCandX.ocy),
            x2: bestCandX.ocx,
            y2: Math.max(finalNodeCy, bestCandX.ocy)
        });
    }
    if (bestCandY) {
        guides.push({
            type: 'horizontal',
            x1: Math.min(finalNodeCx, bestCandY.ocx),
            y1: bestCandY.ocy,
            x2: Math.max(finalNodeCx, bestCandY.ocx),
            y2: bestCandY.ocy
        });
    }

    return {
        effectiveDx: rawDx + snapDx,
        effectiveDy: rawDy + snapDy,
        guides
    };
}

export function renderSnapGuides(guides: SnapGuide[] = []): void {
    if (!els.snapGuidesLayer) return;
    if (guides.length === 0) {
        els.snapGuidesLayer.innerHTML = '';
        return;
    }
    let html = '';
    for (const g of guides) {
        html += `<line class="snap-guide" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}"></line>`;
    }
    els.snapGuidesLayer.innerHTML = html;
}

function cancelTransientInteraction(): void {
    mode = null;
    dragStart = null;
    stateBeforeDrag = null;
    isPrepareToClone = false;
    targetAlreadySelectedAtStart = false;
    targetIdAtMouseDown = null;
    hasMovedDuringDrag = false;
    document.body.classList.remove('mode-pan');
    if (els.selectBox) els.selectBox.style.display = 'none';
    renderSnapGuides([]);
}

function forceFinishActiveEdit(): void {
    if (typeof activeEditFinish === 'function') {
        activeEditFinish();
        return;
    }
    const editingNode = document.querySelector<HTMLElement>('.node.editing');
    if (editingNode?.isContentEditable) {
        editingNode.onblur = null;
        editingNode.onkeydown = null;
        editingNode.onpaste = null;
        editingNode.contentEditable = 'false';
        editingNode.classList.remove('editing');
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
        const nodeId = editingNode.dataset.id;
        const node = state.nodes.find(n => n.id === nodeId);
        if (node) {
            const newText = editingNode.innerText.replace(/\u00a0/g, ' ').replace(/\u200B/g, '');
            if (!newText.trim()) {
                state.nodes = state.nodes.filter(n => n.id !== node.id);
                state.selection.delete(node.id);
            } else if (node.text !== newText) {
                node.text = newText;
            }

            if (newText.trim()) {
                commitNodeDisplayGeometry(node, editingNode);
                return;
            }
        }
        render();
    }
}

function commitNodeDisplayGeometry(node: CanvasNode, nodeEl: HTMLElement): void {
    delete nodeEl.dataset.lastText;
    render();

    const didRealign = realignDirectionalNodeAfterEdit(node);
    if (didRealign) {
        render();
    }
}

export function initInteractions(): void {
    if (!els.nodesLayer || !els.container || !els.uiLayer) return;

    els.nodesLayer.addEventListener('click', (e: MouseEvent) => {
        if (isPresentationModeActive()) return;
        const target = (e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement) as HTMLElement | null;
        const inlineLink = target?.closest('.node-inline-link');
        if (inlineLink) {
            e.stopPropagation();
            return;
        }
        const checkboxWrapper = target?.closest('.todo-checkbox-wrapper');
        if (!checkboxWrapper) return;
        e.stopPropagation();
        const nodeEl = checkboxWrapper.closest<HTMLElement>('.node');
        if (!nodeEl) return;
        const nodeId = nodeEl.dataset.id;
        const node = state.nodes.find(n => n.id === nodeId);
        if (!node) return;
        const todoItem = checkboxWrapper.closest('.todo-item');
        const allTodosInNode = Array.from(nodeEl.querySelectorAll('.todo-item'));
        const clickedIndex = allTodosInNode.indexOf(todoItem as Element);
        if (clickedIndex === -1) return;
        pushHistory();
        const lines = node.text.split('\n');
        let todoCounter = -1;
        const newLines = lines.map(line => {
            if (/^\[([ xX])\]/.test(line.trim())) {
                todoCounter++;
                if (todoCounter === clickedIndex) {
                    return line.includes('[ ]') ? line.replace('[ ]', '[x]') : line.replace(/\[[xX]\]/, '[ ]');
                }
            }
            return line;
        });
        node.text = newLines.join('\n');
        render();
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        els.container!.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });
    els.container.addEventListener('dragover', () => {
        els.container!.classList.add('drag-over');
    });
    ['dragleave', 'drop'].forEach(eventName => {
        els.container!.addEventListener(eventName, () => {
            els.container!.classList.remove('drag-over');
        });
    });
    els.container.addEventListener('drop', (e: DragEvent) => {
        const dt = e.dataTransfer;
        const file = dt?.files[0];
        if (file) processDangoFile(file);
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
        document.documentElement.style.setProperty('--mouse-x', e.clientX + 'px');
        document.documentElement.style.setProperty('--mouse-y', e.clientY + 'px');

        const worldPos = screenToWorld(e.clientX, e.clientY, state.view);
        state.mouse.x = worldPos.x;
        state.mouse.y = worldPos.y;
    });

    const handleWindowDeactivate = () => {
        forceFinishActiveEdit();
        cancelTransientInteraction();
        Object.keys(keys).forEach(k => { keys[k] = false; });
        document.body.classList.remove('mode-space', 'spotlight-active');
    };

    window.addEventListener('blur', handleWindowDeactivate);
    window.addEventListener('pagehide', handleWindowDeactivate);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') handleWindowDeactivate();
    });

    els.container.addEventListener('mousedown', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('.todo-checkbox-wrapper')) return;
        if (target.isContentEditable) return;
        cancelViewAnimation();
        hasMovedDuringDrag = false;

        // 演示模式下仅允许中键/空格平移画布，禁止拖选与节点移动
        if (isPresentationModeActive()) {
            if (e.button === 1 || (e.button === 0 && keys.Space)) {
                mode = 'pan';
                dragStart = { x: e.clientX, y: e.clientY, viewX: state.view.x, viewY: state.view.y };
                document.body.classList.add('mode-pan');
            }
            return;
        }

        // 中键双击逻辑
        if (e.button === 1) {
            const now = Date.now();
            if (now - lastMiddleClickTime < 300) {
                middleClickCount++;
            } else {
                middleClickCount = 1;
            }
            lastMiddleClickTime = now;

            if (middleClickCount === 2) {
                isGlobalViewActive = true;
                preGlobalViewScale = state.view.scale;
                fitView(100, true, 200);
                mode = 'global-view';
                document.body.classList.add('mode-pan');
                return;
            }
        } else {
            middleClickCount = 0;
        }

        if (target.closest('.node') && e.detail === 2) return;
        if (e.button === 1 || (e.button === 0 && keys.Space)) {
            mode = 'pan';
            dragStart = { x: e.clientX, y: e.clientY, viewX: state.view.x, viewY: state.view.y };
            document.body.classList.add('mode-pan');
            return;
        }
        if (e.button === 0) {
            const nodeEl = target.closest<HTMLElement>('.node');
            const groupEl = target.closest<HTMLElement>('.group');
            const worldPos = screenToWorld(e.clientX, e.clientY, state.view);
            if (nodeEl || groupEl) {
                const id = (nodeEl || groupEl)!.dataset.id!;
                targetIdAtMouseDown = id;
                targetAlreadySelectedAtStart = state.selection.has(id);
                hasMovedDuringDrag = false;
                if (isModifier(e)) {
                    state.selection.add(id);
                    state.selectionSource = 'click';
                    isPrepareToClone = true;
                    render();
                } else {
                    if (!targetAlreadySelectedAtStart) {
                        state.selection.clear();
                        state.selection.add(id);
                        state.selectionSource = 'click';
                        render();
                    }
                    isPrepareToClone = false;
                }
                if (state.isReadonly) {
                    mode = null;
                } else {
                    mode = 'move';
                    stateBeforeDrag = JSON.stringify({ nodes: state.nodes, groups: state.groups, links: state.links });
                    dragStart = { x: worldPos.x, y: worldPos.y, initialPos: getSelectionPositions() };
                }
            } else {
                if (!isModifier(e) && !e.shiftKey) state.selection.clear();
                mode = 'box';
                dragStart = { x: e.clientX, y: e.clientY };
                if (els.selectBox) {
                    els.selectBox.style.display = 'block';
                    updateSelectBox(e.clientX, e.clientY, e.clientX, e.clientY);
                }
                render();
            }
        }
    });

    els.container.addEventListener('mousemove', (e: MouseEvent) => {
        if (!mode) return;
        if (mode === 'pan') {
            state.view.x = dragStart.viewX + (e.clientX - dragStart.x);
            state.view.y = dragStart.viewY + (e.clientY - dragStart.y);
            updateViewTransform();
        } else if (mode === 'move') {
            const worldPos = screenToWorld(e.clientX, e.clientY, state.view);
            const rawDx = worldPos.x - dragStart.x;
            const rawDy = worldPos.y - dragStart.y;
            if (Math.abs(rawDx) > 3 || Math.abs(rawDy) > 3) {
                hasMovedDuringDrag = true;
                if (isPrepareToClone) {
                    cloneSelectionInPlace();
                    isPrepareToClone = false;
                }
            }

            const snapResult = calculateMagneticSnap(targetIdAtMouseDown, rawDx, rawDy, dragStart.initialPos);
            const dx = snapResult.effectiveDx;
            const dy = snapResult.effectiveDy;
            renderSnapGuides(snapResult.guides);

            state.selection.forEach(id => {
                const init = dragStart.initialPos[id];
                if (init) {
                    const item = findItem(id);
                    if (item) {
                        item.x = init.x + dx; item.y = init.y + dy;
                        if (init.type === 'group' && (item as any).memberIds) {
                            (item as any).memberIds.forEach((mid: string) => {
                                const member = state.nodes.find(n => n.id === mid);
                                if (member && !dragStart.initialPos[mid]) {
                                    const mInit = dragStart.initialPos[`member_${mid}`];
                                    if (mInit) { member.x = mInit.x + dx; member.y = mInit.y + dy; }
                                }
                            });
                        }
                    }
                }
            });
            render();
        } else if (mode === 'box') {
            updateSelectBox(dragStart.x, dragStart.y, e.clientX, e.clientY);
        }
    });

    els.container.addEventListener('mouseup', (e: MouseEvent) => {
        renderSnapGuides([]);
        if (e.button === 1 && isGlobalViewActive) {
            isGlobalViewActive = false;
            middleClickCount = 0;
            const worldPos = screenToWorld(e.clientX, e.clientY, state.view);
            const targetScale = Math.max(preGlobalViewScale, 0.8);
            const targetX = window.innerWidth / 2 - worldPos.x * targetScale;
            const targetY = window.innerHeight / 2 - worldPos.y * targetScale;
            animateView(targetX, targetY, targetScale, 500);
            mode = null;
            document.body.classList.remove('mode-pan');
            return;
        }

        if (mode === 'move') {
            if (!hasMovedDuringDrag) {
                if (isTaggingModeActive() && targetIdAtMouseDown) {
                    const item = findItem(targetIdAtMouseDown);
                    if (item) {
                        tagItemDirect(item);
                    }
                } else if (isModifier(e) && targetAlreadySelectedAtStart && targetIdAtMouseDown) {
                    state.selection.delete(targetIdAtMouseDown);
                    render();
                }
            }
            if (stateBeforeDrag) {
                const currentState = JSON.stringify({ nodes: state.nodes, groups: state.groups, links: state.links });
                if (currentState !== stateBeforeDrag) {
                    history.undo.push(stateBeforeDrag);
                    if (history.undo.length > MAX_HISTORY) history.undo.shift();
                    history.redo = [];
                }
                stateBeforeDrag = null;
            }
        }
        if (mode === 'box') {
            const rect = getStandardRect(dragStart.x, dragStart.y, e.clientX, e.clientY);
            const worldRect = {
                x: (rect.x - state.view.x) / state.view.scale, y: (rect.y - state.view.y) / state.view.scale,
                w: rect.w / state.view.scale, h: rect.h / state.view.scale
            };
            const prevSize = state.selection.size;
            const itemsInBox = [...state.nodes, ...state.groups].filter(item => isIntersect(worldRect, item));
            itemsInBox.forEach(item => state.selection.add(item.id));
            if (state.selection.size > prevSize) {
                state.selectionSource = 'box';
            }
            if (isTaggingModeActive() && itemsInBox.length > 0) {
                tagItemsBatch(itemsInBox);
            }
            if (els.selectBox) els.selectBox.style.display = 'none';
            render();
        }
        if (mode === 'pan') {
            saveData();
        }
        mode = null;
        dragStart = null;
        isPrepareToClone = false;
        targetIdAtMouseDown = null;
        document.body.classList.remove('mode-pan');
    });

    let wheelSaveTimeout: any;

    els.container.addEventListener('wheel', (e: WheelEvent) => {
        cancelViewAnimation();
        e.preventDefault();
        if (e.ctrlKey || e.metaKey || (state.settings.altAsCtrl && e.altKey)) {
            const factor = 1 + ((e.deltaY > 0 ? -1 : 1) * 0.1);
            changeZoom(factor, e.clientX, e.clientY);
        } else {
            state.view.x -= e.deltaX;
            state.view.y -= e.deltaY;
            updateViewTransform();
            clearTimeout(wheelSaveTimeout);
            wheelSaveTimeout = setTimeout(saveData, 500);
        }
    }, { passive: false });

    els.uiLayer.addEventListener('touchstart', (e: TouchEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' || target.closest('button')) return;
        els.uiLayer!.classList.add('mobile-expanded');
    }, { passive: true });

    document.addEventListener('touchstart', (e: TouchEvent) => {
        if (!els.uiLayer!.contains(e.target as Node)) {
            els.uiLayer!.classList.remove('mobile-expanded');
            if (document.activeElement && els.uiLayer!.contains(document.activeElement)) {
                (document.activeElement as HTMLElement).blur();
            }
        }
    }, { passive: true });

    let longPressTimer: any = null;
    let lastTouchPos = { x: 0, y: 0 };
    let presentTouchStart: { x: number; y: number; time: number } | null = null;
    let touchTargetIdAtStart: string | null = null;

    els.container.addEventListener('touchstart', (e: TouchEvent) => {
        els.uiLayer!.classList.remove('mobile-expanded');
        if (document.activeElement && document.activeElement !== document.body) (document.activeElement as HTMLElement).blur();
        cancelViewAnimation();
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        const pos = getTouchPos(e);
        lastTouchPos = { x: pos.x, y: pos.y };

        // 演讲演示模式手势拦截 (Tap & Swipe)
        if (isPresentationModeActive()) {
            e.preventDefault();
            presentTouchStart = { x: pos.x, y: pos.y, time: Date.now() };
            return;
        }

        if (e.touches.length === 2) {
            e.preventDefault();
            mode = 'pinch';
            initialPinchDist = getPinchDist(e);
            initialPinchScale = state.view.scale;
            const center = getPinchCenter(e);
            pinchCenter = screenToWorld(center.x, center.y, state.view);
            return;
        }
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA' || target.closest('.header-btn')) return;
        if (!target.isContentEditable) e.preventDefault();
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTapTime;
        const nodeEl = target.closest<HTMLElement>('.node');
        if (tapLength < 300 && tapLength > 0 && nodeEl && lastTapTarget === nodeEl && !isTaggingModeActive()) {
            if (!nodeEl.isContentEditable) handleNodeEdit(nodeEl);
            lastTapTarget = null;
            lastTapTime = 0;
            return;
        }
        lastTapTarget = nodeEl;
        lastTapTime = currentTime;

        const groupEl = target.closest<HTMLElement>('.group');
        touchTargetIdAtStart = (nodeEl || groupEl)?.dataset.id || null;

        if (nodeEl || groupEl) {
            const id = (nodeEl || groupEl)!.dataset.id!;
            if (!state.selection.has(id)) {
                state.selection.clear();
                state.selection.add(id);
                render();
            }
            if (state.isReadonly) {
                mode = 'pan';
                dragStart = { x: pos.x, y: pos.y, viewX: state.view.x, viewY: state.view.y };
            } else {
                mode = 'move';
                hasMovedDuringDrag = false;
                stateBeforeDrag = JSON.stringify({ nodes: state.nodes, groups: state.groups, links: state.links, selection: Array.from(state.selection) });
                const worldPos = screenToWorld(pos.x, pos.y, state.view);
                dragStart = { x: worldPos.x, y: worldPos.y, initialPos: getSelectionPositions() };
            }
        } else {
            state.selection.clear();
            render();
            mode = 'pan';
            dragStart = { x: pos.x, y: pos.y, viewX: state.view.x, viewY: state.view.y };

            // 空白处长按 320ms 触发框选模式
            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                if (mode === 'pan') {
                    if (typeof navigator !== 'undefined' && navigator.vibrate) {
                        try { navigator.vibrate(20); } catch {}
                    }
                    mode = 'box';
                    dragStart = { x: lastTouchPos.x, y: lastTouchPos.y };
                    if (els.selectBox) {
                        els.selectBox.style.display = 'block';
                        updateSelectBox(lastTouchPos.x, lastTouchPos.y, lastTouchPos.x, lastTouchPos.y);
                    }
                }
            }, 320);
        }
    }, { passive: false });

    els.container.addEventListener('touchmove', (e: TouchEvent) => {
        const pos = getTouchPos(e);
        lastTouchPos = { x: pos.x, y: pos.y };

        if (isPresentationModeActive()) {
            e.preventDefault();
            return;
        }

        if (!mode) return;
        e.preventDefault();
        if (mode === 'pinch' && e.touches.length === 2) {
            const currentDist = getPinchDist(e);
            if (currentDist > 0 && initialPinchDist > 0) {
                const scaleFactor = currentDist / initialPinchDist;
                let newScale = initialPinchScale * scaleFactor;
                newScale = Math.max(0.1, Math.min(5, newScale));
                const currentCenter = getPinchCenter(e);
                state.view.scale = newScale;
                state.view.x = currentCenter.x - pinchCenter.x * newScale;
                state.view.y = currentCenter.y - pinchCenter.y * newScale;
                updateViewTransform();
            }
            return;
        }

        if (longPressTimer) {
            const dist = Math.hypot(pos.x - dragStart.x, pos.y - dragStart.y);
            if (dist > 8) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        }

        if (mode === 'pan') {
            state.view.x = dragStart.viewX + (pos.x - dragStart.x);
            state.view.y = dragStart.viewY + (pos.y - dragStart.y);
            cancelViewAnimation();
            updateViewTransform();
        } else if (mode === 'move') {
            const worldPos = screenToWorld(pos.x, pos.y, state.view);
            const dx = worldPos.x - dragStart.x;
            const dy = worldPos.y - dragStart.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMovedDuringDrag = true;
            state.selection.forEach(id => {
                const init = dragStart.initialPos[id];
                if (init) {
                    const item = findItem(id);
                    if (item) {
                        item.x = init.x + dx; 
                        item.y = init.y + dy;
                        if (init.type === 'group' && (item as any).memberIds) {
                            (item as any).memberIds.forEach((mid: string) => {
                                const member = state.nodes.find(n => n.id === mid);
                                if (member && !dragStart.initialPos[mid]) {
                                    const mInit = dragStart.initialPos[`member_${mid}`];
                                    if (mInit) { member.x = mInit.x + dx; member.y = mInit.y + dy; }
                                }
                            });
                        }
                    }
                }
            });
            render();
        } else if (mode === 'box') {
            updateSelectBox(dragStart.x, dragStart.y, pos.x, pos.y);
        }
    }, { passive: false });

    els.container.addEventListener('touchend', () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        // 演讲演示模式轻扫与轻点翻页判定
        if (isPresentationModeActive() && presentTouchStart) {
            const dx = lastTouchPos.x - presentTouchStart.x;
            const dy = lastTouchPos.y - presentTouchStart.y;
            const dt = Date.now() - presentTouchStart.time;
            presentTouchStart = null;

            // 1. 横向轻扫手势 (Swipe Left -> Next, Swipe Right -> Prev)
            if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy) * 1.1) {
                if (dx < 0) nextStep();
                else prevStep();
                return;
            }

            // 2. 轻点屏幕 (Tap Right -> Next, Tap Left -> Prev)
            if (Math.hypot(dx, dy) < 15 && dt < 450) {
                if (lastTouchPos.x > window.innerWidth / 2) nextStep();
                else prevStep();
                return;
            }
            return;
        }

        if (mode === 'pinch' || mode === 'pan') {
            saveData();
        } else if (mode === 'move') {
            if (!hasMovedDuringDrag && isTaggingModeActive() && touchTargetIdAtStart) {
                const item = findItem(touchTargetIdAtStart);
                if (item) {
                    tagItemDirect(item);
                    render();
                }
            }
            if (stateBeforeDrag) {
                const currentState = JSON.stringify({ 
                    nodes: state.nodes, 
                    groups: state.groups, 
                    links: state.links, 
                    selection: Array.from(state.selection) 
                });
                if (currentState !== stateBeforeDrag) {
                    history.undo.push(stateBeforeDrag);
                    if (history.undo.length > MAX_HISTORY) history.undo.shift();
                    history.redo = [];
                }
            }
        } else if (mode === 'box') {
            const rect = getStandardRect(dragStart.x, dragStart.y, lastTouchPos.x, lastTouchPos.y);
            const worldRect = {
                x: (rect.x - state.view.x) / state.view.scale, y: (rect.y - state.view.y) / state.view.scale,
                w: rect.w / state.view.scale, h: rect.h / state.view.scale
            };
            const prevSize = state.selection.size;
            const itemsInBox = [...state.nodes, ...state.groups].filter(item => isIntersect(worldRect, item));
            itemsInBox.forEach(item => state.selection.add(item.id));
            if (state.selection.size > prevSize) {
                state.selectionSource = 'box';
            }
            if (isTaggingModeActive() && itemsInBox.length > 0) {
                tagItemsBatch(itemsInBox);
            }
            if (els.selectBox) els.selectBox.style.display = 'none';
            render();
        }
        stateBeforeDrag = null;
        mode = null;
        dragStart = null;
        initialPinchDist = 0;
        touchTargetIdAtStart = null;
    });

    els.container.addEventListener('dblclick', (e: MouseEvent) => {
        if (isPresentationModeActive() || state.isReadonly) return;
        const target = e.target as HTMLElement;
        const editingNodeEl = target.closest('.node');
        if (editingNodeEl?.getAttribute('contenteditable') === 'true') return;
        const nodeEl = target.closest<HTMLElement>('.node');
        if (nodeEl) {
            handleNodeEdit(nodeEl);
            return;
        }
        if (target.closest('.group')) return;
        if (target.closest('#ui-layer')) return;
        const worldPos = screenToWorld(e.clientX, e.clientY, state.view);
        const newNode = createNodeAt(worldPos);
        if (!newNode) return;

        newNode.w = 120;
        newNode.h = 44;
        newNode.x = worldPos.x - newNode.w / 2;
        newNode.y = worldPos.y - newNode.h / 2;

        render();
        const createdEl = document.querySelector<HTMLElement>(`.node[data-id="${newNode.id}"]`);
        if (createdEl) handleNodeEdit(createdEl);
    });
}

function setSelectionByOffsets(root: HTMLElement, startOffset: number, endOffset: number): void {
    const sel = window.getSelection();
    if (!sel) return;

    let currentOffset = 0;
    let startNode: Node | null = null;
    let startNodeOffset = 0;
    let endNode: Node | null = null;
    let endNodeOffset = 0;

    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        null
    );

    let node = walker.nextNode();
    if (!node) {
        const range = document.createRange();
        range.selectNodeContents(root);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
    }

    while (node) {
        const nodeLength = node.nodeValue ? node.nodeValue.length : 0;
        if (!startNode && currentOffset + nodeLength >= startOffset) {
            startNode = node;
            startNodeOffset = startOffset - currentOffset;
        }
        if (!endNode && currentOffset + nodeLength >= endOffset) {
            endNode = node;
            endNodeOffset = endOffset - currentOffset;
            break;
        }
        currentOffset += nodeLength;
        const next = walker.nextNode();
        if (!next) {
            if (!startNode) {
                startNode = node;
                startNodeOffset = nodeLength;
            }
            if (!endNode) {
                endNode = node;
                endNodeOffset = nodeLength;
            }
            break;
        }
        node = next;
    }

    if (startNode && endNode) {
        const range = document.createRange();
        range.setStart(startNode, Math.max(0, Math.min(startNodeOffset, startNode.nodeValue?.length || 0)));
        range.setEnd(endNode, Math.max(0, Math.min(endNodeOffset, endNode.nodeValue?.length || 0)));
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

export function applyMarkdownFormat(nodeEl: HTMLElement, formatType: 'bold' | 'italic'): void {
    if (!nodeEl || nodeEl.getAttribute('contenteditable') !== 'true') return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!nodeEl.contains(range.commonAncestorContainer)) return;

    const preRange = document.createRange();
    preRange.selectNodeContents(nodeEl);
    preRange.setEnd(range.startContainer, range.startOffset);
    let before = preRange.toString();

    let selected = range.toString();

    const postRange = document.createRange();
    postRange.selectNodeContents(nodeEl);
    postRange.setStart(range.endContainer, range.endOffset);
    let after = postRange.toString();

    let startOffset = before.length;
    let endOffset = startOffset + selected.length;

    let replaceStartOffset = startOffset;
    let replaceEndOffset = endOffset;
    let replacement = '';
    let newSelectStart = startOffset;
    let newSelectEnd = endOffset;

    if (nodeEl.innerText === '\u200B') {
        replaceStartOffset = 0;
        replaceEndOffset = 1;
        before = '';
        selected = '';
        after = '';
        startOffset = 0;
        endOffset = 0;
    } else {
        if (before === '\u200B' && !selected && !after) before = '';
        if (selected === '\u200B') selected = '';
        if (after === '\u200B' && !selected && !before) after = '';
        startOffset = before.length;
        endOffset = startOffset + selected.length;
        replaceStartOffset = startOffset;
        replaceEndOffset = endOffset;
    }

    if (formatType === 'bold') {
        if ((selected.startsWith('***') && selected.endsWith('***') && selected.length >= 6) ||
            (selected.startsWith('___') && selected.endsWith('___') && selected.length >= 6)) {
            replacement = selected.slice(2, -2);
            newSelectStart = startOffset;
            newSelectEnd = startOffset + replacement.length;
        } else if ((selected.startsWith('**') && selected.endsWith('**') && selected.length >= 4) ||
                   (selected.startsWith('__') && selected.endsWith('__') && selected.length >= 4)) {
            replacement = selected.slice(2, -2);
            newSelectStart = startOffset;
            newSelectEnd = startOffset + replacement.length;
        } else if ((before.endsWith('***') && after.startsWith('***')) ||
                 (before.endsWith('___') && after.startsWith('___'))) {
            replaceStartOffset = startOffset - 2;
            replaceEndOffset = endOffset + 2;
            replacement = selected;
            newSelectStart = startOffset - 2;
            newSelectEnd = startOffset - 2 + selected.length;
        } else if ((before.endsWith('**') && after.startsWith('**')) ||
                   (before.endsWith('__') && after.startsWith('__'))) {
            replaceStartOffset = startOffset - 2;
            replaceEndOffset = endOffset + 2;
            replacement = selected;
            newSelectStart = startOffset - 2;
            newSelectEnd = startOffset - 2 + selected.length;
        } else {
            if (!selected) {
                if (before.endsWith('**') && after.startsWith('**')) {
                    replaceStartOffset = startOffset - 2;
                    replaceEndOffset = endOffset + 2;
                    replacement = '';
                    newSelectStart = startOffset - 2;
                    newSelectEnd = startOffset - 2;
                } else {
                    replacement = '****';
                    newSelectStart = startOffset + 2;
                    newSelectEnd = startOffset + 2;
                }
            } else {
                const match = selected.match(/^(\s*)([\s\S]*?)(\s*)$/);
                const leadSpace = match ? match[1] : '';
                const coreText = match ? match[2] : selected;
                const trailSpace = match ? match[3] : '';

                if (!coreText) {
                    replacement = leadSpace + '****' + trailSpace;
                    newSelectStart = startOffset + leadSpace.length + 2;
                    newSelectEnd = startOffset + leadSpace.length + 2;
                } else {
                    replacement = leadSpace + '**' + coreText + '**' + trailSpace;
                    newSelectStart = startOffset + leadSpace.length + 2;
                    newSelectEnd = startOffset + leadSpace.length + 2 + coreText.length;
                }
            }
        }
    } else if (formatType === 'italic') {
        if ((selected.startsWith('***') && selected.endsWith('***') && selected.length >= 6) ||
            (selected.startsWith('___') && selected.endsWith('___') && selected.length >= 6)) {
            replacement = selected.slice(1, -1);
            newSelectStart = startOffset;
            newSelectEnd = startOffset + replacement.length;
        } else if ((selected.startsWith('*') && selected.endsWith('*') && selected.length >= 2 && !(selected.startsWith('**') && selected.endsWith('**'))) ||
                   (selected.startsWith('_') && selected.endsWith('_') && selected.length >= 2 && !(selected.startsWith('__') && selected.endsWith('__')))) {
            replacement = selected.slice(1, -1);
            newSelectStart = startOffset;
            newSelectEnd = startOffset + replacement.length;
        } else if ((before.endsWith('***') && after.startsWith('***')) ||
                 (before.endsWith('___') && after.startsWith('___'))) {
            replaceStartOffset = startOffset - 1;
            replaceEndOffset = endOffset + 1;
            replacement = selected;
            newSelectStart = startOffset - 1;
            newSelectEnd = startOffset - 1 + selected.length;
        } else if ((before.endsWith('*') && !before.endsWith('**') && after.startsWith('*') && !after.startsWith('**')) ||
                   (before.endsWith('_') && !before.endsWith('__') && after.startsWith('_') && !after.startsWith('__'))) {
            replaceStartOffset = startOffset - 1;
            replaceEndOffset = endOffset + 1;
            replacement = selected;
            newSelectStart = startOffset - 1;
            newSelectEnd = startOffset - 1 + selected.length;
        } else {
            if (!selected) {
                if (before.endsWith('*') && !before.endsWith('**') && after.startsWith('*') && !after.startsWith('**')) {
                    replaceStartOffset = startOffset - 1;
                    replaceEndOffset = endOffset + 1;
                    replacement = '';
                    newSelectStart = startOffset - 1;
                    newSelectEnd = startOffset - 1;
                } else {
                    replacement = '**';
                    newSelectStart = startOffset + 1;
                    newSelectEnd = startOffset + 1;
                }
            } else {
                const match = selected.match(/^(\s*)([\s\S]*?)(\s*)$/);
                const leadSpace = match ? match[1] : '';
                const coreText = match ? match[2] : selected;
                const trailSpace = match ? match[3] : '';

                if (!coreText) {
                    replacement = leadSpace + '**' + trailSpace;
                    newSelectStart = startOffset + leadSpace.length + 1;
                    newSelectEnd = startOffset + leadSpace.length + 1;
                } else {
                    replacement = leadSpace + '*' + coreText + '*' + trailSpace;
                    newSelectStart = startOffset + leadSpace.length + 1;
                    newSelectEnd = startOffset + leadSpace.length + 1 + coreText.length;
                }
            }
        }
    }

    setSelectionByOffsets(nodeEl, replaceStartOffset, replaceEndOffset);
    let success = false;
    try {
        success = document.execCommand('insertText', false, replacement);
    } catch {
        success = false;
    }

    if (!success) {
        const fullText = before + selected + after;
        const newText = fullText.slice(0, replaceStartOffset) + replacement + fullText.slice(replaceEndOffset);
        nodeEl.innerText = newText || '\u200B';
        nodeEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    setSelectionByOffsets(nodeEl, newSelectStart, newSelectEnd);
}

export function handleNodeEdit(nodeEl: HTMLElement): void {
    if (!nodeEl || isPresentationModeActive() || state.isReadonly) return;
    const nodeId = nodeEl.dataset.id;
    if (nodeEl.getAttribute('contenteditable') === 'true' || nodeEl.classList.contains('editing')) {
        nodeEl.focus();
        return;
    }
    const node = state.nodes.find(n => n.id === nodeId);
    if (node) {
        if (mode === 'move' || hasMovedDuringDrag) {
            return;
        }
        
        if (node.text && node.text.trim()) {
            pushHistory();
        }

        const originalText = node.text ?? '';
        const isVisuallyEmpty = !originalText.replace(/\u200B/g, '').trim();
        const safeText = originalText.replace(/ ( +)/g, match => ' ' + '\u00a0'.repeat(match.length - 1));
        nodeEl.innerText = isVisuallyEmpty ? '\u200B' : safeText;
        nodeEl.classList.remove('is-link', 'has-multiline');

        if (originalText.includes('\n')) {
            nodeEl.classList.add('has-multiline');
        }

        nodeEl.contentEditable = 'true';
        nodeEl.classList.add('editing');
        nodeEl.style.width = '';
        nodeEl.style.height = '';
        if (nodeEl.offsetWidth && nodeEl.offsetHeight) {
            node.w = nodeEl.offsetWidth;
            node.h = nodeEl.offsetHeight;
        } else {
            node.w = 102;
            node.h = 44;
        }
        render();

        try {
            nodeEl.focus({ preventScroll: true });
        } catch {
            nodeEl.focus();
        }

        let isComposing = false;
        const handleCompositionStart = () => {
            isComposing = true;
        };
        const handleCompositionEnd = () => {
            isComposing = false;
            handleInput();
        };
        nodeEl.addEventListener('compositionstart', handleCompositionStart);
        nodeEl.addEventListener('compositionend', handleCompositionEnd);

        const handleInput = () => {
            if (isComposing) return;
            const rawText = nodeEl.innerText.replace(/\u00a0/g, ' ').replace(/\u200B/g, '');
            if (!rawText.trim()) {
                nodeEl.classList.remove('has-multiline');
                if (nodeEl.innerText !== '\u200B') {
                    nodeEl.innerText = '\u200B';
                    const range = document.createRange();
                    range.selectNodeContents(nodeEl);
                    range.collapse(false);
                    const sel = window.getSelection();
                    if (sel) {
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            } else if (rawText.includes('\n')) {
                nodeEl.classList.add('has-multiline');
            } else {
                nodeEl.classList.remove('has-multiline');
            }

            if (node) {
                node.w = nodeEl.offsetWidth;
                node.h = nodeEl.offsetHeight;
                render();
            }
        };
        nodeEl.addEventListener('input', handleInput);
        
        requestAnimationFrame(() => {
            if (!nodeEl.isConnected) return;
            const range = document.createRange();
            range.selectNodeContents(nodeEl);
            range.collapse(false);
            const sel = window.getSelection();
            if (!sel) return;
            sel.removeAllRanges();
            sel.addRange(range);
        });

        let finished = false;
        const finishEdit = () => {
            if (finished) return;
            finished = true;
            if (activeEditFinish === finishEdit) activeEditFinish = null;
            nodeEl.contentEditable = 'false';
            nodeEl.classList.remove('editing');
            nodeEl.onblur = null;
            nodeEl.onkeydown = null;
            nodeEl.onpaste = null;
            nodeEl.removeEventListener('compositionstart', handleCompositionStart);
            nodeEl.removeEventListener('compositionend', handleCompositionEnd);
            nodeEl.removeEventListener('input', handleInput);
            const sel = window.getSelection();
            if (sel) sel.removeAllRanges();
            let newText = nodeEl.innerText.replace(/\u00a0/g, ' ').replace(/\u200B/g, '');
            
            if (!newText.trim()) {
                state.nodes = state.nodes.filter(n => n.id !== node.id);
                state.selection.delete(node.id);
            } else if (node.text !== newText) {
                node.text = newText;
            }
            if (newText.trim()) {
                commitNodeDisplayGeometry(node, nodeEl);
            } else {
                render();
            }
        };
        activeEditFinish = finishEdit;
        nodeEl.onblur = finishEdit;
        nodeEl.onpaste = (ev: ClipboardEvent) => {
            ev.preventDefault();
            const text = ev.clipboardData?.getData('text/plain') || '';
            let success = false;
            try {
                success = document.execCommand('insertText', false, text);
            } catch {
                success = false;
            }
            if (!success) {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    const textNode = document.createTextNode(text);
                    range.insertNode(textNode);
                    range.setStartAfter(textNode);
                    range.setEndAfter(textNode);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    nodeEl.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        };
        nodeEl.onkeydown = (ev: KeyboardEvent) => {
            if (ev.isComposing || ev.keyCode === 229) {
                return;
            }
            if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                ev.stopPropagation();
                nodeEl.blur();
                return;
            }
            if (ev.key === 'Escape') {
                ev.preventDefault();
                ev.stopPropagation();
                nodeEl.blur();
                return;
            }
            if (isModifier(ev) && !ev.shiftKey) {
                if (ev.code === 'KeyB' || ev.key === 'b' || ev.key === 'B') {
                    ev.preventDefault();
                    applyMarkdownFormat(nodeEl, 'bold');
                    return;
                }
                if (ev.code === 'KeyI' || ev.key === 'i' || ev.key === 'I') {
                    ev.preventDefault();
                    applyMarkdownFormat(nodeEl, 'italic');
                    return;
                }
            }
            ev.stopPropagation();
        };
    }
}

function getSelectionPositions(): Record<string, { x: number; y: number; type: 'node' | 'group' }> {
    const pos: Record<string, { x: number; y: number; type: 'node' | 'group' }> = {};
    state.selection.forEach(id => {
        const item = findItem(id);
        if (item) {
            const isGroup = 'memberIds' in item;
            pos[id] = { x: item.x, y: item.y, type: isGroup ? 'group' : 'node' };
            if (isGroup && (item as any).memberIds) {
                (item as any).memberIds.forEach((mid: string) => {
                    const m = state.nodes.find(n => n.id === mid);
                    if (m) pos[`member_${mid}`] = { x: m.x, y: m.y, type: 'node' };
                });
            }
        }
    });
    return pos;
}

function findItem(id: string): any {
    return state.nodes.find(n => n.id === id) || state.groups.find(g => g.id === id);
}

function updateSelectBox(x1: number, y1: number, x2: number, y2: number): void {
    if (!els.selectBox) return;
    const r = getStandardRect(x1, y1, x2, y2);
    els.selectBox.style.left = r.x + 'px';
    els.selectBox.style.top = r.y + 'px';
    els.selectBox.style.width = r.w + 'px';
    els.selectBox.style.height = r.h + 'px';
}

function cloneSelectionInPlace(): void {
    const mapping: Record<string, string> = {};
    const newNodes: CanvasNode[] = [];
    const newGroups: any[] = [];
    const newSelection = new Set<string>();
    state.nodes.forEach(n => {
        if (state.selection.has(n.id)) {
            const newId = uid();
            mapping[n.id] = newId;
            const newNode: CanvasNode = { ...n, id: newId };
            newNodes.push(newNode);
            newSelection.add(newId);
            if (dragStart && dragStart.initialPos[n.id]) {
                dragStart.initialPos[newId] = { ...dragStart.initialPos[n.id] };
            }
        }
    });
    state.groups.forEach((g: any) => {
        if (state.selection.has(g.id)) {
            const newId = uid();
            const newGroup = { ...g, id: newId };
            newGroup.memberIds = (g.memberIds || []).map((mid: string) => mapping[mid] || mid);
            newGroups.push(newGroup);
            newSelection.add(newId);
            if (dragStart && dragStart.initialPos[g.id]) {
                dragStart.initialPos[newId] = { ...dragStart.initialPos[g.id] };
            }
        }
    });
    state.nodes.push(...newNodes);
    state.groups.push(...newGroups);
    state.selection = newSelection;
}

export function createNodeAt(pos: { x: number; y: number }): CanvasNode {
    pushHistory();
    const color = getNearestNodeColor(pos);
    const node: CanvasNode = { id: uid(), text: '', x: pos.x, y: pos.y, w: 0, h: 0, color };
    state.nodes.push(node);
    state.selection.clear();
    state.selection.add(node.id);
    return node;
}

function getNearestNodeColor(pos: { x: number; y: number }): string {
    let nearest: CanvasNode | null = null;
    let minDist = Infinity;
    state.nodes.forEach(n => {
        const cx = n.x + (n.w || 0) / 2;
        const cy = n.y + (n.h || 0) / 2;
        const dist = Math.hypot(pos.x - cx, pos.y - cy);
        if (dist < minDist) {
            minDist = dist;
            nearest = n;
        }
    });
    if (nearest && minDist <= 300) {
        const c = (nearest as any).color;
        if (typeof c === 'number') {
            return CONFIG.colors[c] || 'c-white';
        }
        return c || 'c-white';
    }
    return 'c-white';
}

function getTouchPos(e: TouchEvent): { x: number; y: number } {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: 0, y: 0 };
}

let lastTapTime = 0;
let lastTapTarget: HTMLElement | null = null;
let initialPinchDist = 0;
let initialPinchScale = 1;
let pinchCenter = { x: 0, y: 0 };

function getPinchDist(e: TouchEvent): number {
    return Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
    );
}

function getPinchCenter(e: TouchEvent): { x: number; y: number } {
    return {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
    };
}
