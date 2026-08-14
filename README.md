# SmartEVSE Dual Charger Card

Standalone Lovelace card for the SmartEVSE Dual Charger Home Assistant integration.

Version: `0.0.48`

This repository contains only the frontend card and local preview assets.

## Features

- Visual power-flow layout with Home at the top and two SmartEVSE devices below it.
- Animated flow line to the active SmartEVSE using the same charging/idle/error color vocabulary as the integration WLED visuals.
- Per-SmartEVSE state cards with static State, Mode, Offer, and Max labels paired with compact value pills, plus detected battery level.
- Optional EV battery node below each SmartEVSE when the integration reports a connected EV.
- The hero tile is the single Charging Plan control for all schedule and force-charge behavior.
- Hero glow always mirrors the physical WLED state: off when disconnected, blue while connected/idle, green while charging, and red on a SmartEVSE error.
- Guided two-path wizard for scheduled charging or charging now, with optional timer and acceptable-price limits that can be combined.
- Power-flow branches originate directly beneath the hero tile.
- Charge policy labels are always based on `SmartEVSE 1` and `SmartEVSE 2`, not vehicle names.
- Local preview page with several mock charging scenarios for UI iteration.

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
- per-SmartEVSE state, mode, plug state, current, max current, and error
- per-SmartEVSE connected EV name and battery level
- session completion state
- WLED-derived visual state

The card also expects the related control entities configured in `card_flow.yaml`.

## Interaction Model

- Tap the hero tile to configure all charging behavior.
- Tap the schedule entity inside the schedule page to edit it through Home Assistant’s native schedule dialog.
- Scheduled charging can run with or without a price limit. With the price requirement enabled, both the schedule window and acceptable-price condition must be satisfied.
- Force charge supports unrestricted charging, timer only, acceptable price only, or timer plus acceptable price.
- Force charge temporarily overrides scheduled charging without disabling its switch, so the saved schedule resumes when Force charge ends.
- SmartEVSE Dual Charger integration `0.0.8.6` or newer is required for independent Force and Schedule acceptable-price options.
- Schedule and Force charge have independent main-menu toggles, while their saved timer and acceptable-price options remain visible and persist when disabled.
- Schedule and Force charge submenus only customize their saved options; numeric changes save automatically and activation stays on the main menu.
- Charging-plan and settings dialogs show titles and controls without explanatory helper copy.
- Main charging-plan tiles and Schedule/Force submenu tile headers share one unified height.
- Schedule and Force submenu option tiles use the same leading icon treatment as the main charging-plan tiles.
- Submenu options use the same switch language as the main menu instead of tick indicators.
- Timer duration and acceptable price are configured directly on the Force charge page.
- Force timer duration is entered as separate Hours and Minutes values while remaining stored in Home Assistant as total minutes.
- Use the toggle on each main-menu tile to enable or disable that plan.
- The live duty-cycle countdown appears in the hero while a charger is active, and an enabled Force timer shows its live remaining time there instead of only its configured duration.
- When Schedule and Force charge are both enabled, the hero identifies the active Force plan first and reports the controller's actual gating reason; Schedule remains enabled underneath.
- Hero pills are a settings summary grouped as Use schedule first and Force charge second; ON/OFF is included directly in each group's primary pill.
- Hero pills remain compact and use all available tile width before wrapping, while preserving the standard inner padding.
- The hero leaves standard tile spacing below its title and omits the redundant top-right icon.
- Schedule and Force charge groups are separated with spacing and a subtle divider, without an additional background container behind the pills.
- When Use schedule is ON, its group shows the next charge time, or both the active-now state and window end time, plus its acceptable-price limit only when that option exists and is enabled.
- When Force charge is ON, its group shows the live timer countdown and acceptable-price limit only when those options exist and are enabled.
- Enabled acceptable-price pills use the same live state in both groups: green when the current price meets the limit, gray while it does not or the price is unavailable.
- In a combined Force timer + acceptable-price plan, the timer pill is gray while price blocks charging and active when the price condition is met.
- The hero title uses the controller's reported blocking reason, including `Force charge waiting for acceptable price`, so the cause is explicit at a glance.
- Runtime controller reasons remain represented by the hero title instead of being mixed into the settings pills.
- While Force charge overrides Schedule, the Schedule group follows its saved submenu options and ignores transient stale switch state from the controller.
- Hero details use individual semantic pills for every active plan, option, constraint, and controller state, allowing combinations to remain visible without compressed sentences.

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

The animated SmartEVSE flow is the deliberate exception: its glow colors,
effect state, speed, and intensity come from the controller entity's live
`wled_visuals` attributes so the card stays aligned with the integration-managed
WLED installation.

Development:

```bash
npm install
npm run build      # bundles src/ -> dist/smartevse-dual-charger-card.js
npm test           # headless smoke test (happy-dom)
npm run typecheck  # tsc --noEmit
```
