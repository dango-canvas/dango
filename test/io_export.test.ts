// test/io_export.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { state } from '../dango/js/modules/state.js';
import { exportJson, createShareLink, createEmbedCode } from '../dango/js/modules/io.js';

describe('IO Export & Share Methods Execution Reliability', () => {
    beforeEach(() => {
        state.nodes = [{ id: 'n1', text: 'Test Node', x: 0, y: 0, w: 100, h: 40, color: 'c-white' }];
        state.groups = [];
        state.links = [];
    });

    it('exportJson executes without ReferenceError and triggers downloadBlob', () => {
        expect(() => {
            exportJson();
        }).not.toThrow();
    });

    it('createShareLink executes without ReferenceError', () => {
        expect(() => {
            createShareLink();
        }).not.toThrow();
    });

    it('createEmbedCode executes without ReferenceError', () => {
        expect(() => {
            createEmbedCode();
        }).not.toThrow();
    });
});
