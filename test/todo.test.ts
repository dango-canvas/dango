// test/todo.test.ts
import { describe, it, expect } from 'bun:test';
import { parseMarkdown } from '../dango/js/modules/render.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('TODO Node Layout & Vector Checkbox Specification', () => {
    it('parseMarkdown: renders unchecked todo with vector checkbox and data attributes', () => {
        const html = parseMarkdown('[ ] 待办事项');
        expect(html).toContain('class="todo-item "');
        expect(html).toContain('data-checked="false"');
        expect(html).toContain('class="todo-checkbox-wrapper"');
        expect(html).toContain('class="todo-custom-checkbox"');
        expect(html).toContain('<svg viewBox="0 0 10 10">');
        expect(html).toContain('<label>待办事项</label>');
    });

    it('parseMarkdown: renders checked todo with checked class and checkmark path', () => {
        const html = parseMarkdown('[x] 已完成');
        expect(html).toContain('class="todo-item checked"');
        expect(html).toContain('data-checked="true"');
        expect(html).toContain('<label>已完成</label>');
    });

    it('parseMarkdown: formats inline markdown (bold, italic, link) inside todo label', () => {
        const html = parseMarkdown('[ ] 核心 **重点** 和 [官网](https://dango.ink)');
        expect(html).toContain('<strong>重点</strong>');
        expect(html).toContain('<a href="https://dango.ink/" target="_blank" rel="noopener noreferrer" class="node-inline-link">官网</a>');
    });

    it('parseMarkdown: preserves multiline todo list cleanly', () => {
        const html = parseMarkdown('[ ] 任务一\n[x] 任务二\n普通文本');
        const parts = html.split('<br>');
        expect(parts.length).toBe(3);
        expect(parts[0]).toContain('任务一');
        expect(parts[0]).toContain('data-checked="false"');
        expect(parts[1]).toContain('任务二');
        expect(parts[1]).toContain('data-checked="true"');
        expect(parts[2]).toBe('普通文本');
    });

    it('CSS: .node.has-todo uses balanced 12px 16px padding and .todo-item uses grid hanging indent', () => {
        const cssContent = readFileSync(resolve(__dirname, '../dango/css/partials/_canvas.css'), 'utf-8');
        // Balanced padding matching normal node height (12px top/bottom)
        expect(cssContent).toMatch(/\.node\.has-todo[^{]*\{[^}]*padding:\s*12px\s+16px;/);
        // Grid two-column layout for hanging indent with top-aligned line box
        expect(cssContent).toMatch(/\.node\s+\.todo-item\s*\{[^}]*display:\s*inline-grid;/);
        expect(cssContent).toMatch(/\.node\s+\.todo-item\s*\{[^}]*grid-template-columns:\s*16px\s+1fr;/);
        expect(cssContent).toMatch(/\.node\s+\.todo-item\s*\{[^}]*column-gap:\s*8px;/);
        expect(cssContent).toMatch(/\.node\s+\.todo-item\s*\{[^}]*align-items:\s*start;/);
        expect(cssContent).toMatch(/\.node\s+\.todo-checkbox-wrapper\s*\{[^}]*height:\s*20px;/);
    });
});
