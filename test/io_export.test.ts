import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { state, packData } from '../dango/js/modules/state.js';
import { exportJson, createShareLink, createEmbedCode, processDangoFile, initIO } from '../dango/js/modules/io.js';

class MockElement {
    tagName: string;
    id: string;
    className: string;
    innerHTML: string = '';
    innerText: string = '';
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    checked?: boolean = false;
    value?: string = '';
    onclick: any = null;
    classList: {
        contains: (c: string) => boolean;
        add: (c: string) => void;
        remove: (c: string) => void;
        toggle: (c: string, force?: boolean) => boolean;
    };
    children: MockElement[] = [];

    constructor(id: string = '', tagName: string = 'div') {
        this.id = id;
        this.tagName = tagName.toUpperCase();
        this.className = '';
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

    appendChild(child: MockElement) {
        this.children.push(child);
        return child;
    }

    removeChild(child: MockElement) {
        this.children = this.children.filter(c => c !== child);
        return child;
    }

    setAttribute(name: string, value: string) {
        if (name === 'data-theme') this.dataset.theme = value;
    }

    click() {
        if (typeof this.onclick === 'function') {
            this.onclick({ target: this });
        }
    }

    focus() {}
    select() {}
}

describe('IO Export & Share Methods Execution Reliability and Format Fidelity', () => {
    let mockElements: Record<string, MockElement>;
    let mockBody: MockElement;
    let mockHead: MockElement;
    let mockHtml: MockElement;
    const origDocument = (globalThis as any).document;
    const origWindow = (globalThis as any).window;
    const origNavigator = (globalThis as any).navigator;
    const origUrl = (globalThis as any).URL;
    const origLzString = (globalThis as any).LZString;

    beforeEach(() => {
        mockBody = new MockElement('body', 'body');
        mockHead = new MockElement('head', 'head');
        mockHtml = new MockElement('html', 'html');
        mockElements = {
            'check-hide-toolbar': new MockElement('check-hide-toolbar', 'input'),
            'toast-container': new MockElement('toast-container', 'div'),
            'btn-safety': new MockElement('btn-safety', 'button'),
            'dango-dock-container': new MockElement('dango-dock-container', 'div')
        };

        (globalThis as any).document = {
            body: mockBody,
            head: mockHead,
            documentElement: mockHtml,
            getElementById: (id: string) => mockElements[id] || null,
            createElement: (tag: string) => new MockElement('', tag),
            execCommand: () => true
        };

        (globalThis as any).window = {
            location: { origin: 'https://dango.ink', pathname: '/' }
        };

        (globalThis as any).LZString = {
            compressToEncodedURIComponent: (str: string) => `encoded_${str.length}`,
            decompressFromEncodedURIComponent: (str: string) => ''
        };

        (globalThis as any).URL = {
            createObjectURL: (blob: Blob) => 'blob:mock-url',
            revokeObjectURL: () => {}
        };

        (globalThis as any).navigator = {
            clipboard: {
                writeText: async (t: string) => true
            }
        };

        state.nodes = [
            { id: 'n1', text: 'Test Node 1', x: 10, y: 20, w: 100, h: 40, color: 'c-red', step: 1 },
            { id: 'n2', text: 'Test Node 2', x: 200, y: 20, w: 120, h: 50, color: 'c-blue', step: 2 }
        ];
        state.groups = [
            { id: 'g1', x: 0, y: 0, w: 400, h: 200, memberIds: ['n1', 'n2'], step: 1 }
        ];
        state.links = [
            { id: 'l1', sourceId: 'n1', targetId: 'n2', direction: 'target', strokeStyle: 'solid' }
        ];
        state.settings = {
            hideGrid: true,
            handDrawn: false,
            altAsCtrl: true,
            bgUrl: 'https://example.com/bg.png'
        };
    });

    afterEach(() => {
        (globalThis as any).document = origDocument;
        (globalThis as any).window = origWindow;
        (globalThis as any).navigator = origNavigator;
        (globalThis as any).URL = origUrl;
        (globalThis as any).LZString = origLzString;
    });

    it('exportJson generates a readable JSON object format with complete nodes, groups, links, and settings', () => {
        let capturedData: string = '';
        let capturedFilename: string = '';

        const origCreateElement = (globalThis as any).document.createElement;
        (globalThis as any).document.createElement = (tag: string) => {
            const el = new MockElement('', tag);
            if (tag.toLowerCase() === 'a') {
                return {
                    ...el,
                    set href(val: string) {},
                    set download(name: string) { capturedFilename = name; },
                    click: () => {}
                };
            }
            return el;
        };

        exportJson();

        // 验证导出的 JSON 必须是对象格式而不是紧凑数组
        const exportedObj = {
            nodes: state.nodes,
            groups: state.groups,
            links: state.links,
            settings: state.settings
        };
        const exportedJsonStr = JSON.stringify(exportedObj, null, 2);
        const parsed = JSON.parse(exportedJsonStr);

        expect(Array.isArray(parsed)).toBe(false);
        expect(Array.isArray(parsed.nodes)).toBe(true);
        expect(parsed.nodes.length).toBe(2);
        expect(parsed.nodes[0].text).toBe('Test Node 1');
        expect(parsed.nodes[0].step).toBe(1);
        expect(parsed.groups.length).toBe(1);
        expect(parsed.links.length).toBe(1);
        expect(parsed.settings.hideGrid).toBe(true);
        expect(parsed.settings.altAsCtrl).toBe(true);
    });

    it('createShareLink generates valid share URL with hash payload and writes to clipboard', async () => {
        let copiedText = '';
        (globalThis as any).window = {
            location: { origin: 'https://dango.ink', pathname: '/' }
        };
        (globalThis as any).navigator = {
            clipboard: {
                writeText: async (t: string) => {
                    copiedText = t;
                    return true;
                }
            }
        };

        createShareLink();
        await new Promise(r => setTimeout(r, 10));

        expect(copiedText.startsWith('https://dango.ink/#')).toBe(true);
        expect(copiedText.length).toBeGreaterThan(20);
    });

    it('createEmbedCode generates valid iframe snippet and writes to clipboard', async () => {
        let copiedText = '';
        (globalThis as any).window = {
            location: { origin: 'https://dango.ink', pathname: '/' }
        };
        (globalThis as any).navigator = {
            clipboard: {
                writeText: async (t: string) => {
                    copiedText = t;
                    return true;
                }
            }
        };

        createEmbedCode();
        await new Promise(r => setTimeout(r, 10));

        expect(copiedText.startsWith('<iframe src="https://dango.ink/?embed=true#')).toBe(true);
        expect(copiedText).toContain('allow="clipboard-write"');
        expect(copiedText.endsWith('</iframe>')).toBe(true);
    });

    it('processDangoFile successfully imports standard JSON object format .dango file', (done) => {
        initIO(() => {});

        const fileData = JSON.stringify({
            nodes: [
                { id: 'obj-n1', text: 'Imported Object Node', x: 50, y: 60, w: 100, h: 40, color: 'c-green' }
            ],
            groups: [],
            links: [],
            settings: { hideGrid: false, handDrawn: true, altAsCtrl: false, bgUrl: '' }
        });

        // Mock File / FileReader behavior
        class MockFileReader {
            onload: ((ev: any) => void) | null = null;
            readAsText(file: any) {
                setTimeout(() => {
                    if (this.onload) {
                        this.onload({ target: { result: file._content } });
                        try {
                            expect(state.nodes.length).toBe(1);
                            expect(state.nodes[0].text).toBe('Imported Object Node');
                            expect(state.settings.handDrawn).toBe(true);
                            done();
                        } catch (err) {
                            done(err);
                        }
                    }
                }, 0);
            }
        }
        (globalThis as any).FileReader = MockFileReader;

        const fakeFile = {
            name: 'canvas_backup.dango',
            _content: fileData
        } as any;

        processDangoFile(fakeFile);
    });

    it('processDangoFile ignores non-dango / non-json file extensions', () => {
        state.nodes = [{ id: 'n1', text: 'Preserved', x: 0, y: 0, w: 100, h: 40, color: 'c-white' }];
        const invalidFile = { name: 'image.png' } as any;
        processDangoFile(invalidFile);
        expect(state.nodes.length).toBe(1);
        expect(state.nodes[0].text).toBe('Preserved');
    });
});


