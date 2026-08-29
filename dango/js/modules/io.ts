// modules/io.ts
import { state, pushHistory, packData, unpackData } from './state.js';
import { getTexts } from './i18n.js';
import { showToast, applySettings, showPersistentToast, dismissPersistentToast } from './ui.js';
import { getTimestamp, downloadBlob, copyToClipboard } from './utils.js';
import { fitView } from './view.js';

import type { CanvasState } from './types.js';

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

// 供用户在控制台直接输入 __dango_debug 调试预览
if (typeof window !== 'undefined') {
    (window as any).__dango_debug = {
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
