> Historical fixture baseline. This design verification predates the live/authentication expansion. The expanded code received compilation and static review only because acceptance testing was left to the user. See [current handoff](../project-status.md).

# Vouch design verification

final result: passed

Verified on 28 October 2026 against the user's redesign brief, the captured existing interface, the inspected OpenCode theme source and the original generated mascot assets. This is a redesign review rather than a claim of pixel-identical cloning of a reference website.

## Checked surfaces

- Landing and credits
- Overview, campaigns, findings, targets and integrations
- Run evidence, review, rerun and regression export
- All seven documentation chapters

## Results

- The interface uses a shared neutral token layer, self-hosted Geist, Phosphor icons, original scout/builder illustrations and restrained violet accents.
- Workspace descriptions are short. Returning workspaces use a smaller baseline panel so results appear earlier.
- Mobile Docs is accessible through both the tab strip and a persistent shortcut. The tab strip shows a scrolling cue.
- Documentation has chapter search, a table of contents, readable prose width, wrapped mobile tables, previous/next navigation and real command copying with failure feedback.
- All image elements disable dragging and reject drag-start events. Documentation text and commands remain selectable.
- Authored interface prose avoids em dashes and colons. Executable syntax and technical identifiers retain necessary punctuation.
- Automated axe WCAG A/AA checks pass on the landing, overview, evidence, mobile integrations and every Docs chapter.
- Layouts were checked at 320, 390, 768, 1440 and 2560px. Evidence also retains the existing 360 and 1920px checks.
- The actual local campaign workflow passes through worker execution, evidence review, export and bounded rerun. Request-race and timeout recovery checks also pass.

The first integrated review found low-contrast metadata, clipped mobile table descriptions, hidden mobile Docs discovery and overly wide reading lines. Those findings were corrected and the affected pages were recaptured. No unresolved P1 or P2 design issue remains in the checked scope.

## Evidence

Rendered desktop/mobile captures are retained under ignored `artifacts/mission-control/`. They show the real running local product, with clearly synthetic campaign records and actual database-backed counts. Original before captures are retained alongside them.

Run `pnpm test:browser`, `pnpm test:browser:design` and `pnpm test:browser:requests` after building and starting the documented local services. These are Chromium checks rather than certification of every physical device or assistive technology.

OpenCode's pinned MIT source was inspected and credited. Tessory, Notion and SpaceX live websites were blocked by the current network policy, so no inaccessible source or proprietary component is claimed as inspected or copied. The current UI work does not enable live calling or make the local workspace production-authenticated.
