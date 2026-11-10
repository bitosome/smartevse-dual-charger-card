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
check('session estimate appears underneath the battery reading',
  /4[.,]28/.test(root.querySelector('.smartevse_1 .charger-totals .session-cost')?.textContent || ''));
click('.smartevse_1 .session-cost');await new Promise(r=>setTimeout(r,30));
check('cost shortcut opens charging history directly with its charger expanded',
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
  /1[.,]25/.test(root.querySelector('.session-cost')?.textContent || '') &&
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
click('.smartevse_1 .session-cost'); await el.updateComplete;
click('dialog .family-dialog-header [title="Close"]'); await el.updateComplete;
check('a non-focusing touch history launch returns focus to its actual cost button',
  root.activeElement?.matches('.smartevse_1 .session-cost'));
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
check('cost history button includes the charger and formatted estimate in its accessible name',
  root.querySelector('.smartevse_1 .session-cost')?.getAttribute('aria-label')?.includes(el._costLabel(sampleRecord)));
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
check('without the Intelligent switch the base card shows no Intelligent tile, group or plan line',
  !root.querySelector('[data-mode="intelligent"]') && !root.querySelector('[data-plan-group="intelligent"]') &&
  !root.querySelector('.charger-plan'));

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
const planText = (key) => [...root2.querySelectorAll(`.ev-node.${key} .charger-plan-line`)].map((node) => node.textContent.trim());

// Missing switch: the payload alone does not enable the feature.
await openPlan2();
check('Intelligent stays hidden while its switch entity is missing, even with a payload',
  root2.querySelectorAll('[data-action="choose-force-mode"]').length === 2 &&
  !root2.querySelector('[data-mode="intelligent"]') && !root2.querySelector('.charger-plan'));
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
check('a charging tile reads its target and the end of the current block',
  planText('smartevse_1')[0] === `80% by ${t7} · charging until 22:00` && planText('smartevse_1')[1] === '≈ €4.91 · saving ≈ €1.29');
iAttrs.smartevse_1_state = 'Ready to Charge'; iAttrs.active_smartevse_raw = ''; iAttrs.charge_allowed = false;
iAttrs.charge_reason = 'intelligent_waiting_for_planned_slot';
iAttrs.intelligent = basePayload();
iStates['switch.force'].state = 'on';
await push();
const groupOrder = [...root2.querySelectorAll('.status-pill-group')].map((node) => node.dataset.planGroup);
check('Force sorts first and the Intelligent group shows only "Resumes after force charge"',
  groupOrder[0] === 'force-charge' && groupOrder[1] === 'intelligent' &&
  /Resumes after force charge/.test(text2('[data-plan-group="intelligent"]')) &&
  !root2.querySelector('[data-plan-group="intelligent"] .status-pill') && planText('smartevse_1').length === 0);
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
  planText('smartevse_2')[0] === `Below 80% at ${t7} · ≈ 40% · after Volvo XC40`);
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

// Charger tile plan lines and money rules.
check('a planned tile states target and time, then cost and saving',
  JSON.stringify(planText('smartevse_1')) === JSON.stringify([`80% by ${t7} · 21:00–22:00 +1 more`, '≈ €4.91 · saving ≈ €1.29']));
check('a plan starting tomorrow names the day; a saving under €0.10 is hidden',
  planText('smartevse_2')[0] === `80% by ${t7} · starts ${el2._formatDateTime('2026-11-10T02:00:00+00:00')} +1 more` &&
  planText('smartevse_2')[1] === '≈ €1.19');
const meter = root2.querySelector('.ev-node.smartevse_1 .battery-meter');
check('the battery meter marks the effective minimum and speaks it',
  !!meter?.querySelector('.family-level-target') && meter.getAttribute('aria-valuetext') === '53%, minimum 80%');
check('plan lines add no second amount to the totals column and no new glow',
  !root2.querySelector('.charger-totals .charger-plan') && !root2.querySelector('.charger-plan .glow-under'));
