// Browser layout checks for the plan layout (card 0.5.0: shared chart and labelled plan rows). Not part of `npm test`: they need
// Playwright with a Chromium build, which this repository does not install.
//   npm run build && npm run test:layout
// Optional environment:
//   PLAYWRIGHT_MODULE      absolute path of a Playwright entry file when `playwright` is not
//                          resolvable from here (e.g. a global install's index.mjs)
//   PLAYWRIGHT_EXECUTABLE  browser executable to launch
//   LAYOUT_BROWSER         "webkit" to run in WebKit instead of Chromium
//   LAYOUT_SCREENSHOT_DIR  save one screenshot per state, width and theme into this directory
// The page is preview/index.html with mock state, served from 127.0.0.1. Nothing else is contacted.
import http from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let chromium;
for (const specifier of ['playwright', process.env.PLAYWRIGHT_MODULE]) {
  if (!specifier || chromium) continue;
  try {
    const module = await import(specifier);
    const engine = process.env.LAYOUT_BROWSER === 'webkit' ? 'webkit' : 'chromium';
    chromium = module[engine] ?? module.default?.[engine];
  } catch {
    // Try the next source.
  }
}
if (!chromium) {
  console.log('SKIP: Playwright cannot be imported, so the browser layout checks did not run.');
  console.log('      Install it (npm i --no-save playwright && npx playwright install chromium) or set PLAYWRIGHT_MODULE.');
  process.exit(0);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const file = path.resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + path.sep)) throw new Error('outside the repository');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
} catch (error) {
  console.log(`SKIP: the browser could not be started (${String(error?.message || error).split('\n')[0]}).`);
  server.close();
  process.exit(0);
}

