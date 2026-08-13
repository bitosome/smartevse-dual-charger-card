// Headless smoke test for the LitElement-migrated card.
// Verifies: element registers, renders via unsafeHTML without throwing,
// produces expected markup, and delegated actions call hass.callService.
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
for (const key of [
  'window', 'document', 'Document', 'DocumentFragment', 'customElements',
  'HTMLElement', 'Element', 'Node', 'ShadowRoot', 'Event', 'CustomEvent',
  'MouseEvent', 'KeyboardEvent', 'CSSStyleSheet', 'getComputedStyle',
]) {
  try {
    globalThis[key] = win[key];
  } catch {
    // Some globals (e.g. navigator) are read-only in Node; use the platform one.
  }
}
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);

await import('../dist/smartevse-dual-charger-card.js');

const tag = 'smartevse-flow-card';
if (!customElements.get(tag)) throw new Error('element not registered');

const el = document.createElement(tag);
const config = {
  type: 'custom:smartevse-flow-card',
  controller_entity: 'sensor.ctl',
  price_entity: 'sensor.current_price',
  schedule_entity: 'schedule.charging',
  schedule_switch_entity: 'switch.schedule',
  schedule_price_entity: 'switch.schedule_price',
  force_charge_entity: 'switch.force',
  force_price_entity: 'switch.force_price',
  force_timer_entity: 'switch.force_timer',
  charge_policy_entity: 'select.policy',
  acceptable_price_entity: 'number.price',
  force_charge_duration_entity: 'number.duration',
  duty_cycle_entity: 'number.duty',
  duty_remaining_entity: 'sensor.duty_remaining',
  timer_remaining_entity: 'sensor.timer_remaining',
};
el.setConfig(config);

const calls = [];
const states = {
  'sensor.ctl': {
    state: 'ready',
    attributes: {
      charge_allowed: false,
      active_smartevse_raw: '',
      wled_visuals: {
        off: { color: [12, 34, 56], fx: 0, sx: 0, ix: 0 },
        idle: { color: [23, 67, 101], fx: 2, sx: 45, ix: 128 },
        error: { color: [211, 22, 33], fx: 2, sx: 60, ix: 200 },
        charging: { color: [44, 199, 88], fx: 41, sx: 80, ix: 100 },
      },
      smartevse_1_state: 'Ready to Charge',
      smartevse_1_plug_state: 'Connected',
      smartevse_1_error: 'None',
      smartevse_2_state: 'Disconnected',
      smartevse_2_plug_state: 'Disconnected',
      smartevse_2_error: 'None',
    },
  },
  'sensor.current_price': { state: '0.18', attributes: {} },
  'schedule.charging': {
    state: 'off',
    attributes: { friendly_name: 'EV overnight schedule', next_event: '2026-08-06T22:00:00+03:00' },
  },
  'switch.schedule': { state: 'off', attributes: {} },
  'switch.schedule_price': { state: 'off', attributes: {} },
  'switch.force': { state: 'off', attributes: {} },
  'switch.force_price': { state: 'off', attributes: {} },
  'switch.force_timer': { state: 'off', attributes: {} },
  'select.policy': { state: 'balanced', attributes: { options: ['balanced', 'fast'] } },
  'number.price': { state: '0.12', attributes: { min: 0, max: 1, step: 0.01, unit_of_measurement: 'EUR/kWh' } },
  'number.duration': { state: '60', attributes: { min: 5, max: 720, step: 5, unit_of_measurement: 'min' } },
  'number.duty': { state: '30', attributes: { min: 5, max: 240, step: 5, unit_of_measurement: 'min' } },
  'sensor.duty_remaining': { state: '600', attributes: {} },
  'sensor.timer_remaining': { state: '300', attributes: {} },
};
const hass = {
  states,
  callService: (...a) => {
    calls.push(a);
    const [domain, service, data] = a;
    if (domain === 'homeassistant' && states[data.entity_id]) {
      states[data.entity_id].state = service === 'turn_on' ? 'on' : 'off';
    }
    if ((domain === 'number' || domain === 'input_number') && service === 'set_value' && states[data.entity_id]) {
      states[data.entity_id].state = String(data.value);
    }
    const attrs = states['sensor.ctl'].attributes;
    const forceOn = states['switch.force'].state === 'on';
    const forcePriceOn = states['switch.force_price'].state === 'on';
    const forceTimerOn = states['switch.force_timer'].state === 'on';
    const scheduleOn = states['switch.schedule'].state === 'on';
    const schedulePriceOn = states['switch.schedule_price'].state === 'on';
    const scheduleWindowOn = states['schedule.charging'].state === 'on';
    const currentPrice = Number(states['sensor.current_price'].state);
    const acceptablePrice = Number(states['number.price'].state);
    if (forceOn) {
      attrs.charge_allowed = !forcePriceOn || currentPrice <= acceptablePrice;
      attrs.charge_reason = forcePriceOn
        ? (attrs.charge_allowed ? (forceTimerOn ? 'force_timer_acceptable_price' : 'acceptable_price') : 'waiting_for_acceptable_price')
        : (forceTimerOn ? 'force_timer' : 'force_charge');
    } else if (scheduleOn) {
      attrs.charge_allowed = scheduleWindowOn && (!schedulePriceOn || currentPrice <= acceptablePrice);
      attrs.charge_reason = !scheduleWindowOn
        ? 'waiting_for_schedule_window'
        : schedulePriceOn && !attrs.charge_allowed
          ? 'waiting_for_acceptable_price'
          : schedulePriceOn
            ? 'schedule_acceptable_price'
            : 'schedule';
    } else {
      attrs.charge_allowed = false;
      attrs.charge_reason = 'idle';
    }
    return Promise.resolve();
  },
};
el.hass = hass;

