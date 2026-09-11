// test/mobile_modal.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { initUI } from '../dango/js/modules/ui.js';
import { state } from '../dango/js/modules/state.js';

class MockDOMElement {
    id: string;
    tagName: string;
    classList: {
        contains: (c: string) => boolean;
        add: (c: string) => void;
        remove: (c: string) => void;
        toggle: (c: string, force?: boolean) => boolean;
    };
    children: MockDOMElement[] = [];
    parentElement: MockDOMElement | null = null;
    dataset: Record<string, string> = {};
    listeners: Record<string, Function[]> = {};
    style: Record<string, string> = {};
    onclick: any = null;
    onchange: any = null;
    onkeydown: any = null;
    scrollHeight: number = 200;

    constructor(id: string = '', tagName: string = 'div') {
        this.id = id;
        this.tagName = tagName.toUpperCase();
        const classes = new Set<string>();
        this.classList = {
            contains: (c: string) => classes.has(c),
            add: (c: string) => classes.add(c),
            remove: (c: string) => classes.delete(c),
            toggle: (c: string, force?: boolean) => {
                const shouldAdd = force !== undefined ? force : !classes.has(c);
                if (shouldAdd) classes.add(c); else classes.delete(c);
                return shouldAdd;
            }
        };
    }

    contains(other: any): boolean {
        if (!other) return false;
        if (other === this) return true;
        let curr = other.parentElement;
        while (curr) {
            if (curr === this) return true;
            curr = curr.parentElement;
        }
        return false;
    }

    addEventListener(type: string, fn: Function, _opts?: any) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(fn);
    }

    removeEventListener(type: string, fn: Function) {
        if (this.listeners[type]) {
            this.listeners[type] = this.listeners[type].filter(f => f !== fn);
        }
    }

    dispatchEvent(event: any): boolean {
        const list = this.listeners[event.type] || [];
        list.forEach(fn => fn(event));
        return true;
    }

    querySelectorAll<T = MockDOMElement>(selector: string): T[] {
        const res: MockDOMElement[] = [];
        const match = (el: MockDOMElement) => {
            if (selector.startsWith('.') && el.classList.contains(selector.slice(1))) {
                res.push(el);
            }
            el.children.forEach(match);
        };
        this.children.forEach(match);
        return res as unknown as T[];
    }

    querySelector(selector: string): any {
        const all = this.querySelectorAll(selector);
        return all.length > 0 ? all[0] : null;
    }

    blur() {}
}

