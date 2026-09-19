// test/dock.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { state } from '../dango/js/modules/state.js';
import { initFloatingDock, updateFloatingDock, toggleFloatingDock } from '../dango/js/modules/dock.js';

class MockElement {
    tagName: string;
    id: string;
    className: string;
    innerHTML: string;
    style: Record<string, string>;
    classList: {
        contains: (c: string) => boolean;
        add: (c: string) => void;
        remove: (c: string) => void;
        toggle: (c: string, force?: boolean) => boolean;
    };
    dataset: Record<string, string>;
    onclick: any;
    checked?: boolean;
    private _listeners: Record<string, Function[]> = {};

    constructor(id: string = '', tagName: string = 'div') {
        this.id = id;
        this.tagName = tagName.toUpperCase();
        this.className = '';
        this.innerHTML = '';
        this.style = {};
        this.dataset = {};
        const classes = new Set<string>();
        this.classList = {
            contains: (c: string) => classes.has(c),
            add: (c: string) => { classes.add(c); this.className = Array.from(classes).join(' '); },
            remove: (c: string) => { classes.delete(c); this.className = Array.from(classes).join(' '); },
            toggle: (c: string, force?: boolean) => {
                const shouldAdd = force !== undefined ? force : !classes.has(c);
                if (shouldAdd) classes.add(c); else classes.delete(c);
                this.className = Array.from(classes).join(' ');
                return shouldAdd;
            }
        };
    }

    addEventListener(type: string, fn: Function) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(fn);
    }
    removeEventListener(type: string, fn: Function) {
        if (this._listeners[type]) {
            this._listeners[type] = this._listeners[type].filter(f => f !== fn);
        }
    }
    querySelector(selector: string): any {
        if (selector.startsWith('#')) {
            const targetId = selector.slice(1);
            if (this.innerHTML.includes(`id="${targetId}"`)) {
                return new MockElement(targetId);
            }
            return null;
        }
        return null;
    }
    querySelectorAll(selector: string): any[] {
        return [];
    }
}