const tileCases = [
  ['identifying', (c) => { c.status = 'identifying'; }, ['Identifying vehicle']],
  ['excluded', (c) => { c.status = 'excluded'; }, ['Not planned · charge policy']],
  ['car timer', (c) => { c.car_timer = true; }, ['Car’s own charging timer is on']],
  ['car limit', (c) => { c.target = 75; c.car_limit = 75; c.limited_by_car = true; c.blocks = c.blocks.slice(0, 1); }, [`75% by ${t7} (car limit) · 21:00–22:00`, '≈ €4.91 · saving ≈ €1.29']],
  ['reached', (c) => { c.status = 'reached'; c.soc = 80; c.blocks = []; c.saving = 1.25; }, ['80% reached', '≈ €4.91 · saved ≈ €1.25']],
  ['top-up', (c) => { c.status = 'reached'; c.top_up = true; c.blocks = [{ start: '2026-11-10T03:00:00+00:00', end: '2026-11-10T04:00:00+00:00', top_up: true }]; }, [`Topping up to 90% · starts ${el2._formatDateTime('2026-11-10T03:00:00+00:00')}`, '≈ €4.91 · saved ≈ €1.29']],
  ['forecast', (c) => { c.includes_forecast = true; }, [`80% by ${t7} · 21:00–22:00 +1 more`, '≈ €4.91 forecast']],
  ['partial', (c) => { c.partial = true; }, [`80% by ${t7} · 21:00–22:00 +1 more`]],
  ['unidentified estimate', (c) => { c.vehicle = null; c.vehicle_name = null; c.settings_key = 'other'; c.soc = null; c.estimated = true; c.need_kwh = 30; }, [`Unidentified vehicle · ≈ 30\u202fkWh by ${t7} · 21:00–22:00 +1 more`]],
  ['unidentified estimate, minimum 100%', (c) => { c.vehicle = null; c.vehicle_name = null; c.settings_key = 'other'; c.soc = null; c.estimated = true; c.need_kwh = 30; c.minimum = 100; c.target = 100; }, [`Unidentified vehicle · ≈ 30\u202fkWh by ${t7} · 21:00–22:00 +1 more`]],
  ['estimate at risk', (c) => { c.soc = null; c.estimated = true; c.need_kwh = 30; c.status = 'at_risk'; c.projected_soc = null; }, [`Not enough time for ≈ 30\u202fkWh by ${t7} · 21:00–22:00 +1 more`]],
  ['estimate catching up', (c) => { c.soc = null; c.estimated = true; c.need_kwh = 8.4; c.status = 'catch_up'; c.projected_soc = null; }, [`Catching up ≈ 8.4\u202fkWh after ${t7} · 21:00–22:00 +1 more`]],
  ['at risk, charging', (c) => { c.status = 'at_risk'; c.projected_soc = 77; }, [`Below 80% at ${t7} · ≈ 77% · charging now`, '≈ €4.91 · saving ≈ €1.29'], { smartevse_1_state: 'Charging' }],
  // Ready-by moved to 06:00 within two hours of the 07:00 deadline: the plan still targets 07:00.
  ['deadline kept after a late ready-by edit', (c) => { c.ready_by = '06:00'; }, [`80% by ${t7} · 21:00–22:00 +1 more`, '≈ €4.91 · saving ≈ €1.29']],
  ['at risk against the kept deadline', (c) => { c.ready_by = '06:00'; c.status = 'at_risk'; c.projected_soc = 73; }, [`Below 80% at ${t7} · ≈ 73% · 21:00–22:00 +1 more`, '≈ €4.91 · saving ≈ €1.29']],
  ['done below the target', (c) => { c.status = 'done'; c.soc = 76; c.blocks = []; }, ['Charging complete', '≈ €4.91 · saved ≈ €1.29']],
];
const wrongTiles = [];
for (const [name, mutate, expected, attrs = {}] of tileCases) {
  iAttrs.intelligent = basePayload();
  mutate(iAttrs.intelligent.chargers.smartevse_1);
  Object.assign(iAttrs, { smartevse_1_state: 'Ready to Charge' }, attrs);
  await push();
  if (JSON.stringify(planText('smartevse_1')) !== JSON.stringify(expected)) wrongTiles.push(`${name}: ${JSON.stringify(planText('smartevse_1'))}`);
}
check('each plan status reads as its target · time clause with the money rules', wrongTiles.length === 0);
if (wrongTiles.length) console.log(wrongTiles);
iAttrs.smartevse_1_state = 'Ready to Charge';
iAttrs.intelligent = basePayload();
iAttrs.smartevse_1_error = 'Ground fault';
await push();
check('a charger error hides its plan line', planText('smartevse_1').length === 0 && planText('smartevse_2').length === 2);
iAttrs.smartevse_1_error = 'None';

// Disconnected tile: last realised saving until the next plug-in; History shows it too.
iAttrs.smartevse_2_plug_state = 'Disconnected'; iAttrs.smartevse_2_state = 'Disconnected';
iAttrs.intelligent.chargers.smartevse_2 = null;
await push();
check('a disconnected tile shows one line with the last realised saving',
  JSON.stringify(planText('smartevse_2')) === JSON.stringify(['Last charge saved ≈ €1.25']) &&
  root2.querySelector('.ev-node.smartevse_2')?.classList.contains('compact'));
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
  if (JSON.stringify(planText('smartevse_2')) !== JSON.stringify(tile) || el2._historySaving(ex30Record) !== history) {
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
check('the page labels the saving baseline once and shows the price horizon and learning facts',
  (page.textContent.match(/Saving vs charging at plug-in/g) || []).length === 1 &&
  page.textContent.includes(`Prices until ${el2._formatDateTime('2026-11-10T01:00:00+00:00')}`) &&
  page.textContent.includes('Hours without prices are used only if needed') && page.textContent.includes('Learning household load (3 of 7 days)') &&
  page.textContent.includes('Learned from 12 charges'));
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
  planText('smartevse_2')[0] === `Below 80% at ${t7} · ≈ 40% · after Volvo XC40`);
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

// ---- Plan layout (card 0.4.0; shared chart, labelled rows and plain wording in 0.5.0) ----
// The plan is drawn by the shared time-series chart of @bitosome/ha-card-ui: without layout
// (Happy DOM) it uses its 360 px fallback width. Browser geometry is checked in test/layout.mjs.
try { win.localStorage?.clear(); } catch { /* no storage in this DOM */ }
// The first card watches the same controller and would follow a layout change; Happy DOM cannot
// resolve its shadow root's activeElement while focus sits in another card, so it leaves the page.
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
const rows3 = (key) => all3(`.ev-pod.${key} .plan-row`).map((row) => [row.querySelector('dt').textContent, norm(row.querySelector('dd').textContent)]);
const note3 = (key) => norm(root3.querySelector(`.ev-pod.${key} .charger-plan-line`)?.textContent);
const title3 = () => norm(root3.querySelector('.status-title')?.textContent);
const support3 = () => norm(root3.querySelector('.status-support')?.textContent);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const planTime = (iso) => el3._formatPlanTime(iso, Date.now());
check('with Intelligent support and no layout option the card uses the plan layout with the shared chart',
  el3._layout() === 'plan' && !!root3.querySelector('ha-card.layout-plan') && !!svg3() && !root3.querySelector('.plan-timeline, .tl-canvas'));
check('the chart frame is titled "Charging plan" and its short legend names only what is drawn, the hatch included',
  norm(chart3()?.querySelector('.family-chart-title')?.textContent) === 'Charging plan' &&
  same(legend3(), ['Price', 'Planned', 'Extra', 'No price yet']) &&
  same(all3('.family-chart-legend [data-period]').map((node) => node.getAttribute('data-period')), ['planned', 'extra']) &&
  all3('.family-chart-legend [data-band]').length === 1 &&
  !!chart3()?.querySelector('.family-chart-readout'));
