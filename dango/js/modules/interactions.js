// modules/interactions.js
import { state, history, pushHistory, MAX_HISTORY, saveData } from './state.js';
import { render, updateViewTransform } from './render.js';
import { uid, screenToWorld, getStandardRect, isIntersect } from './utils.js';
import { changeZoom, cancelViewAnimation, fitView, animateView } from './view.js';
import { keys, isModifier } from './shortcuts.js';
import { processDangoFile } from './io.js';
import { els } from './dom.js';
import { realignDirectionalNodeAfterEdit } from './directional.js';

let dragStart = null;
let mode = null;
let stateBeforeDrag = null;
let isPrepareToClone = false;
let targetAlreadySelectedAtStart = false;
let targetIdAtMouseDown = null;
let hasMovedDuringDrag = false;
let activeEditFinish = null;
let lastMiddleClickTime = 0;
let middleClickCount = 0;
let isGlobalViewActive = false;
let preGlobalViewScale = 1;

function cancelTransientInteraction() {
    mode = null;
    dragStart = null;
    stateBeforeDrag = null;
    isPrepareToClone = false;
    targetAlreadySelectedAtStart = false;
    targetIdAtMouseDown = null;
    hasMovedDuringDrag = false;
    document.body.classList.remove('mode-pan');
    if (els.selectBox) els.selectBox.style.display = 'none';
}