describe('Mobile Modal Touch Swipe & Blank Canvas Outside Dismiss', () => {
    let elements: Record<string, MockDOMElement>;
    let windowListeners: Record<string, Function[]>;
    const origDocument = (globalThis as any).document;
    const origWindow = (globalThis as any).window;
    const origLocalStorage = (globalThis as any).localStorage;

    beforeEach(() => {
        windowListeners = {};
        elements = {
            'about-overlay': new MockDOMElement('about-overlay'),
            'btn-settings': new MockDOMElement('btn-settings', 'button'),
            'settings-modal': new MockDOMElement('settings-modal'),
            'trigger-about': new MockDOMElement('trigger-about', 'button'),
            'btn-close-about': new MockDOMElement('btn-close-about', 'button'),
            'btn-theme': new MockDOMElement('btn-theme', 'button'),
            'btn-open-full': new MockDOMElement('btn-open-full', 'a'),
            'btn-add': new MockDOMElement('btn-add', 'button'),
            'input-text': new MockDOMElement('input-text', 'input'),
            'btn-help': new MockDOMElement('btn-help', 'button'),
            'help-modal': new MockDOMElement('help-modal'),
            'ui-layer': new MockDOMElement('ui-layer'),
            'check-hide-grid': new MockDOMElement('check-hide-grid', 'input'),
            'check-alt-as-ctrl': new MockDOMElement('check-alt-as-ctrl', 'input'),
            'check-hand-drawn': new MockDOMElement('check-hand-drawn', 'input'),
            'input-bg-url': new MockDOMElement('input-bg-url', 'input'),
            'btn-clear': new MockDOMElement('btn-clear', 'button'),
            'canvas-container': new MockDOMElement('canvas-container'),
            'world': new MockDOMElement('world')
        };

        // Wire parent-child relationships for canvas
        elements['world'].parentElement = elements['canvas-container'];
        elements['canvas-container'].children.push(elements['world']);

        // Setup help-modal pages and pager dots
        const helpPagesContainer = new MockDOMElement('help-pages-container');
        helpPagesContainer.classList.add('help-pages');
        helpPagesContainer.parentElement = elements['help-modal'];
        elements['help-modal'].children.push(helpPagesContainer);

        for (let i = 0; i < 4; i++) {
            const page = new MockDOMElement(`help-page-${i}`);
            page.classList.add('help-page');
            if (i === 0) page.classList.add('active');
            page.dataset['helpPage'] = String(i);
            page.parentElement = helpPagesContainer;
            helpPagesContainer.children.push(page);
        }

        const helpPager = new MockDOMElement('help-pager');
        helpPager.classList.add('help-pager');
        helpPager.parentElement = elements['help-modal'];
        elements['help-modal'].children.push(helpPager);

        for (let i = 0; i < 4; i++) {
            const dot = new MockDOMElement(`help-dot-${i}`, 'button');
            dot.classList.add('help-page-dot');
            if (i === 0) dot.classList.add('active');
            dot.dataset['helpPageTarget'] = String(i);
            dot.parentElement = helpPager;
            helpPager.children.push(dot);
        }

        (globalThis as any).document = {
            getElementById: (id: string) => elements[id] || null,
            querySelector: () => null,
            querySelectorAll: () => [],
            body: {
                classList: {
                    add: () => {},
                    remove: () => {},
                    contains: () => false,
                    toggle: () => false
                }
            },
            documentElement: {
                setAttribute: () => {},
                removeAttribute: () => {}
            },
            addEventListener: () => {},
            removeEventListener: () => {}
        };

        (globalThis as any).window = {
            innerWidth: 390,
            innerHeight: 844,
            addEventListener: (type: string, fn: Function) => {
                if (!windowListeners[type]) windowListeners[type] = [];
                windowListeners[type].push(fn);
            },
            removeEventListener: (type: string, fn: Function) => {
                if (windowListeners[type]) {
                    windowListeners[type] = windowListeners[type].filter(f => f !== fn);
                }
            },
            dispatchEvent: (e: any) => {
                const list = windowListeners[e.type] || [];
                list.forEach(fn => fn(e));
            }
        };

        (globalThis as any).localStorage = {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {}
        };

        state.settings = {
            hideGrid: false,
            altAsCtrl: false,
            handDrawn: false,
            bgUrl: ''
        };

        initUI(state, {
            undo: () => {},
            redo: () => {},
            createNodesFromInput: () => {},
            clearCanvas: () => {},
            applyHandDrawnStyle: () => {},
            render: () => {}
        });
    });

    afterEach(() => {
        (globalThis as any).document = origDocument;
        (globalThis as any).window = origWindow;
        (globalThis as any).localStorage = origLocalStorage;
    });

    it('handles mobile touch swipe left on Help Modal to advance pages', () => {
        const helpModal = elements['help-modal'];
        helpModal.classList.add('show');

        const pages = helpModal.querySelectorAll('.help-page') as unknown as MockDOMElement[];
        expect(pages[0].classList.contains('active')).toBe(true);
        expect(pages[1].classList.contains('active')).toBe(false);

        // Swipe Left: touchstart at x: 200, touchend at x: 120 (dx = -80px)
        const touchStartTime = 1000;
        const origDateNow = Date.now;
        Date.now = () => touchStartTime;

        helpModal.dispatchEvent({
            type: 'touchstart',
            touches: [{ clientX: 200, clientY: 100 }]
        });

        Date.now = () => touchStartTime + 150; // fast flick (150ms)
        helpModal.dispatchEvent({
            type: 'touchend',
            changedTouches: [{ clientX: 120, clientY: 105 }] // dx = -80, dy = 5
        });

        Date.now = origDateNow;

        // Page 1 should now be active
        expect(pages[0].classList.contains('active')).toBe(false);
        expect(pages[1].classList.contains('active')).toBe(true);

        // Swipe Left again -> should advance to page 2
        Date.now = () => 2000;
        helpModal.dispatchEvent({
            type: 'touchstart',
            touches: [{ clientX: 200, clientY: 100 }]
        });
        Date.now = () => 2180;
        helpModal.dispatchEvent({
            type: 'touchend',
            changedTouches: [{ clientX: 140, clientY: 98 }] // dx = -60, dy = -2
        });
        Date.now = origDateNow;

        expect(pages[1].classList.contains('active')).toBe(false);
        expect(pages[2].classList.contains('active')).toBe(true);
    });

    it('handles mobile touch swipe right on Help Modal to return to previous page', () => {
        const helpModal = elements['help-modal'];
        helpModal.classList.add('show');

        const pages = helpModal.querySelectorAll('.help-page') as unknown as MockDOMElement[];
        const dots = helpModal.querySelectorAll('.help-page-dot') as unknown as MockDOMElement[];

        // Start from page 2 via dot click
        dots[2].onclick({ stopPropagation: () => {} });
        expect(pages[2].classList.contains('active')).toBe(true);

        // Swipe Right: touchstart at x: 100, touchend at x: 170 (dx = +70px)
        const touchStartTime = 3000;
        const origDateNow = Date.now;
        Date.now = () => touchStartTime;

        helpModal.dispatchEvent({
            type: 'touchstart',
            touches: [{ clientX: 100, clientY: 100 }]
        });

        Date.now = () => touchStartTime + 200;
        helpModal.dispatchEvent({
            type: 'touchend',
            changedTouches: [{ clientX: 170, clientY: 102 }] // dx = +70
        });

        Date.now = origDateNow;

        // Page 1 should now be active
        expect(pages[2].classList.contains('active')).toBe(false);
        expect(pages[1].classList.contains('active')).toBe(true);
    });

    it('clamps swipe page boundaries cleanly (cannot swipe before 0 or past 3)', () => {
        const helpModal = elements['help-modal'];
        helpModal.classList.add('show');
        const pages = helpModal.querySelectorAll('.help-page') as unknown as MockDOMElement[];

        // On Page 0, swipe right (dx = +60) -> should stay at Page 0
        const origDateNow = Date.now;
        Date.now = () => 1000;
        helpModal.dispatchEvent({
            type: 'touchstart',
            touches: [{ clientX: 100, clientY: 100 }]
        });
        Date.now = () => 1150;
        helpModal.dispatchEvent({
            type: 'touchend',
            changedTouches: [{ clientX: 160, clientY: 100 }]
        });

        expect(pages[0].classList.contains('active')).toBe(true);

        // Jump to Page 3
        const dots = helpModal.querySelectorAll('.help-page-dot') as unknown as MockDOMElement[];
        dots[3].onclick({ stopPropagation: () => {} });
        expect(pages[3].classList.contains('active')).toBe(true);

        // On Page 3, swipe left (dx = -60) -> should stay at Page 3
        Date.now = () => 2000;
        helpModal.dispatchEvent({
            type: 'touchstart',
            touches: [{ clientX: 200, clientY: 100 }]
        });
        Date.now = () => 2150;
        helpModal.dispatchEvent({
            type: 'touchend',
            changedTouches: [{ clientX: 140, clientY: 100 }]
        });
        Date.now = origDateNow;

        expect(pages[3].classList.contains('active')).toBe(true);
    });

    it('ignores predominantly vertical touch gestures on Help Modal', () => {
        const helpModal = elements['help-modal'];
        helpModal.classList.add('show');
        const pages = helpModal.querySelectorAll('.help-page') as unknown as MockDOMElement[];

        // Start on page 0, swipe vertically (dy = 80, dx = 10)
        const origDateNow = Date.now;
        Date.now = () => 1000;
        helpModal.dispatchEvent({
            type: 'touchstart',
            touches: [{ clientX: 150, clientY: 100 }]
        });
        Date.now = () => 1200;
        helpModal.dispatchEvent({
            type: 'touchend',
            changedTouches: [{ clientX: 160, clientY: 180 }]
        });
        Date.now = origDateNow;

        // Page should remain at page 0
        expect(pages[0].classList.contains('active')).toBe(true);
    });

    it('dismisses Settings Modal when clicking or tapping on blank canvas element', () => {
        const btnSettings = elements['btn-settings'];
        const modalSettings = elements['settings-modal'];
        const uiLayer = elements['ui-layer'];
        const canvasContainer = elements['canvas-container'];

        // Open Settings Modal
        btnSettings.onclick({ stopPropagation: () => {} });
        expect(modalSettings.classList.contains('show')).toBe(true);
        expect(btnSettings.classList.contains('active')).toBe(true);
        expect(uiLayer.classList.contains('mobile-active')).toBe(true);

        // Dispatch mobile touch / pointerdown on blank canvas container
        const outsideEvent = {
            type: 'pointerdown',
            target: canvasContainer
        };
        (globalThis as any).window.dispatchEvent(outsideEvent);

        // Both modal and header button active state must be dismissed
        expect(modalSettings.classList.contains('show')).toBe(false);
        expect(btnSettings.classList.contains('active')).toBe(false);
        expect(uiLayer.classList.contains('mobile-active')).toBe(false);
    });

    it('dismisses Help Modal when touching blank canvas element via touchstart', () => {
        const btnHelp = elements['btn-help'];
        const modalHelp = elements['help-modal'];
        const uiLayer = elements['ui-layer'];
        const canvasWorld = elements['world'];

        // Open Help Modal
        btnHelp.onclick({ stopPropagation: () => {} });
        expect(modalHelp.classList.contains('show')).toBe(true);
        expect(btnHelp.classList.contains('active')).toBe(true);
        expect(uiLayer.classList.contains('mobile-active')).toBe(true);

        // User taps canvas world layer on mobile (touchstart)
        const touchEvent = {
            type: 'touchstart',
            target: canvasWorld
        };
        (globalThis as any).window.dispatchEvent(touchEvent);

        // Help modal and active state must be dismissed
        expect(modalHelp.classList.contains('show')).toBe(false);
        expect(btnHelp.classList.contains('active')).toBe(false);
        expect(uiLayer.classList.contains('mobile-active')).toBe(false);
    });

    it('does NOT dismiss modal when tapping inside the modal or on the toggle button', () => {
        const btnSettings = elements['btn-settings'];
        const modalSettings = elements['settings-modal'];
        const checkGrid = elements['check-hide-grid'];
        checkGrid.parentElement = modalSettings;
        modalSettings.children.push(checkGrid);

        // Open Settings Modal
        btnSettings.onclick({ stopPropagation: () => {} });
        expect(modalSettings.classList.contains('show')).toBe(true);

        // Tap on toggle button itself -> outside listener ignores it
        (globalThis as any).window.dispatchEvent({
            type: 'pointerdown',
            target: btnSettings
        });
        expect(modalSettings.classList.contains('show')).toBe(true);

        // Tap inside modal on checkbox -> outside listener ignores it
        (globalThis as any).window.dispatchEvent({
            type: 'pointerdown',
            target: checkGrid
        });
        expect(modalSettings.classList.contains('show')).toBe(true);
    });
});
