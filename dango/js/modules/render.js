// modules/render.js

import { isUrl, getEdgeIntersection } from './utils.js';
import { getTexts } from './i18n.js';
import { els, setSafeHTML, setSafeSVG } from './dom.js';

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

function highlightCode(code) {
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // 使用单次扫描正则，避免对已生成的 HTML 标签进行二次替换
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

function renderCodeBlock(el, text) {
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
            <div class="code-lang">${lang}</div>
        </div>
        <div class="code-content">${highlightCode(code)}</div>
    `;
    setSafeHTML(el, html);
}

function parseMarkdown(text) {
    let escapedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // 保留连续空格，防止 HTML 默认塌陷
    escapedText = escapedText.replace(/ {2}/g, ' &nbsp;');

    let processedText = escapedText;
    if (escapedText.startsWith('### ')) processedText = escapedText.substring(4);
    else if (escapedText.startsWith('## ')) processedText = escapedText.substring(3);
    else if (escapedText.startsWith('# ')) processedText = escapedText.substring(2);
    
    if (escapedText.startsWith('// ')) processedText = escapedText.substring(3);
    else if (escapedText.startsWith('//')) processedText = escapedText.substring(2);

    const lines = processedText.split('\n');
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
            // Inline Links: [text](url)
            processedLine = processedLine.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                let validUrl = url.trim();
                if (!validUrl.startsWith('http') && !validUrl.startsWith('#')) {
                    validUrl = 'https://' + validUrl;
                }
                return `<a href="${validUrl}" target="_blank" class="node-inline-link" onclick="event.stopPropagation()">${text}</a>`;
            });
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
    if (el.classList.contains('editing')) {
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
            el.textContent = '';
            img = document.createElement('img');
            img.className = 'node-image';
            el.appendChild(img);
            
            // 首次转为图片节点时，强制设为 100 宽
            node.w = IMAGE_SIZE_WIDTHS.s;
            el.style.width = `${node.w}px`;
        }
        if (img.getAttribute('src') !== imageData.url) img.setAttribute('src', imageData.url);
        if (img.getAttribute('alt') !== imageData.alt) img.setAttribute('alt', imageData.alt);

        // 如果 w 太小（可能是从之前的文本节点继承来的），设为默认 S (100px)
        if (!node.w || node.w < 100) {
            node.w = IMAGE_SIZE_WIDTHS.s;
            el.style.width = `${node.w}px`;
        }

        const updateH = () => {
            if (img.naturalWidth) {
                const newH = Math.round(node.w * (img.naturalHeight / img.naturalWidth));
                if (node.h !== newH) {
                    node.h = newH;
                    el.style.height = `${node.h}px`;
                    render(); // 重新渲染以更新连线
                }
            }
        };
        
        if (img.complete) updateH();
        else img.onload = updateH;

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
        setSafeSVG(sizeBtn, IMAGE_SIZE_ICONS[nextKey]);
        sizeBtn.title = currentKey === 's' ? texts.img_zoom_in : texts.img_zoom_out;

        el.style.width = `${node.w}px`;
        if (node.h) el.style.height = `${node.h}px`;
        else el.style.height = 'auto'; // 加载中或无高度时自适应，防止塌陷为 0
    }

    if (isLink) {
        el.classList.add('is-link');
        el.classList.remove('has-multiline');
        let textEl = el.querySelector('.node-text');
        if (!textEl) {
            el.textContent = '';
            textEl = document.createElement('div');
            textEl.className = 'node-text';
            el.appendChild(textEl);
        }
        if (textEl.innerText !== node.text) textEl.innerText = node.text;
        let btnEl = el.querySelector('.link-btn');
        if (!btnEl) {
            btnEl = document.createElement('div');
            btnEl.className = 'link-btn';
            setSafeSVG(btnEl, '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>');
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
            const trimmedText = node.text.trim();
            const isCode = trimmedText.startsWith('```') && trimmedText.endsWith('```');
            
            // 只有当文本真正发生变化或渲染逻辑改变时才更新
            if (el.dataset.lastText !== node.text) {
                if (isCode) {
                    renderCodeBlock(el, trimmedText);
                } else {
                    const newHtml = parseMarkdown(node.text);
                    setSafeHTML(el, newHtml);
                }
                el.dataset.lastText = node.text;
                el.style.width = '';
                el.style.height = '';
            }
        }
    }

    const isSelected = appState.selection.has(node.id);
    const classes = ['node', node.color || 'c-white'];
    if (isImage) classes.push('image-node');
    if (isLink) classes.push('is-link');
    if (isSelected) classes.push('selected');
    if (node.text && node.text.includes('\n')) classes.push('has-multiline');
    
    // 增加标题类支持
    if (node.text.startsWith('### ')) classes.push('node-h3');
    else if (node.text.startsWith('## ')) classes.push('node-h2');
    else if (node.text.startsWith('# ')) classes.push('node-h1');
    
    // 增加注释类支持
    if (node.text.startsWith('//')) classes.push('node-comment');
    
    // 增加代码块类支持
    if (node.text.startsWith('```') && node.text.endsWith('```')) classes.push('node-code');

    el.className = classes.join(' ');
    
    // 非图片节点才自动同步 DOM 尺寸到数据
    if (!isImage && (!node.w || !node.h || el.offsetWidth !== node.w || el.offsetHeight !== node.h)) {
        node.w = el.offsetWidth;
        node.h = el.offsetHeight;
    }
}

function renderGroup(el, group) {
    if (group.memberIds && group.memberIds.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasVisibleMembers = false;
        group.memberIds.forEach(mid => {
            const m = appState.nodes.find(n => n.id === mid);
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

    el.style.transform = `translate(${group.x}px, ${group.y}px)`;
    el.style.width = `${group.w}px`;
    el.style.height = `${group.h}px`;
    el.className = `group ${appState.selection.has(group.id) ? 'selected' : ''}`;
}

export function updateViewTransform() {
    if (!appState || !els.world) return;
    els.world.style.transform = `translate(${appState.view.x}px, ${appState.view.y}px) scale(${appState.view.scale})`;
}

/**
 * 主渲染函数
 */
export function render() {
    document.body.classList.toggle('is-empty', appState.nodes.length === 0);
    updateViewTransform();

    // Ensure defs exists
    let defs = els.connectionsLayer.querySelector('defs');
    if (!defs) {
        const defsContent = `<defs><marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 8 5 L 0 10" stroke="var(--link-color)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></marker></defs>`;
        els.connectionsLayer.innerHTML = defsContent;
    }

    // Sync Links
    const existingLines = new Map();
    Array.from(els.connectionsLayer.querySelectorAll('line.link')).forEach(line => {
        if (line.dataset.id) existingLines.set(line.dataset.id, line);
    });

    appState.links.forEach(l => {
        const n1 = appState.nodes.find(n => n.id === l.sourceId);
        const n2 = appState.nodes.find(n => n.id === l.targetId);
        if (n1 && n2 && n1.w && n1.h && n2.w && n2.h) {
            let line = existingLines.get(l.id);
            if (!line) {
                line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.classList.add('link');
                line.dataset.id = l.id;
                els.connectionsLayer.appendChild(line);
            }
            
            const startPoint = getEdgeIntersection(n2, n1);
            const endPoint = getEdgeIntersection(n1, n2);
            
            // Only update attributes if changed
            const setAttr = (el, name, val) => {
                if (el.getAttribute(name) != val) el.setAttribute(name, val);
            };
            
            setAttr(line, 'x1', startPoint.x);
            setAttr(line, 'y1', startPoint.y);
            setAttr(line, 'x2', endPoint.x);
            setAttr(line, 'y2', endPoint.y);
            
            if (l.direction === 'target') {
                setAttr(line, 'marker-end', 'url(#arrowhead)');
                line.removeAttribute('marker-start');
            } else if (l.direction === 'source') {
                setAttr(line, 'marker-start', 'url(#arrowhead)');
                line.removeAttribute('marker-end');
            } else {
                line.removeAttribute('marker-end');
                line.removeAttribute('marker-start');
            }
            
            existingLines.delete(l.id);
        }
    });
    
    existingLines.forEach(line => line.remove());

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
