# SmartEVSE Dual Charger Card

Standalone Lovelace card for the SmartEVSE Dual Charger Home Assistant integration.

Version: `0.0.52`

This repository contains only the frontend card and local preview assets.

## Features

- Clear charging-state headline with an explicit **Edit plan** action.
- Only enabled Schedule/Force plans and active timer/price constraints in the overview. Enabled plan names use accented pills with on-switch icons, alongside quieter timer/price/time pills. The icon describes the plan setting even while charging waits for time or price. Force appears first while overriding the standing schedule.
- One tile per charger, combining vehicle name, battery percentage/bar and charging or session status. Disconnected ports stay compact; unavailable and faulted chargers are identified explicitly.
- Expandable **Charger details** for State, Mode, Current offered and Limit. Offered current is the charger pilot setting, not measured current or power consumption.
- Space Hub shared surfaces, radii, theme colors and underglow helpers. Glow colors and effects follow the controller's physical WLED configuration.
- Responsive layout: stacked charger tiles on narrow cards, two columns on wider cards.
- Two-path charging-plan editor with schedule, immediate charging, timer and acceptable-price controls. Unsupported options are omitted; temporarily unavailable controls are identified and guarded.
- Keyboard focus management, Escape/back navigation, visible focus, touch-sized controls and reduced-motion support. Expanded details survive live state updates.
- Local interactive preview backed by mocked Home Assistant services.

## Install

### HACS

Add this repository as a `Dashboard` repository in HACS.

Resource URL:

- `/hacsfiles/smartevse-dual-charger-card/smartevse-dual-charger-card.js`

Resource type:

- `JavaScript Module`

### Manual

Copy `smartevse-dual-charger-card.js` to your Home Assistant `www` directory and add it as a Lovelace resource.

Example resource URL:

- `/local/smartevse-dual-charger-card.js`

## Card Type

```yaml
type: custom:smartevse-flow-card
```

## Minimal Configuration

Use `card_flow.yaml` as the reference configuration:

```yaml
type: custom:smartevse-flow-card
controller_entity: sensor.smartevse_dual_charger_controller_state
price_entity: sensor.real_electricity_price_current_price
schedule_entity: schedule.charge_schedule
schedule_switch_entity: switch.smartevse_dual_charger_charge_with_schedule
schedule_price_entity: switch.smartevse_dual_charger_schedule_acceptable_price
force_charge_entity: switch.smartevse_dual_charger_force_charge
force_price_entity: switch.smartevse_dual_charger_force_charge_by_price
force_timer_entity: switch.smartevse_dual_charger_force_charge_timer
acceptable_price_entity: number.smartevse_dual_charger_acceptable_price
charge_policy_entity: select.smartevse_dual_charger_charge_policy
duty_cycle_entity: number.smartevse_dual_charger_duty_cycle
force_charge_duration_entity: number.smartevse_dual_charger_force_charge_duration
duty_remaining_entity: sensor.smartevse_dual_charger_duty_cycle_remaining
timer_remaining_entity: sensor.smartevse_dual_charger_timer_remaining
```

Optional:

```yaml
currency: EUR/kWh
```

## Expected Integration Data

The card is built around:

- `sensor.smartevse_dual_charger_controller_state`

The controller-state sensor should expose attributes for:

- active SmartEVSE and controller reason
- per-SmartEVSE availability, state, mode, plug state, offered current, max current, and error
- per-SmartEVSE connected EV name and battery level
- session completion state
- WLED-derived visual state

The card also expects the related control entities configured in `card_flow.yaml`.

## Interaction Model