check('each connected car is a lane with its planned and extra periods and a ready-by marker',
  same(lanes3(), [
    { id: 'smartevse_1', label: 'XC40', tones: ['planned', 'planned'], marker: true, muted: false },
    { id: 'smartevse_2', label: 'EX30', tones: ['planned', 'extra'], marker: true, muted: false }]) &&
  all3('.family-chart-period-hatch[data-pattern="hatch"]').length === 1 && !root3.querySelector('.family-chart-period-hatch[data-pattern="bars"]'));
// The price is a stepped line (0.5.1): one colour per priced interval, read from the line's
// gradient (two stops per interval). Bars were narrow and centred, so they did not line up
// with the periods underneath.
const barFills = () => all3('stop').filter((stop) => /stroke/.test(stop.parentNode?.getAttribute?.('id') || ''))
  .map((stop) => stop.getAttribute('stop-color') || '').filter((_, index) => index % 2 === 0);
const priceLines = () => all3('.family-chart-line[data-series="price"]');
check('the price is a stepped line over each whole interval, never centred bars',
  priceLines().length >= 1 && !root3.querySelector('.family-chart-bar') &&
  priceLines().every((line) => /^M [\d.-]+ [\d.-]+ L /.test(line.getAttribute('d') || '') && !/NaN/.test(line.getAttribute('d') || '')) &&
  !!root3.querySelector('.family-chart-area[data-series="price"]'));
check('known prices are drawn per hour, cheap hours take the success colour, hours without a price are one hatched band',
  barFills().length === 7 && barFills().filter((fill) => fill.includes('--family-success')).length === 4 &&
  barFills().filter((fill) => fill.includes('--sdc-chart-price')).length === 3 &&
  all3('.family-chart-band').length === 1 && root3.querySelector('.family-chart-band')?.getAttribute('data-pattern') === 'hatched' &&
  root3.querySelector('.family-chart-band-label')?.textContent === 'No price yet' && !!root3.querySelector('.family-chart-now'));
check('the chart is a named slider with the plan described in words',
  svg3()?.getAttribute('role') === 'slider' && svg3().getAttribute('aria-label') === 'Charging plan' &&
  /^Charging plan until /.test(desc3()) && desc3().includes('Volvo XC40: 21:00–22:00, 23:00–') && desc3().includes('Volvo EX30: ') &&
  desc3().includes(`Ready by ${planTime('2026-11-10T07:00:00+00:00')}`) && desc3().includes(`No published price from ${planTime('2026-11-10T01:00:00+00:00')}`) &&
  !desc3().includes('below zero'));
const periodLine3 = () => all3('.family-chart-periods .family-chart-readout-period').map((node) => norm(node.textContent));
check('under the chart one line says what each car does at the selected time; the head readout keeps time and price',
  !!chart3()?.querySelector('.family-chart-periods') && !chart3().querySelector('.family-chart-readout .family-chart-readout-period') &&
  norm(chart3().querySelector('.family-chart-readout')?.textContent).endsWith('€0.31/kWh') &&
  [...chart3().children].map((node) => node.className.split(' ')[0]).join(',') === 'family-chart-head,family-chart-legend,family-chart-body,family-chart-periods');
check('the chart is 120 px plus one row per car and the card size follows it',
  svg3()?.getAttribute('viewBox') === '0 0 360 170' && el3.getCardSize() === 15);
const selectionGroups = [el3._chartGroup, document.createElement(tag)._chartGroup];
check('each card instance has its own chart selection group', selectionGroups[0] !== selectionGroups[1] && /^smartevse-plan-\d+$/.test(selectionGroups[0]));
// Car tiles: gauge, then short labelled rows.
const gauges = [...root3.querySelectorAll('.ev-pod .pod-gauge')];
check('each connected car is a gauge with its level, minimum tick and projected arc',
  gauges.length === 2 && gauges[0].getAttribute('aria-label') === 'Volvo XC40 battery 53%, minimum 80%' &&
  gauges[0].querySelector('.pod-value')?.textContent === '53' && !!gauges[0].querySelector('.pod-min') &&
  !!gauges[0].querySelector('.pod-projected') && !root3.querySelector('.battery-meter'));
check('the level reached with extra charging is drawn and spoken on the gauge',
  gauges[1].getAttribute('aria-label') === 'Volvo EX30 battery 30%, minimum 80%, up to 96% while cheap' &&
  !!gauges[1].querySelector('.pod-extra') && !gauges[0].querySelector('.pod-extra'));
check('the LED ring follows the WLED state of its charger',
  gauges.every((gauge) => /\b(breathe|chase|static)\b/.test(gauge.querySelector('.pod-ring')?.getAttribute('class') || '')));
check('a planned car reads Guaranteed, Extra, Next and Cost as labelled rows',
  same(rows3('smartevse_1'), [['Guaranteed', `80% by ${t7}`], ['Extra', 'none tonight'], ['Next', 'Starts 21:00'], ['Cost', '≈ €4.91 · saves ≈ €1.29']]) &&
  same(rows3('smartevse_2'), [['Guaranteed', `80% by ${t7}`], ['Extra', 'to ≈ 96% while cheap'], ['Next', `Starts ${planTime('2026-11-10T02:00:00+00:00')}`], ['Cost', '≈ €1.19']]) &&
  !root3.querySelector('.ev-pod .charger-plan-line') && all3('.ev-pod dl.plan-rows').length === 2);
check('car tiles keep the cost button and charger details under the rows',
  !!root3.querySelector('.ev-pod .session-cost') && all3('.ev-pod [data-action="open-charger-details"]').length === 2);
