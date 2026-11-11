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
  root.querySelector('.status-runtime-pill')?.textContent.includes('10\u202fmin'));
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
  root.querySelector('dialog') === nativeDetails && nativeDetails.open && nativeDetails.textContent.includes('12.3\u202fA'));
root.querySelector('dialog .family-dialog-header [title="Close"]').click();
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

// The native dialog owns keyboard containment and Escape; the shared flow owns
// route focus. Real-browser QA checks Tab containment (Happy DOM has no native
// sequential focus navigation).
let dialog = root.querySelector('dialog');
check('opening charging settings moves keyboard focus to the shared dialog heading',
  dialog?.open && root.activeElement === dialog.querySelector('[data-family-heading]'));
const initialHeading = root.activeElement;
controllerAttrs.smartevse_1_max_current = 15;
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
check('live state updates preserve keyboard focus on the shared heading',
  root.activeElement === initialHeading && root.querySelector('dialog') === dialog);
controllerAttrs.smartevse_1_max_current = originalControllerAttrs.smartevse_1_max_current;
el.hass = hass;
await new Promise((r) => setTimeout(r, 30));
check('native modal excludes the underlying charging controls',
  dialog.open && root.querySelector('.flow-stage').inert);
check('one shared X dismisses the full flow',
  dialog.querySelectorAll('.family-dialog-header [title="Close"]').length === 1 &&
  !dialog.querySelector('[data-action="close-force-wizard"]'));
dialog.dispatchEvent(new win.Event('cancel', { cancelable:true }));
await new Promise((r) => setTimeout(r, 30));
check('Escape closes settings and returns focus to the charging-plan control',
  !root.querySelector('dialog') &&
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
  root.querySelectorAll('dialog [aria-label="Back"]').length === 1 &&
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
click('dialog [aria-label="Back"]');
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
const schedulePriceIsUnmet = [...(scheduleHeroGroup?.querySelectorAll('.status-pill[data-tone="neutral"]') || [])]
  .some((node) => node.textContent.trim() === '≤ 0.150\u202fEUR/kWh');
const heroShowsCombinedPlan =
  !root.querySelector('[data-plan-group="force-charge"]') &&
  !!scheduleHeroGroup?.querySelector('.status-pill ha-icon[icon="mdi:clock-start"]') &&
  scheduleHeroGroup?.querySelector('.status-pill-group-label')?.textContent.trim() === 'Schedule' &&
  heroPlanDetails.includes('≤ 0.150\u202fEUR/kWh') &&
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
click('dialog [aria-label="Back"]');
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
const forcePriceIsUnmet = [...(forcePriceGroup?.querySelectorAll('.status-pill[data-tone="neutral"]') || [])]
  .some((node) => node.textContent.trim() === '≤ 0.150\u202fEUR/kWh');
const forcePriceHeroIsUnambiguous =
  /Force.*(waiting|price)/i.test(root.querySelector('.status-title')?.textContent || '') &&
  forcePriceGroup?.querySelector('.status-pill-group-label')?.textContent.trim() === 'Force charge' &&
  forcePriceHeroDetails.includes('≤ 0.150\u202fEUR/kWh') &&
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
click('dialog .family-dialog-header [title="Close"]');

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
click('dialog [aria-label="Back"]');
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
  scheduleHeroDetails.includes('≤ 0.150\u202fEUR/kWh') &&
  orderedHeroGroups[0]?.querySelector('.status-pill-group-label')?.textContent.trim() === 'Force charge' &&
  forceHeroDetails.includes('5\u202fmin left') &&
  orderedHeroGroups[0]?.querySelector('.status-pill[data-tone="neutral"]')?.textContent.trim() === '5\u202fmin left' &&
  forceHeroDetails.includes('≤ 0.150\u202fEUR/kWh') &&
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
  '[data-plan-group="use-schedule"] .status-pill[data-tone="success"]',
)?.textContent.trim() === '≤ 0.150\u202fEUR/kWh';
const acceptedForcePrice = root.querySelector(
  '[data-plan-group="force-charge"] .status-pill[data-tone="success"]',
)?.textContent.trim() === '≤ 0.150\u202fEUR/kWh';
const activeForceTimer = root.querySelector(
  '[data-plan-group="force-charge"] .status-pill[data-tone="accent"]',
)?.textContent.trim() === '5\u202fmin left';
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
click('dialog .family-dialog-header [title="Close"]');
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
click('dialog [aria-label="Back"]');
await new Promise((r) => setTimeout(r, 30));
click('[data-action="choose-force-mode"][data-mode="schedule"]');
await new Promise((r) => setTimeout(r, 30));
check('schedule editor keeps the available schedule while omitting the missing price option',
  !!root.querySelector('[data-action="open-more-info"][data-entity="schedule.charging"]') &&
  !root.querySelector('[data-action="toggle-schedule-price"]'));
click('dialog .family-dialog-header [title="Close"]');
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
click('dialog .family-dialog-header [title="Close"]');
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
const policyCallService = hass.callService;
let releasePolicy;
hass.callService = (...args) => new Promise((resolve) => { releasePolicy = () => resolve(policyCallService(...args)); });
click('[data-action="choose-option"][data-value="smartevse_2_only"]');
await new Promise((r) => setTimeout(r, 30));
const pendingPolicy = root.querySelector('[data-action="choose-option"][data-value="smartevse_2_only"]');
check('a pending policy choice shows progress on the chosen option only',
  pendingPolicy?.getAttribute('aria-busy') === 'true' && !!pendingPolicy?.querySelector('.family-pending-indicator') &&
  root.querySelectorAll('.modal-option .family-pending-indicator').length === 1);
releasePolicy();
hass.callService = policyCallService;
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
check('setting errors use the shared error notice with its severity icon',
  !!root.querySelector('.settings-panel .family-notice[data-tone="error"][role="alert"] ha-icon.family-notice-icon') &&
  !root.querySelector('.wizard-error'));
check('policy choices are shared toggle pills exposing their pressed state',
  [...root.querySelectorAll('[data-action="choose-option"]')].every((option) => option.classList.contains('family-toggle') &&
    option.getAttribute('aria-pressed') === String(option.classList.contains('selected'))) &&
  root.querySelector('[data-action="choose-option"][aria-pressed="true"]')?.dataset.value === 'Custom solar priority');
hass.callService = workingCallService;
click('dialog [aria-label="Back"]');
await new Promise((r) => setTimeout(r, 30));
states['select.policy'].attributes.options = [];
el.hass = hass;
click('[data-action="open-submenu"][data-entity="select.policy"]');
await new Promise((r) => setTimeout(r, 30));
check('an empty priority option list never invents controller choices',
  !root.querySelector('[data-action="choose-option"][data-entity="select.policy"]'));
click('dialog [aria-label="Back"]');
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
click('dialog .family-dialog-header [title="Close"]');
await new Promise((r) => setTimeout(r, 30));
check('X protects an unsaved rejected draft with a discard confirmation',
  !!root.querySelector('dialog .family-action.destructive') &&
  !!root.querySelector('dialog .family-dialog-header [title="Close"] ha-icon'));
click('dialog [data-family-keep]');
await new Promise((r) => setTimeout(r, 30));
check('keeping the draft restores the typed value',
  root.querySelector('.setting-input[data-entity="number.duty"]')?.value === '60');
click('dialog .family-dialog-header [title="Close"]');
await new Promise((r) => setTimeout(r, 30));
click('dialog .family-action.destructive');
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
  !!root.querySelector('dialog [aria-label="Back"]') &&
  !!root.querySelector('dialog .family-dialog-header [title="Close"]') &&
  !root.querySelector('[data-action="choose-option"]') && !el._editingEntity;
click('dialog .family-dialog-header [title="Close"]');
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
// What a charge has taken and cost is the "Charged" row of the tile, in every mode; its value is
// the control that opens that charger's history (the "Session estimate" button is gone).
const chargedControl = '.smartevse_1 .plan-row[data-row="charged"] [data-action="open-history"]';
check('what this charge has taken and cost is the Charged row of the tile',
  root.querySelector('.smartevse_1 .plan-row[data-row="charged"] dt')?.textContent === 'Charged' &&
  /^19[.,]3\skWh · ≈ .*4[.,]28$/.test(root.querySelector(chargedControl)?.textContent.replace(/\s+/g, ' ').trim() || '') &&
  root.querySelector(chargedControl)?.getAttribute('aria-haspopup') === 'dialog' && root.querySelector(chargedControl)?.dataset.charger === 'smartevse_1' &&
  !root.querySelector('.session-cost, .charger-totals button') && !/Session estimate|Last session/.test(root.querySelector('.ev-row')?.textContent || ''));
click(chargedControl);await new Promise(r=>setTimeout(r,30));
check('the Charged value opens charging history directly with its charger expanded',
  root.querySelector('dialog')?.getAttribute('aria-label') === 'Charging history' &&
  !root.querySelector('.settings-panel') && root.querySelectorAll('.cost-charger').length === 2 &&
  root.querySelector('[data-charger="cost-smartevse_1"]')?.open && !root.querySelector('[data-charger="cost-smartevse_2"]')?.open);
check('session history stays content sized and scrolls within the shared body',
  !root.querySelector('dialog').classList.contains('long') &&
  !!root.querySelector('dialog .family-dialog-body') &&
  root.querySelectorAll('.cost-charger').length === 2);
check('history shows energy and honest empty state',
  /19.30\u202fkWh/.test(root.textContent) && /No charging sessions recorded yet/.test(root.textContent));
sampleRecord.cost = -1.25;sampleRecord.partial=true;sampleRecord.issues=['price_unavailable'];sampleRecord.unpriced_kwh=.3;
el.hass=hass;await new Promise(r=>setTimeout(r,30));
check('updated negative costs and missing-price warnings render',
  /1[.,]25 · partial estimate$/.test(root.querySelector(chargedControl)?.textContent.replace(/\s+/g, ' ').trim() || '') &&
  /Partial estimate/.test(root.textContent) && /prices were unavailable/.test(root.textContent));
sampleRecord.vehicle='<img src=x onerror=alert(1)>';
el.hass=hass;await new Promise(r=>setTimeout(r,30));
check('history vehicle labels are escaped', !root.querySelector('.cost-history img'));
click('dialog .family-dialog-header [title="Close"]');await new Promise(r=>setTimeout(r,30));
check('history shortcut closes its own dialog', !root.querySelector('dialog'));

// A slow request can be dismissed without cancelling it or enabling duplicates.
openForceWizard();
await new Promise(r => setTimeout(r, 30));
let resolveNumberWrite;
let pendingWrites = 0;
hass.callService = () => { pendingWrites++; return new Promise(resolve => { resolveNumberWrite = resolve; }); };
el._editorDrafts['number.price'] = '0.21';
const pendingSave = el._saveForceWizardNumber('number.price');
await new Promise(r => setTimeout(r, 30));
click('dialog .family-dialog-header [title="Close"]');
await new Promise(r => setTimeout(r, 30));
check('a pending charging request remains visible after X dismisses its dialog',
  !root.querySelector('dialog') && /Updating charging plan/.test(root.textContent) && el._forceWizardBusy);
check('the dismissed request status shows the shared pending indicator',
  !!root.querySelector('.flow-stage > .pending-note[role="status"] .family-pending-indicator'));
openForceWizard();
await new Promise(r => setTimeout(r, 30));
await el._saveForceWizardNumber('number.price');
check('reopening a pending plan does not enable another write',
  pendingWrites === 1 && el._forceWizardBusy && root.querySelector('[data-action="toggle-charging-plan"]')?.disabled);
click('dialog .family-dialog-header [title="Close"]');
await new Promise(r => setTimeout(r, 30));
resolveNumberWrite();
await pendingSave;
await new Promise(r => setTimeout(r, 30));
check('a dismissed request completes without reopening the modal',
  !root.querySelector('dialog') && !el._forceWizardBusy && !/Updating charging plan/.test(root.textContent));

// Progress belongs to the toggle that sent the command, not to the whole dialog.
const forceStateBeforeToggle = states['switch.force'].state;
states['switch.force'].state = 'on';
el.hass = hass;
openForceWizard();
await new Promise(r => setTimeout(r, 30));
const queuedPlanCalls = [];
hass.callService = (...args) => new Promise(resolve => queuedPlanCalls.push(() => resolve(workingCallService(...args))));
const planTogglePending = el._toggleChargingPlan('now');
await el.updateComplete;
const pendingPlanToggle = root.querySelector('[data-action="toggle-charging-plan"][data-mode="now"]');
check('a pending plan toggle carries aria-busy and a visible indicator beside its title',
  pendingPlanToggle?.getAttribute('aria-busy') === 'true' &&
  !!pendingPlanToggle.closest('.wizard-option')?.querySelector('.control-pending .family-pending-indicator') &&
  root.querySelector('[data-action="toggle-charging-plan"][data-mode="schedule"]')?.getAttribute('aria-busy') !== 'true' &&
  !root.querySelector('dialog .family-dialog-body > div[aria-busy="true"]'));
const pendingPlanMain = pendingPlanToggle?.closest('.wizard-option')?.querySelector('.wizard-option-main');
const idlePlanMain = root.querySelector('[data-action="choose-force-mode"][data-mode="schedule"]');
check('the pending plan row stays fully opaque while the other row dims',
  pendingPlanMain?.disabled && pendingPlanMain.getAttribute('aria-busy') === 'true' &&
  getComputedStyle(pendingPlanMain).opacity === '1' && getComputedStyle(pendingPlanToggle).opacity === '1' &&
  idlePlanMain?.disabled && getComputedStyle(idlePlanMain).opacity === '0.55');
hass.callService = workingCallService;
while (queuedPlanCalls.length) queuedPlanCalls.shift()();
await planTogglePending;
await el.updateComplete;
check('a completed plan toggle clears its pending state',
  !root.querySelector('[data-action="toggle-charging-plan"][aria-busy="true"]') && !root.querySelector('.control-pending'));
el._closeActiveDialog(); await el.updateComplete;
states['switch.force'].state = forceStateBeforeToggle;
el.hass = hass;
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
const pendingApply = root.querySelector('dialog .family-dialog-footer.equal [data-action="save-edit"]');
check('Apply and Cancel share the equal dialog footer and Apply shows its pending state',
  pendingApply?.classList.contains('family-action') && pendingApply.classList.contains('primary') &&
  pendingApply.getAttribute('aria-busy') === 'true' && !!pendingApply.querySelector('.family-pending-indicator') &&
  /Saving/.test(pendingApply.textContent) &&
  root.querySelector('dialog .family-dialog-footer.equal [data-action="cancel-edit"]')?.classList.contains('family-action'));
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

// Shared navigation guards protect unsent/rejected values on Back as well as X.
el._closeActiveDialog(); await el.updateComplete;
el._openForceWizard(); el._selectForceMode('now'); await el.updateComplete;
el._forceNowPrice = true; el._editorDrafts['number.price'] = '0.26'; el._render(); await el.updateComplete;
const dirtyCalls = calls.length;
const stableDialog = root.querySelector('dialog');
click('dialog [aria-label="Back"]'); await el.updateComplete;
check('Back uses shared discard protection without losing the current page',
  root.querySelector('dialog') === stableDialog && !!root.querySelector('[aria-label="Unsaved changes"]') && el._forceWizardStep === 'now');
click('dialog [data-family-keep]'); await el.updateComplete;
check('keeping a charging draft restores its value and existing dialog',
  root.querySelector('dialog') === stableDialog && root.querySelector('input[data-entity="number.price"]')?.value === '0.26');
const retainedPriceInput = root.querySelector('input[data-entity="number.price"]'); retainedPriceInput?.focus();
controllerAttrs.smartevse_1_max_current = 14; el.hass = hass; await el.updateComplete;
check('telemetry updates retain the user-owned number draft and focus',
  root.activeElement?.dataset.entity === 'number.price' && root.activeElement?.value === '0.26');
click('dialog [aria-label="Back"]'); await el.updateComplete;
click('dialog .family-action.destructive'); await el.updateComplete;
check('confirmed Back returns to the plan menu without sending a command',
  el._forceWizardStep === 'choose' && el._forceWizardOpen && calls.length === dirtyCalls);

// A native HA handoff is deferred until the shared dirty-value guard is resolved.
el._selectForceMode('schedule'); el._schedulePriceGate = true; el._editorDrafts['number.price'] = '0.29'; el._render(); await el.updateComplete;
moreInfoEntity = null;
const nativeFocus = document.createElement('button'); document.body.append(nativeFocus);
const onNativeHandoff = () => nativeFocus.focus(); el.addEventListener('hass-more-info', onNativeHandoff);
click('[data-action="open-more-info"][data-entity="schedule.charging"]'); await el.updateComplete;
check('native schedule details wait for draft confirmation',
  moreInfoEntity === null && !!root.querySelector('[aria-label="Unsaved changes"]'));
click('dialog .family-action.destructive'); await el.updateComplete;
check('confirmed native handoff closes the shared flow without stealing native focus',
  moreInfoEntity === 'schedule.charging' && !root.querySelector('dialog') && document.activeElement === nativeFocus);
el.removeEventListener('hass-more-info', onNativeHandoff); nativeFocus.remove();

// The settings entry inside a charging plan is a real child route.
el._openForceWizard(); el._openSettingsModal(); await el.updateComplete;
check('plan settings has one shared Back and X',
  root.querySelectorAll('dialog [aria-label="Back"]').length === 1 && root.querySelectorAll('dialog .family-dialog-header [title="Close"]').length === 1);
click('dialog [aria-label="Back"]'); await el.updateComplete;
check('settings Back returns to the originating charging plan',
  el._forceWizardOpen && el._forceWizardStep === 'choose' && !el._settingsModalOpen);
el._closeActiveDialog(); await el.updateComplete;

// Config, history and numeric editing use distinct, guarded shared routes.
const uiCalls = calls.length;
const unrelatedOpener = document.createElement('button'); document.body.append(unrelatedOpener); unrelatedOpener.focus();
click(chargedControl); await el.updateComplete;
click('dialog .family-dialog-header [title="Close"]'); await el.updateComplete;
check('a non-focusing touch history launch returns focus to the Charged value it was opened from',
  root.activeElement?.matches(chargedControl));
unrelatedOpener.remove();
check('the charging-plan editor uses the shared settings icon and dialog semantics',
  root.querySelector('.edit-plan ha-icon')?.getAttribute('icon') === 'mdi:cog-outline' &&
  root.querySelector('[data-action="open-force-wizard"]')?.getAttribute('aria-haspopup') === 'dialog');
el._openForceWizard(); await el.updateComplete;
check('settings entry uses the common cog and no tab semantics',
  root.querySelector('[data-action="open-settings"] ha-icon')?.getAttribute('icon') === 'mdi:cog-outline' &&
  !root.querySelector('[role="tab"], [aria-selected]'));
click('[data-action="open-settings"]'); await el.updateComplete;
check('settings no longer contains charging history',
  !root.querySelector('dialog [data-action="open-history"]') && !root.querySelector('dialog .cost-history'));
click('[data-action="edit"][data-entity="number.duty"]'); await el.updateComplete;
check('duty cycle uses a named child editor with one Back and X',
  root.querySelector('dialog')?.getAttribute('aria-label') === 'Duty cycle' &&
  root.querySelectorAll('dialog [aria-label="Back"]').length === 1 &&
  root.querySelectorAll('dialog .family-dialog-header [title="Close"]').length === 1 &&
  !!root.querySelector('input[aria-label="Duty cycle (min)"]'));
el._updateEditorDraft('number.duty', String(Number(states['number.duty'].state) + 5)); el._render(); await el.updateComplete;
click('dialog [aria-label="Back"]'); await el.updateComplete;
check('numeric child Back protects its unsent draft',
  !!root.querySelector('[aria-label="Unsaved changes"]') && el._settingsSubmenuEntity === 'number.duty');
click('dialog [data-family-keep]'); await el.updateComplete;
click('[data-action="cancel-edit"]'); await el.updateComplete;
check('explicit Cancel returns to settings without submitting the numeric draft',
  el._flow.current === 'settings' && !el._editingEntity && calls.length === uiCalls);
el._closeActiveDialog(); await el.updateComplete;

const mainHistoryOpener = root.querySelector('.charging-history-launcher');
check('main card exposes a named charging-history action',
  mainHistoryOpener?.textContent.includes('Charging history') &&
  mainHistoryOpener?.getAttribute('aria-haspopup') === 'dialog' &&
  mainHistoryOpener?.querySelector('ha-icon')?.getAttribute('icon') === 'mdi:history');
const chargerTiles = root.querySelector('.ev-row');
mainHistoryOpener.click(); await el.updateComplete;
check('main charging history is a root modal without Settings or Back',
  root.querySelector('dialog')?.getAttribute('aria-label') === 'Charging history' &&
  !root.querySelector('dialog [aria-label="Back"]') && root.querySelector('.ev-row') === chargerTiles);
click('dialog [title="Close"]'); await el.updateComplete;
check('charging history closes back to its main-card opener',root.activeElement === mainHistoryOpener);

// Price labels preserve missing data and provide the value to screen readers.
check('unknown cost is never presented as a numeric approximation',
  el._costLabel(null) === 'Unavailable' &&
  el._costLabel({...sampleRecord, cost: NaN}) === 'Unavailable' &&
  el._costLabel({...sampleRecord, energy_kwh: 1, priced_kwh: 0}) === 'Unavailable');
check('zero and negative electricity cost remain valid estimates',
  el._costLabel({...sampleRecord, cost: 0}).startsWith('≈ ') &&
  el._costLabel({...sampleRecord, cost: -1}).startsWith('≈ '));
check('the Charged history control includes the charger and the formatted cost in its accessible name',
  root.querySelector(chargedControl)?.getAttribute('aria-label')?.startsWith('SmartEVSE 1 charged ') &&
  root.querySelector(chargedControl).getAttribute('aria-label').includes(el._costLabel(sampleRecord)) &&
  root.querySelector(chargedControl).getAttribute('aria-label').endsWith('; open history'));
const historyCommandsBefore = calls.length;
mainHistoryOpener.click(); await el.updateComplete;
check('history summaries label their session count and expose a record disclosure',
  root.querySelector('.cost-charger-name')?.textContent.includes('Carport charger') &&
  root.querySelector('.cost-charger-count')?.textContent.includes('1 session') &&
  !!root.querySelector('.cost-record summary .cost-disclosure'));
check('browsing charging costs sends no control commands', calls.length === historyCommandsBefore);
el._closeActiveDialog(); await el.updateComplete;

const batteryMeter = root.querySelector('.smartevse_1 .family-level-meter.battery-meter');
check('connected vehicle battery uses the shared level meter with its band',
  batteryMeter?.getAttribute('role') === 'meter' &&
  batteryMeter.querySelector('.family-level-fill')?.dataset.tone === 'success');

// Shared presentation: plan chips, status colours and HA-aware formatting.
const cardCss = [...root.querySelectorAll('style')].map((node) => node.textContent).join('\n');
check('an unavailable charger uses the readable unavailable colour, not amber',
  /\.tone-unavailable \.charger-status \{ color: var\(--family-unavailable\); \}/.test(cardCss) &&
  !/var\(--status-(success|warn|alert)-color\)/.test(cardCss));
check('the battery bar comes from the shared level meter, not card CSS',
  !/\.battery-track|level-medium|level-low/.test(cardCss) && /\.battery-meter \{ margin-top: 18px; \}/.test(cardCss));
