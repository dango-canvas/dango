// modules/render.js

import { isUrl, getEdgeIntersection } from './utils.js';
import { getTexts } from './i18n.js';
import { els } from './dom.js';

// --- 模块内部变量 ---
let appState;
let callbacks;

const IMAGE_SIZE_WIDTHS = { s: 100, l: 200 };
const IMAGE_SIZE_ICONS = {
    s: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 10 10 10 10 4"></polyline><polyline points="20 10 14 10 14 4"></polyline><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 14 14 14 14 20"></polyline></svg>',
    l: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="10 4 4 4 4 10"></polyline><polyline points="14 4 20 4 20 10"></polyline><polyline points="10 20 4 20 4 14"></polyline><polyline points="14 20 20 20 20 14"></polyline></svg>'
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
    if (!width) return 's';
    return width >= 200 ? 'l' : 's';
}

function getNextImageSizeKey(currentKey) {
    return currentKey === 's' ? 'l' : 's';
}

function applyImageSize(node, img, width) {
    if (!img || !img.naturalWidth) {
        // 如果图片还没加载好，先只设置宽度，高度等加载完再算
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

function renderNode(el, node) {
    el.setAttribute('role', 'button');
    el.style.transform = `translate(${node.x}px, ${node.y}px)`;
    
    // 编辑模式：优先处理
    if (el.classList.contains('editing') || el === document.activeElement) {
        const isSelected = appState.selection.has(node.id);
        el.className = ['node', node.color || 'c-white', isSelected ? 'selected' : '', 'editing'].filter(Boolean).join(' ');
        // 编辑时，清除固定宽高，让它自适应文字
        el.style.width = '';
        el.style.height = '';
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

        // 如果没有 w，或者 w 太小（可能是从文本节点转过来的），设为默认 S (100px)
        if (!node.w || node.w < 100) {
            node.w = IMAGE_SIZE_WIDTHS.s;
            const updateH = () => {
                if (img.naturalWidth) {
                    node.h = Math.round(node.w * (img.naturalHeight / img.naturalWidth));
                    el.style.height = `${node.h}px`;
                }
            };
            if (img.complete) updateH();
            else img.onload = updateH;
        }

        let sizeBtn = el.querySelector('.image-size-btn');
        if (!sizeBtn) {
            sizeBtn = document.createElement('button');
            sizeBtn.type = 'button';
            sizeBtn.className = 'image-size-btn';
            sizeBtn.onmousedown = (e) => e.stopPropagation();
            sizeBtn.onclick = (e) => {
                e.stopPropagation();
                const currentKey = getImageSizeKey(node.w);
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
        
        const currentKey = getImageSizeKey(node.w);
        const nextKey = getNextImageSizeKey(currentKey);
        const texts = getTexts();
        // 用户要求：此按钮的图标会动态变化，以直观地反映节点点击后的尺寸
        // 如果当前是 S，点击后变 L，所以显示 L 的图标（向外发散）
        // 如果当前是 L，点击后变 S，所以显示 S 的图标（向内收缩）
        sizeBtn.innerHTML = IMAGE_SIZE_ICONS[nextKey];
        sizeBtn.title = currentKey === 's' ? texts.img_zoom_in : texts.img_zoom_out;

        if (node.w) el.style.width = `${node.w}px`;
        if (node.h) el.style.height = `${node.h}px`;
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
    
    // 非图片节点才自动同步 DOM 尺寸到数据
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
