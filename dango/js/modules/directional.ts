// modules/directional.ts
import { state, pushHistory } from './state.js';
import { uid, getEdgeIntersection } from './utils.js';
import { createLink } from './links.js';
import type { CanvasNode, CanvasGroup, LinkDirection } from './types.js';

interface DirectionOffset {
    dx: number;
    dy: number;
}

interface GhostState {
    key: string;
    dir: DirectionOffset;
    sourceNode: CanvasNode | CanvasGroup;
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

export const DIRECTIONAL_DISTANCE = 48;
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

export const DIRECTIONAL_BRANCH_GAP = 20;

// 给定源节点、目标节点尺寸和方向，返回目标节点应放置的左上角坐标（支持已有同向分支的正交排队延伸）：
export function computePosition(
    sourceNode: { x: number; y: number; w: number; h: number; id?: string },
    targetBox: { w: number; h: number },
    dir: DirectionOffset,
    excludeNodeId?: string
): { x: number; y: number } {
    const sw = sourceNode.w;
    const sh = sourceNode.h;
    const tw = targetBox.w;
    const th = targetBox.h;

    // 默认基准位置（首个分支正交居中定位，标准外延 48px）
    let defaultPos = { x: sourceNode.x, y: sourceNode.y };
    if (dir.dx === 1)  defaultPos = { x: sourceNode.x + sw + DIRECTIONAL_DISTANCE, y: sourceNode.y + (sh - th) / 2 };
    if (dir.dx === -1) defaultPos = { x: sourceNode.x - tw - DIRECTIONAL_DISTANCE, y: sourceNode.y + (sh - th) / 2 };
    if (dir.dy === 1)  defaultPos = { x: sourceNode.x + (sw - tw) / 2, y: sourceNode.y + sh + DIRECTIONAL_DISTANCE };
    if (dir.dy === -1) defaultPos = { x: sourceNode.x + (sw - tw) / 2, y: sourceNode.y - th - DIRECTIONAL_DISTANCE };

    if (!sourceNode.id || !state?.links) {
        return defaultPos;
    }

    // 查找与 sourceNode 关联的所有外部连线节点
    const connectedLinks = state.links.filter(l => l.sourceId === sourceNode.id || l.targetId === sourceNode.id);
    const targetNodes: (CanvasNode | CanvasGroup)[] = [];
    connectedLinks.forEach(l => {
        const otherId = l.sourceId === sourceNode.id ? l.targetId : l.sourceId;
        if (!otherId || otherId === excludeNodeId) return;
        const target = state.nodes.find(n => n.id === otherId) || state.groups.find(g => g.id === otherId);
        if (target && !targetNodes.some(n => n.id === target.id)) {
            targetNodes.push(target);
        }
    });

    if (targetNodes.length === 0) {
        return defaultPos;
    }

    // 寻找各个方向的主根节点（与 sourceNode 沿主轴直接相连且正交居中对齐的首个子节点）
    const findPrimaryRoot = (axis: 'x' | 'y', sign: 1 | -1): (CanvasNode | CanvasGroup) | null => {
        let best: (CanvasNode | CanvasGroup) | null = null;
        let minOffset = Infinity;

        targetNodes.forEach(t => {
            const twVal = t.w || 0;
            const thVal = t.h || 0;
            if (axis === 'x') {
                // 水平方向：必须在 sourceNode 对应侧，且垂直方向与 sourceNode 重叠/对齐
                const inDir = sign === 1 ? (t.x >= sourceNode.x + sw - 15) : (t.x + twVal <= sourceNode.x + 15);
                const vOverlap = (t.y + thVal >= sourceNode.y - 15) && (t.y <= sourceNode.y + sh + 15);
                if (inDir && vOverlap) {
                    const offset = Math.abs((t.y + thVal / 2) - (sourceNode.y + sh / 2));
                    if (offset < minOffset) {
                        minOffset = offset;
                        best = t;
                    }
                }
            } else {
                // 垂直方向：必须在 sourceNode 对应侧，且水平方向与 sourceNode 重叠/对齐
                const inDir = sign === 1 ? (t.y >= sourceNode.y + sh - 15) : (t.y + thVal <= sourceNode.y + 15);
                const hOverlap = (t.x + twVal >= sourceNode.x - 15) && (t.x <= sourceNode.x + sw + 15);
                if (inDir && hOverlap) {
                    const offset = Math.abs((t.x + twVal / 2) - (sourceNode.x + sw / 2));
                    if (offset < minOffset) {
                        minOffset = offset;
                        best = t;
                    }
                }
            }
        });
        return best;
    };

    const rootRight = findPrimaryRoot('x', 1);
    const rootLeft  = findPrimaryRoot('x', -1);
    const rootDown  = findPrimaryRoot('y', 1);
    const rootUp    = findPrimaryRoot('y', -1);

    const sameDirTargets: (CanvasNode | CanvasGroup)[] = [];

    if (dir.dx === 1) { // 向右分支（纵向列排队）
        if (!rootRight) return defaultPos;
        targetNodes.forEach(t => {
            // 排除明确属于向下或向上分支的节点
            if (rootDown && t.id !== rootRight.id && Math.abs(t.y - rootDown.y) <= 8 && t.y >= sourceNode.y + sh - 10) return;
            if (rootUp && t.id !== rootRight.id && Math.abs(t.y - rootUp.y) <= 8 && t.y + (t.h || 0) <= sourceNode.y + 10) return;

            // X 轴需与右侧主根节点对齐，Y 轴向下顺延
            if (Math.abs(t.x - rootRight.x) <= 8 && t.y >= rootRight.y - 15) {
                sameDirTargets.push(t);
            }
        });
    } else if (dir.dx === -1) { // 向左分支（纵向列排队）
        if (!rootLeft) return defaultPos;
        const leftAnchor = rootLeft.x + (rootLeft.w || 0);
        targetNodes.forEach(t => {
            if (rootDown && t.id !== rootLeft.id && Math.abs(t.y - rootDown.y) <= 8 && t.y >= sourceNode.y + sh - 10) return;
            if (rootUp && t.id !== rootLeft.id && Math.abs(t.y - rootUp.y) <= 8 && t.y + (t.h || 0) <= sourceNode.y + 10) return;

            // 右边缘需与左侧主根节点右边缘对齐，Y 轴向下顺延
            if (Math.abs((t.x + (t.w || 0)) - leftAnchor) <= 8 && t.y >= rootLeft.y - 15) {
                sameDirTargets.push(t);
            }
        });
    } else if (dir.dy === 1) { // 向下分支（横向行排队）
        if (!rootDown) return defaultPos;
        targetNodes.forEach(t => {
            // 排除明确属于向右或向左分支的节点
            if (rootRight && t.id !== rootDown.id && Math.abs(t.x - rootRight.x) <= 8 && t.x >= sourceNode.x + sw - 10) return;
            if (rootLeft && t.id !== rootDown.id && Math.abs((t.x + (t.w || 0)) - (rootLeft.x + (rootLeft.w || 0))) <= 8 && t.x + (t.w || 0) <= sourceNode.x + 10) return;

            // Y 轴需与下方主根节点对齐，X 轴向右顺延
            if (Math.abs(t.y - rootDown.y) <= 8 && t.x >= rootDown.x - 15) {
                sameDirTargets.push(t);
            }
        });
    } else if (dir.dy === -1) { // 向上分支（横向行排队）
        if (!rootUp) return defaultPos;
        targetNodes.forEach(t => {
            if (rootRight && t.id !== rootUp.id && Math.abs(t.x - rootRight.x) <= 8 && t.x >= sourceNode.x + sw - 10) return;
            if (rootLeft && t.id !== rootUp.id && Math.abs((t.x + (t.w || 0)) - (rootLeft.x + (rootLeft.w || 0))) <= 8 && t.x + (t.w || 0) <= sourceNode.x + 10) return;

            // Y 轴需与上方主根节点对齐，X 轴向右顺延
            if (Math.abs(t.y - rootUp.y) <= 8 && t.x >= rootUp.x - 15) {
                sameDirTargets.push(t);
            }
        });
    }

    if (sameDirTargets.length === 0) {
        return defaultPos;
    }

    // 水平延伸（向右 / 向左）：新节点排在最靠下节点的正下方 (Y 轴顺延，X 与最靠下节点对齐)
    if (dir.dx === 1 || dir.dx === -1) {
        let lowestTarget = sameDirTargets[0];
        sameDirTargets.forEach(t => {
            if ((t.y + (t.h || 0)) > (lowestTarget.y + (lowestTarget.h || 0))) {
                lowestTarget = t;
            }
        });
        return {
            x: lowestTarget.x,
            y: lowestTarget.y + (lowestTarget.h || 0) + DIRECTIONAL_BRANCH_GAP
        };
    }

    // 垂直延伸（向下 / 向上）：新节点排在最靠右节点的右侧 (X 轴顺延，Y 与最靠右节点对齐)
    if (dir.dy === 1 || dir.dy === -1) {
        let rightmostTarget = sameDirTargets[0];
        sameDirTargets.forEach(t => {
            if ((t.x + (t.w || 0)) > (rightmostTarget.x + (rightmostTarget.w || 0))) {
                rightmostTarget = t;
            }
        });
        return {
            x: rightmostTarget.x + (rightmostTarget.w || 0) + DIRECTIONAL_BRANCH_GAP,
            y: rightmostTarget.y
        };
    }

    return defaultPos;
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

    const sourceNode = state.nodes.find(n => n.id === node._directionalSourceId) || state.groups.find(g => g.id === node._directionalSourceId);
    if (!sourceNode || !node.w || !node.h) {
        clearDirectionalAnchorMeta(node);
        return false;
    }

    const pos = computePosition(sourceNode, node, node._directionalDir, node.id);
    const moved = node.x !== pos.x || node.y !== pos.y;
    node.x = pos.x;
    node.y = pos.y;
    clearDirectionalAnchorMeta(node);
    return moved;
}

function createDirectionalGhost(
    key: string,
    sourceNode: CanvasNode | CanvasGroup,
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
    const sourceNode = state.nodes.find(n => n.id === sourceId) || state.groups.find(g => g.id === sourceId);
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
        color: sourceNode.color || 'c-white',
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
    if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
        const nodeEl = document.querySelector<HTMLElement>(`.node[data-id="${newId}"]`);
        if (nodeEl) {
            forceMinBoxSize(nodeEl, targetBox.w, targetBox.h);
            newNode.w = nodeEl.offsetWidth;
            newNode.h = nodeEl.offsetHeight;
        }
    }
    callbacks.render();

    setTimeout(() => {
        if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
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
