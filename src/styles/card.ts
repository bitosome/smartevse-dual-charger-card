/** Card presentation only. Device state and commands remain in the card. */
import { DESIGN_TOKENS_CSS } from '../shared/design-tokens';
import { OVERVIEW_CSS } from './overview';

export const CARD_CSS = `
${DESIGN_TOKENS_CSS}
:host {
  --sdc-settings-panel-width: min(390px, calc(100vw - 32px));
  --panel-shadow-color: rgba(0,0,0,0.50);
  --pulse-weak: rgba(0,0,0,0.10);
  --pulse-strong: rgba(0,0,0,0.18);
  --sdc-card-base: var(--ha-card-background, var(--card-background-color));
  --sdc-surface-panel: var(--sdc-card-base);
  --sdc-surface-tile: var(
    --space-hub-tile-background,
    color-mix(in srgb, var(--sdc-card-base) 96%, var(--primary-text-color) 4%)
  );
  --sdc-surface-chip: rgba(0,0,0,0.06);
  --chip-background-color: var(--sdc-surface-chip);
  --chip-border-radius: var(--ha-badge-border-radius, 999px);
  --sdc-font-tiny: 8px;
  --sdc-font-label: 9px;
  --sdc-font-detail: 10px;
  --sdc-font-body: 11px;
  --sdc-font-button: 12px;
  --sdc-font-value: 12px;
  --sdc-font-title: 14px;
  --sdc-font-icon: 16px;
  --sdc-weight-medium: 600;
  --sdc-weight-strong: 700;
  --sdc-letter-label: 0.06em;
  --sdc-letter-title: 0;
  --sdc-led-off: rgb(var(--sdc-led-off-rgb));
  --sdc-led-idle: rgb(var(--sdc-led-idle-rgb));
  --sdc-led-error: rgb(var(--sdc-led-error-rgb));
  --sdc-led-charging: rgb(var(--sdc-led-charging-rgb));
  --sdc-border-subtle: 1px solid rgba(148, 163, 184, 0.16);
  --sdc-border-muted: 1px solid rgba(148, 163, 184, 0.18);
  --sdc-border-soft: 1px solid rgba(148, 163, 184, 0.14);
  --sdc-border-faint: 1px solid rgba(148, 163, 184, 0.12);
  --sdc-border-input: 1px solid rgba(148, 163, 184, 0.24);
  --sdc-border-hover: rgba(148, 163, 184, 0.28);
  --sdc-surface-muted: rgba(15, 23, 42, 0.08);
  --sdc-surface-soft: rgba(15, 23, 42, 0.12);
  --sdc-surface-control: var(--sdc-surface-tile);
  --sdc-surface-elevated: var(--sdc-surface-control);
  --sdc-surface-input: rgba(2, 6, 23, 0.52);
  --sdc-surface-badge: var(--chip-background-color);
  --sdc-surface-glass: rgba(0,0,0,0.06);
  --sdc-surface-icon: var(--chip-background-color);
  --sdc-action-color: var(--primary-color, var(--status-active-color));
  --sdc-action-foreground: var(--text-primary-color, #fff);
  --sdc-text-muted: var(--secondary-text-color);
  --sdc-shadow-soft: var(--tile-shadow-default);
  --sdc-shadow-badge: var(--tile-shadow-default);
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

ha-card {
  display: block;
  overflow: visible;
  position: relative;
  border-radius: var(--ha-card-border-radius, 16px);
  border: 0;
  background: var(--sdc-surface-panel);
  box-shadow: 0 10px 30px var(--panel-shadow-color);
  padding: var(--tile-padding-large);
  color: var(--primary-text-color);
  transition: filter 0.12s ease, box-shadow 0.12s ease;
}

.missing {
  padding: 20px;
  color: var(--sdc-text-muted);
}

.wrap {
  padding: 0;
  overflow: visible;
}

.controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--large-gap);
  margin: 0;
  overflow: visible;
  /* Shared stacking context so a tile glow never paints over a sibling tile. */
  isolation: isolate;
}

.control-tile-wrap,
.status-hero-wrap,
.ev-node-wrap,
.wizard-option-wrap {
  position: relative;
  width: 100%;
  display: block;
  border-radius: var(--tile-border-radius);
  overflow: visible;
}

.control-tile-wrap .glow-under,
.status-hero-wrap .glow-under,
.ev-node-wrap .glow-under,
.wizard-option-wrap .glow-under {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  display: block;
  border-radius: var(--tile-border-radius);
  opacity: 0;
}

.control-tile-wrap .glow-overlay,
.status-hero-wrap .glow-overlay,
.ev-node-wrap .glow-overlay,
.wizard-option-wrap .glow-overlay {
  position: absolute;
  inset: -10px -14px -18px -14px;
  border-radius: inherit;
  pointer-events: none;
  mix-blend-mode: screen;
  opacity: 0.9;
  -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 18px, rgba(0,0,0,0.9) 44px, rgba(0,0,0,1) 100%);
  mask-image: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 18px, rgba(0,0,0,0.9) 44px, rgba(0,0,0,1) 100%);
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

.control-tile,
.setting-tile {
  appearance: none;
  display: grid;
  grid-template-columns: 28px 1fr;
  align-items: start;
  gap: var(--medium-gap);
  width: 100%;
  padding: var(--tile-padding);
  border-radius: var(--tile-border-radius);
  border: 0;
  background: var(--sdc-surface-control);
  box-shadow: var(--tile-shadow-default);
  color: inherit;
  cursor: pointer;
  font: inherit;
  position: relative;
  z-index: 1;
  text-align: left;
  overflow: hidden;
  clip-path: inset(0 round var(--tile-border-radius));
  background-clip: padding-box;
  --control-button-border-radius: var(--tile-border-radius);
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
}

.primary-controls {
  grid-template-columns: minmax(0, 1fr);
  gap: var(--large-gap);
}

.primary-controls .control-tile-wrap {
  height: 58px;
}

.primary-controls .control-tile {
  grid-template-columns: minmax(0, 1fr) 32px;
  height: 100%;
  min-height: 58px;
  align-items: center;
  padding: var(--tile-padding);
  border-radius: var(--tile-border-radius);
  background: var(--sdc-surface-control);
  box-shadow: var(--tile-shadow-default);
}

.primary-controls .control-icon {
  grid-column: 2;
  grid-row: 1;
  align-self: center;
  width: 32px;
  height: 32px;
  border-radius: var(--chip-border-radius);
}

.primary-controls .control-copy {
  grid-column: 1;
  grid-row: 1;
  align-self: center;
  align-content: center;
  gap: 4px;
}

.primary-controls .control-label {
  font-size: var(--sdc-font-label);
}

.primary-controls .control-value {
  font-size: var(--sdc-font-title);
  line-height: 1.1;
  letter-spacing: var(--sdc-letter-title);
}

.setting-controls {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.setting-controls .setting-tile {
  min-height: 62px;
  border-radius: var(--tile-border-radius);
  background: var(--sdc-surface-control);
}

.setting-tile-editing {
  cursor: default;
  transform: none;
}

.control-icon,
.setting-icon {
  display: grid;
  place-items: center;
  align-self: start;
  width: 28px;
  height: 28px;
  border-radius: var(--chip-border-radius);
  background: var(--chip-background-color);
  color: var(--secondary-text-color);
  transition: color 0.12s ease, background 0.12s ease;
}

.control-icon ha-icon,
.setting-icon ha-icon {
  --mdc-icon-size: var(--sdc-font-icon);
  color: inherit;
  display: inline-grid;
  place-items: center;
  width: var(--sdc-font-icon);
  height: var(--sdc-font-icon);
  font-size: var(--sdc-font-icon);
  line-height: 1;
}

.control-copy,
.setting-copy {
  display: grid;
  align-content: start;
  gap: 2px;
  min-width: 0;
}

.control-label,
.setting-label,
.modal-kicker,
.section-title span,
.flow-line-icon {
  color: var(--sdc-text-muted);
  font-size: var(--sdc-font-label);
  font-weight: var(--sdc-weight-strong);
  letter-spacing: var(--sdc-letter-label);
  line-height: 1;
  text-transform: uppercase;
}

.control-value,
.setting-value,
.status-title,
.modal-title,
.modal-option-title,
.ev-label-text {
  font-weight: var(--sdc-weight-strong);
  letter-spacing: var(--sdc-letter-title);
}

.control-label,
.setting-label {
  margin-bottom: 0;
}

.control-value,
.setting-value {
  font-size: var(--sdc-font-value);
  line-height: 1.2;
  margin-bottom: 0;
  transition: color 0.12s ease;
}

.control-tile.state-off {
  color: var(--secondary-text-color);
}

.control-tile.state-off .control-value {
  color: var(--secondary-text-color);
}

.control-tile.state-on .control-icon,
.control-tile.state-on .control-value {
  color: var(--sdc-led-charging);
}

.control-tile.state-armed .control-icon,
.control-tile.state-armed .control-value,
.control-tile.state-waiting .control-icon,
.control-tile.state-waiting .control-value {
  color: var(--sdc-led-idle);
}

.control-tile.state-warn .control-icon,
.control-tile.state-warn .control-value {
  color: var(--sdc-led-error);
}

.setting-editor {
  display: grid;
  gap: var(--medium-gap);
  margin-top: var(--tile-padding);
}

.setting-input,
.setting-select {
  width: 100%;
  appearance: none;
  border: 0;
  border-radius: var(--tile-border-radius);
  background: var(--chip-background-color);
  color: var(--primary-text-color);
  padding: 8px 10px;
  font: inherit;
  font-size: var(--sdc-font-value);
  font-weight: var(--sdc-weight-medium);
  outline: none;
}

.setting-input:focus,
.setting-select:focus {
  box-shadow: 0 0 0 2px var(--primary-color, var(--status-active-color));
}

.setting-editor-actions {
  display: flex;
  gap: var(--medium-gap);
}

.setting-editor-button {
  appearance: none;
  border: 0;
  border-radius: var(--chip-border-radius);
  background: var(--chip-background-color);
  color: var(--primary-text-color);
  padding: 6px 10px;
  font: inherit;
  font-size: var(--sdc-font-button);
  font-weight: var(--sdc-weight-medium);
  cursor: pointer;
}

.setting-editor-button.tone-primary {
  border-color: var(--sdc-border-hover);
  background: var(--chip-background-color);
}

:where(
  .control-tile,
  .setting-tile,
  .setting-editor-button,
  .modal-back,
  .modal-option,
  .wizard-option-main,
  .wizard-plan-toggle,
  .wizard-schedule-entity,
  .wizard-toggle,
  .status-hero
) {
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
}

:where(
  .control-tile,
  .setting-tile,
  .setting-editor-button,
  .modal-back,
  .modal-option,
  .wizard-option-main,
  .wizard-plan-toggle,
  .wizard-schedule-entity,
  .wizard-toggle,
  .status-hero
):focus-visible {
  outline: 2px solid var(--primary-color, var(--status-active-color));
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  :where(
    .control-tile,
    .setting-tile,
    .setting-editor-button,
      .modal-back,
    .modal-option,
    .wizard-option-main,
    .wizard-plan-toggle,
    .wizard-schedule-entity,
    .wizard-toggle,
    .status-hero
  ):not(:disabled):hover {
    filter: brightness(1.05);
  }
}

:where(
  .control-tile,
  .setting-tile,
  .setting-editor-button,
  .modal-back,
  .modal-option,
  .wizard-option-main,
  .wizard-plan-toggle,
  .wizard-schedule-entity,
  .wizard-toggle,
  .status-hero
):not(:disabled):active {
  transform: scale(0.99);
}

.settings-panel .setting-controls {
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-bottom: 0;
}

.settings-panel .setting-tile {
  min-height: 56px;
  padding: 8px;
  align-items: center;
}

.settings-panel .setting-icon {
  align-self: center;
}

.settings-panel .setting-copy {
  align-content: center;
}

.settings-panel .setting-tile-editing {
  grid-column: 1 / -1;
}

.force-wizard-panel { --wizard-tile-height: 64px; }
.dialog-panel { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-width: 0; min-height: 0; }
.family-dialog[open] { grid-template-rows: minmax(0, 1fr); }
.modal-head-navigation { display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; }

.modal-copy {
  min-width: 0;
}

.modal-kicker {
  margin-bottom: 5px;
}

.modal-title {
  color: var(--primary-text-color);
  font-size: var(--sdc-font-title);
  line-height: 1.12;
}

.modal-options {
  display: grid;
  gap: 8px;
}

.modal-option {
  appearance: none;
  border: 0;
  border-radius: var(--tile-border-radius);
  background: var(--sdc-surface-control);
  box-shadow: var(--tile-shadow-default);
  color: var(--primary-text-color);
  cursor: pointer;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--medium-gap);
  min-height: 44px;
  padding: 9px 10px;
  position: relative;
  text-align: left;
  overflow: hidden;
  clip-path: inset(0 round var(--tile-border-radius));
  background-clip: padding-box;
  transition: box-shadow 0.12s ease, color 0.12s ease, filter 0.12s ease;
}

.modal-option.selected {
  --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
  --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
  color: var(--sdc-led-idle);
  box-shadow: var(--tile-shadow-active);
}

.modal-option-title {
  font-size: 13px;
  letter-spacing: var(--sdc-letter-title);
  line-height: 1.15;
}

.modal-option-check {
  --mdc-icon-size: 18px;
  display: block;
  width: var(--mdc-icon-size);
  height: var(--mdc-icon-size);
  min-width: var(--mdc-icon-size);
  justify-self: end;
  color: inherit;
}

.wizard-options,
.wizard-step-body {
  display: grid;
  gap: var(--medium-gap);
}

.wizard-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-height: var(--wizard-tile-height);
  width: 100%;
  border: 0;
  border-radius: var(--tile-border-radius);
  background: var(--sdc-surface-control);
  box-shadow: var(--tile-shadow-default);
  color: var(--primary-text-color);
  position: relative;
  overflow: hidden;
  z-index: 1;
}

.wizard-option-main {
  appearance: none;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 18px;
  align-items: center;
  gap: var(--medium-gap);
  min-width: 0;
  min-height: var(--wizard-tile-height);
  padding: var(--tile-padding);
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.wizard-plan-toggle {
  appearance: none;
  position: relative;
  width: 38px;
  height: 22px;
  margin: 0 10px 0 4px;
  padding: 0;
  border: 0;
  border-radius: var(--chip-border-radius);
  background: color-mix(in srgb, var(--secondary-text-color) 34%, transparent);
  cursor: pointer;
  transition: background 0.15s ease, filter 0.12s ease, transform 0.12s ease;
}

.wizard-plan-toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--sdc-action-foreground);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
  transition: transform 0.15s ease;
}

.wizard-plan-toggle.selected {
  background: var(--sdc-action-color);
}

.wizard-plan-toggle.selected .wizard-plan-toggle-thumb {
  transform: translateX(16px);
}

.wizard-option.selected {
  --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
  --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
  box-shadow: var(--tile-shadow-active);
}

.wizard-option-wrap.selected .glow-under {
  opacity: 1;
}

.wizard-option-main:disabled,
.wizard-plan-toggle:disabled,
.wizard-toggle:disabled,
.wizard-schedule-entity:disabled,
.modal-back:disabled {
  cursor: default;
  opacity: 0.55;
}

.wizard-option-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--chip-border-radius);
  background: var(--chip-background-color);
  color: var(--sdc-action-color);
}

.wizard-option-icon ha-icon,
.wizard-option-next {
  --mdc-icon-size: 18px;
}

.wizard-option-copy,
.wizard-toggle-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.wizard-option-title,
.wizard-toggle-copy strong,
.wizard-field-label {
  font-size: var(--sdc-font-value);
  font-weight: var(--sdc-weight-strong);
  line-height: 1.2;
}

.wizard-option-next {
  color: var(--sdc-text-muted);
}

.wizard-option.selected .wizard-option-next {
  color: var(--sdc-action-color);
}

.wizard-schedule-entity {
  display: grid;
  align-items: center;
  gap: var(--medium-gap);
  padding: var(--tile-padding);
  border-radius: var(--tile-border-radius);
  background: var(--sdc-surface-control);
}

.wizard-schedule-entity {
  appearance: none;
  grid-template-columns: 36px minmax(0, 1fr) 18px;
  width: 100%;
  min-height: var(--wizard-tile-height);
  border: 0;
  box-shadow: var(--tile-shadow-default);
  color: var(--primary-text-color);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.wizard-expandable {
  border-radius: var(--tile-border-radius);
  background: var(--sdc-surface-control);
  box-shadow: var(--tile-shadow-default);
  overflow: hidden;
  transition: box-shadow 0.16s ease, filter 0.16s ease;
}

.wizard-expandable.expanded {
  --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
  --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
  box-shadow: var(--tile-shadow-active);
}

.wizard-toggle {
  appearance: none;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--medium-gap);
  width: 100%;
  min-height: var(--wizard-tile-height);
  padding: var(--tile-padding);
  border: 0;
  border-radius: var(--tile-border-radius);
  background: var(--sdc-surface-control);
  color: var(--primary-text-color);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.wizard-expandable .wizard-toggle {
  border-radius: inherit;
  background: transparent;
}

.wizard-expandable.expanded .wizard-toggle {
  border-radius: var(--tile-border-radius) var(--tile-border-radius) 0 0;
}

.wizard-toggle.selected {
  --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
  --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
  box-shadow: none;
}

.wizard-expansion {
  border-top: 1px solid var(--sdc-border-hover);
  animation: wizardExpansionIn 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  transform-origin: top;
}

.wizard-expandable .wizard-field {
  border-radius: 0;
  background: transparent;
}

.wizard-toggle-state {
  position: relative;
  width: 38px;
  height: 22px;
  flex: 0 0 auto;
  border-radius: var(--chip-border-radius);
  background: color-mix(in srgb, var(--secondary-text-color) 34%, transparent);
  transition: background 0.15s ease;
}

.wizard-toggle-state-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--sdc-action-foreground);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
  transition: transform 0.15s ease;
}

.wizard-toggle-state.selected {
  background: var(--sdc-action-color);
}

.wizard-toggle-state.selected .wizard-toggle-state-thumb {
  transform: translateX(16px);
}

.wizard-field {
  display: grid;
  gap: 6px;
  padding: var(--tile-padding);
  border-radius: var(--tile-border-radius);
  background: var(--sdc-surface-control);
}

.wizard-input-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--medium-gap);
}

.wizard-duration-inputs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--medium-gap);
  min-width: 0;
}

.wizard-duration-part {
  display: grid;
  gap: var(--small-gap);
  min-width: 0;
}

.wizard-duration-part-label {
  color: var(--sdc-text-muted);
  font-size: var(--sdc-font-label);
  font-weight: var(--sdc-weight-strong);
  letter-spacing: var(--sdc-letter-label);
  line-height: 1;
  text-transform: uppercase;
}

.wizard-input-unit {
  color: var(--sdc-text-muted);
  font-size: var(--sdc-font-body);
  font-weight: var(--sdc-weight-medium);
}

@keyframes wizardExpansionIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.wizard-error {
  margin-top: var(--medium-gap);
  padding: 8px 10px;
  border-radius: var(--tile-border-radius);
  background: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-weak-alpha));
  color: var(--sdc-led-error);
  font-size: var(--sdc-font-body);
  font-weight: var(--sdc-weight-medium);
  line-height: 1.35;
}

.control-tile.tone-ok {
  --pulse-weak: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-weak-alpha));
  --pulse-strong: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-strong-alpha));
  box-shadow: var(--tile-shadow-active);
}

.control-tile-wrap.tone-ok .glow-under {
  --pulse-weak: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-weak-alpha));
  --pulse-strong: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-strong-alpha));
  opacity: 1;
  box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
}

.control-tile.tone-active {
  --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
  --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
  box-shadow: var(--tile-shadow-active);
}

.control-tile-wrap.tone-active .glow-under {
  --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
  --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
  opacity: 1;
  box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
}

.control-tile.tone-warn {
  --pulse-weak: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-weak-alpha));
  --pulse-strong: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-strong-alpha));
  box-shadow: var(--tile-shadow-active);
}

.control-tile-wrap.tone-warn .glow-under {
  --pulse-weak: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-weak-alpha));
  --pulse-strong: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-strong-alpha));
  opacity: 1;
  box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
}

.flow-stage {
  position: relative;
  display: grid;
  gap: 0;
  border-radius: 0;
  border: 0;
  background: transparent;
  padding: 0;
  overflow: visible;
}

.house-node {
  position: relative;
  z-index: 1;
  margin: 0 auto;
  width: 100%;
  padding: 0;
  border-radius: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  text-align: left;
  overflow: visible;
}

.status-hero-wrap {
  margin-bottom: 0;
}

.status-hero {
  appearance: none;
  position: relative;
  display: block;
  width: 100%;
  min-height: 92px;
  height: auto;
  padding: 10px var(--tile-padding-large);
  border-radius: var(--tile-border-radius);
  border: 0;
  background: var(--sdc-surface-control);
  box-shadow: var(--tile-shadow-default);
  color: var(--primary-text-color);
  cursor: pointer;
  font: inherit;
  text-align: left;
  overflow: hidden;
  clip-path: inset(0 round var(--tile-border-radius));
  background-clip: padding-box;
  --control-button-border-radius: var(--tile-border-radius);
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
}

.status-hero:focus-visible {
  outline: 2px solid var(--primary-color, var(--status-active-color));
  outline-offset: 2px;
}

.status-hero.visual-charging {
  --pulse-weak: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-weak-alpha));
  --pulse-strong: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-strong-alpha));
  box-shadow: var(--tile-shadow-active);
}

.status-hero-wrap.visual-charging .glow-under {
  opacity: 1;
}

.status-hero.visual-idle {
  --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
  --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
  box-shadow: var(--tile-shadow-active);
}

.status-hero-wrap.visual-idle .glow-under {
  opacity: 1;
}

.status-hero.visual-error {
  --pulse-weak: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-weak-alpha));
  --pulse-strong: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-strong-alpha));
  box-shadow: var(--tile-shadow-active);
}

.status-hero-wrap.visual-error .glow-under {
  opacity: 1;
}

.status-copy {
  position: relative;
  display: grid;
  align-content: start;
  gap: var(--tile-padding);
  min-width: 0;
}

.status-title {
  font-size: 16px;
  line-height: 1.18;
  overflow-wrap: anywhere;
}

.status-pills,
.status-pill-groups {
  display: grid;
  gap: 5px;
  width: 100%;
  min-width: 0;
}

.status-pill-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
}

.status-pill-group + .status-pill-group {
  margin-top: var(--small-gap);
  padding-top: var(--medium-gap);
  border-top: 1px solid color-mix(in srgb, var(--sdc-text-muted) 22%, transparent);
}

.status-pill-group-items {
  display: contents;
}

.status-runtime-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  width: 100%;
  min-width: 0;
}

.status-pill,
.status-pill-group-label {
  --status-pill-color: var(--sdc-text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  height: 26px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--status-pill-color) 30%, transparent);
  border-radius: var(--chip-border-radius);
  background: color-mix(in srgb, var(--status-pill-color) 13%, var(--chip-background-color));
  color: var(--status-pill-color);
  font-size: 10px;
  font-weight: var(--chip-text-font-weight);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pill-icon {
  --mdc-icon-size: 23.4px;
  width: 23.4px;
  height: 23.4px;
  flex: 0 0 23.4px;
  margin-right: 4px;
}

.status-pill-group-label .status-pill-icon {
  --mdc-icon-size: 34px;
  width: 34px;
  height: 34px;
  flex-basis: 34px;
}

.status-pill-group-label {
  flex: 0 0 auto;
  font-weight: 700;
}

.status-pill.tone-active,
.status-pill-group-label.tone-active {
  --status-pill-color: var(--primary-color, var(--status-active-color));
}

.status-pill.tone-success,
.status-pill-group-label.tone-success {
  --status-pill-color: var(--status-success-color);
}

.status-pill.tone-warn,
.status-pill-group-label.tone-warn {
  --status-pill-color: var(--status-warn-color);
}

.status-pill.tone-error,
.status-pill-group-label.tone-error {
  --status-pill-color: var(--status-alert-color);
}

.home-controls {
  margin-bottom: 0;
  overflow: visible;
}

.setting-controls {
  margin-bottom: 0;
}

.section-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 9px 2px 6px;
}

.section-title span {
  letter-spacing: var(--sdc-letter-label);
  color: var(--primary-text-color);
}

.section-title small {
  font-size: var(--sdc-font-detail);
  color: var(--sdc-text-muted);
}

.ev-row {
  position: relative;
  z-index: 3;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--large-gap);
  align-items: stretch;
  margin-top: -4px;
}

.ev-node {
  border-radius: var(--tile-border-radius);
  padding: var(--tile-padding-large);
  border: 0;
  background: var(--sdc-surface-control);
  box-shadow: var(--tile-shadow-default);
  position: relative;
  z-index: 1;
  overflow: hidden;
  clip-path: inset(0 round var(--tile-border-radius));
  background-clip: padding-box;
  --control-button-border-radius: var(--tile-border-radius);
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
}

.ev-node-wrap.visual-idle .glow-under {
  --pulse-weak: rgba(var(--node-rgb), var(--node-weak-alpha));
  --pulse-strong: rgba(var(--node-rgb), var(--node-strong-alpha));
  opacity: 1;
  box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
  animation: var(--node-glow-animation) var(--node-glow-duration) ease-in-out infinite;
}

.ev-node-wrap.visual-charging .glow-under {
  --pulse-weak: rgba(var(--node-rgb), var(--node-weak-alpha));
  --pulse-strong: rgba(var(--node-rgb), var(--node-strong-alpha));
  opacity: 1;
  box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
  animation: var(--node-glow-animation) var(--node-glow-duration) ease-in-out infinite;
}

.ev-node-wrap.visual-error .glow-under {
  --pulse-weak: rgba(var(--node-rgb), var(--node-weak-alpha));
  --pulse-strong: rgba(var(--node-rgb), var(--node-strong-alpha));
  opacity: 1;
  box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
  animation: var(--node-glow-animation) var(--node-glow-duration) ease-in-out infinite;
}

@keyframes glowPulse {
  0% { box-shadow: 0 10px 20px var(--pulse-weak); }
  50% { box-shadow: 0 28px 56px var(--pulse-strong); }
  100% { box-shadow: 0 10px 20px var(--pulse-weak); }
}

${OVERVIEW_CSS}
`;
