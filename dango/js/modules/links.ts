// modules/links.ts
import { uid } from './utils.js';
import type { CanvasLink, LinkStrokeStyle, LinkDirection, CanvasNode } from './types.js';

export const DEFAULT_LINK_STROKE_STYLE: LinkStrokeStyle = 'solid';
export const LINK_STROKE_STYLE_ORDER: LinkStrokeStyle[] = ['solid', 'dashed', 'wavy'];
export const LINK_STROKE_STYLE_TO_CODE: Record<LinkStrokeStyle, number> = { solid: 0, dashed: 1, wavy: 2 };
export const LINK_STROKE_STYLE_FROM_CODE: LinkStrokeStyle[] = ['solid', 'dashed', 'wavy'];

const DIRECTIONAL_LINK_TINT_RATIO = 0.46;
const COLOR_PARSE_CACHE = new Map<string, { r: number; g: number; b: number } | null>();
const ARCH_OFFSET_MAX = 28; // 最大拱起高度
const ARCH_DY_SCALE = 32;   // 偏移敏感度平滑常数（更灵敏平滑）
const DISTANCE_DAMPING_MIN = 14;
const DISTANCE_DAMPING_MAX = 56;

export function getLinkStrokeStyle(link?: { strokeStyle?: LinkStrokeStyle } | null): LinkStrokeStyle {
    return link?.strokeStyle || DEFAULT_LINK_STROKE_STYLE;
}

export function cycleLinkStrokeStyle(link?: CanvasLink | null): LinkStrokeStyle {
    if (!link) return DEFAULT_LINK_STROKE_STYLE;
    const current = getLinkStrokeStyle(link);
    const currentIndex = LINK_STROKE_STYLE_ORDER.indexOf(current);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextStyle = LINK_STROKE_STYLE_ORDER[(safeIndex + 1) % LINK_STROKE_STYLE_ORDER.length];
    link.strokeStyle = nextStyle;
    return nextStyle;
}

export function createLink({
    id = uid(),
    sourceId,
    targetId,
    direction = 'none',
    strokeStyle = DEFAULT_LINK_STROKE_STYLE
}: {
    id?: string;
    sourceId: string;
    targetId: string;
    direction?: LinkDirection;
    strokeStyle?: LinkStrokeStyle;
}): CanvasLink {
    return { id, sourceId, targetId, direction, strokeStyle };
}

export function packLinkStrokeStyle(strokeStyle?: LinkStrokeStyle): number {
    return LINK_STROKE_STYLE_TO_CODE[getLinkStrokeStyle({ strokeStyle })] ?? 0;
}

export function unpackLinkStrokeStyle(code?: number): LinkStrokeStyle {
    return (code !== undefined ? LINK_STROKE_STYLE_FROM_CODE[code] : undefined) || DEFAULT_LINK_STROKE_STYLE;
}

export function buildStraightLinkPath(startPoint: { x: number; y: number }, endPoint: { x: number; y: number }): string {
    return `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y}`;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

export function buildAutoCurveLinkPath(startPoint: { x: number; y: number }, endPoint: { x: number; y: number }): string {
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const distance = Math.hypot(dx, dy);

    if (distance < 4) {
        return buildStraightLinkPath(startPoint, endPoint);
    }

    // 距离阻尼：过近时平滑收敛为直线
    const distanceDamping = smoothstep(DISTANCE_DAMPING_MIN, DISTANCE_DAMPING_MAX, distance);
    const sum = absDx + absDy;
    if (sum < 1e-4 || distanceDamping < 1e-4) {
        return buildStraightLinkPath(startPoint, endPoint);
    }

    const midX = (startPoint.x + endPoint.x) / 2;
    const midY = (startPoint.y + endPoint.y) / 2;

    // 连续软饱和拱起高度：tanh(offset / scale) 保证在 0 附近连续可导，无任何跳变
    // 动态计算最大拱起幅度（随距离在 14px ~ 28px 之间舒展）
    const maxOffset = Math.min(ARCH_OFFSET_MAX, Math.max(14, distance * 0.2));
    const archY = maxOffset * Math.tanh(dy / ARCH_DY_SCALE) * distanceDamping;
    const archX = maxOffset * Math.tanh(dx / ARCH_DY_SCALE) * distanceDamping;

    // 轴向连续过渡因子：在 45° 对角线附近平滑淡出，主轴方向饱满呈现
    const axisRatio = (absDx - absDy) / sum; // [-1, 1]
    const wx = smoothstep(0.08, 0.45, Math.max(0, axisRatio));  // 水平主导权重 [0, 1]
    const wy = smoothstep(0.08, 0.45, Math.max(0, -axisRatio)); // 垂直主导权重 [0, 1]

    const controlX = midX + archX * wy;
    const controlY = midY + archY * wx;

    // 如果控制点恰好在两点中点，则渲染为直线
    if (Math.abs(controlX - midX) < 0.5 && Math.abs(controlY - midY) < 0.5) {
        return buildStraightLinkPath(startPoint, endPoint);
    }

    return `M ${startPoint.x} ${startPoint.y} Q ${controlX} ${controlY} ${endPoint.x} ${endPoint.y}`;
}

export function buildWavyLinkPath(startPoint: { x: number; y: number }, endPoint: { x: number; y: number }): string {
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 36) {
        return buildStraightLinkPath(startPoint, endPoint);
    }

    const unitX = dx / distance;
    const unitY = dy / distance;
    const perpX = -unitY;
    const perpY = unitX;
    const waveCount = Math.max(2, Math.round(distance / 26));
    const step = distance / waveCount;
    const amplitude = Math.min(8, Math.max(4, step * 0.22));

    let d = `M ${startPoint.x} ${startPoint.y}`;
    for (let i = 1; i <= waveCount; i++) {
        const pointDistance = i * step;
        const midDistance = pointDistance - step / 2;
        const sign = i % 2 === 1 ? 1 : -1;
        const controlX = startPoint.x + unitX * midDistance + perpX * amplitude * sign;
        const controlY = startPoint.y + unitY * midDistance + perpY * amplitude * sign;
        const pointX = i === waveCount ? endPoint.x : startPoint.x + unitX * pointDistance;
        const pointY = i === waveCount ? endPoint.y : startPoint.y + unitY * pointDistance;
        d += ` Q ${controlX} ${controlY} ${pointX} ${pointY}`;
    }

    return d;
}