const WIDTHS = [320, 360, 390];
const THEMES = ['dark', 'light'];
const LONG_NAME = 'Supercalifragilisticexpialidocious123'; // 37 characters, no break opportunity
// Each state starts from the preview's "intelligent" scenario (two cars, a planned night) and
// edits the mock state in the page. `ctx` = { attrs, plan, states, hour, now, locale }.
const STATES = {
  // Two cars, both planned; the XC40 also has extra charging while cheap.
  'two-cars': () => {},
  'one-car': (ctx) => {
    ctx.attrs.smartevse_2_plug_state = 'Disconnected';
    ctx.attrs.smartevse_2_state = 'Disconnected';
    delete ctx.plan.chargers.smartevse_2;
    ctx.plan.connected_count = 1;
  },
  'no-car': (ctx) => {
    for (const key of ['smartevse_1', 'smartevse_2']) {
      ctx.attrs[`${key}_plug_state`] = 'Disconnected';
      ctx.attrs[`${key}_state`] = 'Disconnected';
    }
    Object.assign(ctx.plan, { chargers: {}, status: 'no_ev', next_charge: null, connected_count: 0 });
    ctx.attrs.charge_reason = 'intelligent_waiting_for_connected_ev';
  },
  charging: (ctx) => {
    Object.assign(ctx.attrs, { smartevse_1_state: 'Charging', smartevse_1_charge_current: 16, active_smartevse_raw: 'smartevse_1',
      charge_allowed: true, charge_reason: 'intelligent_charging' });
    ctx.plan.status = 'charging';
    ctx.plan.chargers.smartevse_1.status = 'charging';
    ctx.plan.chargers.smartevse_1.blocks[0] = { start: new Date(ctx.now - ctx.hour / 2).toISOString(), end: new Date(ctx.now + ctx.hour).toISOString(), top_up: false };
  },
  'at-risk': (ctx) => {
    ctx.plan.status = 'at_risk';
    Object.assign(ctx.plan.chargers.smartevse_2, { status: 'at_risk', feasible: false, projected_soc: 74 });
  },
  // Every period tone at once: the longest legend and readout the chart can show.
  'charging-at-risk': (ctx) => {
    Object.assign(ctx.attrs, { smartevse_1_state: 'Charging', smartevse_1_charge_current: 16, active_smartevse_raw: 'smartevse_1',
      charge_allowed: true, charge_reason: 'intelligent_charging' });
    ctx.plan.status = 'at_risk';
    ctx.plan.chargers.smartevse_1.status = 'charging';
    ctx.plan.chargers.smartevse_1.blocks[0] = { start: new Date(ctx.now - ctx.hour / 2).toISOString(), end: new Date(ctx.now + ctx.hour).toISOString(), top_up: false };
    Object.assign(ctx.plan.chargers.smartevse_2, { status: 'at_risk', feasible: false, projected_soc: 74 });
  },
  'both-ready': (ctx) => {
    for (const key of ['smartevse_1', 'smartevse_2']) {
      Object.assign(ctx.plan.chargers[key], { status: 'reached', soc: 82, blocks: [], need_kwh: 0, top_up: false, extra_soc: null });
      ctx.attrs[`${key}_battery`] = '82%';
    }
    Object.assign(ctx.plan, { status: 'reached', next_charge: null });
    ctx.attrs.charge_reason = 'intelligent_targets_reached';
  },
  'charger-error': (ctx) => {
    ctx.attrs.smartevse_2_error = 'Residual current monitor tripped, check the cable';
  },
  unreachable: (ctx) => {
    ctx.attrs.smartevse_2_available = false;
  },
  unidentified: (ctx) => {
    ctx.attrs.smartevse_2_connected_ev = 'unknown';
    ctx.attrs.smartevse_2_battery = 'n/a';
    Object.assign(ctx.plan.chargers.smartevse_2, { vehicle: null, vehicle_name: '', settings_key: 'other', soc: null, estimated: true, status: 'planned' });
  },
  'long-name': (ctx, longName) => {
    ctx.attrs.smartevse_1_connected_ev = longName;
    ctx.plan.chargers.smartevse_1.vehicle_name = longName;
    ctx.plan.vehicles.vehicle_1.name = longName;
  },
  'force-override': (ctx) => {
    ctx.states['switch.smartevse_dual_charger_force_charge'].state = 'on';
    ctx.plan.overridden_by = 'force';
    Object.assign(ctx.attrs, { charge_allowed: true, charge_reason: 'force_charge' });
  },
  // Integration 0.0.9.x: a top-up switch and price, no learned limit and no extra_soc.
  'legacy-0-0-9': (ctx) => {
    const topUp = 'switch.smartevse_dual_charger_intelligent_top_up';
    const topUpPrice = 'number.smartevse_dual_charger_intelligent_top_up_price';
    ctx.states[topUp] = { state: 'on', attributes: {} };
    ctx.states[topUpPrice] = { state: '0.200', attributes: { min: -1, max: 5, step: 0.001, unit_of_measurement: 'EUR/kWh' } };
    Object.assign(ctx.plan.entities, { intelligent_top_up: topUp, intelligent_top_up_price: topUpPrice });
    ctx.plan.top_up = { enabled: true, price: 0.2 };
    for (const charger of Object.values(ctx.plan.chargers)) delete charger.extra_soc;
  },
  'negative-prices': (ctx) => {
    const known = ctx.plan.slots.filter((slot) => slot.kind === 'known');
    known.forEach((slot, index) => { slot.price = [0.12, 0.04, 0, -0.03, -0.08, 0.02, 0.15][index % 7]; });
  },
  'twelve-hour': (ctx) => {
    ctx.locale.language = 'en-US';
    ctx.locale.time_format = '12';
  },
};

const failures = [];
let checks = 0;
const page = await browser.newPage({ viewport: { width: 1100, height: 1500 }, deviceScaleFactor: 2 });
const notes = new Set();
page.on('pageerror', (error) => {
  // WebKit reports this benign notice as an error when the shared chart re-measures its width in
  // the frame it was first drawn in. It is noted, not counted.
  if (/ResizeObserver loop/.test(error.message)) { notes.add(error.message); return; }
  console.log(`FAIL: page error — ${error.message}`);
  failures.push(`page error: ${error.message}`);
});
const screenshotDir = process.env.LAYOUT_SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });

