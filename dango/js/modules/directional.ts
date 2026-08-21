// modules/directional.ts
import { state, pushHistory } from './state.js';
import { uid, getEdgeIntersection } from './utils.js';
import { createLink } from './links.js';
import type { CanvasNode, LinkDirection } from './types.js';

interface DirectionOffset {
    dx: number;
    dy: number;
}

interface GhostState {
    key: string;
    dir: DirectionOffset;
    sourceNode: CanvasNode;
    targetBox: { w: number; h: number };
    lineMode: 'target' | 'none' | 'detached';
    nodeEl: HTMLElement;
    linkEl: SVGLineElement;
    isModifierDown: boolean;
    isArrowDown: boolean;
}

let ghostState: GhostState | null = null;

const DIRECTIONS: Record<string, DirectionOffset> = {
    'ArrowUp':    { dx:  0, dy: -1 },
    'ArrowDown':  { dx:  0, dy:  1 },
    'ArrowLeft':  { dx: -1, dy:  0 },
    'ArrowRight': { dx:  1, dy:  0 },
};

const DISTANCE = 80;
const DEFAULT_NODE_BOX_FALLBACK = { w: 102, h: 44 };
const GHOST_LINK_MODE_ORDER: Array<'target' | 'none' | 'detached'> = ['target', 'none', 'detached'];

function getDefaultNodeBoxSize(): { w: number; h: number } {
    if (typeof document === 'undefined') return { ...DEFAULT_NODE_BOX_FALLBACK };
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
function computePosition(
    sourceNode: { x: number; y: number; w: number; h: number },
    targetBox: { w: number; h: number },
    dir: DirectionOffset
): { x: number; y: number } {
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

function forceMinBoxSize(el: HTMLElement, targetW: number, targetH: number): void {
    const cs = getComputedStyle(el);
    const hp = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const vp = parseFloat(cs.paddingTop)  + parseFloat(cs.paddingBottom);
    const hb = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const vb = parseFloat(cs.borderTopWidth)  + parseFloat(cs.borderBottomWidth);
    el.style.minWidth  = `${Math.max(0, targetW - hp - hb)}px`;
    el.style.minHeight = `${Math.max(0, targetH - vp - vb)}px`;
}

function getNextGhostLinkMode(currentMode: 'target' | 'none' | 'detached'): 'target' | 'none' | 'detached' {
    const currentIndex = GHOST_LINK_MODE_ORDER.indexOf(currentMode);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    return GHOST_LINK_MODE_ORDER[(safeIndex + 1) % GHOST_LINK_MODE_ORDER.length];
}

function applyGhostLinkMode(ghost: GhostState | null): void {
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

function cycleGhostLinkMode(): void {
    if (!ghostState) return;
    ghostState.lineMode = getNextGhostLinkMode(ghostState.lineMode);
    applyGhostLinkMode(ghostState);
}

function setDirectionalAnchorMeta(node: any, sourceId: string, dir: DirectionOffset): void {
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

function clearDirectionalAnchorMeta(node: any): void {
    delete node._directionalSourceId;
    delete node._directionalDir;
}

export function realignDirectionalNodeAfterEdit(node: any): boolean {
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

function createDirectionalGhost(
    key: string,
    sourceNode: CanvasNode,
    dir: DirectionOffset,
    lineMode: 'target' | 'none' | 'detached' = 'target'
): boolean {
    if (typeof document === 'undefined') return false;
    const targetBox = getDefaultNodeBoxSize();
    const { x, y } = computePosition(sourceNode, targetBox, dir);
    const gw = targetBox.w;
    const gh = targetBox.h;

    const ghostNodeEl = document.createElement('div');
    ghostNodeEl.className = 'node';
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
    document.getElementById('nodes-layer')?.appendChild(ghostNodeEl);

    const ghostLinkEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ghostLinkEl.classList.add('ghost-link');
    ghostLinkEl.setAttribute('stroke', 'var(--link-color)');
    ghostLinkEl.setAttribute('stroke-width', '2');
    ghostLinkEl.setAttribute('stroke-dasharray', '5,5');
    ghostLinkEl.setAttribute('opacity', '0.5');
    document.getElementById('connections-layer')?.appendChild(ghostLinkEl);

    const ghostNodeObj = { x, y, w: gw, h: gh };
    const startPoint = getEdgeIntersection(ghostNodeObj, sourceNode);
    const endPoint   = getEdgeIntersection(sourceNode, ghostNodeObj);
    ghostLinkEl.setAttribute('x1', String(startPoint.x));
    ghostLinkEl.setAttribute('y1', String(startPoint.y));
    ghostLinkEl.setAttribute('x2', String(endPoint.x));
    ghostLinkEl.setAttribute('y2', String(endPoint.y));

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

export function handleDirectionalCreateStart(key: string, _e?: any): boolean {
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

export function handleDirectionalCreateEnd(
    key: string,
    callbacks: { render: () => void; handleNodeEdit?: (el: HTMLElement) => void },
    releasedKeyType?: 'arrow' | 'modifier'
): boolean {
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
    const newNode: CanvasNode = {
        id: newId,
        text: '',
        x: pos.x,
        y: pos.y,
        w: targetBox.w,
        h: targetBox.h,
        color: sourceNode.color,
    };
    setDirectionalAnchorMeta(newNode, sourceNode.id, dir);
    state.nodes.push(newNode);
    if (lineMode !== 'detached') {
        state.links.push(createLink({
            id: uid(),
            sourceId: sourceNode.id,
            targetId: newId,
            direction: lineMode as LinkDirection,
        }));
    }
    state.selection.clear();
    state.selection.add(newId);

    callbacks.render();
    if (typeof document !== 'undefined') {
        const nodeEl = document.querySelector<HTMLElement>(`.node[data-id="${newId}"]`);
        if (nodeEl) {
            forceMinBoxSize(nodeEl, targetBox.w, targetBox.h);
            newNode.w = nodeEl.offsetWidth;
            newNode.h = nodeEl.offsetHeight;
        }
    }
    callbacks.render();

    setTimeout(() => {
        if (typeof document !== 'undefined') {
            const el = document.querySelector<HTMLElement>(`.node[data-id="${newId}"]`);
            if (el && callbacks.handleNodeEdit) {
                callbacks.handleNodeEdit(el);
            }
        }
    }, 10);

    return true;
}

export function handleDirectionalModifierUp(callbacks: { render: () => void; handleNodeEdit?: (el: HTMLElement) => void }): void {
    if (ghostState) {
        handleDirectionalCreateEnd(ghostState.key, callbacks, 'modifier');
    }
}

export function clearDirectionalGhost(): void {
    clearGhost();
}

function clearGhost(): void {
    if (ghostState) {
        if (ghostState.nodeEl.parentNode) ghostState.nodeEl.remove();
        if (ghostState.linkEl.parentNode) ghostState.linkEl.remove();
        ghostState = null;
    }
}
