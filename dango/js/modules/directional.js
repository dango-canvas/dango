// modules/directional.js
import { state, pushHistory } from './state.js';
import { uid, getEdgeIntersection } from './utils.js';

let ghostState = null;

const DIRECTIONS = {
    'ArrowUp':    { dx:  0, dy: -1 },
    'ArrowDown':  { dx:  0, dy:  1 },
    'ArrowLeft':  { dx: -1, dy:  0 },
    'ArrowRight': { dx:  1, dy:  0 },
};

const DISTANCE = 80;

const DEFAULT_NODE_BOX_FALLBACK = { w: 102, h: 44 };
const GHOST_LINK_MODE_ORDER = ['target', 'none', 'detached'];

function getDefaultNodeBoxSize() {
    const nodesLayer = document.getElementById('nodes-layer');
    if (!nodesLayer) return { ...DEFAULT_NODE_BOX_FALLBACK };

    const probeEl = document.createElement('div');
    probeEl.className = 'node editing';
    probeEl.textContent = '\u200B';
    probeEl.style.visibility = 'hidden';
    probeEl.style.pointerEvents = 'none';
    probeEl.style.left = '0';
    probeEl.style.top = '0';
    nodesLayer.appendChild(probeEl);

    const size = {
        w: probeEl.offsetWidth || DEFAULT_NODE_BOX_FALLBACK.w,
        h: probeEl.offsetHeight || DEFAULT_NODE_BOX_FALLBACK.h,
    };

    probeEl.remove();
    return size;
}

// 给定源节点、目标节点尺寸和方向，返回目标节点应放置的左上角坐标：
// 沿方向贴源节点对应边、距离 DISTANCE，并在垂直方向上居中对齐。
function computePosition(sourceNode, targetBox, dir) {
    const sw = sourceNode.w;
    const sh = sourceNode.h;
    const tw = targetBox.w;
    const th = targetBox.h;
    if (dir.dx === 1)  return { x: sourceNode.x + sw + DISTANCE, y: sourceNode.y + (sh - th) / 2 };
    if (dir.dx === -1) return { x: sourceNode.x - tw - DISTANCE, y: sourceNode.y + (sh - th) / 2 };
    if (dir.dy === 1)  return { x: sourceNode.x + (sw - tw) / 2, y: sourceNode.y + sh + DISTANCE };
    if (dir.dy === -1) return { x: sourceNode.x + (sw - tw) / 2, y: sourceNode.y - th - DISTANCE };
    return { x: sourceNode.x, y: sourceNode.y };
}

// content-box 下强制元素最小视觉尺寸到 targetW × targetH：
// min-width/min-height 按实际 padding/border 剔除，保证 offsetWidth/Height 恰好命中目标。
function forceMinBoxSize(el, targetW, targetH) {
    const cs = getComputedStyle(el);
    const hp = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const vp = parseFloat(cs.paddingTop)  + parseFloat(cs.paddingBottom);
    const hb = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const vb = parseFloat(cs.borderTopWidth)  + parseFloat(cs.borderBottomWidth);
    el.style.minWidth  = `${Math.max(0, targetW - hp - hb)}px`;
    el.style.minHeight = `${Math.max(0, targetH - vp - vb)}px`;
}

function getNextGhostLinkMode(currentMode) {
    const currentIndex = GHOST_LINK_MODE_ORDER.indexOf(currentMode);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    return GHOST_LINK_MODE_ORDER[(safeIndex + 1) % GHOST_LINK_MODE_ORDER.length];
}

function applyGhostLinkMode(ghost) {
    if (!ghost?.linkEl) return;

    const { linkEl, lineMode } = ghost;
    linkEl.style.display = lineMode === 'detached' ? 'none' : '';
    linkEl.removeAttribute('marker-start');

    if (lineMode === 'target') {
        linkEl.setAttribute('marker-end', 'url(#arrowhead)');
    } else {
        linkEl.removeAttribute('marker-end');
    }
}

function cycleGhostLinkMode() {
    if (!ghostState) return;
    ghostState.lineMode = getNextGhostLinkMode(ghostState.lineMode);
    applyGhostLinkMode(ghostState);
}

function setDirectionalAnchorMeta(node, sourceId, dir) {
    Object.defineProperty(node, '_directionalSourceId', {
        value: sourceId,
        writable: true,
        configurable: true,
    });
    Object.defineProperty(node, '_directionalDir', {
        value: { ...dir },
        writable: true,
        configurable: true,
    });
}

function clearDirectionalAnchorMeta(node) {
    delete node._directionalSourceId;
    delete node._directionalDir;
}

export function realignDirectionalNodeAfterEdit(node) {
    if (!node?._directionalSourceId || !node?._directionalDir) return false;

    const sourceNode = state.nodes.find(n => n.id === node._directionalSourceId);
    if (!sourceNode || !node.w || !node.h) {
        clearDirectionalAnchorMeta(node);
        return false;
    }

    const pos = computePosition(sourceNode, node, node._directionalDir);
    const moved = node.x !== pos.x || node.y !== pos.y;
    node.x = pos.x;
    node.y = pos.y;
    clearDirectionalAnchorMeta(node);
    return moved;
}

