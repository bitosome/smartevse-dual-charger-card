/** Card presentation only. Device state and commands remain in the card. */
import { DESIGN_TOKENS_CSS } from '../shared/design-tokens';
import { OVERVIEW_CSS } from './overview';

export const CARD_CSS = `
${DESIGN_TOKENS_CSS}
:host {
  /* Card aliases over the family tokens; chip tokens come from DESIGN_TOKENS_CSS. */
  --pulse-weak: rgba(0,0,0,0.10);
  --pulse-strong: rgba(0,0,0,0.18);
  --sdc-surface-panel: var(--family-surface);
  --sdc-surface-control: var(--space-hub-tile-background, var(--family-tile));
  --sdc-weight-medium: 600;
  --sdc-weight-strong: 700;
  --sdc-border-faint: 1px solid rgba(148, 163, 184, 0.12);
  --sdc-border-hover: rgba(148, 163, 184, 0.28);
  --sdc-action-color: var(--primary-color, var(--status-active-color));
  --sdc-action-foreground: var(--text-primary-color, #fff);
  --sdc-text-muted: var(--family-muted);
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

ha-card {
  display: block;
  /* Bound decorative light without clipping native top-layer dialogs. */
  overflow: clip;
  position: relative;
  border-radius: var(--family-radius);
  border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.06));
  background: var(--sdc-surface-panel);
  padding: var(--tile-padding-large);
  color: var(--primary-text-color);
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
}

/* glowStyles positions .family-tile-wrap glows and owns the overlay mask. */
.family-tile-wrap {
  width: 100%;
  display: block;
  border-radius: var(--tile-border-radius);
  overflow: visible;
}

/* Glows stay hidden until the WLED visual or an enabled plan activates them. */
.family-tile-wrap .glow-under {
  opacity: 0;
}

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

.setting-copy {
  display: grid;
  align-content: start;
  gap: 2px;
  min-width: 0;
}

.setting-label,
.section-title span {
  color: var(--sdc-text-muted);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
}

.setting-value,
.status-title {
  font-weight: var(--sdc-weight-strong);
}

.setting-label {
  margin-bottom: 0;
}

.setting-value {
  font-size: var(--sdc-font-value);
  line-height: 1.2;
  margin-bottom: 0;
  transition: color 0.12s ease;
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

:where(
  .setting-tile,
  .wizard-option-main,
  .wizard-plan-toggle,
  .wizard-schedule-entity,
  .wizard-toggle,
  .status-hero
) {
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
}

:where(
  .setting-tile,
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
    .setting-tile,
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
  .setting-tile,
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
.dialog-panel { min-width: 0; min-height: 0; }
.family-dialog-body {
  /* Include neighboring controls and feedback, not just the glowing options. */
  isolation: isolate;
}

.modal-options {
  display: grid;
  gap: 8px;
}

/* Shared toggle pills (.family-toggle) laid out as a full-width option list. */
.modal-options .modal-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 22px;
  width: 100%;
  min-height: 48px;
  padding: 10px 12px;
  border-radius: var(--tile-border-radius);
  text-align: left;
}

.modal-option-title {
  min-width: 0;
  overflow-wrap: anywhere;
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
  /* Color belongs to the sibling under-layer, never to the foreground face. */
  box-shadow: var(--tile-shadow-default);
}

.wizard-option-wrap.selected .glow-under {
  opacity: 1;
}

.wizard-option-main:disabled,
.wizard-plan-toggle:disabled,
.wizard-toggle:disabled,
.wizard-schedule-entity:disabled {
  cursor: default;
  opacity: 0.55;
}

/* The control whose write is in flight stays readable while the others dim. */
.wizard-option-main[aria-busy="true"]:disabled,
.wizard-plan-toggle[aria-busy="true"]:disabled,
.wizard-toggle[aria-busy="true"]:disabled {
  cursor: progress;
  opacity: 1;
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

/* The expanded face stays neutral; colour belongs to under-layer glows only. */
.wizard-expandable.expanded {
  box-shadow: var(--tile-shadow-default);
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
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
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

.dialog-content > .family-notice,
.dialog-content > .family-async-state,
.wizard-expansion > .family-notice {
  margin-top: var(--medium-gap);
}

.wizard-step-body > .family-notice {
  margin-top: 0;
}

/* Progress shown on the control whose write is in flight. */
.control-pending {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--sdc-text-muted);
  font-size: 12px;
  font-weight: 500;
}

.control-pending .family-pending-indicator {
  width: 16px;
  height: 16px;
  flex-basis: 16px;
}

.wizard-field-label .control-pending {
  margin-left: 8px;
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
  z-index: 1;
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

${OVERVIEW_CSS}
`;
