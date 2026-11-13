# SmartEVSE Dual Charger Card

Standalone Lovelace card for the SmartEVSE Dual Charger Home Assistant integration.

Version: `0.10.1`

This repository contains only the frontend card and local preview assets.

## Features

- A slim header with the charging mode as one chip (Intelligent, Schedule, Force charge or Off) that opens the mode sheet. There is no hero tile (0.9.0): each car's tile says what happens next.
- Outside the normal Intelligent case the status sentence is the line under the title (0.10.0: "Waiting for a vehicle"). The enabled Schedule/Force plans and their active timer/price constraints are shown in a panel under the header when there are any. Enabled plan names use accented pills with on-switch icons, alongside quieter timer/price/time pills. The icon describes the plan setting even while charging waits for time or price. Force appears first while overriding the standing schedule.
- One layout. With **Intelligent charging** enabled the plan chart sits above the charger tiles; without it the card is the same tiles without the chart.
- One tile per charger: charger, vehicle, status and battery percentage, the shared battery meter, then short labelled facts. **Charged** (what this charge has taken and cost since plug-in) is shown for every connected car in every mode. History opens from the one row under the tiles. A charger without a car is a compact tile with its name and state only (0.10.1); past charges are in history. Unavailable and faulted chargers are identified explicitly.
- **Charger details** opens a dialog with everything about one charger in short sections: the car, its plan, this charge, the charger (State, Mode, Current offered, Limit) and what the planner uses. Offered current is the charger pilot setting, not measured current or power consumption.
- Space Hub shared surfaces, radii, theme colors and underglow helpers. Glow colors and effects follow the controller's physical WLED configuration.
- Responsive: the two charger tiles stack on a phone and sit side by side on a wide card. In a car tile the guaranteed level and the extra level sit under the battery bar, and Charged, Planned and Saves are three figures side by side (rows in a narrow tile).
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

- Tap the mode chip in the header to configure charging. Available plans remain configurable when off; only enabled plans appear on the dashboard.
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
- **Charger details** shows only what the controller reports: a value it does not carry leaves its row out. Current offered is diagnostic information, never a consumption measurement.

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

**The minimum is a floor, not a target.** The car is guaranteed at least its minimum by its
ready-by time. With integration 0.0.11.0 it then goes on charging to its own charge limit
(the one set in the car) in the cheapest hours left before the ready-by time; there is no
price limit to set (since integration 0.0.13.0 the planner limits it to the hours that are cheap for the night by itself). The card calls the two parts **Guaranteed** and **Extra**.
Older integrations keep their wording: 0.0.10.0 charged above the minimum only under a
learned price ("extra while cheap"), and 0.0.9.x has the **Top up when price is low** switch
and its price.

- **Price chart with charging periods (0.7.0).** While Intelligent charging is enabled, the
  card shows the electricity price chart of the Real Electricity Price card above the charger
  tiles: today and tomorrow from midnight, one bar per hour in the shared price colours (past,
  current and coming hours in blue, green at or below the cheap limit), H and L over the
  highest and lowest price, and the price with four decimals in the head. It is built from
  the shared helpers of `@bitosome/ha-card-ui` (1.11.0), so both cards draw it the same way.
  - **Prices** come from the hourly price lists of the price integration: the sensors next
    to the configured `price_entity` (`…current_price` → `…hourly_prices_today`, as the
    integration finds them), else `sensor.real_electricity_price_hourly_prices_yesterday`,
    `…_today` and `…_tomorrow`. The card options `price_yesterday_entity`,
    `price_today_entity` and `price_tomorrow_entity` name other lists. Without any list the
    bars are the known prices of the plan. The cheap limit is the price card's acceptable
    price (`number.real_electricity_price_acceptable_price`, or `cheap_price_entity`).
  - **Under the prices** there is one lane per connected car, and per charger that charged
    today. Left of the now marker is what happened: **Charged** periods (slim, green), read
    from the recorder history of the charger state sensors
    (`sensor.<name>_smartevse_1_state` and `_2_state` next to a controller entity named
    `…_controller_state`, or the options `smartevse_1_state_entity` and
    `smartevse_2_state_entity`). Right of it is the plan: Planned, Above the minimum, Not
    enough time, and a tick at the ready-by time. A car that charges now is one **Charging**
    period from where the charger began to the end of its planned period. The history is
    read once per day and again after a charger changes state (at most every ten minutes
    otherwise); without the recorder the lanes show the plan and the live state only.
  - Hours the plan covers without a published price are hatched ("No price yet", named in
    the legend). While Force charge overrides the plan, what is planned is grey and reads
    "XC40 paused"; what charges stays "Charging".
  - The now marker moves by itself. The chart is a slider: scrub it with a finger, the mouse
    or the arrow keys. The head shows the time and price, and one line under the chart says
    what each car did or does at that time ("XC40 Charged · EX30 Planned"). The frame has no
    title, like the price card. With no car connected and nothing charged today it shows
    prices only. A field being edited on the Intelligent page is not disturbed when the
    chart redraws the card every 30 seconds.