check('the outer card uses the family radius and divider border without a heavy shadow',
  /border-radius: var\(--family-radius\);\s*border: 1px solid var\(--divider-color/.test(cardCss) && !/0 10px 30px/.test(cardCss));
const savedLocale = el._hass.locale;
el._hass.locale = { language: 'de', number_format: 'decimal_comma', time_format: '24' };
check('current, duration and money follow the Home Assistant profile locale',
  el._formatCurrent(12.3) === '12,3\u202fA' && el._formatMinutes(90) === '1\u202fh 30\u202fmin' &&
  el._costAmount({ ...sampleRecord, cost: 1.5 }).includes('1,50'));
check('missing durations and times use the shared unavailable marker',
  el._formatSeconds('unknown') === 'Unavailable' && el._formatDateTime('') === 'Unavailable' &&
  el._costTime('not a time') === 'Time unavailable');
el._hass.locale = savedLocale;
states['switch.schedule'].state = 'on';
el.hass = hass; await el.updateComplete;
const enabledScheduleLabel = root.querySelector('[data-plan-group="use-schedule"] .status-pill-group-label');
check('enabled plan labels are shared accent chips that keep their on-state icon',
  enabledScheduleLabel?.classList.contains('family-chip') && enabledScheduleLabel.dataset.tone === 'accent' &&
  enabledScheduleLabel.querySelector('ha-icon')?.getAttribute('icon') === 'mdi:toggle-switch' &&
  !/Enabled/.test(enabledScheduleLabel.textContent) &&
  [...root.querySelectorAll('.status-pill')].every((pill) => pill.classList.contains('family-chip') && pill.dataset.tone));

// ---------------------------------------------------------------------------
// Intelligent charging (card 0.3.0). The base fixture above has no Intelligent
// entities, so the feature stays hidden there; this block mounts a second card
// against its own synthetic integration payload. No device is contacted.
check('without the Intelligent switch the base card shows no Intelligent tile, group, chart or plan fact',
  !root.querySelector('[data-mode="intelligent"]') && !root.querySelector('[data-plan-group="intelligent"]') &&
  !root.querySelector('.charger-plan-line, .family-chart-frame, .plan-saving') &&
  [...root.querySelectorAll('.plan-row')].every((row) => row.getAttribute('data-row') === 'charged'));

const FIXED_NOW = Date.parse('2026-11-09T18:00:00Z');
const realDateNow = Date.now;
Date.now = () => FIXED_NOW;
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const clone = (value) => JSON.parse(JSON.stringify(value));
const iEntities = {
  intelligent_charge: 'switch.ic', intelligent_top_up: 'switch.ic_top_up', intelligent_top_up_price: 'number.ic_top_up_price',
  vehicle_1: { ready_by: 'time.v1_ready_by', minimum_charge: 'number.v1_minimum' },
  vehicle_2: { ready_by: 'time.v2_ready_by', minimum_charge: 'number.v2_minimum' },
  other: { ready_by: 'time.other_ready_by', minimum_charge: 'number.other_minimum' },
  status: 'sensor.ic_status', planned_cost: 'sensor.ic_cost', planned_saving: 'sensor.ic_saving', next_charge: 'sensor.ic_next',
};
const priceSlots = [];
for (let h = 18; h < 31; h++) {
  const start = new Date(Date.UTC(2026, 10, 9, h)).toISOString();
  const end = new Date(Date.UTC(2026, 10, 9, h + 1)).toISOString();
  priceSlots.push({ start, end, price: h < 25 ? 0.19 + (h % 3) / 100 : 0.2, kind: h < 25 ? 'known' : 'forecast',
    smartevse_1_minutes: 0, smartevse_2_minutes: 0, expected_kw: 10.5 });
}
const xc40Plan = () => ({
  vehicle: 'vehicle_1', vehicle_name: 'Volvo XC40', settings_key: 'vehicle_1', soc: 53, soc_source: 'vehicle',
  minimum: 80, target: 80, car_limit: 90, limited_by_car: false, ready_by: '07:00', deadline: '2026-11-10T07:00:00+00:00',
  status: 'planned', feasible: true, estimated: false, projected_soc: 80, need_kwh: 21.5,
  blocks: [{ start: '2026-11-09T21:00:00+00:00', end: '2026-11-09T22:00:00+00:00', top_up: false },
    { start: '2026-11-09T23:00:00+00:00', end: '2026-11-10T00:00:00+00:00', top_up: false }],
  next_start: '2026-11-09T21:00:00+00:00', session_cost: 4.91, saving: 1.29, includes_forecast: false, partial: false,
  overrun: false, not_accepting: false, car_timer: false, queue_after: null, top_up: false, top_up_cost: null,
});
const ex30Plan = () => ({
  vehicle: 'vehicle_2', vehicle_name: 'Volvo EX30', settings_key: 'vehicle_2', soc: 30, soc_source: 'vehicle',
  minimum: 80, target: 80, car_limit: 100, limited_by_car: false, ready_by: '07:00', deadline: '2026-11-10T07:00:00+00:00',
  status: 'planned', feasible: true, estimated: false, projected_soc: 80, need_kwh: 25,
  blocks: [{ start: '2026-11-10T02:00:00+00:00', end: '2026-11-10T04:00:00+00:00', top_up: false },
    { start: '2026-11-10T04:00:00+00:00', end: '2026-11-10T04:30:00+00:00', top_up: true }],
  next_start: '2026-11-10T02:00:00+00:00', session_cost: 1.19, saving: 0.05, includes_forecast: false, partial: false,
  overrun: false, not_accepting: false, car_timer: false, queue_after: null, top_up: true, top_up_cost: 0.2,
});
const basePayload = () => ({
  enabled: true, status: 'planned', reason: 'intelligent_waiting_for_planned_slot', overridden_by: null,
  connected_count: 2, currency: 'EUR', known_until: '2026-11-10T01:00:00+00:00', forecast_used: true, baseline_kind: 'plug_in',
  model_error: null, planner_error: null,
  totals: { cost: 6.1, saving: 1.34, energy_kwh: 46.5, includes_forecast: false, partial: false },
  next_charge: '2026-11-09T21:00:00+00:00', order: ['smartevse_1', 'smartevse_2'],
  chargers: { smartevse_1: xc40Plan(), smartevse_2: ex30Plan() },
  vehicles: {
    vehicle_1: { name: 'Volvo XC40', ready_by: '07:00', minimum: 80, suggested_ready_by: '06:15', learned_sessions: 12,
      model: { kwh_per_pct: 0.71, kwh_per_pct_source: 'learned', cap_kw: 10.9 } },
    vehicle_2: { name: 'Volvo EX30', ready_by: '07:00', minimum: 80, suggested_ready_by: null, learned_sessions: 2,
      model: { kwh_per_pct: 0.55, kwh_per_pct_source: 'capacity', cap_kw: 10.9 } },
    other: { name: 'Unidentified vehicle', ready_by: '07:00', minimum: 80 },
  },
  household: { learned_days: 3, night_expected_kw: 9.1 },
  slots: priceSlots,
  sessions: [
    { ledger_id: 'ex30-last', outlet: 'smartevse_2', vehicle_name: 'Volvo EX30', closed: true, energy_kwh: 14.2, cost: 2.4, baseline_cost: 3.65, saving: 1.25, mixed: false, partial: false },
    { ledger_id: 'xc40-forced', outlet: 'smartevse_1', vehicle_name: 'Volvo XC40', closed: true, energy_kwh: 9.1, cost: 2.9, baseline_cost: 2.5, saving: -0.4, mixed: true, partial: false },
  ],
  top_up: { enabled: false, price: 0.16 },
  entities: clone(iEntities),
});
const ledgerRecord = (id, vehicle) => ({ id, started_at: '2026-11-08T21:00:00Z', ended_at: '2026-11-09T05:00:00Z', currency: 'EUR',
  cost: 2.4, energy_kwh: 14.2, priced_kwh: 14.2, unpriced_kwh: 0, status: 'finished', partial: false, issues: [], vehicle });
const timeAttrs = {};
const percentAttrs = { min: 10, max: 100, step: 1, unit_of_measurement: '%' };
const iStates = {
  'sensor.ctl': { state: 'intelligent', attributes: {
    charge_allowed: false, charge_reason: 'intelligent_waiting_for_planned_slot', active_smartevse_raw: '', controller_error: null,
    smartevse_1_available: true, smartevse_1_connected_ev: 'Volvo XC40', smartevse_1_battery: '53', smartevse_1_mode: 'Off',
    smartevse_1_charge_current: 16, smartevse_1_max_current: 16, smartevse_1_state: 'Ready to Charge', smartevse_1_plug_state: 'Connected', smartevse_1_error: 'None',
    smartevse_2_available: true, smartevse_2_connected_ev: 'Volvo EX30', smartevse_2_battery: '30', smartevse_2_mode: 'Off',
    smartevse_2_charge_current: 16, smartevse_2_max_current: 16, smartevse_2_state: 'Ready to Charge', smartevse_2_plug_state: 'Connected', smartevse_2_error: 'None',
    charging_costs: { version: 1, history_limit: 100, chargers: {
      smartevse_1: { session: ledgerRecord('xc40-forced', 'Volvo XC40'), history: [ledgerRecord('xc40-forced', 'Volvo XC40')] },
      smartevse_2: { session: ledgerRecord('ex30-last', 'Volvo EX30'), history: [ledgerRecord('ex30-last', 'Volvo EX30')] } } },
    intelligent: basePayload(),
  } },
  'sensor.current_price': { state: '0.21', attributes: {} },
  'schedule.charging': { state: 'off', attributes: { friendly_name: 'EV overnight schedule', next_event: '2026-11-10T00:00:00+00:00' } },
  'switch.schedule': { state: 'on', attributes: {} },
  'switch.schedule_price': { state: 'on', attributes: {} },
  'switch.force': { state: 'off', attributes: {} },
  'switch.force_price': { state: 'off', attributes: {} },
  'switch.force_timer': { state: 'off', attributes: {} },
  'select.policy': { state: 'SmartEVSE 1 first', attributes: { options: ['SmartEVSE 1 first', 'SmartEVSE 2 first', 'SmartEVSE 1 only', 'SmartEVSE 2 only'] } },
  'number.price': { state: '0.12', attributes: { min: 0, max: 1, step: 0.01, unit_of_measurement: 'EUR/kWh' } },
  'number.duration': { state: '60', attributes: { min: 5, max: 720, step: 5, unit_of_measurement: 'min' } },
  'number.duty': { state: '30', attributes: { min: 5, max: 240, step: 5, unit_of_measurement: 'min' } },
  'sensor.duty_remaining': { state: '600', attributes: {} },
  'sensor.timer_remaining': { state: '0', attributes: {} },
  'switch.ic': { state: 'off', attributes: {} },
  'switch.ic_top_up': { state: 'off', attributes: {} },
  'number.ic_top_up_price': { state: '0.16', attributes: { min: -1, max: 5, step: 0.001, unit_of_measurement: 'EUR/kWh' } },
  'time.v1_ready_by': { state: '07:00:00', attributes: timeAttrs },
  'number.v1_minimum': { state: '80', attributes: percentAttrs },
  'time.v2_ready_by': { state: '07:00:00', attributes: timeAttrs },
  'number.v2_minimum': { state: '80', attributes: percentAttrs },
  'time.other_ready_by': { state: '07:00:00', attributes: timeAttrs },
  'number.other_minimum': { state: '80', attributes: percentAttrs },
  'sensor.ic_status': { state: 'planned', attributes: {} },
  'sensor.ic_cost': { state: '6.1', attributes: {} },
  'sensor.ic_saving': { state: '1.34', attributes: {} },
  'sensor.ic_next': { state: '2026-11-09T21:00:00+00:00', attributes: {} },
};
const iCalls = [];
const applyCall = (domain, service, data) => {
  iCalls.push([domain, service, data]);
  const entity = iStates[data?.entity_id];
  if (!entity) return Promise.resolve();
  if (domain === 'homeassistant') entity.state = service === 'turn_on' ? 'on' : 'off';
  if (domain === 'number' && service === 'set_value') entity.state = String(data.value);
  if (domain === 'time' && service === 'set_value') entity.state = String(data.time);
  return Promise.resolve();
};
let iService = applyCall;
const iHass = {
  states: iStates,
  locale: { language: 'en-GB', number_format: 'language', time_format: '24', time_zone: 'server' },
  config: { time_zone: 'UTC', currency: 'EUR' },
  callService: (...args) => iService(...args),
};
const iAttrs = iStates['sensor.ctl'].attributes;
const savedSwitch = iStates['switch.ic'];
delete iStates['switch.ic'];

// Happy DOM cannot resolve a second shadow root's activeElement while focus sits in another card.
root.activeElement?.blur();
const el2 = document.createElement(tag);
// The checks below cover the classic tiles; the plan layout (0.4.0 default) follows at the end.
el2.setConfig({ ...config, layout: 'classic' });
el2.hass = iHass;
document.body.appendChild(el2);
await wait(60);
const root2 = el2.shadowRoot;
const t7 = el2._formatClock('07:00');
const t615 = el2._formatClock('06:15');
const push = async () => { el2.hass = iHass; await wait(); };
const click2 = async (selector) => {
  root2.querySelector(selector)?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
  await wait();
};
const openPlan2 = async () => {
  el2._closeActiveDialog(); await el2.updateComplete;
  el2._openForceWizard(); await el2.updateComplete; await wait(10);
};
const text2 = (selector) => root2.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() || '';
// A tile's note or warning line(s), all its fact rows, and its plan facts (without "Charged").
const norm2 = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const planText = (key) => [...root2.querySelectorAll(`.ev-node.${key} .charger-plan-line`)].map((node) => norm2(node.textContent));
const rows2 = (key) => [...root2.querySelectorAll(`.ev-node.${key} .plan-row`)].map((row) => [row.querySelector('dt').textContent, norm2(row.querySelector('dd').textContent)]);
const planRows2 = (key) => rows2(key).filter((row) => !['Charged', 'Last charge'].includes(row[0]));
const sameRows = (left, right) => JSON.stringify(left) === JSON.stringify(right);

// Missing switch: the payload alone does not enable the feature.
await openPlan2();
check('Intelligent stays hidden while its switch entity is missing, even with a payload',
  root2.querySelectorAll('[data-action="choose-force-mode"]').length === 2 &&
  !root2.querySelector('[data-mode="intelligent"]') && !root2.querySelector('.charger-plan-line') &&
  planRows2('smartevse_1').length === 0 && planRows2('smartevse_2').length === 0 && !root2.querySelector('.family-chart-frame'));
el2._closeActiveDialog(); await el2.updateComplete;
iStates['switch.ic'] = savedSwitch;
await push();

// Chooser: a third tile with the brain icon and the same switch/glow pattern.
await openPlan2();
const intelligentMain = root2.querySelector('[data-action="choose-force-mode"][data-mode="intelligent"]');
const intelligentToggle = root2.querySelector('[data-action="toggle-charging-plan"][data-mode="intelligent"]');
check('the chooser adds a titled Intelligent charging tile with the brain icon and a plan switch',
  root2.querySelectorAll('[data-action="choose-force-mode"]').length === 3 &&
  intelligentMain?.querySelector('.wizard-option-icon ha-icon')?.getAttribute('icon') === 'mdi:brain' &&
  intelligentMain?.textContent.includes('Intelligent charging') &&
  intelligentToggle?.getAttribute('role') === 'switch' && intelligentToggle?.getAttribute('aria-checked') === 'false' &&
  intelligentToggle?.getAttribute('aria-label') === 'Intelligent charging');

// Enabling Intelligent leaves Schedule and its price option alone (independent plans, 2026-11-10).
const pendingIntelligent = [];
iService = (...args) => new Promise((resolve) => pendingIntelligent.push(() => resolve(applyCall(...args))));
let callStart = iCalls.length;
const enableIntelligent = el2._toggleChargingPlan('intelligent');
await el2.updateComplete;
const busyToggle = root2.querySelector('[data-action="toggle-charging-plan"][data-mode="intelligent"]');
check('the Intelligent toggle alone carries aria-busy and the pending indicator while it switches plans',
  busyToggle?.getAttribute('aria-busy') === 'true' &&
  !!busyToggle.closest('.wizard-option')?.querySelector('.control-pending .family-pending-indicator') &&
  root2.querySelector('[data-action="toggle-charging-plan"][data-mode="schedule"]')?.getAttribute('aria-busy') !== 'true' &&
  root2.querySelectorAll('.control-pending').length === 1);
iService = applyCall;
while (pendingIntelligent.length) {
  pendingIntelligent.shift()();
  await wait(5);
}
await enableIntelligent; await el2.updateComplete;
let planCalls = iCalls.slice(callStart).map((c) => `${c[1]} ${c[2].entity_id}`);
check('enabling Intelligent only turns Intelligent on; Schedule and its price option stay as they were',
  JSON.stringify(planCalls) === JSON.stringify(['turn_on switch.ic']) &&
  iStates['switch.ic'].state === 'on' && iStates['switch.schedule'].state === 'on' && iStates['switch.schedule_price'].state === 'on');
check('the enabled Intelligent tile glows and reports its switch state',
  !!root2.querySelector('.wizard-option-wrap.selected [data-mode="intelligent"]') &&
  root2.querySelector('[data-action="toggle-charging-plan"][data-mode="intelligent"]')?.getAttribute('aria-checked') === 'true');

// Enabling Schedule from its switch leaves Intelligent on.
iStates['switch.schedule'].state = 'off'; await push();
el2._schedulePriceGate = false;
callStart = iCalls.length;
await el2._toggleChargingPlan('schedule'); await el2.updateComplete;
planCalls = iCalls.slice(callStart).map((c) => `${c[1]} ${c[2].entity_id}`);
check('enabling Schedule turns the schedule on and leaves Intelligent on',
  planCalls[0] === 'turn_on switch.schedule' && !planCalls.some((c) => c.endsWith('switch.ic')) &&
  iStates['switch.schedule'].state === 'on' && iStates['switch.ic'].state === 'on');
// Editing the schedule's price option never touches Intelligent.
iStates['switch.ic'].state = 'on'; await push();
callStart = iCalls.length;
await el2._applyForceMode('schedule'); await el2.updateComplete;
check('re-applying schedule options leaves an enabled Intelligent plan alone',
  !iCalls.slice(callStart).some((c) => c[2].entity_id === 'switch.ic') && iStates['switch.ic'].state === 'on');
iStates['switch.schedule'].state = 'off'; iStates['switch.schedule_price'].state = 'off';
await push();
callStart = iCalls.length;
await el2._toggleChargingPlan('intelligent'); await el2.updateComplete;
check('the Intelligent switch turns only Intelligent off',
  JSON.stringify(iCalls.slice(callStart).map((c) => `${c[1]} ${c[2].entity_id}`)) === JSON.stringify(['turn_off switch.ic']));
iStates['switch.ic'].state = 'on';
el2._closeActiveDialog(); await el2.updateComplete;
await push();

// Hero (0.5.0): a plain sentence and one supporting line; the enabled-only group has no time
// pill and no money, and everything is described to assistive technology.
const intelligentGroup = root2.querySelector('[data-plan-group="intelligent"]');
const intelligentLabel = intelligentGroup?.querySelector('.status-pill-group-label');
const intelligentPills = [...(intelligentGroup?.querySelectorAll('.status-pill') || [])];
check('the hero shows an accent Intelligent charging group without a time pill or money',
  intelligentLabel?.textContent.trim() === 'Intelligent charging' && intelligentLabel.dataset.tone === 'accent' &&
  intelligentLabel.querySelector('ha-icon')?.getAttribute('icon') === 'mdi:toggle-switch' &&
  intelligentPills.length === 0 && !/€/.test(intelligentGroup.textContent));
check('waiting for a planned slot reads as one plain sentence with the ready-by time under it',
  text2('.status-title') === 'Next charge at 21:00' && text2('.status-support') === `Ready by ${t7} · then extra while cheap`);
const heroButton = root2.querySelector('[data-action="open-force-wizard"]');
const heroDescription = root2.getElementById ? root2.getElementById(heroButton?.getAttribute('aria-describedby')) : root2.querySelector(`#${heroButton?.getAttribute('aria-describedby')}`);
check('the hero button describes its sentence and supporting line for screen readers',
  heroButton?.getAttribute('aria-label') === 'Edit charging plan' &&
  (heroDescription?.textContent || '').startsWith(`Next charge at 21:00. Ready by ${t7} · then extra while cheap. Intelligent charging enabled`));
iAttrs.smartevse_1_state = 'Charging';
iAttrs.active_smartevse_raw = 'smartevse_1';
iAttrs.intelligent.status = 'charging';
iAttrs.intelligent.chargers.smartevse_1.status = 'charging';
iAttrs.intelligent.chargers.smartevse_1.blocks[0] = { start: '2026-11-09T17:45:00+00:00', end: '2026-11-09T22:00:00+00:00', top_up: false };
iAttrs.charge_allowed = true; iAttrs.charge_reason = 'intelligent_charging';
await push();
check('while charging the hero names the car and needs no time pill',
  !root2.querySelector('[data-plan-group="intelligent"] .status-pill') &&
  text2('.status-title') === 'Charging Volvo XC40' && text2('.status-support') === `Ready by ${t7} · then extra while cheap`);
check('a charging tile reads what is guaranteed and the end of the current block',
  sameRows(planRows2('smartevse_1'), [['Guaranteed', `80% by ${t7}`], ['Next', 'Charging until 22:00'], ['Total', '≈ €4.91']]) && planText('smartevse_1').length === 0);
iAttrs.smartevse_1_state = 'Ready to Charge'; iAttrs.active_smartevse_raw = ''; iAttrs.charge_allowed = false;
iAttrs.charge_reason = 'intelligent_waiting_for_planned_slot';
iAttrs.intelligent = basePayload();
iStates['switch.force'].state = 'on';
await push();
const groupOrder = [...root2.querySelectorAll('.status-pill-group')].map((node) => node.dataset.planGroup);
check('Force sorts first and the Intelligent group shows only "Resumes after force charge"',
  groupOrder[0] === 'force-charge' && groupOrder[1] === 'intelligent' &&
  /Resumes after force charge/.test(text2('[data-plan-group="intelligent"]')) &&
  !root2.querySelector('[data-plan-group="intelligent"] .status-pill') && planText('smartevse_1').length === 0 && planRows2('smartevse_1').length === 0 &&
  sameRows(rows2('smartevse_1').map((row) => row[0]), ['Charged']));
iStates['switch.force'].state = 'off';
iStates['switch.schedule'].state = 'on';
await push();
const order3 = [...root2.querySelectorAll('.status-pill-group')].map((node) => node.dataset.planGroup);
check('Intelligent sorts before an also-enabled Schedule', order3[0] === 'intelligent' && order3[1] === 'use-schedule');
iStates['switch.schedule'].state = 'off';
const heroWarnings = () => [...root2.querySelectorAll('[data-plan-group="intelligent"] .status-pill[data-tone="warning"]')].map((node) => node.textContent.trim());
// Two cars compete: the EX30 is short because it waits behind the XC40, which still charges.
iAttrs.intelligent.chargers.smartevse_2.status = 'at_risk';
iAttrs.intelligent.chargers.smartevse_2.projected_soc = 40.4;
iAttrs.intelligent.chargers.smartevse_2.queue_after = 'smartevse_1';
await push();
check('the hero warns "Not enough time for both" when the short car waits behind a car that still charges',
  JSON.stringify(heroWarnings()) === JSON.stringify(['Not enough time for both']));
// "Both" depends on which cars still need time, not on how many are plugged in.
const bothCases = [
  ['the other car reached its minimum', (c1, c2) => { Object.assign(c1, { status: 'reached', soc: 85, blocks: [], need_kwh: 0 }); c2.queue_after = null; }, 'Not enough time for Volvo EX30'],
  ['the other car is queued after the short one', (c1, c2) => { c2.queue_after = null; c1.queue_after = 'smartevse_2'; }, 'Not enough time for Volvo EX30'],
  ['the car in front refuses charge', (c1) => { Object.assign(c1, { status: 'not_accepting', not_accepting: true }); }, 'Not enough time for Volvo EX30'],
  ['the car in front is done below its target', (c1) => { Object.assign(c1, { status: 'done', soc: 60, blocks: [] }); }, 'Not enough time for Volvo EX30'],
  ['both cars are short', (c1, c2) => { Object.assign(c1, { status: 'at_risk', projected_soc: 70 }); c2.queue_after = null; }, 'Not enough time for both'],
  ['the car in front is catching up', (c1) => { c1.status = 'catch_up'; }, 'Not enough time for both'],
];
const wrongBoth = [];
for (const [name, mutate, expected] of bothCases) {
  iAttrs.intelligent = basePayload();
  Object.assign(iAttrs.intelligent.chargers.smartevse_2, { status: 'at_risk', projected_soc: 40.4, queue_after: 'smartevse_1' });
  mutate(iAttrs.intelligent.chargers.smartevse_1, iAttrs.intelligent.chargers.smartevse_2);
  await push();
  if (!heroWarnings().includes(expected) || heroWarnings().includes(expected === 'Not enough time for both' ? 'Not enough time for Volvo EX30' : 'Not enough time for both')) {
    wrongBoth.push(`${name}: ${JSON.stringify(heroWarnings())}`);
  }
}
check('the hero says "both" only when two cars compete for the time, otherwise it names the short car', wrongBoth.length === 0);
if (wrongBoth.length) console.log(wrongBoth);
iAttrs.intelligent = basePayload();
iAttrs.intelligent.chargers.smartevse_2.status = 'at_risk';
iAttrs.intelligent.chargers.smartevse_2.projected_soc = 40.4;
iAttrs.intelligent.chargers.smartevse_2.queue_after = 'smartevse_1';
iAttrs.intelligent.chargers.smartevse_1.not_accepting = true;
iAttrs.intelligent.chargers.smartevse_1.status = 'not_accepting';
await push();
check('a refusing car reads "Check Volvo XC40" and the car behind it is short on its own',
  JSON.stringify(heroWarnings()) === JSON.stringify(['Not enough time for Volvo EX30', 'Check Volvo XC40']));
check('a car that refuses charge and a queued infeasible car read as warning lines on their tiles',
  planText('smartevse_1')[0] === 'Car isn’t accepting charge' &&
  root2.querySelector('.ev-node.smartevse_1 .charger-plan-line')?.dataset.tone === 'warning' &&
  planText('smartevse_2')[0] === `Not enough time · ≈ 40% by ${t7}` && planRows2('smartevse_1').length === 0);
iAttrs.intelligent = basePayload();
await push();

// Reason titles, including the three earlier mismatches.
const reasonTitles = {
  intelligent_waiting_for_planned_slot: 'Next charge at 21:00',
  intelligent_waiting_for_connected_ev: 'Waiting for a vehicle',
  waiting_for_connected_ev: 'Waiting for a vehicle',
  intelligent_identifying_vehicle: 'Identifying vehicle',
  intelligent_planned_outlet_unavailable: 'Charger connection unavailable',
  intelligent_no_price_data: 'Charging without price data',
  smartevse_1_only_selected_ev_already_complete: 'Selected vehicle’s session complete',
  smartevse_2_api_unavailable: 'Charger connection unavailable',
};
const wrongTitles = [];
for (const [reason, title] of Object.entries(reasonTitles)) {
  iAttrs.charge_reason = reason;
  // Like the integration (_controller_error_for_reason), a lost connection is also the controller_error.
  iAttrs.controller_error = reason.endsWith('_api_unavailable') ? reason : null;
  await push();
  if (text2('.status-title') !== title) wrongTitles.push(`${reason}: ${text2('.status-title')}`);
}
check('Intelligent and fixed reasons map to their titles', wrongTitles.length === 0);
if (wrongTitles.length) console.log(wrongTitles);
// "Targets reached" only means no car needs more; the title says why, from the car statuses.
const reachedCar = (c, soc = 82) => Object.assign(c, { status: 'reached', soc, blocks: [], need_kwh: 0, top_up: false });
const restCases = [
  ['every car at its minimum', 'intelligent_targets_reached', (c1, c2) => { reachedCar(c1); reachedCar(c2); }, 'Both cars ready'],
  ['the only car at its minimum', 'intelligent_targets_reached', (c1, c2, p) => { reachedCar(c1); p.chargers.smartevse_2 = null; }, 'Volvo XC40 ready'],
  ['a car at 53% not accepting charge', 'intelligent_targets_reached', (c1, c2, p) => { Object.assign(c1, { status: 'not_accepting', not_accepting: true, blocks: [] }); p.chargers.smartevse_2 = null; }, 'Volvo XC40 isn’t accepting charge'],
  ['one car reached, the other refusing', 'intelligent_targets_reached', (c1, c2) => { reachedCar(c1); Object.assign(c2, { status: 'not_accepting', not_accepting: true, blocks: [] }); }, 'Volvo EX30 isn’t accepting charge'],
  ['both cars refusing', 'intelligent_targets_reached', (c1, c2) => { Object.assign(c1, { status: 'not_accepting', not_accepting: true, blocks: [] }); Object.assign(c2, { status: 'not_accepting', not_accepting: true, blocks: [] }); }, 'Vehicles aren’t accepting charge'],
  ['done below the minimum after retries', 'intelligent_targets_reached', (c1, c2) => { reachedCar(c1); Object.assign(c2, { status: 'done', soc: 40, blocks: [], need_kwh: 0 }); }, 'Charging complete'],
  ['done at the minimum', 'intelligent_targets_reached', (c1, c2) => { reachedCar(c1); Object.assign(c2, { status: 'done', soc: 81, blocks: [], need_kwh: 0 }); }, 'Both cars ready'],
  ['unknown battery level, done', 'intelligent_targets_reached', (c1, c2, p) => { Object.assign(c1, { vehicle: null, vehicle_name: null, settings_key: 'other', soc: null, estimated: true, status: 'done', blocks: [], need_kwh: 0 }); p.chargers.smartevse_2 = null; }, 'Charging complete'],
  ['car limit below the minimum', 'intelligent_targets_reached', (c1, c2, p) => { reachedCar(c1, 75); Object.assign(c1, { target: 75, car_limit: 75, limited_by_car: true }); p.chargers.smartevse_2 = null; }, 'Charging complete'],
  ['an excluded car does not count', 'intelligent_targets_reached', (c1, c2) => { reachedCar(c1); c2.status = 'excluded'; c2.soc = 30; }, 'Volvo XC40 ready'],
  ['no per-car payload', 'intelligent_targets_reached', (c1, c2, p) => { p.chargers = { smartevse_1: null, smartevse_2: null }; }, 'Charging complete'],
  ['statuses still planned', 'intelligent_targets_reached', () => {}, 'Charging complete'],
  ['the only connected car excluded by policy', 'intelligent_waiting_for_connected_ev', (c1, c2, p) => { p.chargers.smartevse_1 = null; c2.status = 'excluded'; }, 'Waiting for the selected vehicle'],
  ['no car connected', 'intelligent_waiting_for_connected_ev', (c1, c2, p) => { p.chargers = { smartevse_1: null, smartevse_2: null }; }, 'Waiting for a vehicle'],
  // Dedicated ids a newer integration may publish for the same cases.
  ['dedicated not-accepting reason', 'intelligent_vehicle_not_accepting', (c1, c2, p) => { Object.assign(c1, { status: 'not_accepting', not_accepting: true, blocks: [] }); p.chargers.smartevse_2 = null; }, 'Volvo XC40 isn’t accepting charge'],
  ['dedicated not-accepting reason without per-car payload', 'intelligent_not_accepting', (c1, c2, p) => { p.chargers = { smartevse_1: null, smartevse_2: null }; }, 'Car isn’t accepting charge'],
  ['dedicated complete reason', 'intelligent_charging_complete', (c1, c2) => { reachedCar(c1); Object.assign(c2, { status: 'done', soc: 40, blocks: [] }); }, 'Charging complete'],
  ['dedicated policy reason', 'intelligent_excluded_by_policy', (c1, c2, p) => { p.chargers.smartevse_1 = null; c2.status = 'excluded'; }, 'Waiting for the selected vehicle'],
  ['an unknown idle reason with a refusing car', 'intelligent_future_reason', (c1, c2, p) => { Object.assign(c1, { status: 'not_accepting', not_accepting: true, blocks: [] }); p.chargers.smartevse_2 = null; }, 'Volvo XC40 isn’t accepting charge'],
];
const wrongRest = [];
for (const [name, reason, mutate, title] of restCases) {
  iAttrs.intelligent = basePayload();
  const p = iAttrs.intelligent;
  mutate(p.chargers.smartevse_1, p.chargers.smartevse_2, p);
  iAttrs.charge_reason = reason; iAttrs.controller_error = null;
  await push();
  if (text2('.status-title') !== title) wrongRest.push(`${name}: ${text2('.status-title')}`);
}
check('a finished plan reads "Both cars ready" or "<car> ready" only when every planned car is at its minimum', wrongRest.length === 0);
if (wrongRest.length) console.log(wrongRest);
iAttrs.intelligent = basePayload();
const heroDesc = () => root2.querySelector('#sdc-hero-description')?.textContent || '';
iAttrs.charge_reason = 'smartevse_2_api_unavailable'; iAttrs.controller_error = 'smartevse_2_api_unavailable';
await push();
check('a lost charger connection reads as its own title, names the charger and is described to screen readers',
  text2('.status-title') === 'Charger connection unavailable' && text2('.status-copy .overview-note') === 'SmartEVSE 2 connection unavailable' &&
  heroDesc().startsWith('Charger connection unavailable. SmartEVSE 2 connection unavailable.') && !root2.textContent.includes('smartevse_2_api_unavailable'));
iAttrs.charge_reason = 'smartevse_api_unavailable'; iAttrs.controller_error = 'smartevse_api_unavailable';
await push();
check('losing both chargers reads once, without repeating the title as a note',
  text2('.status-title') === 'Charger connection unavailable' && !root2.querySelector('.status-copy .overview-note'));
iAttrs.controller_error = null;
iAttrs.charge_reason = 'intelligent_charging'; iAttrs.charge_allowed = true;
iAttrs.smartevse_1_state = 'Charging'; iAttrs.active_smartevse_raw = 'smartevse_1';
await push();
check('active Intelligent reasons fall through to the charging title', text2('.status-title') === 'Charging Volvo XC40');
iAttrs.charge_reason = 'intelligent_waiting_for_planned_slot'; iAttrs.charge_allowed = false;
iAttrs.smartevse_1_state = 'Ready to Charge'; iAttrs.active_smartevse_raw = '';

// Warning-level controller_error values become readable notices; ids are never printed.
const warningCases = {
  intelligent_price_data_unavailable: 'Prices unavailable · charging by deadline',
  intelligent_planner_failed: 'Plan unavailable · charging by deadline',
  smartevse_2_vehicle_timer_blocks_charging: 'Car’s own charging timer is on',
};
const badWarnings = [];
for (const [id, message] of Object.entries(warningCases)) {
  iAttrs.controller_error = id;
  await push();
  const notice = root2.querySelector('.flow-stage > .family-notice[data-tone="warning"]');
  if (text2('.status-title') === 'Controller error' || notice?.textContent.trim() !== message || root2.textContent.includes(id)) badWarnings.push(id);
}
check('warning-level controller errors show readable notices without "Controller error" or raw ids', badWarnings.length === 0);
if (badWarnings.length) console.log(badWarnings);
iAttrs.controller_error = 'mains_data_unavailable';
await push();
check('blocking controller errors keep the error title but read as text, not ids',
  text2('.status-title') === 'Controller error' && text2('.overview-note') === 'Mains data unavailable' &&
  !root2.textContent.includes('mains_data_unavailable'));
check('the hero description names the error, not only "Controller error"',
  heroDesc().startsWith('Controller error. Mains data unavailable. Intelligent charging enabled.'));
iAttrs.controller_error = null;
await push();
iStates['switch.ic'].state = 'off';
await push();
check('with no plan enabled the hero description says so, as the hero does',
  text2('.status-copy .overview-note') === 'No charging plan enabled' && heroDesc().endsWith('No charging plan enabled'));
iStates['switch.ic'].state = 'on';
iStates['switch.force'].state = 'on';
await push();
check('the hero description includes the plan notes it shows',
  /Intelligent charging enabled\. Resumes after force charge/.test(heroDesc()));
iStates['switch.force'].state = 'off';
iStates['switch.schedule'].state = 'on';
await push();
check('a schedule behind Intelligent charging is described with its priority note',
  /Schedule enabled\. Intelligent charging has priority/.test(heroDesc()));
iStates['switch.schedule'].state = 'off';
await push();

// Charger tile facts and money rules (a 0.0.9.x payload: one "Total" for the whole charge).
const CH2 = (key) => rows2(key).find((row) => row[0] === 'Charged');
check('a planned tile states what is guaranteed, when it starts, what was charged and the total, and no saving',
  sameRows(rows2('smartevse_1'), [['Guaranteed', `80% by ${t7}`], ['Next', 'Starts 21:00'], ['Charged', '14.2 kWh · ≈ €2.40'], ['Total', '≈ €4.91']]) &&
  !/sav(es|ed|ing)|Cost|Session estimate/i.test(root2.querySelector('.ev-row')?.textContent || '') && !!CH2('smartevse_2'));
check('a plan starting tomorrow names the day, and extra charging names how far it goes',
  sameRows(planRows2('smartevse_2'), [['Guaranteed', `80% by ${t7}`], ['Extra', 'up to 100% while cheap'],
    ['Next', `Starts ${el2._formatPlanTime('2026-11-10T02:00:00+00:00', FIXED_NOW)}`], ['Total', '≈ €1.19']]));
const meter = root2.querySelector('.ev-node.smartevse_1 .battery-meter');
check('the battery meter marks the effective minimum and speaks it',
  !!meter?.querySelector('.family-level-target') && meter.getAttribute('aria-valuetext') === '53%, minimum 80%');
check('plan lines add no second amount to the totals column and no new glow',
  !root2.querySelector('.charger-totals .charger-plan') && !root2.querySelector('.charger-plan .glow-under'));
const START21 = ['Next', 'Starts 21:00'];
const TOTAL = ['Total', '≈ €4.91'];
// [name, edit of the XC40's plan entry, the note or warning line, the plan facts, controller attributes]
const tileCases = [
  ['identifying', (c) => { c.status = 'identifying'; }, 'Identifying vehicle', []],
  ['excluded', (c) => { c.status = 'excluded'; }, 'Not planned · charge policy', []],
  ['car timer', (c) => { c.car_timer = true; }, 'Car’s own charging timer is on', []],
  ['car limit', (c) => { c.target = 75; c.car_limit = 75; c.limited_by_car = true; c.blocks = c.blocks.slice(0, 1); }, '', [['Guaranteed', `75% by ${t7} (car limit)`], START21, TOTAL]],
  ['reached', (c) => { c.status = 'reached'; c.soc = 80; c.blocks = []; c.saving = 1.25; }, '', [['Guaranteed', 'Reached · 80%'], ['Next', 'Done'], TOTAL]],
  ['top-up', (c) => { c.status = 'reached'; c.top_up = true; c.blocks = [{ start: '2026-11-10T03:00:00+00:00', end: '2026-11-10T04:00:00+00:00', top_up: true }]; }, '',
    [['Guaranteed', 'Reached · 53%'], ['Extra', 'up to 90% while cheap'], ['Next', `Starts ${el2._formatPlanTime('2026-11-10T03:00:00+00:00', FIXED_NOW)}`], TOTAL]],
  ['forecast', (c) => { c.includes_forecast = true; }, '', [['Guaranteed', `80% by ${t7}`], START21, ['Total', '≈ €4.91 forecast']]],
  ['partial', (c) => { c.partial = true; }, '', [['Guaranteed', `80% by ${t7}`], START21]],
  ['unidentified estimate', (c) => { c.vehicle = null; c.vehicle_name = null; c.settings_key = 'other'; c.soc = null; c.estimated = true; c.need_kwh = 30; }, '', [['Guaranteed', `≈ 30 kWh by ${t7}`], START21]],
  ['unidentified estimate, minimum 100%', (c) => { c.vehicle = null; c.vehicle_name = null; c.settings_key = 'other'; c.soc = null; c.estimated = true; c.need_kwh = 30; c.minimum = 100; c.target = 100; }, '', [['Guaranteed', `≈ 30 kWh by ${t7}`], START21]],
  ['estimate at risk', (c) => { c.soc = null; c.estimated = true; c.need_kwh = 30; c.status = 'at_risk'; c.projected_soc = null; }, `Not enough time for ≈ 30 kWh by ${t7}`, [START21]],
  ['estimate catching up', (c) => { c.soc = null; c.estimated = true; c.need_kwh = 8.4; c.status = 'catch_up'; c.projected_soc = null; }, `Catching up ≈ 8.4 kWh after ${t7}`, [START21]],
  ['at risk, charging', (c) => { c.status = 'at_risk'; c.projected_soc = 77; }, `Not enough time · ≈ 77% by ${t7}`, [['Next', 'Charging now'], TOTAL], { smartevse_1_state: 'Charging' }],
  // Ready-by moved to 06:00 within two hours of the 07:00 deadline: the plan still targets 07:00.
  ['deadline kept after a late ready-by edit', (c) => { c.ready_by = '06:00'; }, '', [['Guaranteed', `80% by ${t7}`], START21, TOTAL]],
  ['at risk against the kept deadline', (c) => { c.ready_by = '06:00'; c.status = 'at_risk'; c.projected_soc = 73; }, `Not enough time · ≈ 73% by ${t7}`, [START21, TOTAL]],
  ['done below the target', (c) => { c.status = 'done'; c.soc = 76; c.blocks = []; }, 'Charging complete', [['Next', 'Done'], TOTAL]],
];
const wrongTiles = [];
for (const [name, mutate, note, facts, attrs = {}] of tileCases) {
  iAttrs.intelligent = basePayload();
  mutate(iAttrs.intelligent.chargers.smartevse_1);
  Object.assign(iAttrs, { smartevse_1_state: 'Ready to Charge' }, attrs);
  await push();
  const shown = [planText('smartevse_1').join(' | '), planRows2('smartevse_1')];
  if (!sameRows(shown, [note, facts]) || !CH2('smartevse_1')) wrongTiles.push(`${name}: ${JSON.stringify(shown)}`);
}
check('each plan status reads as one note or warning line and its facts, with the money rules', wrongTiles.length === 0);
if (wrongTiles.length) console.log(wrongTiles);
iAttrs.smartevse_1_state = 'Ready to Charge';
iAttrs.intelligent = basePayload();
iAttrs.smartevse_1_error = 'Ground fault';
await push();
check('a charger error hides its plan facts', planText('smartevse_1').length === 0 && planRows2('smartevse_1').length === 0 && planRows2('smartevse_2').length === 4);
iAttrs.smartevse_1_error = 'None';

// Disconnected tile: last realised saving until the next plug-in; History shows it too.
iAttrs.smartevse_2_plug_state = 'Disconnected'; iAttrs.smartevse_2_state = 'Disconnected';
iAttrs.intelligent.chargers.smartevse_2 = null;
await push();
const PLUG_IN = 'compared with charging at plug\u2011in';
const lastControl = () => root2.querySelector('.ev-node.smartevse_2 .plan-row[data-row="last"] [data-action="open-history"]');
check('a disconnected tile shows the last charge and one line with its saving and what it is compared with',
  sameRows(planText('smartevse_2'), [`Last charge saved ≈ €1.25 ${PLUG_IN}`]) && sameRows(rows2('smartevse_2'), [['Last charge', '14.2 kWh · ≈ €2.40']]) &&
  lastControl()?.getAttribute('data-charger') === 'smartevse_2' && lastControl().getAttribute('aria-haspopup') === 'dialog' &&
  root2.querySelector('.ev-node.smartevse_2')?.classList.contains('compact') && !root2.querySelector('.ev-node.smartevse_2 .battery-meter, .ev-node.smartevse_2 .charger-details'));
iAttrs.intelligent.sessions[0].mixed = true;
await push();
check('a session that used Force charge claims no saving on the tile', planText('smartevse_2').length === 0);
iAttrs.intelligent.sessions[0].mixed = false;
await push();
root2.querySelector('.charging-history-launcher')?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await wait();
const historySavings = [...root2.querySelectorAll('.cost-record-saving')].map((node) => node.textContent.trim());
check('History records read the saving vs charging at plug-in, or that Force charge was used',
  historySavings.includes('Saved ≈ €1.25 vs charging at plug-in') && historySavings.includes('Force charge used'));
el2._closeActiveDialog(); await el2.updateComplete;

// One plug-in can span several realised windows sharing its ledger id: a deadline roll before
// the car leaves opens an empty newest window (backend Sim: plug-in 18:00, charge 21:00–22:00,
// ready-by 07:00, unplug 07:30), and a car left plugged in has one window per night.
const realised = (energy, saving, extra = {}) => ({ ledger_id: 'ex30-last', outlet: 'smartevse_2', vehicle_name: 'Volvo EX30', closed: true,
  energy_kwh: energy, cost: 2.47, baseline_cost: saving === null ? null : 2.47 + saving, saving, mixed: false, partial: false, ...extra });
const ex30Record = iAttrs.charging_costs.chargers.smartevse_2.session;
const realisedCases = [
  ['empty window after the deadline roll', [realised(0, null), realised(10.2, 1.99)], ['Last charge saved ≈ €1.99'], 'Saved ≈ €1.99 vs charging at plug-in'],
  ['a weekend: two nights and the empty roll window', [realised(0, null), realised(8, 1.2), realised(6, 0.8)], ['Last charge saved ≈ €2.00'], 'Saved ≈ €2.00 vs charging at plug-in'],
  ['Force charge used on one night', [realised(8, null, { mixed: true }), realised(6, 0.8)], [], 'Force charge used'],
  ['one night without a realised saving', [realised(8, null), realised(6, 0.8)], [], ''],
  ['one partial night', [realised(8, 1, { partial: true }), realised(6, 0.8)], [], ''],
  ['only an empty window', [realised(0, null)], [], ''],
];
const wrongRealised = [];
for (const [name, sessions, tile, history] of realisedCases) {
  iAttrs.intelligent.sessions = sessions;
  await push();
  if (JSON.stringify(planText('smartevse_2')) !== JSON.stringify(tile.map((line) => `${line} ${PLUG_IN}`)) || el2._historySaving(ex30Record) !== history) {
    wrongRealised.push(`${name}: ${JSON.stringify(planText('smartevse_2'))} / ${JSON.stringify(el2._historySaving(ex30Record))}`);
  }
}
check('realised windows sharing a ledger id combine, and an empty window never hides the saving', wrongRealised.length === 0);
if (wrongRealised.length) console.log(wrongRealised);
iAttrs.intelligent.sessions = realisedCases[0][1];
await push();
root2.querySelector('.charging-history-launcher')?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await wait();
check('History shows the saving of a session whose newest window is empty',
  [...root2.querySelectorAll('.cost-record-saving')].some((node) => node.textContent.trim() === 'Saved ≈ €1.99 vs charging at plug-in'));
el2._closeActiveDialog(); await el2.updateComplete;
iAttrs.smartevse_2_plug_state = 'Connected'; iAttrs.smartevse_2_state = 'Ready to Charge';
iAttrs.intelligent = basePayload();
await push();

// An identical payload never re-renders, so a field being edited is never replaced.
let renderRequests = 0;
const originalRequestUpdate = el2.requestUpdate.bind(el2);
el2.requestUpdate = (...args) => { renderRequests++; return originalRequestUpdate(...args); };
el2.hass = { ...iHass, states: clone(iStates) };
await wait();
const identicalRenders = renderRequests;
el2.hass = iHass;
await wait();
iAttrs.intelligent.totals.cost = 6.2;
el2.hass = iHass;
await wait();
check('an identical Intelligent payload causes no re-render while a changed one does',
  identicalRenders === 0 && renderRequests > 0);
el2.requestUpdate = originalRequestUpdate;
iAttrs.intelligent = basePayload();
await push();

// The Intelligent page: plan first, then per-vehicle settings.
await openPlan2();
await click2('[data-action="choose-force-mode"][data-mode="intelligent"]');
const page = root2.querySelector('.intelligent-page');
check('the Intelligent route opens a named page with the plan before the settings',
  root2.querySelector('dialog')?.getAttribute('aria-label') === 'Intelligent charging' && !!page &&
  page.querySelector('.intelligent-plan') && page.querySelector('.intelligent-settings') &&
  (page.querySelector('.intelligent-plan').compareDocumentPosition(page.querySelector('.intelligent-settings')) & 4) === 4);
const blockRows = [...root2.querySelectorAll('.intelligent-block')].map((node) => node.textContent.replace(/\s+/g, ' ').trim());
check('the plan lists chronological blocks per car with top-up marked',
  text2('.intelligent-section-title') === 'Tonight' &&
  JSON.stringify(blockRows) === JSON.stringify(['21:00–22:00 · Volvo XC40', `23:00–${el2._formatClock('00:00')} · Volvo XC40`,
    `${el2._formatDateTime('2026-11-10T02:00:00+00:00')}–${el2._formatClock('04:00')} · Volvo EX30`,
    `${el2._formatDateTime('2026-11-10T04:00:00+00:00')}–${el2._formatClock('04:30')} · Volvo EX30 · top-up`]));
const carLines = [...root2.querySelectorAll('.intelligent-car-line')].map((node) => node.textContent.trim());
check('each car summarises SoC, minimum, deadline, cost and saving',
  carLines[0] === `53% → 80% by ${t7} · ≈ €4.91 · saving ≈ €1.29` && carLines[1] === `30% → 80% by ${t7} · ≈ €1.19`);
check('the page labels the saving baseline once and shows the price horizon',
  (page.textContent.match(/Saving vs charging at plug-in/g) || []).length === 1 &&
  page.textContent.includes(`Prices until ${el2._formatDateTime('2026-11-10T01:00:00+00:00')}`) &&
  page.textContent.includes('Hours without prices are used only if needed'));
check('the counters that refine estimates do not read as a gate, and one line says planning does not wait for them',
  page.textContent.includes('Refining household load · 3 of 7 days') && page.textContent.includes('Learned from 12 charges') &&
  page.textContent.includes('Refining estimates · 2 of 3 charges') && !/Learning/.test(page.textContent) &&
  root2.querySelectorAll('.intelligent-refining-help').length === 1 &&
  root2.querySelector('.intelligent-refining-help')?.textContent.trim() === 'Planning works from the first night. These only make its estimates more exact.');
const chargesFirst = root2.querySelector('.intelligent-order[data-action="open-submenu"][data-entity="select.policy"]');
check('two cars show which charges first as a row opening the charge policy',
  /Charges first/.test(chargesFirst?.textContent || '') && /SmartEVSE 1/.test(chargesFirst?.textContent || ''));
await click2('.intelligent-order');
const policyOpened = root2.querySelector('dialog')?.getAttribute('aria-label') === 'Charge policy' &&
  !!root2.querySelector('[data-action="choose-option"][data-entity="select.policy"]');
await click2('dialog [aria-label="Back"]');
check('Charges first opens the Charge policy page and Back returns to the plan',
  policyOpened && el2._forceWizardStep === 'intelligent');

const v1Time = root2.querySelector('.intelligent-time-input[data-entity="time.v1_ready_by"]');
const v1Minimum = root2.querySelector('.force-input[data-entity="number.v1_minimum"]');
check('vehicle settings use a native time input and a % field with vehicle-named labels',
  v1Time?.type === 'time' && v1Time.value === '07:00' && v1Time.getAttribute('aria-label') === 'Volvo XC40 ready by' &&
  v1Minimum?.getAttribute('aria-label') === 'Volvo XC40 at least (minimum charge)' && v1Minimum.value === '80' &&
  v1Minimum.closest('.wizard-field')?.querySelector('.wizard-field-label')?.textContent.trim() === 'At least' &&
  v1Minimum.closest('.wizard-field')?.querySelector('.wizard-input-unit')?.textContent.trim() === '%' &&
  root2.querySelector('.intelligent-minimum-help')?.textContent.trim() === 'Charges to at least this level by the ready-by time.' &&
  [...root2.querySelectorAll('.intelligent-vehicle-name')].map((node) => node.textContent.trim()).join('|') === 'Volvo XC40|Volvo EX30|Unidentified vehicle');
const pageCss = [...root2.querySelectorAll('style')].map((node) => node.textContent).join('\n');
check('vehicle fields form a two-column grid that becomes one column below 300px, with 16px inputs',
  /\.intelligent-vehicle-fields \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/.test(pageCss) &&
  /@container intelligent-page \(max-width: 299px\)/.test(pageCss) &&
  /\.setting-input, \.setting-select \{ font-size: 16px; min-height: 44px;/.test(pageCss));

// Time inputs commit on blur or Enter only; HH:MM and HH:MM:SS compare equal.
callStart = iCalls.length;
v1Time.focus();
v1Time.value = '06:30';
v1Time.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
v1Time.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
await wait();
const noCallWhileEditing = iCalls.length === callStart;
const timeService = [];
iService = (...args) => new Promise((resolve) => timeService.push(() => resolve(applyCall(...args))));
v1Time.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, composed: true }));
// The blur commit runs on the next task, after any click that moved focus.
await wait(0); await el2.updateComplete;
const pendingTimeField = root2.querySelector('.intelligent-time-input[data-entity="time.v1_ready_by"]');
check('a ready-by edit sends nothing per change and saves once on blur',
  noCallWhileEditing && timeService.length === 1);
