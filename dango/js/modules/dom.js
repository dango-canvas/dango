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
    el.textContent = '';
    while (doc.body.firstChild) {
        el.appendChild(doc.body.firstChild);
    }
}

/**
 * 安全地设置 SVG 内容
 * @param {SVGElement|HTMLElement} el 
 * @param {string} svgString 
 */
export function setSafeSVG(el, svgString) {
    if (!el) return;
    
    const isTargetSVG = el.tagName.toLowerCase() === 'svg';
    const trimmed = svgString.trim();
    
    if (isTargetSVG) {
        // 情况 A：目标本身就是 SVG 元素，同步内容和属性
        // 为了保留 viewBox 等大小写敏感属性，使用 image/svg+xml 解析
        let xmlString = trimmed;
        if (!xmlString.toLowerCase().startsWith('<svg')) {
            xmlString = `<svg xmlns="http://www.w3.org/2000/svg">${xmlString}</svg>`;
        } else if (!xmlString.includes('xmlns=')) {
            xmlString = xmlString.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, 'image/svg+xml');
        if (doc.querySelector('parsererror')) return;

        const svgElement = doc.documentElement;
        el.textContent = '';
        while (svgElement.firstChild) {
            el.appendChild(svgElement.firstChild);
        }
        Array.from(svgElement.attributes).forEach(attr => {
            if (attr.name !== 'xmlns') {
                el.setAttribute(attr.name, attr.value);
            }
        });
    } else {
        // 情况 B：目标是容器（如 button），直接设置 innerHTML
        // 现代浏览器会自动处理 HTML5 中的 SVG 标签，但可能会将 viewBox 误认为 viewbox (小写)
        setSafeHTML(el, trimmed);
        const svg = el.querySelector('svg');
        if (svg) {
            // 强制修复 viewBox 大小写问题，这在 HTML 环境下很常见
            if (svg.hasAttribute('viewbox') && !svg.hasAttribute('viewBox')) {
                svg.setAttribute('viewBox', svg.getAttribute('viewbox'));
            }
        }
    }
}
