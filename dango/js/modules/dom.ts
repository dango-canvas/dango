// modules/dom.ts

export const getEl = <T extends HTMLElement | SVGElement = HTMLElement>(id: string): T | null =>
    (typeof document !== 'undefined' ? (document.getElementById(id) as T | null) : null);

export const els = {
    get bgWallpaperLayer() { return getEl<HTMLElement>('bg-wallpaper-layer'); },
    get bgWallpaperImage() { return getEl<HTMLImageElement>('bg-wallpaper-image'); },
    get bgWallpaperMask() { return getEl<HTMLElement>('bg-wallpaper-mask'); },
    get container() { return getEl<HTMLElement>('canvas-container'); },
    get world() { return getEl<HTMLElement>('world'); },
    get nodesLayer() { return getEl<HTMLElement>('nodes-layer'); },
    get groupsLayer() { return getEl<HTMLElement>('groups-layer'); },
    get connectionsLayer() { return getEl<SVGSVGElement>('connections-layer'); },
    get input() { return getEl<HTMLInputElement>('input-text'); },
    get selectBox() { return getEl<HTMLElement>('selection-box'); },
    get btnHelp() { return getEl<HTMLButtonElement>('btn-help'); },
    get helpModal() { return getEl<HTMLElement>('help-modal'); },
    get uiLayer() { return getEl<HTMLElement>('ui-layer'); },
    get spotlight() { return getEl<HTMLElement>('spotlight-layer'); },
    get snapGuidesLayer() { return getEl<SVGSVGElement>('snap-guides-layer'); },
};

/**
 * 安全地设置 HTML 内容
 */
export function setSafeHTML(el: HTMLElement, html: string): void {
    if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        el.textContent = '';
        while (doc.body.firstChild) {
            el.appendChild(doc.body.firstChild);
        }
    } else {
        el.innerHTML = html;
    }
}

/**
 * 安全地设置 SVG 内容
 */
export function setSafeSVG(el: SVGElement | HTMLElement | null, svgString: string): void {
    if (!el) return;
    
    const isTargetSVG = el.tagName?.toLowerCase() === 'svg';
    const trimmed = svgString.trim();
    
    if (typeof DOMParser !== 'undefined') {
        if (isTargetSVG) {
            // 情况 A：目标本身就是 SVG 元素，同步内容和属性
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
            setSafeHTML(el as HTMLElement, trimmed);
            const svg = el.querySelector('svg');
            if (svg) {
                // 强制修复 viewBox 大小写问题
                if (svg.hasAttribute('viewbox') && !svg.hasAttribute('viewBox')) {
                    svg.setAttribute('viewBox', svg.getAttribute('viewbox') || '');
                }
            }
        }
    } else {
        el.innerHTML = trimmed;
    }
}