check('the saving time field shows its own pending state and stays enabled',
  pendingTimeField?.closest('label')?.getAttribute('aria-busy') === 'true' &&
  !!pendingTimeField.closest('label')?.querySelector('.control-pending .family-pending-indicator') && !pendingTimeField.disabled);
check('a field save leaves the other controls enabled and Back usable',
  !root2.querySelector('[data-action="toggle-intelligent-top-up"]')?.disabled &&
  !root2.querySelector('.force-input[data-entity="number.v1_minimum"]')?.disabled &&
  root2.querySelectorAll('.control-pending').length === 1 &&
  el2._dialogGuard('back').pending === false && el2._dialogGuard('back').dirty === false);
iService = applyCall;
timeService.shift()();
await wait();
let timeCalls = iCalls.slice(callStart);
check('blur saves the time with time.set_value',
  timeCalls.length === 1 && timeCalls[0][0] === 'time' && timeCalls[0][1] === 'set_value' &&
  timeCalls[0][2].entity_id === 'time.v1_ready_by' && timeCalls[0][2].time === '06:30:00');
callStart = iCalls.length;
root2.querySelector('.intelligent-time-input[data-entity="time.v1_ready_by"]')?.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, composed: true }));
await wait();
check('an unchanged time (06:30 against 06:30:00) is not saved again and is not dirty',
  iCalls.length === callStart && !el2._dialogGuard('close').dirty);
