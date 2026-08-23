// modules/state.ts
import { uid } from './utils.js';
import { packLinkStrokeStyle, unpackLinkStrokeStyle } from './links.js';
import type {
    CanvasState,
    CanvasNode,
    CanvasGroup,
    CanvasLink,
    CanvasSettings,
    SerializedData
} from './types.js';

export const MAX_HISTORY = 50;
const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams('');
const isEmbed = urlParams.has('embed');
const getStorageItem = (key: string): string | null => (typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null);

// --- App State ---
export const state: CanvasState = {
    nodes: [],
    groups: [],
    links: [],
    view: { 
        x: typeof window !== 'undefined' ? window.innerWidth / 2 : 500, 
        y: typeof window !== 'undefined' ? window.innerHeight / 2 : 500, 
        scale: 1.2 
    },
    selection: new Set<string>(),
    selectionSource: 'click',
    mouse: { x: 0, y: 0 },
    searchResultId: null,
    clipboard: null,
    theme: 'light',
    settings: {
        hideGrid: getStorageItem('cc-hide-grid') === 'true',
        altAsCtrl: getStorageItem('cc-alt-as-ctrl') === 'true',
        handDrawn: getStorageItem('cc-hand-drawn') === 'true',
        bgUrl: getStorageItem('cc-bg-url') || '',
    },
    isEmbed: isEmbed
};

// --- Config ---
export const CONFIG = {
    colors: [
        'c-white', 'c-red', 'c-yellow', 'c-green', 'c-blue',
        'c-orange', 'c-purple', 'c-pink', 'c-cyan'
    ]
};

// --- History System ---
export const history: { undo: string[]; redo: string[] } = { undo: [], redo: [] };

export function pushHistory(): void {
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

export function undo(renderCallback: () => void): void {
    if (history.undo.length === 0) return;
    const currentSnapshot = JSON.stringify({
        nodes: state.nodes,
        groups: state.groups,
        links: state.links,
        selection: Array.from(state.selection)
    });
    history.redo.push(currentSnapshot);
    const prev = JSON.parse(history.undo.pop()!);
    state.nodes = prev.nodes;
    state.groups = prev.groups;
    state.links = prev.links;
    state.selection = new Set(prev.selection || []);
    renderCallback();
}

export function redo(renderCallback: () => void): void {
    if (history.redo.length === 0) return;
    const currentSnapshot = JSON.stringify({
        nodes: state.nodes,
        groups: state.groups,
        links: state.links,
        selection: Array.from(state.selection)
    });
    history.undo.push(currentSnapshot);
    const next = JSON.parse(history.redo.pop()!);
    state.nodes = next.nodes;
    state.groups = next.groups;
    state.links = next.links;
    state.selection = new Set(next.selection || []);
    renderCallback();
}

// --- Data Persistence ---
const LS_KEY = 'cc-canvas-data';

export function initializeData(loadFromUrlFn?: () => boolean): void {
    // 1. 总是先从 LocalStorage 加载本地数据，作为“基础”状态
    loadData();

    // 2. 然后尝试从 URL Hash 加载（如果存在，则覆盖本地数据，但本地数据已在 history 之前加载）
    if (loadFromUrlFn && loadFromUrlFn()) {
        return;
    }
}

export function loadData(): void {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
        try {
            const data = JSON.parse(raw);
            state.nodes = data.nodes || [];
            state.groups = data.groups || [];
            state.links = data.links || [];
            if (data.view) {
                state.view = data.view;
            }
        } catch (e) { console.error('Data load failed', e); }
    }
}

export function saveData(): void {
    if (state.isEmbed || typeof localStorage === 'undefined') return;
    localStorage.setItem(LS_KEY, JSON.stringify({
        nodes: state.nodes,
        groups: state.groups,
        links: state.links,
        view: state.view
    }));
}

