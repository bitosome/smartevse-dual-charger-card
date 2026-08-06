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
  'sensor.ctl': { state: 'ready', attributes: { charge_allowed: true, active_smartevse_raw: '', wled_visuals: {} } },
  'sensor.current_price': { state: '0.18', attributes: {} },
  'schedule.charging': { state: 'off', attributes: { next_event: '2026-08-06T22:00:00+03:00' } },
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
  'shows exactly two charging controls': root.querySelectorAll('.primary-controls .control-tile').length === 2,
  'hides separate price and timer triggers': !htmlOut.includes('Force By Price') && !htmlOut.includes('Force Timer'),
};
let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`);
  if (!pass) ok = false;
}

// Scheduled charging remains a direct toggle.
const toggle = root.querySelector('[data-action="toggle"][data-entity="switch.schedule"]');
if (toggle) {
  toggle.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
  await new Promise((r) => setTimeout(r, 20));
  const called = calls.some((c) => c[0] === 'homeassistant' && (c[1] === 'turn_on' || c[1] === 'turn_off'));
  console.log(`${called ? 'PASS' : 'FAIL'}: toggle action calls hass.callService`);
  if (!called) ok = false;
} else {
  console.log('SKIP: no toggle action element found');
}

// Force charging is configured through a three-path wizard.
const openForceWizard = () => {
  const trigger = root.querySelector('[data-action="open-force-wizard"]');
  trigger?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
};

openForceWizard();
await new Promise((r) => setTimeout(r, 40));
const forceWizardOpened = !!root.querySelector('.force-wizard-panel');
const forceChoices = root.querySelectorAll('[data-action="choose-force-mode"]');
console.log(`${forceWizardOpened ? 'PASS' : 'FAIL'}: force tile opens wizard`);
console.log(`${forceChoices.length === 3 ? 'PASS' : 'FAIL'}: wizard offers three force-charge modes`);
if (!forceWizardOpened || forceChoices.length !== 3) ok = false;

const priceChoice = root.querySelector('[data-action="choose-force-mode"][data-mode="price"]');
priceChoice?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await new Promise((r) => setTimeout(r, 30));
const priceInput = root.querySelector('.force-input[data-entity="number.price"]');
if (priceInput) {
  priceInput.value = '0.15';
  priceInput.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
}
root.querySelector('[data-action="apply-force-mode"][data-mode="price"]')
  ?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await new Promise((r) => setTimeout(r, 50));
const savedPrice = calls.some((c) => c[0] === 'number' && c[1] === 'set_value' && c[2].entity_id === 'number.price' && c[2].value === 0.15);
const enabledPriceMode = calls.some((c) => c[0] === 'homeassistant' && c[1] === 'turn_on' && c[2].entity_id === 'switch.force_price');
console.log(`${savedPrice && enabledPriceMode ? 'PASS' : 'FAIL'}: price path saves threshold and enables price mode`);
if (!savedPrice || !enabledPriceMode) ok = false;

openForceWizard();
await new Promise((r) => setTimeout(r, 30));
root.querySelector('[data-action="choose-force-mode"][data-mode="timer"]')
  ?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await new Promise((r) => setTimeout(r, 30));
const durationInput = root.querySelector('.force-input[data-entity="number.duration"]');
if (durationInput) {
  durationInput.value = '45';
  durationInput.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
}
const timerCallStart = calls.length;
root.querySelector('[data-action="apply-force-mode"][data-mode="timer"]')
  ?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await new Promise((r) => setTimeout(r, 50));
const timerCalls = calls.slice(timerCallStart);
const disabledPriceIndex = timerCalls.findIndex((c) => c[1] === 'turn_off' && c[2].entity_id === 'switch.force_price');
const enabledTimerIndex = timerCalls.findIndex((c) => c[1] === 'turn_on' && c[2].entity_id === 'switch.force_timer');
const savedDuration = timerCalls.some((c) => c[0] === 'number' && c[1] === 'set_value' && c[2].entity_id === 'number.duration' && c[2].value === 45);
const timerSwitchOrder = disabledPriceIndex >= 0 && enabledTimerIndex > disabledPriceIndex;
console.log(`${savedDuration && timerSwitchOrder ? 'PASS' : 'FAIL'}: timer path replaces price mode and saves duration`);
if (!savedDuration || !timerSwitchOrder) ok = false;

openForceWizard();
await new Promise((r) => setTimeout(r, 30));
const hasActiveMode = !!root.querySelector('.wizard-active');
root.querySelector('[data-action="stop-force-charge"]')
  ?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await new Promise((r) => setTimeout(r, 40));
const stoppedTimer = calls.some((c) => c[1] === 'turn_off' && c[2].entity_id === 'switch.force_timer');
console.log(`${hasActiveMode && stoppedTimer ? 'PASS' : 'FAIL'}: active force mode can be stopped from wizard`);
if (!hasActiveMode || !stoppedTimer) ok = false;

// Settings modal open/close flow (delegated actions + requestUpdate render cycle).
const openSettings = root.querySelector('[data-action="open-settings"]');
if (openSettings) {
  openSettings.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
  await new Promise((r) => setTimeout(r, 40));
  const opened = !!root.querySelector('.settings-backdrop');
  console.log(`${opened ? 'PASS' : 'FAIL'}: open-settings renders the settings modal`);
  if (!opened) ok = false;
  const settingsPanel = root.querySelector('.settings-panel');
  const forceSettingsMoved =
    settingsPanel?.querySelectorAll('.setting-tile').length === 2 &&
    !settingsPanel.textContent.includes('Acceptable Price') &&
    !settingsPanel.textContent.includes('Force Duration');
  console.log(`${forceSettingsMoved ? 'PASS' : 'FAIL'}: force parameters appear only in the wizard`);
  if (!forceSettingsMoved) ok = false;

  const closeSettings = root.querySelector('[data-action="close-settings"]');
  if (opened && closeSettings) {
    closeSettings.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 40));
    const closed = !root.querySelector('.settings-backdrop');
    console.log(`${closed ? 'PASS' : 'FAIL'}: close-settings dismisses the settings modal`);
    if (!closed) ok = false;
  }
} else {
  console.log('SKIP: no open-settings control found');
}

console.log(ok ? '\nSMOKE TEST OK' : '\nSMOKE TEST FAILED');
process.exit(ok ? 0 : 1);
