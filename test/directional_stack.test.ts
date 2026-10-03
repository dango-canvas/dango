import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { state } from '../dango/js/modules/state.js';
import {
    computePosition,
    DIRECTIONAL_DISTANCE,
    DIRECTIONAL_BRANCH_GAP,
    handleDirectionalCreateStart,
    handleDirectionalCreateEnd,
    clearDirectionalGhost,
    realignDirectionalNodeAfterEdit
} from '../dango/js/modules/directional.js';
import type { CanvasNode, CanvasLink } from '../dango/js/modules/types.js';

class MockElement {
    tagName: string;
    className: string;
    style: Record<string, string>;
    attributes: Record<string, string>;
    children: MockElement[] = [];
    parentNode: MockElement | null = null;
    offsetWidth: number = 108;
    offsetHeight: number = 44;

    constructor(className = '', tagName = 'div') {
        this.className = className;
        this.tagName = tagName;
        this.style = {};
        this.attributes = {};
    }

    setAttribute(k: string, v: string) { this.attributes[k] = v; }
    getAttribute(k: string) { return this.attributes[k]; }
    removeAttribute(k: string) { delete this.attributes[k]; }
    appendChild(child: MockElement) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    remove() {
        if (this.parentNode) {
            const idx = this.parentNode.children.indexOf(this);
            if (idx !== -1) this.parentNode.children.splice(idx, 1);
            this.parentNode = null;
        }
    }
    classList = {
        add: (c: string) => { this.className += ` ${c}`; },
        remove: (c: string) => { this.className = this.className.replace(c, '').trim(); }
    };
}

