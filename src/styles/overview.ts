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
  /* The header (0.9.0): title and mode chip; no hero. */
  .overview-header { display: grid; gap: 10px; padding: 2px 4px 0; }
  .overview-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; }
  .overview-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.3; color: var(--primary-text-color); }
  .status-hero.mode-chip { position: relative; display: inline-flex; align-items: center; gap: 8px; width: auto; min-height: 36px; margin: 0; padding: 0 10px 0 12px;
    border: 0; border-radius: 999px; background: color-mix(in srgb, var(--primary-color) 16%, transparent); color: var(--primary-text-color);
    font: inherit; font-size: 13px; font-weight: 600; line-height: 1; cursor: pointer; box-shadow: none; clip-path: none; overflow: visible; }
  /* A 44 px touch target around the 36 px chip. */
  .status-hero.mode-chip::after { content: ""; position: absolute; inset: -4px 0; }
  .status-hero.mode-chip[data-mode="off"] { background: var(--sdc-surface-control); color: var(--secondary-text-color); }
  .mode-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--primary-color); }
  .mode-chip[data-mode="force-charge"] .mode-dot { background: var(--family-warning, var(--warning-color)); }
  .mode-chip[data-mode="off"] .mode-dot { background: var(--secondary-text-color); }
  .mode-chip ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; color: var(--secondary-text-color); }
  /* The status of a state the tiles do not tell: one line, its notes and pills, on a panel. */
  .overview-header .status-copy:not(.family-visually-hidden) { display: grid; gap: 8px; padding: 12px 14px; border-radius: 16px; background: var(--sdc-surface-panel); }
  .overview-header .status-title { font-size: 15px; font-weight: 600; letter-spacing: 0; }
  .overview-header.visual-error .status-title { color: var(--family-error, var(--error-color)); }
  /* The chip names the mode; the group's own label chip would say it twice. */
  .overview-header .status-pill-group-label { display: none; }
  .overview-header .status-pill-group + .status-pill-group { padding-top: var(--medium-gap); }
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
  /* break-word, never "anywhere": "anywhere" shrinks min-content and wraps one letter per line. */
  .charger-name { overflow-wrap: break-word; color: var(--secondary-text-color); font-size: 11px; font-weight: 600; line-height: 1.45; }
  .vehicle-name { margin: 3px 0 6px; font-size: 17px; line-height: 1.3; font-weight: 600; overflow-wrap: break-word; letter-spacing: -.015em; }
  .charger-status { overflow-wrap: break-word; display: flex; align-items: center; gap: 6px; color: var(--secondary-text-color); font-size: 12px; line-height: 1.5; }
  .state-dot { height: 6px; width: 6px; flex: 0 0 6px; border-radius: 50%; background: currentColor; }
  .tone-charging .charger-status, .tone-complete .charger-status { color: var(--family-success); }
  .tone-error .charger-status { color: var(--family-error); }
  .tone-unavailable .charger-status { color: var(--family-unavailable); }
  .visual-charging .charger-icon { color: var(--family-success); }
  .charger-totals { min-width: 0; text-align: right; flex: 0 0 auto; }
  /* Charging history (0.9.0): totals, a filter per car, and one block per charge with the
     parts it went through. */
  .cost-history { display: grid; gap: 10px; }
  .history-totals { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); margin: 0; padding: 12px 14px; border-radius: 16px; background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
  .history-totals dt { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--secondary-text-color); }
  .history-totals dd { margin: 2px 0 0; font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .history-filter { display: flex; flex-wrap: wrap; gap: 6px; }
  .history-filter-chip { min-height: 36px; padding: 0 14px; border: 0; font: inherit; font-size: 13px; cursor: pointer; }
  .history-filter-chip[aria-pressed="true"] { background: color-mix(in srgb, var(--primary-color) 18%, transparent); color: var(--primary-text-color); font-weight: 600; }
  .history-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .history-session { display: grid; gap: 6px; padding: 12px 14px; border-radius: 16px; background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
  .history-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .history-car { font-size: 14px; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
  .history-when { font-size: 12px; color: var(--secondary-text-color); text-align: right; }
  .history-sum { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--secondary-text-color); }
  .history-sum b { color: var(--primary-text-color); font-weight: 600; }
  .history-saving { color: var(--family-success, var(--success-color)); }
  .history-timeline { position: relative; height: 10px; margin-top: 4px; border-radius: 5px; background: color-mix(in srgb, var(--primary-text-color) 8%, transparent); overflow: hidden; }
  .history-timeline b { position: absolute; top: 0; bottom: 0; border-radius: 5px; }
  .history-timeline b, .history-swatch { background: var(--history-part, var(--primary-color)); }
  [data-kind="guaranteed"] { --history-part: var(--family-chart-series-1, var(--primary-color)); }
  [data-kind="extra"] { --history-part: repeating-linear-gradient(135deg, color-mix(in srgb, var(--primary-text-color) 55%, transparent) 0 1px, transparent 1px 4px), color-mix(in srgb, var(--family-chart-series-1, var(--primary-color)) 45%, transparent); }
  [data-kind="schedule"] { --history-part: var(--info-color, #5b8def); }
  [data-kind="force"] { --history-part: var(--family-warning, var(--warning-color, #ff9800)); }
  [data-kind="other"] { --history-part: color-mix(in srgb, var(--primary-text-color) 35%, transparent); }
  .history-range { display: flex; justify-content: space-between; font-size: 11px; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .history-parts { display: grid; gap: 4px; margin: 2px 0 0; padding: 0; list-style: none; font-size: 12px; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .history-part { display: grid; grid-template-columns: 10px auto minmax(0, 1fr) auto; align-items: baseline; gap: 8px; }
  .history-swatch { width: 10px; height: 10px; border-radius: 3px; align-self: center; }
  .history-part-kind { color: var(--primary-text-color); font-weight: 600; }
  .history-part-amount { text-align: right; white-space: nowrap; }
  .history-more { font-size: 12px; color: var(--secondary-text-color); }
  .history-more summary { min-height: 32px; display: flex; align-items: center; cursor: pointer; }
  .history-more p { margin: 2px 0 6px; line-height: 1.5; }
  .history-partial { color: var(--secondary-text-color); }
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
  /* Under the meter: at most one note or warning line, then the facts. The block is a size
     container, so the facts go to one column in a narrow tile whatever the card width is. */
  .charger-plan { display: grid; gap: 8px; margin: var(--large-gap) 0 0; container: charger-facts / inline-size; }
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
  /* Charger details: short titled sections of the same label/value rows. */
  .details-section + .details-section { margin-top: 16px; padding-top: 14px; border-top: var(--sdc-border-faint); }
  .details-section .intelligent-section-title { margin-bottom: 10px; }
  .details-section .details-note { margin: 0 0 10px; }
  /* A label keeps its line; the value takes the rest and wraps by words. */
  .details-section .charger-diagnostics dt { flex: none; white-space: nowrap; }
  .details-section .charger-diagnostics dd { flex: 1 1 auto; overflow-wrap: break-word; }
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
  /* On a phone the two tiles stack. minmax(0, …): a long word must wrap, not widen the card. */
  @container charging-overview (max-width: 540px) {
    .ev-row { grid-template-columns: minmax(0, 1fr); }
  }
  @container charging-overview (max-width: 340px) {
    .status-hero, .ev-node { padding-left: 14px; padding-right: 14px; }
    .status-title { font-size: 19px; }
    .charger-heading { gap: 10px; }
    /* The charger name already identifies the port; the decorative icon gives
       its space to the vehicle and cost on a narrow dashboard column. */
    .charger-icon { display: none; }
    .battery-value { font-size: 25px; }
  }
  /* ---- Plan chart, facts and saving line. Plan periods and the glows under the tiles take the
     WLED state colours (--sdc-led-*, --node-*). */
  /* The plan chart is the shared time-series chart (@bitosome/ha-card-ui) with the price bars
     and colours of the Real Electricity Price card; the card only places it and, in its inline
     style, maps the period tones to the charger's LED colours. */
  .flow-stage > .plan-chart { position: relative; z-index: 1; }
  /* Facts of a charger tile: two columns of label over value; one column in a narrow tile. */
  .plan-rows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; margin: 0; }
  .plan-row { display: grid; gap: 0; align-content: start; min-width: 0; }
  /* A last row without a neighbour takes the whole width, so its value stays on one line. */
  .plan-row:last-child:nth-child(odd) { grid-column: 1 / -1; }
  .plan-row dt { font-size: 11px; line-height: 1.4; color: var(--secondary-text-color); white-space: nowrap; }
  .plan-row dd { margin: 0; min-width: 0; font-size: 13px; line-height: 1.4; color: var(--primary-text-color); font-variant-numeric: tabular-nums; overflow-wrap: break-word; }
  /* Under the battery bar: what is guaranteed, at the minimum tick, and how far the extra goes,
     at the end of the bar. One line; when they do not fit beside each other, at its two ends. */
  .plan-scale { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 8px; min-height: 18px; margin: 6px 0 0; }
  .plan-scale .plan-row { display: block; flex: 0 0 auto; }
  .plan-scale dt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .plan-scale dd { font-size: 12px; line-height: 18px; color: var(--secondary-text-color); white-space: nowrap; }
  .plan-scale .fact-main { font-weight: 600; color: var(--primary-text-color); }
  .plan-scale .fact-sep { white-space: pre; }
  /* The guaranteed level ends at the minimum tick (it starts there when the tick is in the left half). */
  .plan-scale[data-side="end"] [data-row="guaranteed"] { box-sizing: border-box; width: calc(var(--plan-minimum) * 1%); min-width: max-content; text-align: right; }
  .plan-scale[data-side="start"] [data-row="guaranteed"] { margin-inline-start: calc(var(--plan-minimum) * 1%); }
  /* The extra level is at the end of the bar; when it does not fit beside the other it wraps under it. */
  .plan-scale [data-row="extra"] { margin-inline-start: auto; text-align: right; }
  /* "to 100%": the level is enough here; the hatched part of the bar shows the rest. */
  .plan-scale [data-row="extra"][data-short] :is(.fact-sub, .fact-sep) { display: none; }
  /* The figures side by side: a small label, the figure, and a quieter line under it. */
  .plan-stats { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); margin: 0;
    border-block: 1px solid var(--family-divider, color-mix(in srgb, var(--primary-text-color) 10%, transparent)); }
  .plan-stats .plan-row { padding: 9px 0 9px 12px; border-inline-start: 1px solid var(--family-divider, color-mix(in srgb, var(--primary-text-color) 10%, transparent)); }
  .plan-stats .plan-row:first-child { padding-inline-start: 0; border-inline-start: 0; }
  .plan-stats .plan-row:last-child:nth-child(odd) { grid-column: auto; }
  .plan-stats dt { font-size: 10px; line-height: 1.4; letter-spacing: .06em; text-transform: uppercase; }
  .plan-stats dd { margin-top: 2px; }
  .plan-stats .fact { display: flex; flex-direction: column; min-width: 0; }
  .plan-stats .fact-main { order: 0; font-size: 16px; font-weight: 600; line-height: 1.25; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .plan-stats .fact-main small { font-size: 11px; font-weight: 500; letter-spacing: 0; color: var(--secondary-text-color); }
  .plan-stats .fact-sub { order: 1; font-size: 12px; line-height: 1.4; color: var(--secondary-text-color); overflow-wrap: anywhere; }
  .plan-stats .fact-sep { display: none; }
  /* The mode sheet: each way to charge says what it does. */
  .wizard-option-title { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; }
  .wizard-option-tag { font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--primary-color); }
  .wizard-option-description, .wizard-option-detail { display: block; font-size: 12px; font-weight: 400; line-height: 1.45; color: var(--secondary-text-color); white-space: normal; }
  .wizard-option-detail { color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
  .wizard-option-main { align-items: flex-start; text-align: left; }
  /* What happens next is the tile's status line. */
  .plan-next { display: inline; margin: 0; }
  .plan-next .plan-row { display: inline; }
  .plan-next dt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .plan-next dd { display: inline; margin: 0; font: inherit; color: inherit; }
  /* The history row: its title, and under it what the plan saves. */
  .launcher-copy { display: grid; gap: 1px; min-width: 0; }
  .launcher-title { color: var(--primary-text-color); }
  .charging-history-launcher .plan-saving { display: block; padding: 0; background: none; font-size: 12px; line-height: 1.4; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  /* "Charged" (and "Last charge") open that charger's history: the value is the control, with a
     touch-sized hit area that does not make the row taller. */
  .row-history { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; margin: -13px -4px -13px 0; padding: 13px 4px 13px 0; border: 0;
    background: none; color: inherit; font: inherit; font-variant-numeric: inherit; text-align: left; cursor: pointer; }
  .row-history > span { min-width: 0; overflow-wrap: break-word; }
  .row-history ha-icon { flex: none; --mdc-icon-size: 16px; width: 16px; height: 16px; color: var(--secondary-text-color); }
  .row-history:focus-visible { outline-offset: -8px; }
  /* What the plan saves: a slim foreground surface (opaque, above the glows), not a row of tiles. */
  .plan-saving { display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 12px; border-radius: 12px; background: var(--sdc-surface-control);
    font-size: 12px; line-height: 1.4; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .plan-saving ha-icon { flex: none; --mdc-icon-size: 16px; width: 16px; height: 16px; }
  @container charger-facts (max-width: 250px) {
    .plan-rows { grid-template-columns: minmax(0, 1fr); }
  }
  @container charger-facts (max-width: 270px) {
    /* A narrow tile: the figures as rows, label left and figure right. */
    .plan-stats { grid-auto-flow: row; }
    .plan-stats .plan-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 7px 0; border-inline-start: 0;
      border-top: 1px solid var(--family-divider, color-mix(in srgb, var(--primary-text-color) 10%, transparent)); }
    .plan-stats .plan-row:first-child { border-top: 0; }
    .plan-stats dd { margin: 0; text-align: right; }
    .plan-stats .fact { align-items: flex-end; }
  }
  @media (prefers-reduced-motion: reduce) {
    .glow-under, .glow-overlay { animation: none !important; }
    *, *::before, *::after { transition: none !important; }
  }
`;
