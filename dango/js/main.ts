import { initI18n, updateI18n } from './modules/i18n.js';
import { initUI, applySettings, applyHandDrawnStyle, waitForInitialBackground } from './modules/ui.js';
import { state, initializeData, saveData, undo, redo } from './modules/state.js';
import { initRender, render } from './modules/render.js';
import { createNodesFromInput, clearCanvas } from './modules/actions.js';
import { initIO, exportJson, createShareLink, createEmbedCode, loadFromUrl, updateOpenFullLink } from './modules/io.js';
import { initView, animateView, fitView } from './modules/view.js';
import { initSearch } from './modules/search.js';
import { initHints } from './modules/hints.js';
import { initPresenter } from './modules/presenter.js';
import { initShortcuts } from './modules/shortcuts.js';
import { initInteractions, handleNodeEdit } from './modules/interactions.js';
import { initFloatingDock, updateFloatingDock } from './modules/dock.js';

/**
 * Main application entry point.
 * Acts as a glue layer to initialize and wire modules together.
 */

// 1. Initialize
initI18n();

// 2. Wire Core Modules
initRender(state, {
    saveData,
    updateOpenFullLink,
    updateFloatingDock
});
initIO(render);
initView(state, render);
initSearch(state, render);
initHints(state, { render, handleNodeEdit });
initPresenter(state, {
    render,
    animateView,
    fitView,
    saveData
});
initInteractions();

// 3. Load Initial Data (MUST be after initIO as it uses renderRef)
initializeData(loadFromUrl);

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
initFloatingDock(actions);

// 5. Initial Application State Application
applyHandDrawnStyle();
applySettings(state);
render();
updateI18n();

// 6. Final UI Reveal
waitForInitialBackground().finally(() => {
    document.body.classList.remove('cloak');
});
