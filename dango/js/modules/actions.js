// --- START: CREATE NEW FILE modules/actions.js ---
import { state, history, pushHistory, MAX_HISTORY, CONFIG } from './state.js';
import { render } from './render.js';
import { uid, isUrl } from './utils.js';
import { showToast } from './ui.js';
import { getTexts } from './i18n.js';
import { els } from './dom.js';
import { createLink, cycleLinkStrokeStyle } from './links.js';

// --- Helpers (内部函数，不导出) ---
function findItem(id) {
    return state.nodes.find(n => n.id === id) || state.groups.find(g => g.id === id);
}

function setItemPos(item, newX, newY) {
    const dx = newX - item.x;
    const dy = newY - item.y;
    item.x = newX;
    item.y = newY;
    if ('memberIds' in item && item.memberIds) { // It's a group
        item.memberIds.forEach(mid => {
            const m = state.nodes.find(n => n.id === mid);
            if (m) {
                m.x += dx;
                m.y += dy;
            }
        });
    }
}


// --- Exported Actions ---

export function createNodesFromInput(text) {
    const inputText = text || els.input.value;
    if (!inputText || !inputText.trim()) return;

    pushHistory();

    // 智能拆分逻辑：保留引号内的完整内容，同时识别换行和逗号
    const parseGrid = (str) => {
        const rows = [];
        let currentRow = [];
        let currentItem = "";
        let inQuotes = false;
        let quoteChar = "";
        const openQuotes = ['"', "'", '“', '‘'];
        const closeQuotes = { '"': '"', "'": "'", '“': '”', '‘': '’' };

        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (inQuotes) {
                if (char === quoteChar) {
                    inQuotes = false;
                    quoteChar = "";
                } else {
                    currentItem += char;
                }
            } else {
                if (openQuotes.includes(char)) {
                    inQuotes = true;
                    quoteChar = closeQuotes[char];
                } else if (char === '\n') {
                    if (currentItem.trim()) currentRow.push(currentItem.trim());
                    if (currentRow.length > 0) rows.push(currentRow);
                    currentRow = [];
                    currentItem = "";
                } else if (char === ',' || char === '，') {
                    if (currentItem.trim()) currentRow.push(currentItem.trim());
                    currentItem = "";
                } else {
                    currentItem += char;
                }
            }
        }
        if (currentItem.trim()) currentRow.push(currentItem.trim());
        if (currentRow.length > 0) rows.push(currentRow);
        return rows;
    };

    const grid = parseGrid(inputText);
    if (grid.length === 0) return;

    const spacingX = 160;
    const spacingY = 80;
    const centerX = (window.innerWidth / 2 - state.view.x) / state.view.scale;
    const centerY = (window.innerHeight / 2 - state.view.y) / state.view.scale;

    const offsetStep = 20;
    const maxOffsets = 5;
    const currentOffset = (state.nodes.length % maxOffsets) * offsetStep;

    const totalH = (grid.length - 1) * spacingY;
    const startY = centerY - totalH / 2 + currentOffset;

    grid.forEach((row, rowIndex) => {
        const totalW = (row.length - 1) * spacingX;
        const startX = centerX - totalW / 2 + currentOffset;
        
        row.forEach((str, colIndex) => {
            state.nodes.push({
                id: uid(), text: str,
                x: startX + colIndex * spacingX,
                y: startY + rowIndex * spacingY,
                w: 0, h: 0, color: 'c-white'
            });
        });
    });

    if (els && els.input) {
        els.input.value = '';
    }
    render();
}

export function clearCanvas() {
    const snapshot = { nodes: [...state.nodes], groups: [...state.groups], links: [...state.links] };
    pushHistory();
    state.nodes = [];
    state.groups = [];
    state.links = [];
    state.selection.clear();
    render();
    showToast(getTexts().toast_cleared, snapshot);
}

export function copySelection() {
    const selNodes = state.nodes.filter(n => state.selection.has(n.id));
    const selGroups = state.groups.filter(g => state.selection.has(g.id));
    if (selNodes.length > 0 || selGroups.length > 0) {
        state.clipboard = JSON.parse(JSON.stringify({ nodes: selNodes, groups: selGroups }));
        
        // 复制纯文本到系统剪贴板
        const text = selNodes.map(n => n.text).join('\n');
        if (text) {
            navigator.clipboard.writeText(text).catch(err => console.error('Failed to copy text: ', err));
        }
    }
}

