// modules/render.ts
import { isUrl, getEdgeIntersection, safeRemoveElement } from './utils.js';
import { getTexts } from './i18n.js';
import { els, setSafeHTML, setSafeSVG } from './dom.js';
import { buildLinkPathData, getLinkOpacity, getLinkStrokeColor, getLinkStrokeStyle } from './links.js';
import { CONFIG } from './state.js';
import { 
    getStepBadgeText, 
    getCurrentStep,
    isItemVisibleInPresentation, 
    isLinkVisibleInPresentation, 
    isPresentationModeActive,
    isPresentationNavigatingForward,
    isGrandFinale,
    isItemGhostedInTagging,
    isLinkGhostedInTagging
} from './presenter.js';
import type { CanvasState, CanvasNode, CanvasGroup, CanvasLink } from './types.js';

// --- 模块内部变量 ---
let appState: CanvasState;
let callbacks: {
    updateOpenFullLink?: () => void;
    saveData?: () => void;
};

const IMAGE_SIZE_WIDTHS = { s: 100, l: 200 };
const IMAGE_SIZE_ICONS = {
    s: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 10 10 10 10 4"></polyline><polyline points="20 10 14 10 14 4"></polyline><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 14 14 14 14 20"></polyline></svg>',
    l: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="10 4 4 4 4 10"></polyline><polyline points="14 4 20 4 20 10"></polyline><polyline points="10 20 4 20 4 14"></polyline><polyline points="14 20 20 20 20 14"></polyline></svg>'
};
const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

function escapeHTML(value: string | number): string {
    return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPE_MAP[ch] || ch);
}

function normalizeHttpUrl(rawUrl: string): string | null {
    const value = String(rawUrl || '').trim();
    if (!value) return null;
    if (value.startsWith('#')) return value;

    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
        const url = new URL(candidate, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
}

function syncDomElements<T extends { id: string }>(
    dataArray: T[],
    parent: HTMLElement | null,
    className: string,
    renderFn: (el: HTMLElement, item: T) => void
): void {
    if (!parent) return;
    const existing = new Map<string, HTMLElement>();
    const children = parent.children;
    for (let i = 0; i < children.length; i++) {
        const el = children[i] as HTMLElement;
        const id = el.dataset.id;
        if (id) existing.set(id, el);
    }
    const activeIds = new Set<string>();
    for (let i = 0; i < dataArray.length; i++) {
        const item = dataArray[i];
        activeIds.add(item.id);
        let el = existing.get(item.id);
        if (!el) {
            el = document.createElement('div');
            el.className = className;
            el.dataset.id = item.id;
            parent.appendChild(el);
        }
        renderFn(el, item);
    }
    existing.forEach((el, id) => { if (!activeIds.has(id)) safeRemoveElement(el); });
}

function highlightCode(code: string): string {
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const tokens = [
        { type: 'comment', regex: /\/\/.*/g },
        { type: 'comment', regex: /\/\*[\s\S]*?\*\//g },
        { type: 'string', regex: /("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(`(?:\\.|[^`\\])*`)/g },
        { type: 'keyword', regex: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|import|export|from|default|try|catch|finally|throw|new|this|super|static|async|await|yield|type|interface|public|private|protected|readonly)\b/g },
        { type: 'number', regex: /\b(\d+)\b/g }
    ];

    const combinedRegex = new RegExp(tokens.map(t => `(${t.regex.source})`).join('|'), 'g');

    return escaped.replace(combinedRegex, (match, ...args) => {
        const index = args.findIndex((val, i) => val !== undefined && i < tokens.length);
        if (index !== -1) {
            return `<span class="code-${tokens[index].type}">${match}</span>`;
        }
        return match;
    });
}

function renderCodeBlock(el: HTMLElement, text: string): void {
    const fullContent = text.substring(3, text.length - 3).trim();
    const firstNewLine = fullContent.indexOf('\n');
    
    let lang = '';
    let code = fullContent;
    
    if (firstNewLine !== -1) {
        const possibleLang = fullContent.substring(0, firstNewLine).trim();
        if (possibleLang && !possibleLang.includes(' ')) {
            lang = possibleLang;
            code = fullContent.substring(firstNewLine + 1).trim();
        }
    }

    const html = `
        <div class="code-header">
            <div class="code-dots">
                <span class="code-dot dot-r"></span>
                <span class="code-dot dot-y"></span>
                <span class="code-dot dot-g"></span>
            </div>
            <div class="code-lang">${escapeHTML(lang)}</div>
        </div>
        <div class="code-content">${highlightCode(code)}</div>
    `;
    setSafeHTML(el, html);
}

export function parseMarkdown(text: string): string {
    let escapedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    escapedText = escapedText.replace(/ {2}/g, ' &nbsp;');

    let processedText = escapedText;
    if (escapedText.startsWith('### ')) processedText = escapedText.substring(4);
    else if (escapedText.startsWith('## ')) processedText = escapedText.substring(3);
    else if (escapedText.startsWith('# ')) processedText = escapedText.substring(2);
    
    if (escapedText.startsWith('// ')) processedText = escapedText.substring(3);
    else if (escapedText.startsWith('//')) processedText = escapedText.substring(2);

    const lines = processedText.split('\n');
    const htmlLines = lines.map((line, idx) => {
        if (!line && idx === lines.length - 1 && lines.length > 1) {
            return '<br>';
        }
        let processedLine = line.replace(
            /^\[([ xX])\]\s*(.*)/,
            (_match, checked, content) => {
                const isChecked = checked.toLowerCase() === 'x';
                return `<span class="todo-item ${isChecked ? 'checked' : ''}" data-checked="${isChecked}">
                          <span class="todo-checkbox-wrapper">
                            <input type="checkbox" ${isChecked ? 'checked' : ''} disabled>
                          </span>
                          <label>${content}</label>
                        </span>`;
            }
        );
        if (!processedLine.includes('class="todo-item"')) {
            processedLine = processedLine.replace(/\*\*(.*?)\*\*|__(.*?)__/g, '<strong>$1$2</strong>');
            processedLine = processedLine.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)|(?<=^|[^\w_])_(.+?)_(?=[^\w_]|$)/g, '<em>$1$2</em>');
            processedLine = processedLine.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                const validUrl = normalizeHttpUrl(url);
                if (!validUrl) return match;
                return `<a href="${escapeHTML(validUrl)}" target="_blank" rel="noopener noreferrer" class="node-inline-link">${text}</a>`;
            });
        }
        return processedLine;
    });
    return htmlLines.join('<br>');
}

