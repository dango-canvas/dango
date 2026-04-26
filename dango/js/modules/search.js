// modules/search.js
import { animateView } from './view.js';

let appState = null;
let renderRef = null;
let results = [];
let currentIndex = -1;
let lastQuery = '';

const els = {
    container: document.getElementById('search-container'),
    input: document.getElementById('search-input'),
    info: document.getElementById('search-info'),
    prev: document.getElementById('search-prev'),
    next: document.getElementById('search-next'),
    close: document.getElementById('search-close')
};

export function initSearch(state, render) {
    appState = state;
    renderRef = render;

    els.input.addEventListener('input', (e) => handleSearch(e.target.value));
    els.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) navigate(-1);
            else navigate(1);
        } else if (e.key === 'Escape') {
            closeSearch();
        }
    });

    els.prev.onclick = () => navigate(-1);
    els.next.onclick = () => navigate(1);
    els.close.onclick = () => closeSearch();
}

export function openSearch() {
    els.container.classList.remove('hidden');
    els.input.focus();
    els.input.select();
    if (els.input.value) {
        handleSearch(els.input.value);
    }
}

export function closeSearch() {
    els.container.classList.add('hidden');
    clearHighlight();
    currentIndex = -1;
    results = [];
    els.info.innerText = '0/0';
}

function handleSearch(query) {
    query = query.trim().toLowerCase();
    if (!query) {
        results = [];
        currentIndex = -1;
        els.info.innerText = '0/0';
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

function navigate(direction) {
    if (results.length === 0) return;
    
    currentIndex += direction;
    if (currentIndex >= results.length) currentIndex = 0;
    if (currentIndex < 0) currentIndex = results.length - 1;

    updateUI();
    focusResult(results[currentIndex]);
}

function updateUI() {
    els.info.innerText = results.length > 0 
        ? `${currentIndex + 1}/${results.length}`
        : '0/0';
}

function focusResult(node) {
    // 1. 选中节点
    appState.selection.clear();
    appState.selection.add(node.id);
    appState.searchResultId = node.id; // 设置搜索命中 ID
    renderRef();

    // 2. 视图中心化
    const targetScale = Math.max(appState.view.scale, 1.0); // 至少 1.0 缩放
    const targetX = window.innerWidth / 2 - (node.x + node.w / 2) * targetScale;
    const targetY = window.innerHeight / 2 - (node.y + node.h / 2) * targetScale;
    
    animateView(targetX, targetY, targetScale);
}

function clearHighlight() {
    appState.searchResultId = null;
    renderRef();
}
