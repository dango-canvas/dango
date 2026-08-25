// modules/types.ts

export type LinkStrokeStyle = 'solid' | 'dashed' | 'wavy';
export type LinkDirection = 'target' | 'source' | 'both' | 'none';

export interface CanvasNode {
    id: string;
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    isGroup?: boolean;
    groupId?: string | null;
    step?: number;
}

export interface CanvasGroup {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    memberIds: string[];
    isGroup?: boolean;
    text?: string;
    color?: string;
    step?: number;
}

export interface CanvasLink {
    id: string;
    sourceId: string;
    targetId: string;
    direction: LinkDirection;
    strokeStyle?: LinkStrokeStyle;
}

export interface CanvasSettings {
    hideGrid: boolean;
    altAsCtrl: boolean;
    handDrawn: boolean;
    bgUrl: string;
    hideToolbar?: boolean;
    showToolbar?: boolean;
}

export interface CanvasView {
    x: number;
    y: number;
    scale: number;
}

export interface CanvasMouse {
    x: number;
    y: number;
}

export interface CanvasClipboard {
    nodes: CanvasNode[];
    groups: CanvasGroup[];
    links?: CanvasLink[];
}

export interface CanvasState {
    nodes: CanvasNode[];
    groups: CanvasGroup[];
    links: CanvasLink[];
    view: CanvasView;
    selection: Set<string>;
    selectionSource: 'click' | 'box';
    mouse: CanvasMouse;
    searchResultId: string | null;
    clipboard: CanvasClipboard | null;
    theme: 'light' | 'dark';
    settings: CanvasSettings;
    isEmbed: boolean;
    isReadonly?: boolean;
    explicitToolbar?: boolean;
}

export interface CanvasItem {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    text?: string;
    color?: string;
    memberIds?: string[];
    isGroup?: boolean;
    step?: number;
}

export interface SnapResult {
    effectiveDx: number;
    effectiveDy: number;
    guides: Array<{
        type: 'vertical' | 'horizontal';
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }>;
}

export type SerializedNode = [number, string, number, number, number, number, number, number?];
export type SerializedGroup = [number, number, number, number, number, number[], number?];
export type SerializedLink = [number, number, number, number];
export type SerializedSettings = [number, number, number, string];

export type SerializedData = [
    number,
    SerializedNode[],
    SerializedGroup[],
    SerializedLink[],
    SerializedSettings?
];
