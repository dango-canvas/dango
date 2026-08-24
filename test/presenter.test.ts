// test/presenter.test.ts
import { expect, test, describe, beforeEach } from "bun:test";
import { state } from "../dango/js/modules/state.js";
import { 
    initPresenter, 
    isTaggingModeActive, 
    enterTaggingMode, 
    exitTaggingMode, 
    tagSelectionStep, 
    tagItemDirect,
    tagItemsBatch,
    clearAllSteps,
    clearStepsOfSelection,
    getMaxStep, 
    getStepBadgeText,
    isPresentationModeActive, 
    getCurrentStep, 
    enterPresentationMode, 
    exitPresentationMode, 
    nextStep, 
    prevStep, 
    revealAll, 
    handlePresenterKeyDown, 
    isItemVisibleInPresentation, 
    isLinkVisibleInPresentation,
    isItemGhostedInTagging,
    isLinkGhostedInTagging,
    checkAndSoftPanToStep
} from "../dango/js/modules/presenter.js";

describe("Dango Presentation Engine & Step Tagging (T / P)", () => {
    let renderCalls = 0;
    let animateViewCalls: Array<{ x: number; y: number; scale: number; duration?: number }> = [];
    let fitViewCalls: Array<{ padding?: number; animated?: boolean; duration?: number }> = [];

    beforeEach(() => {
        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set<string>();
        state.view = { x: 500, y: 400, scale: 1.0 };
        renderCalls = 0;
        animateViewCalls = [];
        fitViewCalls = [];

        // Mock browser globals for test environment
        (globalThis as any).window = {
            innerWidth: 1000,
            innerHeight: 800
        };
        (globalThis as any).document = {
            body: {
                classList: {
                    add: () => {},
                    remove: () => {},
                    contains: () => false
                }
            },
            getElementById: () => null
        };

        initPresenter(state, {
            render: () => { renderCalls++; },
            animateView: (x, y, scale, duration) => {
                animateViewCalls.push({ x, y, scale, duration });
            },
            fitView: (padding, animated, duration) => {
                fitViewCalls.push({ padding, animated, duration });
            }
        });

        exitTaggingMode(false);
        exitPresentationMode();
    });

    test("getMaxStep & getStepBadgeText formatting", () => {
        expect(getMaxStep([], [])).toBe(0);

        state.nodes = [
            { id: 'n1', text: '1', x: 0, y: 0, w: 100, h: 40, color: 'c-white', step: 1 },
            { id: 'n2', text: '2', x: 0, y: 0, w: 100, h: 40, color: 'c-white', step: 5 }
        ];
        state.groups = [
            { id: 'g1', x: 0, y: 0, w: 200, h: 100, memberIds: [], step: 3 }
        ];

        expect(getMaxStep(state.nodes, state.groups)).toBe(5);
        expect(getStepBadgeText(1)).toBe('1');
        expect(getStepBadgeText(5)).toBe('5');
        expect(getStepBadgeText(20)).toBe('20');
        expect(getStepBadgeText(21)).toBe('21');
        expect(getStepBadgeText(undefined)).toBe('');
    });

    test("Tagging Mode: toggles on/off cleanly and clears selection without mutating steps", () => {
        expect(isTaggingModeActive()).toBe(false);

        state.nodes = [
            { id: 'n1', text: 'Node 1', x: 0, y: 0, w: 100, h: 40, color: 'c-white' }
        ];
        state.selection = new Set(['n1']);

        // Press T with selection -> enters tagging mode, clears selection, does NOT mutate node step
        tagSelectionStep();
        expect(isTaggingModeActive()).toBe(true);
        expect(state.selection.size).toBe(0);
        expect(state.nodes[0].step).toBeUndefined();

        // Press T again -> exits tagging mode, does NOT mutate node step
        tagSelectionStep();
        expect(isTaggingModeActive()).toBe(false);
        expect(state.nodes[0].step).toBeUndefined();

        // Press T third time -> enters tagging mode again, does NOT mutate node step
        tagSelectionStep();
        expect(isTaggingModeActive()).toBe(true);
        expect(state.nodes[0].step).toBeUndefined();
    });

    test("Tagging Mode: ghosting calculation for un-tagged nodes and links", () => {
        state.nodes = [
            { id: 'n1', text: 'Tagged', x: 0, y: 0, w: 100, h: 40, color: 'c-white', step: 1 },
            { id: 'n2', text: 'Untagged', x: 150, y: 0, w: 100, h: 40, color: 'c-white' }
        ];
        state.links = [
            { id: 'l1', sourceId: 'n1', targetId: 'n2', direction: 'target' }
        ];

        // In normal mode (not tagging): nothing is ghosted
        expect(isTaggingModeActive()).toBe(false);
        expect(isItemGhostedInTagging(state.nodes[0])).toBe(false);
        expect(isItemGhostedInTagging(state.nodes[1])).toBe(false);
        expect(isLinkGhostedInTagging(state.links[0])).toBe(false);

        // In tagging mode: untagged items and connecting links are ghosted (semi-transparent)
        enterTaggingMode();
        expect(isTaggingModeActive()).toBe(true);
        expect(isItemGhostedInTagging(state.nodes[0])).toBe(false);
        expect(isItemGhostedInTagging(state.nodes[1])).toBe(true);
        expect(isLinkGhostedInTagging(state.links[0])).toBe(true);
    });

    test("tagItemDirect: single node auto-increment step assignment on click", () => {
        state.nodes = [
            { id: 'n1', text: 'Step 1', x: 0, y: 0, w: 100, h: 40, color: 'c-white' },
            { id: 'n2', text: 'Step 2', x: 150, y: 0, w: 100, h: 40, color: 'c-white' }
        ];

        // Click n1
        tagItemDirect(state.nodes[0]);
        expect(state.nodes[0].step).toBe(1);
        expect(state.nodes[1].step).toBeUndefined();
        expect(isTaggingModeActive()).toBe(true);

        // Click n2
        tagItemDirect(state.nodes[1]);
        expect(state.nodes[0].step).toBe(1);
        expect(state.nodes[1].step).toBe(2);

        // Click n1 again -> toggle off
        tagItemDirect(state.nodes[0]);
        expect(state.nodes[0].step).toBeUndefined();
        expect(state.nodes[1].step).toBe(2);
    });

    test("tagItemsBatch: multi-select / box-select assigns the same step number or toggles all off", () => {
        state.nodes = [
            { id: 'n1', text: 'Parallel 1', x: 0, y: 0, w: 100, h: 40, color: 'c-white' },
            { id: 'n2', text: 'Parallel 2', x: 150, y: 0, w: 100, h: 40, color: 'c-white' }
        ];

        // Untagged items get assigned the same step
        tagItemsBatch([state.nodes[0], state.nodes[1]]);
        expect(state.nodes[0].step).toBe(1);
        expect(state.nodes[1].step).toBe(1);

        // Re-batch when all items have step -> toggles all off
        tagItemsBatch([state.nodes[0], state.nodes[1]]);
        expect(state.nodes[0].step).toBeUndefined();
        expect(state.nodes[1].step).toBeUndefined();

        // Items with distinct steps (1, 2, 3, 4) all get toggled off when batch selected
        state.nodes = [
            { id: 'n1', text: '1', x: 0, y: 0, w: 100, h: 40, color: 'c-white', step: 1 },
            { id: 'n2', text: '2', x: 100, y: 0, w: 100, h: 40, color: 'c-white', step: 2 },
            { id: 'n3', text: '3', x: 200, y: 0, w: 100, h: 40, color: 'c-white', step: 3 },
            { id: 'n4', text: '4', x: 300, y: 0, w: 100, h: 40, color: 'c-white', step: 4 }
        ];
        tagItemsBatch(state.nodes);
        expect(state.nodes[0].step).toBeUndefined();
        expect(state.nodes[1].step).toBeUndefined();
        expect(state.nodes[2].step).toBeUndefined();
        expect(state.nodes[3].step).toBeUndefined();
    });

    test("tagItemDirect: group tagging propagates step to untagged members", () => {
        state.nodes = [
            { id: 'n1', text: 'Member 1', x: 10, y: 10, w: 80, h: 40, color: 'c-white' },
            { id: 'n2', text: 'Member 2', x: 100, y: 10, w: 80, h: 40, color: 'c-white', step: 1 }
        ];
        state.groups = [
            { id: 'g1', x: 0, y: 0, w: 200, h: 80, memberIds: ['n1', 'n2'] }
        ];

        tagItemDirect(state.groups[0]);

        expect(state.groups[0].step).toBe(2);
        // n1 had no step, so it inherits group step (2)
        expect(state.nodes[0].step).toBe(2);
        // n2 already had an explicit step (1), so it retains its own step
        expect(state.nodes[1].step).toBe(1);
    });

    test("clearAllSteps: removes step property from all nodes and groups", () => {
        enterTaggingMode();
        state.nodes = [
            { id: 'n1', text: 'Node 1', x: 0, y: 0, w: 100, h: 40, color: 'c-white', step: 1 },
            { id: 'n2', text: 'Node 2', x: 150, y: 0, w: 100, h: 40, color: 'c-white', step: 2 }
        ];
        state.groups = [
            { id: 'g1', x: 0, y: 0, w: 200, h: 80, memberIds: ['n1'], step: 1 }
        ];

        clearAllSteps();
        expect(state.nodes[0].step).toBeUndefined();
        expect(state.nodes[1].step).toBeUndefined();
        expect(state.groups[0].step).toBeUndefined();
    });

    test("clearStepsOfSelection: clears steps only for selected items (or all if selection empty)", () => {
        enterTaggingMode();
        state.nodes = [
            { id: 'n1', text: 'Node 1', x: 0, y: 0, w: 100, h: 40, color: 'c-white', step: 1 },
            { id: 'n2', text: 'Node 2', x: 150, y: 0, w: 100, h: 40, color: 'c-white', step: 2 }
        ];

        // 1. Clear selected node
        state.selection = new Set(['n1']);
        clearStepsOfSelection();
        expect(state.nodes[0].step).toBeUndefined();
        expect(state.nodes[1].step).toBe(2);

        // 2. Clear all when selection is empty in tagging mode
        state.selection = new Set();
        clearStepsOfSelection();
        expect(state.nodes[0].step).toBeUndefined();
        expect(state.nodes[1].step).toBeUndefined();
    });

    test("Presentation Mode: step navigation and finale reveal", () => {
        state.nodes = [
            { id: 'n1', text: 'Step 1', x: 100, y: 100, w: 100, h: 40, color: 'c-white', step: 1 },
            { id: 'n2', text: 'Step 2', x: 300, y: 100, w: 100, h: 40, color: 'c-white', step: 2 },
            { id: 'n3', text: 'Untagged', x: 500, y: 100, w: 100, h: 40, color: 'c-white' }
        ];
        state.links = [
            { id: 'l1', sourceId: 'n1', targetId: 'n2', direction: 'target' },
            { id: 'l2', sourceId: 'n2', targetId: 'n3', direction: 'target' }
        ];

        enterPresentationMode();
        expect(isPresentationModeActive()).toBe(true);
        expect(getCurrentStep()).toBe(1);

        // Step 1: Only n1 is visible
        expect(isItemVisibleInPresentation(state.nodes[0])).toBe(true);
        expect(isItemVisibleInPresentation(state.nodes[1])).toBe(false);
        expect(isItemVisibleInPresentation(state.nodes[2])).toBe(false);
        expect(isLinkVisibleInPresentation(state.links[0])).toBe(false); // n2 not visible
        expect(isLinkVisibleInPresentation(state.links[1])).toBe(false);

        // Step 2: n1 and n2 visible, link l1 becomes visible
        nextStep();
        expect(getCurrentStep()).toBe(2);
        expect(isItemVisibleInPresentation(state.nodes[0])).toBe(true);
        expect(isItemVisibleInPresentation(state.nodes[1])).toBe(true);
        expect(isItemVisibleInPresentation(state.nodes[2])).toBe(false);
        expect(isLinkVisibleInPresentation(state.links[0])).toBe(true);
        expect(isLinkVisibleInPresentation(state.links[1])).toBe(false);

        // Step 3 (Finale): All nodes (including untagged) and links visible
        nextStep();
        expect(getCurrentStep()).toBe(3);
        expect(isItemVisibleInPresentation(state.nodes[0])).toBe(true);
        expect(isItemVisibleInPresentation(state.nodes[1])).toBe(true);
        expect(isItemVisibleInPresentation(state.nodes[2])).toBe(true);
        expect(isLinkVisibleInPresentation(state.links[0])).toBe(true);
        expect(isLinkVisibleInPresentation(state.links[1])).toBe(true);
        expect(fitViewCalls.length).toBeGreaterThanOrEqual(1);

        // Previous step
        prevStep();
        expect(getCurrentStep()).toBe(2);

        // Reveal all directly
        revealAll();
        expect(getCurrentStep()).toBe(3);

        // Exit returns directly to normal canvas and restores saved view
        animateViewCalls = [];
        exitPresentationMode();
        expect(isPresentationModeActive()).toBe(false);
        expect(isTaggingModeActive()).toBe(false);
        expect(isItemVisibleInPresentation(state.nodes[2])).toBe(true);
        expect(animateViewCalls.length).toBe(1);
    });

    test("handlePresenterKeyDown: handles presentation shortcuts correctly", () => {
        state.nodes = [
            { id: 'n1', text: '1', x: 0, y: 0, w: 100, h: 40, color: 'c-white', step: 1 },
            { id: 'n2', text: '2', x: 0, y: 0, w: 100, h: 40, color: 'c-white', step: 2 }
        ];

        enterPresentationMode();
        expect(getCurrentStep()).toBe(1);

        const makeKeyEv = (code: string) => ({
            code,
            preventDefault: () => {}
        } as unknown as KeyboardEvent);

        // Space advances step
        expect(handlePresenterKeyDown(makeKeyEv('Space'))).toBe(true);
        expect(getCurrentStep()).toBe(2);

        // ArrowLeft goes back
        expect(handlePresenterKeyDown(makeKeyEv('ArrowLeft'))).toBe(true);
        expect(getCurrentStep()).toBe(1);

        // Home reveals all
        expect(handlePresenterKeyDown(makeKeyEv('Home'))).toBe(true);
        expect(getCurrentStep()).toBe(3);

        // KeyQ activates spotlight in presentation mode
        expect(handlePresenterKeyDown(makeKeyEv('KeyQ'))).toBe(true);

        // Escape exits directly to normal canvas
        expect(handlePresenterKeyDown(makeKeyEv('Escape'))).toBe(true);
        expect(isPresentationModeActive()).toBe(false);
        expect(isTaggingModeActive()).toBe(false);
    });

    test("Smart Soft-Pan: camera remains still if node is in safe zone, pans if outside", () => {
        // View center: x: 500, y: 400, scale: 1.0 (winW: 1000, winH: 800)
        // Safe Zone: X in [150, 850], Y in [120, 680]
        
        // Node 1: x: 0, y: 0 -> Screen X = 0 + 500 = 500, Screen Y = 0 + 400 = 400 (Centered!)
        state.nodes = [
            { id: 'n1', text: 'Inside Safe', x: 0, y: 0, w: 100, h: 40, color: 'c-white', step: 1 },
            { id: 'n2', text: 'Outside Safe', x: 800, y: 600, w: 100, h: 40, color: 'c-white', step: 2 }
        ];

        // Step 1: should NOT trigger animateView because screen position is inside [150, 850] x [120, 680]
        animateViewCalls = [];
        checkAndSoftPanToStep(1);
        expect(animateViewCalls.length).toBe(0);

        // Step 2: Screen X = 800 + 500 = 1300 (> 850) -> outside safe zone!
        animateViewCalls = [];
        checkAndSoftPanToStep(2);
        expect(animateViewCalls.length).toBe(1);
        expect(animateViewCalls[0].duration).toBe(600);
    });
});
