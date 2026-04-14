# SmartEVSE Dual Charger Card

Standalone Lovelace card extracted from the SmartEVSE Dual Charger integration project.

This repository contains only the frontend card and its local preview assets.

Version: `0.0.5`

## Contents

- Card implementation: `smartevse-dual-charger-card.js`
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
- controller-state attributes for:
  - mapped connected EV name
  - mapped EV battery level
  - WLED-derived SmartEVSE visuals

## Preview

From this repository root:

```bash
python3 -m http.server
```

Then open:

- `http://localhost:8000/preview/`

The preview renders the real card against mock Home Assistant state.
