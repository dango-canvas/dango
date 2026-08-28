// modules/dock.ts
import { state, CONFIG, pushHistory } from './state.js';
import { getTexts } from './i18n.js';
import { els } from './dom.js';
import { 
    toggleGroup, toggleLink, deleteSelection, 
    colorSelection, alignSelection, cloneSelection,
    toggleLinkStrokeStyle 
} from './actions.js';
import { smartAlignSelection } from './animation.js';
import { toggleSearch } from './search.js';
import { resetViewToCenter } from './view.js';
import { isPresentationModeActive, tagSelectionStep } from './presenter.js';
import { uid, getEdgeIntersection } from './utils.js';
import { buildLinkPathData } from './links.js';
import type { CanvasNode, CanvasLink } from './types.js';

export interface DockCallbacks {
    render: () => void;
    undo: () => void;
    redo: () => void;
    handleNodeEdit?: (el: HTMLElement, force?: boolean) => void;
}

let dockCallbacks: DockCallbacks;
let currentRenderedMode: 'global' | 'single' | 'multi' | null = null;

const COLOR_SWATCH_MAP: Record<string, string> = {
    'c-white': '#ffffff',
    'c-red': '#fee2e2',
    'c-yellow': '#fef3c7',
    'c-green': '#d1fae5',
    'c-blue': '#e0e7ff',
    'c-orange': '#ffedd5',
    'c-purple': '#f3e8ff',
    'c-pink': '#fce7f3',
    'c-cyan': '#cffafe'
};

/**
 * 创建 9 色水平微条带 HTML
 */
function createColorStripHTML(): string {
    const colors = CONFIG.colors;
    return `
        <div class="dock-popover" id="popover-color-strip">
            ${colors.map((c, i) => `
                <div class="color-dot-btn" style="background:${COLOR_SWATCH_MAP[c] || '#fff'};" data-color="${c}" title="Alt+${i + 1}"></div>
            `).join('')}
        </div>
    `;
}

/**
 * 绑定改色事件
 */
function bindColorStripEvents(): void {
    const dots = document.querySelectorAll<HTMLElement>('.color-dot-btn');
    dots.forEach(dot => {
        dot.onclick = (e) => {
            e.stopPropagation();
            const color = dot.dataset.color;
            if (!color) return;
            pushHistory();
            colorSelection(color);
            dockCallbacks.render();
        };
    });
}

/**
 * 绑定对齐与分布事件
 */
function bindAlignEvents(): void {
    const alignBtns = document.querySelectorAll<HTMLElement>('.align-btn[data-align]');
    alignBtns.forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const align = btn.dataset.align as any;
            if (!align) return;
            pushHistory();
            alignSelection(align);
            dockCallbacks.render();
        };
    });

    const smartBtn = document.getElementById('btn-dock-smart-align');
    if (smartBtn) {
        smartBtn.onclick = (e) => {
            e.stopPropagation();
            pushHistory();
            smartAlignSelection();
            dockCallbacks.render();
        };
    }
}

/**
 * 绑定拖拽拉伸衍生核心交互 (Drag-to-Extrude)
 * 视觉效果与 ctrl+方向键 保持完全一致（幽灵线框 + 虚线引线 + 空文本光标闪烁）
 */
