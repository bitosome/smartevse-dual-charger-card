# SmartEVSE Dual Charger Card

Standalone Lovelace card extracted from the SmartEVSE Dual Charger integration project.

This repository contains only the frontend card and its local preview assets.

Version: `0.0.1`

## Contents

- Source card implementation: `lovelace/smartevse-flow-card.js`
- HACS/manual frontend artifact: `smartevse-dual-charger-card.js`
- Example dashboard YAML: `card_flow.yaml`
- Local preview page: `preview/index.html`

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

## Custom Element

- `custom:smartevse-flow-card`

## Expected Entities

The card is built around:

- `sensor.smartevse_dual_charger_controller_state`

and the related control entities used in `card_flow.yaml`, including:

- schedule switch/entity
- force charge switches
- acceptable price number
- charge policy select
- duty cycle number
- force charge duration number
- duty/timer remaining sensors

## Charging Mode Interaction

The card displays multiple charging control modes that can be enabled simultaneously:

### Schedule Mode
- **Entity**: `switch.smartevse_dual_charger_charge_with_schedule`
- **Purpose**: Time-based charging according to a schedule
- **States**: Off, Armed (waiting for schedule window), On now (within schedule window)

### Force By Price Mode
- **Entity**: `switch.smartevse_dual_charger_force_charge_by_price`
- **Purpose**: Price-based charging that only charges when electricity price is acceptable
- **States**: Off, Waiting (price too high), Accepted (price acceptable)

### Combined Behavior

When both Schedule and Force By Price are enabled simultaneously:

- The card displays visual indicators showing both modes are active
- Schedule control shows: **"Active with price check"** or **"Armed with price check"**
- Force By Price control shows: **"Within schedule"** when waiting for acceptable price
- This indicates that **both conditions must be satisfied** for charging to occur

**Important**: The actual charging decision logic is implemented in the SmartEVSE Dual Charger backend integration. This card is a **display-only component** that visualizes the current state and provides control switches. The backend determines:
- Whether schedule overrides price checking, or vice versa
- The priority order when multiple modes are enabled
- The final `charge_allowed` decision

Refer to the SmartEVSE Dual Charger integration documentation for the backend behavior and priority rules.

## Preview

From this repository root:

```bash
python3 -m http.server
```

Then open:

- `http://localhost:8000/preview/`

The preview renders the real card against mock Home Assistant state.