function createDirectionalGhost(key, sourceNode, dir, lineMode = 'target') {
    const targetBox = getDefaultNodeBoxSize();
    const { x, y } = computePosition(sourceNode, targetBox, dir);
    const gw = targetBox.w;
    const gh = targetBox.h;

    const ghostNodeEl = document.createElement('div');
    ghostNodeEl.className = 'node';
    // 幽灵用 border-box，style.width/height 直接等于视觉尺寸，
    // 跟真节点（content-box，但 offsetWidth 含 padding/border）在"外包围盒"这层对齐。
    ghostNodeEl.style.boxSizing = 'border-box';
    ghostNodeEl.style.left = `${x}px`;
    ghostNodeEl.style.top = `${y}px`;
    ghostNodeEl.style.width = `${gw}px`;
    ghostNodeEl.style.height = `${gh}px`;
    ghostNodeEl.style.opacity = '0.4';
    ghostNodeEl.style.border = '2px dashed var(--link-color)';
    ghostNodeEl.style.backgroundColor = 'transparent';
    ghostNodeEl.style.pointerEvents = 'none';
    ghostNodeEl.style.zIndex = '0';
    document.getElementById('nodes-layer').appendChild(ghostNodeEl);

    const ghostLinkEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ghostLinkEl.classList.add('ghost-link');
    ghostLinkEl.setAttribute('stroke', 'var(--link-color)');
    ghostLinkEl.setAttribute('stroke-width', '2');
    ghostLinkEl.setAttribute('stroke-dasharray', '5,5');
    ghostLinkEl.setAttribute('opacity', '0.5');
    document.getElementById('connections-layer').appendChild(ghostLinkEl);

    const ghostNodeObj = { x, y, w: gw, h: gh };
    const startPoint = getEdgeIntersection(ghostNodeObj, sourceNode);
    const endPoint   = getEdgeIntersection(sourceNode, ghostNodeObj);
    ghostLinkEl.setAttribute('x1', startPoint.x);
    ghostLinkEl.setAttribute('y1', startPoint.y);
    ghostLinkEl.setAttribute('x2', endPoint.x);
    ghostLinkEl.setAttribute('y2', endPoint.y);

    ghostState = {
        key,
        dir,
        sourceNode,
        targetBox,
        lineMode,
        nodeEl: ghostNodeEl,
        linkEl: ghostLinkEl,
        isModifierDown: true,
        isArrowDown: true,
    };

    applyGhostLinkMode(ghostState);
    return true;
}

export function handleDirectionalCreateStart(key) {
    if (state.selection.size !== 1) return false;

    const dir = DIRECTIONS[key];
    if (!dir) return false;

    if (ghostState && ghostState.key === key) {
        if (ghostState.isArrowDown) {
            return true; // 长按方向键时不重复生成/循环
        }
        ghostState.isArrowDown = true;
        cycleGhostLinkMode();
        return true;
    }

    const preservedLineMode = ghostState?.lineMode || 'target';
    if (ghostState) clearGhost();

    const sourceId = Array.from(state.selection)[0];
    const sourceNode = state.nodes.find(n => n.id === sourceId);
    if (!sourceNode) return false;

    return createDirectionalGhost(key, sourceNode, dir, preservedLineMode);
}

export function handleDirectionalCreateEnd(key, callbacks, releasedKeyType) {
    if (!ghostState || ghostState.key !== key) return false;

    if (releasedKeyType === 'arrow')        ghostState.isArrowDown = false;
    else if (releasedKeyType === 'modifier') ghostState.isModifierDown = false;

    // 修饰键和方向键全部松开后才提交真实节点
    if (ghostState.isArrowDown || ghostState.isModifierDown) return false;

    const { sourceNode, dir, targetBox, lineMode } = ghostState;
    clearGhost();

    pushHistory();

    const pos = computePosition(sourceNode, targetBox, dir);
    const newId = uid();
    const newNode = {
        id: newId,
        text: '',
        x: pos.x,
        y: pos.y,
        color: sourceNode.color,
    };
    setDirectionalAnchorMeta(newNode, sourceNode.id, dir);
    state.nodes.push(newNode);
    if (lineMode !== 'detached') {
        state.links.push({
            id: uid(),
            sourceId: sourceNode.id,
            targetId: newId,
            direction: lineMode,
        });
    }
    state.selection.clear();
    state.selection.add(newId);

    // 第一次 render 把 DOM 元素挂上去，sync 块按自然尺寸填上 w/h。
    // 随后 forceMinBoxSize 把空节点撑到普通空节点尺寸，并把 newNode.w/h 同步
    // 到"撑起来后"的 offsetWidth/Height——否则第二次 render 里连线几何会
    // 沿用自然尺寸，端点落进节点内部、箭头被本体盖住看不见。
    callbacks.render();
    const nodeEl = document.querySelector(`.node[data-id="${newId}"]`);
    if (nodeEl) {
        forceMinBoxSize(nodeEl, targetBox.w, targetBox.h);
        newNode.w = nodeEl.offsetWidth;
        newNode.h = nodeEl.offsetHeight;
    }
    callbacks.render();

    setTimeout(() => {
        const el = document.querySelector(`.node[data-id="${newId}"]`);
        if (el && callbacks.handleNodeEdit) {
            callbacks.handleNodeEdit(el);
        }
    }, 10);

    return true;
}

export function handleDirectionalModifierUp(callbacks) {
    if (ghostState) {
        handleDirectionalCreateEnd(ghostState.key, callbacks, 'modifier');
    }
}

export function clearDirectionalGhost() {
    clearGhost();
}

function clearGhost() {
    if (ghostState) {
        if (ghostState.nodeEl.parentNode) ghostState.nodeEl.remove();
        if (ghostState.linkEl.parentNode) ghostState.linkEl.remove();
        ghostState = null;
    }
}
