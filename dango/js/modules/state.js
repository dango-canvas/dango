// modules/state.js

import { uid } from './utils.js';

export const MAX_HISTORY = 50;
const urlParams = new URLSearchParams(window.location.search);

// --- App State ---
export const state = {
    nodes: [],
    groups: [],
    links: [],
    view: { x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1.2 },
    selection: new Set(),
    clipboard: [],
    theme: 'light',
    settings: {
        hideGrid: localStorage.getItem('cc-hide-grid') === 'true',
        altAsCtrl: localStorage.getItem('cc-alt-as-ctrl') === 'true',
        handDrawn: localStorage.getItem('cc-hand-drawn') === 'true',
    },
    isEmbed: urlParams.has('embed') // ✨ 在这里添加
};

// --- Config ---
export const CONFIG = {
    colors: [
        'c-white', 'c-red', 'c-yellow', 'c-green', 'c-blue',
        'c-orange', 'c-purple', 'c-pink', 'c-cyan'
    ]
};

// --- History System ---
export const history = { undo: [], redo: [] };

export function pushHistory() {
    const snapshot = JSON.stringify({
        nodes: state.nodes,
        groups: state.groups,
        links: state.links,
        selection: Array.from(state.selection)
    });
    if (history.undo.length > 0 && history.undo[history.undo.length - 1] === snapshot) return;
    history.undo.push(snapshot);
    if (history.undo.length > MAX_HISTORY) history.undo.shift();
    history.redo = [];
}

export function undo(renderCallback) {
    if (history.undo.length === 0) return;
    const currentSnapshot = JSON.stringify({
        nodes: state.nodes,
        groups: state.groups,
        links: state.links,
        selection: Array.from(state.selection)
    });
    history.redo.push(currentSnapshot);
    const prev = JSON.parse(history.undo.pop());
    state.nodes = prev.nodes;
    state.groups = prev.groups;
    state.links = prev.links;
    state.selection = new Set(prev.selection || []);
    renderCallback();
}

export function redo(renderCallback) {
    if (history.redo.length === 0) return;
    const currentSnapshot = JSON.stringify({
        nodes: state.nodes,
        groups: state.groups,
        links: state.links,
        selection: Array.from(state.selection)
    });
    history.undo.push(currentSnapshot);
    const next = JSON.parse(history.redo.pop());
    state.nodes = next.nodes;
    state.groups = next.groups;
    state.links = next.links;
    state.selection = new Set(next.selection || []);
    renderCallback();
}

// --- Data Persistence ---
const LS_KEY = 'cc-canvas-data';

export function initializeData(loadFromUrlFn) {
    if (loadFromUrlFn && loadFromUrlFn()) {
        return;
    }
    loadData();
}

export function loadData() {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
        try {
            const data = JSON.parse(raw);
            state.nodes = data.nodes || [];
            state.groups = data.groups || [];
            state.links = data.links || [];
        } catch (e) { console.error('Data load failed', e); }
    }
}

export function saveData() {
    if (state.isEmbed) return;
    localStorage.setItem(LS_KEY, JSON.stringify({
        nodes: state.nodes,
        groups: state.groups,
        links: state.links
    }));
}

export function unpackData(packed) {
    const [version, pNodes, pGroups, pLinks, pSettings] = packed;
    const shortToLongId = {};
    const genNewId = (shortId) => {
        const newId = uid();
        shortToLongId[shortId] = newId;
        return newId;
    };
    const nodes = pNodes.map(n => ({
        id: genNewId(n[0]), text: n[1], x: n[2], y: n[3], w: n[4], h: n[5],
        color: CONFIG.colors[n[6]] || 'c-white'
    }));
    const groups = pGroups.map(g => ({
        id: genNewId(g[0]), x: g[1], y: g[2], w: g[3], h: g[4], _tempMemberIds: g[5]
    }));
    groups.forEach(g => {
        g.memberIds = g._tempMemberIds.map(sid => shortToLongId[sid]).filter(id => id);
        delete g._tempMemberIds;
    });
    const links = pLinks.map(l => ({
        id: uid(), 
        sourceId: shortToLongId[l[0]], 
        targetId: shortToLongId[l[1]],
        direction: l[2] === 1 ? 'target' : (l[2] === 2 ? 'source' : 'none')
    })).filter(l => l.sourceId && l.targetId);
    let settings = state.settings;
    if (pSettings) {
        if (version >= 2) {
            settings = {
                hideGrid: pSettings[0] === 1,
                handDrawn: pSettings[1] === 1,
                altAsCtrl: pSettings[2] === 1
            };
        } else {
            settings = {
                hideGrid: pSettings[1] === 1,
                handDrawn: pSettings[2] === 1,
                altAsCtrl: state.settings.altAsCtrl
            };
        }
    }
    return { nodes, groups, links, settings };
}

export function packData() {
    const idMap = {};
    let idCounter = 0;
    const allIds = [...state.nodes.map(n => n.id), ...state.groups.map(g => g.id)];
    allIds.forEach(id => idMap[id] = idCounter++);
    const pNodes = state.nodes.map(n => [
        idMap[n.id], n.text, Math.round(n.x), Math.round(n.y),
        Math.round(n.w), Math.round(n.h), CONFIG.colors.indexOf(n.color || 'c-white')
    ]);
    const pGroups = state.groups.map(g => [
        idMap[g.id], Math.round(g.x), Math.round(g.y),
        Math.round(g.w), Math.round(g.h), g.memberIds.map(mid => idMap[mid])
    ]);
    const pLinks = state.links.map(l => {
        const d = l.direction === 'target' ? 1 : (l.direction === 'source' ? 2 : 0);
        return [idMap[l.sourceId], idMap[l.targetId], d];
    });
    const pSettings = [
        state.settings.hideGrid ? 1 : 0,
        state.settings.handDrawn ? 1 : 0,
        state.settings.altAsCtrl ? 1 : 0
    ];
    return [2, pNodes, pGroups, pLinks, pSettings];
}
