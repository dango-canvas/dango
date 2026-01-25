// utils.js

/**
 * 生成一个唯一的 ID。
 * @returns {string}
 */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

/**
 * 检查字符串是否为 URL。
 * @param {string} str
 * @returns {boolean}
 */
export function isUrl(str) {
    return /^(https?:\/\/|www\.)\S+$/i.test(str.trim());
}

/**
 * 将屏幕坐标转换为世界（画布）坐标。
 * @param {number} sx - 屏幕 X 坐标
 * @param {number} sy - 屏幕 Y 坐标
 * @param {object} view - 视图状态 { x, y, scale }
 * @returns {{x: number, y: number}}
 */
export function screenToWorld(sx, sy, view) {
    return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale };
}

/**
 * 获取节点的中心点坐标。
 * @param {object} n - 节点对象
 * @returns {{x: number, y: number}}
 */
export function getNodeCenter(n) {
    return { x: n.x + (n.w || 0) / 2, y: n.y + (n.h || 0) / 2 };
}

/**
 * 计算从源节点到目标节点边界的交点。
 * @param {object} sourceNode
 * @param {object} targetNode
 * @returns {{x: number, y: number}}
 */
export function getEdgeIntersection(sourceNode, targetNode) {
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

    let endX, endY;

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
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function getStandardRect(x1, y1, x2, y2) {
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x1 - x2), h: Math.abs(y1 - y2) };
}

/**
 * 检查两个矩形是否相交。
 * @param {object} r1
 * @param {object} r2
 * @returns {boolean}
 */
export function isIntersect(r1, r2) {
    const r2w = r2.w || 60;
    const r2h = r2.h || 40;
    return !(r2.x > r1.x + r1.w || r2.x + r2w < r1.x || r2.y > r1.y + r1.h || r2.y + r2h < r1.y);
}

/**
 * 获取当前时间戳字符串，用于文件名。
 * @returns {string}
 */
export function getTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

/**
 * 触发浏览器下载 Blob 内容。
 * @param {string|Blob} content
 * @param {string} filename
 * @param {string} contentType
 */
export function downloadBlob(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
