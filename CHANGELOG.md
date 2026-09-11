# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.10.2] - 2026-09-11

### Fixed
- **Mobile Blank Canvas Tap Modal Dismissal**: Fixed an issue where tapping the blank canvas background on mobile touch devices could not dismiss open Settings or Shortcut Help modals due to touchstart preventing synthetic click event generation. Expanded the outside dismiss listener to handle `pointerdown` and `touchstart` events, cleanly dismissing floating modals and resetting `#ui-layer.mobile-active` upon tapping the canvas.

### Added
- **Mobile Swipe Pagination on Shortcut Help Modal**: Added touch swipe gesture navigation (`touchstart`, `touchmove`, `touchend`, `touchcancel`) on `#help-modal`, allowing mobile users to effortlessly swipe left/right between help pages with boundary clamping and vertical scroll locking.
- **Enlarged Touch Target for Pager Dots**: Added an invisible touch target expansion pseudo-element (`::before`) to `.help-page-dot` in `_modals.css` for effortless fingertip tapping without altering its subtle 4px visual aesthetics.
- **Mobile Modal & Outside Tap Test Suite**: Added `test/mobile_modal.test.ts` with 7 automated tests validating left/right swipe page turning, boundary clamping, gesture axis prioritization, and outside canvas tap dismissal.

## [1.1.10.1] - 2026-09-10

### Fixed
- **Spotlight Instant Mouse Alignment on Press**: Resolved an issue where pressing `Q` activated the spotlight at the screen center (`50% 50%`) instead of following the cursor until the mouse was moved. Extracted a dedicated `modules/spotlight.ts` that caches screen mouse coordinates in memory with zero style recalculation overhead during idle exploration, and synchronously seeds `--mouse-x` and `--mouse-y` on `#spotlight-layer` upon `KeyQ` press for instant, seamless spotlight emergence.

### Added
- **Spotlight Lifecycle & Instant Alignment Unit Tests**: Added `test/spotlight.test.ts` verifying zero DOM style manipulation during idle exploration, instant alignment upon `KeyQ` press, continuous tracking while active, clean deactivation, and fallback behavior.

## [1.1.10] - 2026-09-10

