// Offline functional smoke tests for the SmartEVSE charging dashboard.
// Verifies state visibility, truthful telemetry, and the real service contracts
// using mocked Home Assistant state. No device or production API is contacted.
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
      smartevse_1_available: true,
      smartevse_1_name: 'Carport charger',
      smartevse_1_connected_ev: 'Volvo XC40',
      smartevse_1_battery: '90',
      smartevse_1_mode: 'Off',
      smartevse_1_charge_current: 16,
      smartevse_1_max_current: 16,
      smartevse_1_state: 'Ready to Charge',
      smartevse_1_plug_state: 'Connected',
      smartevse_1_error: 'None',
      smartevse_2_available: true,
      smartevse_2_name: 'Driveway charger',
      smartevse_2_mode: 'Off',
      smartevse_2_charge_current: 16,
      smartevse_2_max_current: 16,
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
  'select.policy': { state: 'SmartEVSE 1 first', attributes: { options: ['SmartEVSE 1 first', 'SmartEVSE 2 first', 'SmartEVSE 1 only', 'SmartEVSE 2 only'] } },
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
    if (domain === 'select' && service === 'select_option' && states[data.entity_id]) {
      states[data.entity_id].state = data.option;
    }
    const attrs = states['sensor.ctl'].attributes;
    const forceOn = states['switch.force'].state === 'on';
    const forcePriceOn = states['switch.force_price'].state === 'on';
    const forceTimerOn = states['switch.force_timer'].state === 'on';
    const scheduleOn = states['switch.schedule'].state === 'on';
    const schedulePriceOn = states['switch.schedule_price'].state === 'on';
    const scheduleWindowOn = states['schedule.charging'].state === 'on';
    const currentPrice = Number(states['sensor.current_price']?.state);
    const acceptablePrice = Number(states['number.price']?.state);
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
const overviewText = (node) => {
  const copy = node?.cloneNode(true);
  copy?.querySelectorAll('.charger-details').forEach((details) => details.remove());
  return copy?.textContent || '';
};
const checks = {
  'renders ha-card': !!root.querySelector('ha-card'),
  'charging-plan control remains accessible when every plan is off':
    !!root.querySelector('[data-action="open-force-wizard"]'),
  'only enabled plans appear in the overview':
    !root.querySelector('[data-plan-group="use-schedule"]') &&
    !root.querySelector('[data-plan-group="force-charge"]'),
  'compact charging tiles replace the wire map':
    root.querySelectorAll('.ev-node').length === 2 && !root.querySelector('.flow-svg'),
  'connected vehicle and battery appear within the charger tile': (() => {
    const node = root.querySelector('.ev-node.smartevse_1');
    return overviewText(node).includes('Volvo XC40') &&
      overviewText(node).includes('90%') && !root.querySelector('.vehicle-node');
  })(),
  'disconnected port stays visible without stale current or mode in the overview': (() => {
    const text = overviewText(root.querySelector('.ev-node.smartevse_2'));
    return /Disconnected|Not connected|No (vehicle|car)/i.test(text) &&
      !/16(?:\.0)?\s*A|Current offered|Limit|Mode/.test(text);
  })(),
  'charger diagnostics open on demand without expanding the dashboard':
    !!root.querySelector('.ev-node.smartevse_1 button.charger-details') && !root.querySelector('.charger-diagnostics'),
  'hero glow follows physical WLED while charging is paused':
    root.querySelector('.status-hero-wrap')?.classList.contains('visual-idle') &&
    root.querySelector('.status-hero')?.classList.contains('visual-idle'),
  'live SmartEVSE WLED values control the shared glow':
    root.querySelector('ha-card')?.getAttribute('style')?.includes('--sdc-led-idle-rgb: 23, 67, 101;') &&
    root.querySelector('ha-card')?.getAttribute('style')?.includes('--sdc-led-charging-rgb: 44, 199, 88;') &&
    root.querySelector('.ev-node-wrap')?.getAttribute('style')?.includes('--node-rgb: 23, 67, 101;'),
};
let ok = true;
const check = (name, pass) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`);
  if (!pass) ok = false;
};
for (const [name, pass] of Object.entries(checks)) check(name, pass);

// Hardware state is authoritative for the glow even while the controller gate changes.
const controllerAttrs = states['sensor.ctl'].attributes;
const originalControllerAttrs = { ...controllerAttrs };
controllerAttrs.charge_allowed = false;
controllerAttrs.active_smartevse_raw = 'smartevse_1';
controllerAttrs.smartevse_1_state = 'Charging';
controllerAttrs.smartevse_1_charge_current = 10.4;
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
check('charging glow follows hardware state independently of charge_allowed',
  root.querySelector('.ev-node-wrap.smartevse_1')?.classList.contains('visual-charging') &&
  root.querySelector('.status-hero-wrap')?.classList.contains('visual-charging'));
check('one connected car does not show an irrelevant rotation countdown',
  !root.querySelector('.status-runtime-pill'));
controllerAttrs.smartevse_2_plug_state = 'Connected';
controllerAttrs.smartevse_2_state = 'Ready to Charge';
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
check('two eligible cars show the live rotation countdown',
  root.querySelector('.status-runtime-pill')?.textContent.includes('10m 00s'));
controllerAttrs.smartevse_1_charge_current = 0;
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
check('hardware charging glow is retained while offered current ramps from zero',
  root.querySelector('.ev-node-wrap.smartevse_1')?.classList.contains('visual-charging'));
Object.assign(controllerAttrs, originalControllerAttrs);
controllerAttrs.smartevse_2_available = false;
controllerAttrs.smartevse_2_state = 'Unavailable';
controllerAttrs.smartevse_2_plug_state = 'Unavailable';
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
check('an unavailable charger is identified instead of being reported as disconnected',
  /Unavailable/i.test(overviewText(root.querySelector('.ev-node.smartevse_2'))) &&
  !/Disconnected/i.test(overviewText(root.querySelector('.ev-node.smartevse_2'))));
Object.assign(controllerAttrs, originalControllerAttrs);
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));

// Unplugging is not equivalent to clearing a charger fault.
controllerAttrs.smartevse_2_error = 'Ground fault';
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
check('disconnected charger faults remain visible with their error glow',
  overviewText(root.querySelector('.ev-node.smartevse_2')).includes('Ground fault') &&
  root.querySelector('.ev-node-wrap.smartevse_2')?.classList.contains('visual-error'));
Object.assign(controllerAttrs, originalControllerAttrs);
states['sensor.ctl'].state = 'unavailable';
controllerAttrs.smartevse_1_state = 'Charging';
controllerAttrs.active_smartevse_raw = 'smartevse_1';
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
check('unavailable controller overrides stale charging state and glows',
  /Controller unavailable/i.test(root.querySelector('.status-title')?.textContent || '') &&
  [...root.querySelectorAll('.ev-node')].every((node) => /Unavailable/i.test(overviewText(node))) &&
  !root.querySelector('.ev-node-wrap.visual-charging') &&
  root.querySelector('.status-hero-wrap')?.classList.contains('visual-off'));
states['sensor.ctl'].state = 'ready';
Object.assign(controllerAttrs, originalControllerAttrs);
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));

// Diagnostics are a native modal and retain fresh telemetry without shifting cards.
const detailsTrigger = root.querySelector('.ev-node.smartevse_1 button.charger-details');
detailsTrigger.focus();
detailsTrigger.click();
await new Promise((r) => setTimeout(r, 30));
const nativeDetails = root.querySelector('dialog');
check('charger diagnostics use the shared native dialog and explicit offered-current terminology',
  nativeDetails?.open && ['State', 'Mode', 'Current offered', 'Limit'].every(label => nativeDetails.textContent.includes(label)) &&
  !/actual current|power draw|kW/i.test(nativeDetails.textContent));
controllerAttrs.smartevse_1_charge_current = 12.3;
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
check('diagnostics retain their native dialog and show fresh current after a state update',
  root.querySelector('dialog') === nativeDetails && nativeDetails.open && nativeDetails.textContent.includes('12.3 A'));
root.querySelector('[data-action="close-charger-details"]').click();
await new Promise((r) => setTimeout(r, 30));
check('closing diagnostics returns focus to the correct charger',
  !root.querySelector('dialog') && root.activeElement?.dataset.charger === 'smartevse_1');
Object.assign(controllerAttrs, originalControllerAttrs);
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));

// All charging behavior is configured through one two-path wizard.
const openForceWizard = () => {
  const trigger = root.querySelector('[data-action="open-force-wizard"]');
  trigger?.focus();
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
  !root.querySelector('.modal-subtitle') &&
  !root.querySelector('.wizard-option-detail') &&
  !root.textContent.includes('Charge now');
console.log(`${hasTwoPlanFamilies ? 'PASS' : 'FAIL'}: wizard groups charging into schedule and force-charge plans`);
console.log(`${mainMenuUsesIndependentToggles ? 'PASS' : 'FAIL'}: main plan tiles expose independent toggles with title-only copy`);
if (!forceWizardOpened || !hasTwoPlanFamilies || !mainMenuUsesIndependentToggles) ok = false;

// Dialogs are fully operable from the keyboard, including focus restoration.
let dialog = root.querySelector('.force-wizard-panel');
check('opening charging settings moves keyboard focus into the dialog',
  !!dialog?.contains(root.activeElement));
dialog?.focus();
controllerAttrs.smartevse_1_max_current = 15;
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
check('live state updates preserve keyboard focus on the dialog container',
  root.activeElement === root.querySelector('.force-wizard-panel'));
controllerAttrs.smartevse_1_max_current = originalControllerAttrs.smartevse_1_max_current;
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
dialog = root.querySelector('.force-wizard-panel');
const focusableControls = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')];
const firstControl = focusableControls[0];
const lastControl = focusableControls[focusableControls.length - 1];
lastControl?.focus();
lastControl?.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true }));
check('Tab wraps from the last dialog control to the first', root.activeElement === firstControl);
firstControl?.focus();
firstControl?.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, composed: true, cancelable: true }));
check('Shift-Tab wraps from the first dialog control to the last', root.activeElement === lastControl);
lastControl?.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 30));
check('Escape closes settings and returns focus to the charging-plan control',
  !root.querySelector('.force-wizard-panel') &&
  root.activeElement === root.querySelector('[data-action="open-force-wizard"]'));
openForceWizard();
await new Promise((r) => setTimeout(r, 30));

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
  root.querySelector('[data-action="toggle-charging-plan"][data-mode="now"]')?.getAttribute('aria-checked') === 'false';
console.log(`${forceEnabledFromMain && forceDisabledFromMain ? 'PASS' : 'FAIL'}: force-charge main toggle controls the plan without losing its mode`);
if (!forceEnabledFromMain || !forceDisabledFromMain) ok = false;

// Schedule is exposed as a real Home Assistant entity and only the top back arrow remains.
click('[data-action="choose-force-mode"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 30));
const scheduleEntityButton = root.querySelector('[data-action="open-more-info"][data-entity="schedule.charging"]');
scheduleEntityButton?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await new Promise((r) => setTimeout(r, 20));
check('opening native schedule settings closes the card dialog before focus is handed off',
  moreInfoEntity === 'schedule.charging' && !root.querySelector('.force-wizard-panel'));
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 30));
const scheduleNavigationIsClean =
  root.querySelectorAll('[data-action="back-force-wizard"]').length === 1 &&
  !root.querySelector('.wizard-secondary');
const settingsUseTitlesOnly =
  !root.querySelector('.modal-subtitle') &&
  !root.querySelector('.wizard-option-detail') &&
  !root.querySelector('.wizard-entity-id') &&
  !root.querySelector('.wizard-field-helper') &&
  !root.querySelector('.wizard-rule') &&
  !root.querySelector('.setting-detail');
const settingsTilesShareOneHeight =
  (root.querySelector('style')?.textContent || '').includes('--wizard-tile-height: 64px') &&
  (root.querySelector('style')?.textContent || '').includes('min-height: var(--wizard-tile-height)');
const scheduleSubmenuUsesTileIcons =
  root.querySelector('[data-action="open-more-info"] .wizard-option-icon ha-icon')?.getAttribute('icon') === 'mdi:calendar-clock' &&
  !!root.querySelector('[data-action="toggle-schedule-price"] .wizard-option-icon ha-icon');
console.log(`${moreInfoEntity === 'schedule.charging' ? 'PASS' : 'FAIL'}: schedule entity opens Home Assistant more-info`);
console.log(`${scheduleNavigationIsClean ? 'PASS' : 'FAIL'}: wizard pages use only the top back arrow`);
console.log(`${settingsUseTitlesOnly ? 'PASS' : 'FAIL'}: settings dialogs omit explanatory copy and its layout`);
console.log(`${settingsTilesShareOneHeight ? 'PASS' : 'FAIL'}: charging-plan and submenu tile headers share one height`);
console.log(`${scheduleSubmenuUsesTileIcons ? 'PASS' : 'FAIL'}: schedule submenu tiles use the shared leading icon treatment`);
if (moreInfoEntity !== 'schedule.charging' || !scheduleNavigationIsClean || !settingsUseTitlesOnly || !settingsTilesShareOneHeight || !scheduleSubmenuUsesTileIcons) ok = false;

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

const scheduleHeroGroup = root.querySelector('[data-plan-group="use-schedule"]');
const heroPlanDetails = [...(scheduleHeroGroup?.querySelectorAll('.status-pill') || [])].map((node) => node.textContent.trim());
const schedulePriceIsUnmet = [...(scheduleHeroGroup?.querySelectorAll('.status-pill.tone-neutral') || [])]
  .some((node) => node.textContent.trim() === '≤ 0.150 EUR/kWh');
const heroShowsCombinedPlan =
  !root.querySelector('[data-plan-group="force-charge"]') &&
  !!scheduleHeroGroup?.querySelector('.status-pill ha-icon[icon="mdi:clock-start"]') &&
  scheduleHeroGroup?.querySelector('.status-pill-group-label')?.textContent.trim() === 'Schedule' &&
  heroPlanDetails.includes('≤ 0.150 EUR/kWh') &&
  schedulePriceIsUnmet &&
  heroPlanDetails.some((detail) => detail === el._formatDateTime(states['schedule.charging'].attributes.next_event)) &&
  !heroPlanDetails.some((detail) => detail.startsWith('Waiting for'));
console.log(`${heroShowsCombinedPlan ? 'PASS' : 'FAIL'}: enabled Schedule group shows its timing and price condition while the off Force plan is omitted`);
if (!heroShowsCombinedPlan) ok = false;

states['schedule.charging'].state = 'on';
states['schedule.charging'].attributes.next_event = '2026-08-07T06:00:00+03:00';
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
const activeScheduleShowsEnd = [...(root.querySelector('[data-plan-group="use-schedule"]')?.querySelectorAll('.status-pill') || [])]
  .some((node) => {
    const text = node.textContent.trim();
    return text.startsWith('Ends ') && !text.includes('n/a') && node.querySelector('ha-icon')?.getAttribute('icon') === 'mdi:clock-end' && node.getAttribute('aria-label')?.startsWith('Schedule active now.');
  });
console.log(`${activeScheduleShowsEnd ? 'PASS' : 'FAIL'}: an active schedule pill shows when its window ends`);
if (!activeScheduleShowsEnd) ok = false;
states['schedule.charging'].state = 'off';
states['schedule.charging'].attributes.next_event = '2026-08-06T22:00:00+03:00';
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));

openForceWizard();
await new Promise((r) => setTimeout(r, 30));
const selectedScheduleGlows =
  !!root.querySelector('.wizard-option-wrap.selected [data-mode="schedule"]') &&
  !!root.querySelector('.wizard-option-wrap.selected .glow-under') &&
  !root.textContent.includes('Current plan');
click('[data-action="toggle-charging-plan"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 40));
const scheduleDisabledButRemembered =
  states['switch.schedule'].state === 'off' &&
  states['switch.schedule_price'].state === 'off' &&
  el._schedulePriceGate === true;
click('[data-action="toggle-charging-plan"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 40));
const scheduleReenabledWithSavedPrice =
  states['switch.schedule'].state === 'on' && states['switch.schedule_price'].state === 'on';
console.log(`${selectedScheduleGlows ? 'PASS' : 'FAIL'}: active schedule glows without a current-plan panel`);
console.log(`${scheduleDisabledButRemembered && scheduleReenabledWithSavedPrice ? 'PASS' : 'FAIL'}: schedule toggle preserves and restores its acceptable-price option`);
if (!selectedScheduleGlows || !scheduleDisabledButRemembered || !scheduleReenabledWithSavedPrice) ok = false;

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
const forceSubmenuUsesTileIcons =
  root.querySelector('[data-action="toggle-force-now-timer"] .wizard-option-icon ha-icon')?.getAttribute('icon') === 'mdi:timer-outline' &&
  !!root.querySelector('[data-action="toggle-force-now-price"] .wizard-option-icon ha-icon');
console.log(`${forceChargeIsConcise ? 'PASS' : 'FAIL'}: force-charge submenu contains customization controls only`);
console.log(`${forceSubmenuUsesTileIcons ? 'PASS' : 'FAIL'}: force submenu tiles use the shared leading icon treatment`);
if (!forceChargeIsConcise || !forceSubmenuUsesTileIcons) ok = false;
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
const forcePriceGroup = root.querySelector('[data-plan-group="force-charge"]');
const standingScheduleGroup = root.querySelector('[data-plan-group="use-schedule"]');
const forcePriceHeroDetails = [...(forcePriceGroup?.querySelectorAll('.status-pill') || [])].map((node) => node.textContent.trim());
const standingScheduleDetails = [...(standingScheduleGroup?.querySelectorAll('.status-pill') || [])].map((node) => node.textContent.trim());
const forcePriceIsUnmet = [...(forcePriceGroup?.querySelectorAll('.status-pill.tone-neutral') || [])]
  .some((node) => node.textContent.trim() === '≤ 0.150 EUR/kWh');
const forcePriceHeroIsUnambiguous =
  /Force.*(waiting|price)/i.test(root.querySelector('.status-title')?.textContent || '') &&
  forcePriceGroup?.querySelector('.status-pill-group-label')?.textContent.trim() === 'Force charge' &&
  forcePriceHeroDetails.includes('≤ 0.150 EUR/kWh') &&
  forcePriceIsUnmet &&
  standingScheduleGroup?.querySelector('.status-pill-group-label')?.textContent.trim() === 'Schedule' &&
  standingScheduleDetails.some((detail) => detail === el._formatDateTime(states['schedule.charging'].attributes.next_event)) &&
  !standingScheduleDetails.some((detail) => detail.startsWith('≤ ')) &&
  ![...forcePriceHeroDetails, ...standingScheduleDetails].some((detail) => detail.startsWith('Waiting for'));
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
const scheduleAndForceStayEnabled =
  root.querySelector('[data-action="toggle-charging-plan"][data-mode="schedule"]')?.getAttribute('aria-checked') === 'true' &&
  root.querySelector('[data-action="toggle-charging-plan"][data-mode="now"]')?.getAttribute('aria-checked') === 'true';
console.log(`${forceConfigSavedWithoutActivation ? 'PASS' : 'FAIL'}: force-charge submenu saves limits without activating the plan`);
console.log(`${scheduleWasNotDisabled && scheduleRemainsOn && priceRemainsEnabled && forceActivationEnabled && scheduleAndForceStayEnabled ? 'PASS' : 'FAIL'}: only the main toggle enables Force charge and keeps the standing schedule on`);
console.log(`${forcePriceHeroIsUnambiguous ? 'PASS' : 'FAIL'}: both groups show enabled modes while only Force shows its enabled acceptable-price setting`);
if (!forceConfigSavedWithoutActivation || !scheduleWasNotDisabled || !scheduleRemainsOn || !priceRemainsEnabled || !forceActivationEnabled || !scheduleAndForceStayEnabled || !forcePriceHeroIsUnambiguous) ok = false;
click('[data-action="close-force-wizard"]');

// Force charge with both timer and acceptable price enables both force entities.
// Simulate a stale raw schedule-price entity while its saved submenu option is
// off and no stored Force state: the active Force entity must prevent a cold
// synchronization from importing the stale schedule-price value.
el._forcePlanEnabled = false;
el._schedulePriceGate = false;
states['switch.schedule_price'].state = 'on';
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
const staleSchedulePriceIsHidden = ![...(root.querySelector('[data-plan-group="use-schedule"]')?.querySelectorAll('.status-pill') || [])]
  .some((node) => node.textContent.trim().startsWith('≤ '));
console.log(`${staleSchedulePriceIsHidden ? 'PASS' : 'FAIL'}: stale schedule-price entity does not override the disabled submenu option`);
if (!staleSchedulePriceIsHidden) ok = false;
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="toggle-schedule-price"]');
await new Promise((r) => setTimeout(r, 50));
click('[data-action="back-force-wizard"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 30));
const timerPriceCallStart = calls.length;
click('[data-action="toggle-force-now-timer"]');
await new Promise((r) => setTimeout(r, 50));
const durationHoursInput = root.querySelector('.force-duration-input[data-entity="number.duration"][data-duration-part="hours"]');
const durationMinutesInput = root.querySelector('.force-duration-input[data-entity="number.duration"][data-duration-part="minutes"]');
const timerPriceInput = root.querySelector('.force-input[data-entity="number.price"]');
const timerExpandsInline =
  durationHoursInput?.value === '1' &&
  durationMinutesInput?.value === '0' &&
  !!durationHoursInput?.closest('.wizard-expandable')?.querySelector('[data-action="toggle-force-now-timer"]');
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
if (durationHoursInput && durationMinutesInput) {
  durationHoursInput.value = '1';
  durationMinutesInput.value = '45';
  durationHoursInput.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  durationMinutesInput.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  durationMinutesInput.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
}
await new Promise((r) => setTimeout(r, 50));
const timerPriceCalls = calls.slice(timerPriceCallStart);
const savedDuration = timerPriceCalls.some((c) => c[0] === 'number' && c[1] === 'set_value' && c[2].entity_id === 'number.duration' && c[2].value === 105);
const savedTimerPrice = timerPriceCalls.some((c) => c[0] === 'number' && c[1] === 'set_value' && c[2].entity_id === 'number.price');
const timerAndPriceOn = states['switch.force'].state === 'on' && states['switch.force_timer'].state === 'on' && states['switch.force_price'].state === 'on';
const orderedHeroGroups = [...root.querySelectorAll('.status-pill-group')];
const scheduleHeroDetails = [...(orderedHeroGroups[1]?.querySelectorAll('.status-pill') || [])].map((node) => node.textContent.trim());
const forceHeroDetails = [...(orderedHeroGroups[0]?.querySelectorAll('.status-pill') || [])].map((node) => node.textContent.trim());
const forceTimerStaysInHero =
  orderedHeroGroups[1]?.querySelector('.status-pill-group-label')?.textContent.trim() === 'Schedule' &&
  scheduleHeroDetails.some((detail) => detail === el._formatDateTime(states['schedule.charging'].attributes.next_event)) &&
  scheduleHeroDetails.includes('≤ 0.150 EUR/kWh') &&
  orderedHeroGroups[0]?.querySelector('.status-pill-group-label')?.textContent.trim() === 'Force charge' &&
  forceHeroDetails.includes('5m 00s left') &&
  orderedHeroGroups[0]?.querySelector('.status-pill.tone-neutral')?.textContent.trim() === '5m 00s left' &&
  forceHeroDetails.includes('≤ 0.150 EUR/kWh') &&
  ![...scheduleHeroDetails, ...forceHeroDetails].some((detail) => detail.startsWith('Waiting for')) &&
  orderedHeroGroups.length === 2 &&
  !root.querySelector('.flow-line-badge');
console.log(`${savedDuration && savedTimerPrice && timerAndPriceOn ? 'PASS' : 'FAIL'}: force charge supports timer plus acceptable price`);
console.log(`${forceTimerStaysInHero ? 'PASS' : 'FAIL'}: maximum combination puts overriding Force first and shows only enabled settings in each group`);
if (!savedDuration || !savedTimerPrice || !timerAndPriceOn || !forceTimerStaysInHero) ok = false;

// Both plans apply the same live color rule to an enabled price condition.
states['sensor.current_price'].state = '0.10';
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
const acceptedSchedulePrice = root.querySelector(
  '[data-plan-group="use-schedule"] .status-pill.tone-success',
)?.textContent.trim() === '≤ 0.150 EUR/kWh';
const acceptedForcePrice = root.querySelector(
  '[data-plan-group="force-charge"] .status-pill.tone-success',
)?.textContent.trim() === '≤ 0.150 EUR/kWh';
const activeForceTimer = root.querySelector(
  '[data-plan-group="force-charge"] .status-pill.tone-active',
)?.textContent.trim() === '5m 00s left';
console.log(`${acceptedSchedulePrice && acceptedForcePrice ? 'PASS' : 'FAIL'}: both acceptable-price pills turn green when the live price meets the limit`);
console.log(`${activeForceTimer ? 'PASS' : 'FAIL'}: combined Force timer returns to active color when its price condition is met`);
if (!acceptedSchedulePrice || !acceptedForcePrice || !activeForceTimer) ok = false;
states['sensor.current_price'].state = '0.18';
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));

openForceWizard();
await new Promise((r) => setTimeout(r, 30));
const configuredForceOptions = el._forceNowTimer === true && el._forceNowPrice === true;
click('[data-action="toggle-charging-plan"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 40));
const forceDisabledButRemembered =
  states['switch.schedule'].state === 'on' &&
  states['switch.force_timer'].state === 'off' &&
  states['switch.force_price'].state === 'off' &&
  el._forceNowTimer === true &&
  el._forceNowPrice === true;
click('[data-action="close-force-wizard"]');
el.setConfig(config);
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
const forceOptionsSurviveReload = el._forceNowTimer === true && el._forceNowPrice === true;
click('[data-action="toggle-charging-plan"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 40));
const forceReenabledWithSavedOptions =
  states['switch.force'].state === 'on' && states['switch.force_timer'].state === 'on' && states['switch.force_price'].state === 'on';
console.log(`${configuredForceOptions && forceDisabledButRemembered && forceOptionsSurviveReload && forceReenabledWithSavedOptions ? 'PASS' : 'FAIL'}: force-charge toggle persists and restores timer plus acceptable-price options`);
if (!configuredForceOptions || !forceDisabledButRemembered || !forceOptionsSurviveReload || !forceReenabledWithSavedOptions) ok = false;

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
  root.querySelector('[data-action="toggle-charging-plan"][data-mode="now"]')?.getAttribute('aria-checked') === 'false';
console.log(`${selectedForceChargeGlows && stoppedForce ? 'PASS' : 'FAIL'}: selected force-charge plan glows and is controlled by its tile toggle`);
if (!selectedForceChargeGlows || !stoppedForce) ok = false;

// Missing and disabled capabilities are omitted; enabled broken gates are
// tested separately below because users still need to understand and stop them.
const missingFeatureSchedulePreference = el._schedulePriceGate;
el._schedulePriceGate = false;
const temporarilyRemovedEntities = {
  schedulePrice: states['switch.schedule_price'],
  forcePrice: states['switch.force_price'],
  forceTimer: states['switch.force_timer'],
  forceDuration: states['number.duration'],
};
delete states['switch.schedule_price'];
delete states['switch.force_price'];
delete states['switch.force_timer'];
delete states['number.duration'];
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
const availableScheduleDetails = [...(root.querySelector('[data-plan-group="use-schedule"]')?.querySelectorAll('.status-pill') || [])]
  .map((node) => node.textContent.trim());
const availableForceDetails = [...(root.querySelector('[data-plan-group="force-charge"]')?.querySelectorAll('.status-pill') || [])]
  .map((node) => node.textContent.trim());
const unavailableOptionsAreOmitted =
  availableScheduleDetails.some((detail) => detail === el._formatDateTime(states['schedule.charging'].attributes.next_event)) &&
  !availableScheduleDetails.some((detail) => detail.startsWith('≤ ')) &&
  root.querySelector('[data-plan-group="use-schedule"] .status-pill-group-label')?.textContent.trim() === 'Schedule' &&
  !root.querySelector('[data-plan-group="force-charge"]') &&
  availableForceDetails.length === 0;
console.log(`${unavailableOptionsAreOmitted ? 'PASS' : 'FAIL'}: unavailable optional controls do not create hero pills`);
if (!unavailableOptionsAreOmitted) ok = false;

// Missing optional capabilities should not create unusable settings rows.
click('[data-action="choose-force-mode"][data-mode="now"]');
await new Promise((r) => setTimeout(r, 30));
check('force editor omits timer and price options whose required entities are missing',
  !!root.querySelector('.wizard-step-panel') &&
  !root.querySelector('[data-action="toggle-force-now-timer"]') &&
  !root.querySelector('[data-action="toggle-force-now-price"]') &&
  !root.querySelector('.force-input'));
click('[data-action="back-force-wizard"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 30));
check('schedule editor keeps the available schedule while omitting the missing price option',
  !!root.querySelector('[data-action="open-more-info"][data-entity="schedule.charging"]') &&
  !root.querySelector('[data-action="toggle-schedule-price"]'));
click('[data-action="close-force-wizard"]');
await new Promise((r) => setTimeout(r, 30));

Object.assign(states, {
  'switch.schedule_price': temporarilyRemovedEntities.schedulePrice,
  'switch.force_price': temporarilyRemovedEntities.forcePrice,
  'switch.force_timer': temporarilyRemovedEntities.forceTimer,
  'number.duration': temporarilyRemovedEntities.forceDuration,
});

el._schedulePriceGate = missingFeatureSchedulePreference;

// An active price constraint remains meaningful when its telemetry disappears.
// The live gate switch must remain reachable so the user can remove the gate.
const savedMissingPriceSensor = states['sensor.current_price'];
const savedMissingPriceSwitchState = states['switch.schedule_price'].state;
states['switch.schedule'].state = 'on';
states['switch.schedule_price'].state = 'on';
el._schedulePriceGate = true;
delete states['sensor.current_price'];
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
check('an enabled schedule price gate remains visible when its sensor disappears',
  /Price unavailable/i.test(root.querySelector('[data-plan-group="use-schedule"]')?.textContent || ''));
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 30));
const unavailableEnabledPriceGate = root.querySelector('[data-action="toggle-schedule-price"]');
check('the enabled price option explains unavailability and stays removable',
  unavailableEnabledPriceGate?.getAttribute('aria-checked') === 'true' &&
  !unavailableEnabledPriceGate.disabled && /Unavailable/i.test(unavailableEnabledPriceGate.textContent));
const removeUnavailablePriceStart = calls.length;
click('[data-action="toggle-schedule-price"]');
await new Promise((r) => setTimeout(r, 30));
check('removing an enabled unavailable price gate keeps scheduled charging enabled',
  calls.slice(removeUnavailablePriceStart).some((call) => call[1] === 'turn_off' &&
    call[2].entity_id === 'switch.schedule_price') &&
  states['switch.schedule_price'].state === 'off' && states['switch.schedule'].state === 'on' &&
  el._schedulePriceGate === false);
click('[data-action="close-force-wizard"]');
await new Promise((r) => setTimeout(r, 30));
states['sensor.current_price'] = savedMissingPriceSensor;
states['switch.schedule_price'].state = savedMissingPriceSwitchState;
el._schedulePriceGate = missingFeatureSchedulePreference;
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));

// Validate the whole plan before writing anything: dependencies can go offline
// between opening the dialog and applying the user's saved settings.
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
const originalForceSwitchState = states['switch.force'].state;
states['switch.force'].state = 'unavailable';
const failedForceCallStart = calls.length;
await el._applyForceMode('timer_price');
check('unavailable Force activation prevents every timer/price service write',
  calls.length === failedForceCallStart && /unavailable/i.test(el._forceWizardError));
states['switch.force'].state = originalForceSwitchState;
const originalScheduleSwitchState = states['switch.schedule'].state;
const originalSchedulePriceState = states['switch.schedule_price'].state;
const originalSchedulePricePreference = el._schedulePriceGate;
states['switch.schedule'].state = 'off';
states['switch.schedule_price'].state = 'unavailable';
el._schedulePriceGate = false;
const failedScheduleCallStart = calls.length;
await el._applyForceMode('schedule');
check('unavailable schedule-price control prevents partially activating a schedule',
  calls.length === failedScheduleCallStart && states['switch.schedule'].state === 'off' &&
  /unavailable/i.test(el._forceWizardError));
states['switch.schedule'].state = originalScheduleSwitchState;
states['switch.schedule_price'].state = originalSchedulePriceState;
el._schedulePriceGate = originalSchedulePricePreference;

// Priority and limits are reachable from the same charging-plan chooser.
el.hass = hass;
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
click('[data-action="open-settings"]');
await new Promise((r) => setTimeout(r, 30));
check('charging-plan chooser opens working priority and duty settings',
  !!root.querySelector('.settings-panel') && !root.querySelector('.force-wizard-panel') &&
  !!root.querySelector('[data-action="open-submenu"][data-entity="select.policy"]') &&
  !!root.querySelector('[data-action="edit"][data-entity="number.duty"]'));

// Labels may normalize known controller identifiers, but service values and
// unknown options must always remain exactly as supplied by Home Assistant.
const originalPolicy = states['select.policy'].state;
const originalPolicyOptions = states['select.policy'].attributes.options;
const reorderedPolicyOptions = ['Custom solar priority', 'smartevse_2_only', 'SmartEVSE 1 first'];
states['select.policy'].attributes.options = reorderedPolicyOptions;
states['select.policy'].state = 'Custom solar priority';
el.hass = hass;
click('[data-action="open-submenu"][data-entity="select.policy"]');
await new Promise((r) => setTimeout(r, 30));
const policyOptions = [...root.querySelectorAll('[data-action="choose-option"][data-entity="select.policy"]')];
check('priority choices preserve reordered raw values and unknown option labels',
  JSON.stringify(policyOptions.map((option) => option.dataset.value)) === JSON.stringify(reorderedPolicyOptions) &&
  policyOptions[0]?.textContent.trim() === 'Custom solar priority' &&
  policyOptions[1]?.textContent.trim() === 'SmartEVSE 2 only');
const policyCallStart = calls.length;
click('[data-action="choose-option"][data-value="smartevse_2_only"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-option"][data-value="Custom solar priority"]');
await new Promise((r) => setTimeout(r, 30));
const selectedPolicyCalls = calls.slice(policyCallStart).filter((call) => call[0] === 'select' && call[1] === 'select_option');
check('priority selection sends the exact canonical or unknown Home Assistant option',
  selectedPolicyCalls.length === 2 &&
  selectedPolicyCalls[0][2].entity_id === 'select.policy' && selectedPolicyCalls[0][2].option === 'smartevse_2_only' &&
  selectedPolicyCalls[1][2].option === 'Custom solar priority');

const workingCallService = hass.callService;
hass.callService = (domain, service, data) => {
  if (data?.entity_id === 'select.policy') return Promise.reject(new Error('Priority rejected by controller'));
  return workingCallService(domain, service, data);
};
click('[data-action="choose-option"][data-value="smartevse_2_only"]');
await new Promise((r) => setTimeout(r, 30));
check('priority service failure is visible and restores the previous choice',
  /Priority rejected by controller/.test(root.querySelector('.settings-panel [role="alert"]')?.textContent || '') &&
  root.querySelector('[data-action="choose-option"].selected')?.dataset.value === 'Custom solar priority');
hass.callService = workingCallService;
click('[data-action="back-settings"]');
await new Promise((r) => setTimeout(r, 30));
states['select.policy'].attributes.options = [];
el.hass = hass;
click('[data-action="open-submenu"][data-entity="select.policy"]');
await new Promise((r) => setTimeout(r, 30));
check('an empty priority option list never invents controller choices',
  !root.querySelector('[data-action="choose-option"][data-entity="select.policy"]'));
click('[data-action="back-settings"]');
await new Promise((r) => setTimeout(r, 30));
states['select.policy'].state = originalPolicy;
states['select.policy'].attributes.options = originalPolicyOptions;
el.hass = hass;

// Range enforcement belongs in the save path, since keyboard and automation
// events can submit values beyond the native number input's UI limits.
click('[data-action="edit"][data-entity="number.duty"]');
await new Promise((r) => setTimeout(r, 30));
const submitDuty = async (value) => {
  const input = root.querySelector('.setting-input[data-entity="number.duty"]');
  if (!input) throw new Error('Duty-cycle editor is missing');
  input.value = String(value);
  input.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  click('[data-action="save-edit"][data-entity="number.duty"]');
  await new Promise((r) => setTimeout(r, 30));
};
const invalidDutyCallStart = calls.length;
await submitDuty(999);
check('duty values above the entity maximum show an error without a service call',
  calls.length === invalidDutyCallStart &&
  !!root.querySelector('.settings-panel [role="alert"]') &&
  !!root.querySelector('.setting-input[data-entity="number.duty"]'));
await submitDuty(1);
check('duty values below the entity minimum show an error without a service call',
  calls.length === invalidDutyCallStart &&
  !!root.querySelector('.settings-panel [role="alert"]') &&
  !!root.querySelector('.setting-input[data-entity="number.duty"]'));
await submitDuty(45);
check('a valid duty-cycle value uses number.set_value and closes its editor',
  calls.slice(invalidDutyCallStart).some((call) => call[0] === 'number' && call[1] === 'set_value' &&
    call[2].entity_id === 'number.duty' && call[2].value === 45) &&
  !root.querySelector('.setting-input[data-entity="number.duty"]'));
click('[data-action="edit"][data-entity="number.duty"]');
await new Promise((r) => setTimeout(r, 30));
hass.callService = (domain, service, data) => {
  if (data?.entity_id === 'number.duty') return Promise.reject(new Error('Duty cycle rejected by controller'));
  return workingCallService(domain, service, data);
};
await submitDuty(60);
check('duty service failure shows a visible alert and keeps the draft editable',
  /Duty cycle rejected by controller/.test(root.querySelector('.settings-panel [role="alert"]')?.textContent || '') &&
  root.querySelector('.setting-input[data-entity="number.duty"]')?.value === '60' &&
  states['number.duty'].state === '45');
hass.callService = workingCallService;
click('[data-action="close-settings"]');
await new Promise((r) => setTimeout(r, 30));
check('X protects an unsaved rejected draft with a discard confirmation',
  !!root.querySelector('[data-action="discard-dialog"]') &&
  !!root.querySelector('[aria-label="Close discard confirmation"] ha-icon[icon="mdi:close"]'));
click('[data-action="cancel-discard"]');
await new Promise((r) => setTimeout(r, 30));
check('keeping the draft restores the typed value',
  root.querySelector('.setting-input[data-entity="number.duty"]')?.value === '60');
click('[data-action="close-settings"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="discard-dialog"]');
await new Promise((r) => setTimeout(r, 30));
check('discarding the local draft closes without sending another command', !root.querySelector('dialog'));

// Unavailable settings must neither open an empty dialog nor trap an already
// open editor when Home Assistant loses the entity during interaction.
states['select.policy'].state = 'unavailable';
el.hass = hass;
openForceWizard();
await new Promise((r) => setTimeout(r, 30));
click('[data-action="open-settings"]');
await new Promise((r) => setTimeout(r, 30));
const unavailablePolicyEntry = root.querySelector('[data-action="open-submenu"][data-entity="select.policy"]');
click('[data-action="open-submenu"][data-entity="select.policy"]');
await new Promise((r) => setTimeout(r, 30));
check('unavailable priority is disabled instead of opening an empty editor',
  unavailablePolicyEntry?.disabled && !!root.querySelector('.settings-panel') &&
  !root.querySelector('.submenu-panel') && !el._editingEntity);
states['select.policy'].state = originalPolicy;
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
click('[data-action="open-submenu"][data-entity="select.policy"]');
await new Promise((r) => setTimeout(r, 30));
states['select.policy'].state = 'unavailable';
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
const lostPolicyStillNavigable =
  !!root.querySelector('.settings-panel') &&
  /unavailable/i.test(root.querySelector('.settings-panel [role="alert"]')?.textContent || '') &&
  !!root.querySelector('[data-action="back-settings"]') &&
  !!root.querySelector('[data-action="close-settings"]') &&
  !root.querySelector('[data-action="choose-option"]') && !el._editingEntity;
click('[data-action="close-settings"]');
await new Promise((r) => setTimeout(r, 30));
check('a policy lost during editing shows an error and remains possible to close',
  lostPolicyStillNavigable && !root.querySelector('.settings-panel'));
states['select.policy'].state = originalPolicy;

// Shared integration ledger is the authoritative source, including live updates.
const sampleRecord = { id: 'session-1', started_at: '2026-10-24T01:00:00Z', ended_at: null,
  currency: 'EUR', cost: 4.28, energy_kwh: 19.3, priced_kwh: 19.3, unpriced_kwh: 0,
  status: 'charging', partial: false, issues: [], vehicle: 'Test EV' };
states['sensor.ctl'].attributes.charging_costs = { version: 1, history_limit: 100,
  chargers: { smartevse_1: {session: sampleRecord, history: [sampleRecord]}, smartevse_2: {session: null, history: []} } };
el.hass = hass;
await new Promise(r=>setTimeout(r,30));
check('session estimate appears underneath the battery reading',
  /4[.,]28/.test(root.querySelector('.smartevse_1 .charger-totals .session-cost')?.textContent || ''));
click('.smartevse_1 .session-cost');await new Promise(r=>setTimeout(r,30));
check('cost shortcut opens per-charger history in settings',
  !!root.querySelector('.settings-panel .cost-history') && root.querySelectorAll('.cost-charger').length === 2);
check('history shows energy and honest empty state',
  /19.30 kWh/.test(root.textContent) && /No charging sessions recorded yet/.test(root.textContent));
sampleRecord.cost = -1.25;sampleRecord.partial=true;sampleRecord.issues=['price_unavailable'];sampleRecord.unpriced_kwh=.3;
el.hass=hass;await new Promise(r=>setTimeout(r,30));
check('updated negative costs and missing-price warnings render',
  /1[.,]25/.test(root.querySelector('.session-cost')?.textContent || '') &&
  /Partial estimate/.test(root.textContent) && /prices were unavailable/.test(root.textContent));
sampleRecord.vehicle='<img src=x onerror=alert(1)>';
el.hass=hass;await new Promise(r=>setTimeout(r,30));
check('history vehicle labels are escaped', !root.querySelector('.cost-history img'));
click('[data-action="close-settings"]');await new Promise(r=>setTimeout(r,30));
check('history shortcut closes without triggering a charger command', !root.querySelector('.settings-panel'));

// A slow request can be dismissed without cancelling it or enabling duplicates.
openForceWizard();
await new Promise(r => setTimeout(r, 30));
let resolveNumberWrite;
let pendingWrites = 0;
hass.callService = () => { pendingWrites++; return new Promise(resolve => { resolveNumberWrite = resolve; }); };
el._editorDrafts['number.price'] = '0.21';
const pendingSave = el._saveForceWizardNumber('number.price');
await new Promise(r => setTimeout(r, 30));
click('[data-action="close-force-wizard"]');
await new Promise(r => setTimeout(r, 30));
check('a pending charging request remains visible after X dismisses its dialog',
  !root.querySelector('dialog') && /Updating charging plan/.test(root.textContent) && el._forceWizardBusy);
openForceWizard();
await new Promise(r => setTimeout(r, 30));
await el._saveForceWizardNumber('number.price');
check('reopening a pending plan does not enable another write',
  pendingWrites === 1 && el._forceWizardBusy && root.querySelector('[data-action="toggle-charging-plan"]')?.disabled);
click('[data-action="close-force-wizard"]');
await new Promise(r => setTimeout(r, 30));
resolveNumberWrite();
await pendingSave;
await new Promise(r => setTimeout(r, 30));
check('a dismissed request completes without reopening the modal',
  !root.querySelector('dialog') && !el._forceWizardBusy && !/Updating charging plan/.test(root.textContent));
hass.callService = workingCallService;

// Multi-command plans retain the exact request through close/reopen and stale telemetry.
for (const id of ['switch.force', 'switch.force_price', 'switch.force_timer', 'switch.schedule_price']) states[id].state = 'off';
states['switch.schedule'].state = 'on';
el._forcePlanEnabled = false;
el.hass = hass;
openForceWizard(); await el.updateComplete;
let releasePlanPrice;
const delayedPlanCalls = [];
hass.callService = (domain, service, data) => {
  delayedPlanCalls.push([domain, service, data]);
  if (data.entity_id === 'number.price') return new Promise(resolve => {
    releasePlanPrice = async () => { await workingCallService(domain, service, data); resolve(); };
  });
  return workingCallService(domain, service, data);
};
const scheduleApply = el._toggleSchedulePriceGate(); await el.updateComplete;
el._closeActiveDialog(); await el.updateComplete;
openForceWizard(); el.hass = hass; await el.updateComplete;
check('reopening a pending schedule preserves the requested price gate despite old telemetry', el._schedulePriceGate);
await releasePlanPrice(); await scheduleApply; await el.updateComplete;
check('the pending schedule completes with its requested price gate enabled',
  states['switch.schedule_price'].state === 'on' && delayedPlanCalls.some(call => call[1] === 'turn_on' && call[2].entity_id === 'switch.schedule_price'));

el._editorDrafts['number.price'] = '0.23';
el._editorDrafts['number.duration'] = '95';
const combinedStart = delayedPlanCalls.length;
const combinedApply = el._applyForceMode('timer_price'); await el.updateComplete;
el._closeActiveDialog(); await el.updateComplete;
openForceWizard(); await el.updateComplete;
el._openSettingsModal(); await el.updateComplete;
// Config and local drafts may change independently while an old request awaits its first write.
const previousConfig = el._config;
el._config = { ...previousConfig, force_charge_duration_entity: 'number.changed_duration' };
el._editorDrafts['number.duration'] = '15';
await releasePlanPrice(); await combinedApply; await el.updateComplete;
check('multi-step apply uses the captured duration and target entity after navigation or config changes',
  delayedPlanCalls.slice(combinedStart).some(call => call[2].entity_id === 'number.duration' && call[2].value === 95) &&
  !delayedPlanCalls.slice(combinedStart).some(call => call[2].entity_id === 'number.changed_duration'));
el._config = previousConfig;
hass.callService = workingCallService;
el._closeActiveDialog(); await el.updateComplete;

// Settings share the command lock and never let an old response close a later dialog.
el._openSettingsModal(); el._openEditor('number.duty');
el._updateEditorDraft('number.duty', '45'); await el.updateComplete;
let releaseDuty;
let dutyWrites = 0;
hass.callService = (domain, service, data) => {
  dutyWrites++;
  return new Promise(resolve => { releaseDuty = async () => { await workingCallService(domain, service, data); resolve(); }; });
};
const dutyApply = el._saveEditor('number.duty'); await el.updateComplete;
await el._saveEditor('number.duty');
check('pending settings disable editing and prevent duplicate submissions',
  dutyWrites === 1 && root.querySelector('[data-action="save-edit"]')?.disabled && root.querySelector('.setting-input')?.disabled);
el._requestDialogClose(); await el.updateComplete;
check('closing a sent setting shows pending status without pretending it is an unsaved draft',
  !root.querySelector('dialog') && /Saving settings/.test(root.textContent));
el._openSettingsModal(); el._openEditor('number.duty'); await el.updateComplete;
check('reopening settings cannot start a competing editor while a write is pending',
  !el._editingEntity && root.querySelector('[data-action="edit"][data-entity="number.duty"]')?.disabled);
await releaseDuty(); await dutyApply; await el.updateComplete;
check('old settings completion leaves the newly opened settings view available',
  !!root.querySelector('.settings-panel') && !el._settingsBusy && !root.querySelector('[data-action="edit"][data-entity="number.duty"]')?.disabled);

el._openEditor('number.duty'); el._updateEditorDraft('number.duty', '60'); await el.updateComplete;
let rejectDuty;
hass.callService = () => new Promise((resolve, reject) => { rejectDuty = reject; });
const failedDuty = el._saveEditor('number.duty'); await el.updateComplete;
el._requestDialogClose(); await el.updateComplete;
rejectDuty(new Error('Setting rejected after dismissal')); await failedDuty; await el.updateComplete;
check('a dismissed settings request keeps its eventual error visible on the card',
  !root.querySelector('dialog') && /Setting rejected after dismissal/.test(root.querySelector('[role="alert"]')?.textContent || ''));
hass.callService = workingCallService;

// Rejected optimistic select choices must not survive a changed dialog session.
el._openSettingsModal(); el._openSettingsSubmenu('select.policy'); await el.updateComplete;
const storedPolicy = states['select.policy'].state;
const rejectedPolicy = states['select.policy'].attributes.options.find(value => value !== storedPolicy);
let rejectPolicy;
hass.callService = () => new Promise((resolve, reject) => { rejectPolicy = reject; });
const failedPolicy = el._chooseEditorOption('select.policy', rejectedPolicy); await el.updateComplete;
el._requestDialogClose(); await el.updateComplete;
el._openSettingsModal(); await el.updateComplete;
rejectPolicy(new Error('Delayed policy rejection')); await failedPolicy; await el.updateComplete;
el._openSettingsSubmenu('select.policy'); await el.updateComplete;
check('a rejected choice is reconciled with Home Assistant after closing and reopening settings',
  root.querySelector('[data-action="choose-option"].selected')?.dataset.value === storedPolicy);
hass.callService = workingCallService;

console.log(ok ? '\nSMOKE TEST OK' : '\nSMOKE TEST FAILED');
process.exit(ok ? 0 : 1);
