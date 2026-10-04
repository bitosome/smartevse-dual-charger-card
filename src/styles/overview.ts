/** Overview presentation. Colors/glow/shape are inherited from Space Hub tokens and WLED. */
export const OVERVIEW_CSS = `
  :host {
    --sdc-font-tiny: 10px;
    --sdc-font-label: 11px;
    --sdc-font-detail: 12px;
    --sdc-font-body: 13px;
    --sdc-font-button: 13px;
    --sdc-font-value: 14px;
    --sdc-font-title: 18px;
    --sdc-font-icon: 20px;
  }
  .flow-stage {
    container: charging-overview / inline-size;
    isolation: isolate;
    gap: var(--large-gap);
  }
  .house-node, .ev-row { z-index: auto; }
  .status-hero { padding: 18px; min-height: 0; clip-path: none; overflow: visible; }
  .status-hero.visual-idle, .status-hero.visual-charging, .status-hero.visual-error,
  .ev-node { box-shadow: var(--tile-shadow-default); }
  .overview-heading {
    display: flex; justify-content: space-between; align-items: center;
    gap: var(--large-gap); margin-bottom: 14px;
    font-size: 12px; font-weight: 600; color: var(--secondary-text-color);
  }
  .edit-plan { display: inline-flex; align-items: center; gap: 2px; color: var(--primary-color); }
  .edit-plan ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; }
  .status-copy { gap: 14px; }
  .status-title { font-size: 21px; font-weight: 600; line-height: 1.3; letter-spacing: -.025em; }
  .overview-note { margin: 0; color: var(--secondary-text-color); font-size: 13px; line-height: 1.5; }
  .status-pill-groups { gap: var(--large-gap); }
  .status-pill-group { gap: var(--medium-gap); }
  .status-pill-group-items { display: contents; }
  .status-pill-group + .status-pill-group { padding-top: var(--large-gap); margin-top: 0; }
  .status-pill, .status-pill-group-label {
    min-height: 28px; height: auto; padding: 4px 8px;
    font-size: 12px; line-height: 1.4; white-space: normal; overflow: visible; overflow-wrap: anywhere;
    border: none;
  }
  .status-pill-group-label {
    padding: 3px 8px; white-space: nowrap;
    color: var(--sdc-action-color); background: color-mix(in srgb, var(--sdc-action-color) 18%, var(--chip-background-color));
    border: 1px solid color-mix(in srgb, var(--sdc-action-color) 32%, transparent);
  }
  .status-pill-icon, .status-pill-group-label .status-pill-icon {
    --mdc-icon-size: 17px; height: 17px; width: 17px; flex: 0 0 17px; margin-right: 5px;
  }
  .status-pill-group-label .status-pill-icon { --mdc-icon-size: 20px; width: 20px; height: 20px; flex-basis: 20px; }
  .plan-note {
    display: inline-flex; align-items: center; min-height: 28px; max-width: 100%; padding: 4px 8px;
    border-radius: var(--chip-border-radius); background: color-mix(in srgb, var(--secondary-text-color) 13%, var(--chip-background-color));
    color: var(--secondary-text-color); font-size: var(--sdc-font-label); line-height: 1.4; order: 2;
  }
  .status-runtime-pills { margin: 0; }
  .ev-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--large-gap); margin: 0; align-items: start; }
  .ev-node { padding: 18px 18px 0; clip-path: none; overflow: visible; }
  .charger-heading { display: flex; align-items: center; gap: var(--large-gap); min-width: 0; }
  .charger-icon {
    width: 42px; height: 42px; flex: 0 0 42px; display: grid; place-items: center;
    border-radius: var(--tile-border-radius); background: var(--chip-background-color); color: var(--secondary-text-color);
  }
  .charger-icon ha-icon { --mdc-icon-size: 24px; height: 24px; width: 24px; }
  .charger-copy { flex: 1; min-width: 0; }
  .charger-name { color: var(--secondary-text-color); font-size: 11px; font-weight: 600; line-height: 1.45; }
  .vehicle-name { margin: 3px 0 6px; font-size: 17px; line-height: 1.3; font-weight: 600; overflow-wrap: anywhere; letter-spacing: -.015em; }
  .charger-status { display: flex; align-items: center; gap: 6px; color: var(--secondary-text-color); font-size: 12px; line-height: 1.5; }
  .state-dot { height: 6px; width: 6px; flex: 0 0 6px; border-radius: 50%; background: currentColor; }
  .tone-charging .charger-status, .tone-complete .charger-status { color: var(--status-success-color); }
  .tone-error .charger-status { color: var(--status-alert-color); }
  .tone-unavailable .charger-status { color: var(--status-warn-color); }
  .visual-charging .charger-icon { color: var(--status-success-color); }
  .battery-value { font-size: 28px; font-weight: 600; line-height: 1; letter-spacing: -.045em; font-variant-numeric: tabular-nums; }
  .battery-value span { font-size: 13px; color: var(--secondary-text-color); margin-left: 2px; letter-spacing: 0; }
  .battery-track { height: 5px; border-radius: 99px; background: color-mix(in srgb, var(--secondary-text-color) 15%, transparent); margin-top: 18px; overflow: hidden; }
  .battery-track span { height: 100%; display: block; background: var(--status-success-color); border-radius: inherit; }
  .charger-message { font-size: 12px; line-height: 1.5; margin: var(--large-gap) 0 0; color: var(--secondary-text-color); overflow-wrap: anywhere; }
  .compact { padding-bottom: 18px; }
  .compact .charger-status { margin-top: 3px; }
  .charger-details { margin-top: var(--medium-gap); font-size: 12px; }
  .charger-details summary { display: flex; justify-content: space-between; align-items: center; min-height: 44px; color: var(--secondary-text-color); cursor: pointer; list-style: none; }
  .charger-details summary::-webkit-details-marker { display: none; }
  .charger-details summary ha-icon { --mdc-icon-size: 16px; width: 16px; height: 16px; }
  .charger-details[open] summary ha-icon { transform: rotate(180deg); }
  .charger-details dl { border-top: var(--sdc-border-faint); margin: 0; padding: var(--large-gap) 0 16px; display: grid; gap: 10px; }
  .charger-details dl div { display: flex; justify-content: space-between; gap: var(--large-gap); }
  .charger-details dt { color: var(--secondary-text-color); }
  .charger-details dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
  .advanced-settings { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; border: 0; background: transparent; color: var(--secondary-text-color); font: inherit; font-size: 13px; margin-top: var(--large-gap); cursor: pointer; }
  .advanced-settings ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; }
  .modal-back, .modal-close { min-width: 44px; min-height: 44px; }
  .modal-title { font-size: 19px; line-height: 1.35; }
  .wizard-option-title, .wizard-toggle-copy { font-size: 14px; }
  .wizard-plan-toggle, .wizard-plan-toggle.selected { width: 44px; height: 44px; background: transparent; }
  .wizard-plan-toggle::before { content: ""; position: absolute; top: 11px; left: 3px; width: 38px; height: 22px; border-radius: 99px; background: color-mix(in srgb, var(--secondary-text-color) 34%, transparent); }
  .wizard-plan-toggle.selected::before { background: var(--sdc-action-color); }
  .wizard-plan-toggle-thumb { top: 14px; left: 6px; }
  .control-unavailable { display: block; color: var(--secondary-text-color); font-size: 11px; margin-top: 4px; }
  .settings-panel .setting-controls { grid-template-columns: 1fr; }
  .dialog-panel { outline: none; }
  .setting-input { font-size: 16px; }
  button:focus-visible, summary:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 3px; }
  @container charging-overview (max-width: 540px) {
    .ev-row { grid-template-columns: 1fr; }
  }
  @container charging-overview (max-width: 340px) {
    .status-hero, .ev-node { padding-left: 14px; padding-right: 14px; }
    .status-title { font-size: 19px; }
    .charger-heading { gap: 10px; }
    .charger-icon { width: 34px; height: 38px; flex-basis: 34px; }
    .battery-value { font-size: 25px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .glow-under, .glow-overlay { animation: none !important; }
    *, *::before, *::after { transition: none !important; }
  }
`;