for (const theme of THEMES) {
  await page.goto(`${origin}/preview/index.html?theme=${theme}`);
  await page.waitForFunction(() => customElements.get('smartevse-flow-card'));
  for (const width of WIDTHS) {
    for (const [name, mutate] of Object.entries(STATES)) {
      const result = await page.evaluate(async ({ width, mutateSource, longName }) => {
        const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const frame = document.getElementById('frame');
        frame.style.transition = 'none';
        frame.style.width = `${width}px`;
        // eslint-disable-next-line no-undef
        resetScenario('intelligent');
        const card = document.querySelector('smartevse-flow-card');
        await card.updateComplete;
        const hass = card._hass;
        const controller = Object.keys(hass.states).find((id) => hass.states[id]?.attributes?.intelligent);
        const attrs = hass.states[controller].attributes;
        const locale = { ...(hass.locale || {}) };
        // eslint-disable-next-line no-new-func
        new Function('ctx', 'longName', `(${mutateSource})(ctx, longName)`)(
          { attrs, plan: attrs.intelligent, states: hass.states, hour: 3600000, now: Date.now(), locale }, longName);
        card._lastRenderKey = '';
        card.hass = { ...hass, locale };
        await card.updateComplete;
        await settle();
        await card.updateComplete;
        await settle();

        const shadow = card.shadowRoot;
        const haCard = shadow.querySelector('ha-card');
        const cardRect = haCard.getBoundingClientRect();
        const problems = [];
        const inside = (inner, outer, slack = 1) => inner.left >= outer.left - slack && inner.right <= outer.right + slack &&
          inner.top >= outer.top - slack && inner.bottom <= outer.bottom + slack;
        const describe = (node) => `${node.parentElement?.getAttribute('class') || node.parentElement?.localName}: "${node.textContent.trim().slice(0, 40)}"`;
        // 1. No text leaves its tile, the chart frame or the card.
        const walker = document.createTreeWalker(haCard, NodeFilter.SHOW_TEXT);
        let texts = 0;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement;
          if (!node.textContent.trim() || !parent || parent.closest('style, .family-visually-hidden')) continue;
          const svgText = parent.closest('text');
          // The period line under the chart cuts text that does not fit with an ellipsis.
          const clipped = parent.closest('.family-chart-periods');
          let rect;
          if (svgText) rect = svgText.getBoundingClientRect();
          else if (clipped) rect = clipped.getBoundingClientRect();
          else {
            const range = document.createRange();
            range.selectNodeContents(node);
            rect = range.getBoundingClientRect();
          }
          if (!rect.width || !rect.height) continue;
          texts++;
          if (!inside(rect, cardRect)) problems.push(`text leaves the card — ${describe(node)}`);
          const box = parent.closest('.ev-pod, .family-chart-frame, .status-hero, .plan-totals > div');
          if (box && !inside(rect, box.getBoundingClientRect())) problems.push(`text leaves its tile — ${describe(node)}`);
        }
        if (!texts) problems.push('no visible text was found');
        // 2. The 0.4.0 bug: a narrow element that wraps its text one or two letters per line.
        for (const element of shadow.querySelectorAll('.ev-pod, .ev-pod *')) {
          const own = [...element.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
          const text = own.map((child) => child.textContent.trim()).join(' ');
          if (text.length <= 3 || element.closest('svg')) continue;
          const tops = new Set();
          for (const child of own) {
            const range = document.createRange();
            range.selectNodeContents(child);
            for (const line of range.getClientRects()) tops.add(Math.round(line.top));
          }
          const elementWidth = element.getBoundingClientRect().width;
          if (elementWidth < 40 && tops.size > 3) problems.push(`"${text.slice(0, 30)}" is ${Math.round(elementWidth)}px wide on ${tops.size} lines`);
        }
        // 2b. Plan rows: the label stays on one line; the value never breaks inside a word.
        for (const row of shadow.querySelectorAll('.plan-row')) {
          const label = row.querySelector('dt');
          const value = row.querySelector('dd');
          if (label.getClientRects().length !== 1 || label.getBoundingClientRect().height > 22) problems.push(`row label "${label.textContent}" wraps`);
          const range = document.createRange();
          range.selectNodeContents(value);
          const lines = new Set([...range.getClientRects()].map((line) => Math.round(line.top))).size;
          const words = value.textContent.trim().split(/\s+/).length;
          if (lines > words) problems.push(`row value "${value.textContent}" breaks inside a word (${lines} lines)`);
          if (lines > 3) problems.push(`row value "${value.textContent}" takes ${lines} lines`);
        }
        // 3. Chart and gauge labels are a constant, readable size, and time labels do not touch.
        const svg = shadow.querySelector('.family-chart-frame svg.family-chart');
        if (svg) {
          const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
          for (const label of svg.querySelectorAll('text')) {
            const size = Number.parseFloat(getComputedStyle(label).fontSize) * scale;
            if (!(size >= 10.5)) problems.push(`chart label "${label.textContent}" is ${size.toFixed(1)}px`);
          }
          const ticks = [...svg.querySelectorAll('.family-chart-time')].map((tick) => tick.getBoundingClientRect()).sort((a, b) => a.left - b.left);
          if (!ticks.length) problems.push('the chart has no time labels');
          ticks.forEach((tick, index) => {
            if (index && tick.left < ticks[index - 1].right + 1) problems.push(`time labels ${index - 1} and ${index} overlap`);
          });
          const legend = shadow.querySelector('.family-chart-legend');
          const legendLines = new Set([...legend.children].map((entry) => Math.round(entry.getBoundingClientRect().top))).size;
          if (legendLines > 2) problems.push(`the chart legend takes ${legendLines} lines`);
          const head = shadow.querySelector('.family-chart-head');
          if (head.getBoundingClientRect().height > 30) problems.push(`the chart head takes ${Math.round(head.getBoundingClientRect().height)}px (more than one line)`);
          // The line under the chart: there with lanes, always one line, so the frame never jumps.
          const periodLine = shadow.querySelector('.family-chart-periods');
          const hasLanes = !!svg.querySelector('.family-chart-lane');
          if (hasLanes !== !!periodLine) problems.push(hasLanes ? 'the period line under the chart is missing' : 'a period line is shown without lanes');
          if (periodLine && periodLine.getBoundingClientRect().height > 24) problems.push(`the period line is ${Math.round(periodLine.getBoundingClientRect().height)}px tall`);
        } else problems.push('the plan chart is missing');
        for (const unit of shadow.querySelectorAll('.pod-unit')) {
          const size = Number.parseFloat(getComputedStyle(unit).fontSize);
          if (!(size >= 10.5)) problems.push(`gauge caption is ${size.toFixed(1)}px`);
        }
        if (Math.abs(cardRect.width - width) > 1) problems.push(`the card is ${cardRect.width}px wide, expected ${width}px`);
        if (!haCard.classList.contains('layout-plan')) problems.push('the card is not in the plan layout');
        return { problems, texts };
      }, { width, mutateSource: mutate.toString(), longName: LONG_NAME });
      checks++;
      const label = `${name} @ ${width}px ${theme}`;
      console.log(`${result.problems.length ? 'FAIL' : 'PASS'}: ${label}${result.problems.length ? `\n  - ${result.problems.join('\n  - ')}` : ''}`);
      if (result.problems.length) failures.push(label);
      if (screenshotDir) await page.locator('#frame').screenshot({ path: path.join(screenshotDir, `${name}-${width}-${theme}.png`) });
    }
  }
}

await browser.close();
server.close();
for (const note of notes) console.log(`NOTE: the page reported "${note}"`);
console.log(failures.length ? `\nLAYOUT TEST FAILED (${failures.length} of ${checks})` : `\nLAYOUT TEST OK (${checks} states)`);
process.exit(failures.length ? 1 : 0);
