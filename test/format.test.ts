// test/format.test.ts
import { expect, test, describe } from "bun:test";

function applyMarkdownFormatLogic(text: string, selectionStart: number, selectionEnd: number, formatType: 'bold' | 'italic') {
    const before = text.slice(0, selectionStart);
    const selected = text.slice(selectionStart, selectionEnd);
    const after = text.slice(selectionEnd);

    const startOffset = before.length;
    const endOffset = startOffset + selected.length;

    let replaceStartOffset = startOffset;
    let replaceEndOffset = endOffset;
    let replacement = '';
    let newSelectStart = startOffset;
    let newSelectEnd = endOffset;

    if (formatType === 'bold') {
        // 1. 检查选区自身是否已被粗体标记包裹
        if ((selected.startsWith('***') && selected.endsWith('***') && selected.length >= 6) ||
            (selected.startsWith('___') && selected.endsWith('___') && selected.length >= 6)) {
            replacement = selected.slice(2, -2);
            newSelectStart = startOffset;
            newSelectEnd = startOffset + replacement.length;
        } else if ((selected.startsWith('**') && selected.endsWith('**') && selected.length >= 4) ||
                   (selected.startsWith('__') && selected.endsWith('__') && selected.length >= 4)) {
            replacement = selected.slice(2, -2);
            newSelectStart = startOffset;
            newSelectEnd = startOffset + replacement.length;
        }
        // 2. 检查选区两端上下文是否已被粗体标记包裹
        else if ((before.endsWith('***') && after.startsWith('***')) ||
                 (before.endsWith('___') && after.startsWith('___'))) {
            replaceStartOffset = startOffset - 2;
            replaceEndOffset = endOffset + 2;
            replacement = selected;
            newSelectStart = startOffset - 2;
            newSelectEnd = startOffset - 2 + selected.length;
        } else if ((before.endsWith('**') && after.startsWith('**')) ||
                   (before.endsWith('__') && after.startsWith('__'))) {
            replaceStartOffset = startOffset - 2;
            replaceEndOffset = endOffset + 2;
            replacement = selected;
            newSelectStart = startOffset - 2;
            newSelectEnd = startOffset - 2 + selected.length;
        }
        // 3. 执行粗体包裹
        else {
            if (!selected) {
                if (before.endsWith('**') && after.startsWith('**')) {
                    replaceStartOffset = startOffset - 2;
                    replaceEndOffset = endOffset + 2;
                    replacement = '';
                    newSelectStart = startOffset - 2;
                    newSelectEnd = startOffset - 2;
                } else {
                    replacement = '****';
                    newSelectStart = startOffset + 2;
                    newSelectEnd = startOffset + 2;
                }
            } else {
                const match = selected.match(/^(\s*)([\s\S]*?)(\s*)$/);
                const leadSpace = match ? match[1] : '';
                const coreText = match ? match[2] : selected;
                const trailSpace = match ? match[3] : '';

                if (!coreText) {
                    replacement = leadSpace + '****' + trailSpace;
                    newSelectStart = startOffset + leadSpace.length + 2;
                    newSelectEnd = startOffset + leadSpace.length + 2;
                } else {
                    replacement = leadSpace + '**' + coreText + '**' + trailSpace;
                    newSelectStart = startOffset + leadSpace.length + 2;
                    newSelectEnd = startOffset + leadSpace.length + 2 + coreText.length;
                }
            }
        }
    } else if (formatType === 'italic') {
        // 1. 检查选区自身是否已被斜体标记包裹
        if ((selected.startsWith('***') && selected.endsWith('***') && selected.length >= 6) ||
            (selected.startsWith('___') && selected.endsWith('___') && selected.length >= 6)) {
            replacement = selected.slice(1, -1);
            newSelectStart = startOffset;
            newSelectEnd = startOffset + replacement.length;
        } else if ((selected.startsWith('*') && selected.endsWith('*') && selected.length >= 2 && !(selected.startsWith('**') && selected.endsWith('**'))) ||
                   (selected.startsWith('_') && selected.endsWith('_') && selected.length >= 2 && !(selected.startsWith('__') && selected.endsWith('__')))) {
            replacement = selected.slice(1, -1);
            newSelectStart = startOffset;
            newSelectEnd = startOffset + replacement.length;
        }
        // 2. 检查选区两端上下文是否已被斜体标记包裹
        else if ((before.endsWith('***') && after.startsWith('***')) ||
                 (before.endsWith('___') && after.startsWith('___'))) {
            replaceStartOffset = startOffset - 1;
            replaceEndOffset = endOffset + 1;
            replacement = selected;
            newSelectStart = startOffset - 1;
            newSelectEnd = startOffset - 1 + selected.length;
        } else if ((before.endsWith('*') && !before.endsWith('**') && after.startsWith('*') && !after.startsWith('**')) ||
                   (before.endsWith('_') && !before.endsWith('__') && after.startsWith('_') && !after.startsWith('__'))) {
            replaceStartOffset = startOffset - 1;
            replaceEndOffset = endOffset + 1;
            replacement = selected;
            newSelectStart = startOffset - 1;
            newSelectEnd = startOffset - 1 + selected.length;
        }
        // 3. 执行斜体包裹
        else {
            if (!selected) {
                if (before.endsWith('*') && !before.endsWith('**') && after.startsWith('*') && !after.startsWith('**')) {
                    replaceStartOffset = startOffset - 1;
                    replaceEndOffset = endOffset + 1;
                    replacement = '';
                    newSelectStart = startOffset - 1;
                    newSelectEnd = startOffset - 1;
                } else {
                    replacement = '**';
                    newSelectStart = startOffset + 1;
                    newSelectEnd = startOffset + 1;
                }
            } else {
                const match = selected.match(/^(\s*)([\s\S]*?)(\s*)$/);
                const leadSpace = match ? match[1] : '';
                const coreText = match ? match[2] : selected;
                const trailSpace = match ? match[3] : '';

                if (!coreText) {
                    replacement = leadSpace + '**' + trailSpace;
                    newSelectStart = startOffset + leadSpace.length + 1;
                    newSelectEnd = startOffset + leadSpace.length + 1;
                } else {
                    replacement = leadSpace + '*' + coreText + '*' + trailSpace;
                    newSelectStart = startOffset + leadSpace.length + 1;
                    newSelectEnd = startOffset + leadSpace.length + 1 + coreText.length;
                }
            }
        }
    }

    const newText = text.slice(0, replaceStartOffset) + replacement + text.slice(replaceEndOffset);
    return {
        text: newText,
        selectStart: newSelectStart,
        selectEnd: newSelectEnd,
        selectedText: newText.slice(newSelectStart, newSelectEnd)
    };
}

