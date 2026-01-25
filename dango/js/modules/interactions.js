// modules/interactions.js
import { state, history, pushHistory, MAX_HISTORY } from './state.js';
import { render } from './render.js';
import { uid, screenToWorld, getStandardRect, isIntersect } from './utils.js';
import { changeZoom, cancelViewAnimation } from './view.js';
import { keys, isModifier } from './shortcuts.js';
import { processDangoFile } from './io.js';
import { els } from './dom.js';

let dragStart = null;
let mode = null;
let stateBeforeDrag = null;
let isPrepareToClone = false;
let targetAlreadySelectedAtStart = false;
let targetIdAtMouseDown = null;
let hasMovedDuringDrag = false;

export function initInteractions() {

    els.nodesLayer.addEventListener('click', e => {
        const checkboxWrapper = e.target.closest('.todo-checkbox-wrapper');
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
    });

    els.container.addEventListener('mousedown', e => {
        if (e.target.closest('.todo-checkbox-wrapper')) return;
        if (e.target.isContentEditable) return;
        cancelViewAnimation();
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
            render();
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
                        if (init.type === 'group') {
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
        mode = null;
        dragStart = null;
        isPrepareToClone = false;
        targetIdAtMouseDown = null;
        document.body.classList.remove('mode-pan');
    });

    els.container.addEventListener('wheel', e => {
        cancelViewAnimation();
        e.preventDefault();
        if (e.ctrlKey || e.metaKey || (state.settings.altAsCtrl && e.altKey)) {
            const factor = 1 + ((e.deltaY > 0 ? -1 : 1) * 0.1);
            changeZoom(factor, e.clientX, e.clientY);
        } else {
            state.view.x -= e.deltaX;
            state.view.y -= e.deltaY;
            render();
        }
    }, { passive: false });

    els.uiLayer.addEventListener('touchstart', (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        els.uiLayer.classList.add('mobile-active');
    }, { passive: true });

    els.container.addEventListener('touchstart', e => {
        els.uiLayer.classList.remove('mobile-active');
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
            handleNodeEdit(nodeEl);
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
                        if (init.type === 'group') {
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
        render();
        let createdEl = document.querySelector(`.node[data-id="${newNode.id}"]`);
        if (createdEl) {
            const width = createdEl.offsetWidth;
            const height = createdEl.offsetHeight;
            if (width && height) {
                newNode.x = worldPos.x - width / 2;
                newNode.y = worldPos.y - height / 2;
                newNode.w = width;
                newNode.h = height;
                render();
                createdEl = document.querySelector(`.node[data-id="${newNode.id}"]`);
            }
        }
        if (createdEl) handleNodeEdit(createdEl);
    });
}

export function handleNodeEdit(nodeEl) {
    if (!nodeEl) return;
    const node = state.nodes.find(n => n.id === nodeEl.dataset.id);
    if (node) {
        if (mode === 'move' || hasMovedDuringDrag) return;
        pushHistory();
        nodeEl.innerText = node.text;
        nodeEl.classList.remove('is-link', 'has-multiline');
        nodeEl.contentEditable = true;
        nodeEl.classList.add('editing');
        nodeEl.focus();
        const range = document.createRange();
        range.selectNodeContents(nodeEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const finishEdit = () => {
            nodeEl.contentEditable = false;
            nodeEl.classList.remove('editing');
            const sel = window.getSelection();
            if (sel) sel.removeAllRanges();
            let newText = nodeEl.innerText.replace(/\u00a0/g, ' ');
            if (!newText.trim()) newText = '';
            if (node.text !== newText) {
                node.text = newText;
            }
            render();
        };
        nodeEl.onblur = () => {
            nodeEl.onblur = null;
            finishEdit();
        };
        nodeEl.onkeydown = (ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                nodeEl.blur();
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
            pos[id] = { x: item.x, y: item.y, type: item.text ? 'node' : 'group' };
            if (!item.text && item.memberIds) {
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
    if (nearest && minDist <= 500) return nearest.color || 'c-white';
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
