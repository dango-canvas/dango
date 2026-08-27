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

    it('Hides hideToolbar setting until unlocked via Star or existing setting', () => {
        const { isToolbarUnlocked } = require('../dango/js/modules/ui.js');
        delete mockStorage['cc-bg-unlocked'];
        state.settings.hideToolbar = false;
        expect(isToolbarUnlocked(state)).toBe(false);

        // When user has clicked star
        mockStorage['cc-bg-unlocked'] = 'true';
        expect(isToolbarUnlocked(state)).toBe(true);

        // When user already has hideToolbar enabled in canvas file / settings
        delete mockStorage['cc-bg-unlocked'];
        state.settings.hideToolbar = true;
        expect(isToolbarUnlocked(state)).toBe(true);
    });
});
