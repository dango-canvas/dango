// utils.ts
import type { CanvasView } from './types.js';

/**
 * 生成一个唯一的 ID。
 */
export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).substring(2);

/**
 * 检查字符串是否为 URL。
 */
export function isUrl(str?: string): boolean {
    if (!str) return false;
    return /^(https?:\/\/|www\.)\S+$/i.test(str.trim());
}

/**
 * 将屏幕坐标转换为世界（画布）坐标。
 */
export function screenToWorld(sx: number, sy: number, view: CanvasView): { x: number; y: number } {
    return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale };
}

/**
 * 获取节点的中心点坐标。
 */
export function getNodeCenter(n: { x: number; y: number; w?: number; h?: number }): { x: number; y: number } {
    return { x: n.x + (n.w || 0) / 2, y: n.y + (n.h || 0) / 2 };
}

/**
 * 计算从源节点到目标节点边界的交点。
 */
export function getEdgeIntersection(
    sourceNode: { x: number; y: number; w: number; h: number },
    targetNode: { x: number; y: number; w: number; h: number }
): { x: number; y: number } {
    const sx = sourceNode.x + sourceNode.w / 2;
    const sy = sourceNode.y + sourceNode.h / 2;
    const tx = targetNode.x + targetNode.w / 2;
    const ty = targetNode.y + targetNode.h / 2;

    const dx = tx - sx;
    const dy = ty - sy;

    const w = targetNode.w / 2;
    const h = targetNode.h / 2;

    if (dx === 0 && dy === 0) return { x: tx, y: ty };

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    let endX: number, endY: number;

    if (absDy * w < absDx * h) {
        endX = tx + (dx > 0 ? -w : w);
        endY = ty + (dx > 0 ? -w : w) * (dy / dx);
    } else {
        endY = ty + (dy > 0 ? -h : h);
        endX = tx + (dy > 0 ? -h : h) * (dx / dy);
    }

    return { x: endX, y: endY };
}

/**
 * 确保矩形坐标是从左上到右下。
 */
export function getStandardRect(x1: number, y1: number, x2: number, y2: number): { x: number; y: number; w: number; h: number } {
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x1 - x2), h: Math.abs(y1 - y2) };
}

/**
 * 检查两个矩形是否相交。
 */
export function isIntersect(
    r1: { x: number; y: number; w: number; h: number },
    r2: { x: number; y: number; w?: number; h?: number }
): boolean {
    const r2w = r2.w || 60;
    const r2h = r2.h || 40;
    return !(r2.x > r1.x + r1.w || r2.x + r2w < r1.x || r2.y > r1.y + r1.h || r2.y + r2h < r1.y);
}

/**
 * 获取当前时间戳字符串，用于文件名。
 */
export function getTimestamp(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

/**
 * 触发浏览器下载 Blob 内容。
 */
export function downloadBlob(content: BlobPart, filename: string, contentType: string): void {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    try {
        const blob = new Blob([content], { type: contentType });
        const url = (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') ? URL.createObjectURL(blob) : '';
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        if (typeof a.click === 'function') {
            a.click();
        }
        if (url && typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(url);
        }
    } catch {}
}

/**
 * 健壮的剪贴板复制工具，支持现代 Clipboard API 与沙盒/非安全上下文 execCommand fallback。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // 降级到 execCommand
        }
    }
    if (typeof document !== 'undefined' && typeof document.createElement === 'function' && document.body) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '-9999px';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (successful) return true;
        } catch {}
    }
    return false;
}

/**
 * 安全地从 DOM 树中移除元素，兼容无头测试环境与旧版 DOM 树。
 */
export function safeRemoveElement(el?: HTMLElement | SVGElement | Element | null): void {
    if (!el) return;
    if (typeof (el as any).remove === 'function') {
        (el as any).remove();
    } else if (el.parentNode) {
        el.parentNode.removeChild(el);
    }
}

/**
 * 针对行首中文输入法符号执行即时安全变形（如 '、、 ' -> '// '，'【 】' -> '[ ] '）
 */
export function morphChineseSymbols(rawText: string): { text: string; morphed: boolean } {
    let text = rawText.replace(/[\u200B\uFEFF]/g, '');
    let morphed = false;

    // 1. 行首连续顿号 + 空白（半角、全角 \u3000、不间断空格 \u00A0） -> 注释 '// '
    const commentMatch = text.match(/^、、[\s\u00A0\u3000]+/);
    if (commentMatch) {
        text = '// ' + text.slice(commentMatch[0].length);
        morphed = true;
    } else {
        // 2. 黑括号待办严格模式判定
        const todoInnerSpaceMatch = text.match(/^【[\s\u00A0\u3000]+】[\s\u00A0\u3000]*/);
        const todoOuterSpaceMatch = text.match(/^【】[\s\u00A0\u3000]+/);
        const todoCheckedMatch = text.match(/^【([xXvV✓])】[\s\u00A0\u3000]*/);

        if (todoInnerSpaceMatch) {
            text = '[ ] ' + text.slice(todoInnerSpaceMatch[0].length);
            morphed = true;
        } else if (todoOuterSpaceMatch) {
            text = '[ ] ' + text.slice(todoOuterSpaceMatch[0].length);
            morphed = true;
        } else if (todoCheckedMatch) {
            text = '[x] ' + text.slice(todoCheckedMatch[0].length);
            morphed = true;
        }
    }

    return { text, morphed };
}

/**
 * 规范化中文 Markdown 前缀（用于失焦兜底与批量创建节点）
 */
export function normalizeChineseMarkdownPrefix(rawText: string): string {
    let text = rawText.replace(/[\u200B\uFEFF]/g, '');
    if (text.startsWith('、、')) {
        text = '// ' + text.slice(2).replace(/^[\s\u00A0\u3000]+/, '');
    } else if (text.match(/^【[\s\u00A0\u3000]*】/)) {
        text = '[ ] ' + text.replace(/^【[\s\u00A0\u3000]*】[\s\u00A0\u3000]*/, '');
    } else if (text.match(/^【([xXvV✓])】/)) {
        text = '[x] ' + text.replace(/^【([xXvV✓])】[\s\u00A0\u3000]*/, '');
    } else if (text.match(/^\[([ xX])\](?!\s)/)) {
        text = text.replace(/^\[([ xX])\]/, '[$1] ');
    }
    return text;
}

