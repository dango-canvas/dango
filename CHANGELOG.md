# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.8] - 2026-09-06

### Changed
- **Todo Node Geometry & Padding**: Standardized Todo card padding to `12px 16px` to exactly match normal nodes (`44px` height for single-line cards), eliminating height discrepancies and edge-clumping while providing balanced left/right breathing room.
- **Hanging Indent & Visual Centerline Alignment**:
  - Transitioned `.todo-item` to a two-column grid (`inline-grid; grid-template-columns: 16px 1fr; column-gap: 8px; align-items: start`), allowing multi-line wrapped text to neatly hang beneath the first line.
  - Locked `.todo-checkbox-wrapper` height to `20px` (matching the `1.44` line-height), perfectly aligning the checkbox center to the font Cap-Height visual centerline (`y = 10px`) across all typography engines.
- **High-Fidelity Vector Checkbox**: Replaced raw browser `<input type="checkbox">` controls with crisp `15px × 15px` vector checkboxes (`border-radius: 3.5px`). Checkmark SVG remains in the DOM with smooth opacity and scale transitions, completely eliminating toggle-induced vertical layout jumping while adapting cleanly to colored nodes.

### Added
- **Inline Markdown in Todo Items**: Extended `parseMarkdown` to parse bold (`**`), italic (`*`), and links (`[text](url)`) within task item labels.
- **Todo Unit Test Suite**: Added `test/todo.test.ts` covering Todo list rendering, checked/unchecked vector SVG states, inline Markdown parsing, multiline preservation, and CSS layout geometry.

## [1.1.7] - 2026-09-05

### Added
- **Image Export (`exportImage`)**: Built-in 3x Retina WYSIWYG screenshot engine exporting the active canvas to PNG. Supports custom wallpaper rendering with cover-fit geometry, theme-adaptive dot-grid overlays, vector Todo checkbox reconstruction, and graceful CORS fallback.
- **Image Export Test Suite**: Added comprehensive test suite (`test/export_image.test.ts`) covering bounding box calculations, wallpaper rendering fallbacks, and export options.

### Changed
- **Hand-drawn Typography Stack**: Replaced external Latin font downloads (`Architects Daughter`) with native system handwriting fonts (`'Segoe Print'` on Windows, `'Chalkboard SE'` on macOS), while pairing on-demand Google Fonts WenKai loading with local WenKai and system KaiTi fallbacks across both the web app and image exports.

### Fixed
- **Wallpaper Dot-Grid Mask**: Restored dot-grid visibility over custom background wallpapers by rendering the radial dot gradient directly onto the `#bg-wallpaper-mask` layer, matching the 1:1 appearance of exported images.
- **Hand-drawn UI Layout Jitter**: Constrained settings item line-heights and eliminated distorted button borders under `.hand-drawn-style`, preventing excessive height jumping in `#settings-modal` and floating UI elements while preserving hand-drawn typography across the document body.

## [1.1.6] - 2026-09-03

### Changed
- **Typography**: Increased node text `line-height` by 1.2x (from baseline `1.2` to `1.44`) across `.node` and `.node .todo-item` for improved readability and vertical breathing room on multiline cards and task checklists.

### Fixed
- **Node Editing (Soft-wrap Squish)**: Changed `.node.editing.has-multiline` from `white-space: pre-wrap` to `white-space: pre`, preventing container collapsing on newline and unexpected line breaks.
- **Floating Dock (Restore Bubble)**: Resolved an issue where unhiding the floating dock via shortcut (`/` or `Ctrl+\`) after toggling "Hide toolbar" rendered a blank bubble; dock contents are now immediately repopulated.
- **Transformed Node Geometry & Alignment**:
  - Synced rendered capsule dimensions (`offsetWidth` / `offsetHeight`) back to link nodes (`node.w` / `node.h`), ensuring center alignment and magnetic snap guidelines calculate based on actual pill bounds.
  - Added `box-sizing: border-box` to image nodes to eliminate border padding offsets.
- **Data Persistence**: Resolved newly created nodes disappearing on browser refresh (F5). Node edits, discrete mutations, and history actions (push, undo, redo) now reliably persist to `localStorage`, backed by `beforeunload` and `pagehide` listeners.
- **Multiline & Shift+Enter**: Fixed line breaks disappearing after pressing `Shift+Enter` and exiting edit mode. Extracted `innerText` before toggling `contentEditable` to prevent Chromium from collapsing newlines under `nowrap`, and ensured explicit line breaks (including trailing empty lines) render reliably in Markdown.

### Added
- Automated unit test suite (`test/transformed_node_geometry.test.ts`) covering transformed node geometry, magnetic alignment fidelity, line-height specifications, and history auto-persistence.
