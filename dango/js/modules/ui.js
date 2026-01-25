// modules/ui.js

import { getTexts, toggleLang, updateI18n } from './i18n.js';
import { downloadBlob, getTimestamp } from './utils.js';
import { processDangoFile } from './io.js';
import { els } from './dom.js';

// --- 模块内部变量 ---
let appState; // 用于访问 state.settings 等
let callbacks; // 用于执行 main.js 中的动作，如 undo

const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
const ICON_AUTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"></rect><line x1="8" y1="20" x2="16" y2="20"></line><line x1="12" y1="16" x2="12" y2="20"></line></svg>';
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

// --- 主题切换 ---
function updateTheme(themeBtn) {
    const isAuto = appState.theme === 'auto';
    const isDark = isAuto ? prefersDark.matches : appState.theme === 'dark';
    if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    themeBtn.innerHTML = isAuto ? ICON_AUTO : (isDark ? ICON_SUN : ICON_MOON);
    localStorage.setItem('cc-theme', appState.theme);
}

// --- 关于弹窗 ---
function closeAbout(aboutOverlay) {
    aboutOverlay.classList.remove('show');
}

// --- 设置 ---
export function applySettings(currentState) {
    // 如果没有传入 currentState，就使用模块内部的 appState（用于 initUI 后的常规调用）
    const s = currentState || appState; 
    if (!s) return; // 如果都没有，直接返回，防止错误

    document.getElementById('check-hide-grid').checked = s.settings.hideGrid;
    document.getElementById('check-alt-as-ctrl').checked = s.settings.altAsCtrl;
    document.getElementById('check-hand-drawn').checked = s.settings.handDrawn;
    document.body.classList.toggle('hide-grid', s.settings.hideGrid);
}

// --- 手写风格 ---
function loadHandDrawnFonts() {
    if (document.getElementById('hand-drawn-fonts')) return;
    const link = document.createElement('link');
    link.id = 'hand-drawn-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Architects+Daughter&family=LXGW+WenKai+Mono+TC&display=block';
    document.head.appendChild(link);
}

export function applyHandDrawnStyle() {
    if (!appState) return;
    if (appState.settings.handDrawn) {
        loadHandDrawnFonts();
        document.body.classList.add('hand-drawn-style');
    } else {
        document.body.classList.remove('hand-drawn-style');
    }
}

// --- 节日 Logo ---
function updateSeasonalLogo() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const logoBox = document.getElementById('ui-logo-box');
    let emoji = "✨";
    if ((month === 2 && date >= 16) || (month === 2 && date <= 23)) emoji = "🧧";
    else if (month === 2 && date === 14) emoji = "💖";
    else if (month === 10 && date >= 25) emoji = "🎃";
    else if (month === 12 && date >= 20 && date <= 31) emoji = "🎄";
    else if ((month === 1 && date <= 3)) emoji = "🎉";
    logoBox.innerText = emoji;
}

// --- Toast 通知 ---
export function showToast(message, safetySnapshot = null) {
    const texts = getTexts();
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    const textNode = document.createElement('span');
    textNode.innerText = message;
    toast.appendChild(textNode);

    if (safetySnapshot) {
        const actions = document.createElement('div');
        actions.className = 'toast-actions';
        const btnUndo = document.createElement('button');
        btnUndo.className = 'btn-toast';
        btnUndo.innerText = texts.toast_undo;
        btnUndo.onclick = () => { callbacks.undo(); toast.remove(); };
        const btnExport = document.createElement('button');
        btnExport.className = 'btn-toast';
        btnExport.innerText = texts.toast_export_prev;
        btnExport.onclick = () => {
            const data = JSON.stringify(safetySnapshot, null, 2);
            downloadBlob(data, `safety-backup_${getTimestamp()}.dango`, 'application/json');
            toast.remove();
        };
        actions.appendChild(btnUndo);
        actions.appendChild(btnExport);
        toast.appendChild(actions);
    }
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    const delay = safetySnapshot ? 6000 : 3000;
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }
    }, delay);
}


