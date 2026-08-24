// modules/hints.ts
import { isTaggingModeActive, tagItemDirect } from './presenter.js';
import type { CanvasState, CanvasNode, CanvasView } from './types.js';

export const HINT_ALPHABET = [
    'a', 's', 'd', 'f', 'j', 'k', 'l', 'g', 'h',
    'q', 'w', 'e', 'r', 'u', 'i', 'o', 'p',
    't', 'y', 'z', 'x', 'c', 'v', 'b', 'n', 'm'
];

let appState: CanvasState | null = null;
let callbacks: {
    render: () => void;
    handleNodeEdit?: (el: HTMLElement) => void;
} | null = null;

let isHintActive = false;
let isMultiMode = false;
let typedPrefix = '';
const hintMap = new Map<string, CanvasNode>(); // hintCode -> CanvasNode

export function isHintModeActive(): boolean {
    return isHintActive;
}

export function isHintMultiMode(): boolean {
    return isMultiMode;
}

export function getVisibleNodes(
    nodes: CanvasNode[],
    view: CanvasView,
    winW: number,
    winH: number
): CanvasNode[] {
    const scale = view.scale || 1;
    return nodes.filter(node => {
        const nw = (typeof node.w === 'number' && node.w > 0) ? node.w : 100;
        const nh = (typeof node.h === 'number' && node.h > 0) ? node.h : 40;
        const screenX = node.x * scale + view.x;
        const screenY = node.y * scale + view.y;
        const screenW = nw * scale;
        const screenH = nh * scale;

        return (
            screenX + screenW >= 0 &&
            screenX <= winW &&
            screenY + screenH >= 0 &&
            screenY <= winH
        );
    });
}

export function sortNodesTopologically(nodes: CanvasNode[]): CanvasNode[] {
    const sorted = [...nodes];
    const ROW_TOLERANCE = 30;
    sorted.sort((a, b) => {
        if (Math.abs(a.y - b.y) > ROW_TOLERANCE) {
            return a.y - b.y;
        }
        return a.x - b.x;
    });
    return sorted;
}

export function generateHintCodes(count: number): string[] {
    if (count <= 0) return [];
    const L = HINT_ALPHABET.length;

    if (count <= L) {
        return HINT_ALPHABET.slice(0, count);
    }

    // 前缀无关（Prefix-free）混合长度编码：
    // 保留 S 个高频单字符角标，剩余 P = L - S 个字符作为前缀生成双字符角标
    // 总容量: S + P * L = (L - P) + P * L = L + P * (L - 1) >= count
    const P = Math.min(L, Math.ceil((count - L) / (L - 1)));
    const S = L - P; // 单字符角标数量

    const hints: string[] = [];

    // 1. 分配首部 S 个单字符（Home-row 优先）
    for (let i = 0; i < S; i++) {
        hints.push(HINT_ALPHABET[i]);
    }

    // 2. 使用尾部 P 个前缀字符分配双字符
    let remainingNeeded = count - S;
    for (let p = 0; p < P && remainingNeeded > 0; p++) {
        const prefixChar = HINT_ALPHABET[S + p];
        for (let j = 0; j < L && remainingNeeded > 0; j++) {
            hints.push(prefixChar + HINT_ALPHABET[j]);
            remainingNeeded--;
        }
    }

    return hints;
}

function getHintsLayer(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    let layer = document.getElementById('hints-layer');
    if (!layer) {
        const container = document.getElementById('canvas-container');
        if (container) {
            layer = document.createElement('div');
            layer.id = 'hints-layer';
            container.appendChild(layer);
        }
    }
    return layer;
}

export function initHints(
    state: CanvasState,
    cbs: {
        render: () => void;
        handleNodeEdit?: (el: HTMLElement) => void;
    }
): void {
    appState = state;
    callbacks = cbs;

    if (typeof window !== 'undefined') {
        window.addEventListener('pointerdown', (e) => {
            if (isHintActive) {
                const target = e.target as HTMLElement | null;
                if (!target?.closest('#hints-layer')) {
                    exitHintMode();
                }
            }
        });
    }
}

