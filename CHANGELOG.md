# Changelog

## 0.5.1 — 2026-11-11

- The price in the plan chart is now a stepped line with a filled area that covers each whole hour. Before, each price was a narrow bar centred in its hour, so a charging period that started on the hour began to the left of its price bar and the hour labels sat between bars. Prices, hour labels and charging periods now share the same time scale.

Validation: typecheck, production build, 315 offline smoke checks (1 new) and the browser layout run of 90 state, width and theme combinations in Chromium; the two-car plan was looked at in dark theme at 390 px.

## 0.5.0 — 2026-11-11

The plan layout is redrawn on the shared chart and reworded so it can be read at a glance. It needs `@bitosome/ha-card-ui` 1.8.0. The new wording is for SmartEVSE Dual Charger integration 0.0.10.0; with 0.0.9.x the card keeps working and keeps the earlier top-up controls.

What "minimum charge" means now: it is a floor, not a target. A car is guaranteed at least its minimum by its ready-by time. Above the minimum it keeps charging while electricity is cheap. The card calls that "extra while cheap".

Plan chart:

- The plan is drawn on the same chart as the electricity price card and the weather forecast, in place of the card's own drawing. Price bars per hour, with cheap hours in green and hours without a published price hatched.
- Under the prices there is one lane per connected car with what is planned: Planned, Charging, Extra while cheap or Not enough time, and a tick at the ready-by time.
- You can scrub the chart with a finger, the mouse or the arrow keys, also into hours that have no price yet. The head shows the time and the price. One line under the chart says what each car does at that time, for example "XC40 Charging · EX30 Planned".
- The legend also explains the hatched hours ("No price yet"). It is kept short ("Extra") so it stays within two lines on a phone.
- While Force charge overrides the plan, the lanes are greyed out, the legend says "Paused by Force charge" and the line under the chart reads "XC40 paused".
- With no car connected the chart is titled "Electricity price" and shows prices only.

Car tiles:

- The free text under the car name is replaced by up to four short rows: Guaranteed ("80% by 07:00"), Extra ("to ≈ 96% while cheap" or "none tonight"), Next ("Starts 22:00", "Charging until 23:00", "After Volvo XC40", "Done") and Cost ("≈ €4.91 · saves ≈ €1.29").
- A warning is one line above the rows, for example "Not enough time · ≈ 74% by 07:00".
- The gauge shows the level reached with extra charging as a thin arc and reads it out ("…, minimum 80%, up to 96% while cheap").
- On a phone each row puts its label above its value. On a wide card they share one line.

Hero:

- While Intelligent charging governs, the title is one plain sentence: "Charging Volvo XC40", "Next charge at 22:00", "Both cars ready", "Volvo XC40 ready" or "Waiting for a vehicle".
- One line under it says when the cars are ready ("Ready by 07:00") and adds "then extra while cheap" when extra charging is planned.
- The separate time pill of the Intelligent charging group is gone, because the title now says it. Warning pills and the other plan pills stay.

Intelligent page:

- "Minimum charge" is now labelled "At least", with the line "Charges to at least this level by the ready-by time."
- A new block "Above the minimum" explains the extra charging. It shows the cheap price the integration has learned, or says that extra charging starts once five days of prices are known. There is nothing to set.
- With integration 0.0.9.x the page still shows "Top up when price is low" and its price.

Other:

- "Top-up" is now "extra while cheap" everywhere the 0.0.10.0 path shows it, including the classic tiles and the plan list on the Intelligent page.
- The card's own one-minute refresh is removed. The chart refreshes itself every 30 seconds and the rest of the card follows it.
- A field you are editing on the Intelligent page (ready-by time, "At least", the 0.0.9.x top-up price) is no longer touched when the card redraws. The text you typed, the focus and the cursor position stay. Before, a redraw while typing could move the cursor to the start of a number.

Validation: typecheck, production build and 314 offline smoke checks. The plan-layout checks were rewritten for the chart, the rows and the new wording (the 0.4.2 behaviour checks that still apply were kept and adapted). Browser check `npm run test:layout`: 90 of 90 states pass in Chromium and in WebKit (15 states at 320, 360 and 390 px, light and dark). Screenshots at 320 and 390 px in both themes were reviewed for no car, one car, two cars with extra charging, a charging car, not enough time, Force charge, a 0.0.9.x payload and the Intelligent page in both "Above the minimum" states. Typing into the "At least" and ready-by fields while the card redraws was also tried in Chromium and WebKit. Built and tested against a local build of `@bitosome/ha-card-ui` 1.8.0 before its release. Not checked on a real dashboard or a real phone.

