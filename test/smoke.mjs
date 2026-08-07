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
el.setConfig({
  type: 'custom:smartevse-flow-card',
  controller_entity: 'sensor.ctl',
  price_entity: 'sensor.current_price',
  schedule_entity: 'schedule.charging',
  schedule_switch_entity: 'switch.schedule',
  force_charge_entity: 'switch.force',
  force_price_entity: 'switch.force_price',
  force_timer_entity: 'switch.force_timer',
  charge_policy_entity: 'select.policy',
  acceptable_price_entity: 'number.price',
  force_charge_duration_entity: 'number.duration',
  duty_cycle_entity: 'number.duty',
  timer_remaining_entity: 'sensor.timer_remaining',
});

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
  'switch.force': { state: 'off', attributes: {} },
  'switch.force_price': { state: 'off', attributes: {} },
  'switch.force_timer': { state: 'off', attributes: {} },
  'select.policy': { state: 'balanced', attributes: { options: ['balanced', 'fast'] } },
  'number.price': { state: '0.12', attributes: { min: 0, max: 1, step: 0.01, unit_of_measurement: 'EUR/kWh' } },
  'number.duration': { state: '60', attributes: { min: 5, max: 720, step: 5, unit_of_measurement: 'min' } },
  'number.duty': { state: '30', attributes: { min: 5, max: 240, step: 5, unit_of_measurement: 'min' } },
  'sensor.timer_remaining': { state: '0', attributes: {} },
};
el.hass = {
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
    return Promise.resolve();
  },
};

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
console.log(`${hasTwoPlanFamilies ? 'PASS' : 'FAIL'}: wizard groups charging into schedule and charge-now plans`);
if (!forceWizardOpened || !hasTwoPlanFamilies) ok = false;

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
console.log(`${schedulePriceExpandsInline ? 'PASS' : 'FAIL'}: schedule price field expands inside its option tile`);
if (!schedulePriceExpandsInline) ok = false;
if (schedulePriceInput) {
  schedulePriceInput.value = '0.15';
  schedulePriceInput.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
}
const scheduleCallStart = calls.length;
root.querySelector('[data-action="apply-force-mode"][data-mode="schedule"]')
  ?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await new Promise((r) => setTimeout(r, 60));
const scheduleCalls = calls.slice(scheduleCallStart);
const savedSchedulePrice = scheduleCalls.some((c) => c[0] === 'number' && c[1] === 'set_value' && c[2].entity_id === 'number.price' && c[2].value === 0.15);
const enabledSchedule = scheduleCalls.some((c) => c[1] === 'turn_on' && c[2].entity_id === 'switch.schedule');
const enabledScheduledPrice = scheduleCalls.some((c) => c[1] === 'turn_on' && c[2].entity_id === 'switch.force_price');
console.log(`${savedSchedulePrice && enabledSchedule && enabledScheduledPrice ? 'PASS' : 'FAIL'}: schedule can require an acceptable price`);
if (!savedSchedulePrice || !enabledSchedule || !enabledScheduledPrice) ok = false;

const heroPlanDetails = [...root.querySelectorAll('.status-detail')].map((node) => node.textContent.trim());
const heroShowsCombinedPlan =
  heroPlanDetails[0] === 'Schedule + acceptable price' &&
  heroPlanDetails[1] === 'Waiting for schedule window' &&
  heroPlanDetails.filter((detail) => detail === 'Waiting for schedule window').length === 1;
console.log(`${heroShowsCombinedPlan ? 'PASS' : 'FAIL'}: hero identifies schedule plus acceptable price without duplicate status text`);
if (!heroShowsCombinedPlan) ok = false;

openForceWizard();
await new Promise((r) => setTimeout(r, 30));
const selectedScheduleGlows =
  !!root.querySelector('.wizard-option-wrap.selected [data-mode="schedule"]') &&
  !!root.querySelector('.wizard-option-wrap.selected .glow-under') &&
  !root.textContent.includes('Current plan');
console.log(`${selectedScheduleGlows ? 'PASS' : 'FAIL'}: active schedule glows without a current-plan panel`);
if (!selectedScheduleGlows) ok = false;

click('[data-action="choose-force-mode"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="toggle-schedule-price"]');
await new Promise((r) => setTimeout(r, 30));
const scheduleOnlyCallStart = calls.length;
root.querySelector('[data-action="apply-force-mode"][data-mode="schedule"]')
  ?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await new Promise((r) => setTimeout(r, 50));
const scheduleOnlyCalls = calls.slice(scheduleOnlyCallStart);
const disabledScheduledPrice = scheduleOnlyCalls.some((c) => c[1] === 'turn_off' && c[2].entity_id === 'switch.force_price');
const scheduleRemainsEnabled = states['switch.schedule'].state === 'on';
console.log(`${disabledScheduledPrice && scheduleRemainsEnabled ? 'PASS' : 'FAIL'}: plain schedule removes only the price condition`);
if (!disabledScheduledPrice || !scheduleRemainsEnabled) ok = false;

