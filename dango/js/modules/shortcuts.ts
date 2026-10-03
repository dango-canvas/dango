// modules/shortcuts.ts
import { state, CONFIG, pushHistory } from './state.js';
import { 
    toggleGroup, toggleLink, deleteSelection, 
    nudgeSelection, colorSelection, alignSelection, distributeSelection,
    copySelection, pasteClipboard,
    toggleLinkStrokeStyle,
    createStandaloneNode
} from './actions.js';
import { smartAlignSelection } from './animation.js';
import { changeZoom, resetViewToCenter, panViewBy, smoothZoom, smoothPan } from './view.js';
import { openSearch, closeSearch } from './search.js';
import { handleDirectionalCreateStart, handleDirectionalCreateEnd, clearDirectionalGhost, handleDirectionalModifierUp } from './directional.js';
import { isHintModeActive, handleHintKeyDown, enterHintMode, exitHintMode } from './hints.js';
import { 
    isPresentationModeActive, handlePresenterKeyDown, 
    isTaggingModeActive, exitTaggingMode, 
    tagSelectionStep, enterPresentationMode,
    clearStepsOfSelection
} from './presenter.js';
import { toggleFloatingDock } from './dock.js';
import { activateSpotlight, deactivateSpotlight } from './spotlight.js';

// 维护全局按键状态（供 main.js 使用，比如空格判定）
export const keys: Record<string, boolean> = {};

/**
 * 键盘方向键平移画布的默认单步步长（像素）与巡航速度（像素/秒）
 * 优先读取 CONFIG.keyboardPanStep / CONFIG.keyboardPanSpeed，若未配置则回退到此默认值
 */
export const KEYBOARD_PAN_STEP = 25;
export const KEYBOARD_PAN_SPEED = 600;

const activePanKeys = new Set<string>();
let panLoopRafId: number | null = null;
let panLoopLastTime = 0;

function updateKeyboardPanLoop(timestamp?: number): void {
    if (activePanKeys.size === 0) {
        if (panLoopRafId !== null && typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(panLoopRafId);
        }
        panLoopRafId = null;
        return;
    }

    const now = typeof timestamp === 'number' ? timestamp : performance.now();
    const rawDt = (now - panLoopLastTime) / 1000;
    const dt = Math.max(0.001, Math.min(rawDt, 0.05));
    panLoopLastTime = now;

    const speed = (CONFIG as any).keyboardPanSpeed ?? KEYBOARD_PAN_SPEED;
    let vx = 0;
    let vy = 0;
    if (activePanKeys.has('ArrowUp')) vy += speed;
    if (activePanKeys.has('ArrowDown')) vy -= speed;
    if (activePanKeys.has('ArrowLeft')) vx += speed;
    if (activePanKeys.has('ArrowRight')) vx -= speed;

    if (vx !== 0 || vy !== 0) {
        smoothPan(vx * dt, vy * dt, 80);
    }

    if (typeof requestAnimationFrame !== 'undefined') {
        panLoopRafId = requestAnimationFrame(updateKeyboardPanLoop);
    }
}

export function stopKeyboardPanKey(code: string): void {
    activePanKeys.delete(code);
    if (activePanKeys.size === 0 && panLoopRafId !== null) {
        if (typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(panLoopRafId);
        }
        panLoopRafId = null;
    }
}

export function stopAllKeyboardPan(): void {
    activePanKeys.clear();
    if (panLoopRafId !== null) {
        if (typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(panLoopRafId);
        }
        panLoopRafId = null;
    }
}

let isNudgeSessionActive = false;
let nudgeSessionTimer: any = null;

export function endNudgeSession(): void {
    if (nudgeSessionTimer) {
        clearTimeout(nudgeSessionTimer);
        nudgeSessionTimer = null;
    }
    isNudgeSessionActive = false;
}

export function isModifier(e: KeyboardEvent | MouseEvent): boolean {
    return e.ctrlKey || e.metaKey || (state.settings.altAsCtrl && e.altKey);
}

