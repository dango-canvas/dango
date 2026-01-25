// modules/dom.js

export const els = {
    container: document.getElementById('canvas-container'),
    world: document.getElementById('world'),
    nodesLayer: document.getElementById('nodes-layer'),
    groupsLayer: document.getElementById('groups-layer'),
    connectionsLayer: document.getElementById('connections-layer'),
    input: document.getElementById('input-text'),
    selectBox: document.getElementById('selection-box'),
    btnHelp: document.getElementById('btn-help'),
    helpModal: document.getElementById('help-modal'),
    uiLayer: document.getElementById('ui-layer'),
    spotlight: document.getElementById('spotlight-layer'),
};

/**
 * 安全地设置 HTML 内容
 * @param {HTMLElement} el 
 * @param {string} html 
 */
export function setSafeHTML(el, html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    el.innerHTML = '';
    while (doc.body.firstChild) {
        el.appendChild(doc.body.firstChild);
    }
}

/**
 * 安全地设置 SVG 内容
 * @param {SVGElement} el 
 * @param {string} svgString 
 */
export function setSafeSVG(el, svgString) {
    const parser = new DOMParser();
    // 如果 svgString 包含 <svg> 标签，我们解析整个 SVG
    // 如果不包含，我们把它包装在 <svg> 中解析，然后取其子节点
    const wrappedString = svgString.trim().startsWith('<svg') ? svgString : `<svg xmlns="http://www.w3.org/2000/svg">${svgString}</svg>`;
    const doc = parser.parseFromString(wrappedString, 'image/svg+xml');
    const svgElement = doc.querySelector('svg');
    
    if (svgElement) {
        if (svgString.trim().startsWith('<svg')) {
            // 如果原本就是 <svg>，则替换整个元素内容或追加
            el.innerHTML = '';
            while (svgElement.firstChild) {
                el.appendChild(svgElement.firstChild);
            }
            // 还要复制属性
            Array.from(svgElement.attributes).forEach(attr => {
                el.setAttribute(attr.name, attr.value);
            });
        } else {
            // 如果是 <defs> 等内容，则追加其子节点
            el.innerHTML = '';
            while (svgElement.firstChild) {
                el.appendChild(svgElement.firstChild);
            }
        }
    }
}
