// test/url_query.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { state } from '../dango/js/modules/state.js';
import { applyUrlQueryOverrides, checkFeedbackEligibility, initFeedbackTracker } from '../dango/js/modules/io.js';

class MockElement {
    tagName: string;
    id: string;
    className: string;
    checked: boolean = false;
    dataset: Record<string, string> = {};
    classList: {
        contains: (c: string) => boolean;
        add: (c: string) => void;
        remove: (c: string) => void;
    };

    constructor(id: string = '', tagName: string = 'div') {
        this.id = id;
        this.tagName = tagName.toUpperCase();
        this.className = '';
        const classes = new Set<string>();
        this.classList = {
            contains: (c: string) => classes.has(c),
            add: (c: string) => { classes.add(c); this.className = Array.from(classes).join(' '); },
            remove: (c: string) => { classes.delete(c); this.className = Array.from(classes).join(' '); }
        };
    }

    setAttribute(name: string, value: string) {
        if (name === 'data-theme') this.dataset.theme = value;
    }
}

describe('URL Query Parameter Overrides & Long-term Feedback System', () => {
    let mockStorage: Record<string, string>;
    let mockBody: MockElement;
    let mockHtml: MockElement;
    let mockElements: Record<string, MockElement>;

    beforeEach(() => {
        state.settings.hideToolbar = false;
        state.isEmbed = false;
        state.isReadonly = false;
        state.theme = 'light';
        state.nodes = [];

        mockStorage = {};
        (globalThis as any).localStorage = {
            getItem: (k: string) => mockStorage[k] || null,
            setItem: (k: string, v: string) => { mockStorage[k] = v; },
            removeItem: (k: string) => { delete mockStorage[k]; }
        };

        mockBody = new MockElement('body', 'body');
        mockHtml = new MockElement('html', 'html');
        mockElements = {
            'check-hide-toolbar': new MockElement('check-hide-toolbar', 'input')
        };

        (globalThis as any).document = {
            body: mockBody,
            documentElement: mockHtml,
            getElementById: (id: string) => mockElements[id] || null
        };
    });

    it('forces hideToolbar=true when ?toolbar=0 is present', () => {
        (globalThis as any).window = {
            location: { search: '?toolbar=0' }
        };
        applyUrlQueryOverrides();

        expect(state.settings.hideToolbar).toBe(true);
        expect(state.explicitToolbar).toBe(true);
        expect(mockElements['check-hide-toolbar'].checked).toBe(true);
    });

    it('forces hideToolbar=false when ?toolbar=1 in embed mode and adds embed-show-toolbar class', () => {
        state.isEmbed = true;
        (globalThis as any).window = {
            location: { search: '?embed=true&toolbar=1' }
        };
        applyUrlQueryOverrides();

        expect(state.settings.hideToolbar).toBe(false);
        expect(state.explicitToolbar).toBe(true);
        expect(mockBody.classList.contains('embed-show-toolbar')).toBe(true);
    });

    it('enables readonly mode when ?readonly=1 is present', () => {
        (globalThis as any).window = {
            location: { search: '?readonly=1' }
        };
        applyUrlQueryOverrides();

        expect(state.isReadonly).toBe(true);
        expect(mockBody.classList.contains('is-readonly')).toBe(true);
    });

    it('overrides theme when ?theme=dark is present', () => {
        (globalThis as any).window = {
            location: { search: '?theme=dark' }
        };
        applyUrlQueryOverrides();

        expect(state.theme).toBe('dark');
        expect(mockBody.dataset.theme).toBe('dark');
        expect(mockHtml.dataset.theme).toBe('dark');
    });

    it('calculates feedback eligibility correctly (>=7 days and >=30 nodes)', () => {
        // Initial state: not eligible on day 0
        initFeedbackTracker();
        expect(checkFeedbackEligibility()).toBe(false);

        // Day 8, but nodes < 30 -> not eligible
        const eightDaysAgo = Date.now() - (8 * 86400 * 1000);
        mockStorage['dango_first_used'] = eightDaysAgo.toString();
        expect(checkFeedbackEligibility()).toBe(false);

        // Day 8, nodes >= 30 -> eligible!
        for (let i = 0; i < 30; i++) {
            state.nodes.push({ id: `n-${i}`, text: `node ${i}`, x: 0, y: 0, w: 100, h: 40, color: 'c-white' });
        }
        expect(checkFeedbackEligibility()).toBe(true);

        // Once dismissed, permanently not eligible
        mockStorage['dango_feedback_dismissed'] = 'true';
        expect(checkFeedbackEligibility()).toBe(false);
    });
});