export function initShortcuts(callbacks: {
    render: () => void;
    undo: () => void;
    redo: () => void;
    handleNodeEdit: (el: HTMLElement, force?: boolean) => void;
    exportJson: () => void;
}): void {
    const { render, undo, redo, handleNodeEdit, exportJson } = callbacks;

    if (typeof window !== 'undefined') {
        window.addEventListener('pointerdown', () => {
            endNudgeSession();
            stopAllKeyboardPan();
        });
        window.addEventListener('blur', () => {
            endNudgeSession();
            stopAllKeyboardPan();
        });
    }

    window.addEventListener('keydown', (e: KeyboardEvent) => {
        const isNudgeKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
        if (!isNudgeKey) {
            endNudgeSession();
        }

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

        // 只读模式快捷键限制
        if (state.isReadonly) {
            const isZoom = isModifier(e) && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0');
            const isSearch = isModifier(e) && e.code === 'KeyF';
            const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code);
            const allowed = ['Escape', 'Space', 'Home', 'KeyF', 'KeyT', 'KeyP', 'Backslash', 'KeyQ'].includes(e.code) || isZoom || isSearch || isArrow;
            if (!allowed) {
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

        // 方向键处理：画布平移、快捷生成与微移
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            if (isModifier(e)) {
                if (handleDirectionalCreateStart(e.code, e)) {
                    e.preventDefault();
                    return;
                }
            } else if (!e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                const isSpacePan = Boolean(keys.Space);
                if (isSpacePan || state.selection.size === 0) {
                    e.preventDefault();
                    endNudgeSession();
                    if (!e.repeat) {
                        const PAN_STEP = (CONFIG as any).keyboardPanStep ?? KEYBOARD_PAN_STEP;
                        const panMap: Record<string, { dx: number; dy: number }> = {
                            'ArrowUp':    { dx: 0, dy: PAN_STEP },
                            'ArrowDown':  { dx: 0, dy: -PAN_STEP },
                            'ArrowLeft':  { dx: PAN_STEP, dy: 0 },
                            'ArrowRight': { dx: -PAN_STEP, dy: 0 }
                        };
                        const delta = panMap[e.code];
                        if (delta) {
                            smoothPan(delta.dx, delta.dy, 80);
                        }
                        activePanKeys.add(e.code);
                        panLoopLastTime = performance.now();
                        if (panLoopRafId === null && typeof requestAnimationFrame !== 'undefined') {
                            panLoopRafId = requestAnimationFrame(updateKeyboardPanLoop);
                        }
                    }
                    return;
                }
                if (state.selection.size > 0) {
                    e.preventDefault();
                    if (!isNudgeSessionActive) {
                        pushHistory();
                        isNudgeSessionActive = true;
                    }
                    if (nudgeSessionTimer) clearTimeout(nudgeSessionTimer);
                    nudgeSessionTimer = setTimeout(() => {
                        isNudgeSessionActive = false;
                        nudgeSessionTimer = null;
                    }, 400);
                    nudgeSelection(e.code);
                    return;
                }
            }
        }

        // 3. 修饰键组合 (Ctrl/Cmd + ...)
        if (isModifier(e)) {
            // 缩放
            if (e.key === '=' || e.key === '+') { e.preventDefault(); smoothZoom(1.2); return; }
            if (e.key === '-') { e.preventDefault(); smoothZoom(0.8); return; }
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
            e.preventDefault();
            if (isTaggingModeActive()) {
                clearStepsOfSelection();
                return;
            }
            pushHistory(); deleteSelection(); render(); return;
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
            if (e.code === 'Backslash') {
                if (state.isEmbed) return;
                e.preventDefault();
                toggleFloatingDock();
                return;
            }
        }

        if (e.code === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            if (state.selection.size === 1) {
                e.preventDefault();
                const selectedId = Array.from(state.selection)[0];
                const nodeEl = document.querySelector<HTMLElement>(`.node[data-id="${selectedId}"]`);
                if (nodeEl) handleNodeEdit(nodeEl, true);
                return;
            }
            if (state.selection.size === 0 && !state.isReadonly) {
                const about = document.getElementById('about-overlay');
                if (about?.classList.contains('show')) return;

                e.preventDefault();
                const newNode = createStandaloneNode();
                render();
                const nodeEl = document.querySelector<HTMLElement>(`.node[data-id="${newNode.id}"]`);
                if (nodeEl) handleNodeEdit(nodeEl, true);
                return;
            }
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

        if (e.code === 'KeyQ') {
            if (!e.repeat) activateSpotlight();
        }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
        keys[e.code] = false;
        if (e.code === 'Space') {
            document.body.classList.remove('mode-space');
            if (state.selection.size > 0) {
                stopAllKeyboardPan();
            }
        }
        if (e.code === 'KeyQ') deactivateSpotlight();
        
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            stopKeyboardPanKey(e.code);
            handleDirectionalCreateEnd(e.code, callbacks, 'arrow');
        }
        if (['ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight'].includes(e.code)) {
            handleDirectionalModifierUp(callbacks);
        }
    });
}