function parseImageMarkdown(text?: string): { alt: string; url: string } | null {
    const trimmed = (text || '').trim();
    const match = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (!match) return null;
    return { alt: match[1], url: match[2].trim() };
}

function getImageSizeKey(width?: number): 's' | 'l' {
    return width === IMAGE_SIZE_WIDTHS.l ? 'l' : 's';
}

function getNextImageSizeKey(currentKey: 's' | 'l'): 's' | 'l' {
    return currentKey === 's' ? 'l' : 's';
}

function applyImageSize(node: CanvasNode, img: HTMLImageElement | null, width: number): boolean {
    if (!img || !img.naturalWidth) {
        node.w = width;
        return true;
    }
    const ratio = img.naturalHeight / img.naturalWidth;
    const height = Math.round(width * ratio);
    if (node.w === width && node.h === height) return false;
    node.w = width;
    node.h = height;
    return true;
}

export function renderNode(el: HTMLElement, node: CanvasNode): void {
    el.setAttribute('role', 'button');
    el.style.transform = `translate(${node.x}px, ${node.y}px)`;
    
    const colorClass = typeof node.color === 'number' ? (CONFIG.colors[node.color] || 'c-white') : (node.color || 'c-white');

    if (el.classList.contains('editing')) {
        const isSelected = appState.selection.has(node.id);
        const isFound = appState.searchResultId === node.id;
        const hasMultiline = el.classList.contains('has-multiline');
        el.className = ['node', colorClass, isSelected ? 'selected' : '', isFound ? 'search-found' : '', 'editing', hasMultiline ? 'has-multiline' : ''].filter(Boolean).join(' ');
        el.style.width = '';
        el.style.height = '';
        if (el.offsetWidth && el.offsetHeight) {
            node.w = el.offsetWidth;
            node.h = el.offsetHeight;
        }
        return;
    }

    const imageData = parseImageMarkdown(node.text);
    const isImage = !!imageData;
    const isLink = !isImage && isUrl(node.text);

    if (isImage && imageData) {
        el.classList.remove('is-link');
        let img = el.querySelector<HTMLImageElement>('.node-image');
        if (!img) {
            el.textContent = '';
            img = document.createElement('img');
            img.className = 'node-image';
            el.appendChild(img);
        }
        if (img.getAttribute('src') !== imageData.url) img.setAttribute('src', imageData.url);
        if (img.getAttribute('alt') !== imageData.alt) img.setAttribute('alt', imageData.alt);

        const currentSizeKey = getImageSizeKey(node.w);
        const targetWidth = IMAGE_SIZE_WIDTHS[currentSizeKey];
        if (node.w !== targetWidth) {
            node.w = targetWidth;
        }
        el.style.width = `${node.w}px`;
        if (el.dataset.lastText !== (node.text || '')) {
            el.dataset.lastText = node.text || '';
            if (!img.complete || !img.naturalWidth) {
                node.h = targetWidth;
            }
        }
        if (node.h) {
            el.style.height = `${node.h}px`;
        }

        const updateH = () => {
            if (img && img.naturalWidth) {
                const newH = Math.round(node.w * (img.naturalHeight / img.naturalWidth));
                if (node.h !== newH || el.style.height !== `${newH}px`) {
                    node.h = newH;
                    el.style.height = `${node.h}px`;
                    render();
                }
            }
        };
        
        if (img.complete && img.naturalWidth) updateH();
        else img.onload = updateH;

        let sizeBtn = el.querySelector<HTMLButtonElement>('.image-size-btn');
        if (!sizeBtn) {
            sizeBtn = document.createElement('button');
            sizeBtn.type = 'button';
            sizeBtn.className = 'image-size-btn';
            sizeBtn.onmousedown = (e) => e.stopPropagation();
            sizeBtn.onclick = (e) => {
                e.stopPropagation();
                const curKey = getImageSizeKey(node.w);
                const nextKey = getNextImageSizeKey(curKey);
                const width = IMAGE_SIZE_WIDTHS[nextKey];
                if (applyImageSize(node, img, width)) {
                    render();
                }
            };
            el.appendChild(sizeBtn);
        }
        const iconHTML = IMAGE_SIZE_ICONS[currentSizeKey];
        if (sizeBtn.dataset.sizeIcon !== currentSizeKey) {
            setSafeSVG(sizeBtn, iconHTML);
            sizeBtn.dataset.sizeIcon = currentSizeKey;
        }
        
    } else if (isLink) {
        el.classList.add('is-link');
        let textEl = el.querySelector<HTMLElement>('.node-text');
        if (!textEl) {
            el.textContent = '';
            textEl = document.createElement('div');
            textEl.className = 'node-text';
            el.appendChild(textEl);
        }
        if (textEl.innerText !== (node.text || '')) textEl.innerText = node.text || '';
        let btnEl = el.querySelector<HTMLElement>('.link-btn');
        if (!btnEl) {
            btnEl = document.createElement('div');
            btnEl.className = 'link-btn';
            setSafeSVG(btnEl, '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>');
            btnEl.onmousedown = (e) => e.stopPropagation();
            btnEl.onclick = (e) => {
                e.stopPropagation();
                const url = normalizeHttpUrl(node.text || '');
                if (url) window.open(url, '_blank', 'noopener,noreferrer');
            };
            el.appendChild(btnEl);
        }
        if (el.dataset.lastText !== (node.text || '')) {
            el.dataset.lastText = node.text || '';
            el.style.width = '';
            el.style.height = '';
            node.w = 0;
            node.h = 0;
        }
    } else {
        if (!isImage) {
            el.classList.remove('is-link');
            const trimmedText = (node.text || '').trim();
            const isCode = trimmedText.startsWith('```') && trimmedText.endsWith('```');
            
            if (el.dataset.lastText !== (node.text || '')) {
                if (isCode) {
                    renderCodeBlock(el, trimmedText);
                } else {
                    const newHtml = parseMarkdown(node.text || '');
                    setSafeHTML(el, newHtml);
                    const hasTodo = Boolean(el.querySelector?.('.todo-item'));
                    if (typeof el.classList?.toggle === 'function') {
                        el.classList.toggle('has-todo', hasTodo);
                    } else if (el.classList) {
                        if (hasTodo) el.classList.add('has-todo');
                        else el.classList.remove('has-todo');
                    }
                }
                el.dataset.lastText = node.text || '';
                el.style.width = '';
                el.style.height = '';
                node.w = 0;
                node.h = 0;
            }
        }
    }

    // Step Badge
    const hasStep = typeof node.step === 'number' && node.step > 0;
    let stepBadge = el.querySelector<HTMLElement>('.dango-step-badge');
    if (hasStep) {
        if (!stepBadge) {
            stepBadge = document.createElement('span');
            stepBadge.className = 'dango-step-badge';
            el.appendChild(stepBadge);
        }
        const badgeText = getStepBadgeText(node.step);
        if (stepBadge.innerText !== badgeText) {
            stepBadge.innerText = badgeText;
        }
    } else if (stepBadge) {
        safeRemoveElement(stepBadge);
    }

    const isSelected = appState.selection.has(node.id);
    const isFound = appState.searchResultId === node.id;
    const isVisibleInPresentation = isItemVisibleInPresentation(node);

    const classes = ['node', colorClass];
    if (isImage) classes.push('image-node');
    if (isLink) classes.push('is-link');
    if (isSelected) classes.push('selected');
    if (isFound) classes.push('search-found');
    const text = node.text || '';
    if (text.replace(/\r?\n$/, '').includes('\n')) classes.push('has-multiline');
    
    if (text.startsWith('### ')) classes.push('node-h3');
    else if (text.startsWith('## ')) classes.push('node-h2');
    else if (text.startsWith('# ')) classes.push('node-h1');
    
    if (text.startsWith('//')) classes.push('node-comment');
    if (text.startsWith('```') && text.endsWith('```')) classes.push('node-code');

    if (isItemGhostedInTagging(node)) {
        classes.push('tagging-ghost');
    }

    if (!isVisibleInPresentation) {
        classes.push('presentation-hidden');
    } else if (isPresentationModeActive() && !isGrandFinale() && isPresentationNavigatingForward() && (node.step === getCurrentStep())) {
        classes.push('step-bounce-in');
    }

    el.className = classes.join(' ');
    
    if (isLink && el.offsetWidth && el.offsetHeight) {
        node.w = el.offsetWidth;
        node.h = el.offsetHeight;
    } else if (!isImage && (!node.w || !node.h)) {
        node.w = el.offsetWidth;
        node.h = el.offsetHeight;
    }
}

