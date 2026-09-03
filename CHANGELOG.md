# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