## 0.4.2 — 2026-11-10

Fixes for the plan layout after a review in Chromium and WebKit. `@bitosome/ha-card-ui` stays at 1.5.0.

Timeline:

- Hour labels, lane labels and the caption under the battery number are now 11 px at every card width. Before, they shrank to 7–9 px on a phone and grew to 16 px on a wide card. Hour labels are thinned on narrow cards so they never touch.
- Negative prices are drawn below a zero line and zero prices sit on it. Before, both looked like the same small stub.
- The height of the price bars and the "cheap" shading use published prices only. Forecast hours, which are drawn hatched, no longer change them.
- While Force charge overrides the plan, the planned blocks are dimmed and the timeline says "Plan paused by Force charge".
- The "now" line moves once a minute, also when nothing else changes. It no longer strikes through the hour labels, and "no price yet" steps aside for it.
- Hour labels follow a 12-hour profile ("9p", "12a") and sit on full local hours in half-hour time zones.
- Lane labels tell the cars apart: "XC40" and "EX30" instead of the last word of the name, and "Other" for an unidentified car.
- A connected car without a plan keeps an empty lane. A charger with an error keeps its lane but not its plan. Unreachable chargers are named as unreachable, not as "no vehicle connected".
- "Ready by" lists both times when the two cars differ and leaves out a time that is past or outside the timeline. At-risk and top-up blocks have their own legend entries. The legend says "Price" when prices are shorter than an hour.
- An outdated plan whose hours have all passed is no longer drawn.

Tiles and totals:

- A very long vehicle name without spaces now wraps inside its tile instead of running out of it.
- With one car connected, the empty charger tile keeps its own short height beside the car tile.
- "Next start" reads "Now" whenever a planned block is running or the start time has passed. Before, it could show a time in the past.
- The ring around the gauge and the charging block keep their rhythm when the card redraws. Before, they restarted on every update.

Layout switch:

- The card no longer flips to the classic layout while the controller is unavailable, for example during a Home Assistant restart. The choice also survives a page reload during the outage.
- Settings → Card layout has a third choice, Auto, which removes the choice saved on this device.
- A second card for the same controller follows the choice at once.
- Settings is always reachable from the plan chooser, also without a charge-policy or duty-cycle entity.
- The card reports a taller size to the dashboard for the plan layout with a car connected.

Validation: typecheck, production build and 285 offline smoke checks (47 new). New optional browser check `npm run test:layout` (needs Playwright, skipped without it): 66 of 66 states pass in Chromium and in WebKit (11 states at 320, 360 and 390 px, light and dark). Screenshots at 320 and 390 px in both themes were reviewed for no car, one car, two cars, a charging car, Force charge, negative prices, a 37-character name and a 12-hour profile. Not checked on a real dashboard or a real phone.

## 0.4.1 — 2026-11-10

- Fix the plan layout when no car is connected: a charger without a car kept the classic heading row inside a half-width tile, so its name and status wrapped one letter per line on a phone. It is now a short centred tile with the charger icon, name, status and last session. The timeline legend no longer lists Planned and Charging when there is no car.

Validation: typecheck, production build and 238 offline smoke checks (2 new); checked in Chrome at 390 and 320 px with no car, one car, two cars, a charging car, a charger error and an unreachable charger.

## 0.4.0 — 2026-11-10

A new **plan layout** built around Intelligent charging. It is the default when the integration supports Intelligent charging (0.0.9.0+); the earlier tiles stay available as the **classic** layout.

- Night timeline under the hero: price per hour, one lane of planned blocks per connected car, a "now" line and each car's ready-by marker. Hours without a published price are hatched. The timeline has a text description for screen readers.
- Car tiles become gauges: battery level, projected level and a tick at the minimum, inside a segmented ring that mirrors the charger's LED ring. The ring breathes while waiting and runs a chase while charging, at the WLED effect speed. Planned blocks use the LED idle colour and the running block the LED charging colour, so the card and the charger show the same state.
- Totals row: planned cost, saving and next start.
- Layout switch: the `layout: plan | classic` card option sets the default, and Settings → Card layout overrides it on this device.
- This layout is a pilot that departs from the Space Hub look; the timeline is drawn by the card itself, not by the shared chart. `@bitosome/ha-card-ui` stays at 1.5.0.

Validation: typecheck, production build and 236 offline smoke checks (13 new for the plan layout and the layout switch); checked in Chrome on the local preview in light and dark themes.

## 0.3.0 — 2026-11-10

Requires SmartEVSE Dual Charger integration 0.0.9.0 for Intelligent charging; with older integrations the card looks and behaves as before. `@bitosome/ha-card-ui` stays at 1.5.0.