// --- 统一初始化函数 ---
export function initUI(_state, _callbacks) {
    appState = _state;
    callbacks = _callbacks;

    // 1. 关于弹窗
    const aboutOverlay = document.getElementById('about-overlay');
    const btnTriggerAbout = document.getElementById('trigger-about');
    const btnCloseAbout = document.getElementById('btn-close-about');
    btnTriggerAbout.onclick = (e) => {
        e.stopPropagation();
        els.helpModal.classList.remove('show');
        els.btnHelp.classList.remove('active');
        btnTriggerAbout.blur();
        aboutOverlay.classList.add('show');
    };
    btnCloseAbout.onclick = () => closeAbout(aboutOverlay);
    aboutOverlay.onclick = (e) => { if (e.target === aboutOverlay) closeAbout(aboutOverlay); };
    
    // ✨ 新增 ESC 关闭弹窗逻辑 ✨
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
            const modalSettings = document.getElementById('settings-modal');
            const btnSettings = document.getElementById('btn-settings');
            if (aboutOverlay.classList.contains('show')) {
                closeAbout(aboutOverlay);
                // 阻止事件冒泡，避免 main.js 里的 ESC 监听器也触发（清空选择）
                e.stopPropagation(); 
            } else if (els.helpModal.classList.contains('show') || modalSettings.classList.contains('show')) {
                els.helpModal.classList.remove('show');
                els.btnHelp.classList.remove('active');
                modalSettings.classList.remove('show');
                btnSettings.classList.remove('active');
                e.stopPropagation();
            }
        }
    });
    // 2. 主题切换
    const themeBtn = document.getElementById('btn-theme');
    appState.theme = localStorage.getItem('cc-theme') || 'light';
    updateTheme(themeBtn);
    themeBtn.onclick = (e) => {
        const themes = ['light', 'dark', 'auto'];
        const nextIndex = (themes.indexOf(appState.theme) + 1) % themes.length;
        appState.theme = themes[nextIndex];
        updateTheme(themeBtn);
        e.currentTarget.blur();
    };
    prefersDark.addEventListener('change', () => {
        if (appState.theme === 'auto') updateTheme(themeBtn);
    });

    // 2.5 添加按钮
    const btnAdd = document.getElementById('btn-add');
    if (btnAdd && callbacks.createNodesFromInput) {
        btnAdd.onclick = (e) => {
            e.stopPropagation();
            callbacks.createNodesFromInput();
        };
    }
    if (els.input && callbacks.createNodesFromInput) {
        els.input.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                callbacks.createNodesFromInput();
            }
        });
    }

    // 3. 设置面板
    const btnSettings = document.getElementById('btn-settings');
    const modalSettings = document.getElementById('settings-modal');
    btnSettings.onclick = (e) => {
        e.stopPropagation();
        const isShowing = modalSettings.classList.toggle('show');
        btnSettings.classList.toggle('active', isShowing);
        if (isShowing) {
            els.helpModal.classList.remove('show');
            els.btnHelp.classList.remove('active');
        }
    };
    document.getElementById('check-hide-grid').onchange = (e) => { appState.settings.hideGrid = e.target.checked; localStorage.setItem('cc-hide-grid', e.target.checked); document.body.classList.toggle('hide-grid', e.target.checked); };
    document.getElementById('check-alt-as-ctrl').onchange = (e) => { appState.settings.altAsCtrl = e.target.checked; localStorage.setItem('cc-alt-as-ctrl', e.target.checked); };
    
    const checkHandDrawn = document.getElementById('check-hand-drawn');
    checkHandDrawn.onchange = (e) => {
        appState.settings.handDrawn = e.target.checked;
        localStorage.setItem('cc-hand-drawn', e.target.checked);
        // 调用 main.js 中的 applyHandDrawnStyle 来应用样式
        callbacks.applyHandDrawnStyle(); 
    };
    // 4. 帮助面板
    els.btnHelp.onclick = (e) => {
        e.stopPropagation();
        const isShowing = els.helpModal.classList.toggle('show');
        els.btnHelp.classList.toggle('active', isShowing);
        if (isShowing) {
            modalSettings.classList.remove('show');
            btnSettings.classList.remove('active');
        }
    };

    // 5. 点击外部关闭弹窗
    window.addEventListener('click', (e) => {
        if (!btnSettings.contains(e.target) && !modalSettings.contains(e.target)) {
            modalSettings.classList.remove('show');
            btnSettings.classList.remove('active');
        }
        if (!els.btnHelp.contains(e.target) && !els.helpModal.contains(e.target)) {
            els.helpModal.classList.remove('show');
            els.btnHelp.classList.remove('active');
        }
    });

    // 6. 节日 Logo
    updateSeasonalLogo();

    // 7. 清空按钮
    let clearConfirm = false;
    const btnClear = document.getElementById('btn-clear');
    btnClear.onclick = () => {
        const texts = getTexts();
        if (!clearConfirm) {
            clearConfirm = true;
            btnClear.innerText = texts['confirm_clear'];
            btnClear.classList.add('btn-danger');
            setTimeout(() => {
                if (clearConfirm) {
                    clearConfirm = false;
                    btnClear.innerText = "🗑️";
                    btnClear.classList.remove('btn-danger');
                }
            }, 3000);
        } else {
            callbacks.clearCanvas();
            clearConfirm = false;
            btnClear.innerText = "🗑️";
            btnClear.classList.remove('btn-danger');
        }
    };
    
    // 8. 嵌入模式UI
    if (appState.isEmbed) {
        document.body.setAttribute('data-mode', 'embed');
        const btnInfo = document.getElementById('btn-info-embed');
        const infoCard = document.getElementById('embed-info-card');
        btnInfo.onclick = (e) => {
            e.stopPropagation();
            const isVisible = infoCard.style.opacity === "1";
            infoCard.style.opacity = isVisible ? "0" : "1";
            infoCard.style.pointerEvents = isVisible ? "none" : "auto";
            infoCard.style.transform = isVisible ? "translateY(10px) scale(0.95)" : "translateY(0) scale(1)";
        };
        window.addEventListener('click', () => {
            infoCard.style.opacity = "0";
            infoCard.style.pointerEvents = "none";
            infoCard.style.transform = "translateY(10px) scale(0.95)";
        });
    }

    // 9. 导出/导入按钮
    const actionStack = document.getElementById('action-stack');
    const btnExportMain = document.getElementById('btn-export-main');
    let exportResetTimer = null;
    const resetActionStack = () => { actionStack.classList.remove('is-exporting'); clearTimeout(exportResetTimer); };
    btnExportMain.onclick = (e) => { e.stopPropagation(); actionStack.classList.add('is-exporting'); exportResetTimer = setTimeout(resetActionStack, 5000); };
    document.getElementById('opt-json').onclick = (e) => { e.stopPropagation(); callbacks.exportJson(); resetActionStack(); };
    document.getElementById('opt-link').onclick = (e) => { e.stopPropagation(); callbacks.createShareLink(); resetActionStack(); };
    document.getElementById('opt-embed').onclick = (e) => { e.stopPropagation(); callbacks.createEmbedCode(); resetActionStack(); };
    window.addEventListener('click', () => { if (actionStack.classList.contains('is-exporting')) resetActionStack(); });
    document.getElementById('btn-import-main').onclick = () => { document.getElementById('file-input').click(); };

    // 10. 语言切换
    document.getElementById('btn-lang').onclick = (e) => {
        toggleLang();
        updateI18n();
        e.currentTarget.blur();
    };

    // 11. 文件导入
    document.getElementById('file-input').onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            processDangoFile(e.target.files[0]);
        }
        e.target.value = ''; 
    };
}