document.body.appendChild(el);
await new Promise((r) => setTimeout(r, 60));

const root = el.shadowRoot;
if (!root) throw new Error('no shadowRoot');
const htmlOut = root.innerHTML;
const checks = {
  'renders ha-card': htmlOut.includes('<ha-card') || htmlOut.includes('ha-card'),
  'has data-action elements': !!root.querySelector('[data-action]'),
  'non-trivial markup': htmlOut.length > 500,
  'uses the hero as the only charging-plan control':
    root.querySelectorAll('[data-action="open-force-wizard"]').length === 1 &&
    root.querySelector('[data-action="open-force-wizard"]')?.classList.contains('status-hero') &&
    !root.querySelector('.primary-controls'),
  'removes separate schedule and settings controls':
    !root.querySelector('[data-action="toggle"][data-entity="switch.schedule"]') &&
    !root.querySelector('[data-action="open-settings"]'),
  'hero glow follows physical WLED while charging is paused':
    root.querySelector('.status-hero-wrap')?.classList.contains('visual-idle') &&
    root.querySelector('.status-hero')?.classList.contains('visual-idle'),
  'hero glow uses the canonical shared pulse':
    root.querySelector('.status-glow')?.getAttribute('style')?.includes('animation: glowPulse 2.4s ease-in-out infinite') &&
    root.querySelector('.status-glow')?.getAttribute('style')?.includes('box-shadow: 0 18px 40px'),
  'live SmartEVSE WLED values control every glow variable':
    root.querySelector('ha-card')?.getAttribute('style')?.includes('--sdc-led-idle-rgb: 23, 67, 101;') &&
    root.querySelector('ha-card')?.getAttribute('style')?.includes('--sdc-led-charging-rgb: 44, 199, 88;') &&
    root.querySelector('.status-glow')?.getAttribute('style')?.includes('var(--sdc-led-idle-glow-duration)') &&
    root.querySelector('.ev-node-wrap')?.getAttribute('style')?.includes('--node-rgb: 23, 67, 101;'),
};
let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`);
  if (!pass) ok = false;
}

// Physical current flow animates even if the controller's logical gate has already changed.
const controllerAttrs = states['sensor.ctl'].attributes;
const originalFlowState = {
  chargeAllowed: controllerAttrs.charge_allowed,
  activeRaw: controllerAttrs.active_smartevse_raw,
  state: controllerAttrs.smartevse_1_state,
  current: controllerAttrs.smartevse_1_charge_current,
};
controllerAttrs.charge_allowed = false;
controllerAttrs.active_smartevse_raw = 'smartevse_1';
controllerAttrs.smartevse_1_state = 'Charging';
controllerAttrs.smartevse_1_charge_current = 10.4;
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
const physicalFlowAnimates =
  !!root.querySelector('.flow-svg .pipe-active.tone-charging') &&
  (root.querySelector('style')?.textContent || '').includes('animation: dash 1.8s linear infinite');
const timingLivesOnlyInHero =
  [...root.querySelectorAll('.status-pill')].some((node) => node.textContent.startsWith('Duty ')) &&
  !root.querySelector('.flow-line-badges') &&
  !root.querySelector('.flow-line-badge') &&
  !(root.querySelector('style')?.textContent || '').includes('.flow-line-badge');
console.log(`${physicalFlowAnimates ? 'PASS' : 'FAIL'}: physical charging current animates its connector independently of charge_allowed`);
console.log(`${timingLivesOnlyInHero ? 'PASS' : 'FAIL'}: duty and timer status stay in the hero without connector-line badges`);
if (!physicalFlowAnimates || !timingLivesOnlyInHero) ok = false;
controllerAttrs.charge_allowed = originalFlowState.chargeAllowed;
controllerAttrs.active_smartevse_raw = originalFlowState.activeRaw;
controllerAttrs.smartevse_1_state = originalFlowState.state;
controllerAttrs.smartevse_1_charge_current = originalFlowState.current;
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));

// All charging behavior is configured through one two-path wizard.
const openForceWizard = () => {
  const trigger = root.querySelector('[data-action="open-force-wizard"]');
  trigger?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
};
const click = (selector) => {
  root.querySelector(selector)?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
};
let moreInfoEntity = null;
el.addEventListener('hass-more-info', (event) => {
  moreInfoEntity = event.detail?.entityId || null;
});

openForceWizard();
await new Promise((r) => setTimeout(r, 40));
const forceWizardOpened = !!root.querySelector('.force-wizard-panel');
const forceChoices = root.querySelectorAll('[data-action="choose-force-mode"]');
console.log(`${forceWizardOpened ? 'PASS' : 'FAIL'}: hero tile opens charging-plan wizard`);
const hasTwoPlanFamilies =
  forceChoices.length === 2 &&
  !!root.querySelector('[data-action="choose-force-mode"][data-mode="schedule"]') &&
  !!root.querySelector('[data-action="choose-force-mode"][data-mode="now"]');
const mainPlanToggles = root.querySelectorAll('[data-action="toggle-charging-plan"]');
const forceTileText = root.querySelector('[data-action="choose-force-mode"][data-mode="now"]')?.textContent || '';
const mainMenuUsesIndependentToggles =
  mainPlanToggles.length === 2 &&
  !root.querySelector('[data-action="stop-force-charge"]') &&
  forceTileText.includes('Force charge') &&
  forceTileText.includes('Unrestricted · Off') &&
  !root.textContent.includes('Charge now');
console.log(`${hasTwoPlanFamilies ? 'PASS' : 'FAIL'}: wizard groups charging into schedule and force-charge plans`);
console.log(`${mainMenuUsesIndependentToggles ? 'PASS' : 'FAIL'}: main plan tiles expose independent toggles and saved-option summaries`);
if (!forceWizardOpened || !hasTwoPlanFamilies || !mainMenuUsesIndependentToggles) ok = false;

// The main-menu force toggle enables and disables the saved unrestricted mode.
click('[data-action="toggle-charging-plan"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 40));
const forceEnabledFromMain =
  states['switch.force'].state === 'on' &&
  root.querySelector('[data-action="toggle-charging-plan"][data-mode="now"]')?.getAttribute('aria-checked') === 'true';
click('[data-action="toggle-charging-plan"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 40));
const forceDisabledFromMain =
  states['switch.force'].state === 'off' &&
  (root.querySelector('[data-action="choose-force-mode"][data-mode="now"]')?.textContent || '').includes('Unrestricted · Off');
console.log(`${forceEnabledFromMain && forceDisabledFromMain ? 'PASS' : 'FAIL'}: force-charge main toggle controls the plan without losing its mode`);
if (!forceEnabledFromMain || !forceDisabledFromMain) ok = false;

// Schedule is exposed as a real Home Assistant entity and only the top back arrow remains.
click('[data-action="choose-force-mode"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 30));
const scheduleEntityButton = root.querySelector('[data-action="open-more-info"][data-entity="schedule.charging"]');
scheduleEntityButton?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await new Promise((r) => setTimeout(r, 20));
const scheduleNavigationIsClean =
  root.querySelectorAll('[data-action="back-force-wizard"]').length === 1 &&
  !root.querySelector('.wizard-secondary');
console.log(`${moreInfoEntity === 'schedule.charging' ? 'PASS' : 'FAIL'}: schedule entity opens Home Assistant more-info`);
console.log(`${scheduleNavigationIsClean ? 'PASS' : 'FAIL'}: wizard pages use only the top back arrow`);
if (moreInfoEntity !== 'schedule.charging' || !scheduleNavigationIsClean) ok = false;

// Schedule + acceptable price enables both gates and saves the threshold.
click('[data-action="toggle-schedule-price"]');
await new Promise((r) => setTimeout(r, 30));
const schedulePriceInput = root.querySelector('.force-input[data-entity="number.price"]');
const schedulePriceExpandsInline =
  !!schedulePriceInput?.closest('.wizard-expandable')?.querySelector('[data-action="toggle-schedule-price"]');
const schedulePriceUsesSwitch =
  root.querySelector('[data-action="toggle-schedule-price"]')?.getAttribute('aria-checked') === 'true' &&
  !!root.querySelector('[data-action="toggle-schedule-price"] .wizard-toggle-state.selected .wizard-toggle-state-thumb') &&
  !root.querySelector('[data-action="toggle-schedule-price"] ha-icon.wizard-toggle-state');
console.log(`${schedulePriceExpandsInline ? 'PASS' : 'FAIL'}: schedule price field expands inside its option tile`);
console.log(`${schedulePriceUsesSwitch ? 'PASS' : 'FAIL'}: schedule submenu uses a switch instead of a tick indicator`);
if (!schedulePriceExpandsInline || !schedulePriceUsesSwitch) ok = false;
const scheduleConfigCallStart = calls.length;
if (schedulePriceInput) {
  schedulePriceInput.value = '0.15';
  schedulePriceInput.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  schedulePriceInput.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
}
await new Promise((r) => setTimeout(r, 50));
const scheduleConfigCalls = calls.slice(scheduleConfigCallStart);
const savedSchedulePrice = scheduleConfigCalls.some((c) => c[0] === 'number' && c[1] === 'set_value' && c[2].entity_id === 'number.price' && c[2].value === 0.15);
const submenuDoesNotActivateSchedule =
  states['switch.schedule'].state === 'off' &&
  !scheduleConfigCalls.some((c) => c[1] === 'turn_on' && c[2].entity_id === 'switch.schedule') &&
  !root.querySelector('[data-action="apply-force-mode"]') &&
  !root.querySelector('.wizard-actions');
click('[data-action="back-force-wizard"]');
await new Promise((r) => setTimeout(r, 30));
const scheduleCallStart = calls.length;
click('[data-action="toggle-charging-plan"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 60));
const scheduleCalls = calls.slice(scheduleCallStart);
const enabledSchedule = scheduleCalls.some((c) => c[1] === 'turn_on' && c[2].entity_id === 'switch.schedule');
const enabledScheduledPrice = scheduleCalls.some((c) => c[1] === 'turn_on' && c[2].entity_id === 'switch.schedule_price');
console.log(`${savedSchedulePrice && submenuDoesNotActivateSchedule ? 'PASS' : 'FAIL'}: schedule submenu saves options without activating the plan`);
console.log(`${enabledSchedule && enabledScheduledPrice ? 'PASS' : 'FAIL'}: only the main-menu toggle enables the configured schedule`);
if (!savedSchedulePrice || !submenuDoesNotActivateSchedule || !enabledSchedule || !enabledScheduledPrice) ok = false;

const heroPlanDetails = [...root.querySelectorAll('.status-pill')].map((node) => node.textContent.trim());
const heroShowsCombinedPlan =
  heroPlanDetails.includes('Schedule') &&
  heroPlanDetails.includes('Schedule price · ≤ 0.150 EUR/kWh') &&
  heroPlanDetails.includes('Waiting for schedule') &&
  root.querySelector('.status-pill.tone-warn')?.textContent.trim() === 'Waiting for schedule';
console.log(`${heroShowsCombinedPlan ? 'PASS' : 'FAIL'}: hero separates schedule settings and state into semantic pills`);
if (!heroShowsCombinedPlan) ok = false;

openForceWizard();
await new Promise((r) => setTimeout(r, 30));
const selectedScheduleGlows =
  !!root.querySelector('.wizard-option-wrap.selected [data-mode="schedule"]') &&
  !!root.querySelector('.wizard-option-wrap.selected .glow-under') &&
  !root.textContent.includes('Current plan');
const scheduleSummaryVisible =
  (root.querySelector('[data-action="choose-force-mode"][data-mode="schedule"]')?.textContent || '')
    .includes('Schedule + acceptable price ≤ 0.150 EUR/kWh');
click('[data-action="toggle-charging-plan"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 40));
const scheduleDisabledButRemembered =
  states['switch.schedule'].state === 'off' &&
  states['switch.schedule_price'].state === 'off' &&
  (root.querySelector('[data-action="choose-force-mode"][data-mode="schedule"]')?.textContent || '')
    .includes('Schedule + acceptable price ≤ 0.150 EUR/kWh · Off');
click('[data-action="toggle-charging-plan"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 40));
const scheduleReenabledWithSavedPrice =
  states['switch.schedule'].state === 'on' && states['switch.schedule_price'].state === 'on';
console.log(`${selectedScheduleGlows ? 'PASS' : 'FAIL'}: active schedule glows without a current-plan panel`);
console.log(`${scheduleSummaryVisible && scheduleDisabledButRemembered && scheduleReenabledWithSavedPrice ? 'PASS' : 'FAIL'}: schedule toggle preserves and restores its acceptable-price option`);
if (!selectedScheduleGlows || !scheduleSummaryVisible || !scheduleDisabledButRemembered || !scheduleReenabledWithSavedPrice) ok = false;

click('[data-action="choose-force-mode"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 30));
const scheduleOnlyCallStart = calls.length;
click('[data-action="toggle-schedule-price"]');
await new Promise((r) => setTimeout(r, 50));
const scheduleOnlyCalls = calls.slice(scheduleOnlyCallStart);
const disabledScheduledPrice = scheduleOnlyCalls.some((c) => c[1] === 'turn_off' && c[2].entity_id === 'switch.schedule_price');
const scheduleRemainsEnabled = states['switch.schedule'].state === 'on';
console.log(`${disabledScheduledPrice && scheduleRemainsEnabled ? 'PASS' : 'FAIL'}: plain schedule removes only the price condition`);
if (!disabledScheduledPrice || !scheduleRemainsEnabled) ok = false;

// Price-limited force charge temporarily overrides, but never disables, the standing schedule.
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 30));
const forceChargeIsConcise =
  !root.querySelector('.wizard-confirmation') &&
  !root.textContent.includes('Ready to charge') &&
  !root.textContent.includes('Charging begins when you confirm this plan') &&
  !root.querySelector('[data-action="apply-force-mode"]') &&
  !root.querySelector('.wizard-actions');
console.log(`${forceChargeIsConcise ? 'PASS' : 'FAIL'}: force-charge submenu contains customization controls only`);
if (!forceChargeIsConcise) ok = false;
click('[data-action="toggle-force-now-price"]');
await new Promise((r) => setTimeout(r, 30));
const priceInput = root.querySelector('.force-input[data-entity="number.price"]');
const forceConfigCallStart = calls.length;
if (priceInput) {
  priceInput.value = '0.15';
  priceInput.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  priceInput.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
}
await new Promise((r) => setTimeout(r, 50));
const forceConfigCalls = calls.slice(forceConfigCallStart);
const forceConfigSavedWithoutActivation =
  forceConfigCalls.some((c) => c[0] === 'number' && c[1] === 'set_value' && c[2].entity_id === 'number.price') &&
  states['switch.schedule'].state === 'on' &&
  states['switch.force_price'].state === 'off';
click('[data-action="back-force-wizard"]');
await new Promise((r) => setTimeout(r, 30));
const forcePriceCallStart = calls.length;
click('[data-action="toggle-charging-plan"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 50));
const forcePriceCalls = calls.slice(forcePriceCallStart);
const scheduleWasNotDisabled = !forcePriceCalls.some(
  (c) => c[1] === 'turn_off' && c[2].entity_id === 'switch.schedule',
);
const scheduleRemainsOn = states['switch.schedule'].state === 'on';
const priceRemainsEnabled = states['switch.force_price'].state === 'on';
const forceActivationEnabled = states['switch.force'].state === 'on';
const forcePriceHeroDetails = [...root.querySelectorAll('.status-pill')].map((node) => node.textContent.trim());
const forcePriceHeroIsUnambiguous =
  forcePriceHeroDetails.includes('Force charge') &&
  forcePriceHeroDetails.includes('Force price · ≤ 0.150 EUR/kWh') &&
  forcePriceHeroDetails.includes('Waiting for price') &&
  forcePriceHeroDetails.includes('Schedule on') &&
  !forcePriceHeroDetails.some((detail) => detail.includes('Waiting for schedule')) &&
  root.querySelectorAll('.status-pill').length === 4;
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
const scheduleAndForceStayEnabled =
  root.querySelector('[data-action="toggle-charging-plan"][data-mode="schedule"]')?.getAttribute('aria-checked') === 'true' &&
  root.querySelector('[data-action="toggle-charging-plan"][data-mode="now"]')?.getAttribute('aria-checked') === 'true';
console.log(`${forceConfigSavedWithoutActivation ? 'PASS' : 'FAIL'}: force-charge submenu saves limits without activating the plan`);
console.log(`${scheduleWasNotDisabled && scheduleRemainsOn && priceRemainsEnabled && forceActivationEnabled && scheduleAndForceStayEnabled ? 'PASS' : 'FAIL'}: only the main toggle enables Force charge and keeps the standing schedule on`);
console.log(`${forcePriceHeroIsUnambiguous ? 'PASS' : 'FAIL'}: Force charge by acceptable price overrides Schedule and reports the controller price state`);
if (!forceConfigSavedWithoutActivation || !scheduleWasNotDisabled || !scheduleRemainsOn || !priceRemainsEnabled || !forceActivationEnabled || !scheduleAndForceStayEnabled || !forcePriceHeroIsUnambiguous) ok = false;
click('[data-action="close-force-wizard"]');

// Force charge with both timer and acceptable price enables both force entities.
states['switch.schedule_price'].state = 'on';
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 30));
const timerPriceCallStart = calls.length;
click('[data-action="toggle-force-now-timer"]');
await new Promise((r) => setTimeout(r, 50));
const durationInput = root.querySelector('.force-input[data-entity="number.duration"]');
const timerPriceInput = root.querySelector('.force-input[data-entity="number.price"]');
const timerExpandsInline =
  !!durationInput?.closest('.wizard-expandable')?.querySelector('[data-action="toggle-force-now-timer"]');
const priceExpandsInline =
  !!timerPriceInput?.closest('.wizard-expandable')?.querySelector('[data-action="toggle-force-now-price"]');
const forceNowUsesSwitches =
  root.querySelector('[data-action="toggle-force-now-timer"]')?.getAttribute('aria-checked') === 'true' &&
  root.querySelector('[data-action="toggle-force-now-price"]')?.getAttribute('aria-checked') === 'true' &&
  root.querySelectorAll('.wizard-step-panel .wizard-toggle-state.selected .wizard-toggle-state-thumb').length === 2 &&
  !root.querySelector('.wizard-step-panel ha-icon.wizard-toggle-state');
console.log(`${timerExpandsInline && priceExpandsInline ? 'PASS' : 'FAIL'}: force-charge fields expand inside their option tiles`);
console.log(`${forceNowUsesSwitches ? 'PASS' : 'FAIL'}: Force charge submenu uses switches instead of tick indicators`);
if (!timerExpandsInline || !priceExpandsInline || !forceNowUsesSwitches) ok = false;
if (durationInput) {
  durationInput.value = '45';
  durationInput.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  durationInput.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
}
await new Promise((r) => setTimeout(r, 50));
const timerPriceCalls = calls.slice(timerPriceCallStart);
const savedDuration = timerPriceCalls.some((c) => c[0] === 'number' && c[1] === 'set_value' && c[2].entity_id === 'number.duration' && c[2].value === 45);
const savedTimerPrice = timerPriceCalls.some((c) => c[0] === 'number' && c[1] === 'set_value' && c[2].entity_id === 'number.price');
const timerAndPriceOn = states['switch.force'].state === 'on' && states['switch.force_timer'].state === 'on' && states['switch.force_price'].state === 'on';
const forceHeroDetails = [...root.querySelectorAll('.status-pill')].map((node) => node.textContent.trim());
const forceTimerStaysInHero =
  forceHeroDetails[0] === 'Force charge' &&
  forceHeroDetails[1] === 'Waiting for price' &&
  forceHeroDetails.some((detail) => detail.startsWith('Force timer · ') && detail.endsWith(' left')) &&
  forceHeroDetails.includes('Force price · ≤ 0.150 EUR/kWh') &&
  forceHeroDetails.at(-2) === 'Schedule on' &&
  forceHeroDetails.at(-1) === 'Schedule price · ≤ 0.150 EUR/kWh' &&
  forceHeroDetails.length === 6 &&
  !root.querySelector('.flow-line-badge');
console.log(`${savedDuration && savedTimerPrice && timerAndPriceOn ? 'PASS' : 'FAIL'}: force charge supports timer plus acceptable price`);
console.log(`${forceTimerStaysInHero ? 'PASS' : 'FAIL'}: maximum combination shows complete pills in active-state, limit, and fallback priority order`);
if (!savedDuration || !savedTimerPrice || !timerAndPriceOn || !forceTimerStaysInHero) ok = false;

openForceWizard();
await new Promise((r) => setTimeout(r, 30));
const configuredForceSummary =
  (root.querySelector('[data-action="choose-force-mode"][data-mode="now"]')?.textContent || '')
    .includes('Timer 0:45 + Acceptable price ≤ 0.150 EUR/kWh');
click('[data-action="toggle-charging-plan"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 40));
const forceDisabledButRemembered =
  states['switch.schedule'].state === 'on' &&
  states['switch.force_timer'].state === 'off' &&
  states['switch.force_price'].state === 'off' &&
  (root.querySelector('[data-action="choose-force-mode"][data-mode="now"]')?.textContent || '')
    .includes('Timer 0:45 + Acceptable price ≤ 0.150 EUR/kWh · Off');
click('[data-action="close-force-wizard"]');
el.setConfig(config);
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
const forceSummarySurvivesReload =
  (root.querySelector('[data-action="choose-force-mode"][data-mode="now"]')?.textContent || '')
    .includes('Timer 0:45 + Acceptable price ≤ 0.150 EUR/kWh · Off');
click('[data-action="toggle-charging-plan"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 40));
const forceReenabledWithSavedOptions =
  states['switch.force'].state === 'on' && states['switch.force_timer'].state === 'on' && states['switch.force_price'].state === 'on';
console.log(`${configuredForceSummary && forceDisabledButRemembered && forceSummarySurvivesReload && forceReenabledWithSavedOptions ? 'PASS' : 'FAIL'}: force-charge toggle persists and restores timer plus acceptable-price options`);
if (!configuredForceSummary || !forceDisabledButRemembered || !forceSummarySurvivesReload || !forceReenabledWithSavedOptions) ok = false;

// Turning off the price option leaves a timer-only plan.
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="toggle-force-now-price"]');
await new Promise((r) => setTimeout(r, 50));
const timerOnly = states['switch.force'].state === 'on' && states['switch.force_timer'].state === 'on' && states['switch.force_price'].state === 'off';
console.log(`${timerOnly ? 'PASS' : 'FAIL'}: force charge supports timer without price`);
if (!timerOnly) ok = false;

// Turning off both options yields a plain force-charge plan.
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="toggle-force-now-timer"]');
await new Promise((r) => setTimeout(r, 50));
const plainForce =
  states['switch.force'].state === 'on' &&
  states['switch.force_timer'].state === 'off' &&
  states['switch.force_price'].state === 'off';
console.log(`${plainForce ? 'PASS' : 'FAIL'}: force charge supports unrestricted charging`);
if (!plainForce) ok = false;

openForceWizard();
await new Promise((r) => setTimeout(r, 30));
const selectedForceChargeGlows = !!root.querySelector('.wizard-option-wrap.selected [data-mode="now"]');
click('[data-action="toggle-charging-plan"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 40));
const stoppedForce =
  states['switch.force'].state === 'off' &&
  (root.querySelector('[data-action="choose-force-mode"][data-mode="now"]')?.textContent || '').includes('Unrestricted · Off');
console.log(`${selectedForceChargeGlows && stoppedForce ? 'PASS' : 'FAIL'}: selected force-charge plan glows and is controlled by its tile toggle`);
if (!selectedForceChargeGlows || !stoppedForce) ok = false;

console.log(ok ? '\nSMOKE TEST OK' : '\nSMOKE TEST FAILED');
process.exit(ok ? 0 : 1);