- Tap **Edit plan** (or the hero tile) to configure charging. Available plans remain configurable when off; only enabled plans appear on the dashboard.
- Use each plan's main-menu switch to enable or stop it. Open its row to change saved options. Numeric edits save on change/Enter, not every keystroke.
- Scheduled charging supports an optional acceptable-price limit. Both time and price conditions must then be satisfied.
- Force charge supports unrestricted charging, timer only, price only, or timer plus price. It overrides the standing schedule without disabling it; Schedule resumes when Force ends.
- Integration `0.0.8.6` or newer supports independent Schedule and Force price options. Legacy integrations retain their shared-price behavior.
- The schedule row opens Home Assistant's native schedule dialog, closing the card's own dialog first.
- **Charger priority & limits** in the plan editor opens the configured charge-policy and duty-cycle controls. Policy labels use fixed SmartEVSE numbers.
- The rotation countdown appears only when two eligible cars are connected and the selected priority policy rotates them. Enabled Force timers show their remaining time.
- Enabled price constraints turn green when the current price meets the limit. In a combined timer/price plan, the timer is muted while price blocks charging.
- Disconnected chargers show no stale current, mode or battery. Unavailable hardware cannot be mistaken for an unplugged car; faults remain visible even when disconnected.
- Battery percentages are shown only for known vehicles with valid battery data. Session completion is reported from the integration, not inferred from battery percentage.
- **Charger details** is collapsed initially and preserves its open state across live updates. Current offered is diagnostic information, never a consumption measurement.

## Naming Rules

SmartEVSE device labels are fixed:

- `SmartEVSE 1`
- `SmartEVSE 2`

Vehicle names are used only for connected-EV mapping and battery display from the integration. They are not used for charge policy labels or SmartEVSE node names.

## Preview

From this repository root:

```bash
python3 -m http.server
```

Then open:

- `http://localhost:8000/preview/`

The preview renders the real card against mock Home Assistant state.

## Design System & UI Implementation

This card is part of the `bitosome` Home Assistant card family and follows a shared design system. The **single source of truth** is [`space-hub-card`](https://github.com/bitosome/space-hub-card) — specifically `space-hub-card/src/shared/design-tokens.ts`. See its [Design System & UI Implementation](https://github.com/bitosome/space-hub-card#design-system--ui-implementation) section for the full approach and file map.

This card is built with **TypeScript + Lit + Rollup** (`src/smartevse-dual-charger-card.ts`, output to `dist/`), matching the rest of the family. The design tokens are **vendored** into this repo at `src/shared/design-tokens.ts` (carrying an `AUTO-SYNCED … DO NOT EDIT` banner); its `DESIGN_TOKENS_CSS` is injected at the top of the card's `<style>` block. The canonical `buildGlow()` helper is vendored from `space-hub-card/src/glow.ts` into `src/shared/glow.ts` and is used for hero and selected-plan glows. Update shared UI primitives in `space-hub-card` first and keep the vendored copies aligned.

Rules when implementing or changing UI (these mirror `space-hub-card`, so every card looks and behaves the same):

1. **Never hardcode** colors, spacing, radii, or shadows. Reference the CSS custom properties instead — e.g. `var(--tile-border-radius)`, `var(--tile-shadow-default)`, `var(--large-gap)`, `var(--status-active-color)`.
2. **Reuse Home Assistant primitives** (`ha-card`, `ha-icon`) rather than reimplementing them.
3. **Glow layers render below tile surfaces**: each tile's glow (`.glow-under`) uses `z-index: 0` and the tile surface uses `z-index: 1`, with the tile group container (e.g. `.controls`, `.ev-row`) as a **single stacking context** so a glow never paints over a neighbouring tile. Individual tile wrappers must not create their own stacking context.
4. **Use the semantic status palette** (`--status-*`) for state colors.

SmartEVSE WLED visuals are the deliberate exception: its glow colors,
effect state, speed, and intensity come from the controller entity's live
`wled_visuals` attributes so the card stays aligned with the integration-managed
WLED installation.

The responsive overview styles live in `src/styles/overview.ts`; shared token/glow files remain canonical vendored primitives. The entire overview uses one stacking context so glows remain below sibling surfaces.

Development:

```bash
npm install
npm run build      # bundles src/ -> dist/smartevse-dual-charger-card.js
npm test           # headless smoke test (happy-dom)
npm run typecheck  # tsc --noEmit
```

### Session costs

With SmartEVSE Dual Charger integration 0.0.8.7+, each charger tile displays its
session cost below the battery percentage. Tap the cost or open **Edit plan →
Settings & charging history** to see records grouped by charger. Expand a record
for the energy-weighted average rate and missing-data details. All amounts are
estimates from the integration's measured-power accounting and Real Electricity
Price tariff; the card never calculates or persists authoritative costs locally.
A partial estimate is only the known subtotal. The last session remains visible
after unplugging, and no pre-installation costs are invented.