function renderGroup(el: HTMLElement, group: any): void {
    if (group.memberIds && group.memberIds.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasVisibleMembers = false;
        const nodeMap = currentRenderNodeMap;
        group.memberIds.forEach((mid: string) => {
            const m = nodeMap ? nodeMap.get(mid) : appState.nodes.find(n => n.id === mid);
            if (m) {
                hasVisibleMembers = true;
                minX = Math.min(minX, m.x);
                minY = Math.min(minY, m.y);
                maxX = Math.max(maxX, m.x + (m.w || 0));
                maxY = Math.max(maxY, m.y + (m.h || 0));
            }
        });
        if (hasVisibleMembers) {
            const padding = 20;
            group.x = minX - padding;
            group.y = minY - padding;
            group.w = maxX - minX + padding * 2;
            group.h = maxY - minY + padding * 2;
        }
    }

    // Step Badge on Group
    const hasStep = typeof group.step === 'number' && group.step > 0;
    let stepBadge = el.querySelector<HTMLElement>('.dango-step-badge');
    if (hasStep) {
        if (!stepBadge) {
            stepBadge = document.createElement('span');
            stepBadge.className = 'dango-step-badge group-step-badge';
            el.appendChild(stepBadge);
        }
        const badgeText = getStepBadgeText(group.step);
        if (stepBadge.innerText !== badgeText) {
            stepBadge.innerText = badgeText;
        }
    } else if (stepBadge) {
        safeRemoveElement(stepBadge);
    }

    const isVisibleInPresentation = isItemVisibleInPresentation(group);
    const groupClasses = ['group'];
    if (appState.selection.has(group.id)) groupClasses.push('selected');
    if (isItemGhostedInTagging(group)) groupClasses.push('tagging-ghost');
    if (!isVisibleInPresentation) groupClasses.push('presentation-hidden');

    const targetTransform = `translate(${group.x}px, ${group.y}px)`;
    if (el.style.transform !== targetTransform) el.style.transform = targetTransform;
    const targetW = `${group.w}px`;
    if (el.style.width !== targetW) el.style.width = targetW;
    const targetH = `${group.h}px`;
    if (el.style.height !== targetH) el.style.height = targetH;
    const newClassName = groupClasses.join(' ');
    if (el.className !== newClassName) el.className = newClassName;
}

