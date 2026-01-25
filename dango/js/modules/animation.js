// --- START: CREATE NEW FILE modules/animation.js ---
import { state } from './state.js';
import { render } from './render.js';
import { pushHistory, saveData } from './state.js';

let nodeAnimationId = null;

/**
 * 将指定 ID 的节点们以动画形式移动到目标位置
 * @param {Array<{id: string, x: number, y: number}>} targets - 目标节点信息
 * @param {number} duration - 动画时长 (ms)
 */
export function animateNodesTo(targets, duration = 300) {
    if (nodeAnimationId) cancelAnimationFrame(nodeAnimationId);
    
    const startTime = performance.now();
    const startPositions = new Map();
    
    targets.forEach(({ id }) => {
        const node = state.nodes.find(n => n.id === id);
        if (node) {
            startPositions.set(id, { x: node.x, y: node.y });
        }
    });

    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3); // OutCubic

        targets.forEach(({ id, x, y }) => {
            const node = state.nodes.find(n => n.id === id);
            const start = startPositions.get(id);
            if (node && start) {
                node.x = start.x + (x - start.x) * ease;
                node.y = start.y + (y - start.y) * ease;
            }
        });

        render();

        if (progress < 1) {
            nodeAnimationId = requestAnimationFrame(step);
        } else {
            nodeAnimationId = null;
            saveData();
        }
    }
    nodeAnimationId = requestAnimationFrame(step);
}

/**
 * 智能对齐选中的节点
 */
export function smartAlignSelection() {
    const selectedNodes = state.nodes.filter(n => state.selection.has(n.id));
    if (selectedNodes.length < 2) return;

    pushHistory();

    // 1. 获取基础信息与中心点
    const nodes = selectedNodes.map(n => ({
        ...n,
        cx: n.x + (n.w || 80) / 2,
        cy: n.y + (n.h || 40) / 2
    }));

    // 计算当前选中组的包围盒
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + (n.w || 80));
        maxY = Math.max(maxY, n.y + (n.h || 40));
    });
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    /**
     * 聚类函数：将相近的坐标点归为一类，并返回各类的中心值
     */
    const cluster = (values, threshold) => {
        if (values.length === 0) return [];
        const sorted = [...new Set(values)].sort((a, b) => a - b);
        const clusters = [[sorted[0]]];
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] - sorted[i - 1] < threshold) {
                clusters[clusters.length - 1].push(sorted[i]);
            } else {
                clusters.push([sorted[i]]);
            }
        }
        return clusters.map(c => c.reduce((a, b) => a + b) / c.length);
    };

    // 动态阈值：基于节点的平均尺寸，用于识别行和列
    const avgW = nodes.reduce((sum, n) => sum + (n.w || 80), 0) / nodes.length;
    const avgH = nodes.reduce((sum, n) => sum + (n.h || 40), 0) / nodes.length;
    
    const rowCenters = cluster(nodes.map(n => n.cy), avgH * 0.6);
    const colCenters = cluster(nodes.map(n => n.cx), avgW * 0.6);

    const targets = [];
    
    // 3. 识别布局趋势并执行对齐
    const isGrid = rowCenters.length > 1 && colCenters.length > 1 && nodes.length >= 3;
    const isHorizontal = !isGrid && (
        (rowCenters.length < colCenters.length) || 
        (rowCenters.length === colCenters.length && (maxX - minX) > (maxY - minY))
    );

    if (isGrid) {
        // --- 网格布局模式 ---
        // 识别每个节点所属的行索引和列索引
        nodes.forEach(n => {
            n.rIdx = rowCenters.findIndex(c => Math.abs(n.cy - c) < avgH * 0.7);
            n.cIdx = colCenters.findIndex(c => Math.abs(n.cx - c) < avgW * 0.7);
        });

        // 计算每列的最大宽度和每行的最大高度，以保证不重叠
        const colWidths = new Array(colCenters.length).fill(0);
        const rowHeights = new Array(rowCenters.length).fill(0);
        nodes.forEach(n => {
            if (n.cIdx !== -1) colWidths[n.cIdx] = Math.max(colWidths[n.cIdx], n.w || 80);
            if (n.rIdx !== -1) rowHeights[n.rIdx] = Math.max(rowHeights[n.rIdx], n.h || 40);
        });

        // 计算网格间距：优先保持原有的分布范围，但设定合理的最小间距
        const gridGapX = colCenters.length > 1 ? 
            Math.max(40, (maxX - minX - colWidths.reduce((a, b) => a + b, 0)) / (colCenters.length - 1)) : 40;
        const gridGapY = rowCenters.length > 1 ? 
            Math.max(20, (maxY - minY - rowHeights.reduce((a, b) => a + b, 0)) / (rowCenters.length - 1)) : 20;

        // 计算各行各列的中心位置，以保持整体中心不变
        const colX = new Array(colCenters.length).fill(0);
        const rowY = new Array(rowCenters.length).fill(0);
        
        let totalW = colWidths.reduce((a, b) => a + b, 0) + gridGapX * (colCenters.length - 1);
        let totalH = rowHeights.reduce((a, b) => a + b, 0) + gridGapY * (rowCenters.length - 1);
        
        let currentX = centerX - totalW / 2;
        for (let i = 0; i < colCenters.length; i++) {
            colX[i] = currentX + colWidths[i] / 2;
            currentX += colWidths[i] + gridGapX;
        }
        let currentY = centerY - totalH / 2;
        for (let i = 0; i < rowCenters.length; i++) {
            rowY[i] = currentY + rowHeights[i] / 2;
            currentY += rowHeights[i] + gridGapY;
        }

        nodes.forEach(n => {
            if (n.rIdx !== -1 && n.cIdx !== -1) {
                targets.push({
                    id: n.id,
                    x: colX[n.cIdx] - (n.w || 80) / 2,
                    y: rowY[n.rIdx] - (n.h || 40) / 2
                });
            }
        });

    } else if (isHorizontal) {
        // --- 横向布局模式 ---
        const sortedNodes = [...nodes].sort((a, b) => a.cx - b.cx);
        const totalW = nodes.reduce((sum, n) => sum + (n.w || 80), 0);
        const gap = nodes.length > 1 ? Math.max(40, (maxX - minX - totalW) / (nodes.length - 1)) : 40;
        
        const fullW = totalW + gap * (nodes.length - 1);
        let curX = centerX - fullW / 2;
        
        sortedNodes.forEach(n => {
            targets.push({
                id: n.id,
                x: curX,
                y: centerY - (n.h || 40) / 2
            });
            curX += (n.w || 80) + gap;
        });

    } else {
        // --- 竖向布局模式 ---
        const sortedNodes = [...nodes].sort((a, b) => a.cy - b.cy);
        const totalH = nodes.reduce((sum, n) => sum + (n.h || 40), 0);
        const gap = nodes.length > 1 ? Math.max(20, (maxY - minY - totalH) / (nodes.length - 1)) : 20;
        
        const fullH = totalH + gap * (nodes.length - 1);
        let curY = centerY - fullH / 2;
        
        sortedNodes.forEach(n => {
            targets.push({
                id: n.id,
                x: centerX - (n.w || 80) / 2,
                y: curY
            });
            curY += (n.h || 40) + gap;
        });
    }

    // 4. 执行平滑动画
    animateNodesTo(targets);
}
// --- END: CREATE NEW FILE modules/animation.js ---