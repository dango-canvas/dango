// utils.ts
import type { CanvasView } from './types.js';

/**
 * 生成一个唯一的 ID。
 */
export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).substring(2);

/**
 * 检查字符串是否为 URL。
 */
export function isUrl(str: string): boolean {
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
    if (typeof document === 'undefined') return;
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
