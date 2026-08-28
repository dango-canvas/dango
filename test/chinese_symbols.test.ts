// test/chinese_symbols.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { morphChineseSymbols, normalizeChineseMarkdownPrefix } from '../dango/js/modules/utils.js';
import { state } from '../dango/js/modules/state.js';
import { createNodesFromInput } from '../dango/js/modules/actions.js';

describe('Chinese IME Symbols Instant Morphing & Markdown Normalization', () => {
    describe('morphChineseSymbols: Typing State Instant Morphing', () => {
        it('morphs double pause mark with standard space to comment prefix', () => {
            const res = morphChineseSymbols('、、 hello world');
            expect(res.morphed).toBe(true);
            expect(res.text).toBe('// hello world');
        });

        it('morphs double pause mark even when input starts with zero-width space (\\u200B) in newly created node', () => {
            const res = morphChineseSymbols('\u200B、、 hello world');
            expect(res.morphed).toBe(true);
            expect(res.text).toBe('// hello world');
        });

        it('morphs 【 】 even when input starts with zero-width space (\\u200B) in newly created node', () => {
            const res = morphChineseSymbols('\u200B【 】 todo item');
            expect(res.morphed).toBe(true);
            expect(res.text).toBe('[ ] todo item');
        });

        it('morphs double pause mark with fullwidth space (\\u3000) to comment prefix', () => {
            const res = morphChineseSymbols('、、\u3000hello world');
            expect(res.morphed).toBe(true);
            expect(res.text).toBe('// hello world');
        });

        it('morphs double pause mark with non-breaking space (\\u00A0) to comment prefix', () => {
            const res = morphChineseSymbols('、、\u00A0hello world');
            expect(res.morphed).toBe(true);
            expect(res.text).toBe('// hello world');
        });

        it('does NOT morph double pause mark without following space', () => {
            const res = morphChineseSymbols('、、hello');
            expect(res.morphed).toBe(false);
            expect(res.text).toBe('、、hello');
        });

        it('does NOT morph double pause marks in the middle of a sentence', () => {
            const res = morphChineseSymbols('mid sentence、、 hello');
            expect(res.morphed).toBe(false);
            expect(res.text).toBe('mid sentence、、 hello');
        });

        it('morphs 【 】 (inner space) to [ ] ', () => {
            const res = morphChineseSymbols('【 】 todo item');
            expect(res.morphed).toBe(true);
            expect(res.text).toBe('[ ] todo item');
        });

        it('morphs 【】  (outer space) to [ ] ', () => {
            const res = morphChineseSymbols('【】 todo item');
            expect(res.morphed).toBe(true);
            expect(res.text).toBe('[ ] todo item');
        });

        it('does NOT morph empty 【】 without trailing space', () => {
            const res = morphChineseSymbols('【】');
            expect(res.morphed).toBe(false);
            expect(res.text).toBe('【】');
        });

        it('does NOT morph common Chinese title brackets like 【重要通知】', () => {
            const res = morphChineseSymbols('【重要通知】今天开会');
            expect(res.morphed).toBe(false);
            expect(res.text).toBe('【重要通知】今天开会');
        });

        it('morphs 【x】, 【X】, 【v】, 【✓】 to [x] ', () => {
            expect(morphChineseSymbols('【x】 completed task').text).toBe('[x] completed task');
            expect(morphChineseSymbols('【X】 completed task').text).toBe('[x] completed task');
            expect(morphChineseSymbols('【v】 completed task').text).toBe('[x] completed task');
            expect(morphChineseSymbols('【✓】 completed task').text).toBe('[x] completed task');
        });
    });

    describe('normalizeChineseMarkdownPrefix: Blur & Batch Creation Normalization', () => {
        it('normalizes leading 、、 without space on blur to // ', () => {
            expect(normalizeChineseMarkdownPrefix('、、注释内容')).toBe('// 注释内容');
        });

        it('normalizes 【 】 and 【】 to [ ] ', () => {
            expect(normalizeChineseMarkdownPrefix('【 】待办项目')).toBe('[ ] 待办项目');
            expect(normalizeChineseMarkdownPrefix('【】待办项目')).toBe('[ ] 待办项目');
        });

        it('normalizes 【x】 and 【✓】 to [x] ', () => {
            expect(normalizeChineseMarkdownPrefix('【x】已完成项目')).toBe('[x] 已完成项目');
            expect(normalizeChineseMarkdownPrefix('【✓】已完成项目')).toBe('[x] 已完成项目');
        });

        it('preserves normal markdown prefixes intact', () => {
            expect(normalizeChineseMarkdownPrefix('// 标准注释')).toBe('// 标准注释');
            expect(normalizeChineseMarkdownPrefix('[ ] 标准待办')).toBe('[ ] 标准待办');
            expect(normalizeChineseMarkdownPrefix('[x] 标准完成')).toBe('[x] 标准完成');
            expect(normalizeChineseMarkdownPrefix('# 标题')).toBe('# 标题');
        });
    });

    describe('createNodesFromInput: Batch Input Chinese Symbols Support', () => {
        beforeEach(() => {
            state.nodes = [];
            state.groups = [];
            state.links = [];
        });

        it('automatically normalizes Chinese symbol prefixes when creating nodes in batch', () => {
            createNodesFromInput('、、 架构注释, 【 】 待办节点, 【x】 已完成节点');
            expect(state.nodes.length).toBe(3);
            expect(state.nodes[0].text).toBe('// 架构注释');
            expect(state.nodes[1].text).toBe('[ ] 待办节点');
            expect(state.nodes[2].text).toBe('[x] 已完成节点');
        });
    });
});
