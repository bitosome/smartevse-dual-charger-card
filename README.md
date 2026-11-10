# SmartEVSE Dual Charger Card

Standalone Lovelace card for the SmartEVSE Dual Charger Home Assistant integration.

Version: `0.5.0`

This repository contains only the frontend card and local preview assets.

## Features

- Clear charging-state headline with an explicit **Edit plan** action.
- Only enabled Schedule/Force plans and active timer/price constraints in the overview. Enabled plan names use accented pills with on-switch icons, alongside quieter timer/price/time pills. The icon describes the plan setting even while charging waits for time or price. Force appears first while overriding the standing schedule.
- One tile per charger, combining vehicle name, battery percentage/bar and charging or session status. Disconnected ports stay compact; unavailable and faulted chargers are identified explicitly.
- Expandable **Charger details** for State, Mode, Current offered and Limit. Offered current is the charger pilot setting, not measured current or power consumption.
- Space Hub shared surfaces, radii, theme colors and underglow helpers. Glow colors and effects follow the controller's physical WLED configuration.
- Responsive layout. The plan layout always shows the two charger tiles side by side, also on a phone; a charger without a car is a short tile beside the car tile. The classic layout stacks the tiles on narrow cards and uses two columns on wider cards.
- Charging-plan editor with schedule, immediate charging, timer and acceptable-price controls, plus **Intelligent charging** with integration 0.0.9.0+. Unsupported options are omitted; temporarily unavailable controls are identified and guarded.
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

