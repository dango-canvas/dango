// modules/search.ts
import { animateView } from './view.js';
import type { CanvasState, CanvasNode } from './types.js';

let appState: CanvasState | null = null;
let renderRef: (() => void) | null = null;
let results: CanvasNode[] = [];
let currentIndex = -1;
let lastQuery = '';

const getEl = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
    (typeof document !== 'undefined' ? (document.getElementById(id) as T | null) : null);

const els = {
    get container() { return getEl<HTMLElement>('search-container'); },
    get input() { return getEl<HTMLInputElement>('search-input'); },
    get info() { return getEl<HTMLElement>('search-info'); },
    get prev() { return getEl<HTMLButtonElement>('search-prev'); },
    get next() { return getEl<HTMLButtonElement>('search-next'); },
    get close() { return getEl<HTMLButtonElement>('search-close'); }
};

export function initSearch(state: CanvasState, render: () => void): void {
    appState = state;
    renderRef = render;

    if (els.input) {
        els.input.addEventListener('input', (e) => handleSearch((e.target as HTMLInputElement).value));
        els.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) navigate(-1);
                else navigate(1);
            } else if (e.key === 'Escape') {
                closeSearch();
            }
        });
    }

    if (els.prev) els.prev.onclick = () => navigate(-1);
    if (els.next) els.next.onclick = () => navigate(1);
    if (els.close) els.close.onclick = () => closeSearch();
}

export function openSearch(): void {
    if (!els.container || !els.input) return;
    els.container.classList.remove('hidden');
    els.input.focus();
    els.input.select();
    if (els.input.value) {
        handleSearch(els.input.value);
    }
}

export function closeSearch(): void {
    if (els.container) els.container.classList.add('hidden');
    clearHighlight();
    currentIndex = -1;
    results = [];
    if (els.info) els.info.innerText = '0/0';
}

function handleSearch(query: string): void {
    if (!appState) return;
    query = query.trim().toLowerCase();
    if (!query) {
        results = [];
        currentIndex = -1;
        if (els.info) els.info.innerText = '0/0';
        clearHighlight();
        return;
    }

    if (query === lastQuery && results.length > 0) return;

    lastQuery = query;
    results = appState.nodes.filter(n => 
        n.text && n.text.toLowerCase().includes(query)
    );

    if (results.length > 0) {
        currentIndex = 0;
        updateUI();
        focusResult(results[currentIndex]);
    } else {
        currentIndex = -1;
        updateUI();
        clearHighlight();
    }
}

function navigate(direction: number): void {
    if (results.length === 0) return;
    
    currentIndex += direction;
    if (currentIndex >= results.length) currentIndex = 0;
    if (currentIndex < 0) currentIndex = results.length - 1;

    updateUI();
    focusResult(results[currentIndex]);
}

function updateUI(): void {
    if (!els.info) return;
    els.info.innerText = results.length > 0 
        ? `${currentIndex + 1}/${results.length}`
        : '0/0';
}

function focusResult(node: CanvasNode): void {
    if (!appState || !renderRef) return;
    // 1. 选中节点
    appState.selection.clear();
    appState.selection.add(node.id);
    appState.searchResultId = node.id; // 设置搜索命中 ID
    renderRef();

    // 2. 视图中心化
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const targetScale = Math.max(appState.view.scale, 1.0); // 至少 1.0 缩放
    const targetX = winW / 2 - (node.x + node.w / 2) * targetScale;
    const targetY = winH / 2 - (node.y + node.h / 2) * targetScale;
    
    animateView(targetX, targetY, targetScale);
}

function clearHighlight(): void {
    if (!appState || !renderRef) return;
    appState.searchResultId = null;
    renderRef();
}