// Charge now with only a price limit disables schedule gating.
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 30));
const chargeNowIsConcise =
  !root.querySelector('.wizard-confirmation') &&
  !root.textContent.includes('Ready to charge') &&
  !root.textContent.includes('Charging begins when you confirm this plan');
console.log(`${chargeNowIsConcise ? 'PASS' : 'FAIL'}: charge-now page omits redundant readiness copy`);
if (!chargeNowIsConcise) ok = false;
click('[data-action="toggle-force-now-price"]');
await new Promise((r) => setTimeout(r, 30));
const priceInput = root.querySelector('.force-input[data-entity="number.price"]');
if (priceInput) {
  priceInput.value = '0.15';
  priceInput.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
}
root.querySelector('[data-action="apply-force-mode"][data-mode="price"]')
  ?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await new Promise((r) => setTimeout(r, 50));
const disabledSchedule = calls.some((c) => c[1] === 'turn_off' && c[2].entity_id === 'switch.schedule');
const priceRemainsEnabled = states['switch.force_price'].state === 'on';
console.log(`${disabledSchedule && priceRemainsEnabled ? 'PASS' : 'FAIL'}: standalone price plan explicitly disables schedule gating`);
if (!disabledSchedule || !priceRemainsEnabled) ok = false;

// Charge now with both timer and acceptable price enables both force entities.
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="toggle-force-now-timer"]');
await new Promise((r) => setTimeout(r, 30));
const durationInput = root.querySelector('.force-input[data-entity="number.duration"]');
const timerPriceInput = root.querySelector('.force-input[data-entity="number.price"]');
const timerExpandsInline =
  !!durationInput?.closest('.wizard-expandable')?.querySelector('[data-action="toggle-force-now-timer"]');
const priceExpandsInline =
  !!timerPriceInput?.closest('.wizard-expandable')?.querySelector('[data-action="toggle-force-now-price"]');
console.log(`${timerExpandsInline && priceExpandsInline ? 'PASS' : 'FAIL'}: charge-now fields expand inside their option tiles`);
if (!timerExpandsInline || !priceExpandsInline) ok = false;
if (durationInput) {
  durationInput.value = '45';
  durationInput.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
}
const timerPriceCallStart = calls.length;
root.querySelector('[data-action="apply-force-mode"][data-mode="timer_price"]')
  ?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await new Promise((r) => setTimeout(r, 50));
const timerPriceCalls = calls.slice(timerPriceCallStart);
const savedDuration = timerPriceCalls.some((c) => c[0] === 'number' && c[1] === 'set_value' && c[2].entity_id === 'number.duration' && c[2].value === 45);
const savedTimerPrice = timerPriceCalls.some((c) => c[0] === 'number' && c[1] === 'set_value' && c[2].entity_id === 'number.price');
const timerAndPriceOn = states['switch.force_timer'].state === 'on' && states['switch.force_price'].state === 'on';
console.log(`${savedDuration && savedTimerPrice && timerAndPriceOn ? 'PASS' : 'FAIL'}: charge now supports timer plus acceptable price`);
if (!savedDuration || !savedTimerPrice || !timerAndPriceOn) ok = false;

// Turning off the price option leaves a timer-only plan.
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="toggle-force-now-price"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="apply-force-mode"][data-mode="timer"]');
await new Promise((r) => setTimeout(r, 50));
const timerOnly = states['switch.force_timer'].state === 'on' && states['switch.force_price'].state === 'off';
console.log(`${timerOnly ? 'PASS' : 'FAIL'}: charge now supports timer without price`);
if (!timerOnly) ok = false;

// Turning off both options yields a plain force-charge plan.
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="toggle-force-now-timer"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="apply-force-mode"][data-mode="simple"]');
await new Promise((r) => setTimeout(r, 50));
const plainForce =
  states['switch.force'].state === 'on' &&
  states['switch.force_timer'].state === 'off' &&
  states['switch.force_price'].state === 'off';
console.log(`${plainForce ? 'PASS' : 'FAIL'}: charge now supports unrestricted force charging`);
if (!plainForce) ok = false;

openForceWizard();
await new Promise((r) => setTimeout(r, 30));
const selectedChargeNowGlows = !!root.querySelector('.wizard-option-wrap.selected [data-mode="now"]');
click('[data-action="stop-force-charge"]');
await new Promise((r) => setTimeout(r, 40));
const stoppedForce = states['switch.force'].state === 'off';
console.log(`${selectedChargeNowGlows && stoppedForce ? 'PASS' : 'FAIL'}: selected charge-now plan glows and can be stopped`);
if (!selectedChargeNowGlows || !stoppedForce) ok = false;

console.log(ok ? '\nSMOKE TEST OK' : '\nSMOKE TEST FAILED');
process.exit(ok ? 0 : 1);
