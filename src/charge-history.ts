// When each charger actually charged, for the lanes under the price chart. The plan in the
// controller's payload only knows what is still to come; what already happened today comes from
// the recorder history of the two charger state sensors, which change a handful of times a day.

/** A time range in which a charger reported Charging. `open` means it still did when the history was read. */
export interface ChargedInterval {
  start: number;
  end: number;
  open?: boolean;
}

export const CHARGING_STATE = "Charging";
/** A pause shorter than this joins its neighbours: one missed poll is not a new charging period. */
export const CHARGED_JOIN_MS = 60_000;
const REFRESH_MS = 10 * 60_000;
const RETRY_MS = 60_000;
// The recorder commits every few seconds; a history read right after a state change can miss it.
const SETTLE_MS = 10_000;

interface HistoryRow {
  s?: unknown;
  state?: unknown;
  lu?: unknown;
  lc?: unknown;
  last_changed?: unknown;
  last_updated?: unknown;
}

interface StateLike {
  state?: unknown;
  last_changed?: unknown;
}

interface HistoryHass {
  states?: Record<string, StateLike | undefined>;
  callWS?: (message: Record<string, unknown>) => Promise<unknown>;
}

function rowTime(row: HistoryRow): number {
  // Compressed rows carry epoch seconds (`lc` only when it differs from `lu`); plain rows ISO strings.
  for (const value of [row.lc, row.lu]) {
    const seconds = Number(value);
    if (value !== undefined && value !== null && Number.isFinite(seconds)) return seconds * 1000;
  }
  for (const value of [row.last_changed, row.last_updated]) {
    const time = typeof value === "string" ? Date.parse(value) : NaN;
    if (Number.isFinite(time)) return time;
  }
  return NaN;
}

/** Joins ranges that overlap or lie within `CHARGED_JOIN_MS` of each other; drops empty ones. */
export function joinIntervals(intervals: ChargedInterval[]): ChargedInterval[] {
  const sorted = intervals.filter((item) => item.end > item.start).sort((left, right) => left.start - right.start);
  const joined: ChargedInterval[] = [];
  for (const item of sorted) {
    const last = joined[joined.length - 1];
    if (last && item.start - last.end <= CHARGED_JOIN_MS) {
      if (item.end >= last.end) {
        last.end = item.end;
        if (item.open) last.open = true;
        else delete last.open;
      }
    } else joined.push({ start: item.start, end: item.end, ...(item.open ? { open: true } : {}) });
  }
  return joined;
}

/**
 * The ranges of [start, end] in which the history rows of one state sensor read Charging. The
 * last row holds until `end`; when it is Charging the last range is `open`.
 */
export function chargedIntervals(rows: unknown, start: number, end: number): ChargedInterval[] {
  if (!Array.isArray(rows)) return [];
  const states = rows
    .map((row: HistoryRow) => ({ time: rowTime(row ?? {}), charging: String((row ?? {}).s ?? (row ?? {}).state ?? "") === CHARGING_STATE }))
    .filter((row) => Number.isFinite(row.time))
    .sort((left, right) => left.time - right.time);
  const intervals: ChargedInterval[] = [];
  states.forEach((row, index) => {
    if (!row.charging) return;
    const next = states[index + 1];
    const from = Math.max(start, row.time);
    const to = Math.min(end, next ? next.time : end);
    if (to > from) intervals.push({ start: from, end: to, ...(next ? {} : { open: true }) });
  });
  return joinIntervals(intervals);
}

/**
 * History as read, brought up to `now` with the sensor's live state: an open range runs on while
 * the charger still charges and ends where it stopped, and charging that began after the read is
 * added from the live state's last change.
 */
export function withLiveState(intervals: ChargedInterval[], live: StateLike | undefined, start: number, now: number): ChargedInterval[] {
  const charging = String(live?.state ?? "") === CHARGING_STATE;
  const changed = typeof live?.last_changed === "string" ? Date.parse(live.last_changed) : NaN;
  const result = intervals.map((item) => {
    if (!item.open) return { start: item.start, end: Math.min(item.end, now) };
    if (charging) return { start: item.start, end: now, open: true };
    // It stopped after the read: the live state's last change is when (never before the read).
    return { start: item.start, end: Math.min(now, Number.isFinite(changed) ? Math.max(item.end, changed) : item.end) };
  });
  if (charging && Number.isFinite(changed)) result.push({ start: Math.max(start, Math.min(changed, now)), end: now, open: true });
  return joinIntervals(result);
}

