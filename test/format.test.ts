// test/format.test.ts
import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { applyMarkdownFormat } from "../dango/js/modules/interactions.js";

class MockTextNode {
    nodeType = 3;
    nodeValue: string;
    parentNode: any = null;
    constructor(val: string) {
        this.nodeValue = val;
    }
    get length() {
        return this.nodeValue.length;
    }
}

class MockDOMElement {
    nodeType = 1;
    tagName = 'DIV';
    innerText: string;
    attributes: Record<string, string> = {};
    childNodes: MockTextNode[] = [];

    constructor(text: string) {
        this.innerText = text;
        this.attributes['contenteditable'] = 'true';
        this.updateChildNodes();
    }

    updateChildNodes() {
        const t = new MockTextNode(this.innerText);
        t.parentNode = this;
        this.childNodes = [t];
    }

    getAttribute(name: string) {
        return this.attributes[name] || null;
    }

    setAttribute(name: string, val: string) {
        this.attributes[name] = val;
    }

    contains(container: any) {
        return container === this || this.childNodes.includes(container);
    }

    dispatchEvent(ev: any) {}
}

describe("Markdown Selection Shortcuts (Real applyMarkdownFormat)", () => {
    let currentSelection: any = null;
    let nodeEl: MockDOMElement;
    const origDocument = (globalThis as any).document;
    const origWindow = (globalThis as any).window;
    const origNodeFilter = (globalThis as any).NodeFilter;

    beforeEach(() => {
        (globalThis as any).NodeFilter = { SHOW_TEXT: 4 };

        (globalThis as any).document = {
            createTreeWalker: (root: any) => {
                let index = -1;
                return {
                    nextNode: () => {
                        index++;
                        return root.childNodes[index] || null;
                    }
                };
            },
            createRange: () => {
                let startNode: any = null;
                let startOffset = 0;
                let endNode: any = null;
                let endOffset = 0;
                let contentsNode: any = null;

                return {
                    selectNodeContents: (n: any) => { contentsNode = n; },
                    setStart: (n: any, off: number) => { startNode = n; startOffset = off; },
                    setEnd: (n: any, off: number) => { endNode = n; endOffset = off; },
                    collapse: () => {},
                    toString: function() {
                        const full = (contentsNode ? contentsNode.innerText : '') || (startNode ? startNode.nodeValue : '');
                        if (contentsNode && endNode) {
                            return full.slice(0, endOffset);
                        }
                        if (contentsNode && startNode) {
                            return full.slice(startOffset);
                        }
                        if (startNode && endNode && startNode === endNode) {
                            return startNode.nodeValue.slice(startOffset, endOffset);
                        }
                        return '';
                    }
                };
            },
            execCommand: () => false // fallback to direct innerText replacement
        };

        (globalThis as any).window = {
            getSelection: () => currentSelection
        };
    });

    afterEach(() => {
        (globalThis as any).document = origDocument;
        (globalThis as any).window = origWindow;
        (globalThis as any).NodeFilter = origNodeFilter;
    });

    function setSelection(el: MockDOMElement, start: number, end: number) {
        el.updateChildNodes();
        const textNode = el.childNodes[0];
        const range = {
            commonAncestorContainer: el,
            startContainer: textNode,
            startOffset: start,
            endContainer: textNode,
            endOffset: end,
            toString: () => textNode.nodeValue.slice(start, end)
        };
        currentSelection = {
            rangeCount: 1,
            getRangeAt: (i: number) => range,
            removeAllRanges: () => {},
            addRange: (r: any) => {}
        };
    }

    test("Wrap plain text in bold", () => {
        nodeEl = new MockDOMElement("hello world");
        setSelection(nodeEl, 6, 11);
        applyMarkdownFormat(nodeEl as any, 'bold');
        expect(nodeEl.innerText).toBe("hello **world**");
    });

    test("Strip bold when selection contains **world**", () => {
        nodeEl = new MockDOMElement("hello **world**");
        setSelection(nodeEl, 6, 15);
        applyMarkdownFormat(nodeEl as any, 'bold');
        expect(nodeEl.innerText).toBe("hello world");
    });

    test("Strip bold when selection is inside **world**", () => {
        nodeEl = new MockDOMElement("hello **world**");
        setSelection(nodeEl, 8, 13);
        applyMarkdownFormat(nodeEl as any, 'bold');
        expect(nodeEl.innerText).toBe("hello world");
    });

    test("Wrap plain text in italic", () => {
        nodeEl = new MockDOMElement("hello world");
        setSelection(nodeEl, 6, 11);
        applyMarkdownFormat(nodeEl as any, 'italic');
        expect(nodeEl.innerText).toBe("hello *world*");
    });

    test("Strip italic when selection contains *world*", () => {
        nodeEl = new MockDOMElement("hello *world*");
        setSelection(nodeEl, 6, 13);
        applyMarkdownFormat(nodeEl as any, 'italic');
        expect(nodeEl.innerText).toBe("hello world");
    });

    test("Strip italic when selection is inside *world*", () => {
        nodeEl = new MockDOMElement("hello *world*");
        setSelection(nodeEl, 7, 12);
        applyMarkdownFormat(nodeEl as any, 'italic');
        expect(nodeEl.innerText).toBe("hello world");
    });

    test("Combined bold and italic: bold first then italic", () => {
        nodeEl = new MockDOMElement("hello world");
        setSelection(nodeEl, 6, 11);
        applyMarkdownFormat(nodeEl as any, 'bold');
        expect(nodeEl.innerText).toBe("hello **world**");

        setSelection(nodeEl, 8, 13);
        applyMarkdownFormat(nodeEl as any, 'italic');
        expect(nodeEl.innerText).toBe("hello ***world***");
    });

    test("Combined bold and italic: strip bold from ***world***", () => {
        nodeEl = new MockDOMElement("hello ***world***");
        setSelection(nodeEl, 9, 14);
        applyMarkdownFormat(nodeEl as any, 'bold');
        expect(nodeEl.innerText).toBe("hello *world*");
    });

    test("Combined bold and italic: strip italic from ***world***", () => {
        nodeEl = new MockDOMElement("hello ***world***");
        setSelection(nodeEl, 9, 14);
        applyMarkdownFormat(nodeEl as any, 'italic');
        expect(nodeEl.innerText).toBe("hello **world**");
    });

    test("Whitespace trimming on selection", () => {
        nodeEl = new MockDOMElement("hello   world  !");
        setSelection(nodeEl, 6, 15);
        applyMarkdownFormat(nodeEl as any, 'bold');
        expect(nodeEl.innerText).toBe("hello   **world**  !");
    });

    test("Collapsed cursor in empty space", () => {
        nodeEl = new MockDOMElement("hello world");
        setSelection(nodeEl, 6, 6);
        applyMarkdownFormat(nodeEl as any, 'bold');
        expect(nodeEl.innerText).toBe("hello ****world");
    });

    test("Collapsed cursor inside **|** toggles back", () => {
        nodeEl = new MockDOMElement("hello ****world");
        setSelection(nodeEl, 8, 8);
        applyMarkdownFormat(nodeEl as any, 'bold');
        expect(nodeEl.innerText).toBe("hello world");
    });

    test("Collapsed cursor inside *|* toggles back", () => {
        nodeEl = new MockDOMElement("hello **world");
        setSelection(nodeEl, 7, 7);
        applyMarkdownFormat(nodeEl as any, 'italic');
        expect(nodeEl.innerText).toBe("hello world");
    });

    test("Underscore bold/italic strip support", () => {
        nodeEl = new MockDOMElement("hello __world__");
        setSelection(nodeEl, 8, 13);
        applyMarkdownFormat(nodeEl as any, 'bold');
        expect(nodeEl.innerText).toBe("hello world");

        nodeEl = new MockDOMElement("hello _world_");
        setSelection(nodeEl, 7, 12);
        applyMarkdownFormat(nodeEl as any, 'italic');
        expect(nodeEl.innerText).toBe("hello world");
    });
});
