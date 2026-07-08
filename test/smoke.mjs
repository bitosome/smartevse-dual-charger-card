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
  force_charge_entity: 'switch.force',
  charge_policy_entity: 'select.policy',
  acceptable_price_entity: 'number.price',
});

const calls = [];
el.hass = {
  states: {
    'sensor.ctl': { state: 'ready', attributes: { charge_allowed: true, active_smartevse_raw: '', wled_visuals: {} } },
    'switch.force': { state: 'off', attributes: {} },
    'select.policy': { state: 'balanced', attributes: { options: ['balanced', 'fast'] } },
    'number.price': { state: '0.12', attributes: { min: 0, max: 1, step: 0.01 } },
  },
  callService: (...a) => { calls.push(a); return Promise.resolve(); },
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
};
let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`);
  if (!pass) ok = false;
}

// Simulate a toggle action via delegated click.
const toggle = root.querySelector('[data-action="toggle"][data-entity]');
if (toggle) {
  toggle.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
  await new Promise((r) => setTimeout(r, 20));
  const called = calls.some((c) => c[0] === 'homeassistant' && (c[1] === 'turn_on' || c[1] === 'turn_off'));
  console.log(`${called ? 'PASS' : 'FAIL'}: toggle action calls hass.callService`);
  if (!called) ok = false;
} else {
  console.log('SKIP: no toggle action element found');
}

console.log(ok ? '\nSMOKE TEST OK' : '\nSMOKE TEST FAILED');
process.exit(ok ? 0 : 1);
