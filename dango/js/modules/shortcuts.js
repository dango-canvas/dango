// modules/shortcuts.js
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

// 维护全局按键状态（供 main.js 使用，比如空格判定）
export const keys = {};

export function isModifier(e) {
    return e.ctrlKey || e.metaKey || (state.settings.altAsCtrl && e.altKey);
}

export function initShortcuts(callbacks) {
    const { render, undo, redo, handleNodeEdit, exportJson } = callbacks;

    window.addEventListener('keydown', e => {
        const isContentEditable = e.target.isContentEditable;
        const isTextArea = e.target.tagName === 'TEXTAREA';
        const isInput = e.target.tagName === 'INPUT';
        const isEditing = isContentEditable || isTextArea || isInput;
        
        // 1. 编辑状态下的特殊处理
        if (isEditing) {
            if (e.code === 'Escape') {
                e.target.blur();
                e.stopPropagation();
                return;
            }
            if (isContentEditable && e.code === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.target.blur();
                return;
            }
            return; // 编辑时屏蔽其他快捷键
        }

        keys[e.code] = true;

        // 2. 基础快捷键 (ESC / Space / Home)
        if (e.code === 'Escape') {
            clearDirectionalGhost();
            closeSearch();
            // 依次关闭：关于面板 -> 设置/帮助 -> 清除选中
            const about = document.getElementById('about-overlay'); // 假设 ID
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
                    return; // 拦截事件，避免触发后续操作
                }
            } else if (!e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                // 仅限于没有任何修饰键时进行 Nudge
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
            if (e.code === 'KeyF') { e.preventDefault(); openSearch(); return; }
            if (e.code === 'KeyS') { 
                if (!e.altKey) { // 如果按了 Alt，让它无视这个区块，自然向下走到对齐逻辑
                    e.preventDefault(); exportJson(); return; 
                }
            }
            if (e.code === 'KeyA') {
                e.preventDefault();
                state.selection = new Set([...state.nodes.map(n => n.id), ...state.groups.map(g => g.id)]);
                render();
                return;
            }
        }

        // 4. 其他操作
        if (e.code === 'Delete' || e.code === 'Backspace') {
            e.preventDefault(); pushHistory(); deleteSelection(); render(); return;
        }

        if (e.code === 'Enter' && state.selection.size === 1) {
            e.preventDefault();
            const selectedId = Array.from(state.selection)[0];
            const nodeEl = document.querySelector(`.node[data-id="${selectedId}"]`);
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
            const keyMap = { 
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

    window.addEventListener('keyup', e => {
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