describe("Markdown Selection Shortcuts", () => {
    test("Wrap plain text in bold", () => {
        const res = applyMarkdownFormatLogic("hello world", 6, 11, 'bold');
        expect(res.text).toBe("hello **world**");
        expect(res.selectedText).toBe("world");
    });

    test("Strip bold when selection contains **world**", () => {
        const res = applyMarkdownFormatLogic("hello **world**", 6, 15, 'bold');
        expect(res.text).toBe("hello world");
        expect(res.selectedText).toBe("world");
    });

    test("Strip bold when selection is inside **world**", () => {
        const res = applyMarkdownFormatLogic("hello **world**", 8, 13, 'bold');
        expect(res.text).toBe("hello world");
        expect(res.selectedText).toBe("world");
    });

    test("Wrap plain text in italic", () => {
        const res = applyMarkdownFormatLogic("hello world", 6, 11, 'italic');
        expect(res.text).toBe("hello *world*");
        expect(res.selectedText).toBe("world");
    });

    test("Strip italic when selection contains *world*", () => {
        const res = applyMarkdownFormatLogic("hello *world*", 6, 13, 'italic');
        expect(res.text).toBe("hello world");
        expect(res.selectedText).toBe("world");
    });

    test("Strip italic when selection is inside *world*", () => {
        const res = applyMarkdownFormatLogic("hello *world*", 7, 12, 'italic');
        expect(res.text).toBe("hello world");
        expect(res.selectedText).toBe("world");
    });

    test("Combined bold and italic: bold first then italic", () => {
        const res1 = applyMarkdownFormatLogic("hello world", 6, 11, 'bold');
        expect(res1.text).toBe("hello **world**");
        expect(res1.selectStart).toBe(8);
        expect(res1.selectEnd).toBe(13);

        const res2 = applyMarkdownFormatLogic(res1.text, res1.selectStart, res1.selectEnd, 'italic');
        expect(res2.text).toBe("hello ***world***");
        expect(res2.selectedText).toBe("world");
    });

    test("Combined bold and italic: strip bold from ***world***", () => {
        const res = applyMarkdownFormatLogic("hello ***world***", 9, 14, 'bold');
        expect(res.text).toBe("hello *world*");
        expect(res.selectedText).toBe("world");
    });

    test("Combined bold and italic: strip italic from ***world***", () => {
        const res = applyMarkdownFormatLogic("hello ***world***", 9, 14, 'italic');
        expect(res.text).toBe("hello **world**");
        expect(res.selectedText).toBe("world");
    });

    test("Whitespace trimming on selection", () => {
        const res = applyMarkdownFormatLogic("hello   world  !", 6, 15, 'bold');
        expect(res.text).toBe("hello   **world**  !");
        expect(res.selectedText).toBe("world");
    });

    test("Collapsed cursor in empty space", () => {
        const res = applyMarkdownFormatLogic("hello world", 6, 6, 'bold');
        expect(res.text).toBe("hello ****world");
        expect(res.selectStart).toBe(8);
        expect(res.selectEnd).toBe(8);
    });

    test("Collapsed cursor inside **|** toggles back", () => {
        const res = applyMarkdownFormatLogic("hello ****world", 8, 8, 'bold');
        expect(res.text).toBe("hello world");
        expect(res.selectStart).toBe(6);
        expect(res.selectEnd).toBe(6);
    });

    test("Collapsed cursor inside *|* toggles back", () => {
        const res = applyMarkdownFormatLogic("hello **world", 7, 7, 'italic');
        expect(res.text).toBe("hello world");
        expect(res.selectStart).toBe(6);
        expect(res.selectEnd).toBe(6);
    });

    test("Underscore bold/italic strip support", () => {
        const res1 = applyMarkdownFormatLogic("hello __world__", 8, 13, 'bold');
        expect(res1.text).toBe("hello world");

        const res2 = applyMarkdownFormatLogic("hello _world_", 7, 12, 'italic');
        expect(res2.text).toBe("hello world");
    });
});
