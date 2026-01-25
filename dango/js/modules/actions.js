// --- START: CREATE NEW FILE modules/actions.js ---
import { state, history, pushHistory, MAX_HISTORY, CONFIG } from './state.js';
import { render } from './render.js';
import { uid, isUrl } from './utils.js';
import { showToast } from './ui.js';
import { getTexts } from './i18n.js';
import { els } from './dom.js';

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
    }
}

export function pasteClipboard() {
    if (!state.clipboard || (!state.clipboard.nodes.length && !state.clipboard.groups.length)) return;
    state.selection.clear();
    const mapping = {};
    state.clipboard.nodes.forEach(n => {
        const newId = uid();
        mapping[n.id] = newId;
        const newNode = { ...n, id: newId, x: n.x + 20, y: n.y + 20 };
        state.nodes.push(newNode);
        state.selection.add(newId);
    });
    state.clipboard.groups.forEach(g => {
        const newId = uid();
        const newGroup = { ...g, id: newId, x: g.x + 20, y: g.y + 20 };
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

export function toggleLink() {
    const sel = Array.from(state.selection);
    const nodes = sel.map(id => state.nodes.find(n => n.id === id)).filter(n => n);
    if (nodes.length !== 2) return;

    const [n1, n2] = nodes;
    const existingLinkIndex = state.links.findIndex(l =>
        (l.sourceId === n1.id && l.targetId === n2.id) ||
        (l.sourceId === n2.id && l.targetId === n1.id)
    );

    if (existingLinkIndex !== -1) {
        const link = state.links[existingLinkIndex];
        const isReversed = link.sourceId === n2.id;
        switch (link.direction) {
            case 'none':
                link.direction = isReversed ? 'source' : 'target';
                break;
            case 'target':
                link.direction = isReversed ? 'none' : 'source';
                if (isReversed) link.direction = 'none';
                else link.direction = 'source';
                break;
            case 'source':
                state.links.splice(existingLinkIndex, 1);
                break;
            default:
                link.direction = 'target';
                break;
        }
    } else {
        state.links.push({
            id: uid(),
            sourceId: n1.id,
            targetId: n2.id,
            direction: 'none'
        });
    }
    render();
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
