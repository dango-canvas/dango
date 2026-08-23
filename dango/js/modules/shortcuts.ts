// modules/shortcuts.ts
import { state, CONFIG, pushHistory } from './state.js';
import { 
    toggleGroup, toggleLink, deleteSelection, 
    nudgeSelection, colorSelection, alignSelection, distributeSelection,
    copySelection, pasteClipboard,
    toggleLinkStrokeStyle
} from './actions.js';
import { smartAlignSelection } from './animation.js';
import { changeZoom, resetViewToCenter } from './view.js';
import { openSearch, closeSearch } from './search.js';
import { handleDirectionalCreateStart, handleDirectionalCreateEnd, clearDirectionalGhost, handleDirectionalModifierUp } from './directional.js';
import { isHintModeActive, handleHintKeyDown, enterHintMode, exitHintMode } from './hints.js';
import { 
    isPresentationModeActive, handlePresenterKeyDown, 
    isTaggingModeActive, exitTaggingMode, 
    tagSelectionStep, enterPresentationMode 
} from './presenter.js';

// 维护全局按键状态（供 main.js 使用，比如空格判定）
export const keys: Record<string, boolean> = {};

export function isModifier(e: KeyboardEvent | MouseEvent): boolean {
    return e.ctrlKey || e.metaKey || (state.settings.altAsCtrl && e.altKey);
}