Rollback: older integrations ignore Intelligent charging, so after installing an integration older than 0.0.9.0 only Schedule (if on) plans charging. The card never turns Schedule off, so a schedule left on takes over by itself.

- Add **Intelligent charging** as a third plan tile (`mdi:brain`) with the same switch and glow as Schedule and Force charge. Intelligent and Schedule are independent standing plans: switching one never changes the other, and Intelligent has priority while both are on. Force charge still overrides both.
- Add the Intelligent page: the plan first (chronological blocks, top-up marked, per-car "53% → 80% by 07:00 · ≈ €4.91 · saving ≈ €1.29", totals with "Saving vs charging at plug-in", "Charges first" opening Charge policy, price horizon, "Waiting for tomorrow's prices (about 15:00) · plan updates then" while they are pending or "Hours without prices are used only if needed", and learning progress), then per-vehicle Ready by and Minimum charge fields, a learned departure suggestion pill, and Top up when price is low with its own Top up below price. Ready-by, minimum charge and top-up price save on blur or Enter only, never per edited segment or spinner step; a value entered during a save is written after it. The field being saved shows its own pending state and stays enabled, the other controls stay usable, and the press that moved focus (Back included) is not lost.
- Show an enabled-only Intelligent group in the hero with one time pill (next start, or "Until" during a planned block) and warning pills ("Not enough time for Volvo EX30", or "… for both" only when two cars compete for the time; "Check Volvo XC40"); no money in the hero. The hero button now has an accessible description of its status and pills.
- Add plan lines to connected charger tiles (target and the plan's deadline, then cost and saving; forecast marked, partial omitted; an estimated plan, such as an unidentified car's, names its energy instead of a target, "≈ 30 kWh by 07:00", also in the per-car summary and the page totals) and mark the effective minimum on the battery meter, which now speaks "53%, minimum 80%". Warning plan lines keep the normal text colour and carry the shared warning glyph, so they stay readable on light themes. A disconnected charger shows its last realised saving; History records show the saving vs charging at plug-in or "Force charge used", combining every deadline window of a plug-in and ignoring empty ones.
- New reason titles: Waiting for planned charge, Minimum charge reached, Waiting for a vehicle, Identifying vehicle, Charging without price data, Charger connection unavailable. "Minimum charge reached" appears only when every planned car is at its minimum; a car that refuses charge reads "Volvo XC40 isn’t accepting charge", a car given up below its minimum or with an unknown level "Charging complete", and connected cars left out by the charge policy "Waiting for the selected vehicle". Fix three titles that fell through before: `smartevse_N_only_selected_ev_already_complete`, `smartevse_N_api_unavailable` and `waiting_for_connected_ev`.
- Non-blocking controller warnings (Intelligent price or plan unavailable, the car's own charging timer, vehicle data or mapping) read as warning notices instead of "Controller error"; blocking errors keep the title but no longer print raw identifiers.
- The card re-renders only when the Intelligent payload or one of its entities changes, so an unchanged plan never replaces a field being edited.
- Preview: add an "Intelligent charging · two cars" scenario and the brain, warning and battery-plus icons.

Validation: typecheck, production build and 223 offline smoke checks (85 new, covering the plan-toggle contract, page save contracts, suggestion pill, pending states, reason titles (including finished-plan titles from car statuses and when "both" applies), warning notices, warning-line colour, tile lines, estimated plans and money rules, compact-tile and history savings, no re-render on an identical payload and omission of missing entities). No physical charger commands were sent.

## 0.2.1 — 2026-11-03

- Bundle `@bitosome/ha-card-ui` 1.5.0. The vehicle battery bar is the shared family level meter, so it matches the Volvo battery and the Vallox fan speed; the battery bands now come from the shared library. Unselected charge-policy pills keep their label centred.

## 0.2.0 — 2026-11-03

- Adopt `@bitosome/ha-card-ui` 1.4.0 status colours: charger states, plan pills and the battery meter now use the shared success, warning, error and unavailable aliases, so the bar and the "Charging" text can no longer show two greens. An unavailable charger reads in the quiet unavailable colour instead of amber. Battery thresholds are unchanged.
- Show errors and unavailable plan fields as shared notices with a severity icon. Charging history uses the same notice for ledger errors and a plain empty state when no session is recorded.
- Show progress on the control that sent a command: plan toggles, price and timer switches, plan fields and the chosen policy show a spinner with `aria-busy` and stay fully readable while the other controls dim, and Apply turns into "Saving…". A dismissed request keeps its status with the same indicator on the main card.
- Move Apply and Cancel into the dialog footer as equal-width shared buttons, with Apply as the primary action.
- Render Schedule and Force charge as shared chips that keep their on-state icon, with quieter constraint chips. Charge-policy choices are shared toggle pills that expose their pressed state.
- Format prices, energy, current, costs, durations and times from the Home Assistant profile (language, number format, 12/24-hour clock and time zone). Durations read like `5 min` or `1 h 30 min`; missing values read "Unavailable".
- Match the family card shell (theme radius, divider border, no heavy shadow), use sentence-case 12px labels, keep the expanded plan face neutral and let enabled plan glows follow the WLED idle effect. Remove unused tokens and dead control-tile styles.

Validation: typecheck, production build and 139 offline smoke checks, including new checks for shared notices, control-level pending states, the equal footer, pressed policy choices, shared chips and HA-aware formatting. No physical charger commands were sent.

## 0.1.7 — 2026-11-02

- Colour the connected vehicle's battery meter by level: green from 60 %, yellow from 20 % to 59 %, red below 20 %, using the theme's success, warning and error colours.

Validation: typecheck, production build and offline smoke checks including the new level bands. No physical charger commands were sent.

## 0.1.2 — 2026-10-26

- Use the shared settings cog for editing the charging plan and opening Settings, and advertise modal launchers consistently to assistive technology.
- Give duty-cycle editing a named child page with Back, X and unsaved-draft protection. Keep settings writes and late-response safeguards unchanged.
- Move charging history into its own page; a charger cost opens its history directly, while Settings opens it as a child page. Remove redundant embedded-section spacing.
- Restore focus to the actual tapped control on touch browsers even when live telemetry replaces the card markup.

Validation: typecheck, production build and 116 offline smoke checks. Browser checks cover 320px/390px widths, short landscape, light/dark presentation, protected drafts and focus return. No physical charger commands were sent.

## 0.1.1 — 2026-10-25

- Size Settings to its content instead of forcing a tall dialog with unused space. Expanded charging history still scrolls inside the bounded shared modal body.

Validation: typecheck, production build and 108 smoke checks, plus 390px mobile and short-landscape browser checks. No physical charger commands were sent.

## 0.1.0 — 2026-10-25

- Bundle the versioned `@bitosome/ha-card-ui` library instead of maintaining local copies of shared UI code. Home Assistant still loads one self-contained card resource.
- Use the shared modal flow for charging plans, settings, per-setting pages and charger details: Back returns one page, and X or Escape closes the complete flow.
- Reuse shared draft-discard confirmation, route scroll restoration, safe-area sizing, focus handling and native Home Assistant dialog handoff. Keep charging requests immutable and prevent competing writes while services are pending.
- Preserve editable values, caret position and history disclosures across live telemetry updates. Retain the existing WLED state/glow mapping and all charging service behavior.

Validation: typecheck, production build and 107 offline smoke checks covering existing charge-plan/race protections plus shared navigation, dirty drafts, focus and native-dialog handoff. No physical charger commands were sent.

## 0.0.55 — 2026-10-25

- Keep an in-flight charging plan immutable when its dialog is dismissed, reopened or replaced by settings. Stale telemetry cannot clear a requested price gate, and later commands retain the original price, duration and target entities.
- Share pending protection across charging and settings: prevent duplicate or competing writes, retain pending/error feedback after dismissal, and keep late responses from closing a newer settings view.
- Add slow-service regressions for schedule price gates, combined timer/price plans, configuration changes, settings reopening and rejected writes.

Validation: typecheck/build and 99 offline smoke cases; no physical charger commands were sent.

## 0.0.54 — 2026-10-25

- Adopt the shared Space Hub presentation primitives, token synchronization and source/hash provenance.
- Use a stable native dialog for charging plans, settings and history with one MDI X convention, safe-area margins, a fixed header and a scrollable body.
- Move charger diagnostics into a detail dialog so opening them does not shift the dashboard. Current offered remains distinct from measured current or power.
- Retain keyboard focus, input caret, history disclosures and dialog scroll position across telemetry updates.
- Protect unsaved or rejected local values with an explicit discard confirmation. A pending request can be dismissed; its status and errors remain visible on the card and reopening does not enable duplicate writes.
- Align icon targets and spacing while preserving enabled plan pills, per-charger battery/cost estimates, WLED semantics and existing capability validation.

Validation: typecheck/build and smoke regression coverage, including native dialog identity, focus return, keyboard navigation, dirty drafts, pending dismissal, duplicate prevention, charging services and cost history. Browser previews checked at 320px/390px phone widths and short landscape height. No physical charger commands were sent during validation.