export function updateViewTransform(): void {
    if (!appState || !els.world) return;
    els.world.style.transform = `translate(${appState.view.x}px, ${appState.view.y}px) scale(${appState.view.scale})`;
}

/**
 * 为不同颜色的箭头生成跨浏览器稳定兼容的独立 SVG Marker。
 * 规避 Safari / WebKit 尚不支持 SVG2 context-stroke 导致的隐形 Bug。
 */
const createdMarkerIds = new Set<string>();

function getOrCreateMarker(defs: SVGDefsElement | null, color: string, fallbackColor: string): string {
    if (!defs) return 'arrowhead';
    const resolvedColor = (color || fallbackColor || 'var(--link-color)').trim();
    if (!resolvedColor || resolvedColor === 'var(--link-color)' || resolvedColor === fallbackColor) {
        return 'arrowhead';
    }
    const safeCol = resolvedColor.replace(/[^a-z0-9]/gi, '_');
    const markerId = `arrowhead-${safeCol}`;
    if (!createdMarkerIds.has(markerId) && !defs.querySelector(`#${markerId}`)) {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', markerId);
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '8');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '12');
        marker.setAttribute('markerHeight', '12');
        marker.setAttribute('orient', 'auto-start-reverse');
        marker.setAttribute('markerUnits', 'userSpaceOnUse');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M 0 0 L 8 5 L 0 10');
        path.setAttribute('stroke', resolvedColor);
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        marker.appendChild(path);
        defs.appendChild(marker);
        createdMarkerIds.add(markerId);
    }
    return markerId;
}