export function pasteClipboard() {
    if (!state.clipboard || !state.clipboard.nodes || !state.clipboard.groups) return;
    if (state.clipboard.nodes.length === 0 && state.clipboard.groups.length === 0) return;

    state.selection.clear();
    const mapping = {};

    // 计算剪贴板内容的包围盒中心
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.clipboard.nodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + (n.w || 0));
        maxY = Math.max(maxY, n.y + (n.h || 0));
    });
    state.clipboard.groups.forEach(g => {
        minX = Math.min(minX, g.x);
        minY = Math.min(minY, g.y);
        maxX = Math.max(maxX, g.x + (g.w || 0));
        maxY = Math.max(maxY, g.y + (g.h || 0));
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const dx = state.mouse.x - centerX;
    const dy = state.mouse.y - centerY;

    state.clipboard.nodes.forEach(n => {
        const newId = uid();
        mapping[n.id] = newId;
        const newNode = { ...n, id: newId, x: n.x + dx, y: n.y + dy };
        state.nodes.push(newNode);
        state.selection.add(newId);
    });
    state.clipboard.groups.forEach(g => {
        const newId = uid();
        const newGroup = { ...g, id: newId, x: g.x + dx, y: g.y + dy };
        newGroup.memberIds = g.memberIds.map(mid => mapping[mid] || mid);
        state.groups.push(newGroup);
        state.selection.add(newId);
    });
    render();
}

export function createGroup() {
    const selectedNodes = state.nodes.filter(n => state.selection.has(n.id));
    if (selectedNodes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectedNodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + (n.w || 0));
        maxY = Math.max(maxY, n.y + (n.h || 0));
    });
    const padding = 20;
    const group = {
        id: uid(),
        x: minX - padding, y: minY - padding,
        w: maxX - minX + padding * 2, h: maxY - minY + padding * 2,
        memberIds: selectedNodes.map(n => n.id)
    };
    state.groups.push(group);
    state.selection.clear();
    state.selection.add(group.id);
    render();
}

export function dissolveGroup() {
    const toRemove = [];
    state.selection.forEach(id => {
        const idx = state.groups.findIndex(g => g.id === id);
        if (idx !== -1) toRemove.push(idx);
    });
    toRemove.sort((a, b) => b - a).forEach(idx => state.groups.splice(idx, 1));
    if (toRemove.length > 0) {
        state.selection.clear();
        render();
    }
}

export function toggleGroup() {
    const selItems = Array.from(state.selection);
    if (selItems.length === 0) return;
    
    // 如果选中的所有元素都是 group，则执行解组
    const allGroups = selItems.every(id => state.groups.some(g => g.id === id));
    if (allGroups) {
        dissolveGroup();
    } else {
        createGroup();
    }
}

function getNodeCenter(node) {
    const w = typeof node.w === 'number' && node.w > 0 ? node.w : 120;
    const h = typeof node.h === 'number' && node.h > 0 ? node.h : 60;
    return {
        cx: node.x + w / 2,
        cy: node.y + h / 2,
        x: node.x,
        y: node.y,
        w,
        h,
        node
    };
}

/**
 * 检测框选下的 1 对 N 辐射发散结构（左1右N、上1下N、右1左N、下1上N）
 */