/**
 * Reads and caches the charging history of the charger state sensors from the start of the chart
 * window. `intervals()` is synchronous: it returns what is known and starts a read when the
 * window or the sensors changed, a state changed since the last read, or the read is ten minutes
 * old. `onChange` runs when a read brought new data.
 */
export class ChargeHistory {
  private key = "";
  private data: Record<string, ChargedInterval[]> = {};
  // Where the charging that the live state shows began, kept until the next read has it.
  private tails: Record<string, number> = {};
  private readAt = 0;
  private failedAt = 0;
  private pending = false;
  private generation = 0;

  constructor(private readonly onChange: () => void) {}

  intervals(hass: HistoryHass | undefined, entities: Record<string, string>, start: number, now: number = Date.now()): Record<string, ChargedInterval[]> {
    const keys = Object.keys(entities).filter((key) => entities[key] && hass?.states?.[entities[key]]);
    const key = `${start}|${keys.map((name) => `${name}=${entities[name]}`).join("|")}`;
    if (key !== this.key) {
      this.key = key;
      this.data = {};
      this.tails = {};
      this.readAt = 0;
      this.failedAt = 0;
      this.generation++;
      this.pending = false;
    }
    if (keys.length && typeof hass?.callWS === "function" && !this.pending && this.due(hass, entities, keys, now)) {
      void this.read(hass, entities, keys, start, now);
    }
    const result: Record<string, ChargedInterval[]> = {};
    for (const name of keys) {
      const live = hass?.states?.[entities[name]];
      let items = withLiveState(this.data[name] || [], live, start, now);
      const open = items.find((item) => item.open);
      if (open) this.tails[name] = open.start;
      else if (this.tails[name] !== undefined) {
        // It stopped since the last read: what the live state showed stays, up to the stop.
        const changed = Date.parse(String(live?.last_changed ?? ""));
        items = joinIntervals([...items, { start: this.tails[name], end: Number.isFinite(changed) ? Math.min(now, changed) : now }]);
      }
      result[name] = items.filter((item) => item.end > start);
    }
    return result;
  }

  private due(hass: HistoryHass, entities: Record<string, string>, keys: string[], now: number): boolean {
    if (this.failedAt && now - this.failedAt < RETRY_MS) return false;
    if (!this.readAt) return true;
    if (now - this.readAt >= REFRESH_MS) return true;
    return keys.some((name) => {
      const changed = Date.parse(String(hass.states?.[entities[name]]?.last_changed ?? ""));
      return Number.isFinite(changed) && changed > this.readAt && now - changed >= SETTLE_MS;
    });
  }

  private async read(hass: HistoryHass, entities: Record<string, string>, keys: string[], start: number, now: number): Promise<void> {
    const generation = this.generation;
    this.pending = true;
    try {
      const response = await hass.callWS!({
        type: "history/history_during_period",
        start_time: new Date(start).toISOString(),
        end_time: new Date(now).toISOString(),
        entity_ids: keys.map((name) => entities[name]),
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      if (generation !== this.generation) return;
      const rows = response && typeof response === "object" ? response as Record<string, unknown> : {};
      const data: Record<string, ChargedInterval[]> = {};
      for (const name of keys) data[name] = chargedIntervals(rows[entities[name]], start, now);
      const changed = JSON.stringify(data) !== JSON.stringify(this.data) || !this.readAt;
      this.data = data;
      this.tails = {};
      this.readAt = now;
      this.failedAt = 0;
      if (changed) this.onChange();
    } catch {
      // No recorder, or no right to read history: the chart keeps the plan and the live state.
      if (generation === this.generation) this.failedAt = now;
    } finally {
      if (generation === this.generation) this.pending = false;
    }
  }
}