const totalsText = norm(root3.querySelector('.plan-totals')?.textContent);
check('the totals row shows planned cost, saving and next start',
  totalsText.includes('Planned cost') && totalsText.includes('6.10') && totalsText.includes('Saving') && totalsText.includes('Next start') && !/Saves/.test(totalsText));
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
  root3.querySelector('.flow-stage') === stage3 && svg3() === chartNode && gauges[0] !== root3.querySelector('.ev-pod .pod-gauge') &&
  root3.querySelector('.ev-pod .pod-value')?.textContent === '54' && !el3._flow.current &&
  same([...stage3.children].map((node) => node.className.split(' ')[0]), ['house-node', 'family-chart-frame', 'ev-row', 'plan-totals', 'advanced-settings']));
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
check('a charging car reads "Charging" on its lane, in the legend, the period line, its row, the hero and the totals',
  same(lanes3()[0].tones, ['active', 'planned']) && same(legend3(), ['Price', 'Planned', 'Charging', 'Extra', 'No price yet']) &&
  periodLine3().includes('XC40 Charging') &&
  same(rows3('smartevse_1')[2], ['Next', 'Charging until 22:00']) && title3() === 'Charging Volvo XC40' &&
  /Next start\s*Now/.test(norm(root3.querySelector('.plan-totals')?.textContent)));
iAttrs.smartevse_1_state = 'Connected';
await push3();
check('a planned block that runs before the charger reports Charging is not shown as charging',
  same(lanes3()[0].tones, ['planned', 'planned']) && same(rows3('smartevse_1')[2], ['Next', 'Starting now']) && title3() === 'Starting to charge Volvo XC40' &&
  /Next start\s*Now/.test(norm(root3.querySelector('.plan-totals')?.textContent)));
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
  same(rows3('smartevse_1'), [['Guaranteed', 'Reached · 82%'], ['Extra', 'none tonight'], ['Next', 'Done'], ['Cost', '≈ €4.91 · saved ≈ €1.29']]));