export function enterHintMode(multi = false): void {
    if (!appState || !callbacks) return;

    if (isHintActive) exitHintMode();

    const winW = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 1080;

    const visibleNodes = getVisibleNodes(appState.nodes, appState.view, winW, winH);
    if (visibleNodes.length === 0) return;

    const sortedNodes = sortNodesTopologically(visibleNodes);
    const codes = generateHintCodes(sortedNodes.length);

    isHintActive = true;
    isMultiMode = multi;
    typedPrefix = '';
    hintMap.clear();

    sortedNodes.forEach((node, i) => {
        hintMap.set(codes[i], node);
    });

    const layer = getHintsLayer();
    if (layer) {
        layer.innerHTML = '';
        const scale = appState.view.scale || 1;

        sortedNodes.forEach((node, i) => {
            const code = codes[i];
            const screenX = node.x * scale + appState!.view.x;
            const screenY = node.y * scale + appState!.view.y;

            const badge = document.createElement('div');
            badge.className = multi ? 'dango-hint-badge mode-multi' : 'dango-hint-badge';
            badge.dataset.code = code;
            badge.style.left = `${Math.round(screenX)}px`;
            badge.style.top = `${Math.round(screenY)}px`;
            badge.textContent = code;

            layer.appendChild(badge);
        });
    }
}

export function exitHintMode(): void {
    if (!isHintActive) return;
    isHintActive = false;
    isMultiMode = false;
    typedPrefix = '';
    hintMap.clear();

    const layer = getHintsLayer();
    if (layer) {
        layer.innerHTML = '';
    }
}

export function handleHintKeyDown(e: KeyboardEvent): boolean {
    if (!isHintActive || !appState || !callbacks) return false;

    if (e.code === 'Escape') {
        exitHintMode();
        return true;
    }

    if (e.code === 'Backspace') {
        if (typedPrefix.length > 0) {
            typedPrefix = typedPrefix.slice(0, -1);
            updateBadgesDisplay();
            return true;
        } else {
            exitHintMode();
            return true;
        }
    }

    // Ignore standalone modifier presses (Alt, Shift, Ctrl, Meta)
    if (['AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight'].includes(e.code)) {
        return true;
    }

    let char = '';
    if (e.code && e.code.startsWith('Key') && e.code.length === 4) {
        char = e.code.slice(3).toLowerCase();
    } else if (e.key && e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
        char = e.key.toLowerCase();
    }

    if (char) {
        typedPrefix += char;

        // 1. Exact Match
        if (hintMap.has(typedPrefix)) {
            const targetNode = hintMap.get(typedPrefix)!;
            if (isMultiMode) {
                if (appState.selection.has(targetNode.id)) {
                    appState.selection.delete(targetNode.id);
                } else {
                    appState.selection.add(targetNode.id);
                }
            } else {
                appState.selection.clear();
                appState.selection.add(targetNode.id);
            }
            appState.selectionSource = 'click';
            if (isTaggingModeActive()) {
                tagItemDirect(targetNode);
            }
            exitHintMode();
            callbacks.render();
            return true;
        }

        // 2. Prefix Filtering
        let hasAnyMatch = false;
        for (const code of hintMap.keys()) {
            if (code.startsWith(typedPrefix)) {
                hasAnyMatch = true;
                break;
            }
        }

        if (hasAnyMatch) {
            updateBadgesDisplay();
            return true;
        } else {
            // Mismatch: exit silently without affecting other keys
            exitHintMode();
            return true;
        }
    }

    // Ignore other keys while in hint mode to prevent unintended canvas triggers
    return true;
}

function updateBadgesDisplay(): void {
    const layer = getHintsLayer();
    if (!layer) return;

    const badges = layer.querySelectorAll<HTMLElement>('.dango-hint-badge');
    badges.forEach(badge => {
        const code = badge.dataset.code || '';
        if (code.startsWith(typedPrefix)) {
            badge.classList.remove('hidden-filter');
            if (typedPrefix.length > 0) {
                const matchedPart = code.substring(0, typedPrefix.length);
                const remainingPart = code.substring(typedPrefix.length);
                badge.innerHTML = `<span class="char-matched">${matchedPart}</span>${remainingPart}`;
            } else {
                badge.textContent = code;
            }
        } else {
            badge.classList.add('hidden-filter');
        }
    });
}
