// modules/render.js

import { isUrl, getEdgeIntersection } from './utils.js';
import { els } from './dom.js';

// --- 模块内部变量 ---
let appState;
let callbacks;

const IMAGE_SIZE_ORDER = ['s', 'm', 'l'];
const IMAGE_SIZE_WIDTHS = { s: 200, m: 400, l: 600 };
const IMAGE_SIZE_ICONS = {
    s: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 3 5 3 5 7"></polyline><line x1="5" y1="3" x2="9" y2="7"></line><polyline points="15 3 19 3 19 7"></polyline><line x1="19" y1="3" x2="15" y2="7"></line><polyline points="9 21 5 21 5 17"></polyline><line x1="5" y1="21" x2="9" y2="17"></line><polyline points="15 21 19 21 19 17"></polyline><line x1="19" y1="21" x2="15" y2="17"></line></svg>',
    m: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 3 3 3 3 7"></polyline><line x1="3" y1="3" x2="10" y2="10"></line><polyline points="17 21 21 21 21 17"></polyline><line x1="14" y1="14" x2="21" y2="21"></line><polyline points="17 3 21 3 21 7"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><polyline points="7 21 3 21 3 17"></polyline><line x1="3" y1="21" x2="10" y2="14"></line></svg>',
    l: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 9 3 3 9 3"></polyline><line x1="3" y1="3" x2="9" y2="9"></line><polyline points="21 9 21 3 15 3"></polyline><line x1="21" y1="3" x2="15" y2="9"></line><polyline points="3 15 3 21 9 21"></polyline><line x1="3" y1="21" x2="9" y2="15"></line><polyline points="21 15 21 21 15 21"></polyline><line x1="21" y1="21" x2="15" y2="15"></line></svg>'
};

function syncDomElements(dataArray, parent, className, renderFn) {
    const existing = new Map();
    Array.from(parent.children).forEach(el => existing.set(el.dataset.id, el));
    const activeIds = new Set();
    dataArray.forEach(item => {
        activeIds.add(item.id);
        let el = existing.get(item.id);
        if (!el) {
            el = document.createElement('div');
            el.className = className;
            el.dataset.id = item.id;
            parent.appendChild(el);
        }
        renderFn(el, item);
    });
    existing.forEach((el, id) => { if (!activeIds.has(id)) el.remove(); });
}

function parseMarkdown(text) {
    let escapedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = escapedText.split('\n');
    const htmlLines = lines.map(line => {
        let processedLine = line.replace(
            /^\[([ xX])\] (.*)/,
            (match, checked, content) => {
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
            processedLine = processedLine.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)|_(.*?)_/g, '<em>$1$2</em>');
        }
        return processedLine;
    });
    return htmlLines.join('<br>');
}

function parseImageMarkdown(text) {
    const trimmed = text.trim();
    const match = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (!match) return null;
    return { alt: match[1], url: match[2].trim() };
}

function getImageSizeKey(width) {
    if (!width) return 'm';
    let closest = 'm';
    let minDiff = Infinity;
    Object.keys(IMAGE_SIZE_WIDTHS).forEach(key => {
        const diff = Math.abs(width - IMAGE_SIZE_WIDTHS[key]);
        if (diff < minDiff) {
            minDiff = diff;
            closest = key;
        }
    });
    return closest;
}

function getNextImageSizeKey(currentKey) {
    const index = IMAGE_SIZE_ORDER.indexOf(currentKey);
    if (index === -1) return 'm';
    return IMAGE_SIZE_ORDER[(index + 1) % IMAGE_SIZE_ORDER.length];
}

function applyImageSize(node, img, width) {
    if (!img || !img.naturalWidth) return false;
    const ratio = img.naturalHeight / img.naturalWidth;
    const height = Math.round(width * ratio);
    if (node.w === width && node.h === height) return false;
    node.w = width;
    node.h = height;
    return true;
}