function detectStarTopology(nodes) {
    if (nodes.length < 3) return null;
    const centers = nodes.map(getNodeCenter);

    const candidates = [];

    // 1. 左 1 右 (N-1)
    const byXAsc = [...centers].sort((a, b) => a.cx - b.cx);
    const leftRoot = byXAsc[0];
    const rightLeaves = byXAsc.slice(1);
    const minRightX = Math.min(...rightLeaves.map(c => c.cx));
    const maxRightX = Math.max(...rightLeaves.map(c => c.cx));
    const minRightY = Math.min(...rightLeaves.map(c => c.cy));
    const maxRightY = Math.max(...rightLeaves.map(c => c.cy));
    const leftGap = minRightX - leftRoot.cx;
    const rightXSpread = maxRightX - minRightX;
    const rightYSpread = maxRightY - minRightY;

    if (leftGap >= 25 &&
        (rightYSpread >= rightXSpread || rightXSpread <= 40) &&
        leftRoot.cy >= minRightY - 100 && leftRoot.cy <= maxRightY + 100) {
        const score = (leftGap / (rightXSpread + 20)) * ((rightYSpread + 20) / (rightXSpread + 20));
        const sortedLeaves = [...rightLeaves].sort((a, b) => a.cy - b.cy);
        candidates.push({
            score,
            pairs: sortedLeaves.map(leaf => ({ sourceId: leftRoot.node.id, targetId: leaf.node.id }))
        });
    }

    // 2. 上 1 下 (N-1)
    const byYAsc = [...centers].sort((a, b) => a.cy - b.cy);
    const topRoot = byYAsc[0];
    const bottomLeaves = byYAsc.slice(1);
    const minBottomY = Math.min(...bottomLeaves.map(c => c.cy));
    const maxBottomY = Math.max(...bottomLeaves.map(c => c.cy));
    const minBottomX = Math.min(...bottomLeaves.map(c => c.cx));
    const maxBottomX = Math.max(...bottomLeaves.map(c => c.cx));
    const topGap = minBottomY - topRoot.cy;
    const bottomYSpread = maxBottomY - minBottomY;
    const bottomXSpread = maxBottomX - minBottomX;

    if (topGap >= 25 &&
        (bottomXSpread >= bottomYSpread || bottomYSpread <= 40) &&
        topRoot.cx >= minBottomX - 100 && topRoot.cx <= maxBottomX + 100) {
        const score = (topGap / (bottomYSpread + 20)) * ((bottomXSpread + 20) / (bottomYSpread + 20));
        const sortedLeaves = [...bottomLeaves].sort((a, b) => a.cx - b.cx);
        candidates.push({
            score,
            pairs: sortedLeaves.map(leaf => ({ sourceId: topRoot.node.id, targetId: leaf.node.id }))
        });
    }

    // 3. 右 1 左 (N-1)
    const byXDesc = [...centers].sort((a, b) => b.cx - a.cx);
    const rightRoot = byXDesc[0];
    const leftLeaves = byXDesc.slice(1);
    const maxLeftX = Math.max(...leftLeaves.map(c => c.cx));
    const minLeftX = Math.min(...leftLeaves.map(c => c.cx));
    const minLeftY = Math.min(...leftLeaves.map(c => c.cy));
    const maxLeftY = Math.max(...leftLeaves.map(c => c.cy));
    const rightGap = rightRoot.cx - maxLeftX;
    const leftXSpread = maxLeftX - minLeftX;
    const leftYSpread = maxLeftY - minLeftY;

    if (rightGap >= 25 &&
        (leftYSpread >= leftXSpread || leftXSpread <= 40) &&
        rightRoot.cy >= minLeftY - 100 && rightRoot.cy <= maxLeftY + 100) {
        const score = (rightGap / (leftXSpread + 20)) * ((leftYSpread + 20) / (leftXSpread + 20));
        const sortedLeaves = [...leftLeaves].sort((a, b) => a.cy - b.cy);
        candidates.push({
            score,
            pairs: sortedLeaves.map(leaf => ({ sourceId: rightRoot.node.id, targetId: leaf.node.id }))
        });
    }

    // 4. 下 1 上 (N-1)
    const byYDesc = [...centers].sort((a, b) => b.cy - a.cy);
    const bottomRoot = byYDesc[0];
    const topLeaves = byYDesc.slice(1);
    const maxTopY = Math.max(...topLeaves.map(c => c.cy));
    const minTopY = Math.min(...topLeaves.map(c => c.cy));
    const minTopX = Math.min(...topLeaves.map(c => c.cx));
    const maxTopX = Math.max(...topLeaves.map(c => c.cx));
    const bottomGap = bottomRoot.cy - maxTopY;
    const topYSpread = maxTopY - minTopY;
    const topXSpread = maxTopX - minTopX;

    if (bottomGap >= 25 &&
        (topXSpread >= topYSpread || topYSpread <= 40) &&
        bottomRoot.cx >= minTopX - 100 && bottomRoot.cx <= maxTopX + 100) {
        const score = (bottomGap / (topYSpread + 20)) * ((topXSpread + 20) / (topYSpread + 20));
        const sortedLeaves = [...topLeaves].sort((a, b) => a.cx - b.cx);
        candidates.push({
            score,
            pairs: sortedLeaves.map(leaf => ({ sourceId: bottomRoot.node.id, targetId: leaf.node.id }))
        });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].pairs;
}

