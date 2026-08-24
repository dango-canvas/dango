// test/hints.test.ts
import { expect, test, describe, beforeEach } from "bun:test";
import { state } from "../dango/js/modules/state.js";
import {
    HINT_ALPHABET,
    getVisibleNodes,
    sortNodesTopologically,
    generateHintCodes,
    initHints,
    enterHintMode,
    exitHintMode,
    isHintModeActive,
    handleHintKeyDown
} from "../dango/js/modules/hints.js";
import type { CanvasNode, CanvasView } from "../dango/js/modules/types.js";

describe("Vimium-Style Node Hints (f / Shift+f)", () => {
    beforeEach(() => {
        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set();
        state.view = { x: 0, y: 0, scale: 1 };
        exitHintMode();
    });

    test("HINT_ALPHABET contains 26 ergonomic keys", () => {
        expect(HINT_ALPHABET.length).toBe(26);
        expect(HINT_ALPHABET[0]).toBe('a');
        expect(HINT_ALPHABET[1]).toBe('s');
        expect(HINT_ALPHABET[2]).toBe('d');
        expect(HINT_ALPHABET[3]).toBe('f');
    });

    test("getVisibleNodes: correctly filters nodes inside viewport", () => {
        const view: CanvasView = { x: 0, y: 0, scale: 1 };
        const winW = 1000;
        const winH = 800;

        const insideNode: CanvasNode = { id: 'n1', text: 'inside', x: 200, y: 300, w: 100, h: 40, color: 'c-white' };
        const outsideRight: CanvasNode = { id: 'n2', text: 'outside right', x: 1200, y: 300, w: 100, h: 40, color: 'c-white' };
        const outsideLeft: CanvasNode = { id: 'n3', text: 'outside left', x: -300, y: 300, w: 100, h: 40, color: 'c-white' };
        const outsideBottom: CanvasNode = { id: 'n4', text: 'outside bottom', x: 200, y: 950, w: 100, h: 40, color: 'c-white' };

        const visible = getVisibleNodes([insideNode, outsideRight, outsideLeft, outsideBottom], view, winW, winH);
        expect(visible.length).toBe(1);
        expect(visible[0].id).toBe('n1');
    });

    test("getVisibleNodes: accounts for canvas zoom scale and pan offsets", () => {
        // Zoomed out (scale 0.5) and panned
        const view: CanvasView = { x: 100, y: 50, scale: 0.5 };
        const winW = 1000;
        const winH = 800;

        // node at world (1000, 1000) -> screen: (1000 * 0.5 + 100, 1000 * 0.5 + 50) = (600, 550) -> inside screen
        const farNode: CanvasNode = { id: 'n1', text: 'far', x: 1000, y: 1000, w: 100, h: 40, color: 'c-white' };
        // node at world (3000, 3000) -> screen: (1600, 1550) -> outside screen
        const tooFarNode: CanvasNode = { id: 'n2', text: 'too far', x: 3000, y: 3000, w: 100, h: 40, color: 'c-white' };

        const visible = getVisibleNodes([farNode, tooFarNode], view, winW, winH);
        expect(visible.length).toBe(1);
        expect(visible[0].id).toBe('n1');
    });

    test("sortNodesTopologically: sorts nodes top-to-bottom and left-to-right with row tolerance", () => {
        const nTopLeft: CanvasNode = { id: 'n1', text: 'top left', x: 100, y: 50, w: 100, h: 40, color: 'c-white' };
        const nTopRight: CanvasNode = { id: 'n2', text: 'top right', x: 500, y: 60, w: 100, h: 40, color: 'c-white' }; // within 30px row tolerance
        const nBottomLeft: CanvasNode = { id: 'n3', text: 'bottom left', x: 80, y: 200, w: 100, h: 40, color: 'c-white' };

        const sorted = sortNodesTopologically([nBottomLeft, nTopRight, nTopLeft]);
        expect(sorted.map(n => n.id)).toEqual(['n1', 'n2', 'n3']);
    });

    test("generateHintCodes: produces 1-character codes for <= 26 items and prefix-free mixed 1-char/2-char codes for > 26 items", () => {
        const singleCodes = generateHintCodes(5);
        expect(singleCodes).toEqual(['a', 's', 'd', 'f', 'j']);

        const maxSingleCodes = generateHintCodes(26);
        expect(maxSingleCodes.length).toBe(26);
        expect(maxSingleCodes[0]).toBe('a');
        expect(maxSingleCodes[25]).toBe('m');

        // For count = 30: 25 single-character codes + 5 two-character codes prefixed with 'm'
        const mixedCodes = generateHintCodes(30);
        expect(mixedCodes.length).toBe(30);
        expect(mixedCodes[0]).toBe('a');
        expect(mixedCodes[24]).toBe('n'); // 25th single character
        expect(mixedCodes[25]).toBe('ma'); // 1st two-char code with prefix 'm'
        expect(mixedCodes[26]).toBe('ms');
        expect(mixedCodes[29]).toBe('mj');

        // Verify all 30 codes are unique
        const uniqueSet = new Set(mixedCodes);
        expect(uniqueSet.size).toBe(30);

        // Verify prefix-free property (no 1-char code is a prefix of another code)
        const singleCharCodes = mixedCodes.filter(c => c.length === 1);
        const multiCharCodes = mixedCodes.filter(c => c.length > 1);
        for (const single of singleCharCodes) {
            for (const multi of multiCharCodes) {
                expect(multi.startsWith(single)).toBe(false);
            }
        }
    });

    test("enterHintMode and handleHintKeyDown: single-select jump replaces selection", () => {
        let renderCalled = false;
        initHints(state, {
            render: () => { renderCalled = true; }
        });

        const n1: CanvasNode = { id: 'n1', text: 'node 1', x: 100, y: 100, w: 100, h: 40, color: 'c-white' };
        const n2: CanvasNode = { id: 'n2', text: 'node 2', x: 300, y: 100, w: 100, h: 40, color: 'c-white' };
        state.nodes = [n1, n2];
        state.selection.add('n1'); // initially n1 selected

        enterHintMode(false); // Single select mode
        expect(isHintModeActive()).toBe(true);

        // Press 's' (matches n2 since sorted order is n1='a', n2='s')
        const handled = handleHintKeyDown({ key: 's', code: 'KeyS' } as KeyboardEvent);
        expect(handled).toBe(true);
        expect(isHintModeActive()).toBe(false);
        expect(state.selection.has('n2')).toBe(true);
        expect(state.selection.has('n1')).toBe(false);
        expect(renderCalled).toBe(true);
    });

    test("enterHintMode and handleHintKeyDown: multi-select (Shift+f) toggles selection without clearing existing", () => {
        let renderCalled = false;
        initHints(state, {
            render: () => { renderCalled = true; }
        });

        const n1: CanvasNode = { id: 'n1', text: 'node 1', x: 100, y: 100, w: 100, h: 40, color: 'c-white' };
        const n2: CanvasNode = { id: 'n2', text: 'node 2', x: 300, y: 100, w: 100, h: 40, color: 'c-white' };
        state.nodes = [n1, n2];
        state.selection.add('n1'); // initially n1 selected

        enterHintMode(true); // Multi-select mode
        expect(isHintModeActive()).toBe(true);

        // Press 's' (matches n2)
        const handled = handleHintKeyDown({ key: 's', code: 'KeyS' } as KeyboardEvent);
        expect(handled).toBe(true);
        expect(isHintModeActive()).toBe(false);
        // Both n1 and n2 are now selected
        expect(state.selection.has('n1')).toBe(true);
        expect(state.selection.has('n2')).toBe(true);
    });

    test("handleHintKeyDown: Escape exits hint mode cleanly", () => {
        initHints(state, { render: () => {} });
        state.nodes = [{ id: 'n1', text: 'node 1', x: 100, y: 100, w: 100, h: 40, color: 'c-white' }];

        enterHintMode(false);
        expect(isHintModeActive()).toBe(true);

        const handled = handleHintKeyDown({ key: 'Escape', code: 'Escape' } as KeyboardEvent);
        expect(handled).toBe(true);
        expect(isHintModeActive()).toBe(false);
    });

    test("handleHintKeyDown: Mismatch exits hint mode cleanly", () => {
        initHints(state, { render: () => {} });
        state.nodes = [
            { id: 'n1', text: 'node 1', x: 100, y: 100, w: 100, h: 40, color: 'c-white' },
            { id: 'n2', text: 'node 2', x: 200, y: 100, w: 100, h: 40, color: 'c-white' }
        ];

        enterHintMode(false);
        // 'z' is not assigned when only 2 nodes exist ('a' and 's')
        const handled = handleHintKeyDown({ key: 'z', code: 'KeyZ' } as KeyboardEvent);
        expect(handled).toBe(true);
        expect(isHintModeActive()).toBe(false);
    });

    test("handleHintKeyDown: supports Alt key chord matching and ignores raw Alt press", () => {
        initHints(state, { render: () => {} });
        state.nodes = [
            { id: 'n1', text: 'node 1', x: 100, y: 100, w: 100, h: 40, color: 'c-white' },
            { id: 'n2', text: 'node 2', x: 200, y: 100, w: 100, h: 40, color: 'c-white' }
        ];

        enterHintMode(false);
        // Pressing Alt modifier alone does not dismiss hint mode
        const altPressHandled = handleHintKeyDown({ key: 'Alt', code: 'AltLeft', altKey: true } as KeyboardEvent);
        expect(altPressHandled).toBe(true);
        expect(isHintModeActive()).toBe(true);

        // Typing 's' while holding Alt matches via e.code 'KeyS' even if key is modified
        const chordHandled = handleHintKeyDown({ key: 'ß', code: 'KeyS', altKey: true } as KeyboardEvent);
        expect(chordHandled).toBe(true);
        expect(isHintModeActive()).toBe(false);
        expect(state.selection.has('n2')).toBe(true);
    });

    test("handleHintKeyDown in Tagging Mode: directly assigns next step or toggles step", () => {
        const { initPresenter, enterTaggingMode } = require("../dango/js/modules/presenter.js");
        initPresenter(state, {
            render: () => {},
            animateView: () => {},
            fitView: () => {}
        });
        initHints(state, { render: () => {} });

        state.nodes = [
            { id: 'n1', text: 'node 1', x: 100, y: 100, w: 100, h: 40, color: 'c-white' },
            { id: 'n2', text: 'node 2', x: 200, y: 100, w: 100, h: 40, color: 'c-white' }
        ];

        enterTaggingMode();

        // 1. Press f -> press a (matches n1) -> tags step 1
        enterHintMode(false);
        handleHintKeyDown({ key: 'a', code: 'KeyA' } as KeyboardEvent);
        expect(state.nodes[0].step).toBe(1);

        // 2. Press f -> press s (matches n2) -> tags step 2
        enterHintMode(false);
        handleHintKeyDown({ key: 's', code: 'KeyS' } as KeyboardEvent);
        expect(state.nodes[1].step).toBe(2);

        // 3. Press f -> press a (matches n1 again) -> toggles off step
        enterHintMode(false);
        handleHintKeyDown({ key: 'a', code: 'KeyA' } as KeyboardEvent);
        expect(state.nodes[0].step).toBeUndefined();
    });
});