function renderNode(el, node) {
    el.setAttribute('role', 'button');
    el.style.transform = `translate(${node.x}px, ${node.y}px)`;
    if (el.classList.contains('editing') || el === document.activeElement) {
        const isSelected = appState.selection.has(node.id);
        el.className = ['node', node.color || 'c-white', isSelected ? 'selected' : '', 'editing'].filter(Boolean).join(' ');
        return;
    }

    const imageData = parseImageMarkdown(node.text);
    const isImage = !!imageData;
    const isLink = !isImage && isUrl(node.text);

    if (isImage) {
        el.classList.remove('is-link');
        let img = el.querySelector('.node-image');
        if (!img) {
            el.innerHTML = '';
            img = document.createElement('img');
            img.className = 'node-image';
            el.appendChild(img);
        }
        if (img.getAttribute('src') !== imageData.url) img.setAttribute('src', imageData.url);
        if (img.getAttribute('alt') !== imageData.alt) img.setAttribute('alt', imageData.alt);

        let sizeBtn = el.querySelector('.image-size-btn');
        if (!sizeBtn) {
            sizeBtn = document.createElement('button');
            sizeBtn.type = 'button';
            sizeBtn.className = 'image-size-btn';
            sizeBtn.title = '切换尺寸';
            sizeBtn.onmousedown = (e) => e.stopPropagation();
            sizeBtn.onclick = (e) => {
                e.stopPropagation();
                const currentKey = getImageSizeKey(node.w || IMAGE_SIZE_WIDTHS.m);
                const nextKey = getNextImageSizeKey(currentKey);
                const targetWidth = IMAGE_SIZE_WIDTHS[nextKey];
                const applySize = () => {
                    if (applyImageSize(node, img, targetWidth)) {
                        el.style.width = `${node.w}px`;
                        el.style.height = `${node.h}px`;
                        render();
                    }
                };
                if (img.complete && img.naturalWidth) {
                    applySize();
                } else {
                    img.onload = () => applySize();
                }
            };
            el.appendChild(sizeBtn);
        }
        const currentKey = getImageSizeKey(node.w || IMAGE_SIZE_WIDTHS.m);
        const nextKey = getNextImageSizeKey(currentKey);
        sizeBtn.innerHTML = IMAGE_SIZE_ICONS[nextKey];

        if (!node.w || !node.h) {
            const defaultWidth = IMAGE_SIZE_WIDTHS.m;
            const applyDefault = () => {
                if (applyImageSize(node, img, defaultWidth)) {
                    el.style.width = `${node.w}px`;
                    el.style.height = `${node.h}px`;
                    render();
                }
            };
            if (img.complete && img.naturalWidth) {
                applyDefault();
            } else {
                img.onload = () => applyDefault();
            }
        }
        if (node.w && node.h) {
            el.style.width = `${node.w}px`;
            el.style.height = `${node.h}px`;
        }
    }

    if (isLink) {
        el.classList.add('is-link');
        el.classList.remove('has-multiline');
        let textEl = el.querySelector('.node-text');
        if (!textEl) {
            el.innerHTML = '';
            textEl = document.createElement('div');
            textEl.className = 'node-text';
            el.appendChild(textEl);
        }
        if (textEl.innerText !== node.text) textEl.innerText = node.text;
        let btnEl = el.querySelector('.link-btn');
        if (!btnEl) {
            btnEl = document.createElement('div');
            btnEl.className = 'link-btn';
            btnEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';
            btnEl.onmousedown = (e) => e.stopPropagation();
            btnEl.onclick = (e) => {
                e.stopPropagation();
                let url = node.text.trim();
                if (!url.startsWith('http')) url = 'https://' + url;
                window.open(url, '_blank');
            };
            el.appendChild(btnEl);
        }
    } else {
        if (!isImage) {
            el.classList.remove('is-link');
            const newHtml = parseMarkdown(node.text);
            if (el.innerHTML !== newHtml) el.innerHTML = newHtml;
            el.style.width = '';
            el.style.height = '';
        }
    }

    const isSelected = appState.selection.has(node.id);
    const classes = ['node', node.color || 'c-white'];
    if (isImage) classes.push('image-node');
    if (isLink) classes.push('is-link');
    if (isSelected) classes.push('selected');
    el.className = classes.join(' ');
    if (!isImage && (!node.w || !node.h || el.offsetWidth !== node.w || el.offsetHeight !== node.h)) {
        node.w = el.offsetWidth;
        node.h = el.offsetHeight;
    }
}

function renderGroup(el, group) {
    el.style.transform = `translate(${group.x}px, ${group.y}px)`;
    el.style.width = `${group.w}px`;
    el.style.height = `${group.h}px`;
    el.className = `group ${appState.selection.has(group.id) ? 'selected' : ''}`;
}

/**
 * 主渲染函数
 */
export function render() {
    document.body.classList.toggle('is-empty', appState.nodes.length === 0);
    els.world.style.transform = `translate(${appState.view.x}px, ${appState.view.y}px) scale(${appState.view.scale})`;

    const linkColor = getComputedStyle(document.body).getPropertyValue('--link-color').trim();
    const defsContent = `<defs><marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 8 5 L 0 10" stroke="${linkColor}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></marker></defs>`;
    els.connectionsLayer.innerHTML = defsContent;

    appState.links.forEach(l => {
        const n1 = appState.nodes.find(n => n.id === l.sourceId);
        const n2 = appState.nodes.find(n => n.id === l.targetId);
        if (n1 && n2 && n1.w && n1.h && n2.w && n2.h) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            const startPoint = getEdgeIntersection(n2, n1);
            const endPoint = getEdgeIntersection(n1, n2);
            line.setAttribute('x1', startPoint.x);
            line.setAttribute('y1', startPoint.y);
            line.setAttribute('x2', endPoint.x);
            line.setAttribute('y2', endPoint.y);
            line.classList.add('link');
            if (l.direction === 'target') line.setAttribute('marker-end', 'url(#arrowhead)');
            else if (l.direction === 'source') line.setAttribute('marker-start', 'url(#arrowhead)');
            els.connectionsLayer.appendChild(line);
        }
    });

    syncDomElements(appState.groups, els.groupsLayer, 'group', renderGroup);
    syncDomElements(appState.nodes, els.nodesLayer, 'node', renderNode);

    if (appState.isEmbed) callbacks.updateOpenFullLink();
    callbacks.saveData();
}

/**
 * 初始化渲染模块
 */
export function initRender(_state, _callbacks) {
    appState = _state;
    callbacks = _callbacks;
}