function forceFinishActiveEdit() {
    if (typeof activeEditFinish === 'function') {
        activeEditFinish();
        return;
    }
    const editingNode = document.querySelector('.node.editing');
    if (editingNode?.isContentEditable) {
        editingNode.onblur = null;
        editingNode.onkeydown = null;
        editingNode.onpaste = null;
        editingNode.contentEditable = false;
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

function commitNodeDisplayGeometry(node, nodeEl) {
    // 编辑态的普通盒子是临时视觉状态；退出编辑后，这里负责提交展示态几何。
    // 流程：强制展示态重渲染 -> 提交最终尺寸 -> 重算依赖这些尺寸的布局约束。
    delete nodeEl.dataset.lastText;
    render();

    const didRealign = realignDirectionalNodeAfterEdit(node);
    if (didRealign) {
        render();
    }
}

export function initInteractions() {

    els.nodesLayer.addEventListener('click', e => {
        const target = e.target instanceof Element ? e.target : e.target.parentElement;
        const inlineLink = target?.closest('.node-inline-link');
        if (inlineLink) {
            e.stopPropagation();
            return;
        }
        const checkboxWrapper = target?.closest('.todo-checkbox-wrapper');
        if (!checkboxWrapper) return;
        e.stopPropagation();
        const nodeEl = checkboxWrapper.closest('.node');
        if (!nodeEl) return;
        const nodeId = nodeEl.dataset.id;
        const node = state.nodes.find(n => n.id === nodeId);
        if (!node) return;
        const todoItem = checkboxWrapper.closest('.todo-item');
        const allTodosInNode = Array.from(nodeEl.querySelectorAll('.todo-item'));
        const clickedIndex = allTodosInNode.indexOf(todoItem);
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
        els.container.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });
    els.container.addEventListener('dragover', () => {
        els.container.classList.add('drag-over');
    });
    ['dragleave', 'drop'].forEach(eventName => {
        els.container.addEventListener(eventName, () => {
            els.container.classList.remove('drag-over');
        });
    });
    els.container.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        processDangoFile(file);
    });

    // 输入框快捷键绑定由 UI 层处理

    window.addEventListener('mousemove', (e) => {
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

    els.container.addEventListener('mousedown', e => {
        if (e.target.closest('.todo-checkbox-wrapper')) return;
        if (e.target.isContentEditable) return;
        cancelViewAnimation();
        hasMovedDuringDrag = false; // 每次按下鼠标时重置移动状态

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
                document.body.classList.add('mode-pan'); // 借用 pan 的样式
                return;
            }
        } else {
            middleClickCount = 0;
        }

        if (e.target.closest('.node') && e.detail === 2) return;
        if (e.button === 1 || (e.button === 0 && keys.Space)) {
            mode = 'pan';
            dragStart = { x: e.clientX, y: e.clientY, viewX: state.view.x, viewY: state.view.y };
            document.body.classList.add('mode-pan');
            return;
        }
        if (e.button === 0) {
            const nodeEl = e.target.closest('.node');
            const groupEl = e.target.closest('.group');
            const worldPos = screenToWorld(e.clientX, e.clientY, state.view);
            if (nodeEl || groupEl) {
                const id = (nodeEl || groupEl).dataset.id;
                targetIdAtMouseDown = id;
                targetAlreadySelectedAtStart = state.selection.has(id);
                hasMovedDuringDrag = false;
                if (isModifier(e)) {
                    state.selection.add(id);
                    isPrepareToClone = true;
                    render();
                } else {
                    if (!targetAlreadySelectedAtStart) {
                        state.selection.clear();
                        state.selection.add(id);
                        render();
                    }
                    isPrepareToClone = false;
                }
                mode = 'move';
                stateBeforeDrag = JSON.stringify({ nodes: state.nodes, groups: state.groups, links: state.links });
                dragStart = { x: worldPos.x, y: worldPos.y, initialPos: getSelectionPositions() };
            } else {
                if (!isModifier(e) && !e.shiftKey) state.selection.clear();
                mode = 'box';
                dragStart = { x: e.clientX, y: e.clientY };
                els.selectBox.style.display = 'block';
                updateSelectBox(e.clientX, e.clientY, e.clientX, e.clientY);
                render();
            }
        }
    });

    els.container.addEventListener('mousemove', e => {
        if (!mode) return;
        if (mode === 'pan') {
            state.view.x = dragStart.viewX + (e.clientX - dragStart.x);
            state.view.y = dragStart.viewY + (e.clientY - dragStart.y);
            updateViewTransform();
        } else if (mode === 'move') {
            const worldPos = screenToWorld(e.clientX, e.clientY, state.view);
            const dx = worldPos.x - dragStart.x;
            const dy = worldPos.y - dragStart.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                hasMovedDuringDrag = true;
                if (isPrepareToClone) {
                    cloneSelectionInPlace();
                    isPrepareToClone = false;
                }
            }
            state.selection.forEach(id => {
                const init = dragStart.initialPos[id];
                if (init) {
                    const item = findItem(id);
                    if (item) {
                        item.x = init.x + dx; item.y = init.y + dy;
                        if (init.type === 'group' && item.memberIds) {
                            item.memberIds.forEach(mid => {
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

    els.container.addEventListener('mouseup', e => {
        if (e.button === 1 && isGlobalViewActive) {
            isGlobalViewActive = false;
            middleClickCount = 0;
            const worldPos = screenToWorld(e.clientX, e.clientY, state.view);
            // 恢复到之前的缩放比例，或者至少是一个合理的比例
            const targetScale = Math.max(preGlobalViewScale, 0.8);
            const targetX = window.innerWidth / 2 - worldPos.x * targetScale;
            const targetY = window.innerHeight / 2 - worldPos.y * targetScale;
            animateView(targetX, targetY, targetScale, 500);
            mode = null;
            document.body.classList.remove('mode-pan');
            return;
        }

        if (mode === 'move') {
            if (!hasMovedDuringDrag && isModifier(e) && targetAlreadySelectedAtStart) {
                state.selection.delete(targetIdAtMouseDown);
                render();
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
            [...state.nodes, ...state.groups].forEach(item => { if (isIntersect(worldRect, item)) state.selection.add(item.id); });
            els.selectBox.style.display = 'none';
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

let wheelSaveTimeout;

    els.container.addEventListener('wheel', e => {
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

    els.uiLayer.addEventListener('touchstart', (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        els.uiLayer.classList.add('mobile-expanded');
    }, { passive: true });

    document.addEventListener('touchstart', (e) => {
        if (!els.uiLayer.contains(e.target)) {
            els.uiLayer.classList.remove('mobile-expanded');
            if (document.activeElement && els.uiLayer.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        }
    }, { passive: true });

    els.container.addEventListener('touchstart', e => {
        els.uiLayer.classList.remove('mobile-expanded');
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        cancelViewAnimation();
        if (e.touches.length === 2) {
            e.preventDefault();
            mode = 'pinch';
            initialPinchDist = getPinchDist(e);
            initialPinchScale = state.view.scale;
            const center = getPinchCenter(e);
            pinchCenter = screenToWorld(center.x, center.y, state.view);
            return;
        }
        if (e.target.tagName === 'TEXTAREA' || e.target.closest('.header-btn')) return;
        if (!e.target.isContentEditable) e.preventDefault();
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTapTime;
        const nodeEl = e.target.closest('.node');
        if (tapLength < 300 && tapLength > 0 && nodeEl && lastTapTarget === nodeEl) {
            if (!nodeEl.isContentEditable) handleNodeEdit(nodeEl);
            lastTapTarget = null;
            lastTapTime = 0;
            return;
        }
        lastTapTarget = nodeEl;
        lastTapTime = currentTime;
        const pos = getTouchPos(e);
        const groupEl = e.target.closest('.group');
        if (nodeEl || groupEl) {
            const id = (nodeEl || groupEl).dataset.id;
            if (!state.selection.has(id)) {
                state.selection.clear();
                state.selection.add(id);
                render();
            }
            mode = 'move';
            hasMovedDuringDrag = false;
            stateBeforeDrag = JSON.stringify({ nodes: state.nodes, groups: state.groups, links: state.links, selection: Array.from(state.selection) });
            const worldPos = screenToWorld(pos.x, pos.y, state.view);
            dragStart = { x: worldPos.x, y: worldPos.y, initialPos: getSelectionPositions() };
        } else {
            state.selection.clear();
            render();
            mode = 'pan';
            dragStart = { x: pos.x, y: pos.y, viewX: state.view.x, viewY: state.view.y };
        }
    }, { passive: false });

    els.container.addEventListener('touchmove', e => {
        if (!mode) return;
        e.preventDefault();
        if (mode === 'pinch' && e.touches.length === 2) {
            const currentDist = getPinchDist(e);
            if (currentDist > 0) {
                const scaleFactor = currentDist / initialPinchDist;
                let newScale = initialPinchScale * scaleFactor;
                newScale = Math.max(0.1, Math.min(5, newScale));
                state.view.scale = newScale;
                render();
            }
            return;
        }
        const pos = getTouchPos(e);
        if (mode === 'pan') {
            state.view.x = dragStart.viewX + (pos.x - dragStart.x);
            state.view.y = dragStart.viewY + (pos.y - dragStart.y);
            cancelViewAnimation();
            render();
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
                        if (init.type === 'group' && item.memberIds) {
                            item.memberIds.forEach(mid => {
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
        }
    }, { passive: false });

    els.container.addEventListener('touchend', e => {
        if (mode === 'move' && stateBeforeDrag) {
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
        stateBeforeDrag = null;
        mode = null;
        dragStart = null;
        initialPinchDist = 0;
    });

    els.container.addEventListener('dblclick', e => {
        const editingNodeEl = e.target.closest('.node');
        if (editingNodeEl?.isContentEditable) return;
        const nodeEl = e.target.closest('.node');
        if (nodeEl) {
            handleNodeEdit(nodeEl);
            return;
        }
        if (e.target.closest('.group')) return;
        if (e.target.closest('#ui-layer')) return;
        const worldPos = screenToWorld(e.clientX, e.clientY, state.view);
        const newNode = createNodeAt(worldPos);
        if (!newNode) return;

        // 核心修复：直接给定一个合理的初始 w/h 默认值，而不是依赖 DOM 测量
        // 这样可以确保 newNode.x/y 计算是稳定的，不会因为 offsetWidth 为 0 导致怪异尺寸
        newNode.w = 120; // 默认宽度
        newNode.h = 44;  // 默认高度
        newNode.x = worldPos.x - newNode.w / 2;
        newNode.y = worldPos.y - newNode.h / 2;

        render();
        const createdEl = document.querySelector(`.node[data-id="${newNode.id}"]`);
        if (createdEl) handleNodeEdit(createdEl);
    });
}

/**
 * 设置 contenteditable 元素内的字符偏移选区
 */
function setSelectionByOffsets(root, startOffset, endOffset) {
    const sel = window.getSelection();
    if (!sel) return;

    let currentOffset = 0;
    let startNode = null;
    let startNodeOffset = 0;
    let endNode = null;
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
        const nodeLength = node.nodeValue.length;
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
        range.setStart(startNode, Math.max(0, Math.min(startNodeOffset, startNode.nodeValue.length)));
        range.setEnd(endNode, Math.max(0, Math.min(endNodeOffset, endNode.nodeValue.length)));
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

export function applyMarkdownFormat(nodeEl, formatType) {
    if (!nodeEl || !nodeEl.isContentEditable) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!nodeEl.contains(range.commonAncestorContainer)) return;

    // 获取选区前、中、后的文本内容
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

    // 特殊处理仅包含占位符 \u200B 的空状态
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
        // 1. 检查选区自身是否已被粗体标记包裹
        if ((selected.startsWith('***') && selected.endsWith('***') && selected.length >= 6) ||
            (selected.startsWith('___') && selected.endsWith('___') && selected.length >= 6)) {
            // 剥离 ** 或 __，保留斜体
            replacement = selected.slice(2, -2);
            newSelectStart = startOffset;
            newSelectEnd = startOffset + replacement.length;
        } else if ((selected.startsWith('**') && selected.endsWith('**') && selected.length >= 4) ||
                   (selected.startsWith('__') && selected.endsWith('__') && selected.length >= 4)) {
            // 剥离 ** 或 __
            replacement = selected.slice(2, -2);
            newSelectStart = startOffset;
            newSelectEnd = startOffset + replacement.length;
        }
        // 2. 检查选区两端上下文是否已被粗体标记包裹
        else if ((before.endsWith('***') && after.startsWith('***')) ||
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
        }
        // 3. 执行粗体包裹
        else {
            if (!selected) {
                // 光标处于空粗体 **|** 中时，按 Ctrl+B 还原剥离
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
        // 1. 检查选区自身是否已被斜体标记包裹
        if ((selected.startsWith('***') && selected.endsWith('***') && selected.length >= 6) ||
            (selected.startsWith('___') && selected.endsWith('___') && selected.length >= 6)) {
            // 剥离 * 或 _，保留粗体
            replacement = selected.slice(1, -1);
            newSelectStart = startOffset;
            newSelectEnd = startOffset + replacement.length;
        } else if ((selected.startsWith('*') && selected.endsWith('*') && selected.length >= 2 && !(selected.startsWith('**') && selected.endsWith('**'))) ||
                   (selected.startsWith('_') && selected.endsWith('_') && selected.length >= 2 && !(selected.startsWith('__') && selected.endsWith('__')))) {
            // 剥离 * 或 _
            replacement = selected.slice(1, -1);
            newSelectStart = startOffset;
            newSelectEnd = startOffset + replacement.length;
        }
        // 2. 检查选区两端上下文是否已被斜体标记包裹
        else if ((before.endsWith('***') && after.startsWith('***')) ||
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
        }
        // 3. 执行斜体包裹
        else {
            if (!selected) {
                // 光标处于空斜体 *|* 中时，按 Ctrl+I 还原剥离
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

export function handleNodeEdit(nodeEl) {
    if (!nodeEl) return;
    const nodeId = nodeEl.dataset.id;
    if (nodeEl.isContentEditable || nodeEl.classList.contains('editing')) {
        nodeEl.focus();
        return;
    }
    const node = state.nodes.find(n => n.id === nodeId);
    if (node) {
        if (mode === 'move' || hasMovedDuringDrag) {
            console.log('[Interaction] Cancel edit due to move/drag:', { mode, hasMovedDuringDrag });
            return;
        }
        
        // 如果是新创建且尚无文字的节点，我们不需要在这里再次 pushHistory，
        // 因为 dblclick 处理函数已经 push 过了。
        // 如果是编辑已有文字的节点，我们需要 pushHistory。
        if (node.text && node.text.trim()) {
            pushHistory();
        }

        const originalText = node.text ?? '';
        const isVisuallyEmpty = !originalText.replace(/\u200B/g, '').trim();
        // 将连续空格替换为 \u00a0 以防止在 contenteditable 中视觉塌陷
        const safeText = originalText.replace(/ ( +)/g, match => ' ' + '\u00a0'.repeat(match.length - 1));
        nodeEl.innerText = isVisuallyEmpty ? '\u200B' : safeText;
        nodeEl.classList.remove('is-link', 'has-multiline');

        // 初始判断是否有多行
        if (originalText.includes('\n')) {
            nodeEl.classList.add('has-multiline');
        }

        nodeEl.contentEditable = true;
        nodeEl.classList.add('editing');
        // 编辑时立刻清除固定尺寸，让其自适应 Markdown 文本
        nodeEl.style.width = '';
        nodeEl.style.height = '';
        try {
            nodeEl.focus({ preventScroll: true });
        } catch {
            nodeEl.focus();
        }

        // 监听输入，动态切换多行对齐样式及清理空态 DOM 残留
        const handleInput = () => {
            const rawText = nodeEl.innerText.replace(/\u00a0/g, ' ').replace(/\u200B/g, '');
            if (!rawText.trim()) {
                nodeEl.classList.remove('has-multiline');
                // 当内容被删空时，统一收敛为单个 \u200B，使 Firefox 和 Chrome 的光标均严格居中且杜绝 Chrome 标签残留膨胀
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
        };
        nodeEl.addEventListener('input', handleInput);
        
        // 将光标移至末尾
        requestAnimationFrame(() => {
            if (!nodeEl.isConnected) return;
            const range = document.createRange();
            range.selectNodeContents(nodeEl);
            range.collapse(false); // collapse to end
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
            nodeEl.contentEditable = false;
            nodeEl.classList.remove('editing');
            nodeEl.onblur = null;
            nodeEl.onkeydown = null;
            nodeEl.onpaste = null;
            nodeEl.removeEventListener('input', handleInput);
            const sel = window.getSelection();
            if (sel) sel.removeAllRanges();
            let newText = nodeEl.innerText.replace(/\u00a0/g, ' ').replace(/\u200B/g, '');
            
            // 如果新节点没有输入文字，失去焦点后让它消失
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
        nodeEl.onpaste = (ev) => {
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
        nodeEl.onkeydown = (ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                nodeEl.blur();
                return;
            }
            if (ev.key === 'Escape') {
                ev.preventDefault();
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

function getSelectionPositions() {
    const pos = {};
    state.selection.forEach(id => {
        const item = findItem(id);
        if (item) {
            // 改进类型检测：直接检查是否存在 memberIds，而非依赖 text 是否为空
            const isGroup = 'memberIds' in item;
            pos[id] = { x: item.x, y: item.y, type: isGroup ? 'group' : 'node' };
            if (isGroup && item.memberIds) {
                item.memberIds.forEach(mid => { const m = state.nodes.find(n => n.id === mid); if (m) pos[`member_${mid}`] = { x: m.x, y: m.y }; });
            }
        }
    });
    return pos;
}
function findItem(id) { return state.nodes.find(n => n.id === id) || state.groups.find(g => g.id === id); }
function updateSelectBox(x1, y1, x2, y2) {
    const r = getStandardRect(x1, y1, x2, y2);
    els.selectBox.style.left = r.x + 'px'; els.selectBox.style.top = r.y + 'px';
    els.selectBox.style.width = r.w + 'px'; els.selectBox.style.height = r.h + 'px';
}

function cloneSelectionInPlace() {
    const mapping = {};
    const newNodes = [];
    const newGroups = [];
    const newSelection = new Set();
    state.nodes.forEach(n => {
        if (state.selection.has(n.id)) {
            const newId = uid();
            mapping[n.id] = newId;
            const newNode = { ...n, id: newId };
            newNodes.push(newNode);
            newSelection.add(newId);
            if (dragStart && dragStart.initialPos[n.id]) {
                dragStart.initialPos[newId] = { ...dragStart.initialPos[n.id] };
            }
        }
    });
    state.groups.forEach(g => {
        if (state.selection.has(g.id)) {
            const newId = uid();
            const newGroup = { ...g, id: newId };
            newGroup.memberIds = g.memberIds.map(mid => mapping[mid] || mid);
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

function createNodeAt(pos) {
    pushHistory();
    const color = getNearestNodeColor(pos);
    const node = { id: uid(), text: '', x: pos.x, y: pos.y, w: 0, h: 0, color };
    state.nodes.push(node);
    state.selection.clear();
    state.selection.add(node.id);
    return node;
}

function getNearestNodeColor(pos) {
    let nearest = null;
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
    if (nearest && minDist <= 300) return nearest.color || 'c-white';
    return 'c-white';
}

function getTouchPos(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: 0, y: 0 };
}
let lastTapTime = 0;
let lastTapTarget = null;
let initialPinchDist = 0;
let initialPinchScale = 1;
let pinchCenter = { x: 0, y: 0 };
function getPinchDist(e) {
    return Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
    );
}
function getPinchCenter(e) {
    return {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
    };
}
