# SmartEVSE Dual Charger Card

Standalone Lovelace card for the SmartEVSE Dual Charger Home Assistant integration.

Version: `0.0.7`

This repository contains only the frontend card and local preview assets.

## Features

- Visual power-flow layout with Home at the top and two SmartEVSE devices below it.
- Animated flow line to the active SmartEVSE using the same charging/idle/error color vocabulary as the integration WLED visuals.
- Per-SmartEVSE state cards with state, mode, offered current, max current, override current, and detected battery level.
- Optional EV battery node below each SmartEVSE when the integration reports a connected EV.
- Charging controls for schedule, force charge, force by price, and force timer.
- Hero tile shows the current controller state and opens the Policy & limits modal when tapped.
- Policy & limits modal edits charge policy, acceptable price, force duration, and duty cycle without opening the native Home Assistant entity dialog.
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
- per-SmartEVSE state, mode, plug state, current, max current, override current, and error
- per-SmartEVSE connected EV name and battery level
- session completion state
- WLED-derived visual state

The card also expects the related control entities configured in `card_flow.yaml`.

## Interaction Model

- Tap the hero tile to open Policy & limits.
- Tap schedule, force charge, force by price, or force timer tiles to toggle them.
- In Policy & limits, charge policy opens as an in-modal submenu with a back button.
- Number/time-like values are edited directly inside the modal.

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