let currentRenderNodeMap: Map<string, CanvasNode> | null = null;

/**
 * 主渲染函数
 */
export function render(): void {
    if (typeof document === 'undefined' || !els.connectionsLayer) return;
    document.body.classList.toggle('is-empty', appState.nodes.length === 0);
    updateViewTransform();

    // Ensure defs exists
    let defs = els.connectionsLayer.querySelector('defs');
    if (!defs) {
        createdMarkerIds.clear();
        const defsContent = `
            <defs>
                <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="12" markerHeight="12" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                    <path d="M 0 0 L 8 5 L 0 10" stroke="var(--link-color)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
                </marker>
                <!-- 使用 userSpaceOnUse 防止水平/垂直线因 bounding box 为 0 导致滤镜失效或裁切 -->
                <filter id="hand-drawn-filter" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="10000" height="10000">
                    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" result="noise" />
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
                </filter>
                <filter id="hand-drawn-filter-marker" filterUnits="userSpaceOnUse" x="-500" y="-500" width="1000" height="1000">
                    <feTurbulence type="fractalNoise" baseFrequency="0.15" numOctaves="1" result="noise" />
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G" />
                </filter>
            </defs>`;
        els.connectionsLayer.innerHTML = defsContent;
        defs = els.connectionsLayer.querySelector('defs');
    }

    const nodeMap = new Map<string, CanvasNode>();
    for (let i = 0; i < appState.nodes.length; i++) {
        nodeMap.set(appState.nodes[i].id, appState.nodes[i]);
    }
    currentRenderNodeMap = nodeMap;

    syncDomElements(appState.nodes, els.nodesLayer, 'node', renderNode);
    syncDomElements(appState.groups, els.groupsLayer, 'group', renderGroup);

    // Sync Links
    const rootBaseColor = 'var(--link-color)';
    const existingPaths = new Map<string, SVGPathElement>();
    const connChildren = els.connectionsLayer.children;
    for (let i = 0; i < connChildren.length; i++) {
        const p = connChildren[i] as SVGPathElement;
        if (p.tagName && p.tagName.toLowerCase() === 'path' && p.dataset.id) {
            existingPaths.set(p.dataset.id, p);
        }
    }

    const isPresenting = isPresentationModeActive();

    appState.links.forEach((l: any) => {
        const sourceId = l.source || l.sourceId;
        const targetId = l.target || l.targetId;
        const linkId = l.id || `${sourceId}-${targetId}`;
        const n1 = nodeMap.get(sourceId);
        const n2 = nodeMap.get(targetId);
        if (n1 && n2 && n1.w && n1.h && n2.w && n2.h) {
            let pathEl = existingPaths.get(linkId);
            let isNewPath = false;
            if (!pathEl || pathEl.tagName.toLowerCase() !== 'path') {
                if (pathEl) safeRemoveElement(pathEl as HTMLElement);
                pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                pathEl.classList.add('link');
                pathEl.dataset.id = linkId;
                pathEl.setAttribute('fill', 'none');
                els.connectionsLayer!.appendChild(pathEl);
                isNewPath = true;
            }
            
            const startPoint = getEdgeIntersection(n2, n1);
            const endPoint = getEdgeIntersection(n1, n2);
            const pathData = buildLinkPathData(l, startPoint, endPoint);
            const linkStrokeColor = getLinkStrokeColor(l, n1, n2);
            const linkOpacity = String(getLinkOpacity(l));
            
            const setAttr = (elem: Element, name: string, val: string) => {
                if (elem.getAttribute(name) !== val) elem.setAttribute(name, val);
            };
            
            setAttr(pathEl, 'd', pathData);
            setAttr(pathEl, 'data-link-direction', l.direction || 'none');
            setAttr(pathEl, 'data-stroke-style', getLinkStrokeStyle(l));
            if (pathEl.style.stroke !== linkStrokeColor) pathEl.style.stroke = linkStrokeColor;
            if (pathEl.style.opacity !== linkOpacity) pathEl.style.opacity = linkOpacity;
            
            const markerId = getOrCreateMarker(defs, linkStrokeColor, rootBaseColor);

            if (l.direction === 'target') {
                setAttr(pathEl, 'marker-end', `url(#${markerId})`);
                pathEl.removeAttribute('marker-start');
            } else if (l.direction === 'source') {
                setAttr(pathEl, 'marker-start', `url(#${markerId})`);
                pathEl.removeAttribute('marker-end');
            } else {
                pathEl.removeAttribute('marker-end');
                pathEl.removeAttribute('marker-start');
            }

            // Tagging Mode Ghosting
            if (isLinkGhostedInTagging(l)) {
                pathEl.classList.add('tagging-ghost');
            } else {
                pathEl.classList.remove('tagging-ghost');
            }

            // Presentation Mode: visibility & ink flow
            const isLinkVisible = isLinkVisibleInPresentation(l, n1, n2);
            if (!isLinkVisible) {
                pathEl.classList.add('presentation-hidden');
                pathEl.classList.remove('ink-flow');
                delete pathEl.dataset.inkAnimated;
            } else {
                pathEl.classList.remove('presentation-hidden');
                if (isPresenting && !isGrandFinale() && isPresentationNavigatingForward() && (!pathEl.dataset.inkAnimated || isNewPath)) {
                    pathEl.dataset.inkAnimated = 'true';
                    const len = Math.ceil(Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) * 1.15);
                    pathEl.style.setProperty('--link-length', `${len}px`);
                    pathEl.classList.add('ink-flow');
                    pathEl.onanimationend = () => {
                        pathEl.classList.remove('ink-flow');
                        pathEl.style.removeProperty('--link-length');
                        pathEl.onanimationend = null;
                    };
                }
            }
            
            existingPaths.delete(linkId);
        }
    });
    
    existingPaths.forEach(pathEl => safeRemoveElement(pathEl));
    currentRenderNodeMap = null;

    if (appState.isEmbed && callbacks.updateOpenFullLink) callbacks.updateOpenFullLink();
    if (callbacks.updateFloatingDock) callbacks.updateFloatingDock();
}

/**
 * 初始化渲染模块
 */
export function initRender(_state: CanvasState, _callbacks: {
    saveData?: () => void;
    updateOpenFullLink?: () => void;
    updateFloatingDock?: () => void;
}): void {
    appState = _state;
    callbacks = _callbacks;
}
