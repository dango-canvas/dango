// modules/links.js

export const DEFAULT_LINK_STROKE_STYLE = 'solid';
export const LINK_STROKE_STYLE_ORDER = ['solid', 'dashed', 'wavy'];
export const LINK_STROKE_STYLE_TO_CODE = { solid: 0, dashed: 1, wavy: 2 };
export const LINK_STROKE_STYLE_FROM_CODE = ['solid', 'dashed', 'wavy'];

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
        : buildStraightLinkPath(startPoint, endPoint);
}
