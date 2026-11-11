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
  // Two cars, both planned (integration 0.0.11.0): the XC40 goes on to its car limit, the EX30's
  // charging above the minimum waits for tomorrow's prices.
  'two-cars': () => {},
  // The owner's morning: the XC40 is at its car limit, the EX30 reached its minimum and charges on
  // until its ready-by. Its glow is lit right above the totals row.
  'above-minimum-charging': (ctx) => {
    Object.assign(ctx.attrs, { smartevse_2_state: 'Charging', smartevse_2_charge_current: 16, active_smartevse_raw: 'smartevse_2',
      charge_allowed: true, charge_reason: 'intelligent_top_up', smartevse_1_battery: '90%', smartevse_2_battery: '70%' });
    Object.assign(ctx.plan, { status: 'reached', next_charge: null });
    ctx.plan.top_up.waits_until = null;
    Object.assign(ctx.plan.chargers.smartevse_1, { status: 'reached', soc: 90, minimum: 90, target: 90, car_limit: 90, need_kwh: 0, blocks: [],
      top_up: false, extra_soc: null, projected_soc: 90, planned_kwh: 0, planned_cost: 0 });
    ctx.attrs.charging_costs.chargers.smartevse_1.session = { ...ctx.attrs.charging_costs.chargers.smartevse_1.session, status: 'active', energy_kwh: 29.4, priced_kwh: 29.4, cost: 7.57 };
    ctx.attrs.charging_costs.chargers.smartevse_2.session = { ...ctx.attrs.charging_costs.chargers.smartevse_1.session, id: 'ex30', vehicle: 'Volvo EX30', energy_kwh: 4.1, priced_kwh: 4.1, cost: 0.92 };
    Object.assign(ctx.plan.totals, { cost: 9.6, saving: 7.41 });
    Object.assign(ctx.plan.chargers.smartevse_2, { status: 'reached', soc: 70, minimum: 70, target: 70, car_limit: 100, need_kwh: 0, projected_soc: 70,
      top_up: true, extra_soc: 77, extra_waits_until: null, queue_after: null, planned_kwh: 4.6, planned_cost: 1.11,
      blocks: [{ start: new Date(ctx.now - ctx.hour / 4).toISOString(), end: new Date(ctx.now + ctx.hour / 2).toISOString(), top_up: true }] });
  },
  // A long Extra value in a narrow tile: the plan stops short of the car limit.
  'extra-short-of-limit': (ctx) => {
    Object.assign(ctx.plan.chargers.smartevse_1, { car_limit: 100, extra_soc: 86 });
  },
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
  // Integration 0.0.10.0: charging above the minimum only under a learned price.
  'learned-0-0-10': (ctx) => {
    ctx.plan.top_up = { enabled: true, price: 0.26, source: 'learned' };
    for (const charger of Object.values(ctx.plan.chargers)) delete charger.extra_waits_until;
    Object.assign(ctx.plan.chargers.smartevse_1, { car_limit: 100, extra_soc: 92 });
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
  // The classic layout keeps the same rule: glows stay beneath its tiles.
  'classic-charging': (ctx) => {
    Object.assign(ctx.attrs, { smartevse_1_state: 'Charging', smartevse_1_charge_current: 16, active_smartevse_raw: 'smartevse_1',
      charge_allowed: true, charge_reason: 'intelligent_charging' });
    ctx.plan.status = 'charging';
    ctx.plan.chargers.smartevse_1.status = 'charging';
    ctx.card._layoutOverride = 'classic';
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

// Glows stay beneath every tile (card style guide, "Surfaces and glow"): with the glows switched
// off, the inside of every foreground surface and every piece of text must paint exactly as with
// them on. The halo may only show in the gaps between surfaces. This compares real pixels, not
// CSS: a `position: absolute; z-index: 0` glow paints above any neighbour that is not a positioned
// foreground surface, and shows through one that is not opaque (the 0.5.x totals row was both).
const GLOW_WIDTHS = new Set([320, 390]);
const GLOW_STATES = new Set(['two-cars', 'above-minimum-charging', 'one-car', 'no-car', 'charging', 'charging-at-risk', 'charger-error',
  'both-ready', 'classic-charging']);
const SURFACES = '.status-hero, .ev-node, .plan-saving, .plan-chart, .charging-history-launcher, .family-notice, .family-surface';
async function glowLeaks(page) {
  const prepare = (hideGlows) => page.evaluate(({ hideGlows, selector }) => {
    const shadow = document.querySelector('smartevse-flow-card').shadowRoot;
    shadow.getElementById('layout-test-glow')?.remove();
    const style = document.createElement('style');
    style.id = 'layout-test-glow';
    // Frozen, so both pictures show the same frame of every ring, period and glow.
    style.textContent = `*, *::before, *::after { animation: none !important; transition: none !important; }
      ${hideGlows ? '.glow-under { display: none !important; }' : ''}`;
    shadow.appendChild(style);
    const haCard = shadow.querySelector('ha-card');
    const card = haCard.getBoundingClientRect();
    const lit = (glow) => { const css = getComputedStyle(glow); return css.display !== 'none' && css.opacity !== '0' && css.boxShadow !== 'none'; };
    const areas = [];
    for (const element of shadow.querySelectorAll(selector)) {
      const rect = element.getBoundingClientRect();
      // The corners outside a rounded surface are a gap: stay inside the rounding.
      const radius = Math.max(...getComputedStyle(element).borderRadius.split(/[\s/]+/).map((value) => Number.parseFloat(value) || 0));
      const inset = Math.ceil(Math.min(radius, rect.width / 2, rect.height / 2) * 0.3) + 2;
      const name = `${element.localName}.${String(element.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.')}`;
      areas.push({ name, x: rect.left + inset, y: rect.top + inset, width: rect.width - 2 * inset, height: rect.height - 2 * inset });
    }
    const walker = document.createTreeWalker(haCard, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!node.textContent.trim() || !parent || parent.closest('style, .family-visually-hidden, .glow-under')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        areas.push({ name: `text "${node.textContent.trim().slice(0, 24)}"`, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
      }
    }
    return {
      glows: [...shadow.querySelectorAll('.glow-under')].filter(lit).length,
      surfaces: shadow.querySelectorAll(selector).length,
      clip: { x: card.left, y: card.top, width: card.width, height: card.height },
      areas: areas.filter((area) => area.width > 2 && area.height > 2),
    };
  }, { hideGlows, selector: SURFACES });
  const on = await prepare(false);
  const withGlow = await page.screenshot({ clip: on.clip });
  const off = await prepare(true);
  const withoutGlow = await page.screenshot({ clip: off.clip });
  await page.evaluate(() => document.querySelector('smartevse-flow-card').shadowRoot.getElementById('layout-test-glow')?.remove());
  if (JSON.stringify(on.areas) !== JSON.stringify(off.areas)) {
    return { problems: ['the layout changed between the two glow pictures'], glows: on.glows, surfaces: on.surfaces };
  }
  // Decoded and compared in the page (no image library here).
  const problems = await page.evaluate(async ({ a, b, clip, areas }) => {
    const decode = async (base64) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      return { data: context.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height };
    };
    const [one, two] = await Promise.all([decode(a), decode(b)]);
    if (one.width !== two.width || one.height !== two.height) return ['the two glow pictures differ in size'];
    const scale = one.width / clip.width;
    const found = new Map();
    for (const area of areas) {
      const x0 = Math.max(0, Math.ceil((area.x - clip.x) * scale));
      const y0 = Math.max(0, Math.ceil((area.y - clip.y) * scale));
      const x1 = Math.min(one.width, Math.floor((area.x + area.width - clip.x) * scale));
      const y1 = Math.min(one.height, Math.floor((area.y + area.height - clip.y) * scale));
      let changed = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const at = (y * one.width + x) * 4;
          if (Math.abs(one.data[at] - two.data[at]) > 1 || Math.abs(one.data[at + 1] - two.data[at + 1]) > 1
            || Math.abs(one.data[at + 2] - two.data[at + 2]) > 1) changed++;
        }
      }
      if (changed) found.set(area.name, (found.get(area.name) || 0) + changed);
    }
    return [...found].map(([name, pixels]) => `a glow paints over ${name} (${pixels} px)`);
  }, { a: withGlow.toString('base64'), b: withoutGlow.toString('base64'), clip: on.clip, areas: on.areas });
  return { problems, glows: on.glows, surfaces: on.surfaces };
}

