import { initI18n, updateI18n } from './modules/i18n.js';
import { initUI, applySettings, applyHandDrawnStyle } from './modules/ui.js';
import { state, initializeData, saveData, undo, redo } from './modules/state.js';
import { initRender, render } from './modules/render.js';
import { createNodesFromInput, clearCanvas } from './modules/actions.js';
import { initIO, exportJson, createShareLink, createEmbedCode, loadFromUrl, updateOpenFullLink } from './modules/io.js';
import { initView } from './modules/view.js';
import { initShortcuts } from './modules/shortcuts.js';
import { initInteractions, handleNodeEdit } from './modules/interactions.js';

/**
 * Main application entry point.
 * Acts as a glue layer to initialize and wire modules together.
 */

// 1. Initialize
initI18n();
initializeData(loadFromUrl);

// 2. Wire Core Modules
initRender(state, {
    saveData,
    updateOpenFullLink,
});
initIO(render);
initView(state, render);
initInteractions();

// 4. Define and Wire Shared Actions
const actions = {
    undo: () => undo(render),
    redo: () => redo(render),
    createNodesFromInput,
    clearCanvas,
    exportJson,
    createShareLink,
    createEmbedCode,
    applyHandDrawnStyle,
    handleNodeEdit,
    render
};

initShortcuts(actions);
initUI(state, actions);

// 5. Initial Application State Application
applyHandDrawnStyle();
applySettings(state);
render();
updateI18n();