- **One layout (0.6.0).** Cards 0.4.0 to 0.5.x had a separate "plan" layout and a layout chooser in Settings. Both are gone: there is one layout, the chart shows whenever Intelligent charging is enabled, and nothing is stored per device. A `layout:` key left in a dashboard configuration is accepted and ignored.
- **Standing plans.** Intelligent charging and Schedule are independent: switching one
  never changes the other. While both are on, Intelligent has priority (the Schedule
  tile says so), and the schedule takes over again when Intelligent is turned off.
  Force charge still overrides both; the Intelligent group then reads "Resumes after force charge".
- **Status sentence (the hero until 0.8.x).** Since 0.9.0 it is read out by screen readers in the normal Intelligent case and shown in every other state (0.10.0: as the line under the title); each car's tile shows what happens next. While Intelligent charging governs, the title is one plain sentence: "Charging
  Volvo XC40", "Next charge at 22:00" (or "Next charge Tue 22:00"), "Both cars ready" or
  "Volvo XC40 ready" when every planned car has its minimum and nothing more is planned, or
  "Waiting for a vehicle". One line under it says when the cars are ready ("Ready by 07:00",
  or each car with its time when they differ) and adds "then extra up to the car limit" when
  charging above the minimum is planned. The enabled-only "Intelligent charging" group has no time pill any
  more. Warnings such as "Not enough time for Volvo EX30" (or "… for both" when two cars
  compete for the time) and "Check Volvo XC40" appear as warning pills. No money in the hero.
  Other states keep their titles ("Volvo XC40 isn’t accepting charge", "Charging complete",
  "Waiting for the selected vehicle", errors).