const failures = [];
let checks = 0;
let glowChecks = 0;
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
        card._layoutOverride = null;
        await card.updateComplete;
        const hass = card._hass;
        const controller = Object.keys(hass.states).find((id) => hass.states[id]?.attributes?.intelligent);
        const attrs = hass.states[controller].attributes;
        const locale = { ...(hass.locale || {}) };
        // eslint-disable-next-line no-new-func
        new Function('ctx', 'longName', `(${mutateSource})(ctx, longName)`)(
          { attrs, plan: attrs.intelligent, states: hass.states, hour: 3600000, now: Date.now(), locale, card }, longName);
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
        const classic = haCard.classList.contains('layout-classic');
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
          const box = parent.closest('.ev-pod, .family-chart-frame, .status-hero, .plan-saving');
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
        } else if (!classic) problems.push('the plan chart is missing');
        for (const unit of shadow.querySelectorAll('.pod-unit')) {
          const size = Number.parseFloat(getComputedStyle(unit).fontSize);
          if (!(size >= 10.5)) problems.push(`gauge caption is ${size.toFixed(1)}px`);
        }
        if (Math.abs(cardRect.width - width) > 1) problems.push(`the card is ${cardRect.width}px wide, expected ${width}px`);
        if (!classic && !haCard.classList.contains('layout-plan')) problems.push('the card is not in the plan layout');
        return { problems, texts };
      }, { width, mutateSource: mutate.toString(), longName: LONG_NAME });
      checks++;
      const label = `${name} @ ${width}px ${theme}`;
      if (GLOW_WIDTHS.has(width) && GLOW_STATES.has(name)) {
        const glow = await glowLeaks(page);
        glowChecks++;
        result.problems.push(...glow.problems);
        if (['charging', 'above-minimum-charging'].includes(name) && !glow.glows) result.problems.push('no glow is lit while a car charges (the glow check would prove nothing)');
        if (glow.surfaces < 3) result.problems.push(`only ${glow.surfaces} foreground surfaces were found`);
      }
      console.log(`${result.problems.length ? 'FAIL' : 'PASS'}: ${label}${result.problems.length ? `\n  - ${result.problems.join('\n  - ')}` : ''}`);
      if (result.problems.length) failures.push(label);
      if (screenshotDir) await page.locator('#frame').screenshot({ path: path.join(screenshotDir, `${name}-${width}-${theme}.png`) });
    }
  }
}

await browser.close();
server.close();
for (const note of notes) console.log(`NOTE: the page reported "${note}"`);
console.log(failures.length ? `\nLAYOUT TEST FAILED (${failures.length} of ${checks})`
  : `\nLAYOUT TEST OK (${checks} states, ${glowChecks} of them with the glow paint check)`);
process.exit(failures.length ? 1 : 0);
