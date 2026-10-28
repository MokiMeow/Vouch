# Vouch: pearl and signal

The redesign replaces the green sidebar and repeated card grid with an open pearl/lilac interface: editorial type, fine dividers, curved focal elements, a floating glass navigation rail, and a generated glass-wave backdrop.

## Implemented surfaces

- `/`: landing page with an original artwork hero, product approach, clearly labelled synthetic evidence example, FAQ, and workspace entry points.
- `/app`: operational overview with actual campaign/run metrics, recent campaigns, the verification baseline, and pending reviews.
- `/app/campaigns`, `/app/findings`, `/app/targets`, `/app/integrations`: bookmarkable workspace views.
- `/app/runs/{id}`: transcript, keyboard-operable timeline/raw-event tabs, observed backend state, captured policy, reviewer decisions, audit history, rerun, and regression export.
- `/credits`: creator credits and locally served license texts.

No sidebar remains. Normal data uses rows and spacing rather than nested boxes. Glass is restricted to navigation, dialogs, the speech player, and the landing illustration. Navigation has a moving hover/focus indicator; hovering does not change the route. Scroll reveals and hover transitions honor reduced-motion preferences.

The layout was exercised from 320px through 2560px. Automated WCAG A/AA checks cover the landing, dashboard, evidence view, and mobile integrations. This is not a claim of exhaustive screen-reader or assistive-technology certification.

## Original assets

The Vouch V/wave symbol and pearl-glass background were generated specifically for this project. Original generation outputs remain under `/workspace/generated_images`. Optimized assets, favicon and touch icon are served from `apps/web/public`. Fonts are self-hosted, and interface text remains selectable HTML.

- Phosphor Icons: Phosphor Icons team, MIT. License copied to `public/licenses/phosphor-MIT.txt`.
- Geist and Geist Mono: Geist Project Authors / Vercel, SIL OFL 1.1. Both license texts are retained under `public/licenses`.
- Generated logo and backdrop: original AI-generated project assets; no third-party component was copied to produce them.

## Tessory status

The Tessory domain was added to the cloud configuration draft. Actual requests to its llms.txt/catalog still returned network-policy HTTP 403, and the managed runtime continued to report a restricted policy with no custom domains applied. The redesign therefore follows the user's explicit visual brief and original artwork. No Tessory component, source, creator credit, or license is claimed to have been inspected or incorporated.