describe('Floating Action Dock (底部悬浮快捷控制器)', () => {
    let mockElements: Record<string, MockElement>;
    let mockStorage: Record<string, string>;

    beforeEach(() => {
        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set();
        state.settings.showToolbar = true;

        mockElements = {
            'dango-dock-container': new MockElement('dango-dock-container'),
            'dango-dock': new MockElement('dango-dock'),
            'check-hide-toolbar': new MockElement('check-hide-toolbar', 'input'),
            'extrude-ghost': new MockElement('extrude-ghost'),
            'single-color-dot': new MockElement('single-color-dot')
        };
        mockElements['check-hide-toolbar'].checked = false;

        mockStorage = {};
        (globalThis as any).localStorage = {
            getItem: (k: string) => mockStorage[k] || null,
            setItem: (k: string, v: string) => { mockStorage[k] = v; },
            removeItem: (k: string) => { delete mockStorage[k]; }
        };

        const mockBody = new MockElement('body', 'body');
        (globalThis as any).document = {
            body: mockBody,
            getElementById: (id: string) => mockElements[id] || null,
            querySelectorAll: () => [],
            querySelector: () => null,
            createElement: (tag: string) => new MockElement('', tag),
            createElementNS: () => new MockElement('', 'svg')
        };
    });

    it('Initializes and renders Global Mode when selection is empty (0 nodes)', () => {
        initFloatingDock({
            render: () => {},
            undo: () => {},
            redo: () => {}
        });

        const dock = mockElements['dango-dock'];
        expect(dock.innerHTML).toContain('btn-dock-undo');
        expect(dock.innerHTML).toContain('btn-dock-redo');
        expect(dock.innerHTML).toContain('btn-dock-search');
        expect(dock.innerHTML).toContain('btn-dock-center');
        expect(dock.innerHTML).toContain('btn-dock-present');
        // 验证减法：不包含冗余的跳转键
        expect(dock.innerHTML).not.toContain('btn-dock-hint');
    });

    it('Transitions to Single-Node Mode when 1 node is selected', () => {
        state.nodes = [
            { id: 'n1', x: 100, y: 100, w: 100, h: 40, text: 'Test Node', color: 'c-yellow' }
        ];
        state.selection.add('n1');

        initFloatingDock({
            render: () => {},
            undo: () => {},
            redo: () => {}
        });

        const dock = mockElements['dango-dock'];
        expect(dock.innerHTML).toContain('btn-dock-color-trigger');
        expect(dock.innerHTML).toContain('btn-dock-extrude');
        expect(dock.innerHTML).toContain('btn-dock-clone');
        expect(dock.innerHTML).toContain('btn-dock-delete');
        // 验证减法：不包含冗余的编辑键
        expect(dock.innerHTML).not.toContain('btn-dock-edit');
    });

    it('Transitions to Single Mode and exposes Extrude when 1 Group is selected', () => {
        state.groups = [
            { id: 'g1', x: 100, y: 100, w: 200, h: 100, memberIds: [], isGroup: true }
        ];
        state.selection.add('g1');

        initFloatingDock({
            render: () => {},
            undo: () => {},
            redo: () => {}
        });

        const dock = mockElements['dango-dock'];
        expect(dock.innerHTML).toContain('btn-dock-color-trigger');
        expect(dock.innerHTML).toContain('btn-dock-extrude');
        expect(dock.innerHTML).toContain('btn-dock-clone');
        expect(dock.innerHTML).toContain('btn-dock-delete');
    });

    it('Transitions to Multi-Selection Mode when 2+ nodes are selected', () => {
        state.nodes = [
            { id: 'n1', x: 100, y: 100, w: 100, h: 40, text: 'Node 1', color: 'c-yellow' },
            { id: 'n2', x: 300, y: 100, w: 100, h: 40, text: 'Node 2', color: 'c-green' }
        ];
        state.selection.add('n1');
        state.selection.add('n2');

        initFloatingDock({
            render: () => {},
            undo: () => {},
            redo: () => {}
        });

        const dock = mockElements['dango-dock'];
        expect(dock.innerHTML).toContain('btn-dock-link');
        expect(dock.innerHTML).toContain('btn-dock-style');
        expect(dock.innerHTML).toContain('btn-dock-align');
        expect(dock.innerHTML).toContain('btn-dock-smart-align');
        expect(dock.innerHTML).toContain('btn-dock-bulk-color');
        expect(dock.innerHTML).toContain('btn-dock-group');
        expect(dock.innerHTML).toContain('btn-dock-delete-multi');
        // 验证减法：无文字标签噪音
        expect(dock.innerHTML).not.toContain('项选中');
    });

    it('Toggles floating dock visibility and persists to localStorage', () => {
        initFloatingDock({
            render: () => {},
            undo: () => {},
            redo: () => {}
        });

        const container = mockElements['dango-dock-container'];
        expect(container.classList.contains('hidden-dock')).toBe(false);

        // 切换隐藏 (forceVisible = false -> shouldHide = true)
        toggleFloatingDock(false);
        expect(state.settings.hideToolbar).toBe(true);
        expect(localStorage.getItem('cc-hide-toolbar')).toBe('true');
        expect(container.classList.contains('hidden-dock')).toBe(true);

        // 切换显示 (forceVisible = true -> shouldHide = false)
        toggleFloatingDock(true);
        expect(state.settings.hideToolbar).toBe(false);
        expect(localStorage.getItem('cc-hide-toolbar')).toBe('false');
        expect(container.classList.contains('hidden-dock')).toBe(false);
    });

    it('Restores floating dock from hidden state and populates buttons immediately without white bubble', () => {
        state.settings.hideToolbar = true;
        const container = mockElements['dango-dock-container'];
        const dock = mockElements['dango-dock'];
        dock.innerHTML = '';

        initFloatingDock({
            render: () => {},
            undo: () => {},
            redo: () => {}
        });
        expect(container.classList.contains('hidden-dock')).toBe(true);
        expect(dock.innerHTML).toBe('');

        // 快捷键恢复显示
        toggleFloatingDock(true);
        expect(container.classList.contains('hidden-dock')).toBe(false);
        expect(dock.innerHTML.length).toBeGreaterThan(0);
    });

    it('Hides floating dock in Embed mode and ignores toggle', () => {
        state.isEmbed = true;
        const container = mockElements['dango-dock-container'];

        updateFloatingDock();
        expect(container.classList.contains('hidden-dock')).toBe(true);

        toggleFloatingDock(true);
        expect(container.classList.contains('hidden-dock')).toBe(true);
        state.isEmbed = false;
    });

    it('Clones selected nodes with cloneSelection', () => {
        const { cloneSelection } = require('../dango/js/modules/actions.js');
        state.nodes = [
            { id: 'n1', x: 100, y: 100, w: 100, h: 40, text: 'Original Node', color: 'c-blue' }
        ];
        state.selection.add('n1');

        cloneSelection({ x: 30, y: 30 });
        expect(state.nodes.length).toBe(2);
        const clonedNode = state.nodes.find(n => n.id !== 'n1');
        expect(clonedNode).not.toBeUndefined();
        expect(clonedNode?.text).toBe('Original Node');
        expect(clonedNode?.x).toBe(130);
        expect(clonedNode?.y).toBe(130);
        expect(clonedNode?.color).toBe('c-blue');
        expect(state.selection.has(clonedNode!.id)).toBe(true);
    });

    it('Groups un-grouped nodes and ungroups already grouped nodes', () => {
        const { toggleGroup } = require('../dango/js/modules/actions.js');
        const { initRender } = require('../dango/js/modules/render.js');
        initRender(state, {});

        state.nodes = [
            { id: 'n1', x: 100, y: 100, w: 100, h: 40, text: 'N1', color: 'c-white' },
            { id: 'n2', x: 250, y: 100, w: 100, h: 40, text: 'N2', color: 'c-white' }
        ];
        state.selection.add('n1');
        state.selection.add('n2');

        // 1. First toggle: should create group
        toggleGroup();
        expect(state.groups.length).toBe(1);
        expect(state.groups[0].memberIds).toEqual(['n1', 'n2']);

        // 2. Second toggle with member nodes selected: should dissolve group
        state.selection.clear();
        state.selection.add('n1');
        state.selection.add('n2');
        toggleGroup();
        expect(state.groups.length).toBe(0);
    });

    it('toggleFloatingDock toggles state.settings.hideToolbar and persists to localStorage', () => {
        const { toggleFloatingDock } = require('../dango/js/modules/dock.js');
        state.settings.hideToolbar = false;
        toggleFloatingDock();
        expect(state.settings.hideToolbar).toBe(true);
        expect(mockStorage['cc-hide-toolbar']).toBe('true');

        toggleFloatingDock();
        expect(state.settings.hideToolbar).toBe(false);
        expect(mockStorage['cc-hide-toolbar']).toBe('false');
    });

    it('Settings modal no longer contains hideToolbar checkbox, and Help modal contains page 4 with Backslash shortcut', () => {
        const { readFileSync } = require('fs');
        const { resolve } = require('path');
        const html = readFileSync(resolve(__dirname, '../dango/index.html'), 'utf-8');

        // 1. settings modal does not have check-hide-toolbar or settings-hide-toolbar-item
        expect(html).not.toContain('id="check-hide-toolbar"');
        expect(html).not.toContain('id="settings-hide-toolbar-item"');

        // 2. help pages contain 4 pages and 4 dots
        const pageMatches = html.match(/data-help-page="\d+"/g) || [];
        expect(pageMatches.length).toBe(4);

        const dotMatches = html.match(/class="help-page-dot/g) || [];
        expect(dotMatches.length).toBe(4);

        // 3. page 1 contains Backslash toggle shortcut
        expect(html).toContain('data-i18n="help_toggle_dock"');
        expect(html).toContain('<span class="help-keys">\\</span>');

        // 4. exactly 28 help-rows in total (7 per page)
        const helpRows = html.match(/class="help-row"/g) || [];
        expect(helpRows.length).toBe(28);

        // 5. contains newly added shortcuts
        expect(html).toContain('data-i18n="help_align_center"');
        expect(html).toContain('data-i18n="help_multiline"');
        expect(html).toContain('data-i18n="help_global_view"');
        expect(html).toContain('<span class="help-keys">Mid DblClick + Drag</span>');
        expect(html).toContain('data-i18n="help_select_all_cancel"');
        expect(html).toContain('<span class="help-keys">Ctrl + A / Esc</span>');

        // 6. i18n covers all new keys in both languages
        const { getTexts, toggleLang, getCurrentLang } = require('../dango/js/modules/i18n.js');
        if (getCurrentLang() !== 'zh') toggleLang();
        const zh = getTexts();
        expect(zh.help_toggle_dock).toBe('显示 / 隐藏悬浮栏');
        expect(zh.help_select_all_cancel).toBe('全选 / 取消选择');
        expect(zh.help_zoom_canvas).toBe('画布缩放 / 重置');
        expect(zh.help_edit_node).toBe('编辑选中节点');
        expect(zh.help_align_center).toBe('居中对齐');
        expect(zh.help_multiline).toBe('卡片内换行');
        expect(zh.help_global_view).toBe('全景巡视 / 聚焦');

        toggleLang(); // switch to en
        const en = getTexts();
        expect(en.help_toggle_dock).toBe('Show / Hide Dock');
        expect(en.help_select_all_cancel).toBe('Select All / Deselect');
        expect(en.help_zoom_canvas).toBe('Zoom / Reset View');
        expect(en.help_edit_node).toBe('Edit Selected Node');
        expect(en.help_align_center).toBe('Center Align');
        expect(en.help_multiline).toBe('Line Break in Card');
        expect(en.help_global_view).toBe('Overview & Focus');
        toggleLang(); // restore to zh

        // 7. canvas css: view-animating excludes node-comment
        const canvasCss = readFileSync(resolve(__dirname, '../dango/css/partials/_canvas.css'), 'utf-8');
        expect(canvasCss).toContain('body.view-animating .node:not(.node-comment)');
    });
});