### Changed
- **Balanced 7-7-7-7 Shortcut Panel Reorganization**: Re-architected the 4-page keyboard shortcut help modal around progressive user cognitive flow. Discarded the uneven 7-6-7-6 layout in favor of a strictly balanced 7-7-7-7 layout across all four pages:
  - *Page 1 (Exclusive Flow)*: Directional node creation (`Ctrl+Arrow`), linking (`Ctrl+L`), stroke style cycling (`Ctrl+'`), smart alignment (`Alt+.`), quick jump/multi-select (`f / Alt+F`), step tagging (`T`), and floating dock toggle (`\`).
  - *Page 2 (Layout & Style)*: Directional alignment (`Alt+WASD`), center alignment (`Alt+H/J`), distribution spacing (`Alt+Shift+H/J`), color cycling (`Alt+1~9`), group toggle (`Ctrl+G`), pixel nudging (`Arrow`), and spotlight focus (`Q`).
  - *Page 3 (Viewport & Canvas)*: Node search (`Ctrl+F`), canvas pan/drag (`Space+Drag`), zoom/reset (`Ctrl+=/-/0`), center focus (`Home`), select all (`Ctrl+A`), edit node (`Enter`), and deselect/cancel (`Esc`).
  - *Page 4 (Universal Essentials)*: Duplicate clone (`Ctrl+Drag`), multi-select/box-select (`Ctrl+Click`), copy/paste (`Ctrl+C/V`), undo/redo (`Ctrl+Z/Y`), delete (`Del/Backspace`), manual save (`Ctrl+S`), and card newline (`Shift+Enter`).
- **Pointer Events Suppression During Pan and Animations**: Suppressed pointer events and hit-testing across child layers (`#nodes-layer`, `#connections-layer`, `#groups-layer`) during canvas panning (`body.mode-pan`) and viewport animations (`body.view-animating`), eliminating expensive shadow repaints and hit detection when the cursor passes over dense node clusters.
- **Batched Multi-Node Dragging Movement**: Integrated `requestAnimationFrame` vertical sync batching (`flushPendingMove`) into multi-node drag interactions (`mode === 'move'`), coalescing high-frequency mousemove events to prevent redundant intermediate layout computations while ensuring coordinate precision on release.

### Fixed
- **Chromium Zoom Blurriness & Hover Invalidation Flash**: Resolved an issue where canvas nodes appeared noticeably blurry on Chrome/Chromium when zooming in and out, and flickered to crisp sharpness only when hovered. Removed the static `will-change: transform` and `backface-visibility: hidden` from `#world` that forced Chromium to cache the canvas into a fixed-resolution GPU raster texture. Introduced dynamic `body.view-animating #world { will-change: transform; }` strictly during high-speed viewport animations (e.g. middle-click pan/zoom and presenter camera flights) to maintain 120Hz smooth animation while guaranteeing pixel-perfect vector rendering during regular canvas exploration.
- **Spotlight Full-Page Style Recalculation**: Removed unconditional `--mouse-x` and `--mouse-y` CSS variable assignments on `:root` during standard canvas `mousemove` events, eliminating redundant document-wide style recalculations and confining spotlight calculations strictly to active spotlight sessions.

### Added
- **Center Alignment & Multiline Shortcuts in Help Guide**: Added explicit guide entries for horizontal/vertical center alignment (`Alt + H / J`) on Page 2 and in-card line breaks (`Shift + Enter`) on Page 4, complete with Chinese and English localization (`help_align_center`, `help_multiline`).
- **Help Modal Layout Unit Tests**: Extended `test/dock.test.ts` to assert the 28-item balanced 7-7-7-7 layout and bilingual localization dictionaries.

## [1.1.9] - 2026-09-09

### Changed
- **Keyboard-Centric Floating Dock**: Removed the "Hide floating toolbar" checkbox and its GitHub Star Easter egg unlock gating from the Settings modal. Floating dock visibility is now dedicated to keyboard power-users via shortcut (`\`), preserving a clean settings interface.
- **Help Modal Page 4**: Expanded the shortcut help modal with a 4th page dedicated to canvas controls and core keyboard flows: toggle floating dock (`\`), select all nodes (`Ctrl+A`), zoom/reset view (`Ctrl+= / - / 0`), edit selected node (`Enter`), and deselect/exit (`Esc`). Updated pager dot navigation and bilingual (zh/en) localization.
- **Empty Board Prompt**: Aligned empty state copywriting from "画布" to "画板" ("输入第一个想法，开启你的画板") across HTML markup, Chinese localization, and product specifications.
- **Specification Sync (`SPEC.md`)**: Synchronized product specifications to reflect toolbar setting removal, pure keyboard dock shortcuts, 4th-page help modal expansion, and empty board prompt adjustments.
- **Bilingual Legal Links & Dynamic Anchor Sync**: Replaced placeholder `#` links in the About modal with official bilingual links (`/privacy`, `/terms` for Chinese and `/privacy-en`, `/terms-en` for English), backed by generic `data-i18n-href` auto-synchronization in `updateI18n()`.

### Fixed
- **Shift+Enter Trailing Newline & Enter-Enter Truncation**: Resolved an issue where pressing `Shift+Enter` at the end of multiline input produced an extra newline upon saving, and subsequent unmodified edit cycles ("Enter then Enter") repeatedly stripped trailing newlines. Introduced an edit mutation guard (`hasModified`) to guarantee unmodified exits preserve the original text strictly invariant, eliminated the ephemeral `hadExplicitShiftEnter` flag, and normalized the removal of browser caret placeholder breaks across Chromium, Gecko (Firefox), and WebKit.
- **Code Block Node Rendering & Class Desync**: Resolved an issue where a code block (e.g. ```` ```bash\nhi\n``` ````) intermittently rendered as a plain node showing two lines of plain text instead of the dark card. Synchronized `isCode` determination with `trimmedText` across both DOM content rendering and `.node-code` CSS class application, eliminating false negatives caused by trailing newlines or whitespace. Also protected multi-line code blocks from being split across newlines and commas in the batch input parser (`parseGrid`).

### Added
- **Legal Compliance & Disclaimer Documents**: Authored comprehensive bilingual Privacy Policy and Terms of Service documents (`docs/legal/privacy.md`, `privacy-en.md`, `terms.md`, `terms-en.md`) establishing zero-server storage, Cloudflare network infrastructure boundaries, user content sole liability, and technical neutrality disclaimers.
- **Code Block Parsing & Rendering Tests**: Added `test/code_node.test.ts` covering code card rendering with trailing newlines, whitespace tolerance, solitary backticks rejection, and batch input preservation.
- **Multiline Edit Lifecycle Test Suite**: Added `test/shift_enter_lifecycle.test.ts` verifying trailing newline preservation from `Shift+Enter`, Enter-Enter no-op invariance across multiple consecutive cycles, and editing updates.
- **Floating Dock & Help Modal Regression Tests**: Updated `test/dock.test.ts` to assert removal of the settings checkbox, verify 4-page structure and pager dot alignment in the Help modal, and cover bilingual localization.
- **Legal Links & Anchor i18n Regression Tests**: Extended `test/safety_i18n.test.ts` to verify bilingual privacy and terms URL resolution and `data-i18n-href` DOM synchronization.

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

### Fixed
- **Handwritten Mode Alignment Desync**: Fixed an issue where `alignSelection` (e.g. `Alt + ArrowRight`), `distributeSelection`, and `smartAlignSelection` used stale in-memory node dimensions across font family switches (`Segoe UI` vs `Segoe Print`/`WenKai`). Alignment calculations now synchronize live DOM dimensions before calculating bounds, and toggling hand-drawn mode invalidates cached node widths/heights to guarantee WYSIWYG alignment.

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
