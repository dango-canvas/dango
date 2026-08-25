// modules/io.ts
import { state, pushHistory, packData, unpackData } from './state.js';
import { getTexts } from './i18n.js';
import { showToast, applySettings } from './ui.js';
import { getTimestamp } from './utils.js';
import { fitView } from './view.js';

declare const LZString: {
    compressToEncodedURIComponent: (str: string) => string;
    decompressFromEncodedURIComponent: (str: string) => string;
};

let renderRef: (() => void) | null = null;

export function initIO(render: () => void): void {
    renderRef = render;
}

export function exportJson(): void {
    const data = JSON.stringify({ 
        nodes: state.nodes, 
        groups: state.groups, 
        links: state.links,
        settings: state.settings
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dango-canvas_${getTimestamp()}.dango`;
    a.click();
    URL.revokeObjectURL(url);
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

import { showPersistentToast, dismissPersistentToast } from './ui.js';

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
                text: 'GitHub',
                onClick: () => {
                    if (typeof window !== 'undefined') window.open('https://github.com/dango-canvas/dango', '_blank');
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(FEEDBACK_DISMISSED_KEY, 'true');
                    }
                    dismissPersistentToast('feedback-invite');
                }
            },
            {
                text: '✕',
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
                    text: 'GitHub',
                    onClick: () => {
                        window.open('https://github.com/dango-canvas/dango', '_blank');
                        localStorage.setItem(FEEDBACK_DISMISSED_KEY, 'true');
                        dismissPersistentToast('feedback-invite');
                    }
                },
                {
                    text: '✕',
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

export function exportJson(): void {
    const data = JSON.stringify(packData(), null, 2);
    downloadBlob(data, `dango-canvas_${getTimestamp()}.dango`, 'application/json');
    checkAndTriggerFeedback();
}

export function createShareLink(): void {
    const packed = packData();
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(packed));
    const baseUrl = window.location.origin + window.location.pathname;
    const url = baseUrl + '#' + compressed;
    navigator.clipboard.writeText(url).then(() => {
        showToast(getTexts().toast_copy_link_success);
        checkAndTriggerFeedback();
    });
}

export function createEmbedCode(): void {
    const packed = packData();
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(packed));
    const baseUrl = window.location.origin + window.location.pathname;
    const iframe = `<iframe src="${baseUrl}?embed=true#${compressed}" style="width: 100%; height: 500px; border: none; border-radius: 12px;" allow="clipboard-write"></iframe>`;
    navigator.clipboard.writeText(iframe).then(() => {
        showToast(getTexts().toast_copy_embed_success);
        checkAndTriggerFeedback();
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
