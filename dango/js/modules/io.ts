// modules/io.ts
import { state, pushHistory, packData, unpackData } from './state.js';
import { getTexts } from './i18n.js';
import { showToast, applySettings, showPersistentToast, dismissPersistentToast } from './ui.js';
import { getTimestamp, downloadBlob, copyToClipboard } from './utils.js';
import { fitView } from './view.js';
import { els } from './dom.js';

import type { CanvasState, ExportImageOptions } from './types.js';

declare const LZString: {
    compressToEncodedURIComponent: (str: string) => string;
    decompressFromEncodedURIComponent: (str: string) => string;
};

let renderRef: (() => void) | null = null;

export function initIO(render: () => void): void {
    renderRef = render;
}

/**
 * 清洗节点文本，生成适用于全平台文件系统的安全文件名片段。
 */
export function sanitizeFilenameTitle(text: string): string {
    if (!text) return '';
    // 1. 取首行
    const firstLine = text.split(/\r?\n/)[0];
    if (!firstLine) return '';

    // 2. 剥离 Markdown 语法和前缀
    let clean = firstLine
        .replace(/^#{1,6}(\s+|$)/, '') // 剥离 Markdown 标题前缀 (#, ##, ### 等)
        .replace(/^(\/\/|、、)(\s+|$)/, '') // 剥离注释前缀 (//, 、、)
        .replace(/^[\[【][\sxX✓]?[\]】](\s+|$)/, '') // 剥离 Todo 复选框 ([ ], [x], 【 】, 【x】)
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // 剥离图片保留 alt
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 剥离超链接保留文本
        .replace(/[*_`~#]/g, ''); // 剥离加粗/斜体/行内代码符号及残余 #

    // 3. 剥离跨平台文件系统非法字符 (\ / : * ? " < > | \0-\x1f)
    clean = clean.replace(/[\\/:*?"<>|\x00-\x1f]/g, '');

    // 4. 收敛连续空格并去除首尾空白
    clean = clean.replace(/\s+/g, ' ').trim();

    // 5. 最大长度截断为 30 字符
    if (clean.length > 30) {
        clean = clean.slice(0, 30).trim();
    }

    return clean;
}

/**
 * 按照语义优先级推断画布核心标题：
 * 1. 用户当前选中的节点/组文本 (Explicit Selection)
 * 2. 显式 Markdown 标题节点 (H1 > H2 > H3)
 * 3. 画布首个非空普通节点 (First Node)
 * 4. 保底回退: 'canvas'
 */
export function extractCanvasTitle(canvasState: CanvasState = state): string {
    // 梯队 1: 显式手选（Selection）
    if (canvasState.selection && canvasState.selection.size > 0) {
        for (const id of canvasState.selection) {
            const node = canvasState.nodes.find(n => n.id === id);
            if (node && node.text) {
                const title = sanitizeFilenameTitle(node.text);
                if (title) return title;
            }
            const group = canvasState.groups.find(g => g.id === id);
            if (group && group.text) {
                const title = sanitizeFilenameTitle(group.text);
                if (title) return title;
            }
        }
    }

    // 梯队 2: 显式 Markdown 标题节点（H1 > H2 > H3）
    const h1Node = canvasState.nodes.find(n => n.text && n.text.startsWith('# '));
    if (h1Node) {
        const title = sanitizeFilenameTitle(h1Node.text);
        if (title) return title;
    }
    const h2Node = canvasState.nodes.find(n => n.text && n.text.startsWith('## '));
    if (h2Node) {
        const title = sanitizeFilenameTitle(h2Node.text);
        if (title) return title;
    }
    const h3Node = canvasState.nodes.find(n => n.text && n.text.startsWith('### '));
    if (h3Node) {
        const title = sanitizeFilenameTitle(h3Node.text);
        if (title) return title;
    }

    // 梯队 3: 首个非空有效节点
    for (const node of canvasState.nodes) {
        if (node.text) {
            const title = sanitizeFilenameTitle(node.text);
            if (title) return title;
        }
    }

    // 梯队 4: 回退默认
    return 'canvas';
}

/**
 * 获取符合规范的导出文件名：dango_<Title>_<Timestamp>.dango
 */
export function getExportFilename(canvasState: CanvasState = state): string {
    const title = extractCanvasTitle(canvasState);
    return `dango_${title}_${getTimestamp()}.dango`;
}

export function exportJson(): void {
    const data = JSON.stringify({
        nodes: state.nodes,
        groups: state.groups,
        links: state.links,
        settings: state.settings
    }, null, 2);
    const filename = getExportFilename(state);
    downloadBlob(data, filename, 'application/json');
    checkAndTriggerFeedback();
}

export interface ExportBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
}

/**
 * 计算待导出图元的精确包围盒，并向外注入呼吸边距。
 */
export function calculateExportBounds(
    nodes: Array<{ x: number; y: number; w?: number; h?: number }>,
    groups: Array<{ x: number; y: number; w?: number; h?: number }>,
    padding = 60
): ExportBounds | null {
    if (nodes.length === 0 && groups.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + (n.w || 60));
        maxY = Math.max(maxY, n.y + (n.h || 40));
    });
    groups.forEach(g => {
        minX = Math.min(minX, g.x);
        minY = Math.min(minY, g.y);
        maxX = Math.max(maxX, g.x + (g.w || 0));
        maxY = Math.max(maxY, g.y + (g.h || 0));
    });
    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const width = Math.ceil(contentW + padding * 2);
    const height = Math.ceil(contentH + padding * 2);
    const offsetX = padding - minX;
    const offsetY = padding - minY;
    return { minX, minY, maxX, maxY, width, height, offsetX, offsetY };
}

/**
 * 获取符合规范的图片导出文件名：dango_<Title>_<Timestamp>.png
 */
export function getExportImageFilename(canvasState: CanvasState = state): string {
    const title = extractCanvasTitle(canvasState);
    return `dango_${title}_${getTimestamp()}.png`;
}

/**
 * 提取页面样式表规则用于 SVG foreignObject 内联渲染。
 */
export function collectExportStyles(): string {
    let cssText = '';
    if (typeof document !== 'undefined' && document.styleSheets) {
        for (let i = 0; i < document.styleSheets.length; i++) {
            const sheet = document.styleSheets[i];
            try {
                const rules = sheet.cssRules || sheet.rules;
                if (!rules) continue;
                for (let j = 0; j < rules.length; j++) {
                    cssText += rules[j].cssText + '\n';
                }
            } catch {
                // 忽略跨域样式表读取受限异常
            }
        }
    }
    return cssText;
}

/**
 * 异步内联图片为 Base64 Data URL，防止 Canvas 受到跨域污染 (Tainted Canvas)。
 */
async function inlineImages(container: HTMLElement): Promise<void> {
    const images = Array.from(container.querySelectorAll('img'));
    await Promise.all(images.map(async (img) => {
        const src = img.getAttribute('src');
        if (!src || src.startsWith('data:')) return;
        try {
            if (img.complete && img.naturalWidth > 0) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.naturalWidth;
                tempCanvas.height = img.naturalHeight;
                const tempCtx = tempCanvas.getContext('2d');
                if (tempCtx) {
                    tempCtx.drawImage(img, 0, 0);
                    const dataUrl = tempCanvas.toDataURL('image/png');
                    img.setAttribute('src', dataUrl);
                    return;
                }
            }
        } catch { }

        try {
            const resp = await fetch(src, { mode: 'cors' });
            if (resp.ok) {
                const blob = await resp.blob();
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                img.setAttribute('src', dataUrl);
            }
        } catch {
            console.warn('[Dango] Unable to inline image for export:', src);
        }
    }));
}

/**
 * 安全获取可用于 Canvas 离屏光栅化的壁纸 Image 元素（防跨域污染并支持外链 Unsplash 等资源）。
 */
async function resolveWallpaperDrawable(bgUrl: string, existingImg?: HTMLImageElement | null): Promise<HTMLImageElement | null> {
    if (!bgUrl) return null;

    // 1. 若现有图片已被加载为 data: URL，直接安全可用
    if (existingImg && existingImg.src && existingImg.src.startsWith('data:')) {
        return existingImg;
    }

    // 2. 若现有图片在 DOM 中且允许 Canvas 读取，直接复用
    if (existingImg && existingImg.complete && existingImg.naturalWidth > 0) {
        try {
            const testCanvas = document.createElement('canvas');
            testCanvas.width = 1;
            testCanvas.height = 1;
            const testCtx = testCanvas.getContext('2d');
            if (testCtx) {
                testCtx.drawImage(existingImg, 0, 0, 1, 1);
                testCanvas.toDataURL();
                return existingImg;
            }
        } catch { }
    }

    // 3. 仿照 inlineImages 机制：发起带 mode: 'cors' 的 fetch 请求，获取 Blob 转为 Base64 Data URL
    try {
        const resp = await fetch(bgUrl, { mode: 'cors' });
        if (resp.ok) {
            const blob = await resp.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const img = new Image();
            img.src = dataUrl;
            await new Promise((resolve) => {
                if (img.complete) resolve(true);
                else {
                    img.onload = () => resolve(true);
                    img.onerror = () => resolve(false);
                }
            });
            if (img.naturalWidth > 0) {
                return img;
            }
        }
    } catch {
        console.warn('[Dango] Export: Wallpaper cross-origin restricted, skipped to prevent tainted canvas.');
    }
    return null;
}

/**
 * 为 Todo 列表项生成高保真矢量复选框 SVG（规避 SVG foreignObject 无法光栅化原生表单控件的问题）。
 */
export function renderTodoCheckboxSvg(isChecked: boolean): string {
    const fillColor = isChecked ? 'var(--select-color, #258292)' : 'var(--c-white-bg, #ffffff)';
    const borderColor = isChecked ? 'var(--select-color, #258292)' : 'var(--link-color, #94a3b8)';
    const strokeOpacity = isChecked ? '1' : '0.6';
    const checkPath = isChecked
        ? '<path d="M3 7.2L5.4 9.6L10.8 4.2" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
        : '';
    return `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block; flex-shrink:0; margin:0;"><rect x="0.6" y="0.6" width="12.8" height="12.8" rx="2.5" fill="${fillColor}" stroke="${borderColor}" stroke-width="1.2" stroke-opacity="${strokeOpacity}"/>${checkPath}</svg>`;
}

/**
 * 根据参数及画布当前设置解析背景与网格输出策略：
 * - 默认或 'auto'：所见即所得，联动画板设置（若未隐藏网格则带网格，若已隐藏网格则纯色）
 * - 显式 'grid'：无视设置，强制绘制网格
 * - 显式 'clean'：无视设置，强制纯色无网格
 * - 显式 'transparent'：无视设置，强制透明底
 */
export function resolveExportBackground(
    bgOption: 'auto' | 'grid' | 'clean' | 'transparent' = 'auto',
    hideGrid = false
): { isTransparent: boolean; shouldDrawGrid: boolean } {
    if (bgOption === 'transparent') {
        return { isTransparent: true, shouldDrawGrid: false };
    }
    if (bgOption === 'grid') {
        return { isTransparent: false, shouldDrawGrid: true };
    }
    if (bgOption === 'clean') {
        return { isTransparent: false, shouldDrawGrid: false };
    }
    return { isTransparent: false, shouldDrawGrid: !hideGrid };
}

/**
 * 高保真画布截图导出核心入口 (默认 3x 超高清 Retina 输出)。
 * 1. 默认空参所见即所得：联动当前画板设置（亮暗主题、是否显示网格、手写风格）。
 * 2. 传参时支持强制覆盖无视设置（theme: 'light'|'dark', background: 'grid'|'clean'|'transparent'）。
 */
export async function exportImage(options: ExportImageOptions = {}): Promise<Blob | null> {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;

    // 1. 若当前有正在编辑的输入或节点，先触发失焦以提交持久化并完成视图派生
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
        await new Promise(resolve => setTimeout(resolve, 20));
    }

    const dpr = typeof options.dpr === 'number' && options.dpr > 0 ? options.dpr : 3;
    const scope = options.scope || 'all';
    const padding = typeof options.padding === 'number' ? options.padding : 60;

    // 主题解析：默认跟随画板当前主题，若显式传入参数则无视当前设置覆盖
    const targetTheme = options.theme || state.theme || 'light';

    // 手写风格解析：默认跟随画板当前设置，若显式传入参数则无视当前设置覆盖
    const isHandDrawn = typeof options.handDrawn === 'boolean' ? options.handDrawn : !!state.settings.handDrawn;

    // 背景与网格解析
    const { isTransparent, shouldDrawGrid } = resolveExportBackground(options.background, state.settings.hideGrid);

    // 2. 筛选待导出的目标图元集合
    let targetNodes = [...state.nodes];
    let targetGroups = [...state.groups];

    if (scope === 'selection' && state.selection.size > 0) {
        const selNodeIds = new Set(Array.from(state.selection).filter(id => state.nodes.some(n => n.id === id)));
        const selGroupIds = new Set(Array.from(state.selection).filter(id => state.groups.some(g => g.id === id)));
        targetNodes = state.nodes.filter(n => selNodeIds.has(n.id));
        targetGroups = state.groups.filter(g => selGroupIds.has(g.id));
    }

    if (targetNodes.length === 0 && targetGroups.length === 0) {
        showToast(getTexts().toast_canvas_empty || '画布为空，无法导出');
        return null;
    }

    // 3. 读取 DOM 真实物理边界计算外接矩形
    const measuredNodes = targetNodes.map(n => {
        const el = document.querySelector(`.node[data-id="${n.id}"]`) as HTMLElement | null;
        return {
            ...n,
            w: el ? el.offsetWidth : (n.w || 60),
            h: el ? el.offsetHeight : (n.h || 40)
        };
    });
    const measuredGroups = targetGroups.map(g => {
        const el = document.querySelector(`.group[data-id="${g.id}"]`) as HTMLElement | null;
        return {
            ...g,
            w: el ? el.offsetWidth : g.w,
            h: el ? el.offsetHeight : g.h
        };
    });

    const bounds = calculateExportBounds(measuredNodes, measuredGroups, padding);
    if (!bounds) return null;
    const { width: exportW, height: exportH, offsetX, offsetY, minX, minY } = bounds;

    // 4. 克隆并清洗 HTML 节点与编组图元（状态脱水）
    const serializer = new XMLSerializer();

    const groupsContainer = document.createElement('div');
    groupsContainer.id = 'groups-layer';
    groupsContainer.style.cssText = 'position: absolute; top: 0; left: 0;';
    targetGroups.forEach(g => {
        const el = document.querySelector(`.group[data-id="${g.id}"]`) as HTMLElement | null;
        if (el) {
            const clone = el.cloneNode(true) as HTMLElement;
            clone.classList.remove('selected', 'tagging-ghost', 'presentation-hidden');
            clone.querySelectorAll('.dango-step-badge').forEach(b => b.remove());
            groupsContainer.appendChild(clone);
        }
    });

    const nodesContainer = document.createElement('div');
    nodesContainer.id = 'nodes-layer';
    nodesContainer.style.cssText = 'position: absolute; top: 0; left: 0;';
    targetNodes.forEach(n => {
        const el = document.querySelector(`.node[data-id="${n.id}"]`) as HTMLElement | null;
        if (el) {
            const clone = el.cloneNode(true) as HTMLElement;
            clone.classList.remove('selected', 'search-found', 'editing', 'tagging-ghost', 'presentation-hidden');
            clone.querySelectorAll('.image-size-btn, .link-btn, .dango-step-badge').forEach(b => b.remove());

            // 保持与前端一致的排版：若包含 todo 项，确保靠左对齐与内边距一致（防止离屏 SVG 隔离环境对 :has 伪类兼容缺失）
            if (clone.querySelector('.todo-item')) {
                clone.classList.add('has-todo');
                clone.style.textAlign = 'left';
                clone.style.paddingLeft = '12px';
            }

            nodesContainer.appendChild(clone);
        }
    });

    // 转换 Todo 复选框为高保真矢量 SVG，彻底解决 SVG foreignObject 无法光栅化原生表单控件的问题
    nodesContainer.querySelectorAll<HTMLElement>('.todo-item').forEach(item => {
        const isChecked = item.classList.contains('checked') || item.getAttribute('data-checked') === 'true' || !!item.querySelector('input:checked');
        const wrapper = item.querySelector<HTMLElement>('.todo-checkbox-wrapper');
        if (wrapper) {
            wrapper.innerHTML = renderTodoCheckboxSvg(isChecked);
        }
    });

    // 异步准备卡片图片与外链壁纸（转为 Base64 Data URL 防跨域污染）
    const [wallpaperImg] = await Promise.all([
        !isTransparent && state.settings.bgUrl ? resolveWallpaperDrawable(state.settings.bgUrl, els.bgWallpaperImage) : Promise.resolve(null),
        inlineImages(nodesContainer)
    ]);

    // 5. 提取并克隆目标连线 SVG 路径与 Marker 样式
    const targetNodeIdSet = new Set(targetNodes.map(n => n.id));
    const targetLinks = state.links.filter(l => targetNodeIdSet.has(l.sourceId) && targetNodeIdSet.has(l.targetId));

    let connectionsXml = '';
    targetLinks.forEach(l => {
        const linkId = l.id || `${l.sourceId}-${l.targetId}`;
        const pathEl = els.connectionsLayer?.querySelector(`path[data-id="${linkId}"]`) as SVGPathElement | null;
        if (pathEl) {
            const pClone = pathEl.cloneNode(true) as SVGPathElement;
            pClone.classList.remove('tagging-ghost', 'presentation-hidden', 'ink-flow');
            pClone.setAttribute('fill', 'none');
            connectionsXml += serializer.serializeToString(pClone);
        }
    });

    let defsXml = '';
    const defs = els.connectionsLayer?.querySelector('defs');
    if (defs) {
        defsXml = serializer.serializeToString(defs);
    }

    // 6. 组装 foreignObject XHTML 内容
    const foreignDiv = document.createElement('div');
    foreignDiv.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    foreignDiv.setAttribute('data-theme', targetTheme);
    if (isHandDrawn) {
        foreignDiv.classList.add('hand-drawn-style');
    }

    // 手写风格：英文优先 Segoe Print (Win) / Chalkboard SE (Mac)，中文采用文楷与系统楷体
    const baseFontFamily = isHandDrawn
        ? `'Segoe Print', 'Chalkboard SE', 'LXGW WenKai', 'LXGW WenKai Screen', 'LXGW WenKai Mono TC', 'KaiTi', 'STKaiti', 'Kaiti SC', 'Comic Neue', 'Comic Sans MS', cursive, sans-serif`
        : `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

    foreignDiv.style.cssText = `position: relative; width: ${exportW}px; height: ${exportH}px; overflow: hidden; font-family: ${baseFontFamily}; -webkit-font-smoothing: antialiased;`;

    const worldOffsetDiv = document.createElement('div');
    worldOffsetDiv.style.cssText = `position: absolute; top: 0; left: 0; transform: translate(${offsetX}px, ${offsetY}px);`;
    worldOffsetDiv.appendChild(groupsContainer);
    worldOffsetDiv.appendChild(nodesContainer);
    foreignDiv.appendChild(worldOffsetDiv);

    const foreignDivXml = serializer.serializeToString(foreignDiv);
    const cssStyles = collectExportStyles();

    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${exportW}" height="${exportH}" viewBox="0 0 ${exportW} ${exportH}"><defs>${defsXml}<style type="text/css"><![CDATA[\n${cssStyles}\n]]></style></defs><g class="connections" transform="translate(${offsetX}, ${offsetY})">${connectionsXml}</g><foreignObject x="0" y="0" width="${exportW}" height="${exportH}">${foreignDivXml}</foreignObject></svg>`;

    // 7. 离屏 Canvas 光栅化与 Retina 绘制
    return new Promise<Blob | null>((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(exportW * dpr);
        canvas.height = Math.round(exportH * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            resolve(null);
            return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.scale(dpr, dpr);

        // 绘制背景
        if (!isTransparent) {
            let bgColor = targetTheme === 'dark' ? '#18181b' : '#f8f9fa';
            let dotColor = targetTheme === 'dark' ? '#334155' : '#cbd5e1';

            // 若 targetTheme 与当前页面一致，尝试优先使用计算样式获取最精确的变量值
            if (typeof window !== 'undefined' && targetTheme === state.theme) {
                const computedBg = getComputedStyle(document.body).backgroundColor;
                if (computedBg && computedBg !== 'rgba(0, 0, 0, 0)') {
                    bgColor = computedBg;
                }
                const computedDot = getComputedStyle(document.documentElement).getPropertyValue('--dot-color').trim();
                if (computedDot) {
                    dotColor = computedDot;
                }
            }

            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, exportW, exportH);

            // 若设置了壁纸且安全解析成功（支持 Unsplash 等 CORS 外链）
            if (wallpaperImg && wallpaperImg.naturalWidth > 0) {
                const imgW = wallpaperImg.naturalWidth;
                const imgH = wallpaperImg.naturalHeight;
                const scale = Math.max(exportW / imgW, exportH / imgH);
                const sw = exportW / scale;
                const sh = exportH / scale;
                const sx = (imgW - sw) / 2;
                const sy = (imgH - sh) / 2;
                ctx.drawImage(wallpaperImg, sx, sy, sw, sh, 0, 0, exportW, exportH);

                // 绘制壁纸蒙层，与实际画板体验一致
                ctx.fillStyle = targetTheme === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(127, 127, 127, 0.2)';
                ctx.fillRect(0, 0, exportW, exportH);
            }

            if (shouldDrawGrid) {
                ctx.fillStyle = dotColor;
                const dotSpacing = 24;
                const dotRadius = 1.2;
                const startX = ((padding - (minX % dotSpacing)) % dotSpacing + dotSpacing) % dotSpacing;
                const startY = ((padding - (minY % dotSpacing)) % dotSpacing + dotSpacing) % dotSpacing;
                for (let x = startX; x < exportW; x += dotSpacing) {
                    for (let y = startY; y < exportH; y += dotSpacing) {
                        ctx.beginPath();
                        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }

        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();

        img.onload = () => {
            ctx.drawImage(img, 0, 0, exportW, exportH);
            URL.revokeObjectURL(url);

            canvas.toBlob((blob) => {
                if (!blob) {
                    showToast(getTexts().alert_file_err || '导出失败');
                    resolve(null);
                    return;
                }
                if (options.download !== false) {
                    const filename = getExportImageFilename(state);
                    downloadBlob(blob, filename, 'image/png');
                    showToast(getTexts().toast_export_image_success || '截图已导出 ✨');
                    checkAndTriggerFeedback();
                }
                resolve(blob);
            }, 'image/png');
        };

        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            console.error('[Dango] Export image failed:', err);
            showToast(getTexts().alert_file_err || '导出失败');
            resolve(null);
        };

        img.src = url;
    });
}

function persistSettings(settings: Partial<typeof state.settings>): void {
    if (typeof localStorage === 'undefined') return;
    if (typeof settings.handDrawn === 'boolean') {
        localStorage.setItem('cc-hand-drawn', String(settings.handDrawn));
    }
    if (typeof settings.hideGrid === 'boolean') {
        localStorage.setItem('cc-hide-grid', String(settings.hideGrid));
    }
    if (typeof settings.altAsCtrl === 'boolean') {
        localStorage.setItem('cc-alt-as-ctrl', String(settings.altAsCtrl));
    }
    if (typeof settings.bgUrl === 'string') {
        if (settings.bgUrl) {
            localStorage.setItem('cc-bg-url', settings.bgUrl);
        } else {
            localStorage.removeItem('cc-bg-url');
        }
    }
}

export function processDangoFile(file: File): void {
    if (!file) return;
    if (!file.name.endsWith('.dango') && !file.name.endsWith('.json')) {
        showToast(getTexts().alert_file_err);
        return;
    }
    const reader = new FileReader();
    reader.onload = (ev: ProgressEvent<FileReader>) => {
        try {
            const content = ev.target?.result as string;
            const data = JSON.parse(content);
            let oldSnapshot: any = null;
            if (state.nodes.length > 0) {
                oldSnapshot = { nodes: [...state.nodes], groups: [...state.groups], links: [...state.links], settings: { ...state.settings } };
            }
            pushHistory();
            state.nodes = data.nodes || [];
            state.groups = data.groups || [];
            state.links = data.links || [];
            if (data.settings) {
                Object.assign(state.settings, data.settings);
                persistSettings(data.settings);
            }
            state.selection.clear();

            // 导入文件时重置视角到中心
            const winW = typeof window !== 'undefined' ? window.innerWidth : 1000;
            const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
            state.view = {
                x: winW / 2,
                y: winH / 2,
                scale: 1.2
            };

            if (renderRef) renderRef();
            applySettings(state);
            showToast(getTexts().toast_import_success, oldSnapshot);
        } catch (err) {
            console.error(err);
            showToast(getTexts().alert_file_err);
        }
    };
    reader.readAsText(file);
}

const FIRST_USED_KEY = 'dango_first_used';
const FEEDBACK_DISMISSED_KEY = 'dango_feedback_dismissed';

export function initFeedbackTracker(): void {
    if (typeof localStorage === 'undefined') return;
    if (!localStorage.getItem(FIRST_USED_KEY)) {
        localStorage.setItem(FIRST_USED_KEY, Date.now().toString());
    }
}

export function checkFeedbackEligibility(): boolean {
    if (typeof localStorage === 'undefined') return false;
    if (localStorage.getItem(FEEDBACK_DISMISSED_KEY) === 'true') return false;

    const firstUsedStr = localStorage.getItem(FIRST_USED_KEY);
    if (!firstUsedStr) {
        localStorage.setItem(FIRST_USED_KEY, Date.now().toString());
        return false;
    }
    const firstUsed = parseInt(firstUsedStr, 10);
    const days = (Date.now() - firstUsed) / (1000 * 60 * 60 * 24);
    const totalNodes = state.nodes.length;
    return days >= 7 && totalNodes >= 30;
}

export function checkAndTriggerFeedback(): void {
    if (checkFeedbackEligibility()) {
        const texts = getTexts();
        showPersistentToast('feedback-invite', texts.toast_feedback_invite, [
            {
                text: texts.toast_feedback_btn || '交流想法',
                className: 'btn-toast-primary',
                onClick: () => {
                    if (typeof window !== 'undefined') window.open('https://github.com/dango-canvas/dango/issues', '_blank');
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(FEEDBACK_DISMISSED_KEY, 'true');
                    }
                    dismissPersistentToast('feedback-invite');
                }
            },
            {
                text: '✕',
                className: 'btn-toast-danger',
                onClick: () => {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(FEEDBACK_DISMISSED_KEY, 'true');
                    }
                    dismissPersistentToast('feedback-invite');
                }
            }
        ]);
    }
}

// 供用户在控制台直接输入 exportImage / __dango_debug 调试预览
if (typeof window !== 'undefined') {
    (window as any).exportImage = (options?: ExportImageOptions) => exportImage(options);
    (window as any).__dango_debug = {
        exportImage: (options?: ExportImageOptions) => exportImage(options),
        triggerFeedback: (force = true) => {
            const texts = getTexts();
            showPersistentToast('feedback-invite', texts.toast_feedback_invite, [
                {
                    text: texts.toast_feedback_btn || '交流想法',
                    className: 'btn-toast-primary',
                    onClick: () => {
                        window.open('https://github.com/dango-canvas/dango/issues', '_blank');
                        localStorage.setItem(FEEDBACK_DISMISSED_KEY, 'true');
                        dismissPersistentToast('feedback-invite');
                    }
                },
                {
                    text: '✕',
                    className: 'btn-toast-danger',
                    onClick: () => {
                        localStorage.setItem(FEEDBACK_DISMISSED_KEY, 'true');
                        dismissPersistentToast('feedback-invite');
                    }
                }
            ]);
        },
        resetFeedback: () => {
            localStorage.removeItem(FEEDBACK_DISMISSED_KEY);
            localStorage.removeItem(FIRST_USED_KEY);
            console.log('[Dango Debug] Feedback stats reset.');
        },
        getStats: () => ({
            firstUsed: localStorage.getItem(FIRST_USED_KEY),
            firstUsedDate: localStorage.getItem(FIRST_USED_KEY) ? new Date(parseInt(localStorage.getItem(FIRST_USED_KEY)!)).toLocaleString() : null,
            dismissed: localStorage.getItem(FEEDBACK_DISMISSED_KEY),
            eligible: checkFeedbackEligibility(),
            nodesCount: state.nodes.length
        })
    };
}

export function createShareLink(): void {
    const packed = packData();
    const compressed = (typeof LZString !== 'undefined') ? LZString.compressToEncodedURIComponent(JSON.stringify(packed)) : '';
    const baseUrl = (typeof window !== 'undefined' && window.location) ? (window.location.origin + window.location.pathname) : '';
    const url = baseUrl + '#' + compressed;
    copyToClipboard(url).then((success) => {
        showToast(getTexts().toast_copy_link_success);
        if (success) checkAndTriggerFeedback();
    });
}

export function createEmbedCode(): void {
    const packed = packData();
    const compressed = (typeof LZString !== 'undefined') ? LZString.compressToEncodedURIComponent(JSON.stringify(packed)) : '';
    const baseUrl = (typeof window !== 'undefined' && window.location) ? (window.location.origin + window.location.pathname) : '';
    const iframe = `<iframe src="${baseUrl}?embed=true#${compressed}" style="width: 100%; height: 500px; border: none; border-radius: 12px;" allow="clipboard-write"></iframe>`;
    copyToClipboard(iframe).then((success) => {
        showToast(getTexts().toast_copy_embed_success);
        if (success) checkAndTriggerFeedback();
    });
}

export function applyUrlQueryOverrides(): void {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);

    // 1. toolbar 覆盖 (toolbar=0 / toolbar=1)
    const toolbarParam = urlParams.get('toolbar');
    if (toolbarParam !== null) {
        const show = toolbarParam === '1' || toolbarParam === 'true';
        state.settings.hideToolbar = !show;
        state.explicitToolbar = true;
        if (typeof document !== 'undefined') {
            const check = document.getElementById('check-hide-toolbar') as HTMLInputElement | null;
            if (check) check.checked = !show;
            if (show && state.isEmbed) {
                document.body.classList.add('embed-show-toolbar');
            } else {
                document.body.classList.remove('embed-show-toolbar');
            }
        }
    }

    // 2. readonly 覆盖 (readonly=1 / readonly=true)
    const readonlyParam = urlParams.get('readonly');
    if (readonlyParam === '1' || readonlyParam === 'true') {
        state.isReadonly = true;
        if (typeof document !== 'undefined') {
            document.body.classList.add('is-readonly');
        }
    }

    // 3. theme 覆盖 (theme=light / theme=dark)
    const themeParam = urlParams.get('theme');
    if (themeParam === 'dark' || themeParam === 'light') {
        state.theme = themeParam;
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', themeParam);
            document.body.setAttribute('data-theme', themeParam);
        }
    }
}