check('a car at its minimum with extra charging planned names the extra level and its start',
  same(rows3('smartevse_2'), [['Guaranteed', 'Reached · 81%'], ['Extra', 'to ≈ 96% while cheap'], ['Next', `Starts ${planTime('2026-11-10T04:00:00+00:00')}`], ['Cost', '≈ €1.19']]) &&
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
const riskLine = root3.querySelector('.ev-pod.smartevse_2 .charger-plan-line');
check('a car that cannot reach its minimum has one warning line and no "Guaranteed" row',
  note3('smartevse_2') === `Not enough time · ≈ 74% by ${t7}` && riskLine?.getAttribute('data-tone') === 'warning' &&
  riskLine.querySelector('.plan-tone-icon')?.getAttribute('icon') === 'mdi:alert-outline' && riskLine.querySelectorAll('.sep').length === 1 &&
  same(rows3('smartevse_2'), [['Next', `Starts ${planTime('2026-11-10T02:00:00+00:00')}`], ['Cost', '≈ €1.19']]) &&
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
  const line = root3.querySelector('.ev-pod.smartevse_2 .charger-plan-line');
  if (note3('smartevse_2') !== text || (line?.getAttribute('data-tone') === 'warning') !== warning || !!line?.querySelector('.plan-tone-icon') !== warning ||
    rows3('smartevse_2').length !== 0) wrongNotes.push(`${name}: ${note3('smartevse_2')} / ${rows3('smartevse_2').length} rows`);
}
check('identifying, policy, car-timer and refusing cars read as one line without rows', wrongNotes.length === 0);
if (wrongNotes.length) console.log(wrongNotes);
// Unknown battery level (unidentified car): an energy budget, no Extra or Cost row.
iAttrs.intelligent = payload10();
Object.assign(iAttrs.intelligent.chargers.smartevse_2, { vehicle: null, vehicle_name: '', settings_key: 'other', soc: null, estimated: true, need_kwh: 25,
  top_up: false, extra_soc: null, blocks: [{ start: '2026-11-10T02:00:00+00:00', end: '2026-11-10T04:00:00+00:00', top_up: false }] });
const ev2Before = [iAttrs.smartevse_2_connected_ev, iAttrs.smartevse_2_battery];
iAttrs.smartevse_2_connected_ev = 'unknown'; iAttrs.smartevse_2_battery = '';
await push3();
check('an unidentified car is guaranteed an energy budget and its lane is "Other"',
  same(rows3('smartevse_2'), [['Guaranteed', `≈ 25 kWh by ${t7}`.replace(/\s+/g, ' ')], ['Next', `Starts ${planTime('2026-11-10T02:00:00+00:00')}`]]) &&
  lanes3()[1].label === 'Other' && norm(root3.querySelector('.ev-pod.smartevse_2 .vehicle-name')?.textContent) === 'Vehicle connected');
[iAttrs.smartevse_2_connected_ev, iAttrs.smartevse_2_battery] = ev2Before;
// Integration 0.0.9.x: no extra_soc, no learned limit, a top-up switch. The rows still work.
iAttrs.intelligent = basePayload();
await push3();
check('a 0.0.9.x payload keeps working: Extra comes from the car limit and only where top-up is planned',
  same(rows3('smartevse_1'), [['Guaranteed', `80% by ${t7}`], ['Next', 'Starts 21:00'], ['Cost', '≈ €4.91 · saves ≈ €1.29']]) &&
  same(rows3('smartevse_2')[1], ['Extra', 'up to 100% while cheap']) &&
  gauges.length === 2 && !root3.querySelector('.pod-extra') && !/while cheap/.test(root3.querySelector('.ev-pod.smartevse_2 .pod-gauge')?.getAttribute('aria-label') || '') &&
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
  same(rows3('smartevse_1').map((row) => row[0]), ['Guaranteed', 'Next', 'Cost']) && same(rows3('smartevse_2').map((row) => row[0]), ['Guaranteed', 'Next', 'Cost']) &&
  !barFills().some((fill) => fill.includes('--family-success')) && support3() === `Ready by ${t7}` && same(legend3(), ['Price', 'Planned', 'No price yet']));
iAttrs.intelligent = payload10();
Object.assign(iAttrs.intelligent.chargers.smartevse_1, { car_limit: 80 });
await push3();
check('a car whose own limit equals the minimum has no Extra row', same(rows3('smartevse_1').map((row) => row[0]), ['Guaranteed', 'Next', 'Cost']));
iAttrs.intelligent = payload10();
await push3();

// Layout switch: Settings writes a per-device override; "classic" restores the earlier tiles.
const pressed = (value) => new RegExp(`data-value="${value}" aria-pressed="true"`).test(el3._layoutChoice());
check('Settings offers Auto, Plan and Classic, with Auto pressed while no device override is saved',
  pressed('auto') && !pressed('plan') && !pressed('classic') && /Automatic · Plan/.test(el3._layoutChoice()));
el3._setLayout('classic'); await el3.updateComplete; await wait();
check('switching to Classic restores the earlier tiles and hides the chart',
  !!root3.querySelector('ha-card.layout-classic') && !chart3() && !root3.querySelector('.ev-pod') &&
  !!root3.querySelector('.battery-meter') && !root3.querySelector('.plan-totals') && pressed('classic') && !pressed('auto'));
check('the classic tiles keep their plan lines and name extra charging without "top-up"',
  norm(root3.querySelector('.ev-node.smartevse_1 .charger-plan-line')?.textContent) === `80% by ${t7} · 21:00–22:00 +1 more` &&
  !root3.querySelector('.plan-rows') && !/top.?up|topping/i.test(root3.querySelector('.ev-row')?.textContent || ''));
let storedLayout = null;
try { storedLayout = win.localStorage?.getItem(el3._layoutStorageKey()) ?? null; } catch { storedLayout = 'classic'; }
check('the layout choice is remembered on this device', storedLayout === 'classic');
const elSaved = document.createElement(tag);
elSaved.setConfig(config);
check('a saved layout is loaded in setConfig', elSaved._layoutOverride === 'classic' && elSaved._layout() === 'classic');
check('the classic layout keeps the smaller card size', el3.getCardSize() === 6);
el3._setLayout('auto'); await el3.updateComplete; await wait();
check('Auto clears the device override so the card option or the default applies again',
  el3._layoutOverride === null && win.localStorage.getItem(el3._layoutStorageKey()) === null && el3._layout() === 'plan' &&
  !!root3.querySelector('ha-card.layout-plan') && !!svg3() && pressed('auto'));
el3._config = { ...el3._config, layout: 'classic' };
check('the layout card option sets the default', el3._layout() === 'classic');
el3._config = { ...el3._config, layout: undefined };
// The same choice through the DOM: hero → Settings → layout chip. Settings needs no entity.
const click3 = async (selector) => {
  root3.querySelector(selector)?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
  await el3.updateComplete; await wait();
};
const configWithSettings = el3._config;
el3._config = { ...el3._config, charge_policy_entity: undefined, duty_cycle_entity: undefined };
await click3('[data-action="open-force-wizard"]');
check('the hero still opens the plan chooser after the overview became a Lit template',
  !!root3.querySelector('dialog') && !!root3.querySelector('dialog [data-action="open-settings"]') && root3.querySelector('.flow-stage')?.inert === true);
await click3('[data-action="open-settings"]');
check('Settings shows the layout choice on its own',
  !!root3.querySelector('dialog .layout-choice') && root3.querySelectorAll('dialog [data-action="set-layout"]').length === 3 &&
  !root3.querySelector('dialog .setting-tile'));
await click3('dialog [data-action="set-layout"][data-value="classic"]');
check('clicking the Classic chip switches the card and marks the chip',
  !!root3.querySelector('ha-card.layout-classic') && win.localStorage.getItem(el3._layoutStorageKey()) === 'classic' &&
  root3.querySelector('dialog [data-action="set-layout"][data-value="classic"]')?.getAttribute('aria-pressed') === 'true');
await click3('dialog [data-action="set-layout"][data-value="auto"]');
check('clicking the Auto chip returns to the default layout',
  !!root3.querySelector('ha-card.layout-plan') && win.localStorage.getItem(el3._layoutStorageKey()) === null &&
  root3.querySelector('dialog [data-action="set-layout"][data-value="auto"]')?.getAttribute('aria-pressed') === 'true');
el3._closeActiveDialog(); await el3.updateComplete; await wait();
check('closing the dialog returns focus to the hero and frees the overview',
  root3.activeElement === root3.querySelector('[data-action="open-force-wizard"]') && root3.querySelector('.flow-stage')?.inert === false);
el3._config = configWithSettings;
// A second card on the same controller follows the choice (same page, and other tabs via storage).
root3.activeElement?.blur();
const el4 = document.createElement(tag);
el4.setConfig(config);
el4.hass = iHass;
document.body.appendChild(el4);
await wait(60);
el3._setLayout('classic'); await wait();
const followedClassic = el4._layout() === 'classic' && !!el4.shadowRoot.querySelector('ha-card.layout-classic');
el3._setLayout('auto'); await wait();
const followedAuto = el4._layout() === 'plan' && !!el4.shadowRoot.querySelector('ha-card.layout-plan');
const storageEvent = (key) => { const event = new win.Event('storage'); event.key = key; window.dispatchEvent(event); };
win.localStorage.setItem(el3._layoutStorageKey(), 'classic');
storageEvent(el3._layoutStorageKey()); await wait();
const storageClassic = el3._layout() === 'classic' && el4._layout() === 'classic' && !!root3.querySelector('ha-card.layout-classic');
win.localStorage.removeItem(el3._layoutStorageKey());
storageEvent(el3._layoutStorageKey()); await wait();
check('a second card on the same controller follows the layout choice',
  followedClassic && followedAuto && storageClassic && el3._layout() === 'plan' && el4._layout() === 'plan');
el4.remove();
// The default is sticky: an unavailable controller (restart) must not flip the card to Classic.
const liveController = iStates['sensor.ctl'];
iStates['sensor.ctl'] = { state: 'unavailable', attributes: {} };
await push3();
const elOutage = document.createElement(tag);
elOutage.setConfig(config);
elOutage.hass = iHass;
check('an unavailable controller keeps the plan layout, also for a card loaded during the outage',
  el3._layout() === 'plan' && !!root3.querySelector('ha-card.layout-plan') && !root3.querySelector('ha-card.layout-classic') &&
  win.localStorage.getItem(el3._layoutDefaultStorageKey()) === 'plan' && elOutage._layout() === 'plan' &&
  win.localStorage.getItem(el3._layoutStorageKey()) === null && !chart3() && title3() === 'Controller unavailable');
const elOther = document.createElement(tag);
elOther.setConfig(config);
const rememberedForController = elOther._layout() === 'plan';
elOther.setConfig({ ...config, controller_entity: 'sensor.other_controller' });
elOther.hass = iHass;
check('the remembered default belongs to its controller only', rememberedForController && elOther._layout() === 'classic');
el3._setLayout('classic');
const overrideWins = el3._layout() === 'classic';
el3._setLayout('auto');
el3._config = { ...el3._config, layout: 'classic' };
const optionWins = el3._layout() === 'classic';
el3._config = { ...el3._config, layout: undefined };
check('during the outage the device override and the layout option keep their precedence', overrideWins && optionWins && el3._layout() === 'plan');
const { intelligent: _dropped, ...legacyAttrs } = liveController.attributes;
iStates['sensor.ctl'] = { state: 'ready', attributes: legacyAttrs };
check('a readable controller without Intelligent support ends the remembered default',
  elOutage._layout() === 'classic' && win.localStorage.getItem(el3._layoutDefaultStorageKey()) === null);
iStates['sensor.ctl'] = liveController;
await push3();
check('the plan layout returns with the controller', el3._layout() === 'plan' && !!svg3());

// ---- Plan chart states ----
// Force charge overrides the plan: the lanes are muted and every period reads "Paused".
iAttrs.intelligent = payload10();
iAttrs.intelligent.overridden_by = 'force';
iAttrs.smartevse_1_state = 'Charging';
await at3('2026-11-09T21:30:00Z');
check('under Force charge the chart keeps the prices, mutes the lanes and says the plan is paused',
  lanes3().every((lane) => lane.muted) && same(lanes3().flatMap((lane) => lane.tones), ['muted', 'muted', 'muted', 'muted']) &&
  barFills().length === 4 && same(legend3(), ['Price', 'Paused by Force charge', 'No price yet']) && desc3().includes('Paused by Force charge') &&
  periodLine3().includes('XC40 paused') && !periodLine3().some((text) => /Charging|Planned/.test(text)) &&
  same(all3('.family-chart-legend [data-period]').map((node) => node.getAttribute('data-period')), ['muted']));
check('under Force charge the tiles show no plan rows and the totals row is hidden',
  !root3.querySelector('.plan-rows') && !root3.querySelector('.plan-totals') && !root3.querySelector('.status-support') &&
  /Resumes after force charge/.test(root3.querySelector('[data-plan-group="intelligent"]')?.textContent || ''));
iAttrs.intelligent.overridden_by = null;
iStates['switch.force'].state = 'on';
await push3();
check('the Force charge switch pauses the chart even before the payload reports it',
  lanes3().every((lane) => lane.muted) && same(legend3(), ['Price', 'Paused by Force charge', 'No price yet']) && !root3.querySelector('.plan-totals'));
iStates['switch.force'].state = 'off';
iAttrs.smartevse_1_state = 'Connected';
iAttrs.intelligent = payload10();
await at3('2026-11-09T18:00:00Z');
check('without Force charge nothing is muted', lanes3().every((lane) => !lane.muted) && !desc3().includes('Paused') && !!root3.querySelector('.plan-totals'));
// "Next start" never shows a past time while a block runs, whatever the overall status is.
iAttrs.intelligent.status = 'at_risk';
await at3('2026-11-09T21:30:00Z');
const totals3 = () => norm(root3.querySelector('.plan-totals')?.textContent);
check('a running block reads "Next start: Now" when the overall status is not "charging"', /Next start\s*Now/.test(totals3()) && !totals3().includes('21:00'));
await at3('2026-11-09T22:30:00Z');
check('a start time that has passed reads Now, never the past time', /Next start\s*Now/.test(totals3()) && !totals3().includes('21:00'));
iAttrs.smartevse_1_plug_state = 'Disconnected';
iAttrs.intelligent.next_charge = '2026-11-10T02:00:00+00:00';
await at3('2026-11-09T21:30:00Z');
check('a running block of a charger without a car does not read Now', /Next start/.test(totals3()) && !/Next start\s*Now/.test(totals3()));
iAttrs.smartevse_1_plug_state = 'Connected';
iAttrs.intelligent = payload10();
await at3('2026-11-09T18:00:00Z');
// Prices: negative values, forecast-only hours and slots shorter than an hour.
const withPrices = (prices, kinds = null) => priceSlots.map((slot, index) => ({ ...slot,
  kind: kinds ? kinds(index) : slot.kind, price: (kinds ? kinds(index) : slot.kind) === 'known' ? prices[index % prices.length] : slot.price }));
iAttrs.intelligent.slots = withPrices([0.2, -0.05, 0, 0.1, -0.1, 0.05, 0.15]);
await push3();
const axisLabels = () => all3('.family-chart-axis').map((node) => node.textContent);
check('negative and zero prices are drawn and mentioned in the description',
  barFills().length === 7 && priceLines().length >= 1 && priceLines().every((line) => !/NaN|Infinity/.test(line.getAttribute('d') || '')) &&
  desc3().includes('Some prices are below zero') && axisLabels().some((label) => /[-−]/.test(label)) &&
  barFills().filter((fill) => fill.includes('--family-success')).length === 7);
iAttrs.intelligent.slots = withPrices(cheapPrices, (index) => (index === 2 || index > 6 ? 'forecast' : 'known'));
await push3();
check('each run of hours without a published price is its own hatched band',
  all3('.family-chart-band').length === 2 && barFills().length === 6 && desc3().includes(`No published price from ${planTime('2026-11-09T20:00:00+00:00')}`));
iAttrs.intelligent.slots = withPrices(cheapPrices, () => 'forecast');
await push3();
check('with no published price at all the frame stays and says so',
  !!chart3() && !svg3() && !!chart3().querySelector('.family-chart-empty') && /No published prices yet/.test(chart3().textContent) &&
  norm(chart3().querySelector('.family-chart-title')?.textContent) === 'Charging plan' && rows3('smartevse_1').length === 4);
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
check('the chart prices carry the payload currency per kWh',
  norm(chart3().querySelector('.family-chart-readout strong[data-series="price"]')?.textContent) === '€0.31/kWh' && axisLabels().includes('€0.20'));
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
  norm(chart3().querySelector('.family-chart-title')?.textContent) === 'Charging plan' && rows3('smartevse_2').length === 0);
