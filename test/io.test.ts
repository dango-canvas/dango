// test/io.test.ts
import { expect, test, describe, beforeEach } from "bun:test";
import { state, packData, unpackData, CONFIG } from "../dango/js/modules/state.js";

describe("Data IO & Serialization (packData / unpackData)", () => {
    beforeEach(() => {
        state.nodes = [];
        state.groups = [];
        state.links = [];
        state.settings = {
            hideGrid: false,
            handDrawn: false,
            altAsCtrl: false,
            bgUrl: ''
        };
    });

    test("packData and unpackData roundtrip fidelity", () => {
        state.nodes = [
            { id: 'node_1', text: 'Hello Dango', x: 100, y: 150, w: 120, h: 60, color: 'c-red' },
            { id: 'node_2', text: 'Second Node', x: 300, y: 150, w: 140, h: 70, color: 'c-blue' }
        ];
        state.groups = [
            { id: 'group_1', x: 90, y: 140, w: 360, h: 90, memberIds: ['node_1', 'node_2'] }
        ];
        state.links = [
            { id: 'link_1', sourceId: 'node_1', targetId: 'node_2', direction: 'target', strokeStyle: 'wavy' }
        ];
        state.settings = {
            hideGrid: true,
            handDrawn: true,
            altAsCtrl: false,
            bgUrl: 'https://example.com/bg.png'
        };

        const packed = packData();
        expect(packed[0]).toBe(4); // Version 4

        const unpacked = unpackData(packed);
        expect(unpacked.nodes.length).toBe(2);
        expect(unpacked.nodes[0].text).toBe('Hello Dango');
        expect(unpacked.nodes[0].color).toBe('c-red');
        expect(unpacked.nodes[1].text).toBe('Second Node');
        expect(unpacked.nodes[1].color).toBe('c-blue');

        expect(unpacked.groups.length).toBe(1);
        expect(unpacked.groups[0].memberIds.length).toBe(2);

        expect(unpacked.links.length).toBe(1);
        expect(unpacked.links[0].direction).toBe('target');
        expect(unpacked.links[0].strokeStyle).toBe('wavy');

        expect(unpacked.settings.hideGrid).toBe(true);
        expect(unpacked.settings.handDrawn).toBe(true);
        expect(unpacked.settings.bgUrl).toBe('https://example.com/bg.png');
    });

    test("Backward compatibility with Version 1 format", () => {
        // [version, pNodes, pGroups, pLinks, pSettings]
        const v1Data = [
            1,
            [[0, 'Legacy Node', 50, 60, 100, 50, 0]], // color index 0 -> c-white
            [],
            [],
            [0, 1, 0] // pSettings: [unused, hideGrid=1, handDrawn=0]
        ];

        const unpacked = unpackData(v1Data);
        expect(unpacked.nodes.length).toBe(1);
        expect(unpacked.nodes[0].text).toBe('Legacy Node');
        expect(unpacked.nodes[0].color).toBe('c-white');
        expect(unpacked.settings.hideGrid).toBe(true);
        expect(unpacked.settings.handDrawn).toBe(false);
    });

    test("Backward compatibility with Version 2 format", () => {
        const v2Data = [
            2,
            [[0, 'V2 Node', 10, 20, 100, 50, 3]], // color index 3 -> c-green
            [],
            [],
            [0, 1, 1] // pSettings: [hideGrid=0, handDrawn=1, altAsCtrl=1]
        ];

        const unpacked = unpackData(v2Data);
        expect(unpacked.nodes.length).toBe(1);
        expect(unpacked.nodes[0].text).toBe('V2 Node');
        expect(unpacked.nodes[0].color).toBe(CONFIG.colors[3]);
        expect(unpacked.settings.hideGrid).toBe(false);
        expect(unpacked.settings.handDrawn).toBe(true);
        expect(unpacked.settings.altAsCtrl).toBe(true);
    });

    test("Filters out orphaned links with non-existent nodes", () => {
        const invalidLinkData = [
            4,
            [[0, 'Solo Node', 100, 100, 100, 50, 0]],
            [],
            [[0, 999, 1, 0]], // target ID 999 does not exist
            [0, 0, 0, '']
        ];

        const unpacked = unpackData(invalidLinkData);
        expect(unpacked.nodes.length).toBe(1);
        expect(unpacked.links.length).toBe(0); // orphaned link dropped safely
    });
});
