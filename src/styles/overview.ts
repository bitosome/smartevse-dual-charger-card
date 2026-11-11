/** Overview presentation. Colors/glow/shape are inherited from Space Hub tokens and WLED. */
export const OVERVIEW_CSS = `
  :host {
    --sdc-font-detail: 12px;
    --sdc-font-body: 13px;
    --sdc-font-value: 14px;
    --sdc-font-icon: 20px;
  }
  .flow-stage {
    container: charging-overview / inline-size;
    isolation: isolate;
    gap: var(--large-gap);
  }
  .house-node, .ev-row { z-index: auto; }
  .status-hero { padding: 16px; min-height: 0; clip-path: none; overflow: visible; }
  .status-hero.visual-idle, .status-hero.visual-charging, .status-hero.visual-error,
  .ev-node { box-shadow: var(--tile-shadow-default); }
  .overview-heading {
    display: flex; justify-content: space-between; align-items: center;
    gap: var(--large-gap); margin-bottom: 12px;
    font-size: 12px; font-weight: 600; color: var(--secondary-text-color);
  }
  .edit-plan { display: inline-flex; align-items: center; flex-shrink: 0; gap: 6px; color: var(--primary-color); }
  .edit-plan ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; }
  .status-copy { gap: 14px; }
  .status-title { font-size: 21px; font-weight: 600; line-height: 1.3; letter-spacing: -.025em; overflow-wrap: anywhere; }
  .overview-note { margin: 0; color: var(--secondary-text-color); font-size: 13px; line-height: 1.5; }
  .flow-stage > .overview-note, .dialog-content > .overview-note,
  .flow-stage > .family-notice, .flow-stage > .pending-note {
    position: relative; z-index: 1;
  }
  .flow-stage > .overview-note, .dialog-content > .overview-note, .flow-stage > .pending-note { background: var(--sdc-surface-panel); }
  .status-pill-groups { gap: var(--large-gap); }
  .status-pill-group { gap: var(--medium-gap); }
  .status-pill-group-items { display: contents; }
  .status-pill-group + .status-pill-group { padding-top: var(--large-gap); margin-top: 0; }
  /* Plan pills are shared .family-chip elements; the enabled-state label keeps its toggle icon. */
  .status-pill-group-label { flex: 0 0 auto; white-space: nowrap; }
  .status-pill-group .plan-note { max-width: 100%; color: var(--secondary-text-color); order: 2; }
  .status-runtime-pills { margin: 0; }
  .ev-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--large-gap); margin: 0; align-items: start; }
  .ev-node { padding: 16px 16px 0; clip-path: none; overflow: visible; }
  .charger-heading { display: flex; align-items: center; gap: var(--large-gap); min-width: 0; }
  .charger-icon {
    width: 44px; height: 44px; flex: 0 0 44px; display: grid; place-items: center;
    border-radius: var(--tile-border-radius); background: var(--chip-background-color); color: var(--secondary-text-color);
  }
  .charger-icon ha-icon { --mdc-icon-size: 24px; height: 24px; width: 24px; }
  .charger-copy { flex: 1; min-width: 0; }
  .charger-name { overflow-wrap: anywhere; color: var(--secondary-text-color); font-size: 11px; font-weight: 600; line-height: 1.45; }
  .vehicle-name { margin: 3px 0 6px; font-size: 17px; line-height: 1.3; font-weight: 600; overflow-wrap: anywhere; letter-spacing: -.015em; }
  .charger-status { overflow-wrap: anywhere; display: flex; align-items: center; gap: 6px; color: var(--secondary-text-color); font-size: 12px; line-height: 1.5; }
  .state-dot { height: 6px; width: 6px; flex: 0 0 6px; border-radius: 50%; background: currentColor; }
  .tone-charging .charger-status, .tone-complete .charger-status { color: var(--family-success); }
  .tone-error .charger-status { color: var(--family-error); }
  .tone-unavailable .charger-status { color: var(--family-unavailable); }
  .visual-charging .charger-icon { color: var(--family-success); }
  .charger-totals { min-width: 0; display: grid; gap: 5px; text-align: right; flex: 0 0 auto; max-width: 38%; }
  .session-cost { display: grid; gap: 3px; padding: 6px 0; min-height: 44px; border: 0; background: none; color: var(--primary-text-color); text-align: right; font: inherit; cursor: pointer; }
  .session-cost strong { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .session-cost small { font-size: 11px; line-height: 1.4; color: var(--secondary-text-color); }
  .session-cost.empty { cursor: default; }
  .cost-history > .cost-note:first-child { margin-top: 0; }
  .cost-note, .cost-record-details { font-size: 12px; color: var(--secondary-text-color); line-height: 1.5; }
  .cost-charger { margin: 10px 0; padding: 0 10px; background: var(--chip-background-color); border-radius: var(--tile-border-radius); }
  .cost-charger > summary { display: flex; align-items: center; gap: 8px; min-height: 48px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .cost-charger-name { min-width: 0; flex: 1; overflow-wrap: anywhere; }
  .cost-charger-count { color: var(--secondary-text-color); white-space: nowrap; font-size: 12px; font-weight: 400; }
  .cost-charger[open] > summary > .cost-disclosure, .cost-record[open] > summary .cost-disclosure { transform: rotate(180deg); }
  .cost-disclosure { transition: transform 160ms ease; }
  .cost-charger ha-icon { --mdc-icon-size: 20px; width: 20px; height: 20px; flex: 0 0 20px; }
  .cost-charger summary, .cost-record summary { list-style: none; }
  .cost-charger summary::-webkit-details-marker { display: none; }
  .cost-record { border-top: var(--sdc-border-faint); }
  .cost-record summary { display: flex; align-items: start; justify-content: space-between; gap: 12px; padding: 12px 0; min-height: 44px; cursor: pointer; }
  .cost-record-copy, .cost-record-value { display: grid; gap: 5px; min-width: 0; overflow-wrap: anywhere; }
  .cost-record strong { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .cost-record small { font-size: 11px; color: var(--secondary-text-color); }
  .cost-record-value { text-align: right; flex-shrink: 0; max-width: 44%; }
  .cost-record-amount { display: flex; align-items: center; justify-content: end; gap: 6px; }
  .cost-record-amount ha-icon { width: 16px; height: 16px; --mdc-icon-size: 16px; flex-basis: 16px; }
  .cost-record-details p { margin: 4px 0 10px; }
  .battery-value { font-size: 28px; font-weight: 600; line-height: 1; letter-spacing: -.045em; font-variant-numeric: tabular-nums; }
  .battery-value span { font-size: 13px; color: var(--secondary-text-color); margin-left: 2px; letter-spacing: 0; }
  /* The bar is the shared levelMeter(); the card only places it. */
  .battery-meter { margin-top: 18px; }
  .charger-message { font-size: 12px; line-height: 1.5; margin: var(--large-gap) 0 0; color: var(--secondary-text-color); overflow-wrap: anywhere; }
  /* Intelligent plan facts: quiet 12px lines under the meter; no glow, no extra € in the totals column. */
  .charger-plan { display: grid; gap: 2px; margin: var(--large-gap) 0 0; }
  .charger-plan-line { margin: 0; font-size: 12px; line-height: 1.5; color: var(--secondary-text-color); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  /* A warning line reads in the primary text colour; the shared warning glyph carries the tone. */
  .charger-plan-line[data-tone="warning"] { color: var(--primary-text-color); }
  .plan-tone-icon { --mdc-icon-size: 14px; width: 14px; height: 14px; margin-inline-end: 4px; vertical-align: -2px; color: var(--family-tone, var(--family-warning)); }
  .compact .charger-plan { margin-top: var(--medium-gap); }
  .compact { padding-bottom: 18px; }
  .compact .charger-status { margin-top: 3px; }
  .charger-details { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 44px; margin-top: var(--medium-gap); padding: 0; border: 0; background: none; font: inherit; font-size: 12px; color: var(--secondary-text-color); cursor: pointer; }
  .charger-details ha-icon { --mdc-icon-size: 20px; width: 20px; height: 20px; }
  .charger-diagnostics { margin: 0; display: grid; gap: 12px; font-size: 13px; line-height: 1.5; }
  .charger-diagnostics div { display: flex; justify-content: space-between; gap: 16px; }
  .charger-diagnostics dt { color: var(--secondary-text-color); }
  .charger-diagnostics dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .advanced-settings { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; border: 0; background: transparent; color: var(--secondary-text-color); font: inherit; font-size: 13px; margin-top: var(--large-gap); cursor: pointer; }
  .advanced-settings { gap: 8px; text-align: left; position: relative; z-index: 1; background: var(--sdc-surface-panel); }
  .charging-history-launcher { margin-top: 0; padding: 12px 16px; border-radius: 16px; }
  .advanced-settings span { flex: 1; }
  .settings-panel .setting-tile { grid-template-columns: auto minmax(0, 1fr) auto; }
  .setting-next { --mdc-icon-size: 18px; width: 18px; height: 18px; color: var(--secondary-text-color); }
  .advanced-settings ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; }
  .wizard-option-title, .wizard-toggle-copy { font-size: 14px; }
  .wizard-plan-toggle, .wizard-plan-toggle.selected { width: 44px; height: 44px; background: transparent; }
  .wizard-plan-toggle::before { content: ""; position: absolute; top: 11px; left: 3px; width: 38px; height: 22px; border-radius: 99px; background: color-mix(in srgb, var(--secondary-text-color) 34%, transparent); }
  .wizard-plan-toggle.selected::before { background: var(--sdc-action-color); }
  .wizard-plan-toggle-thumb { top: 14px; left: 6px; }
  .control-unavailable { display: block; color: var(--secondary-text-color); font-size: 11px; margin-top: 4px; }
  .settings-panel .setting-controls { grid-template-columns: 1fr; }
  .dialog-panel { outline: none; }
  .setting-input, .setting-select { font-size: 16px; min-height: 44px; min-width: 0; }
  .charger-diagnostics dt, .charger-diagnostics dd { min-width: 0; overflow-wrap: anywhere; }
  button:focus-visible, summary:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 3px; }
  @container charging-overview (max-width: 540px) {
    .ev-row { grid-template-columns: 1fr; }
  }
  @container charging-overview (max-width: 340px) {
    .status-hero, .ev-node { padding-left: 14px; padding-right: 14px; }
    .status-title { font-size: 19px; }
    .charger-heading { gap: 10px; }
    /* The charger name already identifies the port; the decorative icon gives
       its space to the vehicle and cost on a narrow dashboard column. */
    .charger-icon { display: none; }
    .charger-totals { max-width: 44%; }
    .battery-value { font-size: 25px; }
  }
  /* ---- Plan layout (0.4.0; chart 0.5.0; compact tiles 0.6.0): plan chart, one compact tile per
     charger with the shared battery meter, one saving line. Plan periods and the glows under
     the tiles take the WLED state colours (--sdc-led-*, --node-*). */
  .layout-choice { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: var(--large-gap); }
  .layout-options { display: flex; flex-wrap: wrap; gap: 6px; }
  .layout-option { cursor: pointer; font: inherit; }
  .layout-option[aria-pressed="true"] { box-shadow: inset 0 0 0 1px var(--primary-color); }
  .layout-plan { --sdc-quiet: color-mix(in srgb, var(--primary-text-color) 16%, transparent); --sdc-quiet-strong: color-mix(in srgb, var(--primary-text-color) 38%, transparent); }
  /* The plan chart is the shared time-series chart (@bitosome/ha-card-ui) with the price bars
     and colours of the Real Electricity Price card; the card only places it and, in its inline
     style, maps the period tones to the charger's LED colours. */
  .flow-stage > .plan-chart { position: relative; z-index: 1; }
  /* Car tiles: one compact tile per charger across the card (two side by side on a wide card).
     Name and state, the shared horizontal battery meter with the minimum marked, short facts. */
  .layout-plan .ev-row { grid-template-columns: minmax(0, 1fr); gap: var(--large-gap); }
  .ev-pod { display: grid; gap: 8px; align-content: start; padding: 12px 14px; }
  .ev-pod, .ev-pod * { min-width: 0; }
  .pod-head { display: flex; align-items: center; gap: 10px; }
  .pod-copy { flex: 1 1 auto; display: grid; gap: 1px; }
  .ev-pod .vehicle-name { margin: 0; font-size: 16px; line-height: 1.3; }
  /* break-word, never "anywhere": "anywhere" shrinks min-content and wraps one letter per line. */
  .ev-pod .charger-name, .ev-pod .vehicle-name, .ev-pod .charger-status { overflow-wrap: break-word; word-break: normal; white-space: normal; }
  .ev-pod .charger-status { display: block; }
  .ev-pod .charger-status .charger-name { font-size: inherit; font-weight: inherit; line-height: inherit; color: inherit; }
  .ev-pod .state-dot { display: inline-block; vertical-align: middle; margin-right: 6px; }
  .ev-pod.empty .charger-status .charger-name { color: var(--primary-text-color); font-weight: 600; }
  .ev-pod .pod-icon { display: inline-flex; flex: none; margin: 0; }
  .ev-pod .battery-value { flex: none; font-size: 24px; }
  .pod-details { flex: none; display: inline-grid; place-items: center; width: 44px; height: 44px; margin: -8px -10px -8px -4px; padding: 0; border: 0;
    border-radius: 50%; background: transparent; color: var(--secondary-text-color); cursor: pointer; }
  .pod-details ha-icon { --mdc-icon-size: 20px; width: 20px; height: 20px; }
  .pod-details:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -4px; }
  .ev-pod .battery-meter { margin-top: 0; }
  .ev-pod .charger-message { margin: 0; }
  .ev-pod .charger-plan { width: 100%; gap: 6px; margin: 2px 0 0; }
  /* Plan facts: two columns of label over value; one column in a very narrow tile. */
  .plan-rows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; margin: 0; }
  .plan-row { display: grid; gap: 0; align-content: start; }
  .plan-row dt { font-size: 11px; line-height: 1.4; color: var(--secondary-text-color); white-space: nowrap; }
  .plan-row dd { margin: 0; font-size: 13px; line-height: 1.4; color: var(--primary-text-color); font-variant-numeric: tabular-nums; overflow-wrap: break-word; }
  /* What the plan saves: a slim foreground surface (opaque, above the glows), not a row of tiles. */
  .plan-saving { display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 12px; border-radius: 12px; background: var(--sdc-surface-control);
    font-size: 12px; line-height: 1.4; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .plan-saving ha-icon { flex: none; --mdc-icon-size: 16px; width: 16px; height: 16px; }
  @container charging-overview (min-width: 620px) {
    .layout-plan .ev-row { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; }
    .layout-plan .ev-node-wrap, .layout-plan .ev-pod { height: 100%; box-sizing: border-box; }
  }
  @container charging-overview (max-width: 250px) {
    .plan-rows { grid-template-columns: minmax(0, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) {
    .glow-under, .glow-overlay { animation: none !important; }
    *, *::before, *::after { transition: none !important; }
  }
`;