export function unpackData(packed: any[]): {
    nodes: CanvasNode[];
    groups: CanvasGroup[];
    links: CanvasLink[];
    settings: CanvasSettings;
} {
    const [version, pNodes, pGroups, pLinks, pSettings] = packed;
    const shortToLongId: Record<string | number, string> = {};
    const genNewId = (shortId: string | number) => {
        const newId = uid();
        shortToLongId[shortId] = newId;
        return newId;
    };
    const nodes: CanvasNode[] = (pNodes || []).map((n: any) => {
        const node: CanvasNode = {
            id: genNewId(n[0]),
            text: n[1],
            x: n[2],
            y: n[3],
            w: n[4],
            h: n[5],
            color: CONFIG.colors[n[6]] || 'c-white'
        };
        if (version >= 5 && typeof n[7] === 'number') {
            node.step = n[7];
        }
        return node;
    });
    const groups: CanvasGroup[] = (pGroups || []).map((g: any) => {
        const group: CanvasGroup = {
            id: genNewId(g[0]),
            x: g[1],
            y: g[2],
            w: g[3],
            h: g[4],
            isGroup: true,
            memberIds: [],
            _tempMemberIds: g[5] || []
        } as any;
        if (version >= 5 && typeof g[6] === 'number') {
            group.step = g[6];
        }
        return group;
    });
    groups.forEach((g: any) => {
        g.memberIds = g._tempMemberIds.map((sid: any) => shortToLongId[sid]).filter(Boolean);
        delete g._tempMemberIds;
    });
    const links: CanvasLink[] = (pLinks || []).map((l: any) => ({
        id: uid(),
        sourceId: shortToLongId[l[0]], 
        targetId: shortToLongId[l[1]],
        direction: l[2] === 1 ? 'target' : (l[2] === 2 ? 'source' : 'none'),
        strokeStyle: version >= 4 ? unpackLinkStrokeStyle(l[3]) : 'solid'
    })).filter((l: CanvasLink) => l.sourceId && l.targetId);

    let settings: CanvasSettings = { ...state.settings };
    if (pSettings) {
        if (version >= 3) {
            settings = {
                hideGrid: pSettings[0] === 1,
                handDrawn: pSettings[1] === 1,
                altAsCtrl: pSettings[2] === 1,
                bgUrl: pSettings[3] || ''
            };
        } else if (version === 2) {
            settings = {
                hideGrid: pSettings[0] === 1,
                handDrawn: pSettings[1] === 1,
                altAsCtrl: pSettings[2] === 1,
                bgUrl: state.settings.bgUrl
            };
        } else {
            settings = {
                hideGrid: pSettings[1] === 1,
                handDrawn: pSettings[2] === 1,
                altAsCtrl: state.settings.altAsCtrl,
                bgUrl: state.settings.bgUrl
            };
        }
    }
    return { nodes, groups, links, settings };
}

export function packData(): SerializedData {
    const idMap: Record<string, number> = {};
    let idCounter = 0;
    const allIds = [...state.nodes.map(n => n.id), ...state.groups.map(g => g.id)];
    allIds.forEach(id => { idMap[id] = idCounter++; });

    const pNodes: any[] = state.nodes.map(n => {
        const item: any[] = [
            idMap[n.id],
            n.text,
            Math.round(n.x),
            Math.round(n.y),
            Math.round(n.w),
            Math.round(n.h),
            CONFIG.colors.indexOf(n.color || 'c-white') !== -1 ? CONFIG.colors.indexOf(n.color || 'c-white') : 0
        ];
        if (typeof n.step === 'number') {
            item.push(n.step);
        }
        return item;
    });
    const pGroups: any[] = state.groups.map((g: any) => {
        const item: any[] = [
            idMap[g.id],
            Math.round(g.x),
            Math.round(g.y),
            Math.round(g.w),
            Math.round(g.h),
            (g.memberIds || []).map((mid: string) => idMap[mid])
        ];
        if (typeof g.step === 'number') {
            item.push(g.step);
        }
        return item;
    });
    const pLinks: any[] = state.links.map(l => {
        const d = l.direction === 'target' ? 1 : (l.direction === 'source' ? 2 : 0);
        const s = packLinkStrokeStyle(l.strokeStyle);
        return [idMap[l.sourceId], idMap[l.targetId], d, s];
    });
    const pSettings: [number, number, number, string] = [
        state.settings.hideGrid ? 1 : 0,
        state.settings.handDrawn ? 1 : 0,
        state.settings.altAsCtrl ? 1 : 0,
        state.settings.bgUrl || ''
    ];
    return [5, pNodes, pGroups, pLinks, pSettings];
}