export function initShortcuts(callbacks: {
    render: () => void;
    undo: () => void;
    redo: () => void;
    handleNodeEdit: (el: HTMLElement) => void;
    exportJson: () => void;
}): void {
    const { render, undo, redo, handleNodeEdit, exportJson } = callbacks;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        const isContentEditable = target?.isContentEditable;
        const isTextArea = target?.tagName === 'TEXTAREA';
        const isInput = target?.tagName === 'INPUT';
        const isEditing = isContentEditable || isTextArea || isInput;
        
        // 1. 编辑状态下的特殊处理
        if (isEditing) {
            if (e.code === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                target?.blur();
                return;
            }
            if (isContentEditable && (e.key === 'Enter' || e.code === 'Enter') && !e.shiftKey) {
                if (e.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                e.stopPropagation();
                target?.blur();
                return;
            }
            return; // 编辑时屏蔽其他快捷键
        }

        // 演讲模式专属拦截
        if (isPresentationModeActive()) {
            if (handlePresenterKeyDown(e)) {
                return;
            }
        }

        // Hint 模式拦截
        if (isHintModeActive()) {
            if (handleHintKeyDown(e)) {
                e.preventDefault();
                return;
            }
        }

        keys[e.code] = true;

        // 2. 基础快捷键 (ESC / Space / Home)
        if (e.code === 'Escape') {
            exitHintMode();
            if (isPresentationModeActive()) {
                exitPresentationMode();
                return;
            }
            if (isTaggingModeActive()) {
                exitTaggingMode(true);
                return;
            }
            clearDirectionalGhost();
            closeSearch();
            const about = document.getElementById('about-overlay');
            if (about?.classList.contains('show')) {
                about.classList.remove('show');
                return;
            }
            if (state.selection.size > 0) {
                state.selection.clear();
                render();
            }
        }

        if (e.code === 'Space') {
            if (!isEditing) {
                e.preventDefault();
                document.body.classList.add('mode-space');
            }
        }

        if (e.code === 'Home') {
            e.preventDefault();
            resetViewToCenter(true);
        }

        // 方向键处理：快捷生成与微移
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            if (isModifier(e)) {
                if (handleDirectionalCreateStart(e.code, e)) {
                    e.preventDefault();
                    return;
                }
            } else if (!e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                pushHistory();
                nudgeSelection(e.code);
                render();
                return;
            }
        }

        // 3. 修饰键组合 (Ctrl/Cmd + ...)
        if (isModifier(e)) {
            // 缩放
            if (e.key === '=' || e.key === '+') { e.preventDefault(); changeZoom(1.2); return; }
            if (e.key === '-') { e.preventDefault(); changeZoom(0.8); return; }
            if (e.key === '0') { e.preventDefault(); resetViewToCenter(true); return; }

            // 撤销重做
            if (e.code === 'KeyZ') {
                e.preventDefault();
                e.shiftKey ? redo() : undo();
                return;
            }
            if (e.code === 'KeyY') { e.preventDefault(); redo(); return; }

            // 基础操作
            if (e.code === 'KeyG') {
                e.preventDefault(); pushHistory();
                toggleGroup();
                render(); return;
            }
            if (e.code === 'KeyL') { e.preventDefault(); pushHistory(); toggleLink(); render(); return; }
            if (e.code === 'Quote') {
                e.preventDefault();
                pushHistory();
                if (toggleLinkStrokeStyle()) render();
                return;
            }
            if (e.code === 'KeyC') { e.preventDefault(); copySelection(); return; }
            if (e.code === 'KeyV') { e.preventDefault(); pushHistory(); pasteClipboard(); render(); return; }
            if (e.code === 'KeyF' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openSearch(); return; }
            if (e.code === 'KeyS') { 
                if (!e.altKey) {
                    e.preventDefault(); exportJson(); return; 
                }
            }
            if (e.code === 'KeyA') {
                e.preventDefault();
                state.selection = new Set([...state.nodes.map(n => n.id), ...state.groups.map(g => g.id)]);
                state.selectionSource = 'box';
                render();
                return;
            }
        }

        // 4. 其他操作
        if (e.code === 'Delete' || e.code === 'Backspace') {
            e.preventDefault(); pushHistory(); deleteSelection(); render(); return;
        }

        // 快捷跳转 (f: 单选跳转; Shift + F 或 Alt + F: 连选加选)
        if (!e.ctrlKey && !e.metaKey) {
            if (e.code === 'KeyF') {
                e.preventDefault();
                enterHintMode(e.shiftKey || e.altKey);
                return;
            }
            if (e.code === 'KeyT') {
                e.preventDefault();
                tagSelectionStep();
                return;
            }
            if (e.code === 'KeyP') {
                if (isTaggingModeActive()) {
                    e.preventDefault();
                    enterPresentationMode();
                    return;
                }
            }
        }

        if (e.code === 'Enter' && state.selection.size === 1) {
            e.preventDefault();
            const selectedId = Array.from(state.selection)[0];
            const nodeEl = document.querySelector<HTMLElement>(`.node[data-id="${selectedId}"]`);
            if (nodeEl) handleNodeEdit(nodeEl);
            return;
        }

        // 颜色 (Alt + 1-9)
        if (e.altKey && !e.shiftKey && e.code.startsWith('Digit')) {
            const num = parseInt(e.key);
            if (num >= 1 && num <= CONFIG.colors.length) {
                e.preventDefault(); pushHistory();
                colorSelection(CONFIG.colors[num - 1]);
                render();
            }
        }

        // 对齐 (Alt + WASD...)
        if (e.altKey) {
            const keyMap: Record<string, 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY'> = { 
                'KeyA': 'left', 
                'ArrowLeft': 'left',
                'KeyD': 'right', 
                'ArrowRight': 'right',
                'KeyW': 'top', 
                'ArrowUp': 'top',
                'KeyS': 'bottom',
                'ArrowDown': 'bottom', 
                'KeyH': 'centerX', 
                'KeyJ': 'centerY' 
            };
            if (keyMap[e.code]) {
                e.preventDefault(); pushHistory();
                if ((e.code === 'KeyH' || e.code === 'KeyJ') && e.shiftKey) {
                    distributeSelection(e.code === 'KeyH' ? 'h' : 'v');
                } else {
                    alignSelection(keyMap[e.code]);
                }
                render();
            }
            if (e.key === '.') {
                e.preventDefault(); pushHistory(); smartAlignSelection(); render(); return;
            }
        }

        if (e.code === 'KeyQ') document.body.classList.add('spotlight-active');
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
        keys[e.code] = false;
        if (e.code === 'Space') document.body.classList.remove('mode-space');
        if (e.code === 'KeyQ') document.body.classList.remove('spotlight-active');
        
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            handleDirectionalCreateEnd(e.code, callbacks, 'arrow');
        }
        if (['ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight'].includes(e.code)) {
            handleDirectionalModifierUp(callbacks);
        }
    });
}