- **Charger tiles.** Two tiles, stacked on a phone and side by side on a wide card. Each has
  the charger and vehicle name, the status and the battery level, and the shared horizontal
  battery meter with the minimum marked. The LED state of the charger is the glow under the
  tile. Under the meter comes at most one note or warning line ("Not enough time · ≈ 74% by
  07:00", "Car isn’t accepting charge"), then the facts (0.8.0): **Guaranteed** right under the battery bar, ending at the minimum tick, and **Extra** at the end of the bar, whose hatched part is what the plan charges above the minimum; then **Next**, **Charged** and **Planned** as three figures side by side, each with a quieter line under it (three rows in a
  narrow tile):
  - **Guaranteed**: "80% by 07:00", "≈ 30 kWh by 07:00" for a car with an unknown level, or
    "Reached · 82%".
  - **Extra**: how far above the minimum the plan gets: "to 100% · car limit", "to ≈ 86% by
    07:00" when the night is too short for more, "when prices arrive · ≈ 15:00" while
    tomorrow's prices are due, "At the car’s limit", "Car stopped charging", or "none before
    07:00". No row when the minimum is the car's own limit or the level is unknown.
  - **Next**: "Starts 22:00", "Charging until 23:00", "After Volvo XC40", "Done".
  - **Charged**: what this charge has taken and cost so far since plug-in ("29.4 kWh · ≈
    €7.57"), from the charger's metered session. It is shown for every connected car in
    every mode (Force charge, Schedule, Intelligent). A car that has not charged since it
    was plugged in has no Charged figure: the charge before it is not this car's.
  - **Planned**: what the plan still charges and what that costs ("≈ 4.6 kWh · ≈ €1.11").
    With an integration older than 0.0.11.0 one **Total** row shows the figure for the whole
    charge instead.

  Guaranteed, Extra, Next and Planned need an Intelligent plan for the car. The **Charger
  details** row opens the details dialog. A charger without a car is a compact tile with its
  name and state only (0.10.1): what the last charge took, cost and saved is in history.
- **What a saving is compared with.** Every saving names its comparison, from the
  integration's `baseline_kind` (0.0.11.0): "Saves ≈ €7.41 compared with Charge with
  schedule" when the comparison is your schedule, otherwise "… compared with charging at
  plug‑in" (the cars charging one after the other from the moment they were plugged in).
  The line under the tiles reads "Saved" when nothing more is planned. History rows
  ("Charge with schedule would have cost ≈ €5.53", then "Saved ≈ €1.25" or "Cost more
  ≈ €0.40"), the Intelligent page totals and the charger details use the same names. The
  figures of a tile have room for a short name only: "vs schedule", "vs plug‑in". Each
  recorded session carries its own comparison.
- **Charger details.** One dialog per charger, in short titled sections of label and value:
  **Car** (vehicle, battery level, "At least", car limit, ready by), **Plan** (Guaranteed,
  Extra and each planned block as "21:00–22:00 · Guaranteed" or "… · Above the minimum", or
  the note when the car has no plan), **This charge** (Charged and since when, Planned, and
  the saving with its comparison), **Charger** (State, Mode, Current offered, Limit) and
  **What the planner uses** (energy per percent and whether it is learned or from the
  battery capacity, charging power, "Refined from 2 of 3 charges"). A value the controller
  does not report leaves its row out.
- **Glows stay beneath tiles.** Every panel next to a glowing tile is a shared foreground
  surface (`.family-surface`) with the card's opaque tile background. `npm run test:layout`
  compares real pixels with the glows on and off: the inside of every tile and every piece
  of text must be identical, in both themes, with and without Intelligent charging.
- **Intelligent page.** The plan first: chronological blocks per car (charging above the
  minimum marked "above the minimum"), a per-car summary, totals with the saving and its
  comparison ("Saving vs Charge with schedule"), which charger charges first (opens Charge
  policy) and the price horizon. The counters that refine the planner's estimates read
  "Refining estimates · 1 of 3 charges" and "Refining household load · 1 of 7 days", with the
  line "Planning works from the first night. These only make its estimates more exact.":
  none of them is a condition for planning. Then per-vehicle **Ready by** (native time input) and **At least**
  (the minimum, in %) fields with the line "Charges to at least this level by the ready-by
  time.", and a learned departure suggestion ("Usually leaves 07:30" · "Use 07:15"). The
  block **Above the minimum** explains it and has nothing to set: each car goes on to its
  own charge limit in the cheapest hours left, and while tomorrow's prices are due it says
  when they are expected. With integration 0.0.10.0 it names the learned price instead, and
  with 0.0.9.x the page
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

With SmartEVSE Dual Charger integration 0.0.8.7+, each charger tile shows what its
charge has taken and cost in the **Charged** figure. Tap the **Charging history** row below the charger tiles to open history: it is the one way in (0.9.0). History is one list for both chargers, newest first, with the totals of the last 30 days (energy, cost with the average price per kWh, number of charges) and one selector with a segment per car.

Each charge (0.10.0) shows its car, day and charger, a badge with the outcome ("Saved ≈ €1.25", "≈ €0.18 more", "Not compared") and a table:

- one row per **period** it went through (integration 0.0.14.0): its hours, its kind (Guaranteed, Extra, Schedule, Force charge), its energy in kWh, the average price per kWh it paid and its cost. A timeline above the table shows where the periods lie between the first and the last charging minute;
- the **Total** with the average price of the whole charge;
- **what the comparison would have cost** ("Charge with schedule would have cost ≈ €5.53") and the difference: **Saved** or **Cost more**.

Nothing is folded away: missing prices, unobserved time and why a charge is not compared are plain lines under the table. A stretch of under a minute or with next to no energy (the seconds after the plan stops the charger) is counted with the period before it. Charges recorded before integration 0.0.14.0 show their total only. History is separate from Settings. All amounts are
estimates from the integration's measured-power accounting and Real Electricity
Price tariff; the card never calculates or persists authoritative costs locally.
A partial estimate is only the known subtotal. The last session stays in history
after unplugging, and no pre-installation costs are invented.