const v2Time = root2.querySelector('.intelligent-time-input[data-entity="time.v2_ready_by"]');
v2Time.value = '06:45';
v2Time.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
check('an uncommitted time draft is protected by the dialog guard', el2._dialogGuard('close').dirty === true);
v2Time.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
await wait();
timeCalls = iCalls.slice(callStart);
check('Enter commits the time with time.set_value',
  timeCalls.length === 1 && timeCalls[0][2].entity_id === 'time.v2_ready_by' && timeCalls[0][2].time === '06:45:00' &&
  !el2._dialogGuard('close').dirty);

// The press that blurs a ready-by field must reach its control: the commit waits for that
// press to deliver its click, so the control is neither replaced nor disabled first.
const press = (node, type) => node.dispatchEvent(new win.PointerEvent(type, { bubbles: true, composed: true }));
callStart = iCalls.length;
const v1Edit = root2.querySelector('.intelligent-time-input[data-entity="time.v1_ready_by"]');
v1Edit.focus();
v1Edit.value = '06:20';
v1Edit.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
const topUpPressed = root2.querySelector('[data-action="toggle-intelligent-top-up"]');
press(topUpPressed, 'pointerdown');
v1Edit.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, composed: true }));
await Promise.resolve(); await el2.updateComplete; await wait(0);
const pressedSurvives = root2.querySelector('[data-action="toggle-intelligent-top-up"]') === topUpPressed && !topUpPressed.disabled &&
  iCalls.length === callStart && !el2._dialogGuard('close').dirty;
press(topUpPressed, 'pointerup');
topUpPressed.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await wait();
check('a press that blurs a ready-by field still reaches its control, and the time is saved after it',
  pressedSurvives && JSON.stringify(iCalls.slice(callStart).map((c) => `${c[1]} ${c[2].entity_id}`)) ===
    JSON.stringify(['turn_on switch.ic_top_up', 'set_value time.v1_ready_by']) && iStates['time.v1_ready_by'].state === '06:20:00');
// Without a pointer (keyboard, Safari's unfocused buttons) the commit still waits one task.
callStart = iCalls.length;
const v1Again = root2.querySelector('.intelligent-time-input[data-entity="time.v1_ready_by"]');
v1Again.value = '06:25';
v1Again.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
const topUpTapped = root2.querySelector('[data-action="toggle-intelligent-top-up"]');
v1Again.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, composed: true }));
await Promise.resolve(); await el2.updateComplete;
const tappedSurvives = root2.querySelector('[data-action="toggle-intelligent-top-up"]') === topUpTapped && !topUpTapped.disabled;
topUpTapped.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await wait();
check('a tap whose events arrive together is not swallowed by the blur commit',
  tappedSurvives && JSON.stringify(iCalls.slice(callStart).map((c) => `${c[1]} ${c[2].entity_id}`)) ===
    JSON.stringify(['turn_off switch.ic_top_up', 'set_value time.v1_ready_by']) && iStates['switch.ic_top_up'].state === 'off');

// Edit, then Back: the page closes at once (no wait notice, no discard prompt) and the time is saved.
const backService = [];
iService = (...args) => new Promise((resolve) => backService.push(() => resolve(applyCall(...args))));
callStart = iCalls.length;
const v2Edit = root2.querySelector('.intelligent-time-input[data-entity="time.v2_ready_by"]');
v2Edit.focus();
v2Edit.value = '06:10';
v2Edit.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
const backButton = root2.querySelector('dialog [aria-label="Back"]');
press(backButton, 'pointerdown');
v2Edit.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, composed: true }));
await Promise.resolve(); await el2.updateComplete;
press(backButton, 'pointerup');
backButton.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
await el2.updateComplete; await wait();
const leftAtOnce = el2._flow.current === 'plan' && !el2._flow.confirmation && !el2._flow.notice &&
  !root2.querySelector('.family-dialog-body > .family-notice');
iService = applyCall;
while (backService.length) { backService.shift()(); await wait(5); }
await wait();
check('Back after editing a ready-by leaves the page at once and the time is still saved',
  leftAtOnce && JSON.stringify(iCalls.slice(callStart).map((c) => [c[2].entity_id, c[2].time])) === JSON.stringify([['time.v2_ready_by', '06:10:00']]) &&
  iStates['time.v2_ready_by'].state === '06:10:00');
await click2('[data-action="choose-force-mode"][data-mode="intelligent"]');
// A press whose release never arrives does not hold the value back for long.
callStart = iCalls.length;
const v1Held = root2.querySelector('.intelligent-time-input[data-entity="time.v1_ready_by"]');
v1Held.focus();
v1Held.value = '06:35';
v1Held.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
press(root2.querySelector('.force-input[data-entity="number.v1_minimum"]'), 'pointerdown');
v1Held.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, composed: true }));
await wait(100);
const heldBack = iCalls.length === callStart && !el2._dialogGuard('close').dirty;
await wait(2000);
check('a blur commit held by a press without a release is still saved after a short delay',
  heldBack && iCalls.slice(callStart).some((c) => c[2].entity_id === 'time.v1_ready_by' && c[2].time === '06:35:00'));
press(root2.querySelector('.force-input[data-entity="number.v1_minimum"]'), 'pointerup');
await wait();

// Minimum charge saves through number.set_value on blur or Enter, never per change event
// (a desktop spinner fires change on every step).
callStart = iCalls.length;
const minimumInput = root2.querySelector('.force-input[data-entity="number.v1_minimum"]');
for (const step of ['81', '82', '85']) {
  minimumInput.value = step;
  minimumInput.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  minimumInput.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
  await Promise.resolve();
}
await wait();
const noMinimumCallPerChange = iCalls.length === callStart;
root2.querySelector('.force-input[data-entity="number.v1_minimum"]')?.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, composed: true }));
await wait();
const minimumCalls = iCalls.slice(callStart).filter((c) => c[2].entity_id === 'number.v1_minimum');
check('minimum charge saves once with number.set_value when the field loses focus',
  noMinimumCallPerChange && minimumCalls.length === 1 && minimumCalls[0][0] === 'number' && minimumCalls[0][1] === 'set_value' &&
  minimumCalls[0][2].value === 85 && iStates['switch.ic'].state === 'on');

// A value entered while the field is still saving is written after that save, not dropped.
const minimumService = [];
iService = (...args) => new Promise((resolve) => minimumService.push(() => resolve(applyCall(...args))));
callStart = iCalls.length;
const minimumField = () => root2.querySelector('.force-input[data-entity="number.v1_minimum"]');
minimumField().value = '86';
minimumField().dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
minimumField().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
await wait();
const minimumPending = minimumService.length === 1 && minimumField()?.closest('label')?.getAttribute('aria-busy') === 'true' && !minimumField()?.disabled;
minimumField().value = '88';
minimumField().dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
minimumField().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
await wait();
const queuedWhilePending = minimumService.length === 1 && el2._dialogGuard('close').dirty === false;
iService = applyCall;
minimumService.shift()();
await wait();
const queuedMinimum = iCalls.slice(callStart).filter((c) => c[2].entity_id === 'number.v1_minimum').map((c) => c[2].value);
check('Enter saves the minimum and a newer value entered during that save is written next',
  minimumPending && queuedWhilePending && JSON.stringify(queuedMinimum) === JSON.stringify([86, 88]) &&
  iStates['number.v1_minimum'].state === '88' && minimumField()?.value === '88' && !el2._dialogGuard('close').dirty);
callStart = iCalls.length;
minimumField().value = '5';
minimumField().dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
minimumField().dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, composed: true }));
await wait();
check('an out-of-range minimum is reported and not sent',
  iCalls.length === callStart && /Value must be at least 10/.test(text2('.intelligent-page')) &&
  el2._dialogGuard('close').dirty === true);
minimumField().value = '88';
minimumField().dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
minimumField().dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, composed: true }));
await wait();
check('restoring the saved minimum sends nothing and clears its error',
  iCalls.length === callStart && !el2._dialogGuard('close').dirty && !/Value must be at least/.test(text2('.intelligent-page')));

// Learned suggestion: fact plus a quiet action pill that writes the ready-by time.
iStates['time.v1_ready_by'].state = '07:00:00';
await push();
const suggestion = root2.querySelector('[data-action="use-suggested-ready-by"][data-entity="time.v1_ready_by"]');
check('the learned departure is a quiet pill with a verb, a named action and a warning when earlier',
  suggestion?.textContent.trim() === `Use ${t615}` && suggestion.classList.contains('family-action') &&
  suggestion.getAttribute('aria-label') === `Set Volvo XC40 ready by to ${t615}` &&
  suggestion.closest('.intelligent-suggestion')?.dataset.tone === 'warning' &&
  /Usually leaves earlier/.test(suggestion.closest('.intelligent-suggestion')?.textContent || '') &&
  !root2.querySelector('[data-action="use-suggested-ready-by"][data-entity="time.v2_ready_by"]'));
iAttrs.intelligent.vehicles.vehicle_1.usually_leaves = '06:30';
await push();
const learnedLeave = root2.querySelector('[data-action="use-suggested-ready-by"][data-entity="time.v1_ready_by"]')?.closest('.intelligent-suggestion');
check('the suggestion states the learned departure time it is based on',
  learnedLeave?.querySelector('.intelligent-fact')?.textContent.trim() === `Usually leaves ${el2._formatClock('06:30')}` &&
  learnedLeave.dataset.tone === 'warning' && learnedLeave.querySelector('.intelligent-suggestion-pill')?.textContent.trim() === `Use ${t615}`);
check('an earlier learned departure marks its fact with the shared warning glyph, not orange text',
  learnedLeave?.querySelector('.intelligent-fact .plan-tone-icon')?.getAttribute('icon') === 'mdi:alert-outline' &&
  learnedLeave.querySelector('.intelligent-fact .plan-tone-icon')?.getAttribute('aria-hidden') === 'true');
const suggestionService = [];
iService = (...args) => new Promise((resolve) => suggestionService.push(() => resolve(applyCall(...args))));
callStart = iCalls.length;
await click2('[data-action="use-suggested-ready-by"][data-entity="time.v1_ready_by"]');
const pendingSuggestion = root2.querySelector('[data-action="use-suggested-ready-by"]');
check('the suggestion pill shows its own pending indicator with aria-busy',
  pendingSuggestion?.getAttribute('aria-busy') === 'true' && !!pendingSuggestion.querySelector('.family-pending-indicator') &&
  /Saving/.test(pendingSuggestion.textContent));
iService = applyCall;
suggestionService.shift()();
await wait();
check('using the suggestion saves the ready-by time and the pill disappears',
  iCalls.slice(callStart).some((c) => c[0] === 'time' && c[2].entity_id === 'time.v1_ready_by' && c[2].time === '06:15:00') &&
  !root2.querySelector('[data-action="use-suggested-ready-by"][data-entity="time.v1_ready_by"]'));

// Top-up has its own switch and dedicated price.
callStart = iCalls.length;
await click2('[data-action="toggle-intelligent-top-up"]');
check('the top-up switch saves its entity and reveals the dedicated "Top up below" price',
  iCalls.slice(callStart).some((c) => c[1] === 'turn_on' && c[2].entity_id === 'switch.ic_top_up') &&
  root2.querySelector('[data-action="toggle-intelligent-top-up"]')?.getAttribute('aria-checked') === 'true' &&
  !!root2.querySelector('.force-input[data-entity="number.ic_top_up_price"]') &&
  /Top up below/.test(root2.querySelector('.intelligent-top-up')?.textContent || '') &&
  !root2.querySelector('.intelligent-top-up .force-input[data-entity="number.price"]'));
// Prices are known only until 01:00 while the deadline is 07:00: the cheap night hours may still qualify.
check('while hours before the deadline are unpriced, the top-up fact speaks only for the known hours',
  root2.querySelector('.intelligent-top-up-fact')?.textContent.trim() === 'No known hours below 0.160\u202fEUR/kWh yet');
iAttrs.intelligent.known_until = '2026-11-10T07:00:00+00:00';
iAttrs.intelligent.slots = iAttrs.intelligent.slots.map((slot) => ({ ...slot, price: Math.max(slot.price, 0.19), kind: 'known' }));
await push();
check('once every hour before the deadline is priced, the page states that none is below the top-up price',
  root2.querySelector('.intelligent-top-up-fact')?.textContent.trim() === `No hours below 0.160\u202fEUR/kWh before ${t7}`);
iAttrs.intelligent = basePayload();
iAttrs.intelligent.prices_expected_at = '2026-11-09T13:00:00+00:00';
await push();
check('while tomorrow\'s prices are pending the page says the plan waits for them and updates then',
  /Waiting for tomorrow's prices \(about 13:00\) · plan updates then/.test(root2.textContent) &&
  !root2.textContent.includes('Hours without prices are used only if needed'));
iAttrs.intelligent = basePayload();
await push();
callStart = iCalls.length;
const topUpPrice = root2.querySelector('.force-input[data-entity="number.ic_top_up_price"]');
topUpPrice.value = '0.21';
topUpPrice.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
topUpPrice.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
await wait();
const noTopUpPriceCallPerChange = iCalls.length === callStart;
root2.querySelector('.force-input[data-entity="number.ic_top_up_price"]')?.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, composed: true }));
await wait();
check('the top-up price saves on blur to its own number entity, not the acceptable price',
  noTopUpPriceCallPerChange &&
  iCalls.slice(callStart).some((c) => c[1] === 'set_value' && c[2].entity_id === 'number.ic_top_up_price' && c[2].value === 0.21) &&
  !iCalls.slice(callStart).some((c) => c[2].entity_id === 'number.price') && !root2.querySelector('.intelligent-top-up-fact'));

// Missing entities are omitted rather than shown as broken controls.
const removed = { v2: iStates['time.v2_ready_by'], v2min: iStates['number.v2_minimum'], topUp: iStates['switch.ic_top_up'] };
delete iStates['time.v2_ready_by']; delete iStates['number.v2_minimum']; delete iStates['switch.ic_top_up'];
await push();
check('vehicles and top-up without entities are omitted from the page',
  !root2.querySelector('[data-vehicle="vehicle_2"]') && !!root2.querySelector('[data-vehicle="vehicle_1"]') &&
  !root2.querySelector('[data-action="toggle-intelligent-top-up"]'));
Object.assign(iStates, { 'time.v2_ready_by': removed.v2, 'number.v2_minimum': removed.v2min, 'switch.ic_top_up': removed.topUp });
await push();
check('the Intelligent page adds no explanatory-copy classes',
  !root2.querySelector('.modal-subtitle, .wizard-option-detail, .wizard-field-helper, .wizard-rule, .setting-detail'));
el2._closeActiveDialog(); await el2.updateComplete;
check('browsing the Intelligent page and plan sends no charging-plan command',
  !iCalls.slice(callStart).some((c) => ['switch.ic', 'switch.schedule', 'switch.force'].includes(c[2].entity_id)));

// Plan details on the page follow what the integration plans, not the settings alone.
const openIntelligent2 = async () => { await openPlan2(); await click2('[data-action="choose-force-mode"][data-mode="intelligent"]'); };
const pageCarLines = () => [...root2.querySelectorAll('.intelligent-car-line')].map((node) => node.textContent.trim());
// Unknown battery level, planned against the default budget: energy, not money, also in the totals.
iAttrs.intelligent = basePayload();
Object.assign(iAttrs.intelligent.chargers.smartevse_1, { soc: null, soc_source: 'unknown', estimated: true, need_kwh: 30, session_cost: 7.5, saving: 3.1 });
iAttrs.intelligent.chargers.smartevse_2 = null;
iAttrs.intelligent.order = ['smartevse_1'];
iAttrs.intelligent.totals = { cost: 7.5, saving: 3.1, energy_kwh: 30, includes_forecast: false, partial: false };
await push();
await openIntelligent2();
check('an estimated plan shows planned energy in the page totals and claims no cost or saving',
  JSON.stringify([...root2.querySelectorAll('.intelligent-totals dt')].map((node) => node.textContent.trim())) === JSON.stringify(['Planned energy']) &&
  root2.querySelector('.intelligent-totals dd')?.textContent.trim() === '≈ 30\u202fkWh' && pageCarLines()[0] === `≈ 30\u202fkWh by ${t7}` &&
  !/€/.test(text2('.intelligent-plan')));
// The deadline the plan keeps after a late ready-by edit; "done" below the target is not "reached".
iAttrs.intelligent = basePayload();
iAttrs.intelligent.chargers.smartevse_1.ready_by = '06:00';
Object.assign(iAttrs.intelligent.chargers.smartevse_2, { status: 'done', soc: 76, blocks: [], top_up: false });
await push();
const keptAndDone = pageCarLines();
Object.assign(iAttrs.intelligent.chargers.smartevse_2, { vehicle: null, vehicle_name: null, settings_key: 'other', soc: null, soc_source: 'unknown', estimated: true, need_kwh: 0 });
await push();
check('per-car lines use the planned deadline and say "Charging complete" when done below the target or level unknown',
  keptAndDone[0] === `53% → 80% by ${t7} · ≈ €4.91 · saving ≈ €1.29` && keptAndDone[1] === 'Charging complete · ≈ €1.19' &&
  pageCarLines()[1] === 'Charging complete' && !pageCarLines().some((line) => /reached/.test(line)));
// An unidentified car's level is never known: the page says it is planned by energy, and an
// estimate that is short of time speaks of energy, not of a % it cannot know.
iAttrs.intelligent = basePayload();
Object.assign(iAttrs.intelligent.chargers.smartevse_2, { vehicle: null, vehicle_name: null, settings_key: 'other', soc: null, soc_source: 'unknown',
  estimated: true, need_kwh: 30, minimum: 100, target: 100, status: 'at_risk', projected_soc: null, queue_after: 'smartevse_1' });
await push();
check('an estimated plan short of time names its energy and the Unidentified vehicle settings say it is planned by energy',
  pageCarLines()[1] === `Not enough time for ≈ 30\u202fkWh by ${t7}` && !/100%/.test(text2('.intelligent-cars')) &&
  root2.querySelector('[data-vehicle="other"] .intelligent-vehicle-head .intelligent-fact')?.textContent.trim() === 'Battery level unknown · planned by energy' &&
  !root2.querySelector('[data-vehicle="vehicle_1"] .intelligent-vehicle-head .intelligent-fact')?.textContent.includes('Battery level unknown'));
// Warning plan lines stay readable: primary text colour, and the shared warning glyph carries the tone.
iAttrs.intelligent = basePayload();
Object.assign(iAttrs.intelligent.chargers.smartevse_2, { status: 'at_risk', projected_soc: 40.4, queue_after: 'smartevse_1' });
await push();
const planCss = [...root2.querySelectorAll('style')].map((node) => node.textContent).join('\n');
const warningRules = (planCss.match(/[^{}]*\[data-tone="warning"\][^{}]*\{[^}]*\}/g) || [])
  .filter((rule) => /charger-plan-line|intelligent-car-line|intelligent-suggestion/.test(rule));
