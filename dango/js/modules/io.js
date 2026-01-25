// modules/io.js
import { state, pushHistory, packData, unpackData } from './state.js';
import { getTexts } from './i18n.js';
import { showToast, applySettings } from './ui.js';
import { getTimestamp } from './utils.js';

let renderRef = null;

export function initIO(render) {
    renderRef = render;
}

export function exportJson() {
    const data = JSON.stringify({ nodes: state.nodes, groups: state.groups, links: state.links }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dango-canvas_${getTimestamp()}.dango`;
    a.click();
    URL.revokeObjectURL(url);
}

export function processDangoFile(file) {
    if (!file) return;
    if (!file.name.endsWith('.dango') && !file.name.endsWith('.json')) {
        showToast(getTexts().alert_file_err);
        return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            let oldSnapshot = null;
            if (state.nodes.length > 0) {
                oldSnapshot = { nodes: [...state.nodes], groups: [...state.groups], links: [...state.links] };
            }
            pushHistory();
            state.nodes = data.nodes || [];
            state.groups = data.groups || [];
            state.links = data.links || [];
            state.selection.clear();
            renderRef();
            showToast(getTexts().toast_import_success, oldSnapshot);
        } catch (err) {
            console.error(err);
            showToast(getTexts().alert_file_err);
        }
    };
    reader.readAsText(file);
}

export function createShareLink() {
    const packed = packData();
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(packed));
    const baseUrl = window.location.origin + window.location.pathname;
    const url = baseUrl + '#' + compressed;
    navigator.clipboard.writeText(url).then(() => {
        showToast(getTexts().toast_copy_link_success);
    });
}

export function createEmbedCode() {
    const packed = packData();
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(packed));
    const baseUrl = window.location.origin + window.location.pathname;
    const iframe = `<iframe src="${baseUrl}?embed=true#${compressed}" style="width: 100%; height: 500px; border: none; border-radius: 12px;" allow="clipboard-write"></iframe>`;
    navigator.clipboard.writeText(iframe).then(() => {
        showToast(getTexts().toast_copy_embed_success);
    });
}

export function updateOpenFullLink() {
    if (!state.isEmbed) return;
    const btn = document.getElementById('btn-open-full');
    if (!btn) return;
    const packed = packData();
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(packed));
    const baseUrl = window.location.origin + window.location.pathname;
    btn.href = baseUrl + '#' + compressed;
}

export function loadFromUrl() {
    const hash = window.location.hash.substring(1);
    if (!hash) return false;
    try {
        const decompressed = LZString.decompressFromEncodedURIComponent(hash);
        if (!decompressed) return false;
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
        if (data.settings) Object.assign(state.settings, data.settings);
        renderRef();
        applySettings(state);
        if (!state.isEmbed) {
            showToast(getTexts().toast_imported, oldSnapshot);
            window.history.replaceState(null, null, window.location.pathname);
        }
        return true;
    } catch (e) {
        console.error("Import failed:", e);
        return false;
    }
}
