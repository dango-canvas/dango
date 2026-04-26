// modules/links.js

export const DEFAULT_LINK_STROKE_STYLE = 'solid';
export const LINK_STROKE_STYLE_ORDER = ['solid', 'dashed', 'wavy'];
export const LINK_STROKE_STYLE_TO_CODE = { solid: 0, dashed: 1, wavy: 2 };
export const LINK_STROKE_STYLE_FROM_CODE = ['solid', 'dashed', 'wavy'];

const DIRECTIONAL_LINK_TINT_RATIO = 0.46;
const COLOR_PARSE_CACHE = new Map();
const AUTO_CURVE_MIN_DISTANCE = 64;
const AUTO_CURVE_AXIS_DOMINANCE_RATIO = 1.28;
const AUTO_CURVE_OFFSET_TRIGGER = 14;
const AUTO_CURVE_OFFSET_MIN = 14;
const AUTO_CURVE_OFFSET_MAX = 34;
const AUTO_CURVE_OFFSET_SCALE = 0.56;

export function getLinkStrokeStyle(link) {
    return link?.strokeStyle || DEFAULT_LINK_STROKE_STYLE;
}

export function cycleLinkStrokeStyle(link) {
    if (!link) return DEFAULT_LINK_STROKE_STYLE;
    const current = getLinkStrokeStyle(link);
    const currentIndex = LINK_STROKE_STYLE_ORDER.indexOf(current);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextStyle = LINK_STROKE_STYLE_ORDER[(safeIndex + 1) % LINK_STROKE_STYLE_ORDER.length];
    link.strokeStyle = nextStyle;
    return nextStyle;
}

export function createLink({ id, sourceId, targetId, direction = 'none', strokeStyle = DEFAULT_LINK_STROKE_STYLE }) {
    return { id, sourceId, targetId, direction, strokeStyle };
}

export function packLinkStrokeStyle(strokeStyle) {
    return LINK_STROKE_STYLE_TO_CODE[getLinkStrokeStyle({ strokeStyle })] ?? 0;
}

export function unpackLinkStrokeStyle(code) {
    return LINK_STROKE_STYLE_FROM_CODE[code] || DEFAULT_LINK_STROKE_STYLE;
}

export function buildStraightLinkPath(startPoint, endPoint) {
    return `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y}`;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function shouldCurveLink(startPoint, endPoint) {
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const distance = Math.hypot(dx, dy);

    if (distance < AUTO_CURVE_MIN_DISTANCE) return false;
    if (absDx < AUTO_CURVE_OFFSET_TRIGGER || absDy < AUTO_CURVE_OFFSET_TRIGGER) return false;

    const longer = Math.max(absDx, absDy);
    const shorter = Math.min(absDx, absDy);
    if (shorter === 0) return false;

    return longer / shorter >= AUTO_CURVE_AXIS_DOMINANCE_RATIO;
}

export function buildAutoCurveLinkPath(startPoint, endPoint) {
    if (!shouldCurveLink(startPoint, endPoint)) {
        return buildStraightLinkPath(startPoint, endPoint);
    }

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const midX = (startPoint.x + endPoint.x) / 2;
    const midY = (startPoint.y + endPoint.y) / 2;

    if (absDx >= absDy) {
        const curveOffset = clamp(absDy * AUTO_CURVE_OFFSET_SCALE, AUTO_CURVE_OFFSET_MIN, AUTO_CURVE_OFFSET_MAX);
        const controlY = midY + Math.sign(dy) * curveOffset;
        return `M ${startPoint.x} ${startPoint.y} Q ${midX} ${controlY} ${endPoint.x} ${endPoint.y}`;
    }

    const curveOffset = clamp(absDx * AUTO_CURVE_OFFSET_SCALE, AUTO_CURVE_OFFSET_MIN, AUTO_CURVE_OFFSET_MAX);
    const controlX = midX + Math.sign(dx) * curveOffset;
    return `M ${startPoint.x} ${startPoint.y} Q ${controlX} ${midY} ${endPoint.x} ${endPoint.y}`;
}

export function buildWavyLinkPath(startPoint, endPoint) {
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

export function buildLinkPathData(link, startPoint, endPoint) {
    return getLinkStrokeStyle(link) === 'wavy'
        ? buildWavyLinkPath(startPoint, endPoint)
        : buildAutoCurveLinkPath(startPoint, endPoint);
}

function parseCssColor(colorText) {
    const normalized = colorText.trim().toLowerCase();
    if (!normalized) return null;
    if (COLOR_PARSE_CACHE.has(normalized)) return COLOR_PARSE_CACHE.get(normalized);

    let parsed = null;
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

function mixCssColors(baseColor, accentColor, accentRatio = DIRECTIONAL_LINK_TINT_RATIO) {
    const base = parseCssColor(baseColor);
    const accent = parseCssColor(accentColor);
    if (!base || !accent) return baseColor;

    const baseRatio = 1 - accentRatio;
    const mixChannel = (from, to) => Math.round(from * baseRatio + to * accentRatio);
    return `rgb(${mixChannel(base.r, accent.r)}, ${mixChannel(base.g, accent.g)}, ${mixChannel(base.b, accent.b)})`;
}

function getDirectionalSourceNode(link, sourceNode, targetNode) {
    if (link.direction === 'target') return sourceNode;
    if (link.direction === 'source') return targetNode;
    return null;
}

export function getLinkStrokeColor(link, sourceNode, targetNode, rootStyle = getComputedStyle(document.documentElement)) {
    const baseColor = rootStyle.getPropertyValue('--link-color').trim() || '#94a3b8';
    const tintNode = getDirectionalSourceNode(link, sourceNode, targetNode);
    if (!tintNode) return baseColor;

    const accentColor = rootStyle.getPropertyValue(`--${tintNode.color || 'c-white'}-border`).trim() || baseColor;
    return mixCssColors(baseColor, accentColor);
}

export function getLinkOpacity(link) {
    const strokeStyle = getLinkStrokeStyle(link);
    const isDirectional = link?.direction === 'target' || link?.direction === 'source';

    if (strokeStyle === 'dashed') return isDirectional ? 0.56 : 0.38;
    if (strokeStyle === 'wavy') return isDirectional ? 0.62 : 0.44;
    return isDirectional ? 0.6 : 0.42;
}