function getLinearChainPairs(nodes) {
    const centers = nodes.map(getNodeCenter);
    const minX = Math.min(...centers.map(c => c.cx));
    const maxX = Math.max(...centers.map(c => c.cx));
    const minY = Math.min(...centers.map(c => c.cy));
    const maxY = Math.max(...centers.map(c => c.cy));

    const dx = maxX - minX;
    const dy = maxY - minY;

    let sorted;
    if (dx >= dy) {
        sorted = [...centers].sort((a, b) => (Math.abs(a.cx - b.cx) < 15 ? a.cy - b.cy : a.cx - b.cx));
    } else {
        sorted = [...centers].sort((a, b) => (Math.abs(a.cy - b.cy) < 15 ? a.cx - b.cx : a.cy - b.cy));
    }

    const pairs = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        pairs.push({
            sourceId: sorted[i].node.id,
            targetId: sorted[i + 1].node.id
        });
    }
    return pairs;
}

function getSequentialChainPairs(nodes) {
    const pairs = [];
    for (let i = 0; i < nodes.length - 1; i++) {
        pairs.push({
            sourceId: nodes[i].id,
            targetId: nodes[i + 1].id
        });
    }
    return pairs;
}

export function resolveLinkingPairs(nodes, selectionSource = 'click') {
    if (nodes.length < 2) return [];
    if (nodes.length === 2) {
        return [{ sourceId: nodes[0].id, targetId: nodes[1].id }];
    }

    if (selectionSource === 'box') {
        const starPairs = detectStarTopology(nodes);
        if (starPairs && starPairs.length > 0) {
            return starPairs;
        }
        return getLinearChainPairs(nodes);
    } else {
        return getSequentialChainPairs(nodes);
    }
}

export function toggleLink() {
    const sel = Array.from(state.selection);
    const nodes = sel.map(id => state.nodes.find(n => n.id === id)).filter(Boolean);
    if (nodes.length < 2) return;

    if (nodes.length === 2) {
        const [n1, n2] = nodes;
        const existingLinkIndex = state.links.findIndex(l =>
            (l.sourceId === n1.id && l.targetId === n2.id) ||
            (l.sourceId === n2.id && l.targetId === n1.id)
        );

        if (existingLinkIndex === -1) {
            state.links.push(createLink({
                id: uid(),
                sourceId: n1.id,
                targetId: n2.id,
                direction: 'target'
            }));
        } else {
            const link = state.links[existingLinkIndex];
            const isReversed = link.sourceId === n2.id;
            if (!isReversed) {
                if (link.direction === 'target') {
                    link.direction = 'none';
                } else if (link.direction === 'none') {
                    link.direction = 'source';
                } else {
                    state.links.splice(existingLinkIndex, 1);
                }
            } else {
                if (link.direction === 'source') {
                    link.direction = 'none';
                } else if (link.direction === 'none') {
                    link.direction = 'target';
                } else {
                    state.links.splice(existingLinkIndex, 1);
                }
            }
        }
        render();
        return;
    }

    const selectionSource = state.selectionSource || 'click';
    const targetPairs = resolveLinkingPairs(nodes, selectionSource);
    if (targetPairs.length === 0) return;

    const selectedNodeIds = new Set(nodes.map(n => n.id));

    let allTargetMatched = true;
    let allNoneMatched = true;

    for (const pair of targetPairs) {
        const link = state.links.find(l =>
            (l.sourceId === pair.sourceId && l.targetId === pair.targetId) ||
            (l.sourceId === pair.targetId && l.targetId === pair.sourceId)
        );

        if (!link) {
            allTargetMatched = false;
            allNoneMatched = false;
            break;
        }

        const isSameDir = link.sourceId === pair.sourceId && link.targetId === pair.targetId;
        const isDirectedToTarget = (isSameDir && link.direction === 'target') || (!isSameDir && link.direction === 'source');
        const isUndirected = link.direction === 'none';

        if (!isDirectedToTarget) allTargetMatched = false;
        if (!isUndirected) allNoneMatched = false;
    }

    if (!allTargetMatched && !allNoneMatched) {
        for (const pair of targetPairs) {
            const linkIndex = state.links.findIndex(l =>
                (l.sourceId === pair.sourceId && l.targetId === pair.targetId) ||
                (l.sourceId === pair.targetId && l.targetId === pair.sourceId)
            );

            if (linkIndex === -1) {
                state.links.push(createLink({
                    id: uid(),
                    sourceId: pair.sourceId,
                    targetId: pair.targetId,
                    direction: 'target'
                }));
            } else {
                const link = state.links[linkIndex];
                link.sourceId = pair.sourceId;
                link.targetId = pair.targetId;
                link.direction = 'target';
            }
        }
    } else if (allTargetMatched) {
        for (const pair of targetPairs) {
            const link = state.links.find(l =>
                (l.sourceId === pair.sourceId && l.targetId === pair.targetId) ||
                (l.sourceId === pair.targetId && l.targetId === pair.sourceId)
            );
            if (link) link.direction = 'none';
        }
    } else if (allNoneMatched) {
        state.links = state.links.filter(l =>
            !(selectedNodeIds.has(l.sourceId) && selectedNodeIds.has(l.targetId))
        );
    }

    render();
}