export function buildLinkPathData(link: CanvasLink | null, startPoint: { x: number; y: number }, endPoint: { x: number; y: number }): string {
    return getLinkStrokeStyle(link) === 'wavy'
        ? buildWavyLinkPath(startPoint, endPoint)
        : buildAutoCurveLinkPath(startPoint, endPoint);
}

function parseCssColor(colorText: string): { r: number; g: number; b: number } | null {
    const normalized = colorText.trim().toLowerCase();
    if (!normalized) return null;
    if (COLOR_PARSE_CACHE.has(normalized)) return COLOR_PARSE_CACHE.get(normalized) || null;

    let parsed: { r: number; g: number; b: number } | null = null;
    if (normalized.startsWith('#')) {
        const hex = normalized.slice(1);
        if (hex.length === 3) {
            parsed = {
                r: parseInt(hex[0] + hex[0], 16),
                g: parseInt(hex[1] + hex[1], 16),
                b: parseInt(hex[2] + hex[2], 16),
            };
        } else if (hex.length >= 6) {
            parsed = {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16),
            };
        }
    } else {
        const rgbMatch = normalized.match(/rgba?\(([^)]+)\)/);
        if (rgbMatch) {
            const [r, g, b] = rgbMatch[1].split(',').map(part => parseFloat(part.trim()));
            if ([r, g, b].every(value => Number.isFinite(value))) {
                parsed = { r, g, b };
            }
        }
    }

    COLOR_PARSE_CACHE.set(normalized, parsed);
    return parsed;
}

function mixCssColors(baseColor: string, accentColor: string, accentRatio = DIRECTIONAL_LINK_TINT_RATIO): string {
    const base = parseCssColor(baseColor);
    const accent = parseCssColor(accentColor);
    if (!base || !accent) return baseColor;

    const baseRatio = 1 - accentRatio;
    const mixChannel = (from: number, to: number) => Math.round(from * baseRatio + to * accentRatio);
    return `rgb(${mixChannel(base.r, accent.r)}, ${mixChannel(base.g, accent.g)}, ${mixChannel(base.b, accent.b)})`;
}

function getDirectionalSourceNode(link: CanvasLink, sourceNode?: CanvasNode | null, targetNode?: CanvasNode | null): CanvasNode | null {
    if (link.direction === 'target') return sourceNode || null;
    if (link.direction === 'source') return targetNode || null;
    return null;
}

const LINK_COLOR_CACHE = new Map<string, string>();

export function clearLinkColorCache(): void {
    LINK_COLOR_CACHE.clear();
}

export function getLinkStrokeColor(
    link: CanvasLink,
    sourceNode?: CanvasNode | null,
    targetNode?: CanvasNode | null,
    rootStyle?: CSSStyleDeclaration
): string {
    const tintNode = getDirectionalSourceNode(link, sourceNode, targetNode);
    const colorKey = tintNode ? (tintNode.color || 'c-white') : 'none';
    const cached = LINK_COLOR_CACHE.get(colorKey);
    if (cached) return cached;

    const style = rootStyle || (typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null);
    const baseColor = style?.getPropertyValue('--link-color').trim() || '#94a3b8';
    if (!tintNode) {
        LINK_COLOR_CACHE.set('none', baseColor);
        return baseColor;
    }

    const accentColor = style?.getPropertyValue(`--${colorKey}-border`).trim() || baseColor;
    const mixed = mixCssColors(baseColor, accentColor);
    LINK_COLOR_CACHE.set(colorKey, mixed);
    return mixed;
}

export function getLinkOpacity(link?: CanvasLink | null): number {
    const strokeStyle = getLinkStrokeStyle(link);
    const isDirectional = link?.direction === 'target' || link?.direction === 'source';

    if (strokeStyle === 'dashed') return isDirectional ? 0.56 : 0.38;
    if (strokeStyle === 'wavy') return isDirectional ? 0.62 : 0.44;
    return isDirectional ? 0.6 : 0.42;
}