describe('Directional Branch Stacking Engine', () => {
    let prevDoc: any;
    let prevComputedStyle: any;

    beforeEach(() => {
        prevDoc = (globalThis as any).document;
        prevComputedStyle = (globalThis as any).getComputedStyle;

        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.selection = new Set<string>();
        clearDirectionalGhost();

        const nodesLayer = new MockElement('nodes-layer', 'div');
        const connectionsLayer = new MockElement('connections-layer', 'svg');

        (globalThis as any).document = {
            body: {
                classList: {
                    add: () => {},
                    remove: () => {},
                    toggle: () => {},
                    contains: () => false
                }
            },
            getElementById: (id: string) => {
                if (id === 'nodes-layer') return nodesLayer;
                if (id === 'connections-layer') return connectionsLayer;
                return null;
            },
            createElement: (tag: string) => new MockElement('', tag),
            createElementNS: (_ns: string, tag: string) => new MockElement('', tag),
            querySelector: () => null,
            querySelectorAll: () => []
        };
        (globalThis as any).getComputedStyle = () => ({
            paddingLeft: '12px',
            paddingRight: '12px',
            paddingTop: '8px',
            paddingBottom: '8px',
            borderLeftWidth: '1px',
            borderRightWidth: '1px',
            borderTopWidth: '1px',
            borderBottomWidth: '1px'
        });
    });

    afterEach(() => {
        (globalThis as any).document = prevDoc;
        (globalThis as any).getComputedStyle = prevComputedStyle;
    });

    it('computes initial position when no existing links are present', () => {
        const root: CanvasNode = { id: 'root', text: 'Root', x: 200, y: 200, w: 100, h: 40, color: 'c-white' };
        state.nodes = [root];

        const targetBox = { w: 108, h: 44 };

        // ArrowRight: x = 200 + 100 + 48 = 348, y = 200 + (40 - 44)/2 = 198
        const posRight = computePosition(root, targetBox, { dx: 1, dy: 0 });
        expect(posRight.x).toBe(348);
        expect(posRight.y).toBe(198);

        // ArrowDown: x = 200 + (100 - 108)/2 = 196, y = 200 + 40 + 48 = 288
        const posDown = computePosition(root, targetBox, { dx: 0, dy: 1 });
        expect(posDown.x).toBe(196);
        expect(posDown.y).toBe(288);
    });

    it('stacks subsequent right-branches vertically downwards along the column', () => {
        const root: CanvasNode = { id: 'root', text: 'Root', x: 200, y: 200, w: 100, h: 40, color: 'c-white' };
        const b1: CanvasNode = { id: 'b1', text: 'B1', x: 348, y: 198, w: 108, h: 44, color: 'c-white' };
        const link1: CanvasLink = { id: 'l1', sourceId: 'root', targetId: 'b1', direction: 'target' };

        state.nodes = [root, b1];
        state.links = [link1];

        const targetBox = { w: 108, h: 44 };

        // Second right-branch should be placed directly below b1
        // x = b1.x = 348, y = b1.y + b1.h + DIRECTIONAL_BRANCH_GAP = 198 + 44 + 20 = 262
        const pos2 = computePosition(root, targetBox, { dx: 1, dy: 0 });
        expect(pos2.x).toBe(348);
        expect(pos2.y).toBe(262);

        // Add b2 to state
        const b2: CanvasNode = { id: 'b2', text: 'B2', x: pos2.x, y: pos2.y, w: 108, h: 44, color: 'c-white' };
        const link2: CanvasLink = { id: 'l2', sourceId: 'root', targetId: 'b2', direction: 'target' };
        state.nodes.push(b2);
        state.links.push(link2);

        // Third right-branch should be placed below b2
        // y = 262 + 44 + 20 = 326
        const pos3 = computePosition(root, targetBox, { dx: 1, dy: 0 });
        expect(pos3.x).toBe(348);
        expect(pos3.y).toBe(326);
    });

    it('supports 10+ right branches without angle cutoff or overlapping', () => {
        const root: CanvasNode = { id: 'root', text: 'Root', x: 200, y: 200, w: 100, h: 40, color: 'c-white' };
        state.nodes = [root];

        const targetBox = { w: 108, h: 44 };
        const branchIds: string[] = [];

        for (let i = 0; i < 10; i++) {
            const pos = computePosition(root, targetBox, { dx: 1, dy: 0 });
            expect(pos.x).toBe(348); // Remains aligned to column
            if (i > 0) {
                const prevNode = state.nodes[state.nodes.length - 1];
                expect(pos.y).toBe(prevNode.y + prevNode.h + DIRECTIONAL_BRANCH_GAP);
            }

            const newNode: CanvasNode = {
                id: `b${i + 1}`,
                text: `B${i + 1}`,
                x: pos.x,
                y: pos.y,
                w: targetBox.w,
                h: targetBox.h,
                color: 'c-white'
            };
            const newLink: CanvasLink = {
                id: `l${i + 1}`,
                sourceId: 'root',
                targetId: newNode.id,
                direction: 'target'
            };
            state.nodes.push(newNode);
            state.links.push(newLink);
            branchIds.push(newNode.id);
        }

        expect(state.nodes.length).toBe(11);
        // Verify all 10 branches have distinct strictly increasing Y positions
        for (let i = 1; i < branchIds.length; i++) {
            const prev = state.nodes.find(n => n.id === branchIds[i - 1])!;
            const curr = state.nodes.find(n => n.id === branchIds[i])!;
            expect(curr.y).toBeGreaterThan(prev.y);
            expect(curr.y - (prev.y + prev.h)).toBe(DIRECTIONAL_BRANCH_GAP);
        }
    });

    it('stacks subsequent down-branches horizontally to the right along the row', () => {
        const root: CanvasNode = { id: 'root', text: 'Root', x: 300, y: 150, w: 100, h: 40, color: 'c-white' };
        const d1: CanvasNode = { id: 'd1', text: 'D1', x: 296, y: 238, w: 108, h: 44, color: 'c-white' };
        const link1: CanvasLink = { id: 'ld1', sourceId: 'root', targetId: 'd1', direction: 'target' };

        state.nodes = [root, d1];
        state.links = [link1];

        const targetBox = { w: 108, h: 44 };

        // Second down-branch should be placed horizontally to the right of d1
        // x = d1.x + d1.w + DIRECTIONAL_BRANCH_GAP = 296 + 108 + 20 = 424, y = d1.y = 238
        const pos2 = computePosition(root, targetBox, { dx: 0, dy: 1 });
        expect(pos2.x).toBe(424);
        expect(pos2.y).toBe(238);

        // Add d2
        const d2: CanvasNode = { id: 'd2', text: 'D2', x: pos2.x, y: pos2.y, w: 108, h: 44, color: 'c-white' };
        const link2: CanvasLink = { id: 'ld2', sourceId: 'root', targetId: 'd2', direction: 'target' };
        state.nodes.push(d2);
        state.links.push(link2);

        // Third down-branch should be placed to the right of d2
        // x = 424 + 108 + 20 = 552, y = 238
        const pos3 = computePosition(root, targetBox, { dx: 0, dy: 1 });
        expect(pos3.x).toBe(552);
        expect(pos3.y).toBe(238);
    });

    it('right branches and down branches remain completely independent without cross-interference', () => {
        const root: CanvasNode = { id: 'root', text: 'Root', x: 200, y: 200, w: 100, h: 40, color: 'c-white' };
        state.nodes = [root];

        const targetBox = { w: 108, h: 44 };

        // Add 5 right branches
        for (let i = 0; i < 5; i++) {
            const pos = computePosition(root, targetBox, { dx: 1, dy: 0 });
            const node: CanvasNode = { id: `r${i}`, text: `R${i}`, x: pos.x, y: pos.y, w: targetBox.w, h: targetBox.h, color: 'c-white' };
            state.nodes.push(node);
            state.links.push({ id: `lr${i}`, sourceId: 'root', targetId: node.id, direction: 'target' });
        }

        // Now trigger ArrowDown on root.
        // It must NOT place the node next to the right branches!
        // It must place the first downward branch directly centered below root!
        const posDown = computePosition(root, targetBox, { dx: 0, dy: 1 });
        expect(posDown.x).toBe(root.x + (root.w - targetBox.w) / 2); // 200 + (100-108)/2 = 196
        expect(posDown.y).toBe(root.y + root.h + DIRECTIONAL_DISTANCE); // 200 + 40 + 48 = 288

        // Add first downward branch (-1)
        const d1: CanvasNode = { id: 'd1', text: '-1', x: posDown.x, y: posDown.y, w: targetBox.w, h: targetBox.h, color: 'c-white' };
        state.nodes.push(d1);
        state.links.push({ id: 'ld1', sourceId: 'root', targetId: d1.id, direction: 'target' });

        // Second downward branch (-2) must be placed directly to the right of -1!
        // It must NOT jump to the right of r1/r2/r3/r4!
        const posDown2 = computePosition(root, targetBox, { dx: 0, dy: 1 });
        expect(posDown2.x).toBe(d1.x + d1.w + DIRECTIONAL_BRANCH_GAP); // 196 + 108 + 20 = 324
        expect(posDown2.y).toBe(d1.y); // 288

        // Add second downward branch (-2)
        const d2: CanvasNode = { id: 'd2', text: '-2', x: posDown2.x, y: posDown2.y, w: targetBox.w, h: targetBox.h, color: 'c-white' };
        state.nodes.push(d2);
        state.links.push({ id: 'ld2', sourceId: 'root', targetId: d2.id, direction: 'target' });

        // Third downward branch (-3) must be placed directly to the right of -2!
        const posDown3 = computePosition(root, targetBox, { dx: 0, dy: 1 });
        expect(posDown3.x).toBe(d2.x + d2.w + DIRECTIONAL_BRANCH_GAP); // 324 + 108 + 20 = 452
        expect(posDown3.y).toBe(d2.y); // 288

        // Triggering right-branch again must still stack under r4 (x = 348)
        const posRight6 = computePosition(root, targetBox, { dx: 1, dy: 0 });
        const r4 = state.nodes.find(n => n.id === 'r4')!;
        expect(posRight6.x).toBe(348);
        expect(posRight6.y).toBe(r4.y + r4.h + DIRECTIONAL_BRANCH_GAP);
    });

    it('realignDirectionalNodeAfterEdit preserves branch offset relative to sibling anchor', () => {
        const root: CanvasNode = { id: 'root', text: 'Root', x: 200, y: 200, w: 100, h: 40, color: 'c-white' };
        const b1: CanvasNode = { id: 'b1', text: 'B1', x: 348, y: 198, w: 108, h: 44, color: 'c-white' };
        const link1: CanvasLink = { id: 'l1', sourceId: 'root', targetId: 'b1', direction: 'target' };

        state.nodes = [root, b1];
        state.links = [link1];
        state.selection = new Set(['root']);

        // Create b2 using handleDirectionalCreateStart & End
        handleDirectionalCreateStart('ArrowRight');
        const callbacks = { render: () => {}, handleNodeEdit: () => {} };
        handleDirectionalCreateEnd('ArrowRight', callbacks, 'arrow');
        handleDirectionalCreateEnd('ArrowRight', callbacks, 'modifier');

        const b2 = state.nodes.find(n => n.id !== 'root' && n.id !== 'b1')!;
        expect(b2).toBeDefined();
        expect(b2.x).toBe(348);
        expect(b2.y).toBe(198 + 44 + DIRECTIONAL_BRANCH_GAP); // 262

        // Simulate user typing multiline / longer text in b2 (expanding to 150x60)
        b2.w = 150;
        b2.h = 60;

        const didMove = realignDirectionalNodeAfterEdit(b2);
        // Position remains anchored to b1 (y = 262, x = 348)
        expect(b2.x).toBe(348);
        expect(b2.y).toBe(262);
    });

    it('handleDirectionalCreateEnd immediately and unconditionally activates node edit mode with force=true', () => {
        const root: CanvasNode = { id: 'root', text: 'Root', x: 200, y: 200, w: 100, h: 40, color: 'c-white' };
        state.nodes = [root];
        state.selection = new Set(['root']);

        let editedElement: any = null;
        let editedWithForce: boolean | undefined = undefined;

        const fakeNodeEl = new MockElement('node', 'div');
        (globalThis as any).document.querySelector = (selector: string) => {
            if (selector.includes('.node[data-id=')) {
                return fakeNodeEl;
            }
            return null;
        };

        handleDirectionalCreateStart('ArrowRight');
        const callbacks = {
            render: () => {},
            handleNodeEdit: (el: any, force?: boolean) => {
                editedElement = el;
                editedWithForce = force;
            }
        };

        handleDirectionalCreateEnd('ArrowRight', callbacks, 'arrow');
        handleDirectionalCreateEnd('ArrowRight', callbacks, 'modifier');

        // Must be called synchronously without relying on an async setTimeout gap
        expect(editedElement).toBe(fakeNodeEl);
        expect(editedWithForce).toBe(true);
    });
});