function bindExtrudeDragEvents(): void {
    const extrudeBtn = document.getElementById('btn-dock-extrude');
    if (!extrudeBtn) return;

    const startDrag = (startClientX: number, startClientY: number, isTouch = false) => {
        const selId = Array.from(state.selection)[0];
        const srcNode = state.nodes.find(n => n.id === selId);
        if (!srcNode) return;

        let isExtruding = false;
        const srcNodeW = srcNode.w || 100;
        const srcNodeH = srcNode.h || 40;

        const nodesLayer = document.getElementById('nodes-layer');
        const connectionsLayer = document.getElementById('connections-layer') || els.connectionsLayer;

        // 1. 创建与方向衍生一致的幽灵节点
        let ghostNodeEl: HTMLElement | null = null;
        if (nodesLayer) {
            ghostNodeEl = document.createElement('div');
            ghostNodeEl.className = 'node extrude-ghost-node';
            ghostNodeEl.style.display = 'none';
            nodesLayer.appendChild(ghostNodeEl);
        }

        // 2. 创建与真实连线完全一致的 SVG 曲线引线 (带箭头)
        let previewLine: SVGPathElement | null = null;
        if (connectionsLayer) {
            previewLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            previewLine.setAttribute('class', 'link extrude-preview');
            previewLine.setAttribute('fill', 'none');
            previewLine.setAttribute('marker-end', 'url(#arrowhead)');
            connectionsLayer.appendChild(previewLine);
        }

        const onMove = (clientX: number, clientY: number) => {
            const screenDist = Math.hypot(clientX - startClientX, clientY - startClientY);
            if (screenDist > 10) {
                isExtruding = true;
                // 触屏状态向上微偏移 42px 视口距离，防止手指遮挡预览
                const visualOffsetY = isTouch ? (42 / state.view.scale) : 0;
                const worldMouseX = (clientX - state.view.x) / state.view.scale;
                const worldMouseY = ((clientY - state.view.y) / state.view.scale) - visualOffsetY;

                if (ghostNodeEl) {
                    ghostNodeEl.style.display = 'block';
                    ghostNodeEl.style.left = `${worldMouseX}px`;
                    ghostNodeEl.style.top = `${worldMouseY}px`;
                }

                if (previewLine) {
                    const ghostBox = {
                        x: worldMouseX - 51,
                        y: worldMouseY - 22,
                        w: 102,
                        h: 44
                    };
                    const startPoint = getEdgeIntersection(ghostBox, srcNode);
                    const endPoint = getEdgeIntersection(srcNode, ghostBox);
                    const pathData = buildLinkPathData({ direction: 'target', strokeStyle: 'solid' } as any, startPoint, endPoint);
                    previewLine.setAttribute('d', pathData);
                }
            }
        };

        const onEnd = (clientX: number, clientY: number) => {
            if (ghostNodeEl && ghostNodeEl.parentNode) {
                ghostNodeEl.parentNode.removeChild(ghostNodeEl);
            }
            if (previewLine && previewLine.parentNode) {
                previewLine.parentNode.removeChild(previewLine);
            }

            if (isExtruding) {
                // 拖拽落子：生成空文本节点并聚焦
                const visualOffsetY = isTouch ? (42 / state.view.scale) : 0;
                const dropWorldX = (clientX - state.view.x) / state.view.scale;
                const dropWorldY = ((clientY - state.view.y) / state.view.scale) - visualOffsetY;

                pushHistory();
                const newId = uid();
                const newNode: CanvasNode = {
                    id: newId,
                    x: Math.round(dropWorldX - 51),
                    y: Math.round(dropWorldY - 22),
                    w: 102,
                    h: 44,
                    text: '',
                    color: srcNode.color || 'c-white'
                };
                const newLink: CanvasLink = {
                    id: `${srcNode.id}-${newId}`,
                    sourceId: srcNode.id,
                    targetId: newId,
                    direction: 'target',
                    strokeStyle: 'solid'
                };

                state.nodes.push(newNode);
                state.links.push(newLink);
                state.selection.clear();
                state.selection.add(newId);
                state.selectionSource = 'click';
                dockCallbacks.render();

                if (typeof document !== 'undefined') {
                    const newEl = document.querySelector<HTMLElement>(`.node[data-id="${newId}"]`);
                    if (newEl && dockCallbacks.handleNodeEdit) {
                        dockCallbacks.handleNodeEdit(newEl, true);
                    }
                }
            } else {
                // 短点：向右标准距离生成空文本节点并聚焦
                pushHistory();
                const newId = uid();
                const newNode: CanvasNode = {
                    id: newId,
                    x: Math.round(srcNode.x + (srcNode.w || 100) + 80),
                    y: Math.round(srcNode.y),
                    w: 102,
                    h: 44,
                    text: '',
                    color: srcNode.color || 'c-white'
                };
                const newLink: CanvasLink = {
                    id: `${srcNode.id}-${newId}`,
                    sourceId: srcNode.id,
                    targetId: newId,
                    direction: 'target',
                    strokeStyle: 'solid'
                };

                state.nodes.push(newNode);
                state.links.push(newLink);
                state.selection.clear();
                state.selection.add(newId);
                state.selectionSource = 'click';
                dockCallbacks.render();

                if (typeof document !== 'undefined') {
                    const newEl = document.querySelector<HTMLElement>(`.node[data-id="${newId}"]`);
                    if (newEl && dockCallbacks.handleNodeEdit) {
                        dockCallbacks.handleNodeEdit(newEl, true);
                    }
                }
            }
        };

        if (isTouch) {
            let lastTouchX = startClientX;
            let lastTouchY = startClientY;

            const onTouchMove = (te: TouchEvent) => {
                te.preventDefault();
                if (te.touches.length > 0) {
                    lastTouchX = te.touches[0].clientX;
                    lastTouchY = te.touches[0].clientY;
                    onMove(lastTouchX, lastTouchY);
                }
            };
            const cleanupTouch = () => {
                window.removeEventListener('touchmove', onTouchMove);
                window.removeEventListener('touchend', onTouchEnd);
                window.removeEventListener('touchcancel', onTouchCancel);
            };
            const onTouchEnd = (te: TouchEvent) => {
                if (te.cancelable) te.preventDefault();
                cleanupTouch();
                onEnd(lastTouchX, lastTouchY);
            };
            const onTouchCancel = () => {
                cleanupTouch();
                if (ghostNodeEl && ghostNodeEl.parentNode) {
                    ghostNodeEl.parentNode.removeChild(ghostNodeEl);
                }
                if (previewLine && previewLine.parentNode) {
                    previewLine.parentNode.removeChild(previewLine);
                }
            };

            window.addEventListener('touchmove', onTouchMove, { passive: false });
            window.addEventListener('touchend', onTouchEnd, { passive: false });
            window.addEventListener('touchcancel', onTouchCancel, { passive: false });
        } else {
            const onMouseMove = (me: MouseEvent) => {
                onMove(me.clientX, me.clientY);
            };
            const onMouseUp = (ue: MouseEvent) => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                onEnd(ue.clientX, ue.clientY);
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }
    };

    extrudeBtn.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        startDrag(e.clientX, e.clientY, false);
    });

    extrudeBtn.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length === 1) {
            e.stopPropagation();
            startDrag(e.touches[0].clientX, e.touches[0].clientY, true);
        }
    }, { passive: false });
}

