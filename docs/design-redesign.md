# Vouch mission control

The current design pairs warm neutral surfaces and graphite controls with original notebook-style scout mascots. Fine rules, compact mono labels, purposeful space and restrained violet accents give the product a developer-tool feel. The dashboard keeps descriptions short and puts campaign actions, observed results and review work first.

## Implemented surfaces

- `/` has an original mascot, synthetic mission trace, working command copy control, workflow, evidence example and FAQ.
- `/app` has actual campaign/run metrics, recent campaigns, a compact pending-review queue and a baseline action. Returning workspaces get a smaller welcome panel. New workspaces retain the fuller onboarding presentation.
- `/app/campaigns`, `/app/findings`, `/app/targets`, `/app/integrations`: bookmarkable workspace views.
- `/app/runs/{id}`: transcript, keyboard-operable timeline/raw-event tabs, observed backend state, captured policy, reviewer decisions, audit history, rerun, and regression export.
- `/credits`: creator credits and locally served license texts.
- `/docs`, `/docs/quickstart`, `/docs/first-campaign`, `/docs/evidence`, `/docs/integrations`, `/docs/api` and `/docs/troubleshooting` provide the public product documentation.

Workspace navigation uses Phosphor icons and an animated hover/focus indicator without navigating on hover. Docs opens in a separate browser tab from the workspace. A persistent mobile Docs shortcut and visible tab-strip scroll cue keep documentation discoverable at narrow widths. Campaigns and findings remain open rows rather than nested cards. Reduced-motion preferences are respected.

Documentation uses chapter navigation, full-content guide search, a wide-screen table of contents, keyboard-accessible tables and code blocks, previous/next links and a mobile chapter menu. Prose is constrained to a comfortable reading width and mobile table descriptions wrap. Copy controls report both success and failure. Commands preserve an existing `.env` file. Prose avoids em dashes and colons while command syntax, URLs and machine-readable data retain required punctuation.

The layout was exercised from 320px through 2560px. Automated WCAG A/AA checks cover the landing, dashboard, evidence view, mobile integrations and every documentation chapter. The tests cover real local campaign creation through review/export, Docs opening in a new tab, command copying, copy-denied feedback, mobile navigation, direct route reloads and non-draggable images. This is not exhaustive physical-device, screen-reader or browser certification.

## Original assets

The scout and builder are original generated Vouch characters with a shared ink-and-ivory visual style. They are delivered as transparent 512px WebP images of approximately 39KB and 38KB. Original PNG generation outputs remain under `/workspace/generated_images`. All image elements reject native dragging. Text and commands remain selectable. The existing generated Vouch logo, favicon and touch icon are retained.

- Phosphor Icons: Phosphor Icons team, MIT. License copied to `public/licenses/phosphor-MIT.txt`.
- Geist and Geist Mono: Geist Project Authors / Vercel, SIL OFL 1.1. Both license texts are retained under `public/licenses`.
- OpenCode neutral theme and scale are adapted from its MIT-licensed [theme source at 8d083cb64d165b4784e4bddebdd8aad30b3fe50b](https://github.com/anomalyco/opencode/blob/8d083cb64d165b4784e4bddebdd8aad30b3fe50b/packages/ui/src/styles/theme.css). Inspected values include neutral surfaces `#f8f8f8`, `#fcfcfc`, `#161616`, a 14px base size, 16px reading size and 4px spacing scale. Shared Vouch aliases live in `mission-tokens.css`. Geist and Vouch's accent/artwork remain original project choices. The exact upstream license is retained as `public/licenses/opencode-MIT.txt` and linked from Credits.
- Generated branding and characters are original project assets. No Notion or SpaceX character, logo or proprietary component was copied.

## Reference access

OpenCode's pinned public GitHub source and license were accessible and inspected. Direct requests to Tessory's `/llms.txt`, OpenCode's website, Notion and SpaceX were denied by the active cloud network policy. The named brand references therefore inform the requested high-level direction, while only the available licensed OpenCode source is claimed as directly inspected. No Tessory catalog component or linked license is claimed as reviewed or copied. The existing environment draft retains the requested Tessory domain allowance.

Rendered screenshots and verification artifacts are retained under ignored `artifacts/mission-control/`. See the root `design-qa.md` and the repository audit for the checked surfaces and remaining product limits. New UI work does not enable live calling.
