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

// 给定源节点和方向，返回一个尺寸为 sw×sh 的被锚节点应放置的左上角坐标：
// 沿方向贴源节点对应边、距离 DISTANCE，在垂直方向上与源节点居中对齐。
// 幽灵和真节点都强制为 sw×sh，所以中线与源节点重合——连线水平，不下沉。
function computePosition(sourceNode, dir) {
    const sw = sourceNode.w;
    const sh = sourceNode.h;
    if (dir.dx === 1)  return { x: sourceNode.x + sw + DISTANCE, y: sourceNode.y };
    if (dir.dx === -1) return { x: sourceNode.x - sw - DISTANCE, y: sourceNode.y };
    if (dir.dy === 1)  return { x: sourceNode.x,                 y: sourceNode.y + sh + DISTANCE };
    if (dir.dy === -1) return { x: sourceNode.x,                 y: sourceNode.y - sh - DISTANCE };
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

export function handleDirectionalCreateStart(key) {
    if (state.selection.size !== 1) return false;

    const dir = DIRECTIONS[key];
    if (!dir) return false;

    if (ghostState && ghostState.key === key) {
        return true; // 长按方向键时不重复生成
    }
    if (ghostState) clearGhost();

    const sourceId = Array.from(state.selection)[0];
    const sourceNode = state.nodes.find(n => n.id === sourceId);
    if (!sourceNode) return false;

    const { x, y } = computePosition(sourceNode, dir);
    const gw = sourceNode.w;
    const gh = sourceNode.h;

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
    ghostLinkEl.setAttribute('marker-end', 'url(#arrowhead)');
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
        nodeEl: ghostNodeEl,
        linkEl: ghostLinkEl,
        isModifierDown: true,
        isArrowDown: true,
    };

    return true;
}

export function handleDirectionalCreateEnd(key, callbacks, releasedKeyType) {
    if (!ghostState || ghostState.key !== key) return false;

    if (releasedKeyType === 'arrow')        ghostState.isArrowDown = false;
    else if (releasedKeyType === 'modifier') ghostState.isModifierDown = false;

    // 修饰键和方向键全部松开后才提交真实节点
    if (ghostState.isArrowDown || ghostState.isModifierDown) return false;

    const { sourceNode, dir } = ghostState;
    clearGhost();

    pushHistory();

    const pos = computePosition(sourceNode, dir);
    const newId = uid();
    const newNode = {
        id: newId,
        text: '',
        x: pos.x,
        y: pos.y,
        color: sourceNode.color,
    };
    state.nodes.push(newNode);
    state.links.push({
        id: uid(),
        sourceId: sourceNode.id,
        targetId: newId,
        direction: 'target',
    });
    state.selection.clear();
    state.selection.add(newId);

    // 第一次 render 把 DOM 元素挂上去，sync 块按自然尺寸填上 w/h。
    // 随后 forceMinBoxSize 把空节点撑到源节点尺寸，并把 newNode.w/h 同步
    // 到"撑起来后"的 offsetWidth/Height——否则第二次 render 里连线几何会
    // 沿用自然尺寸，端点落进节点内部、箭头被本体盖住看不见。
    callbacks.render();
    const nodeEl = document.querySelector(`.node[data-id="${newId}"]`);
    if (nodeEl) {
        forceMinBoxSize(nodeEl, sourceNode.w, sourceNode.h);
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