const glyphOf = (selector) => root2.querySelector(selector);
check('warning plan lines keep primary-coloured text and mark the tone with the aria-hidden warning glyph',
  warningRules.length >= 2 && warningRules.every((rule) => /color:\s*var\(--primary-text-color\)/.test(rule) && !/(^|[^-])color:\s*var\(--family-warning\)/.test(rule)) &&
  /\.plan-tone-icon\s*\{[^}]*color:\s*var\(--family-tone/.test(planCss) &&
  glyphOf('.intelligent-car[data-charger="smartevse_2"] .intelligent-car-line[data-tone="warning"] .plan-tone-icon')?.getAttribute('icon') === 'mdi:alert-outline' &&
  glyphOf('.intelligent-car[data-charger="smartevse_2"] .plan-tone-icon')?.getAttribute('aria-hidden') === 'true' &&
  !glyphOf('.intelligent-car[data-charger="smartevse_1"] .plan-tone-icon') &&
  glyphOf('.ev-node.smartevse_2 .charger-plan-line[data-tone="warning"] .plan-tone-icon')?.getAttribute('icon') === 'mdi:alert-outline' &&
  !glyphOf('.ev-node.smartevse_1 .plan-tone-icon') &&
  planText('smartevse_2')[0] === `Not enough time · ≈ 40% by ${t7}`);
// After midnight a block that began before midnight is still tonight's plan.
Date.now = () => Date.parse('2026-11-10T00:30:00Z');
iAttrs.intelligent = basePayload();
iAttrs.intelligent.chargers.smartevse_2 = null;
iAttrs.intelligent.order = ['smartevse_1'];
Object.assign(iAttrs.intelligent.chargers.smartevse_1, { status: 'charging', blocks: [
  { start: '2026-11-09T23:00:00+00:00', end: '2026-11-10T01:00:00+00:00', top_up: false },
  { start: '2026-11-10T03:00:00+00:00', end: '2026-11-10T04:00:00+00:00', top_up: false }] });
await push();
check('after midnight a running block keeps the heading "Tonight" and later blocks need no weekday',
  text2('.intelligent-section-title') === 'Tonight' &&
  JSON.stringify([...root2.querySelectorAll('.intelligent-block')].map((node) => node.textContent.replace(/\s+/g, ' ').trim())) ===
    JSON.stringify([`23:00–${el2._formatClock('01:00')} · Volvo XC40`, `${el2._formatClock('03:00')}–${el2._formatClock('04:00')} · Volvo XC40`]));
check('tomorrow morning reads "Tonight" only when seen from the day before',
  el2._intelligentPlanHeading(Date.parse('2026-11-10T03:00:00Z'), FIXED_NOW) === 'Tonight' &&
  el2._intelligentPlanHeading(Date.parse('2026-11-11T03:00:00Z'), Date.parse('2026-11-10T00:30:00Z')) !== 'Tonight');
Date.now = () => FIXED_NOW;
el2._closeActiveDialog(); await el2.updateComplete;
el2.remove();

// ---- Intelligent charging in the one layout (card 0.6.0): the plan chart above the charger tiles,
// labelled facts in each tile, plain wording. Earlier cards had a separate "plan" layout. ----
// The plan is drawn by the shared time-series chart of @bitosome/ha-card-ui: without layout
// (Happy DOM) it uses its 360 px fallback width. Browser geometry is checked in test/layout.mjs.
try { win.localStorage?.clear(); } catch { /* no storage in this DOM */ }
// Happy DOM cannot resolve a shadow root's activeElement while focus sits in another card, so the
// first card leaves the page.
el.remove();
// Integration 0.0.10.0: the minimum is a floor, extra charging above it follows a learned cheap
// price (top_up.price), there are no top-up entities, and a charger carries extra_soc.
const cheapPrices = [0.31, 0.29, 0.24, 0.27, 0.22, 0.2, 0.25];
const priceSlots10 = priceSlots.map((slot, index) => ({ ...slot, price: slot.kind === 'known' ? cheapPrices[index] : slot.price }));
const payload10 = () => {
  const payload = basePayload();
  delete payload.entities.intelligent_top_up;
  delete payload.entities.intelligent_top_up_price;
  payload.top_up = { enabled: true, price: 0.26, source: 'learned' };
  payload.slots = priceSlots10;
  payload.chargers.smartevse_1.extra_soc = null;
  payload.chargers.smartevse_2.extra_soc = 96;
  return payload;
};
iAttrs.intelligent = payload10();
iAttrs.smartevse_1_state = 'Connected';
const el3 = document.createElement(tag);
el3.setConfig(config);
el3.hass = iHass;
document.body.appendChild(el3);
await wait(60);
const root3 = el3.shadowRoot;
const push3 = async () => { el3.hass = { ...iHass }; el3._lastRenderKey = ''; el3.hass = iHass; await wait(); };
const at3 = async (iso) => { Date.now = () => Date.parse(iso); await push3(); };
const norm = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const all3 = (selector) => [...root3.querySelectorAll(selector)];
const chart3 = () => root3.querySelector('.family-chart-frame.plan-chart');
const svg3 = () => root3.querySelector('.family-chart-frame.plan-chart svg.family-chart');
const desc3 = () => svg3()?.querySelector('desc')?.textContent || '';
const legend3 = () => all3('.family-chart-legend > span').map((node) => norm(node.textContent));
const lanes3 = () => all3('.family-chart-lane').map((lane) => ({
  id: lane.getAttribute('data-lane'), label: lane.querySelector('.family-chart-lane-label')?.textContent,
  tones: [...lane.querySelectorAll('.family-chart-period')].map((period) => period.getAttribute('data-tone')),
  marker: !!lane.querySelector('.family-chart-lane-marker'), muted: lane.hasAttribute('data-muted') }));
// Both chargers of this fixture carry the same metered session: what the charge has cost so far.
const CH3 = ['Charged', '14.2 kWh · ≈ €2.40'];
const rows3 = (key) => all3(`.ev-node.${key} .plan-row`).map((row) => [row.querySelector('dt').textContent, norm(row.querySelector('dd').textContent)]);
const note3 = (key) => norm(root3.querySelector(`.ev-node.${key} .charger-plan-line`)?.textContent);
const title3 = () => norm(root3.querySelector('.status-title')?.textContent);
const support3 = () => norm(root3.querySelector('.status-support')?.textContent);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const planTime = (iso) => el3._formatPlanTime(iso, Date.now());
const click3 = async (selector) => {
  root3.querySelector(selector)?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
  await el3.updateComplete; await wait();
};
// The charger details dialog: its sections in order, the label/value rows of one, and its note.
const sections3 = () => all3('dialog .details-section').map((node) => node.getAttribute('data-section'));
const detail3 = (id) => all3(`dialog .details-section[data-section="${id}"] .charger-diagnostics > div`)
  .map((row) => [norm(row.querySelector('dt').textContent), norm(row.querySelector('dd').textContent)]);
const detailNote3 = (id) => norm(root3.querySelector(`dialog .details-section[data-section="${id}"] .details-note`)?.textContent);
const closeDialog3 = async () => { el3._closeActiveDialog(); await el3.updateComplete; await wait(); };
check('with Intelligent charging enabled the card shows the plan chart above the charger tiles',
  !!svg3() && !root3.querySelector('.plan-timeline, .tl-canvas') &&
  same([...root3.querySelector('.flow-stage').children].map((node) => node.className.split(' ')[0]), ['house-node', 'family-chart-frame', 'ev-row', 'plan-saving', 'advanced-settings']));
check('the chart frame has no title (like the price card) and its short legend names only what is drawn, the hatch included',
  !chart3()?.querySelector('.family-chart-title') && svg3()?.getAttribute('aria-label') === 'Charging plan' &&
  same(legend3(), ['Price', 'Planned', 'Extra', 'No price yet']) &&
  same(all3('.family-chart-legend [data-period]').map((node) => node.getAttribute('data-period')), ['planned', 'extra']) &&
  all3('.family-chart-legend [data-band]').length === 1 &&
  !!chart3()?.querySelector('.family-chart-readout'));
check('each connected car is a lane with its planned and extra periods and a ready-by marker',
  same(lanes3(), [
    { id: 'smartevse_1', label: 'XC40', tones: ['planned', 'planned'], marker: true, muted: false },
    { id: 'smartevse_2', label: 'EX30', tones: ['planned', 'extra'], marker: true, muted: false }]) &&
  all3('.family-chart-period-hatch[data-pattern="hatch"]').length === 1 && !root3.querySelector('.family-chart-period-hatch[data-pattern="bars"]'));
// The chart is the price chart of the Real Electricity Price card (0.7.0): today and tomorrow
// from midnight, one narrow bar per hour in the shared price colours, H and L, day-and-time
// labels. This fixture has no hourly price lists, so the bars are the plan's known prices.
const priceBars = () => all3('.family-chart-bar[data-series="price"]');
const barFills = () => priceBars().map((bar) => (bar.getAttribute('style') || '').replace(/^fill:\s*/, '').replace(/;$/, ''));
const PRICE_GREENS = ['#86efac', '#22c55e', '#bbf7d0'];
const PRICE_BLUES = ['#93c5fd', '#3b82f6', '#bfdbfe'];
const greenBars = () => barFills().filter((fill) => PRICE_GREENS.includes(fill));
const barBox = (bar) => ({ x: Number(bar.getAttribute('x')), width: Number(bar.getAttribute('width')) });
const hourPx = () => barBox(priceBars()[1]).x - barBox(priceBars()[0]).x;
check('the price is one bar per hour in a two-day window, centred in its hour like on the price card, never a line',
  priceBars().length === 7 && !root3.querySelector('.family-chart-line[data-series="price"]') &&
  // 48 hours on the 360 px fallback width: about 6.4 px per hour, each bar nine tenths of it.
  hourPx() > 6 && hourPx() < 7 && priceBars().every((bar) => Math.abs(barBox(bar).width - hourPx() * 0.9) < 0.01) &&
  same(all3('.family-chart-time').map((node) => node.textContent), ['9 Nov, 0:00', '10 Nov, 0:00', '11 Nov, 0:00']) &&
  all3('.family-chart-extreme').length === 2);
check('prices take the shared electricity price colours, green at or below the cheap limit; hours without a price are one hatched band',
  barFills().length === 7 && greenBars().length === 4 && barFills().filter((fill) => PRICE_BLUES.includes(fill)).length === 3 &&
  // Six hours of a two-day window are too narrow for the band's own label: the legend names it.
  all3('.family-chart-band').length === 1 && root3.querySelector('.family-chart-band')?.getAttribute('data-pattern') === 'hatched' &&
  !root3.querySelector('.family-chart-band-label') && legend3().includes('No price yet') && !!root3.querySelector('.family-chart-now'));
check('the chart is a named slider with the plan described in words',
  svg3()?.getAttribute('role') === 'slider' && svg3().getAttribute('aria-label') === 'Charging plan' &&
  /^Charging plan until /.test(desc3()) && desc3().includes('Volvo XC40: 21:00–22:00, 23:00–') && desc3().includes('Volvo EX30: ') &&
  desc3().includes(`Ready by ${planTime('2026-11-10T07:00:00+00:00')}`) && desc3().includes(`No published price from ${planTime('2026-11-10T01:00:00+00:00')}`) &&
  !desc3().includes('below zero'));
const periodLine3 = () => all3('.family-chart-periods .family-chart-readout-period').map((node) => norm(node.textContent));
check('under the chart one line says what each car does at the selected time; the head readout keeps time and price',
  !!chart3()?.querySelector('.family-chart-periods') && !chart3().querySelector('.family-chart-readout .family-chart-readout-period') &&
  norm(chart3().querySelector('.family-chart-readout')?.textContent) === '9 Nov, 18:00 0.3100 €/kWh' &&
  [...chart3().children].map((node) => node.className.split(' ')[0]).join(',') === 'family-chart-head,family-chart-legend,family-chart-body,family-chart-periods');
check('the chart is 150 px plus one row per car and the card size follows it',
  svg3()?.getAttribute('viewBox') === '0 0 360 200' && el3.getCardSize() === 22);
const selectionGroups = [el3._chartGroup, document.createElement(tag)._chartGroup];
check('each card instance has its own chart selection group', selectionGroups[0] !== selectionGroups[1] && /^smartevse-plan-\d+$/.test(selectionGroups[0]));
// Charger tiles (0.6.0): the classic tile (icon, charger, vehicle, state and the battery level,
// the shared horizontal meter with the minimum marked), then short labelled facts.
const meters3 = () => all3('.ev-node .battery-meter');
const gauges = meters3();
const heading3 = (key) => ['.charger-icon', '.charger-name', '.vehicle-name', '.charger-status', '.battery-value']
  .map((selector) => norm(root3.querySelector(`.ev-node.${key} .charger-heading ${selector}`)?.textContent));
check('each connected car is the classic tile: icon, charger, vehicle, state and level, with the shared meter marking the minimum',
  gauges.length === 2 && gauges[0].classList.contains('family-level-meter') && gauges[0].getAttribute('aria-label') === 'Volvo XC40 battery' &&
  gauges[0].getAttribute('aria-valuetext') === '53%, minimum 80%' && !!gauges[0].querySelector('.family-level-target') &&
  same(heading3('smartevse_1'), ['', 'SmartEVSE 1', 'Volvo XC40', 'Connected · waiting', '53%']) &&
  same(heading3('smartevse_2'), ['', 'SmartEVSE 2', 'Volvo EX30', 'Connected · waiting', '30%']) &&
  all3('.ev-node .charger-heading .charger-icon ha-icon').every((icon) => icon.getAttribute('icon') === 'mdi:ev-station') &&
  same([...root3.querySelector('.ev-node.smartevse_1').children].map((node) => node.className.split(' ')[0]), ['charger-heading', 'family-level-meter', 'plan-scale', 'charger-plan', 'charger-details']) &&
  !root3.querySelector('.pod-gauge, .pod-ring, .pod-unit, .pod-head, .session-cost, .plan-totals, .charger-totals button'));
check('the LED state of each charger shows as the glow under its tile',
  all3('.ev-node-wrap').every((wrap) => /\bvisual-(idle|charging|error|off)\b/.test(wrap.getAttribute('class') || '') && !!wrap.querySelector(':scope > .glow-under.ev-glow')));
check('a planned car reads Guaranteed, Extra, Next, Charged and the total as labelled rows',
  same(rows3('smartevse_1'), [['Guaranteed', `80% by ${t7}`], ['Extra', 'none tonight'], ['Next', 'Starts 21:00'], CH3, ['Total', '≈ €4.91']]) &&
  same(rows3('smartevse_2'), [['Guaranteed', `80% by ${t7}`], ['Extra', 'to ≈ 96% while cheap'], ['Next', `Starts ${planTime('2026-11-10T02:00:00+00:00')}`], CH3, ['Total', '≈ €1.19']]) &&
  !root3.querySelector('.ev-node .charger-plan-line') && all3('.ev-node dl.plan-stats').length === 2 && !root3.querySelector('.ev-node dl.plan-rows'));
// 0.8.0: the same facts, laid out. Guaranteed and Extra sit under the battery bar; Next, Charged
// and the total are three figures side by side, each a main figure with a quieter second part.
const scale3 = (key) => root3.querySelector(`.ev-node.${key} > .plan-scale`);
const parts3 = (key, row) => {
  const node = root3.querySelector(`.ev-node.${key} .plan-row[data-row="${row}"] dd`);
  return [norm(node?.querySelector('.fact-main')?.textContent), norm(node?.querySelector('.fact-sub')?.textContent)];
};
check('Guaranteed and Extra sit under the battery bar, the guaranteed level ending at the minimum tick',
  same([...scale3('smartevse_1').children].map((row) => row.getAttribute('data-row')), ['guaranteed', 'extra']) &&
  scale3('smartevse_1').getAttribute('data-side') === 'end' && /--plan-minimum:\s*80;/.test(scale3('smartevse_1').getAttribute('style')) &&
  same(parts3('smartevse_1', 'guaranteed'), ['80%', `by ${t7}`]) && same(parts3('smartevse_1', 'extra'), ['none tonight', '']) &&
  !scale3('smartevse_1').querySelector('[data-short]') &&
  scale3('smartevse_1').previousElementSibling === gauges[0]);
check('the part the plan charges above the minimum is hatched on the bar (shared level meter range)',
  !gauges[0].querySelector('.family-level-range') &&
  (gauges[1].querySelector('.family-level-range')?.getAttribute('style') || '').replace(/\s+/g, '') === 'left:80%;width:16%');
// How a value splits into its main figure and second part; the text stays the plain value.
const split3 = (value, kind) => {
  const box = document.createElement('div');
  box.innerHTML = el3._factParts(value, kind);
  return [norm(box.querySelector('.fact-main')?.textContent), norm(box.querySelector('.fact-sub')?.textContent), norm(box.textContent)];
};
check('values split into a main figure and a second part without changing their text',
  same(split3('Starts 22:24', 'time'), ['22:24', 'Starts', 'Starts 22:24']) &&
  same(split3('Starts Thu 0:56', 'time'), ['0:56', 'Starts Thu', 'Starts Thu 0:56']) &&
  same(split3('Starts 9:00 PM', 'time'), ['9:00 PM', 'Starts', 'Starts 9:00 PM']) &&
  same(split3('Charging until 23:10', 'time'), ['23:10', 'Charging until', 'Charging until 23:10']) &&
  same(split3('Charging now', 'time'), ['now', 'Charging', 'Charging now']) &&
  same(split3('After Volvo XC40', 'time'), ['Volvo XC40', 'After', 'After Volvo XC40']) &&
  same(split3('Done', 'time'), ['Done', '', 'Done']) &&
  same(split3('5.3 kWh · ≈ €1.84 · partial estimate'), ['5.3 kWh', '≈ €1.84 · partial estimate', '5.3 kWh · ≈ €1.84 · partial estimate']) &&
  same(split3('≈ 47.1 kWh · ≈ €12.87'), ['≈ 47.1 kWh', '≈ €12.87', '≈ 47.1 kWh · ≈ €12.87']) &&
  same(split3('Nothing yet'), ['Nothing yet', '', 'Nothing yet']) &&
  same(split3('80% by 7:00'), ['80%', 'by 7:00', '80% by 7:00']) &&
  same(split3('Reached · 80%'), ['80%', 'Reached', 'Reached · 80%']) &&
  same(split3('to 100% · car limit'), ['to 100%', 'car limit', 'to 100% · car limit']) &&
  same(split3('to ≈ 86% by 07:00'), ['to ≈ 86%', 'by 07:00', 'to ≈ 86% by 07:00']) &&
  same(split3('when prices arrive · ≈ 15:00'), ['when prices arrive', '≈ 15:00', 'when prices arrive · ≈ 15:00']) &&
  same(split3('<img src=x> · <b>'), ['<img src=x>', '<b>', '<img src=x> · <b>']));
const scaleOf = (rows, minimum) => { const box = document.createElement('div'); box.innerHTML = el3._planScale(rows, minimum); return box.firstElementChild; };
check('under the bar an extra level is short ("to 100%"), other extra texts are whole, and a low minimum starts at its tick',
  scaleOf([{ id: 'guaranteed', label: 'Guaranteed', value: '80% by 7:00' }, { id: 'extra', label: 'Extra', value: 'to 100% · car limit' }], 80)
    .querySelector('[data-row="extra"]').hasAttribute('data-short') &&
  scaleOf([{ id: 'extra', label: 'Extra', value: 'to ≈ 86% by 07:00' }], 80).querySelector('[data-row="extra"]').hasAttribute('data-short') &&
  !scaleOf([{ id: 'extra', label: 'Extra', value: 'when prices arrive · ≈ 15:00' }], 80).querySelector('[data-short]') &&
  !scaleOf([{ id: 'extra', label: 'Extra', value: 'to ≈ 96% while cheap' }], 80).querySelector('[data-short]') &&
  scaleOf([{ id: 'guaranteed', label: 'Guaranteed', value: '30% by 7:00' }], 30).getAttribute('data-side') === 'start' &&
  /--plan-minimum:\s*100;/.test(scaleOf([{ id: 'guaranteed', label: 'Guaranteed', value: 'x' }], 140).getAttribute('style')) &&
  el3._planScale([], 80) === '');
check('Next, Charged and the total are three figures side by side, each with its main figure and a second part',
  same([...root3.querySelector('.ev-node.smartevse_1 .plan-stats').children].map((row) => row.getAttribute('data-row')), ['next', 'charged', 'cost']) &&
  same(parts3('smartevse_1', 'next'), ['21:00', 'Starts']) && same(parts3('smartevse_1', 'charged'), ['14.2 kWh', '≈ €2.40']) &&
  same(parts3('smartevse_1', 'cost'), ['≈ €4.91', '']) &&
  norm(root3.querySelector('.ev-node.smartevse_1 .plan-row[data-row="charged"] .fact-main small')?.textContent) === 'kWh' &&
  !!root3.querySelector('.ev-node.smartevse_1 .plan-row[data-row="charged"] .row-history .fact'));
check('car tiles keep the "Charger details" row button under their facts',
  all3('.ev-node > .charger-details[data-action="open-charger-details"]').length === 2 &&
  all3('.ev-node > .charger-details').every((button) => /charger details$/.test(button.getAttribute('aria-label') || '') &&
    button.getAttribute('aria-haspopup') === 'dialog' && norm(button.textContent) === 'Charger details'));
const charged3 = (key) => root3.querySelector(`.ev-node.${key} .plan-row[data-row="charged"] [data-action="open-history"]`);
check('the Charged value of each car is the control that opens that charger’s history',
  ['smartevse_1', 'smartevse_2'].every((key) => charged3(key)?.localName === 'button' && charged3(key).getAttribute('data-charger') === key &&
    charged3(key).getAttribute('aria-haspopup') === 'dialog' && norm(charged3(key).textContent) === CH3[1] &&
    charged3(key).getAttribute('aria-label') === `${key.replace('smartevse_', 'SmartEVSE ')} charged ${CH3[1]}; open history`) &&
  all3('.ev-node [data-action="open-history"]').length === 2);
const saving3 = () => norm(root3.querySelector('.plan-saving')?.textContent);
check('one line under the tiles says what the plan saves and compared with what; there is no totals row',
  saving3() === 'Saves ≈ €1.34 compared with charging at plug\u2011in' && root3.querySelector('.plan-saving')?.classList.contains('family-surface') &&
  !root3.querySelector('.plan-totals'));
check('the hero is one plain sentence with the ready-by time and the extra charging under it',
  title3() === 'Next charge at 21:00' && support3() === `Ready by ${t7} · then extra while cheap` &&
  !root3.querySelector('[data-plan-group="intelligent"] .status-pill') &&
  norm(root3.querySelector('#sdc-hero-description')?.textContent).startsWith(`Next charge at 21:00. Ready by ${t7} · then extra while cheap. Intelligent charging enabled`));
// The overview is a Lit skeleton: the chart keeps its DOM while the HTML parts around it change.
const stage3 = root3.querySelector('.flow-stage');
const chartNode = svg3();
svg3().dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
iAttrs.smartevse_1_battery = '54';
await push3();
check('a state change replaces the tiles but keeps the chart and the stage in place',
  root3.querySelector('.flow-stage') === stage3 && svg3() === chartNode && gauges[0] !== root3.querySelector('.ev-node .battery-meter') &&
  norm(root3.querySelector('.ev-node .battery-value')?.textContent) === '54%' && !el3._flow.current &&
  same([...stage3.children].map((node) => node.className.split(' ')[0]), ['house-node', 'family-chart-frame', 'ev-row', 'plan-saving', 'advanced-settings']));
iAttrs.smartevse_1_battery = '53';
// Different ready-by times are named per car; a deadline outside the window has no marker.
iAttrs.intelligent.chargers.smartevse_2.deadline = '2026-11-10T05:00:00+00:00';
await push3();
check('two different deadlines are named per car in the hero and both in the chart description',
  support3() === `Volvo XC40 by ${t7} · Volvo EX30 by ${el3._formatClock('05:00')} · then extra while cheap` &&
  desc3().includes(`Ready by ${planTime('2026-11-10T05:00:00+00:00')} / ${planTime('2026-11-10T07:00:00+00:00')}`) && lanes3().every((lane) => lane.marker));
iAttrs.intelligent.chargers.smartevse_2.deadline = '2026-11-09T17:00:00+00:00';
await push3();
check('a deadline in the past has no marker and is not named', same(lanes3().map((lane) => lane.marker), [true, false]) &&
  desc3().includes(`Ready by ${planTime('2026-11-10T07:00:00+00:00')}`) && !desc3().includes(' / '));
// Charging: the running block of a charger that reports Charging is the active period.
iAttrs.intelligent = payload10();
iAttrs.smartevse_1_state = 'Charging';
iAttrs.intelligent.status = 'charging';
iAttrs.intelligent.chargers.smartevse_1.status = 'charging';
iAttrs.charge_reason = 'intelligent_charging';
await at3('2026-11-09T21:30:00Z');
check('a charging car reads "Charging" on its lane, in the legend, the period line, its row and the hero',
  same(lanes3()[0].tones, ['active', 'planned']) && same(legend3(), ['Price', 'Charging', 'Planned', 'Extra', 'No price yet']) &&
  periodLine3().includes('XC40 Charging') &&
  same(rows3('smartevse_1')[2], ['Next', 'Charging until 22:00']) && title3() === 'Charging Volvo XC40' &&
  saving3().startsWith('Saves ≈ '));
iAttrs.smartevse_1_state = 'Connected';
await push3();
check('a planned block that runs before the charger reports Charging is not shown as charging',
  same(lanes3()[0].tones, ['planned', 'planned']) && same(rows3('smartevse_1')[2], ['Next', 'Starting now']) && title3() === 'Starting to charge Volvo XC40' &&
  saving3().startsWith('Saves ≈ '));
iAttrs.charge_reason = 'intelligent_waiting_for_planned_slot';
// Minimum reached: the guarantee is met; extra charging may still follow.
const reached10 = () => {
  iAttrs.intelligent = payload10();
  Object.assign(iAttrs.intelligent.chargers.smartevse_1, { status: 'reached', soc: 82, blocks: [], need_kwh: 0 });
  Object.assign(iAttrs.intelligent.chargers.smartevse_2, { status: 'reached', soc: 81, need_kwh: 0,
    blocks: [{ start: '2026-11-10T04:00:00+00:00', end: '2026-11-10T04:30:00+00:00', top_up: true }] });
};
reached10();
await at3('2026-11-09T18:00:00Z');
check('a car at its minimum reads "Reached" with its level, and "Done" when nothing more is planned',
  same(rows3('smartevse_1'), [['Guaranteed', 'Reached · 82%'], ['Extra', 'none tonight'], ['Next', 'Done'], CH3, ['Total', '≈ €4.91']]));
check('a car at its minimum with extra charging planned names the extra level and its start',
  same(rows3('smartevse_2'), [['Guaranteed', 'Reached · 81%'], ['Extra', 'to ≈ 96% while cheap'], ['Next', `Starts ${planTime('2026-11-10T04:00:00+00:00')}`], CH3, ['Total', '≈ €1.19']]) &&
  same(lanes3().map((lane) => lane.tones), [[], ['extra']]) && same(legend3(), ['Price', 'Extra', 'No price yet']) &&
  title3() === `Next charge ${el3._formatDateTime('2026-11-10T04:00:00+00:00')}` && support3() === 'Minimum reached · extra while cheap');
iAttrs.intelligent.chargers.smartevse_2.blocks = [];
iAttrs.intelligent.chargers.smartevse_2.top_up = false;
iAttrs.charge_reason = 'intelligent_targets_reached';
await push3();
check('with every car at its minimum and nothing planned the hero reads "Both cars ready"',
  title3() === 'Both cars ready' && !root3.querySelector('.status-support') && same(rows3('smartevse_2')[1], ['Extra', 'none tonight']) &&
  same(rows3('smartevse_2')[2], ['Next', 'Done']) && same(legend3(), ['Price', 'No price yet']));
iAttrs.smartevse_2_plug_state = 'Disconnected';
delete iAttrs.intelligent.chargers.smartevse_2;
await push3();
check('one car at its minimum reads "<car> ready"', title3() === 'Volvo XC40 ready');
iAttrs.smartevse_2_plug_state = 'Connected';
iAttrs.charge_reason = 'intelligent_waiting_for_planned_slot';
// Not enough time: one warning line, no guarantee row.
iAttrs.intelligent = payload10();
Object.assign(iAttrs.intelligent.chargers.smartevse_2, { status: 'at_risk', feasible: false, projected_soc: 74, top_up: false, extra_soc: null,
  queue_after: 'smartevse_1', blocks: [{ start: '2026-11-10T02:00:00+00:00', end: '2026-11-10T04:00:00+00:00', top_up: false }] });
iAttrs.intelligent.status = 'at_risk';
await push3();
const riskLine = root3.querySelector('.ev-node.smartevse_2 .charger-plan-line');
check('a car that cannot reach its minimum has one warning line and no "Guaranteed" row',
  note3('smartevse_2') === `Not enough time · ≈ 74% by ${t7}` && riskLine?.getAttribute('data-tone') === 'warning' &&
  riskLine.querySelector('.plan-tone-icon')?.getAttribute('icon') === 'mdi:alert-outline' && riskLine.querySelectorAll('.sep').length === 1 &&
  same(rows3('smartevse_2'), [['Next', `Starts ${planTime('2026-11-10T02:00:00+00:00')}`], CH3, ['Total', '≈ €1.19']]) &&
  same(lanes3()[1].tones, ['warning']) && same(legend3(), ['Price', 'Planned', 'Not enough time', 'No price yet']) &&
  all3('.family-chart-period-hatch[data-pattern="bars"]').length === 1 &&
  support3() === `Volvo XC40 by ${t7}` && all3('[data-plan-group="intelligent"] .status-pill').length === 1);
iAttrs.intelligent.chargers.smartevse_2.blocks = [];
await push3();
check('a car that waits behind the other one says so', same(rows3('smartevse_2')[0], ['Next', 'After Volvo XC40']));
const tileNotes = [
  ['identifying', (c) => { c.status = 'identifying'; }, 'Identifying vehicle', false],
  ['excluded', (c) => { c.status = 'excluded'; }, 'Not planned · charge policy', false],
  ['car timer', (c) => { c.car_timer = true; }, 'Car’s own charging timer is on', true],
  ['not accepting', (c) => { c.status = 'not_accepting'; c.not_accepting = true; }, 'Car isn’t accepting charge', true],
];
const wrongNotes = [];
for (const [name, mutate, text, warning] of tileNotes) {
  iAttrs.intelligent = payload10();
  mutate(iAttrs.intelligent.chargers.smartevse_2);
  await push3();
  const line = root3.querySelector('.ev-node.smartevse_2 .charger-plan-line');
  if (note3('smartevse_2') !== text || (line?.getAttribute('data-tone') === 'warning') !== warning || !!line?.querySelector('.plan-tone-icon') !== warning ||
    rows3('smartevse_2').some((row) => row[0] !== 'Charged')) wrongNotes.push(`${name}: ${note3('smartevse_2')} / ${rows3('smartevse_2').length} rows`);
}
check('identifying, policy, car-timer and refusing cars read as one line, with no plan rows (only what was charged so far)', wrongNotes.length === 0);
if (wrongNotes.length) console.log(wrongNotes);
// Unknown battery level (unidentified car): an energy budget, no Extra or Cost row.
iAttrs.intelligent = payload10();
Object.assign(iAttrs.intelligent.chargers.smartevse_2, { vehicle: null, vehicle_name: '', settings_key: 'other', soc: null, estimated: true, need_kwh: 25,
  top_up: false, extra_soc: null, blocks: [{ start: '2026-11-10T02:00:00+00:00', end: '2026-11-10T04:00:00+00:00', top_up: false }] });
const ev2Before = [iAttrs.smartevse_2_connected_ev, iAttrs.smartevse_2_battery];
iAttrs.smartevse_2_connected_ev = 'unknown'; iAttrs.smartevse_2_battery = '';
await push3();
check('an unidentified car is guaranteed an energy budget and its lane is "Other"',
  same(rows3('smartevse_2'), [['Guaranteed', `≈ 25 kWh by ${t7}`.replace(/\s+/g, ' ')], ['Next', `Starts ${planTime('2026-11-10T02:00:00+00:00')}`], CH3]) &&
  lanes3()[1].label === 'Other' && norm(root3.querySelector('.ev-node.smartevse_2 .vehicle-name')?.textContent) === 'Vehicle connected');
[iAttrs.smartevse_2_connected_ev, iAttrs.smartevse_2_battery] = ev2Before;
// Integration 0.0.11.0: the minimum is a floor and every car goes on to its own charge limit in
// the cheapest hours left before its ready-by. No price limit: top_up = { source: 'car_limit' }.
const payload11 = () => {
  const payload = payload10();
  payload.top_up = { enabled: true, price: null, source: 'car_limit', waits_until: null };
  for (const charger of Object.values(payload.chargers)) Object.assign(charger, { extra_waits_until: null, extra_done: false });
  // What the plan still charges, and its cost; what was charged so far is the charger's session.
  Object.assign(payload.chargers.smartevse_1, { planned_kwh: 27.9, planned_cost: 4.91 });
  Object.assign(payload.chargers.smartevse_2, { planned_kwh: 28.44, planned_cost: 1.19 });
  return payload;
};
iAttrs.intelligent = payload11();
await at3('2026-11-09T18:00:00Z');
check('0.0.11.0: the Extra row names the level the plan reaches above the minimum and by when',
  same(rows3('smartevse_2'), [['Guaranteed', `80% by ${t7}`], ['Extra', `to ≈ 96% by ${t7}`], ['Next', `Starts ${planTime('2026-11-10T02:00:00+00:00')}`], CH3,
    ['Planned', '≈ 28.4 kWh · ≈ €1.19']]) &&
  same(rows3('smartevse_1')[1], ['Extra', `none before ${t7}`]) && !/while cheap/.test(norm(root3.querySelector('ha-card')?.textContent)));
check('0.0.11.0: the cost of a charge is two plain rows: what was charged so far and what is still planned',
  same(rows3('smartevse_1').slice(3), [CH3, ['Planned', '≈ 27.9 kWh · ≈ €4.91']]) &&
  !all3('.plan-row').some((row) => /saves|saved|Session estimate/i.test(row.textContent)) && !root3.querySelector('.ev-node .session-cost') &&
  saving3() === 'Saves ≈ €1.34 compared with charging at plug\u2011in');
check('0.0.11.0: the hero says the cars go on to the car limit, and the gauge speaks the level',
  title3() === 'Next charge at 21:00' && support3() === `Ready by ${t7} · then extra up to the car limit` &&
  root3.querySelector('.ev-node.smartevse_2 .battery-meter')?.getAttribute('aria-valuetext') === '30%, minimum 80%' &&
  same(legend3(), ['Price', 'Planned', 'Extra', 'No price yet']) &&
  // No learned price any more, and this fixture has no price-card limit: no bar is green.
  greenBars().length === 0 && barFills().every((fill) => PRICE_BLUES.includes(fill)));
iAttrs.intelligent.chargers.smartevse_2.extra_soc = 100;
iAttrs.intelligent.chargers.smartevse_1.extra_waits_until = '2026-11-09T19:00:00+00:00';
iAttrs.intelligent.top_up.waits_until = '2026-11-09T19:00:00+00:00';
await push3();
check('0.0.11.0: a plan that fills the car says so, and a car waiting for tomorrow\'s prices says when they are due',
  same(rows3('smartevse_2')[1], ['Extra', 'to 100% · car limit']) &&
  same(rows3('smartevse_1')[1], ['Extra', `when prices arrive · ≈ ${planTime('2026-11-09T19:00:00+00:00')}`]));
// The owner's morning (2026-11-11): the XC40 is at its car limit, the EX30 reached its 70 %
// minimum and goes on charging until its ready-by.
iAttrs.intelligent = payload11();
Object.assign(iAttrs.intelligent.chargers.smartevse_1, { status: 'reached', soc: 90, minimum: 90, target: 90, car_limit: 90, blocks: [], need_kwh: 0,
  projected_soc: 90, next_start: null, planned_kwh: 0, planned_cost: 0 });
Object.assign(iAttrs.intelligent.chargers.smartevse_2, { status: 'reached', soc: 70, minimum: 70, target: 70, car_limit: 100, need_kwh: 0, projected_soc: 70,
  top_up: true, extra_soc: 77, planned_kwh: 4.6, planned_cost: 1.11, blocks: [{ start: '2026-11-10T06:15:00+00:00', end: '2026-11-10T07:00:00+00:00', top_up: true }] });
Object.assign(iAttrs, { smartevse_2_state: 'Charging', active_smartevse_raw: 'smartevse_2', charge_allowed: true, charge_reason: 'intelligent_top_up' });
const morningBefore = [iAttrs.smartevse_1_battery, iAttrs.smartevse_2_battery];
iAttrs.smartevse_1_battery = '90%'; iAttrs.smartevse_2_battery = '70%';
await at3('2026-11-10T06:20:00Z');
check('0.0.11.0: a car at its minimum goes on charging; a car at its own limit says so',
  same(rows3('smartevse_1'), [['Guaranteed', 'Reached · 90%'], ['Extra', 'At the car’s limit'], ['Next', 'Done'], CH3]) &&
  same(rows3('smartevse_2'), [['Guaranteed', 'Reached · 70%'], ['Extra', `to ≈ 77% by ${t7}`], ['Next', `Charging until ${planTime('2026-11-10T07:00:00+00:00')}`], CH3,
    ['Planned', '≈ 4.6 kWh · ≈ €1.11']]) &&
  title3() === 'Charging Volvo EX30' && support3() === 'Minimum reached · extra up to the car limit');
check('the saving line is a shared foreground surface, so the glows of the car tiles stay beneath it',
  all3('.plan-saving').length === 1 && all3('.plan-saving').every((cell) => cell.classList.contains('family-surface')) && !root3.querySelector('.plan-totals'));
// The minimum equal to the car's limit leaves nothing above it: no Extra row while it charges.
Object.assign(iAttrs.intelligent.chargers.smartevse_1, { status: 'planned', soc: 60, need_kwh: 22, blocks: [{ start: '2026-11-10T06:30:00+00:00', end: '2026-11-10T07:00:00+00:00', top_up: false }] });
iAttrs.smartevse_1_battery = '60%';
await push3();
check('0.0.11.0: a minimum equal to the car limit has no Extra row',
  same(rows3('smartevse_1').map((row) => row[0]), ['Guaranteed', 'Next', 'Charged']));
// The car stopped by itself below the limit the integration reads from it: nothing more is planned.
Object.assign(iAttrs.intelligent.chargers.smartevse_2, { top_up: false, extra_soc: null, blocks: [], planned_kwh: 0, planned_cost: 0, extra_done: true });
Object.assign(iAttrs, { smartevse_2_state: 'Connected', active_smartevse_raw: '', charge_allowed: false });
await push3();
check('0.0.11.0: a car that stopped below its limit says so instead of promising more',
  same(rows3('smartevse_2'), [['Guaranteed', 'Reached · 70%'], ['Extra', 'Car stopped charging'], ['Next', 'Done'], CH3]));
[iAttrs.smartevse_1_battery, iAttrs.smartevse_2_battery] = morningBefore;
Object.assign(iAttrs, { smartevse_2_state: 'Connected', active_smartevse_raw: '', charge_allowed: false, charge_reason: 'intelligent_waiting_for_planned_slot' });
await at3('2026-11-09T18:00:00Z');
// The saving names what it is compared with (intelligent.baseline_kind, integration 0.0.11.0).
iAttrs.intelligent = payload11();
await push3();
const savingDefault = saving3();
iAttrs.intelligent.baseline_kind = 'schedule';
await push3();
const savingSchedule = saving3();
delete iAttrs.intelligent.baseline_kind;
await push3();
check('the saving line names its comparison: Charge with schedule, or charging at plug-in (also when the payload names none)',
  savingDefault === 'Saves ≈ €1.34 compared with charging at plug\u2011in' && savingSchedule === 'Saves ≈ €1.34 compared with Charge with schedule' &&
  saving3() === 'Saves ≈ €1.34 compared with charging at plug\u2011in');
iAttrs.intelligent.baseline_kind = 'schedule';
for (const charger of Object.values(iAttrs.intelligent.chargers)) Object.assign(charger, { status: 'reached', soc: 82, blocks: [], top_up: false, extra_soc: null, planned_kwh: 0, planned_cost: 0 });
await push3();
check('with nothing more planned the line reads "Saved"', saving3() === 'Saved ≈ €1.34 compared with Charge with schedule');
// History and the tile without a car name the comparison of each realised session.
iAttrs.intelligent = payload11();
iAttrs.intelligent.baseline_kind = 'schedule';
const recordEx30 = iAttrs.charging_costs.chargers.smartevse_2.session;
const sessionEx30 = iAttrs.intelligent.sessions.find((session) => session.ledger_id === 'ex30-last');
const sessionXc40 = iAttrs.intelligent.sessions.find((session) => session.ledger_id === 'xc40-forced');
Object.assign(sessionXc40, { mixed: false, baseline_kind: 'schedule' });
sessionEx30.baseline_kind = 'schedule';
iAttrs.smartevse_2_plug_state = 'Disconnected';
delete iAttrs.intelligent.chargers.smartevse_2;
await push3();
check('a session compared with the schedule says so in History and on the tile without a car',
  el3._historySaving(recordEx30) === 'Saved ≈ €1.25 vs Charge with schedule' &&
  el3._historySaving(iAttrs.charging_costs.chargers.smartevse_1.session) === '≈ €0.40 more than Charge with schedule' &&
  note3('smartevse_2') === 'Last charge saved ≈ €1.25 compared with Charge with schedule');
delete sessionEx30.baseline_kind;
await push3();
check('a session without a named comparison is compared with charging at plug-in',
  el3._historySaving(recordEx30) === 'Saved ≈ €1.25 vs charging at plug-in' &&
  note3('smartevse_2') === 'Last charge saved ≈ €1.25 compared with charging at plug\u2011in');
await click3('.ev-node.smartevse_2 .plan-row[data-row="last"] [data-action="open-history"]');
check('the last charge of a charger without a car opens its history',
  root3.querySelector('dialog')?.getAttribute('aria-label') === 'Charging history' && root3.querySelector('[data-charger="cost-smartevse_2"]')?.open === true &&
  all3('dialog .cost-record-saving').some((node) => norm(node.textContent) === '≈ €0.40 more than Charge with schedule'));
await closeDialog3();
iAttrs.smartevse_2_plug_state = 'Connected';
iAttrs.intelligent = payload11();
iAttrs.intelligent.baseline_kind = 'schedule';
iAttrs.intelligent.chargers.smartevse_2.saving = 0.92;
await push3();
// History opens from the Charged value of a car tile, and focus returns to it.
await click3('.ev-node.smartevse_2 .plan-row[data-row="charged"] [data-action="open-history"]');
const historyFromCharged = root3.querySelector('dialog')?.getAttribute('aria-label') === 'Charging history' &&
  root3.querySelector('[data-charger="cost-smartevse_2"]')?.open === true && root3.querySelector('[data-charger="cost-smartevse_1"]')?.open === false;
await closeDialog3();
check('the Charged value opens the history of its charger, and closing returns focus to it',
  historyFromCharged && !root3.querySelector('dialog') && root3.activeElement === charged3('smartevse_2'));
// Charger details: everything about one charger in short titled sections.
await click3('.ev-node.smartevse_1 > .charger-details');
check('charger details read as titled sections: Car, Plan, This charge, Charger, What the planner uses',
  root3.querySelector('dialog')?.getAttribute('aria-label') === 'SmartEVSE 1' && same(sections3(), ['car', 'plan', 'charge', 'charger', 'planner']) &&
  same(all3('dialog .details-section .intelligent-section-title').map((node) => norm(node.textContent)), ['Car', 'Plan', 'This charge', 'Charger', 'What the planner uses']) &&
  all3('dialog .details-section').every((node) => !!node.getAttribute('aria-label')));
check('details · Car: vehicle, level, the minimum as "At least", the car limit and ready by',
  same(detail3('car'), [['Vehicle', 'Volvo XC40'], ['Battery level', '53%'], ['At least', '80%'], ['Car limit', '90%'], ['Ready by', t7]]));
check('details · Plan: what is guaranteed, what follows above the minimum, and every planned block',
  same(detail3('plan'), [['Guaranteed', `80% by ${t7}`], ['Extra', `none before ${t7}`], ['21:00–22:00', 'Guaranteed'],
    [`23:00–${el3._formatClock('00:00')}`, 'Guaranteed']]) && !detailNote3('plan'));
check('details · This charge: charged so far and since when, what is still planned, and the saving with its comparison',
  same(detail3('charge'), [['Charged', CH3[1]], ['Since', el3._costTime('2026-11-08T21:00:00Z')], ['Planned', '≈ 27.9 kWh · ≈ €4.91'],
    ['Saving', '≈ €1.29 vs Charge with schedule']]));
check('details · Charger keeps state, mode, the current offered and the limit',
  same(detail3('charger').map((row) => row[0]), ['State', 'Mode', 'Current offered', 'Limit']) && detail3('charger').every((row) => row[1]));
check('details · What the planner uses: energy per percent with its source, charging power and how far the estimates are refined',
  same(detail3('planner'), [['Energy per percent', '0.71 kWh · learned'], ['Charging power', '10.9 kW'], ['Estimates', 'Refined from 12 charges']]));
await closeDialog3();
check('closing the details returns focus to the "Charger details" button', root3.activeElement === root3.querySelector('.ev-node.smartevse_1 > .charger-details'));
await click3('.ev-node.smartevse_2 > .charger-details');
check('details of the second car: extra blocks read "Above the minimum", a capacity-based estimate says so and is not a gate',
  same(detail3('plan'), [['Guaranteed', `80% by ${t7}`], ['Extra', `to ≈ 96% by ${t7}`],
    [`${planTime('2026-11-10T02:00:00+00:00')}–${el3._formatClock('04:00')}`, 'Guaranteed'], [`${planTime('2026-11-10T04:00:00+00:00')}–${el3._formatClock('04:30')}`, 'Above the minimum']]) &&
  same(detail3('charge').slice(2), [['Planned', '≈ 28.4 kWh · ≈ €1.19'], ['Saving', '≈ €0.92 vs Charge with schedule']]) &&
  same(detail3('planner'), [['Energy per percent', '0.55 kWh · from the battery capacity'], ['Charging power', '10.9 kW'], ['Estimates', 'Refined from 2 of 3 charges']]) &&
  !/Learning|top.?up/i.test(root3.querySelector('dialog')?.textContent || ''));
// A value the payload does not carry leaves its row out; nothing is made up.
Object.assign(iAttrs.intelligent.chargers.smartevse_2, { status: 'identifying', car_limit: null, saving: null, includes_forecast: true });
delete iAttrs.intelligent.vehicles.vehicle_2.model;
await push3();
check('details leave out what the payload does not say, and a car without a plan shows its note',
  same(detail3('car').map((row) => row[0]), ['Vehicle', 'Battery level', 'At least', 'Ready by']) && detailNote3('plan') === 'Identifying vehicle' &&
  detail3('plan').length === 0 && same(detail3('charge').map((row) => row[0]), ['Charged', 'Since']) && same(sections3(), ['car', 'plan', 'charge', 'charger']));
iAttrs.intelligent = payload11();
iAttrs.intelligent.overridden_by = 'force';
await push3();
check('details under Force charge say the plan is paused', detailNote3('plan') === 'Paused while Force charge is on' && detail3('plan').length === 0 &&
  same(detail3('charge').map((row) => row[0]), ['Charged', 'Since']) && same(detail3('car').map((row) => row[0]), ['Vehicle', 'Battery level', 'At least', 'Car limit', 'Ready by']));
iAttrs.intelligent = { ...payload11(), enabled: false };
iStates['switch.ic'].state = 'off';
await push3();
check('details without Intelligent charging keep the car, what was charged and the charger',
  same(sections3(), ['car', 'charge', 'charger']) && same(detail3('car'), [['Vehicle', 'Volvo EX30'], ['Battery level', '30%']]) &&
  same(detail3('charge'), [['Charged', CH3[1]], ['Since', el3._costTime('2026-11-08T21:00:00Z')]]));
iStates['switch.ic'].state = 'on';
await closeDialog3();
iAttrs.intelligent = payload11();
await push3();
el3._openForceWizard(); await el3.updateComplete; el3._selectForceMode('intelligent'); await el3.updateComplete; await wait();
iAttrs.intelligent.baseline_kind = 'schedule';
await push3();
check('the Intelligent page totals name the comparison too',
  all3('dialog .intelligent-totals dt').some((node) => norm(node.textContent) === 'Saving vs Charge with schedule') &&
  !/plug.in/i.test(root3.querySelector('dialog .intelligent-totals')?.textContent || ''));
await closeDialog3();
iAttrs.intelligent = payload11();
await push3();
// Integration 0.0.9.x: no extra_soc, no learned limit, a top-up switch. The rows still work.
iAttrs.intelligent = basePayload();
await push3();
check('a 0.0.9.x payload keeps working: Extra comes from the car limit and only where top-up is planned',
  same(rows3('smartevse_1'), [['Guaranteed', `80% by ${t7}`], ['Next', 'Starts 21:00'], CH3, ['Total', '≈ €4.91']]) &&
  same(rows3('smartevse_2')[1], ['Extra', 'up to 100% while cheap']) &&
  barFills().length === 7 && !barFills().some((fill) => fill.includes('--family-success')) && same(legend3(), ['Price', 'Planned', 'Extra', 'No price yet']));
el3._openForceWizard(); await el3.updateComplete; el3._selectForceMode('intelligent'); await el3.updateComplete; await wait();
check('with a 0.0.9.x top-up switch the Intelligent page keeps its top-up controls and wording',
  !!root3.querySelector('dialog [data-action="toggle-intelligent-top-up"]') && !root3.querySelector('dialog .intelligent-extra') &&
  /Top up when price is low/.test(root3.querySelector('dialog .intelligent-top-up')?.textContent || '') &&
  all3('dialog .intelligent-block').some((node) => /· top-up$/.test(norm(node.textContent))));
// A field being edited survives a re-render: the chart redraws the whole card every 30 s, also
// under an open dialog. The control must stay the same node, so its text, focus and caret stay.
const typeInto = (selector, value) => {
  const input = root3.querySelector(selector);
  input.focus();
  input.value = value;
  input.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  return input;
};
const rerender = async () => { el3.requestUpdate(); await el3.updateComplete; await wait(); };
const editCalls = iCalls.length;
// The values the fields hold now: typing them back at the end leaves nothing to save.
const heldBefore = { topUp: String(Number(iStates['number.ic_top_up_price'].state)), minimum: String(Number(iStates['number.v1_minimum'].state)),
  readyBy: iStates['time.v1_ready_by'].state.slice(0, 5) };
iStates['switch.ic_top_up'].state = 'on';
await push3();
const topUpSelector = 'dialog .force-input[data-entity="number.ic_top_up_price"]';
const topUpInput = typeInto(topUpSelector, '0.99');
await rerender(); await rerender();
check('a re-render keeps the 0.0.9.x "Top up below" field being edited: same control, value and focus',
  !!topUpInput && root3.querySelector(topUpSelector) === topUpInput && topUpInput.value === '0.99' && root3.activeElement === topUpInput &&
  el3._fieldShown.get('number.ic_top_up_price') === heldBefore.topUp && el3._editorDrafts['number.ic_top_up_price'] === '0.99');
typeInto(topUpSelector, heldBefore.topUp);
topUpInput.blur(); await wait(60);
iStates['switch.ic_top_up'].state = 'off';
// Integration 0.0.10.0: "Above the minimum" explains the extra charging; there is nothing to set.
iAttrs.intelligent = payload10();
await push3();
const extraBlock = () => root3.querySelector('dialog .intelligent-extra');
check('"Above the minimum" explains the learned cheap price and has no inputs',
  extraBlock()?.getAttribute('data-state') === 'learned' && norm(extraBlock().querySelector('.intelligent-section-title')?.textContent) === 'Above the minimum' &&
  norm(extraBlock().querySelector('.intelligent-fact')?.textContent) ===
    'The car keeps charging up to its own limit in hours at or below ≈ €0.26 per kWh. That is what your cheap hours usually cost.' &&
  !extraBlock().querySelector('input, button, select') && !root3.querySelector('dialog [data-action="toggle-intelligent-top-up"]') &&
  !root3.querySelector('dialog .intelligent-top-up'));
check('the Intelligent page says "At least" and "extra while cheap", never "top-up"',
  all3('dialog .intelligent-vehicle .wizard-field-label').filter((node) => norm(node.textContent) === 'At least').length === 3 &&
  norm(root3.querySelector('dialog .intelligent-minimum-help')?.textContent) === 'Charges to at least this level by the ready-by time.' &&
  all3('dialog .intelligent-block').some((node) => /· extra while cheap$/.test(norm(node.textContent))) &&
  !/top.?up|topping/i.test(root3.querySelector('dialog')?.textContent || ''));
iAttrs.intelligent = payload11();
iAttrs.intelligent.top_up.waits_until = '2026-11-09T19:00:00+00:00';
await push3();
check('0.0.11.0: "Above the minimum" says the cars go on to their own limit, and when the prices are due',
  extraBlock()?.getAttribute('data-state') === 'car-limit' &&
  norm(extraBlock().querySelector('.intelligent-fact')?.textContent) ===
    'The minimum is what the plan guarantees by the ready-by time. After it each car goes on charging to its own charge limit in the cheapest hours that are left.'
    + ` Tomorrow’s prices are due about ${planTime('2026-11-09T19:00:00+00:00')}; the charging above the minimum is planned when they arrive.` &&
  !extraBlock().querySelector('input, button, select') &&
  all3('dialog .intelligent-block').some((node) => /· above the minimum$/.test(norm(node.textContent))) &&
  !/while cheap|top.?up|five days/i.test(root3.querySelector('dialog')?.textContent || ''));
iAttrs.intelligent = payload10();
await push3();
const minimumSelector = 'dialog .force-input[data-entity="number.v1_minimum"]';
const minimumInput3 = typeInto(minimumSelector, '91');
await rerender(); await rerender();
check('a re-render keeps the "At least" field being edited: same control, value and focus',
  !!minimumInput3 && root3.querySelector(minimumSelector) === minimumInput3 && minimumInput3.value === '91' && root3.activeElement === minimumInput3 &&
  el3._fieldShown.get('number.v1_minimum') === heldBefore.minimum);
iAttrs.intelligent.household.learned_days = 4;
await push3();
const minimumAfter = root3.querySelector(minimumSelector);
check('when something else on the page changes, the entry in progress is put back and focus stays in the field',
  /4 of 7 days/.test(root3.querySelector('dialog .intelligent-facts')?.textContent || '') && minimumAfter !== minimumInput3 &&
  minimumAfter?.value === '91' && root3.activeElement === minimumAfter);
typeInto(minimumSelector, heldBefore.minimum);
const readySelector = 'dialog .intelligent-time-input[data-entity="time.v1_ready_by"]';
const readyInput = typeInto(readySelector, '');
await rerender();
const partlyTyped = root3.querySelector(readySelector) === readyInput && root3.activeElement === readyInput && el3._fieldShown.get('time.v1_ready_by') === heldBefore.readyBy;
typeInto(readySelector, '04:45');
await rerender(); await rerender();
check('a re-render keeps the ready-by field being edited, also while its time is only partly typed',
  partlyTyped && root3.querySelector(readySelector) === readyInput && readyInput.value === '04:45' && root3.activeElement === readyInput);
typeInto(readySelector, heldBefore.readyBy);
readyInput.blur(); await wait(60);
check('re-rendering during an edit writes nothing to Home Assistant', iCalls.length === editCalls &&
  String(Number(iStates['number.v1_minimum'].state)) === heldBefore.minimum && iStates['time.v1_ready_by'].state.slice(0, 5) === heldBefore.readyBy &&
  String(Number(iStates['number.ic_top_up_price'].state)) === heldBefore.topUp);
iAttrs.intelligent.top_up = { enabled: false, price: null, source: 'learned' };
for (const charger of Object.values(iAttrs.intelligent.chargers)) Object.assign(charger, { top_up: false, extra_soc: null, blocks: charger.blocks.filter((block) => !block.top_up) });
await push3();
check('before the cheap price is learned, "Above the minimum" says when extra charging starts',
  extraBlock()?.getAttribute('data-state') === 'learning' &&
  norm(extraBlock().querySelector('.intelligent-fact')?.textContent) === 'Extra charging starts once five days of prices are known. Until then charging stops at the minimum.' &&
  !extraBlock().querySelector('input, button, select'));
el3._closeActiveDialog(); await el3.updateComplete; await wait();
check('while the cheap price is still being learned the tiles have no Extra row and no bar is marked cheap',
  same(rows3('smartevse_1').map((row) => row[0]), ['Guaranteed', 'Next', 'Charged', 'Total']) && same(rows3('smartevse_2').map((row) => row[0]), ['Guaranteed', 'Next', 'Charged', 'Total']) &&
  !barFills().some((fill) => fill.includes('--family-success')) && support3() === `Ready by ${t7}` && same(legend3(), ['Price', 'Planned', 'No price yet']));
iAttrs.intelligent = payload10();
Object.assign(iAttrs.intelligent.chargers.smartevse_1, { car_limit: 80 });
await push3();
check('a car whose own limit equals the minimum has no Extra row', same(rows3('smartevse_1').map((row) => row[0]), ['Guaranteed', 'Next', 'Charged', 'Total']));
iAttrs.intelligent = payload10();
await push3();

// One layout (0.6.0): the plan/classic split, its chooser in Settings and its stored choice are gone.
const storedKeys = [];
for (let index = 0; index < win.localStorage.length; index++) storedKeys.push(win.localStorage.key(index));
check('there is one layout: no layout class, chooser, stored choice or separate plan tile',
  !/layout-/.test(root3.querySelector('ha-card')?.getAttribute('class') || '') && !root3.querySelector('.ev-pod, .pod-head, .layout-choice, [data-action="set-layout"]') &&
  el3._layout === undefined && el3._setLayout === undefined && el3._layoutChoice === undefined &&
  !storedKeys.some((key) => /:layout/.test(key || '')));
// A `layout:` key from an older dashboard configuration is accepted and ignored.
root3.activeElement?.blur();
const elOld = document.createElement(tag);
let layoutError = null;
for (const value of ['classic', 'plan', 'anything', 7]) {
  try { elOld.setConfig({ ...config, layout: value }); } catch (error) { layoutError = error; }
}
elOld.hass = iHass;
document.body.appendChild(elOld);
await wait(60);
check('a layout: key in the card configuration is accepted and ignored',
  layoutError === null && !!elOld.shadowRoot.querySelector('.family-chart-frame.plan-chart') &&
  elOld.shadowRoot.querySelectorAll('.ev-node .charger-heading').length === 2 && elOld.shadowRoot.querySelectorAll('.ev-node .plan-stats').length === 2 &&
  !/layout-/.test(elOld.shadowRoot.querySelector('ha-card')?.getAttribute('class') || ''));
elOld.remove();
// The dialogs still open from the overview, which is a Lit template around HTML parts.
await click3('[data-action="open-force-wizard"]');
check('the hero opens the plan chooser and the overview goes inert under it',
  !!root3.querySelector('dialog') && !!root3.querySelector('dialog [data-action="open-settings"]') && root3.querySelector('.flow-stage')?.inert === true);
await click3('[data-action="open-settings"]');
check('Settings holds the charge policy and duty cycle, and no layout chooser',
  root3.querySelectorAll('dialog .setting-tile').length === 2 && !root3.querySelector('dialog .layout-choice, dialog [data-action="set-layout"]') &&
  !/layout/i.test(root3.querySelector('dialog')?.textContent || ''));
el3._closeActiveDialog(); await el3.updateComplete; await wait();
check('closing the dialog returns focus to the hero and frees the overview',
  root3.activeElement === root3.querySelector('[data-action="open-force-wizard"]') && root3.querySelector('.flow-stage')?.inert === false);
// Without a charge-policy or duty-cycle entity Settings would be empty, so it is not offered.
const configWithSettings = el3._config;
el3._config = { ...el3._config, charge_policy_entity: undefined, duty_cycle_entity: undefined };
await click3('[data-action="open-force-wizard"]');
check('Settings is offered only when there is something to set',
  !!root3.querySelector('dialog [data-action="choose-force-mode"]') && !root3.querySelector('dialog [data-action="open-settings"]'));
el3._closeActiveDialog(); await el3.updateComplete; await wait();
el3._config = configWithSettings;
// An unavailable controller (a restart): the tiles stay, there is no chart to draw.
const liveController = iStates['sensor.ctl'];
iStates['sensor.ctl'] = { state: 'unavailable', attributes: {} };
await push3();
check('an unavailable controller keeps the charger tiles and shows no chart or saving line',
  title3() === 'Controller unavailable' && !chart3() && all3('.ev-node .charger-heading').length === 2 && !root3.querySelector('.plan-saving, .plan-rows, .plan-stats, .plan-scale') &&
  all3('.ev-node .charger-status').every((node) => norm(node.textContent) === 'Unavailable'));
iStates['sensor.ctl'] = liveController;
await push3();
check('the chart and the plan facts return with the controller', !!svg3() && all3('.ev-node .plan-stats').length === 2 && all3('.ev-node .plan-scale').length === 2);

// ---- Plan chart states ----
// Force charge overrides the plan: what is planned is grey and reads "paused".
iAttrs.intelligent = payload10();
iAttrs.intelligent.overridden_by = 'force';
iAttrs.smartevse_1_state = 'Charging';
await at3('2026-11-09T21:30:00Z');
check('under Force charge the chart keeps the prices, greys the planned periods and says the plan is paused',
  same(lanes3().flatMap((lane) => lane.tones), ['muted', 'muted', 'muted', 'muted']) && !root3.querySelector('.family-chart-period-hatch') &&
  barFills().length === 7 && same(legend3(), ['Price', 'Paused by Force charge', 'No price yet']) && desc3().includes('Paused by Force charge') &&
  periodLine3().includes('XC40 paused') && !periodLine3().some((text) => /Charging|Planned/.test(text)) &&
  same(all3('.family-chart-legend [data-period]').map((node) => node.getAttribute('data-period')), ['muted']));
check('under Force charge the tiles show no plan rows (only what was charged) and no saving line',
  all3('.plan-row').every((row) => row.getAttribute('data-row') === 'charged') && !root3.querySelector('.plan-saving') && !root3.querySelector('.status-support') &&
  /Resumes after force charge/.test(root3.querySelector('[data-plan-group="intelligent"]')?.textContent || ''));
iAttrs.intelligent.overridden_by = null;
iStates['switch.force'].state = 'on';
await push3();
check('the Force charge switch pauses the chart even before the payload reports it',
  lanes3().every((lane) => lane.tones.every((tone) => tone === 'muted')) && same(legend3(), ['Price', 'Paused by Force charge', 'No price yet']) && !root3.querySelector('.plan-saving'));
iStates['switch.force'].state = 'off';
iAttrs.smartevse_1_state = 'Connected';
iAttrs.intelligent = payload10();
await at3('2026-11-09T18:00:00Z');
check('without Force charge nothing is muted', lanes3().every((lane) => !lane.tones.includes('muted')) && !desc3().includes('Paused') && !!root3.querySelector('.plan-saving'));
// The next start is in the hero and the Next rows (the totals row with "Next start" is gone). It
// never shows a past time while a block runs, whatever the overall status is.
iAttrs.intelligent.status = 'at_risk';
await at3('2026-11-09T21:30:00Z');
check('a block that runs before the charger reports Charging reads "Starting", never its past start time',
  title3() === 'Starting to charge Volvo XC40' && same(rows3('smartevse_1')[2], ['Next', 'Starting now']) && !/21:00/.test(title3()));
await at3('2026-11-09T22:30:00Z');
check('after a block has ended the hero names the next one, never a past time',
  title3() === 'Next charge at 23:00' && same(rows3('smartevse_1')[2], ['Next', 'Starts 23:00']));
iAttrs.smartevse_1_plug_state = 'Disconnected';
iAttrs.intelligent.next_charge = '2026-11-10T02:00:00+00:00';
await at3('2026-11-09T21:30:00Z');
check('a running block of a charger without a car is not announced',
  title3() === `Next charge ${el3._formatDateTime('2026-11-10T02:00:00+00:00')}` && same(rows3('smartevse_1').map((row) => row[0]), ['Last charge']));
iAttrs.smartevse_1_plug_state = 'Connected';
iAttrs.intelligent = payload10();
await at3('2026-11-09T18:00:00Z');
// Prices: negative values, forecast-only hours and slots shorter than an hour.
const withPrices = (prices, kinds = null) => priceSlots.map((slot, index) => ({ ...slot,
  kind: kinds ? kinds(index) : slot.kind, price: (kinds ? kinds(index) : slot.kind) === 'known' ? prices[index % prices.length] : slot.price }));
iAttrs.intelligent.slots = withPrices([0.2, -0.05, 0, 0.1, -0.1, 0.05, 0.15]);
await push3();
const times3x = () => all3('.family-chart-time').map((node) => node.textContent);
const axisLabels = () => all3('.family-chart-axis').map((node) => node.textContent);
check('negative and zero prices are drawn and mentioned in the description',
  barFills().length === 7 && priceBars().every((bar) => !/NaN|Infinity/.test(`${bar.getAttribute('y')} ${bar.getAttribute('height')}`)) &&
  desc3().includes('Some prices are below zero') && axisLabels().some((label) => /[-−]/.test(label)) &&
  greenBars().length === 7);
iAttrs.intelligent.slots = withPrices(cheapPrices, (index) => (index === 2 || index > 6 ? 'forecast' : 'known'));
await push3();
check('each run of hours without a published price is its own hatched band',
  all3('.family-chart-band').length === 2 && barFills().length === 6 && desc3().includes(`No published price from ${planTime('2026-11-09T20:00:00+00:00')}`));
iAttrs.intelligent.slots = withPrices(cheapPrices, () => 'forecast');
await push3();
check('with no published price at all the frame stays and says so',
  !!chart3() && !svg3() && !!chart3().querySelector('.family-chart-empty') && /No published prices yet/.test(chart3().textContent) &&
  rows3('smartevse_1').length === 5);
iAttrs.intelligent.slots = priceSlots10.flatMap((slot) => {
  const middle = new Date(Date.parse(slot.start) + 1800000).toISOString();
  return [{ ...slot, end: middle }, { ...slot, start: middle }];
});
await push3();
const evA = el3._evData(iAttrs, 'smartevse_1', 'SmartEVSE 1');
const evB = el3._evData(iAttrs, 'smartevse_2', 'SmartEVSE 2');
check('slots shorter than an hour become shorter steps', barFills().length === 14 && el3._planChartData(evA, evB).intervalMs === 1800000);
iAttrs.intelligent.slots = priceSlots10;
await push3();
check('the chart writes prices like the price card: four decimals with the unit, and a short axis',
  norm(chart3().querySelector('.family-chart-readout strong[data-series="price"]')?.textContent) === '0.3100 €/kWh' &&
  same(axisLabels().map(norm), ['0.00 €', '0.10 €', '0.20 €', '0.30 €', '0.40 €']));
// The unit is the price sensor's own when it has one.
iStates['sensor.current_price'].attributes.unit_of_measurement = 'c/kWh';
await push3();
check('the price sensor’s unit wins over the payload currency',
  norm(chart3().querySelector('.family-chart-readout strong[data-series="price"]')?.textContent) === '0.3100 c/kWh' && axisLabels().map(norm).includes('0.20 c'));
delete iStates['sensor.current_price'].attributes.unit_of_measurement;
await push3();
// Lanes: one per connected car, with a short label that tells the cars apart.
const labelsFor = (...names) => el3._laneLabels(names.map((name, index) => ({ key: `smartevse_${index + 1}`, name })));
check('lane labels: unidentified is "Other", same names fall back to the charger, long words are cut by code point',
  same(labelsFor('Unidentified vehicle', 'Volvo EX30'), ['Other', 'EX30']) &&
  same(labelsFor('Anna’s car', 'Mart’s car'), ['Anna’s', 'Mart’s']) &&
  same(labelsFor('Tesla Model 3'), ['Tesla']) && same(labelsFor('Volvo XC40'), ['XC40']) &&
  same(labelsFor('Family car', 'Family car'), ['EVSE 1', 'EVSE 2']) && same(labelsFor('', 'SmartEVSE 2'), ['EVSE 1', 'EVSE 2']) &&
  same(labelsFor('Volkswagen ID.4', '🚗🚙🚗🚙🚗🚙🚗🚙🚗 EX30'), ['Volksw…', '🚗🚙🚗🚙🚗🚙…']) &&
  same(labelsFor('Mustang'), ['Mustang']) && same(labelsFor('Polestar'), ['Polest…']));
delete iAttrs.intelligent.chargers.smartevse_2;
await push3();
check('a connected car without a plan entry keeps an empty lane',
  same(lanes3().map((lane) => [lane.label, lane.tones.length, lane.marker]), [['XC40', 2, true], ['EX30', 0, false]]) &&
  desc3().includes('Volvo EX30: no plan yet') && !desc3().includes('No vehicle connected') &&
  svg3().getAttribute('aria-label') === 'Charging plan' && same(rows3('smartevse_2'), [CH3]));
iAttrs.intelligent = payload10();
iAttrs.smartevse_1_available = false; iAttrs.smartevse_2_available = false;
await push3();
check('unreachable chargers leave a price chart that says so in words',
  !root3.querySelector('.family-chart-lane') && !chart3().querySelector('.family-chart-title') &&
  desc3().includes('Chargers unreachable') && !desc3().includes('No vehicle connected') && svg3().getAttribute('aria-label') === 'Electricity price');
iAttrs.smartevse_1_available = true; iAttrs.smartevse_2_available = true;
iAttrs.smartevse_2_error = 'RCM tripped';
await push3();
check('a connected charger with an error keeps its lane but not its plan',
  same(lanes3().map((lane) => [lane.tones.length, lane.marker]), [[2, true], [0, false]]) &&
  desc3().includes('Volvo EX30: charger error') && same(rows3('smartevse_2'), [CH3]) &&
  norm(root3.querySelector('.ev-node.smartevse_2 .charger-message')?.textContent) === 'RCM tripped');
iAttrs.smartevse_2_error = 'None';
await at3('2026-11-10T07:00:00Z');
// The chart is the price chart: it stays after the plan's hours, with the prices it has.
check('after the plan’s hours the chart stays with the prices of the new day', !!svg3() && barFills().length === 1 &&
  same(all3('.family-chart-time').map((node) => node.textContent), ['10 Nov, 0:00', '11 Nov, 0:00', '12 Nov, 0:00']));
const slotsBefore = iAttrs.intelligent.slots;
iAttrs.intelligent.slots = [];
await push3();
check('without any price and without plan hours there is no chart', !chart3() && el3._planChartData(evA, evB) === null && el3.getCardSize() === 15);
iAttrs.intelligent.slots = slotsBefore;
await at3('2026-11-09T18:00:00Z');
check('the chart returns for a current payload', !!svg3());
// Time labels and row times follow the profile's clock.
const times3 = () => all3('.family-chart-time').map((node) => node.textContent);
const times24 = times3();
iHass.locale.time_format = '12';
await push3();
check('time labels and row times use the 12-hour profile',
  times24.length > 2 && times24.every((label) => /^\d{1,2} Nov, \d{1,2}:\d{2}$/.test(label)) && times3().every((label) => /^\d{1,2} Nov, \d{1,2}:\d{2}\s?[AP]M$/i.test(label)) &&
  /^Starts 9:00\s?PM$/i.test(rows3('smartevse_1')[2][1]) && /^Next charge at 9:00\s?PM$/i.test(title3()));
iHass.locale.time_format = '24';
await push3();
// A re-render continues the ring animation instead of restarting it; the chart keeps its own.
iAttrs.wled_visuals = { off: { color: [12, 34, 56], fx: 0, sx: 0, ix: 0 }, idle: { color: [23, 67, 101], fx: 2, sx: 45, ix: 128 },
  error: { color: [211, 22, 33], fx: 2, sx: 60, ix: 200 }, charging: { color: [44, 199, 88], fx: 41, sx: 80, ix: 100 } };
iAttrs.smartevse_1_state = 'Charging';
await at3('2026-11-09T21:30:00Z');
const phase = (node) => node?.getAttribute('style') || '';
const expected = (node) => `animation-delay: -${Date.now() % Number(node?.getAttribute('data-anim-ms'))}ms;`;
// The glow under each car tile is the LED of its charger: its animation starts at the phase of a
// shared clock, so two cards (and a replaced tile) pulse together.
const glowOf = (key) => root3.querySelector(`.ev-node-wrap.${key} > .ev-glow`);
const ring1 = glowOf('smartevse_1');
const cardStyle = root3.querySelector('ha-card')?.getAttribute('style') || '';
const firstPhase = phase(ring1);
check('the LED glows start at the phase of a shared clock, using the CSS duration',
  !!ring1?.closest('.visual-charging') && ring1.getAttribute('data-anim-ms') === '2450' && cardStyle.includes('--sdc-led-charging-glow-duration: 2.45s') &&
  firstPhase === expected(ring1) &&
  glowOf('smartevse_2')?.getAttribute('data-anim-ms') === '2780' && cardStyle.includes('--sdc-led-idle-glow-duration: 2.78s') &&
  phase(glowOf('smartevse_2')) === expected(glowOf('smartevse_2')));
check('plan periods take the charger’s LED colours through the chart’s theme variables',
  cardStyle.includes('--family-chart-period-planned: rgba(23, 67, 101, 0.75);') && cardStyle.includes('--family-chart-period-active: rgb(44, 199, 88);') &&
  cardStyle.includes('--family-chart-period-active-duration: 2.45s;') && same(lanes3()[0].tones, ['active', 'planned']));
Date.now = () => Date.parse('2026-11-09T21:30:01.234Z');
await push3();
const samePhase = glowOf('smartevse_1') === ring1 && phase(ring1) === firstPhase;
iAttrs.smartevse_1_battery = '54';
await push3();
const ring2 = glowOf('smartevse_1');
check('an unchanged render keeps the running animation; a replaced element continues at the clock’s phase',
  samePhase && ring2 !== ring1 && phase(ring2) === expected(ring2) && phase(ring2) !== firstPhase);
iAttrs.smartevse_1_battery = '53';
iAttrs.smartevse_1_state = 'Connected';
delete iAttrs.wled_visuals;
await at3('2026-11-09T18:00:00Z');
check('without WLED colours the chart keeps the family period colours', !/family-chart-period/.test(root3.querySelector('ha-card')?.getAttribute('style') || ''));
// Escaping through the plan layout: names, error and status text never become markup.
const evil = '<img src=x onerror=alert(1)>"\'';
const evilName = `${evil} car`;
iAttrs.intelligent = payload10();
Object.assign(iAttrs.intelligent.chargers.smartevse_1, { vehicle_name: evilName });
Object.assign(iAttrs.intelligent.chargers.smartevse_2, { status: 'at_risk', projected_soc: 74, blocks: [], top_up: false, extra_soc: null, queue_after: 'smartevse_1' });
iAttrs.intelligent.vehicles.vehicle_1.name = evilName;
iAttrs.intelligent.currency = evil;
const evilBefore = { name: iAttrs.smartevse_1_connected_ev, state: iAttrs.smartevse_2_state };
Object.assign(iAttrs, { smartevse_1_connected_ev: evilName, smartevse_2_state: evil });
await push3();
const overview3 = root3.querySelector('.flow-stage');
const gauge3 = root3.querySelector('.ev-node.smartevse_1 .battery-meter');
const names3 = (node) => (node ? node.getAttributeNames().map((name) => name.toLowerCase()).sort().join(',') : '');
const noMarkup = () => !overview3.querySelector('img') && ![...overview3.querySelectorAll('*')].some((node) => node.hasAttribute('onerror') || node.hasAttribute('src'));
check('markup in vehicle names and the currency stays text in the tiles, rows, hero and chart',
  noMarkup() && root3.querySelector('.ev-node.smartevse_1 .vehicle-name')?.textContent === evilName &&
  gauge3?.getAttribute('aria-label') === `${evilName} battery` &&
  names3(gauge3) === 'aria-label,aria-valuemax,aria-valuemin,aria-valuenow,aria-valuetext,class,role' &&
  root3.querySelector('.family-chart-lane-label')?.textContent === '<img' && desc3().includes(`${evilName}: `) &&
  same(rows3('smartevse_2')[0], ['Next', `After ${evilName}`]) && title3() === 'Next charge at 21:00' && support3() === `${evilName} by ${t7}` &&
  !!svg3() && barFills().length === 7 && same(legend3(), ['Price', 'Planned', 'No price yet']) && periodLine3().every((text) => !/[<>]/.test(text) || text.startsWith('<img')));
Object.assign(iAttrs, { smartevse_2_error: `Fault ${evil}`, charge_reason: evil, controller_error: evil });
iAttrs.intelligent.status = evil;
iAttrs.intelligent.chargers.smartevse_1.status = evil;
await push3();
check('markup in error and status text stays text',
  noMarkup() && root3.querySelector('.ev-node.smartevse_2 .charger-message')?.textContent === `Fault ${evil}` &&
  same(rows3('smartevse_2'), [CH3]) && root3.querySelectorAll('.ev-node').length === 2 && root3.querySelectorAll('.ev-node .battery-meter').length === 2);
// The same names and states in the charger details dialog and in the Charged control.
iAttrs.intelligent.chargers.smartevse_1.status = 'planned';
iAttrs.charging_costs.chargers.smartevse_1.session.started_at = evil;
await push3();
const chargedLabel = charged3('smartevse_1')?.getAttribute('aria-label') || '';
await click3('.ev-node.smartevse_1 > .charger-details');
const dialog3 = root3.querySelector('dialog');
check('markup in names, states and times stays text in the charger details and the Charged control',
  !!dialog3 && !dialog3.querySelector('img') && ![...dialog3.querySelectorAll('*')].some((node) => node.hasAttribute('onerror') || node.hasAttribute('src')) &&
  same(detail3('car')[0], ['Vehicle', evilName]) && same(detail3('charge'), [CH3]) &&
  chargedLabel === `SmartEVSE 1 charged ${CH3[1]}; open history` && same(sections3(), ['car', 'plan', 'charge', 'charger', 'planner']));
await click3('.ev-node.smartevse_2 > .charger-details');
await closeDialog3();
iAttrs.charging_costs.chargers.smartevse_1.session.started_at = '2026-11-08T21:00:00Z';
Object.assign(iAttrs, { smartevse_1_connected_ev: evilBefore.name, smartevse_2_error: 'None', smartevse_2_state: evilBefore.state,
  charge_reason: 'intelligent_waiting_for_planned_slot', controller_error: null });
iAttrs.intelligent = payload10();
await push3();
// CSS: the card's own rules for the tiles and facts, and the shared chart styles in the element.
const css3 = (root3.querySelector('style')?.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
const podRules = [...css3.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((rule) => rule[1].includes('.ev-node'));
const ruleOf = (selector) => [...css3.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((rule) => rule[1].split(',').some((part) => part.trim() === selector)).map((rule) => rule[2]).join(' ');
check('two tiles sit side by side on a wide card and stack on a phone, and tile text never wraps one letter per line',
  /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(ruleOf('.ev-row')) &&
  /@container charging-overview \(max-width: 540px\)\s*\{\s*\.ev-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css3) &&
  ['.charger-name', '.vehicle-name', '.charger-status'].every((selector) => /overflow-wrap:\s*break-word/.test(ruleOf(selector)) && !/overflow-wrap:\s*anywhere/.test(ruleOf(selector))) &&
  /min-width:\s*0/.test(ruleOf('.charger-copy')) && !/\.ev-pod|\.pod-|\.layout-|\.session-cost/.test(css3));
check('plan rows keep their label on one line and the hand-drawn timeline styles are gone',
  /\.plan-row dt\s*\{[^}]*white-space:\s*nowrap/.test(css3) && /\.plan-row dd\s*\{[^}]*overflow-wrap:\s*break-word/.test(css3) &&
  !/\.tl-|\.plan-timeline|\.plan-legend|\.pod-ring|\.pod-gauge|\.plan-totals/.test(css3) &&
  /\.plan-rows\s*\{[^}]*grid-template-columns:\s*repeat\(2,/.test(css3) &&
  /container:\s*charger-facts\s*\/\s*inline-size/.test(ruleOf('.charger-plan')) &&
  /@container charger-facts \(max-width: 250px\)\s*\{\s*\.plan-rows\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css3));
const elementCss = (customElements.get(tag).elementStyles || []).map((sheet) => sheet.cssText || '').join('\n');
check('the element carries the shared chart styles', /\.family-chart-frame\s*\{/.test(elementCss) && /\.family-chart-period\[data-tone="extra"\]/.test(elementCss));
// Without Intelligent charging there is no plan to draw: tiles only (with and without slots).
iAttrs.intelligent = { ...payload10(), enabled: false };
iStates['switch.ic'].state = 'off';
await push3();
check('with Intelligent off the plan layout shows the car tiles but no chart, plan rows or saving line, even when slots are still published',
  iAttrs.intelligent.slots.length === 13 && !chart3() && !root3.querySelector('.plan-saving') &&
  all3('.plan-row').every((row) => row.getAttribute('data-row') === 'charged') && all3('.ev-node .battery-meter').length === 2 &&
  root3.querySelectorAll('.ev-node').length === 2 && !root3.querySelector('.status-support'));
iStates['switch.ic'].state = 'on';
// One car: the charger without a car is a short one-line tile under the car tile.
iAttrs.intelligent = payload10();
delete iAttrs.intelligent.chargers.smartevse_2;
const plugBefore = [iAttrs.smartevse_1_plug_state, iAttrs.smartevse_2_plug_state];
iAttrs.smartevse_2_plug_state = 'Disconnected';
await push3();
check('with one car the charger without a car is the compact tile and the chart has one lane',
  !!root3.querySelector('.ev-node.smartevse_2.compact') && !root3.querySelector('.ev-node.smartevse_1.compact') &&
  !root3.querySelector('.ev-node.smartevse_2 .battery-meter, .ev-node.smartevse_2 .charger-details, .ev-node.smartevse_2 .battery-value') &&
  same(rows3('smartevse_2').map((row) => row[0]), ['Last charge']) &&
  lanes3().length === 1 && svg3().getAttribute('viewBox') === '0 0 360 178' && el3.getCardSize() === 18);
// No car connected: the chart shows prices only; each charger is a short one-line tile.
iAttrs.intelligent = { ...payload10(), status: 'no_ev', chargers: {}, next_charge: null, connected_count: 0 };
iAttrs.smartevse_1_plug_state = 'Disconnected'; iAttrs.smartevse_2_plug_state = 'Disconnected';
iAttrs.charge_reason = 'intelligent_waiting_for_connected_ev';
await push3();
const emptyPods = [...root3.querySelectorAll('.ev-node.compact')];
check('chargers without a car are compact tiles with their name, state and last charge',
  emptyPods.length === 2 && !root3.querySelector('.ev-node .battery-meter, .ev-node .vehicle-name, .ev-node .charger-details') &&
  emptyPods.every((pod) => !!pod.querySelector('.charger-heading .charger-icon') && /^SmartEVSE [12]$/.test(norm(pod.querySelector('.charger-name')?.textContent)) &&
    norm(pod.querySelector('.charger-status')?.textContent) === 'No vehicle connected' &&
    same([...pod.querySelectorAll('.plan-row')].map((row) => row.getAttribute('data-row')), ['last'])));
check('with no car the chart is named "Electricity price", has no lanes and the hero waits for a vehicle',
  svg3()?.getAttribute('aria-label') === 'Electricity price' && !chart3().querySelector('.family-chart-title') && !root3.querySelector('.family-chart-lane') &&
  same(legend3(), ['Price', 'No price yet']) && desc3().startsWith('Electricity prices until ') && desc3().includes('No vehicle connected') &&
  svg3().getAttribute('viewBox') === '0 0 360 150' && el3.getCardSize() === 13 &&
  title3() === 'Waiting for a vehicle' && !root3.querySelector('.status-support'));
[iAttrs.smartevse_1_plug_state, iAttrs.smartevse_2_plug_state] = plugBefore;
iAttrs.charge_reason = 'intelligent_waiting_for_planned_slot';

// ---- The full price chart (0.7.0): the hourly price lists of the price integration, and under
// them what each charger charged since midnight (recorder history) and what is planned. ----
const H = 3600000;
const DAY0 = Date.parse('2026-11-09T00:00:00Z');
const priceList = (start, price) => ({ state: 'ok', last_updated: new Date(FIXED_NOW).toISOString(), attributes: { hourly_prices: Array.from({ length: 24 }, (_, hour) => ({
  start_time: new Date(start + hour * H).toISOString(), end_time: new Date(start + (hour + 1) * H).toISOString(), nord_pool_price: 0.01, actual_price: price(hour) })) } });
iAttrs.intelligent = payload10();
// Beside the configured price sensor ("sensor.current_price"), as the integration finds them.
iStates['sensor.hourly_prices_yesterday'] = priceList(DAY0 - 24 * H, () => 0.9);
iStates['sensor.hourly_prices_today'] = priceList(DAY0, (hour) => 0.1 + hour / 100);
await at3('2026-11-09T18:00:00Z');
check('with the hourly price lists the chart shows the whole day from midnight, past hours included',
  barFills().length === 24 && Math.abs(barBox(priceBars()[0]).x - 8) < 1 &&
  // Cheap is at or below 0.26: the hours 00:00 to 16:00. Past, current and coming hours differ.
  greenBars().length === 17 && barFills()[0] === '#bbf7d0' && barFills()[17] === '#bfdbfe' && barFills()[18] === '#3b82f6' && barFills()[19] === '#93c5fd' &&
  norm(chart3().querySelector('.family-chart-readout')?.textContent) === '9 Nov, 18:00 0.2800 €/kWh' &&
  // The plan runs past the listed prices: its hours from 01:00 are the hatched band.
  all3('.family-chart-band').length === 1 && same(legend3(), ['Price', 'Planned', 'Extra', 'No price yet']));
iStates['sensor.real_electricity_price_hourly_prices_tomorrow'] = priceList(DAY0 + 24 * H, (hour) => 0.3 + hour / 100);
await push3();
check('tomorrow’s list (the shared default entity) fills the second day and ends the band',
  barFills().length === 48 && all3('.family-chart-band').length === 0 && same(legend3(), ['Price', 'Planned', 'Extra']) &&
  !desc3().includes('No published price'));
el3.setConfig({ ...config, price_today_entity: 'sensor.other_prices' });
iStates['sensor.other_prices'] = priceList(DAY0, () => 0.5);
await push3();
check('price_today_entity names another list', barFills().length === 48 && greenBars().length === 0 &&
  norm(chart3().querySelector('.family-chart-readout')?.textContent) === '9 Nov, 18:00 0.5000 €/kWh');
delete iStates['sensor.other_prices'];

// What each charger charged: the recorder history of its state sensor, read once per window.
const wsCalls = [];
const at = (iso) => Date.parse(iso) / 1000;
let history = () => ({
  'sensor.s1_state': [{ s: 'Ready to Charge', lu: at('2026-11-09T00:00:00Z') }, { s: 'Charging', lu: at('2026-11-09T00:00:12Z') },
    { s: 'Charging Stopped', lu: at('2026-11-09T00:29:00Z') }, { s: 'Connected to EV', lu: at('2026-11-09T02:00:00Z') },
    { s: 'Charging', lu: at('2026-11-09T02:00:10Z') }, { s: 'unavailable', lu: at('2026-11-09T03:00:00Z') },
    { s: 'Charging', lu: at('2026-11-09T03:00:20Z') }, { s: 'Charging Stopped', lu: at('2026-11-09T04:43:00Z') }],
  'sensor.s2_state': [{ s: 'Ready to Charge', lu: at('2026-11-09T00:00:00Z') }, { s: 'Charging', lu: at('2026-11-09T06:00:00Z') },
    { s: 'Stop Charging', lu: at('2026-11-09T06:23:00Z') }, { s: 'Charging Stopped', lu: at('2026-11-09T06:23:10Z') }],
});
iHass.callWS = (message) => { wsCalls.push(message); return Promise.resolve(history()); };
iStates['sensor.s1_state'] = { state: 'Ready to Charge', last_changed: '2026-11-09T04:43:00.000Z', attributes: {} };
iStates['sensor.s2_state'] = { state: 'Ready to Charge', last_changed: '2026-11-09T06:23:10.000Z', attributes: {} };
el3.setConfig({ ...config, smartevse_1_state_entity: 'sensor.s1_state', smartevse_2_state_entity: 'sensor.s2_state' });
await push3(); await wait(60);
const periods3 = (key) => all3(`.family-chart-lane[data-lane="${key}"] .family-chart-period`);
const xOf = (iso) => 8 + (Date.parse(iso) - DAY0) / H * hourPx();
check('the history of the charger state sensors is read once, from midnight to now, without attributes',
  wsCalls.length === 1 && wsCalls[0].type === 'history/history_during_period' &&
  wsCalls[0].start_time === '2026-11-09T00:00:00.000Z' && wsCalls[0].end_time === '2026-11-09T18:00:00.000Z' &&
  same(wsCalls[0].entity_ids, ['sensor.s1_state', 'sensor.s2_state']) && wsCalls[0].minimal_response === true &&
  wsCalls[0].no_attributes === true && wsCalls[0].significant_changes_only === false);
check('each lane shows what the charger charged (slim, "Charged") left of now and the plan right of it',
  same(lanes3().map((lane) => lane.tones), [['done', 'done', 'planned', 'planned'], ['done', 'planned', 'extra']]) &&
  same(legend3(), ['Price', 'Charged', 'Planned', 'Extra']) &&
  // A pause of twenty seconds (one missed poll) does not split the 02:00 charge.
  Math.abs(Number(periods3('smartevse_1')[1].getAttribute('x')) - xOf('2026-11-09T02:00:10Z')) < 0.01 &&
  Math.abs(Number(periods3('smartevse_1')[1].getAttribute('width')) - (xOf('2026-11-09T04:43:00Z') - xOf('2026-11-09T02:00:10Z'))) < 0.01 &&
  periods3('smartevse_1')[0].getAttribute('height') === '6' && periods3('smartevse_1')[2].getAttribute('height') === '10' &&
  desc3().includes(`Volvo XC40: 21:00–22:00, 23:00–${planTime('2026-11-10T00:00:00+00:00')}; charged 0:00–0:29, 2:00–4:43`) &&
  desc3().includes('; charged 6:00–6:23'));
await push3(); await wait(60);
check('an unchanged state does not read the history again', wsCalls.length === 1);
// The car charges now: the live state opens the period; the running block is "Charging" from
// where the charger began, and a state change since the last read reads the history again.
iAttrs.intelligent = payload10();
Object.assign(iAttrs, { smartevse_1_state: 'Charging', charge_reason: 'intelligent_charging' });
iAttrs.intelligent.chargers.smartevse_1.status = 'charging';
iAttrs.intelligent.chargers.smartevse_1.blocks[0].start = '2026-11-09T21:15:00+00:00';
iStates['sensor.s1_state'] = { state: 'Charging', last_changed: '2026-11-09T20:30:00.000Z', attributes: {} };
await at3('2026-11-09T21:30:00Z'); await wait(60);
check('a running block is one "Charging" period from where the charger began to the block’s end',
  same(lanes3()[0].tones, ['done', 'done', 'active', 'planned']) &&
  Math.abs(Number(periods3('smartevse_1')[2].getAttribute('x')) - xOf('2026-11-09T20:30:00Z')) < 0.01 &&
  Math.abs(Number(periods3('smartevse_1')[2].getAttribute('width')) - (xOf('2026-11-09T22:00:00Z') - xOf('2026-11-09T20:30:00Z'))) < 0.01 &&
  same(legend3(), ['Price', 'Charged', 'Charging', 'Planned', 'Extra']) && periodLine3().includes('XC40 Charging') &&
  wsCalls.length === 2 && wsCalls[1].end_time === '2026-11-09T21:30:00.000Z');
// Force charge: the charging is real, the plan is paused.
iAttrs.intelligent.overridden_by = 'force';
await push3();
check('under Force charge what charges now stays "Charging" and the plan after now is grey',
  same(lanes3()[0].tones, ['done', 'done', 'active', 'muted', 'muted']) &&
  Math.abs(Number(periods3('smartevse_1')[2].getAttribute('width')) - (xOf('2026-11-09T21:30:00Z') - xOf('2026-11-09T20:30:00Z'))) < 0.01 &&
  Math.abs(Number(periods3('smartevse_1')[3].getAttribute('x')) - xOf('2026-11-09T21:30:00Z')) < 0.01 &&
  same(legend3(), ['Price', 'Charged', 'Charging', 'Paused by Force charge']));
iAttrs.intelligent.overridden_by = null;
// The charger stopped after the last read: the open period ends at the state's last change.
Object.assign(iAttrs, { smartevse_1_state: 'Connected', charge_reason: 'intelligent_waiting_for_planned_slot' });
iAttrs.intelligent.chargers.smartevse_1.blocks.shift();
iStates['sensor.s1_state'] = { state: 'Charging Stopped', last_changed: '2026-11-09T21:36:00.000Z', attributes: {} };
await at3('2026-11-09T21:36:05Z'); await wait(60);
check('a charge that just ended is "Charged" up to the state change, before the history is read again',
  wsCalls.length === 2 && same(lanes3()[0].tones, ['done', 'done', 'done', 'planned']) &&
  Math.abs(Number(periods3('smartevse_1')[2].getAttribute('width')) - (xOf('2026-11-09T21:36:00Z') - xOf('2026-11-09T20:30:00Z'))) < 0.01);
// A charger without a car keeps a lane for what it charged today, named after its last charge.
iAttrs.smartevse_2_plug_state = 'Disconnected';
await push3();
check('a charger whose car left keeps its lane with what it charged, and no plan',
  same(lanes3().map((lane) => [lane.label, lane.tones, lane.marker]), [['XC40', ['done', 'done', 'done', 'planned'], true], ['EX30', ['done'], false]]) &&
  desc3().includes('Volvo EX30: charged 6:00–6:23'));
iAttrs.smartevse_1_plug_state = 'Disconnected';
iAttrs.intelligent = { ...payload10(), status: 'no_ev', chargers: {}, next_charge: null, connected_count: 0 };
await push3();
check('with no car connected the lanes show the night’s charging under the prices',
  same(lanes3().map((lane) => lane.tones), [['done', 'done', 'done'], ['done']]) && svg3().getAttribute('aria-label') === 'Charging plan' &&
  !desc3().includes('No vehicle connected') && same(legend3(), ['Price', 'Charged']));
[iAttrs.smartevse_1_plug_state, iAttrs.smartevse_2_plug_state] = plugBefore;
iAttrs.intelligent = payload10();
// A new day is a new window: the history is read again; a failed read leaves the plan alone.
iHass.callWS = (message) => { wsCalls.push(message); return Promise.reject(new Error('no recorder')); };
iStates['sensor.s1_state'] = { state: 'Ready to Charge', last_changed: '2026-11-09T21:36:00.000Z', attributes: {} };
await at3('2026-11-10T00:30:00Z'); await wait(60);
check('a failed history read keeps the chart and the plan, and is not repeated at once',
  wsCalls.length === 3 && wsCalls[2].start_time === '2026-11-10T00:00:00.000Z' && !!svg3() &&
  lanes3().every((lane) => !lane.tones.includes('done')) && lanes3()[1].tones.length > 0);
await push3(); await wait(60);
check('the failed read is retried only after a minute', wsCalls.length === 3);
await at3('2026-11-10T00:31:30Z'); await wait(60);
check('and then it is', wsCalls.length === 4);
delete iHass.callWS;
el3.setConfig(config);
await at3('2026-11-09T18:00:00Z');
check('without the state sensors or a websocket the chart is the plan alone', !!svg3() && same(lanes3().map((lane) => lane.tones), [['planned', 'planned'], ['planned', 'extra']]));
for (const id of ['sensor.hourly_prices_yesterday', 'sensor.hourly_prices_today', 'sensor.real_electricity_price_hourly_prices_tomorrow', 'sensor.s1_state', 'sensor.s2_state']) delete iStates[id];

// The pure history helpers of the bundle.
const { chargedIntervals, joinIntervals, withLiveState } = customElements.get(tag).historyHelpers;
const T0 = DAY0, T = (minutes) => T0 + minutes * 60000;
check('chargedIntervals: Charging rows become ranges, clipped to the window; the last one is open',
  same(chargedIntervals([{ s: 'Charging', lu: (T0 - 600000) / 1000 }, { s: 'Charging Stopped', lu: T(30) / 1000 }, { s: 'Charging', lu: T(120) / 1000 }], T0, T(180)),
    [{ start: T0, end: T(30) }, { start: T(120), end: T(180), open: true }]) &&
  // Plain history rows (ISO strings, `state`), unsorted, with rubbish in between.
  same(chargedIntervals([{ state: 'Connected', last_changed: new Date(T(50)).toISOString() }, null, { state: 'Charging', last_changed: new Date(T(10)).toISOString() }, { s: 'Charging' }], T0, T(180)),
    [{ start: T(10), end: T(50) }]) &&
  // `lc` (last changed) wins over `lu` (last updated).
  same(chargedIntervals([{ s: 'Charging', lu: T(20) / 1000, lc: T(5) / 1000 }, { s: 'Off', lu: T(40) / 1000 }], T0, T(60)), [{ start: T(5), end: T(40) }]) &&
  same(chargedIntervals(undefined, T0, T(60)), []) && same(chargedIntervals([], T0, T(60)), []));
check('joinIntervals: gaps of up to a minute join, longer ones stay',
  same(joinIntervals([{ start: T(10), end: T(20) }, { start: T(20.5), end: T(30) }, { start: T(32), end: T(40), open: true }, { start: T(5), end: T(5) }]),
    [{ start: T(10), end: T(30) }, { start: T(32), end: T(40), open: true }]) &&
  same(joinIntervals([{ start: T(10), end: T(40) }, { start: T(15), end: T(20), open: true }]), [{ start: T(10), end: T(40) }]));
check('withLiveState: an open range runs to now while charging, ends at the last change when stopped; new charging is added',
  same(withLiveState([{ start: T(10), end: T(60), open: true }], { state: 'Charging', last_changed: new Date(T(10)).toISOString() }, T0, T(90)), [{ start: T(10), end: T(90), open: true }]) &&
  same(withLiveState([{ start: T(10), end: T(60), open: true }], { state: 'Charging Stopped', last_changed: new Date(T(70)).toISOString() }, T0, T(90)), [{ start: T(10), end: T(70) }]) &&
  same(withLiveState([{ start: T(10), end: T(60), open: true }], { state: 'Charging Stopped', last_changed: new Date(T(40)).toISOString() }, T0, T(90)), [{ start: T(10), end: T(60) }]) &&
  same(withLiveState([{ start: T(10), end: T(20) }], { state: 'Charging', last_changed: new Date(T(80)).toISOString() }, T0, T(90)), [{ start: T(10), end: T(20) }, { start: T(80), end: T(90), open: true }]) &&
  // Charging since before the window: from the window's start.
  same(withLiveState([], { state: 'Charging', last_changed: new Date(T0 - 3600000).toISOString() }, T0, T(90)), [{ start: T0, end: T(90), open: true }]) &&
  same(withLiveState([], undefined, T0, T(90)), []));
el3.remove();
Date.now = realDateNow;

console.log(ok ? '\nSMOKE TEST OK' : '\nSMOKE TEST FAILED');
process.exit(ok ? 0 : 1);