/**
 * 切换悬浮控制器显隐
 */
export function toggleFloatingDock(forceVisible?: boolean): void {
    if (state.isEmbed) return;
    const container = document.getElementById('dango-dock-container');
    if (!container) return;

    const shouldHide = forceVisible !== undefined ? !forceVisible : !state.settings.hideToolbar;
    state.settings.hideToolbar = shouldHide;
    localStorage.setItem('cc-hide-toolbar', String(shouldHide));

    const checkEl = document.getElementById('check-hide-toolbar') as HTMLInputElement | null;
    if (checkEl) checkEl.checked = shouldHide;

    if (!shouldHide && !isPresentationModeActive()) {
        container.classList.remove('hidden-dock');
    } else {
        container.classList.add('hidden-dock');
    }
}

/**
 * 核心更新函数：根据当前选区状态自适应刷新 Dock 内容
 */
export function updateFloatingDock(force: boolean = false): void {
    const container = document.getElementById('dango-dock-container');
    const dockEl = document.getElementById('dango-dock');
    if (!container || !dockEl) return;

    // 嵌入模式、演示模式或禁用时隐藏
    if (state.isEmbed || isPresentationModeActive() || state.settings.hideToolbar) {
        container.classList.add('hidden-dock');
        return;
    } else {
        container.classList.remove('hidden-dock');
    }

    const count = state.selection.size;
    const targetMode: 'global' | 'single' | 'multi' = count === 0 ? 'global' : count === 1 ? 'single' : 'multi';
    const texts = getTexts();

    if (typeof document !== 'undefined' && document.body) {
        if (targetMode !== 'global') {
            document.body.classList.add('has-selection');
        } else {
            document.body.classList.remove('has-selection');
        }
    }

    if (!force && currentRenderedMode === targetMode) {
        // 同一模式下若为单选态，动态更新色盘原点颜色
        if (targetMode === 'single') {
            const selId = Array.from(state.selection)[0];
            const selNode = state.nodes.find(n => n.id === selId);
            const innerDot = document.getElementById('single-color-dot');
            if (innerDot && selNode) {
                innerDot.style.background = COLOR_SWATCH_MAP[selNode.color] || '#ffffff';
            }
        }
        return;
    }

    currentRenderedMode = targetMode;
    dockEl.innerHTML = '';

    const safeBind = (id: string, handler: () => void) => {
        const el = document.getElementById(id);
        if (el) el.onclick = handler;
    };

    if (targetMode === 'global') {
        // 1. 无选中态 (Global Mode)
        dockEl.innerHTML = `
            <div class="dock-group">
                <button class="dock-btn" id="btn-dock-undo" data-i18n-title="dock_undo" title="${texts.dock_undo || '撤销 (Ctrl+Z)'}">
                    <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                </button>
                <button class="dock-btn" id="btn-dock-redo" data-i18n-title="dock_redo" title="${texts.dock_redo || '重做 (Ctrl+Y)'}">
                    <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                </button>
            </div>
            <div class="dock-divider"></div>
            <div class="dock-group">
                <button class="dock-btn" id="btn-dock-search" data-i18n-title="dock_search" title="${texts.dock_search || '搜索节点 (Ctrl+F)'}">
                    <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </button>
                <button class="dock-btn" id="btn-dock-center" data-i18n-title="dock_center" title="${texts.dock_center || '回归中心 (Home)'}">
                    <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                </button>
                <button class="dock-btn" id="btn-dock-present" data-i18n-title="dock_present" title="${texts.dock_present || '标记演示 (T)'}">
                    <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                </button>
            </div>
        `;

        safeBind('btn-dock-undo', () => dockCallbacks.undo());
        safeBind('btn-dock-redo', () => dockCallbacks.redo());
        safeBind('btn-dock-search', () => toggleSearch());
        safeBind('btn-dock-center', () => resetViewToCenter(true));
        safeBind('btn-dock-present', () => tagSelectionStep());

    } else if (targetMode === 'single') {
        // 2. 单节点选中态 (Single Node Mode)
        const selId = Array.from(state.selection)[0];
        const selNode = state.nodes.find(n => n.id === selId);
        const currentHex = selNode ? (COLOR_SWATCH_MAP[selNode.color] || '#ffffff') : '#ffffff';

        dockEl.innerHTML = `
            <div class="dock-group">
                <div class="popover-anchor">
                    <button class="dock-btn" id="btn-dock-color-trigger" data-i18n-title="dock_color" title="${texts.dock_color || '改色 (Alt+1~9)'}">
                        <div class="swatch-icon-wrap">
                            <div class="swatch-inner-dot" id="single-color-dot" style="background:${currentHex};"></div>
                        </div>
                    </button>
                    ${createColorStripHTML()}
                </div>
                <button class="dock-btn extrude-handle" id="btn-dock-extrude" data-i18n-title="dock_extrude" title="${texts.dock_extrude || '拖拽衍生 (Ctrl+方向键)'}">
                    <svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"></path></svg>
                </button>
            </div>
            <div class="dock-divider"></div>
            <div class="dock-group">
                <button class="dock-btn" id="btn-dock-clone" data-i18n-title="dock_clone" title="${texts.dock_clone || '克隆副本 (Ctrl+Drag)'}">
                    <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <button class="dock-btn danger" id="btn-dock-delete" data-i18n-title="dock_delete" title="${texts.dock_delete || '删除节点 (Del)'}">
                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;

        bindColorStripEvents();
        bindExtrudeDragEvents();

        safeBind('btn-dock-clone', () => {
            pushHistory();
            cloneSelection();
            dockCallbacks.render();
        });

        safeBind('btn-dock-delete', () => {
            pushHistory();
            deleteSelection();
            dockCallbacks.render();
        });

    } else {
        // 3. 多选态 (Multi-Selection Mode, N >= 2)
        dockEl.innerHTML = `
            <div class="dock-group">
                <button class="dock-btn" id="btn-dock-link" data-i18n-title="dock_link" title="${texts.dock_link || '拓扑连线 (Ctrl+L)'}">
                    <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </button>
                <button class="dock-btn" id="btn-dock-style" data-i18n-title="dock_link_style" title="${texts.dock_link_style || '切换线形 (Ctrl+\')'}">
                    <svg viewBox="0 0 24 24"><path d="M2 12c4-8 8 8 12 0s8 8 8 0"></path></svg>
                </button>
            </div>
            <div class="dock-divider"></div>
            <div class="dock-group">
                <div class="popover-anchor">
                    <button class="dock-btn" id="btn-dock-align" data-i18n-title="dock_align" title="${texts.dock_align || '对齐 (Alt+WASD)'}">
                        <svg viewBox="0 0 24 24"><line x1="4" y1="3" x2="4" y2="21"></line><rect x="8" y="6" width="12" height="4" rx="1"></rect><rect x="8" y="14" width="8" height="4" rx="1"></rect></svg>
                    </button>
                    <div class="dock-popover" id="popover-align-grid">
                        <div class="align-grid">
                            <button class="align-btn" data-align="left" data-i18n-title="align_left" title="${texts.align_left || '左对齐 (Alt+A)'}"><svg viewBox="0 0 24 24"><line x1="4" y1="3" x2="4" y2="21"></line><rect x="8" y="6" width="12" height="4" rx="1"></rect><rect x="8" y="14" width="8" height="4" rx="1"></rect></svg></button>
                            <button class="align-btn" data-align="centerX" data-i18n-title="align_center_x" title="${texts.align_center_x || '水平居中 (Alt+H)'}"><svg viewBox="0 0 24 24"><line x1="12" y1="3" x2="12" y2="21"></line><rect x="5" y="6" width="14" height="4" rx="1"></rect><rect x="7" y="14" width="10" height="4" rx="1"></rect></svg></button>
                            <button class="align-btn" data-align="right" data-i18n-title="align_right" title="${texts.align_right || '右对齐 (Alt+D)'}"><svg viewBox="0 0 24 24"><line x1="20" y1="3" x2="20" y2="21"></line><rect x="4" y="6" width="12" height="4" rx="1"></rect><rect x="8" y="14" width="8" height="4" rx="1"></rect></svg></button>
                            <button class="align-btn" data-align="top" data-i18n-title="align_top" title="${texts.align_top || '顶对齐 (Alt+W)'}"><svg viewBox="0 0 24 24"><line x1="3" y1="4" x2="21" y2="4"></line><rect x="6" y="8" width="4" height="12" rx="1"></rect><rect x="14" y="8" width="4" height="8" rx="1"></rect></svg></button>
                            <button class="align-btn" data-align="centerY" data-i18n-title="align_center_y" title="${texts.align_center_y || '垂直居中 (Alt+J)'}"><svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"></line><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="7" width="4" height="10" rx="1"></rect></svg></button>
                            <button class="align-btn" data-align="bottom" data-i18n-title="align_bottom" title="${texts.align_bottom || '底对齐 (Alt+S)'}"><svg viewBox="0 0 24 24"><line x1="3" y1="20" x2="21" y2="20"></line><rect x="6" y="4" width="4" height="12" rx="1"></rect><rect x="14" y="8" width="4" height="8" rx="1"></rect></svg></button>
                        </div>
                    </div>
                </div>

                <button class="dock-btn" id="btn-dock-smart-align" data-i18n-title="dock_smart_align" title="${texts.dock_smart_align || '智能排版 (Alt+.)'}">
                    <svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"></path></svg>
                </button>

                <div class="popover-anchor">
                    <button class="dock-btn" id="btn-dock-bulk-color" data-i18n-title="dock_color" title="${texts.dock_color || '批量改色 (Alt+1~9)'}">
                        <div class="swatch-icon-wrap" style="border-style:dashed;">
                            <div class="swatch-inner-dot" style="background: linear-gradient(135deg, #fbbf24, #34d399, #818cf8);"></div>
                        </div>
                    </button>
                    ${createColorStripHTML()}
                </div>

                <button class="dock-btn" id="btn-dock-group" data-i18n-title="dock_group" title="${texts.dock_group || '编组 / 解组 (Ctrl+G)'}">
                    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                </button>
            </div>
            <div class="dock-divider"></div>
            <div class="dock-group">
                <button class="dock-btn danger" id="btn-dock-delete-multi" data-i18n-title="dock_delete_multi" title="${texts.dock_delete_multi || '批量删除 (Del)'}">
                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;

        bindColorStripEvents();
        bindAlignEvents();

        safeBind('btn-dock-link', () => {
            pushHistory();
            toggleLink();
            dockCallbacks.render();
        });

        safeBind('btn-dock-style', () => {
            pushHistory();
            if (toggleLinkStrokeStyle()) dockCallbacks.render();
        });

        safeBind('btn-dock-smart-align', () => {
            pushHistory();
            smartAlignSelection();
            dockCallbacks.render();
        });

        safeBind('btn-dock-group', () => {
            pushHistory();
            toggleGroup();
            dockCallbacks.render();
        });

        safeBind('btn-dock-delete-multi', () => {
            pushHistory();
            deleteSelection();
            dockCallbacks.render();
        });
    }
}

/**
 * 初始化悬浮快捷控制器
 */
export function initFloatingDock(callbacks: DockCallbacks): void {
    dockCallbacks = callbacks;
    updateFloatingDock();
}