iAttrs.intelligent = payload10();
iAttrs.smartevse_1_available = false; iAttrs.smartevse_2_available = false;
await push3();
check('unreachable chargers leave a price chart that says so in words',
  !root3.querySelector('.family-chart-lane') && norm(chart3().querySelector('.family-chart-title')?.textContent) === 'Electricity price' &&
  desc3().includes('Chargers unreachable') && !desc3().includes('No vehicle connected') && svg3().getAttribute('aria-label') === 'Electricity price');
iAttrs.smartevse_1_available = true; iAttrs.smartevse_2_available = true;
iAttrs.smartevse_2_error = 'RCM tripped';
await push3();
check('a connected charger with an error keeps its lane but not its plan',
  same(lanes3().map((lane) => [lane.tones.length, lane.marker]), [[2, true], [0, false]]) &&
  desc3().includes('Volvo EX30: charger error') && !root3.querySelector('.ev-pod.smartevse_2 .charger-plan'));
iAttrs.smartevse_2_error = 'None';
await at3('2026-11-10T07:00:00Z');
check('a payload whose slots are all in the past draws no chart', !chart3() && el3._planChartData(evA, evB) === null && el3.getCardSize() === 9);
await at3('2026-11-09T18:00:00Z');
check('the chart returns for a current payload', !!svg3());
// Time labels and row times follow the profile's clock.
const times3 = () => all3('.family-chart-time').map((node) => node.textContent);
const times24 = times3();
iHass.locale.time_format = '12';
await push3();
check('time labels and row times use the 12-hour profile',
  times24.length > 2 && times24.every((label) => /^\d{1,2}:\d{2}$/.test(label)) && times3().every((label) => /\b[AP]M$/i.test(label)) &&
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
const ring1 = root3.querySelector('.ev-pod.smartevse_1 .pod-ring');
const cardStyle = root3.querySelector('ha-card')?.getAttribute('style') || '';
const firstPhase = phase(ring1);
check('animated rings start at the phase of a shared clock, using the CSS duration',
  ring1?.classList.contains('chase') && ring1.getAttribute('data-anim-ms') === '2450' && cardStyle.includes('--sdc-led-charging-glow-duration: 2.45s') &&
  firstPhase === expected(ring1) &&
  root3.querySelector('.ev-pod.smartevse_2 .pod-ring')?.getAttribute('data-anim-ms') === '2780' && cardStyle.includes('--sdc-led-idle-glow-duration: 2.78s') &&
  phase(root3.querySelector('.ev-pod.smartevse_2 .pod-ring')) === expected(root3.querySelector('.ev-pod.smartevse_2 .pod-ring')));
check('plan periods take the charger’s LED colours through the chart’s theme variables',
  cardStyle.includes('--family-chart-period-planned: rgba(23, 67, 101, 0.75);') && cardStyle.includes('--family-chart-period-active: rgb(44, 199, 88);') &&
  cardStyle.includes('--family-chart-period-active-duration: 2.45s;') && same(lanes3()[0].tones, ['active', 'planned']));
Date.now = () => Date.parse('2026-11-09T21:30:01.234Z');
await push3();
const samePhase = root3.querySelector('.ev-pod.smartevse_1 .pod-ring') === ring1 && phase(ring1) === firstPhase;
iAttrs.smartevse_1_battery = '54';
await push3();
const ring2 = root3.querySelector('.ev-pod.smartevse_1 .pod-ring');
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
const gauge3 = root3.querySelector('.ev-pod.smartevse_1 .pod-gauge');
const names3 = (node) => (node ? node.getAttributeNames().map((name) => name.toLowerCase()).sort().join(',') : '');
const noMarkup = () => !overview3.querySelector('img') && ![...overview3.querySelectorAll('*')].some((node) => node.hasAttribute('onerror') || node.hasAttribute('src'));
check('markup in vehicle names and the currency stays text in the tiles, rows, hero and chart',
  noMarkup() && root3.querySelector('.ev-pod.smartevse_1 .vehicle-name')?.textContent === evilName &&
  gauge3?.getAttribute('aria-label')?.startsWith(`${evilName} battery `) && names3(gauge3) === 'aria-label,class,role,viewbox' &&
  root3.querySelector('.family-chart-lane-label')?.textContent === '<img' && desc3().includes(`${evilName}: `) &&
  same(rows3('smartevse_2')[0], ['Next', `After ${evilName}`]) && title3() === 'Next charge at 21:00' && support3() === `${evilName} by ${t7}` &&
  !!svg3() && barFills().length === 7 && same(legend3(), ['Price', 'Planned', 'No price yet']) && periodLine3().every((text) => !/[<>]/.test(text) || text.startsWith('<img')));
Object.assign(iAttrs, { smartevse_2_error: `Fault ${evil}`, charge_reason: evil, controller_error: evil });
iAttrs.intelligent.status = evil;
iAttrs.intelligent.chargers.smartevse_1.status = evil;
await push3();
check('markup in error and status text stays text',
  noMarkup() && root3.querySelector('.ev-pod.smartevse_2 .charger-message')?.textContent === `Fault ${evil}` &&
  !root3.querySelector('.ev-pod.smartevse_2 .charger-plan') && root3.querySelectorAll('.ev-pod').length === 2 && root3.querySelectorAll('.pod-gauge').length === 2);
Object.assign(iAttrs, { smartevse_1_connected_ev: evilBefore.name, smartevse_2_error: 'None', smartevse_2_state: evilBefore.state,
  charge_reason: 'intelligent_waiting_for_planned_slot', controller_error: null });
iAttrs.intelligent = payload10();
await push3();
// CSS: the card's own rules for the plan layout, and the shared chart styles in the element.
const css3 = (root3.querySelector('style')?.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
const podRules = [...css3.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((rule) => rule[1].includes('.ev-pod'));
check('the plan layout keeps two tiles side by side and car tiles never wrap one letter per line',
  /\.layout-plan \.ev-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(css3) &&
  podRules.length > 5 && !podRules.some((rule) => /overflow-wrap:\s*anywhere/.test(rule[2])) &&
  podRules.some((rule) => /\.vehicle-name/.test(rule[1]) && /overflow-wrap:\s*break-word/.test(rule[2])) &&
  podRules.some((rule) => /max-width:\s*100%/.test(rule[2])));
check('plan rows keep their label on one line and the hand-drawn timeline styles are gone',
  /\.plan-row dt\s*\{[^}]*white-space:\s*nowrap/.test(css3) && /\.plan-row dd\s*\{[^}]*overflow-wrap:\s*break-word/.test(css3) &&
  !/\.tl-|\.plan-timeline|\.plan-legend/.test(css3) && /\.pod-unit\s*\{[^}]*font-size:\s*11px/.test(css3) &&
  root3.querySelector('.pod-unit')?.localName === 'span' && root3.querySelector('.pod-unit')?.textContent === '% · min 80');
const elementCss = (customElements.get(tag).elementStyles || []).map((sheet) => sheet.cssText || '').join('\n');
check('the element carries the shared chart styles', /\.family-chart-frame\s*\{/.test(elementCss) && /\.family-chart-period\[data-tone="extra"\]/.test(elementCss));
// Without Intelligent charging there is no plan to draw: tiles only (with and without slots).
iAttrs.intelligent = { ...payload10(), enabled: false };
iStates['switch.ic'].state = 'off';
await push3();
check('with Intelligent off the plan layout shows gauges but no chart, rows or totals, even when slots are still published',
  iAttrs.intelligent.slots.length === 13 && !chart3() && !root3.querySelector('.plan-totals') && !root3.querySelector('.plan-rows') &&
  root3.querySelectorAll('.ev-pod').length === 2 && !root3.querySelector('.status-support'));
iStates['switch.ic'].state = 'on';
// One car: the empty charger tile keeps its own height beside the car tile.
iAttrs.intelligent = payload10();
delete iAttrs.intelligent.chargers.smartevse_2;
const plugBefore = [iAttrs.smartevse_1_plug_state, iAttrs.smartevse_2_plug_state];
iAttrs.smartevse_2_plug_state = 'Disconnected';
await push3();
check('with one car the empty charger tile is not stretched and the chart has one lane',
  !!root3.querySelector('.ev-node-wrap.smartevse_2.pod-empty') && !root3.querySelector('.ev-node-wrap.smartevse_1.pod-empty') &&
  /\.ev-node-wrap\.pod-empty\s*\{[^}]*align-self:\s*start/.test(css3) && lanes3().length === 1 && svg3().getAttribute('viewBox') === '0 0 360 148' &&
  el3.getCardSize() === 14);
// No car connected: the chart shows prices only; the charger tiles stay centred tiles.
iAttrs.intelligent = { ...payload10(), status: 'no_ev', chargers: {}, next_charge: null, connected_count: 0 };
iAttrs.smartevse_1_plug_state = 'Disconnected'; iAttrs.smartevse_2_plug_state = 'Disconnected';
iAttrs.charge_reason = 'intelligent_waiting_for_connected_ev';
await push3();
const emptyPods = [...root3.querySelectorAll('.ev-pod.empty')];
check('chargers without a car use the centred plan tile, not the classic heading row',
  emptyPods.length === 2 && !root3.querySelector('.layout-plan .charger-heading') && !root3.querySelector('.pod-gauge') &&
  emptyPods.every((pod) => !!pod.querySelector('.pod-icon') && /SmartEVSE [12]/.test(pod.querySelector('.charger-name')?.textContent || '') &&
    /No vehicle connected/.test(pod.querySelector('.charger-status')?.textContent || '')));
check('with no car the chart is titled "Electricity price", has no lanes and the hero waits for a vehicle',
  norm(chart3()?.querySelector('.family-chart-title')?.textContent) === 'Electricity price' && !root3.querySelector('.family-chart-lane') &&
  same(legend3(), ['Price']) && desc3().startsWith('Electricity prices until ') && desc3().includes('No vehicle connected') &&
  svg3().getAttribute('viewBox') === '0 0 360 120' && !root3.querySelector('.pod-empty') && el3.getCardSize() === 8 &&
  title3() === 'Waiting for a vehicle' && !root3.querySelector('.status-support'));
[iAttrs.smartevse_1_plug_state, iAttrs.smartevse_2_plug_state] = plugBefore;
iAttrs.charge_reason = 'intelligent_waiting_for_planned_slot';
el3.remove();
Date.now = realDateNow;

console.log(ok ? '\nSMOKE TEST OK' : '\nSMOKE TEST FAILED');
process.exit(ok ? 0 : 1);