This card belongs to the `bitosome` Home Assistant card family. [Space Hub Card](https://github.com/bitosome/space-hub-card) remains the visual reference. Shared design tokens, components, glow and modal behavior are owned by [`@bitosome/ha-card-ui`](https://github.com/bitosome/ha-card-ui).

The TypeScript + Lit + Rollup build bundles the pinned package into `dist/smartevse-dual-charger-card.js`. No separate card, runtime network import or additional HACS installation is required. Compatibility paths in `src/shared/` only re-export the package; do not add implementation copies. Fix common behavior in the library, publish it and update the exact dependency URL and lockfile here.

Charging plans, settings and diagnostics use the shared native dialog and navigation stack. Back moves within the flow; X and Escape close the whole flow with a shared guard for unsaved drafts. A sent request can be dismissed without cancelling it; pending/error status remains visible and duplicate writes stay blocked. Native Home Assistant more-info receives focus only after the custom dialog closes. Domain logic retains responsibility for service validation and confirmation.

Rules when implementing or changing UI (these mirror `space-hub-card`, so every card looks and behaves the same):

1. **Never hardcode** colors, spacing, radii, or shadows. Reference the CSS custom properties instead — e.g. `var(--tile-border-radius)`, `var(--tile-shadow-default)`, `var(--large-gap)`, `var(--status-active-color)`.
2. **Reuse Home Assistant primitives** (`ha-card`, `ha-icon`) rather than reimplementing them.
3. **Glow layers render below tile surfaces**: each tile's glow (`.glow-under`) uses `z-index: 0` and the tile surface uses `z-index: 1`, with the tile group container (e.g. `.controls`, `.ev-row`) as a **single stacking context** so a glow never paints over a neighbouring tile. Individual tile wrappers must not create their own stacking context.
4. **Use the semantic status palette** (`--status-*`) for state colors.

SmartEVSE WLED visuals are the deliberate exception: its glow colors,
effect state, speed, and intensity come from the controller entity's live
`wled_visuals` attributes so the card stays aligned with the integration-managed
WLED installation.

The responsive overview styles live in `src/styles/overview.ts`; shared token/glow imports resolve to the pinned UI package. The entire overview uses one stacking context so glows remain below sibling surfaces.

Development:

```bash
npm install
npm run build      # bundles src/ -> dist/smartevse-dual-charger-card.js
npm test           # headless smoke test (happy-dom)
npm run typecheck  # tsc --noEmit
npm run test:layout  # optional browser layout checks; needs Playwright, skips without it
```

### Intelligent charging

With SmartEVSE Dual Charger integration 0.0.9.0+, the plan chooser shows a third tile,
**Intelligent charging** (`mdi:brain`). The integration plans the cheapest charging that
gets each connected car to its minimum by its ready-by time; the card only renders the
controller sensor's `intelligent` attribute and edits the integration's entities. It
computes no slots, energy, costs or savings itself.

**The minimum is a floor, not a target (integration 0.0.10.0+).** The car is guaranteed at
least its minimum by its ready-by time. Above the minimum it keeps charging, up to its own
limit, in hours at or below a cheap price the integration learns from your prices. The card
calls this **extra while cheap**. With integration 0.0.9.x the card keeps the earlier
**Top up when price is low** switch and its price instead.

- **Plan chart (0.5.0).** In the plan layout the plan is drawn on the shared time-series chart
  of `@bitosome/ha-card-ui` (1.8.0): price bars per hour, with hours at or below the learned
  cheap price in green and hours without a published price hatched ("No price yet", also
  named in the legend); under it one lane per connected car with its periods (Planned,
  Charging, Extra while cheap, Not enough time) and a tick at its ready-by time. The now
  marker moves by itself. The chart is a slider: scrub it with a finger, the mouse or the
  arrow keys, also into hours without a price. The head shows the time and price, and one
  line under the chart says what each car does at that time ("XC40 Charging · EX30
  Planned"). The legend is kept short ("Extra") so it stays within two lines on a phone.
  While Force charge overrides the plan the lanes are grey, the legend says "Paused by Force
  charge" and the line reads "XC40 paused". With no car connected the chart is titled
  "Electricity price" and shows prices only. A field being edited on the Intelligent page
  is not disturbed when the chart redraws the card every 30 seconds.

- **Layouts (0.4.0).** `layout: plan` shows the plan chart, car gauges inside an LED-style ring with labelled plan rows, and a totals row. `layout: classic` keeps the earlier charger tiles. Without the option the card uses `plan` when the integration supports Intelligent charging. Settings → Card layout switches it on the current device (Plan or Classic), and Auto returns to the card option or the default. The default stays `plan` while the controller is unavailable, for example during a restart.
- **Standing plans.** Intelligent charging and Schedule are independent: switching one
  never changes the other. While both are on, Intelligent has priority (the Schedule
  tile says so), and the schedule takes over again when Intelligent is turned off.
  Force charge still overrides both; the Intelligent group then reads "Resumes after force charge".
- **Hero.** While Intelligent charging governs, the title is one plain sentence: "Charging
  Volvo XC40", "Next charge at 22:00" (or "Next charge Tue 22:00"), "Both cars ready" or
  "Volvo XC40 ready" when every planned car has its minimum and nothing more is planned, or
  "Waiting for a vehicle". One line under it says when the cars are ready ("Ready by 07:00",
  or each car with its time when they differ) and adds "then extra while cheap" when extra
  charging is planned. The enabled-only "Intelligent charging" group has no time pill any
  more. Warnings such as "Not enough time for Volvo EX30" (or "… for both" when two cars
  compete for the time) and "Check Volvo XC40" appear as warning pills. No money in the hero.
  Other states keep their titles ("Volvo XC40 isn’t accepting charge", "Charging complete",
  "Waiting for the selected vehicle", errors).
- **Car tiles (plan layout).** Under the gauge, at most four short labelled rows:
  **Guaranteed** ("80% by 07:00", "≈ 30 kWh by 07:00" for a car with an unknown level, or
  "Reached · 82%"), **Extra** ("to ≈ 96% while cheap", or "none tonight" when a cheap price
  is known but no extra charging is planned), **Next** ("Starts 22:00", "Charging until
  23:00", "After Volvo XC40", "Done") and **Cost** ("≈ €4.91 · saves ≈ €1.29"). A warning is
  one line above the rows ("Not enough time · ≈ 74% by 07:00"). On a phone each row puts its
  label above its value; on a wide card label and value share a line. The gauge shows the
  minimum as a tick and the extra level as a thin arc.
- **Charger tiles (classic layout).** A connected charger shows its target and the deadline
  the plan targets ("80% by 07:00 · starts Mon 21:00") and the session estimate with the
  saving ("≈ €4.91 · saving ≈ €1.29"). Forecast-based money is marked "forecast" without a saving,
  partial money is omitted and an estimated plan (battery level unknown) names the energy
  it plans instead of a target ("≈ 30 kWh by 07:00"), on the tile, in the per-car summary
  and in the page totals. Warning lines keep the normal text colour and carry the shared
  warning glyph. The battery meter marks the effective minimum. A disconnected charger
  shows "Last charge saved ≈ €1.25" until the next plug-in. History records show the
  saving vs charging at plug-in, or "Force charge used" when the session was mixed; a
  plug-in that spans several nights combines them.
- **Intelligent page.** The plan first: chronological blocks per car (extra charging
  marked "extra while cheap"), a per-car summary, totals with "Saving vs charging at
  plug-in", which charger charges first (opens Charge policy), the price horizon and
  learning progress. Then per-vehicle **Ready by** (native time input) and **At least**
  (the minimum, in %) fields with the line "Charges to at least this level by the ready-by
  time.", and a learned departure suggestion ("Usually leaves 07:30" · "Use 07:15"). The
  block **Above the minimum** explains the extra charging and has nothing to set: either
  the learned cheap price ("… in hours at or below ≈ €0.26 per kWh"), or that extra
  charging starts once five days of prices are known. With integration 0.0.9.x the page
  shows **Top up when price is low** with its own **Top up below** price instead. An
  unidentified car's battery level is never known, so the integration plans it by energy:
  its section says "Battery level unknown · planned by energy", and its minimum does not
  change that plan. Times and numbers save on
  blur or Enter, never per edited segment or spinner step; a value entered while its
  field is saving is written next. A saving field shows its own pending state while the
  other controls and Back stay usable.
  Nothing here starts or stops charging.
- **Notices.** Non-blocking controller warnings (prices or plan unavailable, the car's
  own charging timer, vehicle data) read as warning notices; raw identifiers are never shown.

Entities come from the controller's `intelligent.entities` by default. Optional overrides:

```yaml
intelligent_charge_entity: switch.smartevse_dual_charger_intelligent_charging
# Integration 0.0.9.x only (0.0.10.0 has no top-up entities):
intelligent_top_up_entity: switch.smartevse_dual_charger_intelligent_top_up
intelligent_top_up_price_entity: number.smartevse_dual_charger_intelligent_top_up_price
vehicle_1_ready_by_entity: time.smartevse_dual_charger_volvo_xc40_ready_by
vehicle_1_minimum_charge_entity: number.smartevse_dual_charger_volvo_xc40_minimum_charge
vehicle_2_ready_by_entity: time.smartevse_dual_charger_volvo_ex30_ready_by
vehicle_2_minimum_charge_entity: number.smartevse_dual_charger_volvo_ex30_minimum_charge
other_vehicle_ready_by_entity: time.smartevse_dual_charger_unidentified_vehicle_ready_by
```

The ids above are examples; the integration publishes the real ones. Without the
Intelligent switch entity the feature is hidden entirely, so older integrations look
exactly as before. A price chart on the Intelligent page follows in 0.3.1.

### Session costs

With SmartEVSE Dual Charger integration 0.0.8.7+, each charger tile displays its
session cost below the battery percentage. Tap the cost or the **Charging history** button below the charger tiles to open the shared history modal with records grouped by charger. History is separate from Settings. Expand a record
for the energy-weighted average rate and missing-data details. All amounts are
estimates from the integration's measured-power accounting and Real Electricity
Price tariff; the card never calculates or persists authoritative costs locally.
A partial estimate is only the known subtotal. The last session remains visible
after unplugging, and no pre-installation costs are invented.