export function updateOpenFullLink(): void {
    if (!state.isEmbed) return;
    const btn = document.getElementById('btn-open-full') as HTMLAnchorElement | null;
    if (!btn) return;
    const packed = packData();
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(packed));
    const baseUrl = window.location.origin + window.location.pathname;
    btn.href = baseUrl + '#' + compressed;
}

export function loadFromUrl(): boolean {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash.substring(1);
    if (!hash) {
        applyUrlQueryOverrides();
        return false;
    }
    try {
        const decompressed = LZString.decompressFromEncodedURIComponent(hash);
        if (!decompressed) {
            applyUrlQueryOverrides();
            return false;
        }
        const dataRaw = JSON.parse(decompressed);
        const data = Array.isArray(dataRaw) ? unpackData(dataRaw) : dataRaw;
        const hasContent = state.nodes.length > 0;
        const oldSnapshot = hasContent ? {
            nodes: [...state.nodes],
            groups: [...state.groups],
            links: [...state.links],
            selection: Array.from(state.selection)
        } : null;

        pushHistory();
        state.nodes = data.nodes || [];
        state.groups = data.groups || [];
        state.links = data.links || [];
        state.selection.clear();
        if (data.settings) {
            Object.assign(state.settings, data.settings);
            if (!state.isEmbed) {
                persistSettings(data.settings);
            }
        }
        if (renderRef) renderRef();
        applySettings(state);
        applyUrlQueryOverrides();
        if (state.isEmbed) {
            // 嵌入模式下，加载完数据后自动缩放至合适大小
            fitView(10, false);
        } else {
            // 从 URL 导入数据时，重置视角到中心
            state.view = {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
                scale: 1.2
            };
            showToast(getTexts().toast_imported, oldSnapshot);
            window.history.replaceState(null, '', window.location.pathname);
        }
        return true;
    } catch (e) {
        console.error("Import failed:", e);
        applyUrlQueryOverrides();
        return false;
    }
}