export function toggleLinkStrokeStyle() {
    const sel = Array.from(state.selection);
    const nodes = sel.map(id => state.nodes.find(n => n.id === id)).filter(Boolean);
    if (nodes.length < 2) return false;

    const selectedIds = new Set(nodes.map(n => n.id));
    const targetLinks = state.links.filter(l =>
        selectedIds.has(l.sourceId) && selectedIds.has(l.targetId)
    );
    if (targetLinks.length === 0) return false;

    const nextStyle = cycleLinkStrokeStyle(targetLinks[0]);
    for (let i = 1; i < targetLinks.length; i++) {
        targetLinks[i].strokeStyle = nextStyle;
    }
    return true;
}

export function deleteSelection() {
    const sel = state.selection;
    if (sel.size === 0) return;
    state.nodes = state.nodes.filter(n => !sel.has(n.id));
    state.groups = state.groups.filter(g => !sel.has(g.id));
    state.links = state.links.filter(l => !sel.has(l.sourceId) && !sel.has(l.targetId));
    state.groups.forEach(g => {
        g.memberIds = g.memberIds.filter(mid => state.nodes.some(n => n.id === mid));
    });
    state.selection.clear();
    render();
}

export function nudgeSelection(key) {
    const step = 10;
    let dx = 0, dy = 0;
    if (key === 'ArrowUp') dy = -step;
    if (key === 'ArrowDown') dy = step;
    if (key === 'ArrowLeft') dx = -step;
    if (key === 'ArrowRight') dx = step;

    if (dx === 0 && dy === 0) return;

    state.selection.forEach(id => {
        const item = findItem(id);
        if (item) setItemPos(item, item.x + dx, item.y + dy);
    });
    render();
}

export function colorSelection(colorClass) {
    state.nodes.forEach(n => {
        if (state.selection.has(n.id)) n.color = colorClass;
    });
    render();
}

export function alignSelection(type) {
    const items = [...state.selection].map(id => findItem(id)).filter(i => i);
    if (items.length < 2) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    items.forEach(i => {
        minX = Math.min(minX, i.x);
        minY = Math.min(minY, i.y);
        maxX = Math.max(maxX, i.x + (i.w || 0));
        maxY = Math.max(maxY, i.y + (i.h || 0));
    });
    const centerX = minX + (maxX - minX) / 2;
    const centerY = minY + (maxY - minY) / 2;
    items.forEach(i => {
        const w = i.w || 0;
        const h = i.h || 0;
        let nx = i.x, ny = i.y;
        if (type === 'left') nx = minX;
        else if (type === 'right') nx = maxX - w;
        else if (type === 'centerX') nx = centerX - w / 2;
        else if (type === 'top') ny = minY;
        else if (type === 'bottom') ny = maxY - h;
        else if (type === 'centerY') ny = centerY - h / 2;
        setItemPos(i, nx, ny);
    });
    render();
}

export function distributeSelection(axis) {
    const items = [...state.selection].map(id => findItem(id)).filter(i => i);
    if (items.length < 3) return;
    if (axis === 'h') {
        items.sort((a, b) => a.x - b.x);
        const start = items[0].x;
        const end = items[items.length - 1].x + (items[items.length - 1].w || 0);
        const totalW = items.reduce((s, i) => s + (i.w || 0), 0);
        const gap = (end - start - totalW) / (items.length - 1);
        let cx = start;
        items.forEach(i => {
            setItemPos(i, cx, i.y);
            cx += (i.w || 0) + gap;
        });
    } else {
        items.sort((a, b) => a.y - b.y);
        const start = items[0].y;
        const end = items[items.length - 1].y + (items[items.length - 1].h || 0);
        const totalH = items.reduce((s, i) => s + (i.h || 0), 0);
        const gap = (end - start - totalH) / (items.length - 1);
        let cy = start;
        items.forEach(i => {
            setItemPos(i, i.x, cy);
            cy += (i.h || 0) + gap;
        });
    }
    render();
}
// --- END: CREATE NEW FILE modules/actions.js ---
