import { LitElement, html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { CARD_CSS } from "./styles/card";
import {
  familyStyles, dialogStyles, componentStyles, glowStyles, FamilyFlowController, renderFamilyDialog, showEntityMoreInfo,
  UI_ICONS, TONE_ICONS, pendingIndicator, formatHassNumber, formatHassCurrency, formatHassTime, formatHassDate, formatHassDateTime,
  formatHassDuration, hassTimeZone, UNAVAILABLE_TEXT, levelMeterMarkup, batteryTone, type Tone,
} from "@bitosome/ha-card-ui";
import { buildGlow, type PulseColors } from "./shared/glow";

const CARD_VERSION = "0.4.0";

// String twin of the shared pendingIndicator(); this card renders through unsafeHTML.
const PENDING_INDICATOR = `<span class="family-pending-indicator" aria-hidden="true"></span>`;
// Warning plan lines keep readable text; the tone is the shared warning glyph in front, as on a
// family notice (an orange 12px text fails contrast on light themes).
const WARNING_GLYPH = `<ha-icon class="plan-tone-icon" icon="${TONE_ICONS.warning}" aria-hidden="true"></ha-icon>`;

// Intelligent charging: the integration owns the plan; the card only renders
// the controller's `intelligent` attribute and edits the integration entities.
const INTELLIGENT_VEHICLES = ["vehicle_1", "vehicle_2", "other"] as const;
type IntelligentVehicleKey = typeof INTELLIGENT_VEHICLES[number];
const INTELLIGENT_VEHICLE_CONFIG_PREFIX: Record<IntelligentVehicleKey, string> = {
  vehicle_1: "vehicle_1",
  vehicle_2: "vehicle_2",
  other: "other_vehicle",
};
const UNIDENTIFIED_VEHICLE = "Unidentified vehicle";
// Saving below this magnitude is noise; the integration publishes it, the card hides it.
const MIN_SAVING = 0.1;
// A realised window with less energy never carries a saving (integration REALISED_MIN_KWH),
// e.g. the empty window a deadline roll opens just before the car leaves.
const MIN_WINDOW_KWH = 0.1;
// Non-blocking controller_error values: readable notices, never "Controller error".
const CONTROLLER_WARNINGS: Record<string, string> = {
  intelligent_price_data_unavailable: "Prices unavailable · charging by deadline",
  intelligent_planner_failed: "Plan unavailable · charging by deadline",
  intelligent_model_unavailable: "Learned data unavailable · using defaults",
  vehicle_mapping_ambiguous: "Vehicles cannot be told apart yet",
};
const CONTROLLER_WARNING_PATTERNS: Array<[RegExp, string]> = [
  [/^smartevse_[12]_vehicle_timer_blocks_charging$/, "Car’s own charging timer is on"],
  [/^smartevse_[12]_vehicle_data_unavailable$/, "Vehicle data unavailable"],
  [/^smartevse_[12]_vehicle_data_stale$/, "Vehicle data out of date"],
];
const CONTROLLER_ERRORS: Record<string, string> = {
  mains_data_unavailable: "Mains data unavailable",
  price_sensor_unavailable: "Electricity price unavailable",
  schedule_entity_unavailable: "Charging schedule unavailable",
  smartevse_api_unavailable: "Charger connection unavailable",
  smartevse_1_api_unavailable: "SmartEVSE 1 connection unavailable",
  smartevse_2_api_unavailable: "SmartEVSE 2 connection unavailable",
  smartevse_1_state_oscillation: "SmartEVSE 1 keeps switching state",
  smartevse_2_state_oscillation: "SmartEVSE 2 keeps switching state",
};

interface IntelligentEntityIds {
  switch: string;
  topUp: string;
  topUpPrice: string;
  status: string;
  plannedCost: string;
  plannedSaving: string;
  nextCharge: string;
  vehicles: Record<IntelligentVehicleKey, { readyBy: string; minimum: string }>;
}

const ACTIVE_GLOW: PulseColors = {
  weak: "rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha))",
  strong: "rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha))",
};

interface UiFocusSnapshot {
  key: string;
  selectionStart?: number;
  selectionEnd?: number;
  selectionDirection?: "forward" | "backward" | "none";
}

interface HassEntity {
  state: string;
  attributes?: Record<string, any>;
}

interface HassLocale {
  language?: string;
  number_format?: string;
  time_format?: string;
  time_zone?: string;
}

interface HomeAssistant {
  states: Record<string, HassEntity | undefined>;
  locale?: HassLocale;
  config?: { time_zone?: string; currency?: string };
  callService(domain: string, service: string, data?: Record<string, any>): Promise<unknown>;
}

interface SmartEvseCardConfig {
  type?: string;
  currency?: string;
  controller_entity: string;
  price_entity?: string;
  schedule_entity?: string;
  schedule_switch_entity?: string;
  schedule_price_entity?: string;
  force_charge_entity?: string;
  force_price_entity?: string;
  force_timer_entity?: string;
  acceptable_price_entity?: string;
  charge_policy_entity?: string;
  duty_cycle_entity?: string;
  force_charge_duration_entity?: string;
  duty_remaining_entity?: string;
  timer_remaining_entity?: string;
  // Optional Intelligent charging overrides; otherwise the controller's intelligent.entities.
  intelligent_charge_entity?: string;
  intelligent_top_up_entity?: string;
  intelligent_top_up_price_entity?: string;
  vehicle_1_ready_by_entity?: string;
  vehicle_1_minimum_charge_entity?: string;
  vehicle_2_ready_by_entity?: string;
  vehicle_2_minimum_charge_entity?: string;
  other_vehicle_ready_by_entity?: string;
  other_vehicle_minimum_charge_entity?: string;
  intelligent_status_entity?: string;
  intelligent_planned_cost_entity?: string;
  intelligent_planned_saving_entity?: string;
  intelligent_next_charge_entity?: string;
  // "plan" (night timeline and car gauges) or "classic" (the pre-0.4.0 tiles). Without it:
  // "plan" when the integration supports Intelligent charging. The card's Settings page can
  // override it per browser.
  layout?: "plan" | "classic";
  [key: string]: unknown;
}

type DialogPage = "plan" | "schedule" | "now" | "intelligent" | "settings" | "history" | `setting:${string}` | `charger:${string}`;
class SmartEVSEFlowCard extends LitElement {
  private _flow = new FamilyFlowController<DialogPage>(this, {
    guard: (intent) => this._dialogGuard(intent),
    onChange: (route) => {
      this._settingsSession++;
      this._editingEntity = route?.startsWith("setting:") ? route.slice(8) : null;
      if (this._editingEntity && !Object.prototype.hasOwnProperty.call(this._editorDrafts, this._editingEntity)) {
        this._editorDrafts[this._editingEntity] = this._state(this._editingEntity);
      }
    },
  });
  private get _settingsModalOpen() { return this._flow.current === "settings" || Boolean(this._settingsSubmenuEntity); }
  private get _settingsSubmenuEntity() {
    const route = this._flow.current;
    return route?.startsWith("setting:") ? route.slice(8) : null;
  }
  private get _forceWizardOpen() { return ["plan", "schedule", "now", "intelligent"].includes(this._flow.current || ""); }
  private get _forceWizardStep(): "choose" | "schedule" | "now" | "intelligent" {
    const route = this._flow.current;
    return route === "schedule" || route === "now" || route === "intelligent" ? route : "choose";
  }
  private get _chargerDetailsKey() {
    const route = this._flow.current;
    return route?.startsWith("charger:") ? route.slice(8) : null;
  }

  private _hass?: HomeAssistant;
  private _config?: SmartEvseCardConfig;
  private _currency = "EUR/kWh";
  private _editingEntity: string | null = null;
  private _editorDrafts: Record<string, string> = {};
  private _settingsError = "";
  private _settingsBusy = false;
  private _settingsSession = 0;
  private get _writePending() { return this._settingsBusy || this._forceWizardBusy; }
  private _schedulePriceGate = false;
  private _forcePlanEnabled = false;
  private _forceNowTimer = false;
  private _forceNowPrice = false;
  private _forceWizardBusy = false;
  private _forceWizardError = "";
  // The control whose write is in flight; it shows the pending indicator and aria-busy.
  private _pendingControl = "";
  private _lastRenderKey = "";
  // unsafeHTML replaces the subtree: preserve user-owned UI state explicitly.
  private _detailsOpen = new Map<string, boolean>();
  private _pendingUiFocus: UiFocusSnapshot | null = null;
  private _busyUiFocus: UiFocusSnapshot | null = null;
  private _dialogReturnFocus: UiFocusSnapshot | null = null;
  private _renderedDialogKey = "";
  private _nativeHandoff = false;
  // True while Lit replaces the markup: removing a focused time field is not a commit.
  private _domUpdating = false;
  // Intelligent settings fields (ready-by, minimum, top-up price) save per field, outside the
  // plan-wide pending state, so other controls and Back stay usable during a save.
  private _fieldWrites = new Map<string, { value: string; source: "field" | "suggest" }>();
  // A newer value entered while its field was saving; written when that save ends.
  private _fieldQueued = new Map<string, "field" | "suggest">();
  // Blur commits waiting until the press that moved focus has delivered its click.
  private _fieldDeferred = new Set<string>();
  // The last value each field wrote and the state it replaced, until Home Assistant reports the
  // change: the written value counts as current, so it is neither written twice nor unsaved.
  private _fieldWritten = new Map<string, { value: string; before: string }>();
  // The field whose invalid entry set the current error, so its correction can clear it.
  private _fieldError = { entityId: "", message: "" };
  private _pointerDown = false;
  private _deferredFallback?: ReturnType<typeof setTimeout>;
  private _pointerReleased = () => {
    if (!this._pointerDown) return;
    this._pointerDown = false;
    if (this._fieldDeferred.size) setTimeout(() => this._flushDeferredCommits(), 0);
  };

  static styles = [familyStyles, dialogStyles, componentStyles, glowStyles];

  static getStubConfig() {
    return {
      type: "custom:smartevse-flow-card",
      controller_entity: "sensor.smartevse_dual_charger_controller_state",
      price_entity: "sensor.real_electricity_price_current_price",
      schedule_entity: "schedule.charge_schedule",
      schedule_switch_entity: "switch.smartevse_dual_charger_charge_with_schedule",
      schedule_price_entity: "switch.smartevse_dual_charger_schedule_acceptable_price",
      force_charge_entity: "switch.smartevse_dual_charger_force_charge",
      force_price_entity: "switch.smartevse_dual_charger_force_charge_by_price",
      force_timer_entity: "switch.smartevse_dual_charger_force_charge_timer",
      acceptable_price_entity: "number.smartevse_dual_charger_acceptable_price",
      charge_policy_entity: "select.smartevse_dual_charger_charge_policy",
      duty_cycle_entity: "number.smartevse_dual_charger_duty_cycle",
      force_charge_duration_entity: "number.smartevse_dual_charger_force_charge_duration",
      duty_remaining_entity: "sensor.smartevse_dual_charger_duty_cycle_remaining",
      timer_remaining_entity: "sensor.smartevse_dual_charger_timer_remaining",
    };
  }

  setConfig(config: SmartEvseCardConfig) {
    if (!config.controller_entity) {
      throw new Error("controller_entity is required");
    }
    this._config = {
      schedule_price_entity: "switch.smartevse_dual_charger_schedule_acceptable_price",
      ...config,
    };
    this._currency = config.currency || "EUR/kWh";
    this._loadPlanPreferences();
    this._loadLayoutPreference();
    this.requestUpdate();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    for (const [entityId, written] of this._fieldWritten) {
      if (this._intelligentFieldState(entityId) !== written.before) this._fieldWritten.delete(entityId);
    }
    if (!this._writePending && (!this._forceWizardOpen || this._forceWizardStep === "choose")) {
      this._syncPlanPreferencesFromEntities();
    }
    if (this._editingEntity) {
      if (this._isAvailable(this._editingEntity)) return;
      this._editingEntity = null;
      this._settingsError = "This setting is unavailable. Check its connection and try again.";
    }
    const renderKey = this._buildRenderKey();
    if (renderKey === this._lastRenderKey) {
      return;
    }
    this._lastRenderKey = renderKey;
    this._render();
  }

  getCardSize() {
    return 6;
  }

  connectedCallback() {
    super.connectedCallback();
    // A press may end outside the card; its release still completes a deferred field commit.
    window.addEventListener("pointerup", this._pointerReleased, true);
    window.addEventListener("pointercancel", this._pointerReleased, true);
  }

  disconnectedCallback() {
    window.removeEventListener("pointerup", this._pointerReleased, true);
    window.removeEventListener("pointercancel", this._pointerReleased, true);
    this._pointerDown = false;
    this._flushDeferredCommits();
    super.disconnectedCallback();
  }

  _entity(entityId) {
    return entityId ? this._hass?.states?.[entityId] ?? null : null;
  }

  _isAvailable(entityId) {
    const state = this._entity(entityId)?.state;
    return Boolean(state && !["unknown", "unavailable"].includes(state.toLowerCase()));
  }

  _state(entityId) {
    return this._entity(entityId)?.state ?? "";
  }

  _schedulePriceEntity() {
    const dedicatedEntity = this._config?.schedule_price_entity;
    if (dedicatedEntity && this._entity(dedicatedEntity)) {
      return dedicatedEntity;
    }
    // Keep older controller releases usable until the dedicated schedule-price
    // option introduced in integration 0.0.8.6 is installed.
    return this._config?.force_price_entity;
  }

  _supportsIndependentPlans() {
    return Boolean(this._config?.schedule_price_entity && this._entity(this._config.schedule_price_entity));
  }

  // The controller's `intelligent` payload (integration 0.0.9.0+), or null.
  _intelligent(): Record<string, any> | null {
    const value = this._attr(this._config?.controller_entity, "intelligent");
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }

  // Config overrides win; otherwise the ids the integration publishes in intelligent.entities.
  _intelligentEntityIds(): IntelligentEntityIds {
    const published = this._intelligent()?.entities;
    const entities = published && typeof published === "object" ? published : {};
    const pick = (configKey: string, publishedId: unknown, domains: string[]) => {
      const configured = this._config?.[configKey];
      const id = typeof configured === "string" && configured.trim() ? configured.trim()
        : typeof publishedId === "string" ? publishedId.trim() : "";
      return id && domains.some((domain) => id.startsWith(`${domain}.`)) ? id : "";
    };
    const vehicles = {} as IntelligentEntityIds["vehicles"];
    for (const key of INTELLIGENT_VEHICLES) {
      const prefix = INTELLIGENT_VEHICLE_CONFIG_PREFIX[key];
      const vehicle = entities[key] && typeof entities[key] === "object" ? entities[key] : {};
      vehicles[key] = {
        readyBy: pick(`${prefix}_ready_by_entity`, vehicle.ready_by, ["time"]),
        minimum: pick(`${prefix}_minimum_charge_entity`, vehicle.minimum_charge, ["number", "input_number"]),
      };
    }
    return {
      switch: pick("intelligent_charge_entity", entities.intelligent_charge, ["switch", "input_boolean"]),
      topUp: pick("intelligent_top_up_entity", entities.intelligent_top_up, ["switch", "input_boolean"]),
      topUpPrice: pick("intelligent_top_up_price_entity", entities.intelligent_top_up_price, ["number", "input_number"]),
      status: pick("intelligent_status_entity", entities.status, ["sensor"]),
      plannedCost: pick("intelligent_planned_cost_entity", entities.planned_cost, ["sensor"]),
      plannedSaving: pick("intelligent_planned_saving_entity", entities.planned_saving, ["sensor"]),
      nextCharge: pick("intelligent_next_charge_entity", entities.next_charge, ["sensor"]),
      vehicles,
    };
  }

  // The feature exists only when its switch exists; older integrations show no trace of it.
  _intelligentSupported() {
    const id = this._intelligentEntityIds().switch;
    return Boolean(id && this._entity(id));
  }

  _isIntelligentPlanActive() {
    return this._intelligentSupported() && this._state(this._intelligentEntityIds().switch) === "on";
  }

  // Every editable Intelligent field shown on its page.
  _intelligentFieldEntities() {
    const ids = this._intelligentEntityIds();
    return [
      ...INTELLIGENT_VEHICLES.flatMap((key) => [ids.vehicles[key].readyBy, ids.vehicles[key].minimum]),
      ids.topUpPrice,
    ].filter((id) => id && this._entity(id));
  }

  _num(value): number | null {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  // "HH:MM" from "HH:MM" or "HH:MM:SS" (time inputs and HA time states differ); "" when invalid.
  _normaliseClock(value) {
    const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(value ?? "").trim());
    if (!match) return "";
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return "";
    return `${String(hours).padStart(2, "0")}:${match[2]}`;
  }

  // A wall-clock "HH:MM" in the HA profile's 12/24-hour format (not an instant: no zone shift).
  _formatClock(value) {
    const clock = this._normaliseClock(value);
    if (!clock) return UNAVAILABLE_TEXT;
    const [hours, minutes] = clock.split(":").map(Number);
    const utc = { ...(this._hass || {}), locale: { ...(this._hass?.locale || {}), time_zone: "server" }, config: { ...(this._hass?.config || {}), time_zone: "UTC" } };
    return formatHassTime(utc, Date.UTC(2000, 0, 1, hours, minutes));
  }

  _formatPercent(value) {
    const number = this._num(value);
    return number === null ? UNAVAILABLE_TEXT : `${formatHassNumber(this._hass, Math.round(number), { digits: 0 })}%`;
  }

  _formatMoney(value, currency) {
    const number = this._num(value);
    if (number === null || !currency) return "";
    const amount = formatHassCurrency(this._hass, number, { currency, digits: 2 });
    return amount === UNAVAILABLE_TEXT ? "" : amount;
  }

  // Visible saving, or "" when missing, negligible or negative (the cost is shown anyway).
  _formatSaving(value, currency) {
    const number = this._num(value);
    return number === null || number < MIN_SAVING ? "" : this._formatMoney(number, currency);
  }

  // Calendar day in the HA time zone, for "today" and "Tonight" decisions.
  _localDayKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: hassTimeZone(this._hass) }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  _localHour(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    try {
      const hour = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: hassTimeZone(this._hass) }).format(date);
      return Number.parseInt(hour, 10);
    } catch {
      return date.getHours();
    }
  }

  // A clock time, with the weekday only when the instant is not today.
  _formatPlanTime(value, now = Date.now()) {
    return this._localDayKey(value) === this._localDayKey(new Date(now)) ? formatHassTime(this._hass, value) : this._formatDateTime(value);
  }

  _blocks(charger) {
    const blocks = Array.isArray(charger?.blocks) ? charger.blocks : [];
    return blocks
      .map((block) => ({ start: Date.parse(block?.start), end: Date.parse(block?.end), topUp: block?.top_up === true, raw: block }))
      .filter((block) => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start)
      .sort((left, right) => left.start - right.start);
  }

  _intelligentChargers() {
    const chargers = this._intelligent()?.chargers;
    const result: Record<string, any> = {};
    for (const key of ["smartevse_1", "smartevse_2"]) {
      const charger = chargers?.[key];
      if (charger && typeof charger === "object") result[key] = charger;
    }
    return result;
  }

  _intelligentVehicleName(charger, smartevseKey = "") {
    const name = String(charger?.vehicle_name ?? "").trim();
    if (name) return name;
    if (!charger?.vehicle) return UNIDENTIFIED_VEHICLE;
    return smartevseKey ? smartevseKey.replace("smartevse_", "SmartEVSE ") : UNIDENTIFIED_VEHICLE;
  }

  _intelligentVehicleLabel(key: IntelligentVehicleKey) {
    const name = String(this._intelligent()?.vehicles?.[key]?.name ?? "").trim();
    return name || (key === "other" ? UNIDENTIFIED_VEHICLE : key === "vehicle_1" ? "Vehicle 1" : "Vehicle 2");
  }

  // The time the plan actually targets. An edit made shortly before leaving keeps the current
  // deadline (the new ready-by applies from the next one), so the deadline wins over ready_by.
  _intelligentDeadlineClock(charger) {
    const deadline = Date.parse(charger?.deadline);
    return Number.isFinite(deadline) ? formatHassTime(this._hass, deadline) : this._formatClock(charger?.ready_by);
  }

  // "80% by 07:00", "90% by 07:00 (car limit)". An estimated plan (battery level unknown, e.g. an
  // unidentified car) charges an energy budget whatever the minimum is: "≈ 30 kWh by 07:00".
  _intelligentTargetClause(charger) {
    if (charger?.estimated === true) return `${this._intelligentEnergy(charger) || "Charging"} by ${this._intelligentDeadlineClock(charger)}`;
    const target = this._formatPercent(charger?.target ?? charger?.minimum);
    return `${target} by ${this._intelligentDeadlineClock(charger)}${charger?.limited_by_car ? " (car limit)" : ""}`;
  }

  // "≈ 30 kWh" from need_kwh, or "" when there is none.
  _intelligentEnergy(charger) {
    const kwh = this._num(charger?.need_kwh);
    return kwh !== null && kwh > 0 ? `≈ ${formatHassNumber(this._hass, kwh, { digits: kwh >= 10 ? 0 : 1, unit: "kWh" })}` : "";
  }

  // The short-of-time head of an at-risk or catching-up plan. A known level reads against the
  // target; an estimated plan has no level to compare, so it speaks of its remaining energy.
  _intelligentShortHead(charger, status) {
    const readyBy = this._intelligentDeadlineClock(charger);
    if (charger?.estimated === true) {
      const energy = this._intelligentEnergy(charger);
      return status === "catch_up" ? `Catching up${energy ? ` ${energy}` : ""} after ${readyBy}` : `Not enough time${energy ? ` for ${energy}` : ""} by ${readyBy}`;
    }
    const target = this._formatPercent(charger?.target ?? charger?.minimum);
    return status === "catch_up" ? `Below ${target} after ${readyBy}` : `Below ${target} at ${readyBy}`;
  }

  // At (or, for "done", known to be at) the plan's target. Below a car limit that is lower than
  // the minimum, the minimum itself is not reached.
  _intelligentReached(charger) {
    const status = String(charger?.status || "");
    const soc = this._num(charger?.soc);
    const target = this._num(charger?.target ?? charger?.minimum);
    const minimum = this._num(charger?.minimum);
    const atTarget = status === "reached" || (status === "done" && soc !== null && target !== null && soc >= target);
    return atTarget && !(charger?.limited_by_car === true && (soc === null || minimum === null || soc < minimum));
  }

  // The hero title for a plan with nothing left to charge, from the per-car statuses: the
  // controller's reason only says no car needs more, not whether each reached its minimum.
  // "" when the statuses do not describe a finished plan.
  _intelligentRestTitle() {
    const chargers = this._intelligentChargers();
    const keys = Object.keys(chargers);
    const active = keys.filter((key) => chargers[key].status !== "excluded");
    if (!active.length) return keys.length ? "Waiting for the selected vehicle" : "";
    const refusing = active.filter((key) => chargers[key].status === "not_accepting" || chargers[key].not_accepting === true);
    if (refusing.length === 1) return `${this._intelligentVehicleName(chargers[refusing[0]], refusing[0])} isn’t accepting charge`;
    if (refusing.length > 1) return "Vehicles aren’t accepting charge";
    if (active.every((key) => this._intelligentReached(chargers[key]))) return "Minimum charge reached";
    if (active.every((key) => ["reached", "done"].includes(String(chargers[key].status || "")))) return "Charging complete";
    return "";
  }

  // Money or energy line under a plan: forecast is marked, partial omitted, estimated shows energy.
  _intelligentMoneyLine(entry, currency, savingWord = "saving") {
    if (!entry) return "";
    if (entry.estimated) return this._intelligentEnergy(entry);
    if (entry.partial) return "";
    const amount = this._formatMoney(entry.session_cost ?? entry.cost, currency);
    if (!amount) return "";
    if (entry.includes_forecast) return `≈ ${amount} forecast`;
    const saving = this._formatSaving(entry.saving, currency);
    return saving ? `≈ ${amount} · ${savingWord} ≈ ${saving}` : `≈ ${amount}`;
  }

  // The time clause of a charger's plan line; physical truth decides "charging".
  _intelligentTimeClause(charger, ev, now = Date.now()) {
    const blocks = this._blocks(charger).filter((block) => block.end > now);
    if (!blocks.length) return "";
    const [first] = blocks;
    const current = first.start <= now;
    if (current && ev?.isCharging) return `charging until ${this._formatPlanTime(first.end, now)}`;
    const more = blocks.length > 1 ? ` +${blocks.length - 1} more` : "";
    if (current || this._localDayKey(first.start) === this._localDayKey(new Date(now))) {
      return `${formatHassTime(this._hass, first.start)}–${formatHassTime(this._hass, first.end)}${more}`;
    }
    return `starts ${this._formatDateTime(first.start)}${more}`;
  }

  // Tile plan lines for one connected charger; null when the plan has nothing to say.
  _intelligentTileLines(ev, now = Date.now()): Array<{ text: string; tone?: string }> {
    const payload = this._intelligent();
    const charger = payload?.chargers?.[ev.key];
    if (!charger || typeof charger !== "object") return [];
    const currency = payload.currency;
    const status = String(charger.status || "");
    const name = (key) => this._intelligentVehicleName(payload.chargers?.[key], key);
    const lines: Array<{ text: string; tone?: string }> = [];
    const money = (word = "saving") => {
      const text = this._intelligentMoneyLine(charger, currency, word);
      if (text) lines.push({ text });
    };
    if (status === "identifying") return [{ text: "Identifying vehicle" }];
    if (status === "excluded") return [{ text: "Not planned · charge policy" }];
    if (charger.car_timer) return [{ text: "Car’s own charging timer is on", tone: "warning" }];
    if (status === "not_accepting" || charger.not_accepting) return [{ text: "Car isn’t accepting charge", tone: "warning" }];
    const prefix = charger.vehicle ? "" : `${UNIDENTIFIED_VEHICLE} · `;
    const soc = this._num(charger.soc);
    const target = this._num(charger.target ?? charger.minimum);
    const time = this._intelligentTimeClause(charger, ev, now);
    if (status === "reached" || status === "done") {
      if (charger.top_up && (this._blocks(charger).some((block) => block.topUp && block.end > now))) {
        const limit = this._num(charger.car_limit);
        lines.push({ text: [`${prefix}Topping up${limit !== null ? ` to ${this._formatPercent(limit)}` : ""}`, time].filter(Boolean).join(" · ") });
      } else if (status === "reached" || (soc !== null && target !== null && soc >= target)) {
        lines.push({ text: `${prefix}${this._formatPercent(target)} reached` });
      } else {
        lines.push({ text: `${prefix}Charging complete` });
      }
      money("saved");
      return lines;
    }
    // An estimated plan already names its energy in the first line; no second "≈ 30 kWh" line.
    const estimated = charger.estimated === true;
    if (status === "at_risk" || status === "catch_up") {
      const projected = this._num(charger.projected_soc);
      const parts = [`${prefix}${this._intelligentShortHead(charger, status)}`];
      if (status === "at_risk" && projected !== null && !estimated) parts.push(`≈ ${this._formatPercent(projected)}`);
      if (ev.isCharging) parts.push("charging now");
      else if (charger.queue_after && payload.chargers?.[charger.queue_after]) parts.push(`after ${name(charger.queue_after)}`);
      else if (time) parts.push(time);
      lines.push({ text: parts.join(" · "), tone: "warning" });
      if (!estimated) money();
      return lines;
    }
    lines.push({ text: [`${prefix}${this._intelligentTargetClause(charger)}`, time].filter(Boolean).join(" · ") });
    if (!estimated) money();
    return lines;
  }

  _planPreferenceStorageKey() {
    const identity = [
      this._config?.controller_entity,
      this._config?.schedule_switch_entity,
      this._config?.schedule_price_entity,
      this._config?.force_charge_entity,
      this._config?.force_price_entity,
      this._config?.force_timer_entity,
    ]
      .filter(Boolean)
      .join("|");
    return `smartevse-flow-card:plan-preferences:${identity}`;
  }

  _legacyPlanPreferenceStorageKey() {
    const identity = [
      this._config?.controller_entity,
      this._config?.schedule_switch_entity,
      this._config?.force_charge_entity,
      this._config?.force_price_entity,
      this._config?.force_timer_entity,
    ]
      .filter(Boolean)
      .join("|");
    return `smartevse-flow-card:plan-preferences:${identity}`;
  }

  // ---- Card layout: "plan" (0.4.0) or "classic" -------------------------------------------
  private _layoutOverride: "plan" | "classic" | null = null;

  _layoutStorageKey() {
    return `smartevse-flow-card:layout:${this._config?.controller_entity || ""}`;
  }

  _loadLayoutPreference() {
    this._layoutOverride = null;
    try {
      const saved = window.localStorage?.getItem(this._layoutStorageKey());
      if (saved === "plan" || saved === "classic") this._layoutOverride = saved;
    } catch {
      // Storage can be unavailable; the configured layout still applies.
    }
  }

  _setLayout(value) {
    if (value !== "plan" && value !== "classic") return;
    this._layoutOverride = value;
    try {
      window.localStorage?.setItem(this._layoutStorageKey(), value);
    } catch {
      // Kept for this card instance only.
    }
    this._render();
  }

  _layout(): "plan" | "classic" {
    if (this._layoutOverride) return this._layoutOverride;
    const configured = this._config?.layout;
    if (configured === "plan" || configured === "classic") return configured;
    return this._intelligentSupported() ? "plan" : "classic";
  }

  _layoutChoice() {
    const current = this._layout();
    const option = (value, label, detail) => `<button class="family-chip layout-option" type="button" data-action="set-layout" data-value="${value}" aria-pressed="${current === value}" data-tone="${current === value ? "accent" : "neutral"}" title="${this._safe(detail)}">${this._safe(label)}</button>`;
    return `<div class="layout-choice" role="group" aria-label="Card layout">
      <div class="setting-copy"><div class="setting-label">Card layout</div><div class="setting-value">Saved on this device</div></div>
      <div class="layout-options">${option("plan", "Plan", "Night timeline and car gauges")}${option("classic", "Classic", "The earlier charger tiles")}</div>
    </div>`;
  }

  // Segmented LED ring and arc gauge of one car: level, projected level and a tick at the minimum.
  _podGauge({ value, minimum, projected, risk, ringClass, label }) {
    const R = 42;
    const C = 2 * Math.PI * R;
    const sweep = C * 0.75;
    const arc = (v) => (Math.min(100, Math.max(0, v)) / 100 * sweep).toFixed(1);
    let tick = "";
    if (minimum !== null) {
      const t = (135 + Math.min(100, Math.max(0, minimum)) / 100 * 270) * Math.PI / 180;
      const point = (r) => [(60 + Math.cos(t) * r).toFixed(1), (60 + Math.sin(t) * r).toFixed(1)];
      const [x1, y1] = point(34), [x2, y2] = point(50);
      tick = `<line class="pod-min" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
    return `<svg class="pod-gauge" viewBox="0 0 120 116" role="img" aria-label="${this._safe(label)}">
      <circle class="pod-ring ${ringClass}" cx="60" cy="60" r="52"/>
      <g transform="rotate(135 60 60)" class="pod-arcs">
        <circle class="pod-track" cx="60" cy="60" r="${R}" stroke-dasharray="${sweep.toFixed(1)} ${C.toFixed(1)}"/>
        ${projected !== null && value !== null && projected > value ? `<circle class="pod-projected${risk ? " risk" : ""}" cx="60" cy="60" r="${R}" stroke-dasharray="${arc(projected)} ${C.toFixed(1)}"/>` : ""}
        ${value !== null ? `<circle class="pod-level" cx="60" cy="60" r="${R}" stroke-dasharray="${arc(value)} ${C.toFixed(1)}"/>` : ""}
      </g>
      ${tick}
      <text class="pod-value" x="60" y="66" text-anchor="middle">${value !== null ? this._safe(Math.round(value)) : "–"}</text>
      <text class="pod-unit" x="60" y="80" text-anchor="middle">${minimum !== null ? `% · min ${this._safe(Math.round(minimum))}` : "%"}</text>
    </svg>`;
  }

  // Night timeline: price per hour, one lane of planned blocks per car, "now" and ready-by.
  _planTimeline(ev1, ev2, now = Date.now()) {
    const payload = this._isIntelligentPlanActive() ? this._intelligent() : null;
    const slots = (Array.isArray(payload?.slots) ? payload.slots : [])
      .map((slot) => ({ start: Date.parse(slot?.start), end: Date.parse(slot?.end), price: this._num(slot?.price), kind: String(slot?.kind || "") }))
      .filter((slot) => Number.isFinite(slot.start) && Number.isFinite(slot.end) && slot.end > slot.start)
      .sort((left, right) => left.start - right.start);
    if (!payload || !slots.length) return "";
    const chargers = this._intelligentChargers();
    const evByKey = { smartevse_1: ev1, smartevse_2: ev2 };
    const lanes = ["smartevse_1", "smartevse_2"].filter((key) => chargers[key] && evByKey[key].connected);
    const HOUR = 3600000;
    const deadlines = lanes.map((key) => Date.parse(chargers[key].deadline)).filter(Number.isFinite);
    const blockEnds = lanes.flatMap((key) => this._blocks(chargers[key]).map((block) => block.end));
    const first = slots.find((slot) => slot.end > now)?.start ?? slots[0].start;
    const wanted = Math.max(first + 6 * HOUR, ...deadlines, ...blockEnds);
    const last = Math.min(slots[slots.length - 1].end, Math.ceil(wanted / HOUR) * HOUR);
    if (!(last > first)) return "";
    const LEFT = 40, WIDTH = 312, TOP = 10, BASE = 70;
    const x = (time) => LEFT + Math.min(1, Math.max(0, (time - first) / (last - first))) * WIDTH;
    const visible = slots.filter((slot) => slot.end > first && slot.start < last);
    const priced = visible.filter((slot) => slot.price !== null).map((slot) => slot.price);
    const top = Math.max(0.01, ...priced);
    const cheap = priced.length ? [...priced].sort((a, b) => a - b)[Math.floor((priced.length - 1) / 3)] : null;
    const bars = visible.map((slot) => {
      const x0 = x(slot.start), width = Math.max(1, x(slot.end) - x0 - 1.5);
      const known = slot.kind === "known" && slot.price !== null;
      if (!known) return `<rect class="tl-unpriced" x="${x0.toFixed(1)}" y="${TOP}" width="${width.toFixed(1)}" height="${BASE - TOP}" rx="2.5"/>`;
      const height = Math.max(2, Math.max(0, slot.price) / top * (BASE - TOP));
      return `<rect class="tl-price${cheap !== null && slot.price <= cheap ? " cheap" : ""}" x="${x0.toFixed(1)}" y="${(BASE - height).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="2.5"/>`;
    }).join("");
    const hours = Math.round((last - first) / HOUR);
    const step = hours > 16 ? 4 : hours > 8 ? 2 : 1;
    let ticks = "";
    for (let time = Math.ceil(first / HOUR) * HOUR; time <= last; time += step * HOUR) {
      const hour = this._localHour(time);
      if (hour !== null) ticks += `<text class="tl-tick" x="${x(time).toFixed(1)}" y="${BASE + 12}" text-anchor="middle">${String(hour).padStart(2, "0")}</text>`;
    }
    const unpricedFrom = visible.find((slot) => !(slot.kind === "known" && slot.price !== null));
    const summary: string[] = [];
    const laneMarkup = lanes.map((key, index) => {
      const charger = chargers[key];
      const y = BASE + 22 + index * 22;
      const name = this._intelligentVehicleName(charger, key);
      const risk = charger.status === "at_risk";
      const blocks = this._blocks(charger).filter((block) => block.end > first && block.start < last);
      summary.push(`${name}: ${blocks.length ? blocks.map((block) => `${this._formatPlanTime(block.start, now)}–${this._formatPlanTime(block.end, now)}`).join(", ") : "nothing planned"}`);
      const rects = blocks.map((block) => {
        const current = block.start <= now && block.end > now && evByKey[key].isCharging;
        const x0 = x(Math.max(block.start, first)), width = Math.max(2, x(block.end) - x0);
        return `<rect class="tl-block${current ? " charging" : ""}${risk ? " risk" : ""}${block.topUp ? " top-up" : ""}" x="${x0.toFixed(1)}" y="${y}" width="${width.toFixed(1)}" height="12" rx="6"/>`;
      }).join("");
      const deadline = Date.parse(charger.deadline);
      const ready = Number.isFinite(deadline) && deadline >= first && deadline <= last
        ? `<line class="tl-ready" x1="${x(deadline).toFixed(1)}" y1="${y - 3}" x2="${x(deadline).toFixed(1)}" y2="${y + 15}"/>` : "";
      const label = name.split(" ").slice(-1)[0];
      return `<text class="tl-lane" x="0" y="${y + 9.5}">${this._safe(label.length > 6 ? `${label.slice(0, 5)}…` : label)}</text>
        <rect class="tl-track" x="${LEFT}" y="${y}" width="${WIDTH}" height="12" rx="6"/>${rects}${ready}`;
    }).join("");
    const height = BASE + 22 + lanes.length * 22 + 4;
    const nowX = x(now);
    const latest = deadlines.length ? Math.max(...deadlines) : null;
    const description = [`Charging plan until ${this._formatPlanTime(last, now)}`, ...summary,
      latest !== null ? `Ready by ${this._formatPlanTime(latest, now)}` : "",
      unpricedFrom ? `No published price from ${this._formatPlanTime(unpricedFrom.start, now)}` : ""].filter(Boolean).join(". ");
    return `
      <section class="plan-timeline" aria-label="Charging plan">
        <svg viewBox="0 0 360 ${height}" role="img" aria-label="${this._safe(description)}">
          <defs><pattern id="sdc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="tl-hatch" width="3" height="6"/></pattern></defs>
          ${bars}${ticks}
          ${unpricedFrom ? `<text class="tl-tick" x="${Math.min(LEFT + WIDTH - 54, x(unpricedFrom.start) + 4).toFixed(1)}" y="${TOP + 10}">no price yet</text>` : ""}
          ${laneMarkup}
          ${now >= first && now <= last ? `<line class="tl-now" x1="${nowX.toFixed(1)}" y1="4" x2="${nowX.toFixed(1)}" y2="${height - 2}"/>` : ""}
        </svg>
        <ul class="plan-legend" aria-hidden="true">
          <li><i class="swatch planned"></i>Planned</li><li><i class="swatch charging"></i>Charging</li>
          <li><i class="swatch price"></i>Price</li>${latest !== null ? `<li><i class="swatch ready"></i>Ready by ${this._safe(this._formatPlanTime(latest, now))}</li>` : ""}
        </ul>
      </section>`;
  }

  _planTotals(now = Date.now()) {
    const payload = this._isIntelligentPlanActive() ? this._intelligent() : null;
    if (!payload || this._isForcePlanActive() || payload.overridden_by === "force") return "";
    const chargers = this._intelligentChargers();
    const keys = Object.keys(chargers);
    const totals = payload.totals && typeof payload.totals === "object" ? payload.totals : {};
    const estimated = keys.some((key) => chargers[key].estimated === true);
    const cost = keys.length && !totals.partial && !estimated ? this._formatMoney(totals.cost, payload.currency) : "";
    const saving = keys.length && !totals.partial && !totals.includes_forecast && !estimated ? this._formatSaving(totals.saving, payload.currency) : "";
    const charging = String(payload.status || "") === "charging";
    const next = charging ? "Now" : Number.isFinite(Date.parse(payload.next_charge)) ? this._formatPlanTime(payload.next_charge, now) : "";
    const cells = [
      cost ? `<div><dt>Planned cost</dt><dd>≈ ${this._safe(cost)}${totals.includes_forecast ? " forecast" : ""}</dd></div>` : "",
      saving ? `<div><dt>Saving</dt><dd>${this._safe(saving)}</dd></div>` : "",
      next ? `<div><dt>Next start</dt><dd>${this._safe(next)}</dd></div>` : "",
    ].filter(Boolean);
    return cells.length ? `<dl class="plan-totals">${cells.join("")}</dl>` : "";
  }

  _loadPlanPreferences() {
    this._schedulePriceGate = false;
    this._forcePlanEnabled = false;
    this._forceNowTimer = false;
    this._forceNowPrice = false;
    try {
      const currentKey = this._planPreferenceStorageKey();
      const raw =
        window.localStorage?.getItem(currentKey) ||
        window.localStorage?.getItem(this._legacyPlanPreferenceStorageKey());
      if (!raw) {
        return;
      }
      const saved = JSON.parse(raw);
      this._schedulePriceGate = saved?.schedulePriceGate === true;
      this._forcePlanEnabled = saved?.forceEnabled === true;
      this._forceNowTimer = saved?.forceTimer === true;
      this._forceNowPrice = saved?.forcePrice === true;
      window.localStorage?.setItem(currentKey, raw);
    } catch {
      // Storage can be unavailable in restricted dashboards; entity state still works.
    }
  }

  _savePlanPreferences() {
    try {
      window.localStorage?.setItem(
        this._planPreferenceStorageKey(),
        JSON.stringify({
          schedulePriceGate: this._schedulePriceGate,
          forceEnabled: this._forcePlanEnabled,
          forceTimer: this._forceNowTimer,
          forcePrice: this._forceNowPrice,
        }),
      );
    } catch {
      // Keep the preferences for this card instance when storage is unavailable.
    }
  }

  _syncPlanPreferencesFromEntities() {
    if (!this._config || !this._hass) {
      return;
    }
    const scheduleOn = this._state(this._config.schedule_switch_entity) === "on";
    const simpleOn = this._state(this._config.force_charge_entity) === "on";
    const timerOn = this._state(this._config.force_timer_entity) === "on";
    const priceOn = this._state(this._config.force_price_entity) === "on";
    const schedulePriceOn = this._state(this._schedulePriceEntity()) === "on";
    const definiteForceOn = simpleOn || timerOn || (priceOn && !scheduleOn);
    let changed = false;

    if (
      scheduleOn &&
      !definiteForceOn &&
      !this._forcePlanEnabled &&
      this._schedulePriceGate !== schedulePriceOn
    ) {
      this._schedulePriceGate = schedulePriceOn;
      changed = true;
    }

    if (definiteForceOn && !this._forcePlanEnabled) {
      this._forcePlanEnabled = true;
      changed = true;
    } else if (!simpleOn && !timerOn && !priceOn && this._forcePlanEnabled) {
      this._forcePlanEnabled = false;
      changed = true;
    }

    const forceOn = definiteForceOn || (this._forcePlanEnabled && priceOn);
    if (forceOn) {
      const forceUsesPrice = priceOn;
      if (this._forceNowTimer !== timerOn) {
        this._forceNowTimer = timerOn;
        changed = true;
      }
      if (this._forceNowPrice !== forceUsesPrice) {
        this._forceNowPrice = forceUsesPrice;
        changed = true;
      }
    }

    if (changed) {
      this._savePlanPreferences();
    }
  }

  _chargePolicyLabels() {
    return [
      "SmartEVSE 1 first",
      "SmartEVSE 2 first",
      "SmartEVSE 1 only",
      "SmartEVSE 2 only",
    ];
  }

  _chargePolicyLabelForOption(option, index = -1) {
    const labels = this._chargePolicyLabels();
    const normalized = String(option ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const canonical = {
      smartevse_1_first: labels[0],
      smartevse_2_first: labels[1],
      smartevse_1_only: labels[2],
      smartevse_2_only: labels[3],
    };
    if (canonical[normalized]) {
      return canonical[normalized];
    }
    return String(option ?? "");
  }

  _chargePolicyOptionItems(options = []) {
    const rawOptions = Array.isArray(options) ? options : [];
    return rawOptions.map((option, index) => ({
      value: option,
      label: this._chargePolicyLabelForOption(option, index),
    }));
  }

  _chargePolicyDisplay(rawValue) {
    const entity = this._entity(this._config.charge_policy_entity);
    const options = Array.isArray(entity?.attributes?.options) ? entity.attributes.options : [];
    return this._chargePolicyLabelForOption(rawValue, options.indexOf(rawValue));
  }

  _displayState(entityId, rawValue) {
    if (entityId === this._config.charge_policy_entity) {
      return this._chargePolicyDisplay(rawValue);
    }
    return rawValue;
  }

  _numberState(entityId) {
    const raw = this._state(entityId);
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : null;
  }

  _attr(entityId, attr) {
    return this._entity(entityId)?.attributes?.[attr];
  }

  _entitySnapshot(entityId, attrs = []) {
    if (!entityId) {
      return null;
    }
    const entity = this._entity(entityId);
    if (!entity) {
      return null;
    }
    const snapshot: { state: unknown; attrs?: Record<string, unknown> } = { state: entity.state };
    if (attrs.length > 0) {
      snapshot.attrs = {};
      for (const attr of attrs) {
        snapshot.attrs[attr] = entity.attributes?.[attr] ?? null;
      }
    }
    return snapshot;
  }

  _buildRenderKey() {
    if (!this._config || !this._hass) {
      return "";
    }
    const controllerAttrs = [
      "controller_error",
      "charge_allowed",
      "charge_reason",
      "active_smartevse_raw",
      "charge_policy",
      "mains_peak",
      "wled_visuals",
      "charging_costs",
      "smartevse_1_available",
      "smartevse_1_name",
      "smartevse_1_connected_ev",
      "smartevse_1_battery",
      "smartevse_1_state",
      "smartevse_1_plug_state",
      "smartevse_1_mode",
      "smartevse_1_charge_current",
      "smartevse_1_max_current",
      "smartevse_1_error",
      "smartevse_1_session_complete",
      "smartevse_2_available",
      "smartevse_2_name",
      "smartevse_2_connected_ev",
      "smartevse_2_battery",
      "smartevse_2_state",
      "smartevse_2_plug_state",
      "smartevse_2_mode",
      "smartevse_2_charge_current",
      "smartevse_2_max_current",
      "smartevse_2_error",
      "smartevse_2_session_complete",
      // The integration keeps this payload stable between cycles, so an
      // unchanged plan never re-renders (and never replaces a field being edited).
      "intelligent",
    ];
    const intelligentIds = this._intelligentEntityIds();
    const numberAttrs = ["min", "max", "step", "unit_of_measurement"];
    const tracked = {
      intelligent: [
        this._entitySnapshot(intelligentIds.switch),
        this._entitySnapshot(intelligentIds.topUp),
        this._entitySnapshot(intelligentIds.topUpPrice, numberAttrs),
        ...INTELLIGENT_VEHICLES.flatMap((key) => [
          this._entitySnapshot(intelligentIds.vehicles[key].readyBy),
          this._entitySnapshot(intelligentIds.vehicles[key].minimum, numberAttrs),
        ]),
        this._entitySnapshot(intelligentIds.status),
        this._entitySnapshot(intelligentIds.plannedCost),
        this._entitySnapshot(intelligentIds.plannedSaving),
        this._entitySnapshot(intelligentIds.nextCharge),
      ],
      controller: this._entitySnapshot(this._config.controller_entity, controllerAttrs),
      price: this._entitySnapshot(this._config.price_entity),
      schedule: this._entitySnapshot(this._config.schedule_entity, ["next_event"]),
      scheduleSwitch: this._entitySnapshot(this._config.schedule_switch_entity),
      schedulePrice: this._entitySnapshot(this._schedulePriceEntity()),
      forceCharge: this._entitySnapshot(this._config.force_charge_entity),
      forcePrice: this._entitySnapshot(this._config.force_price_entity),
      forceTimer: this._entitySnapshot(this._config.force_timer_entity),
      acceptablePrice: this._entitySnapshot(this._config.acceptable_price_entity),
      chargePolicy: this._entitySnapshot(this._config.charge_policy_entity),
      dutyCycle: this._entitySnapshot(this._config.duty_cycle_entity),
      forceDuration: this._entitySnapshot(this._config.force_charge_duration_entity),
      dutyRemaining: this._entitySnapshot(this._config.duty_remaining_entity),
      timerRemaining: this._entitySnapshot(this._config.timer_remaining_entity),
    };
    return JSON.stringify(tracked);
  }

  _safe(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  _pretty(value) {
    const text = String(value ?? "").trim();
    if (!text) {
      return UNAVAILABLE_TEXT;
    }
    return text
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  _formatCurrent(value) {
    return formatHassNumber(this._hass, Number.isFinite(value) ? value : 0, { digits: 1, unit: "A" });
  }

  _formatOptionalCurrent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return UNAVAILABLE_TEXT;
    }
    return this._formatCurrent(number);
  }

  _formatSeconds(value) {
    const seconds = Number.parseInt(value, 10);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return UNAVAILABLE_TEXT;
    }
    return formatHassDuration(this._hass, seconds);
  }

  _formatMinutes(value) {
    const minutes = Number.parseInt(value, 10);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return UNAVAILABLE_TEXT;
    }
    return formatHassDuration(this._hass, minutes * 60);
  }

  _batteryPercent(value) {
    const text = String(value ?? "").trim();
    if (!text) {
      return null;
    }
    const numeric = Number.parseFloat(text.replace("%", ""));
    if (!Number.isFinite(numeric)) {
      return null;
    }
    return Math.max(0, Math.min(100, Math.round(numeric)));
  }

  // Weekday and clock time in the HA profile's language, clock and time zone.
  _formatDateTime(value) {
    const time = formatHassTime(this._hass, value);
    if (time === UNAVAILABLE_TEXT) {
      return time;
    }
    try {
      const weekday = new Intl.DateTimeFormat(this._hass?.locale?.language || "en", {
        weekday: "short",
        timeZone: hassTimeZone(this._hass),
      }).format(new Date(value));
      return `${weekday} ${time}`;
    } catch {
      return time;
    }
  }

  // String twin of the shared notice(), with the tone's severity icon.
  _notice(tone: Tone, message: string, role: "status" | "alert" = tone === "error" ? "alert" : "status") {
    const icon = TONE_ICONS[tone];
    return `<div class="family-notice" data-tone="${tone}" role="${role}">${icon ? `<ha-icon class="family-notice-icon" icon="${icon}" aria-hidden="true"></ha-icon>` : ""}<div class="family-notice-content"><span class="family-notice-message">${this._safe(message)}</span></div></div>`;
  }

  // Overview status while a write continues after its dialog was dismissed.
  _pendingNote(message: string) {
    return `<div class="family-async-state pending-note" role="status">${PENDING_INDICATOR}<span>${this._safe(message)}</span></div>`;
  }

  _isPendingControl(key: string) {
    return this._writePending && this._pendingControl === key;
  }

  _wledVisuals(attrs) {
    const visuals = attrs?.wled_visuals;
    if (visuals && typeof visuals === "object") {
      return visuals;
    }
    // Deliberately do not invent visual defaults here. The integration owns the
    // WLED palette and effect configuration; missing attributes disable glows.
    return {};
  }

  _wledRgb(visuals, key) {
    const source = Array.isArray(visuals?.[key]?.color) ? visuals[key].color : null;
    if (!source) {
      return null;
    }
    const values = source.slice(0, 3).map((value) => Number.parseInt(value, 10));
    if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
      return null;
    }
    return values.map((value) => Math.min(255, Math.max(0, value))).join(", ");
  }

  _wledNumber(visuals, key, property, fallback = 0) {
    const value = Number(visuals?.[key]?.[property]);
    return Number.isFinite(value) ? Math.min(255, Math.max(0, value)) : fallback;
  }

  _wledGlowDuration(visuals, key) {
    const speed = this._wledNumber(visuals, key, "sx");
    return Math.max(0.8, 3.2 - (speed / 255) * 2.4).toFixed(2);
  }

  _wledGlowAlpha(visuals, key, base, range) {
    const intensity = this._wledNumber(visuals, key, "ix");
    return Math.min(0.5, base + (intensity / 255) * range).toFixed(3);
  }

  _wledCssVars(visuals) {
    return ["off", "idle", "error", "charging"]
      .map((key) => {
        const rgb = this._wledRgb(visuals, key);
        if (!rgb) {
          return "";
        }
        const weak = this._wledGlowAlpha(visuals, key, 0.08, 0.16);
        const strong = this._wledGlowAlpha(visuals, key, 0.16, 0.24);
        const duration = this._wledGlowDuration(visuals, key);
        const effect = this._wledNumber(visuals, key, "fx");
        return [
          `--sdc-led-${key}-rgb: ${rgb};`,
          `--sdc-led-${key}-weak-alpha: ${weak};`,
          `--sdc-led-${key}-strong-alpha: ${strong};`,
          `--sdc-led-${key}-glow-duration: ${duration}s;`,
          `--sdc-led-${key}-glow-animation: ${effect === 0 ? "none" : "glowPulse"};`,
          `--sdc-led-${key}-fx: ${effect};`,
        ].join(" ");
      })
      .filter(Boolean)
      .join(" ");
  }

  _wledNodeStyle(visuals, key) {
    const visual = visuals?.[key] || visuals?.off;
    const rgb = this._wledRgb({ [key]: visual }, key);
    if (!rgb) {
      return "";
    }
    const speed = this._wledNumber({ [key]: visual }, key, "sx");
    const intensity = this._wledNumber({ [key]: visual }, key, "ix");
    const effect = this._wledNumber({ [key]: visual }, key, "fx");
    const weak = this._wledGlowAlpha({ [key]: visual }, key, 0.08, 0.16);
    const strong = this._wledGlowAlpha({ [key]: visual }, key, 0.16, 0.24);
    const duration = this._wledGlowDuration({ [key]: visual }, key);
    return [
      `--node-rgb: ${rgb};`,
      `--node-sx: ${speed};`,
      `--node-ix: ${intensity};`,
      `--node-fx: ${effect};`,
      `--node-weak-alpha: ${weak};`,
      `--node-strong-alpha: ${strong};`,
      `--node-glow-duration: ${duration}s;`,
      `--node-glow-animation: ${effect === 0 ? "none" : "glowPulse"};`,
    ].join(" ");
  }

  _evData(attrs, key, fallbackName) {
    const controllerAvailable = !["unknown", "unavailable"].includes(this._state(this._config.controller_entity));
    const available = controllerAvailable && attrs[`${key}_available`] !== false &&
      !["unknown", "unavailable"].includes(String(attrs[`${key}_state`] || "").toLowerCase());
    const connected = available && attrs[`${key}_plug_state`] === "Connected";
    const state = String(attrs[`${key}_state`] ?? "").trim();
    const mode = String(attrs[`${key}_mode`] ?? "").trim();
    const chargeCurrent = Number(attrs[`${key}_charge_current`] ?? 0);
    const maxCurrent = Number(attrs[`${key}_max_current`] ?? 0);
    const error = String(attrs[`${key}_error`] ?? "").trim();
    const sessionComplete = Boolean(attrs[`${key}_session_complete`]);
    const active = attrs.active_smartevse_raw === key;
    const smartevseName = fallbackName;
    const connectedEvName = String(attrs[`${key}_connected_ev`] ?? "").trim();
    const battery = String(attrs[`${key}_battery`] ?? "").trim();
    const hasError = error && !["NONE", "None", "unknown", "unavailable"].includes(error);
    const isCharging = available && connected && state === "Charging";
    // Match the integration's physical WLED state exactly. WLED switches to its
    // charging visual as soon as SmartEVSE reports Charging, even while current
    // is still ramping up from zero.
    const visual = !available ? "off" : hasError ? "error" : !connected ? "off" : isCharging ? "charging" : "idle";

    let tone = "idle";
    if (!available) {
      tone = "unavailable";
    } else if (hasError) {
      tone = "error";
    } else if (!connected) {
      tone = "unplugged";
    } else if (isCharging) {
      tone = "charging";
    } else if (active) {
      tone = "active";
    } else if (sessionComplete) {
      tone = "complete";
    }

    return {
      key,
      smartevseName,
      available,
      connectedEvName,
      connected,
      state: state || "Idle",
      mode: mode || UNAVAILABLE_TEXT,
      battery,
      chargeCurrent: Number.isFinite(chargeCurrent) ? chargeCurrent : 0,
      maxCurrent: Number.isFinite(maxCurrent) ? maxCurrent : 0,
      error,
      hasError,
      sessionComplete,
      active,
      isCharging,
      tone,
      visual,
    };
  }

  _editorMeta(entityId) {
    const entity = this._entity(entityId);
    if (!entity || !this._isAvailable(entityId)) {
      return { supported: false };
    }
    const [domain] = entityId.split(".");
    const attrs = entity.attributes || {};
    if (domain === "select") {
      const options = Array.isArray(attrs.options) ? attrs.options : [];
      return {
        supported: true,
        kind: "select",
        serviceDomain: "select",
        service: "select_option",
        options,
        optionItems:
          entityId === this._config.charge_policy_entity
            ? this._chargePolicyOptionItems(options)
            : options.map((option) => ({ value: option, label: option })),
      };
    }
    if (domain === "number" || domain === "input_number") {
      return {
        supported: true,
        kind: "number",
        serviceDomain: domain,
        service: "set_value",
        min: Number.isFinite(Number(attrs.min)) ? Number(attrs.min) : null,
        max: Number.isFinite(Number(attrs.max)) ? Number(attrs.max) : null,
        step: Number.isFinite(Number(attrs.step)) ? Number(attrs.step) : "any",
        unit: attrs.unit_of_measurement ?? "",
      };
    }
    if (domain === "text") {
      return {
        supported: true,
        kind: "text",
        serviceDomain: "text",
        service: "set_value",
      };
    }
    if (domain === "time") {
      return {
        supported: true,
        kind: "time",
        serviceDomain: "time",
        service: "set_value",
      };
    }
    return { supported: false };
  }

  _editorDraft(entityId) {
    if (!this._editorDrafts) {
      this._editorDrafts = {};
    }
    return this._editorDrafts[entityId] ?? this._state(entityId) ?? "";
  }

  _openEditor(entityId) {
    if (this._writePending || !this._editorMeta(entityId).supported) return;
    if (!this._flow.push(`setting:${entityId}`)) return;
    this._settingsError = "";
    this._editorDrafts[entityId] = this._state(entityId) ?? "";
    this._render();
  }

  _closeEditor() {
    if (this._writePending) return;
    if (this._editingEntity) delete this._editorDrafts[this._editingEntity];
    this._editingEntity = null;
    this._flow.back();
  }

  _openSettingsSubmenu(entityId) {
    if (this._writePending) return;
    const meta = this._editorMeta(entityId);
    if (!meta.supported || meta.kind !== "select") return;
    if (!this._flow.push(`setting:${entityId}`)) return;
    this._settingsError = "";
    this._render();
  }

  _updateEditorDraft(entityId, value) {
    if (!this._editorDrafts) {
      this._editorDrafts = {};
    }
    this._editorDrafts[entityId] = value;
  }

  _durationMinutesFromInput(input) {
    const container = input?.closest?.(".wizard-duration-inputs");
    const hoursInput = container?.querySelector?.('[data-duration-part="hours"]');
    const minutesInput = container?.querySelector?.('[data-duration-part="minutes"]');
    const hours = Number.parseInt(hoursInput?.value ?? "", 10);
    const minutes = Number.parseInt(minutesInput?.value ?? "", 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || minutes < 0 || minutes > 59) {
      return null;
    }
    return hours * 60 + minutes;
  }

  _updateForceDurationDraft(input) {
    const entityId = input?.dataset?.entity;
    const totalMinutes = this._durationMinutesFromInput(input);
    if (!entityId || totalMinutes === null) {
      return false;
    }
    this._updateEditorDraft(entityId, String(totalMinutes));
    return true;
  }

  async _saveForceDurationInput(input) {
    if (!this._updateForceDurationDraft(input)) {
      this._forceWizardError = "Enter valid hours and minutes between 0 and 59.";
      this._render();
      return;
    }
    await this._saveForceWizardNumber(input.dataset.entity);
  }

  async _saveEditor(entityId) {
    if (this._writePending) return;
    const session = this._settingsSession;
    const meta = this._editorMeta(entityId);
    if (!meta.supported) {
      return;
    }
    const rawValue = this._editorDraft(entityId);
    const serviceData: Record<string, any> = { entity_id: entityId };
    if (meta.kind === "select") {
      serviceData.option = rawValue;
    } else if (meta.kind === "number") {
      const parsed = Number.parseFloat(rawValue);
      if (!Number.isFinite(parsed) || (meta.min !== null && parsed < meta.min) || (meta.max !== null && parsed > meta.max)) {
        this._settingsError = `Enter a value between ${meta.min ?? "−∞"} and ${meta.max ?? "∞"}${meta.unit ? ` ${meta.unit}` : ""}.`;
        this._render();
        return;
      }
      serviceData.value = parsed;
    } else if (meta.kind === "text") {
      serviceData.value = String(rawValue ?? "");
    } else if (meta.kind === "time") {
      serviceData.time = String(rawValue ?? "");
    } else {
      return;
    }
    this._settingsError = "";
    this._settingsBusy = true;
    this._pendingControl = `save:${entityId}`;
    this._render();
    try {
      await this._hass.callService(meta.serviceDomain, meta.service, serviceData);
      if (session === this._settingsSession && this._editingEntity === entityId) {
        this._editingEntity = null;
        if (this._settingsSubmenuEntity === entityId) {
          // Completion only navigates the still-current editor; late responses
          // cannot close a subsequently opened flow.
          this._settingsBusy = false;
          this._flow.back();
        }
      }
    } catch (error) {
      this._settingsError = error instanceof Error ? error.message : "Unable to save this setting.";
    } finally {
      this._settingsBusy = false;
      this._pendingControl = "";
      this._render();
    }
  }

  async _chooseEditorOption(entityId, value) {
    if (this._writePending) return;
    const meta = this._editorMeta(entityId);
    if (!meta.supported || meta.kind !== "select" || !meta.options.includes(value)) return;
    const previousValue = this._editorDraft(entityId);
    const session = this._settingsSession;
    this._updateEditorDraft(entityId, value);
    this._settingsError = "";
    this._settingsBusy = true;
    this._pendingControl = `option:${value}`;
    this._render();
    try {
      await this._hass.callService(meta.serviceDomain, meta.service, { entity_id: entityId, option: value });
    } catch (error) {
      if (session === this._settingsSession) this._updateEditorDraft(entityId, previousValue);
      else delete this._editorDrafts[entityId];
      this._settingsError = error instanceof Error ? error.message : "Unable to save this setting.";
    } finally {
      this._settingsBusy = false;
      this._pendingControl = "";
      this._render();
    }
  }

  _openRootDialog(route: DialogPage, opener?: HTMLElement) {
    const wasActive = this._flow.active;
    const opened = this._flow.open(route, opener);
    // Touch browsers need not focus a tapped button. Keep its logical identity
    // as well as the shared node reference because unsafeHTML replaces nodes.
    if (opened && !wasActive && opener) this._dialogReturnFocus = { key: this._uiFocusKey(opener) };
    return opened;
  }

  _openSettingsModal(opener?: HTMLElement) {
    const opened = this._flow.current === "plan" ? this._flow.push("settings") : this._openRootDialog("settings", opener);
    if (!opened) return;
    if (!this._writePending) {
      this._settingsError = "";
      this._editorDrafts = {};
    }
    this._render();
  }

  _openChargingHistory(charger?: string, opener?: HTMLElement) {
    const opened = this._openRootDialog("history", opener);
    if (!opened) return;
    if (["smartevse_1", "smartevse_2"].includes(charger || "")) {
      for (const key of ["smartevse_1", "smartevse_2"]) this._detailsOpen.set(`cost-${key}`, key === charger);
    }
    this._render();
  }

  _forceModeEntity(mode) {
    if (mode === "schedule") {
      return this._config.schedule_switch_entity;
    }
    if (mode === "price") {
      return this._config.force_price_entity;
    }
    if (mode === "timer" || mode === "timer_price") {
      return this._config.force_timer_entity;
    }
    return this._config.force_charge_entity;
  }

  _openForceWizard(opener?: HTMLElement) {
    if (!this._openRootDialog("plan", opener)) return;
    if (this._writePending) { this._render(); return; }
    this._syncPlanPreferencesFromEntities();
    this._forceWizardError = "";
    if (this._config.acceptable_price_entity) {
      this._editorDrafts[this._config.acceptable_price_entity] = this._state(this._config.acceptable_price_entity);
    }
    if (this._config.force_charge_duration_entity) {
      this._editorDrafts[this._config.force_charge_duration_entity] = this._state(this._config.force_charge_duration_entity);
    }
    this._render();
  }

  _selectForceMode(mode) {
    if (!["schedule", "now", "intelligent"].includes(mode)) return;
    if (mode === "intelligent" && !this._intelligentSupported()) return;
    if (!this._flow.push(mode)) return;
    this._forceWizardError = "";
    if (mode === "intelligent" && !this._writePending) {
      // Fields start from the integration's current values, not an old draft (a field still
      // saving keeps the value it is writing).
      for (const entityId of this._intelligentFieldEntities()) {
        if (!this._fieldSaving(entityId)) delete this._editorDrafts[entityId];
      }
    }
  }

  _forceNowMode() {
    if (this._forceNowTimer && this._forceNowPrice) {
      return "timer_price";
    }
    if (this._forceNowTimer) {
      return "timer";
    }
    if (this._forceNowPrice) {
      return "price";
    }
    return "simple";
  }

  _isSchedulePlanActive() {
    return this._state(this._config.schedule_switch_entity) === "on";
  }

  _isForcePlanActive() {
    const scheduleOn = this._isSchedulePlanActive();
    const priceOn = this._state(this._config.force_price_entity) === "on";
    return (
      this._state(this._config.force_charge_entity) === "on" ||
      this._state(this._config.force_timer_entity) === "on" ||
      (priceOn && (!scheduleOn || this._forcePlanEnabled))
    );
  }

  async _toggleChargingPlan(mode) {
    if (this._writePending || !["schedule", "now", "intelligent"].includes(mode)) {
      return;
    }
    if (mode === "intelligent" && !this._intelligentSupported()) return;
    const enabled = mode === "schedule" ? this._isSchedulePlanActive()
      : mode === "intelligent" ? this._isIntelligentPlanActive() : this._isForcePlanActive();
    this._pendingControl = `plan:${mode}`;
    if (enabled) {
      await this._disableChargingPlan(mode);
      return;
    }
    if (mode === "intelligent") {
      await this._enableIntelligentPlan();
      return;
    }
    // Schedule and Intelligent are independent standing plans (owner decision 2026-11-10):
    // enabling one never changes the other. Intelligent has priority while both are on.
    await this._applyForceMode(mode === "schedule" ? "schedule" : this._forceNowMode());
  }

  // Intelligent is independent of the schedule: it outranks a schedule that is on and
  // leaves its switches as they are, so turning Intelligent off hands back to it.
  async _enableIntelligentPlan() {
    if (this._writePending || !this._intelligentSupported()) return;
    // Freeze the request before the first await.
    const intelligentEntity = this._intelligentEntityIds().switch;
    this._forceWizardBusy = true;
    this._pendingControl ||= "plan:intelligent";
    this._forceWizardError = "";
    this._render();
    try {
      if (!this._isAvailable(intelligentEntity) || !this._isAvailable(this._config.controller_entity)) {
        throw new Error("A required charging control is unavailable. Check the connection before enabling this plan.");
      }
      await this._setSwitchState(intelligentEntity, true);
      this._savePlanPreferences();
    } catch (error) {
      this._forceWizardError = error instanceof Error ? error.message : "Unable to enable Intelligent charging.";
    } finally {
      this._forceWizardBusy = false;
      this._pendingControl = "";
      this._render();
    }
  }

  async _disableChargingPlan(mode) {
    if (this._writePending || !["schedule", "now", "intelligent"].includes(mode)) {
      return;
    }
    if (mode === "intelligent") {
      const intelligentEntity = this._intelligentEntityIds().switch;
      this._forceWizardBusy = true;
      this._pendingControl ||= "plan:intelligent";
      this._forceWizardError = "";
      this._render();
      try {
        if (intelligentEntity && this._state(intelligentEntity) === "on") {
          await this._setSwitchState(intelligentEntity, false);
        }
      } catch (error) {
        this._forceWizardError = error instanceof Error ? error.message : "Unable to turn off the charging plan.";
      } finally {
        this._forceWizardBusy = false;
        this._pendingControl = "";
        this._render();
      }
      return;
    }
    this._syncPlanPreferencesFromEntities();
    this._savePlanPreferences();
    this._forceWizardBusy = true;
    this._pendingControl ||= `plan:${mode}`;
    this._forceWizardError = "";
    this._render();
    try {
      const scheduleOn = this._isSchedulePlanActive();
      if (mode === "schedule") {
        if (scheduleOn) {
          await this._setSwitchState(this._config.schedule_switch_entity, false);
        }
        const schedulePriceEntity = this._schedulePriceEntity();
        if (schedulePriceEntity && this._state(schedulePriceEntity) === "on") {
          await this._setSwitchState(schedulePriceEntity, false);
        }
      } else {
        for (const entityId of [
          this._config.force_charge_entity,
          this._config.force_timer_entity,
          this._config.force_price_entity,
        ]) {
          if (entityId && this._state(entityId) === "on") {
            await this._setSwitchState(entityId, false);
          }
        }
        this._forcePlanEnabled = false;
        this._savePlanPreferences();
      }
    } catch (error) {
      this._forceWizardError = error instanceof Error ? error.message : "Unable to turn off the charging plan.";
    } finally {
      this._forceWizardBusy = false;
      this._pendingControl = "";
      this._render();
    }
  }

  async _toggleSchedulePriceGate() {
    if (this._writePending) {
      return;
    }
    if (
      !this._schedulePriceGate &&
      (!this._entity(this._schedulePriceEntity()) ||
        !this._entity(this._config.acceptable_price_entity) ||
        !this._entity(this._config.price_entity))
    ) {
      this._forceWizardError = "Price-controlled charging is unavailable because a required price entity is missing.";
      this._render();
      return;
    }
    this._schedulePriceGate = !this._schedulePriceGate;
    this._forceWizardError = "";
    this._savePlanPreferences();
    if (this._isSchedulePlanActive()) {
      this._pendingControl = "schedule-price";
      await this._applyForceMode("schedule");
      return;
    }
    this._render();
  }

  async _toggleForceNowTimer() {
    if (this._writePending) {
      return;
    }
    if (
      !this._forceNowTimer &&
      (!this._entity(this._config.force_timer_entity) ||
        !this._entity(this._config.force_charge_duration_entity))
    ) {
      this._forceWizardError = "Timed charging is unavailable because a required entity is missing.";
      this._render();
      return;
    }
    this._forceNowTimer = !this._forceNowTimer;
    this._forceWizardError = "";
    this._savePlanPreferences();
    if (this._isForcePlanActive()) {
      this._pendingControl = "force-timer";
      await this._applyForceMode(this._forceNowMode());
      return;
    }
    this._render();
  }

  async _toggleForceNowPrice() {
    if (this._writePending) {
      return;
    }
    if (
      !this._forceNowPrice &&
      (!this._entity(this._config.force_price_entity) ||
        !this._entity(this._config.acceptable_price_entity) ||
        !this._entity(this._config.price_entity))
    ) {
      this._forceWizardError = "Price-controlled charging is unavailable because a required entity is missing.";
      this._render();
      return;
    }
    this._forceNowPrice = !this._forceNowPrice;
    this._forceWizardError = "";
    this._savePlanPreferences();
    if (this._isForcePlanActive()) {
      this._pendingControl = "force-price";
      await this._applyForceMode(this._forceNowMode());
      return;
    }
    this._render();
  }

  async _setSwitchState(entityId, enabled) {
    if (!["on", "off"].includes(this._state(entityId))) {
      throw new Error("A required charging-control switch is unavailable.");
    }
    const isOn = this._state(entityId) === "on";
    if (isOn === enabled) {
      return;
    }
    await this._hass.callService("homeassistant", enabled ? "turn_on" : "turn_off", {
      entity_id: entityId,
    });
  }

  async _setWizardNumber(entityId, rawValue = this._editorDraft(entityId)) {
    const meta = this._editorMeta(entityId);
    if (!meta.supported || meta.kind !== "number") {
      throw new Error("This force-charge setting is unavailable or is not a number entity.");
    }
    const value = Number.parseFloat(rawValue);
    if (!Number.isFinite(value)) {
      throw new Error("Enter a valid number before continuing.");
    }
    if (meta.min !== null && value < meta.min) {
      throw new Error(`Value must be at least ${meta.min}${meta.unit ? ` ${meta.unit}` : ""}.`);
    }
    if (meta.max !== null && value > meta.max) {
      throw new Error(`Value must be at most ${meta.max}${meta.unit ? ` ${meta.unit}` : ""}.`);
    }
    await this._hass.callService(meta.serviceDomain, meta.service, {
      entity_id: entityId,
      value,
    });
  }

  async _saveForceWizardNumber(entityId) {
    if (this._writePending || !entityId) {
      return;
    }
    this._forceWizardBusy = true;
    this._pendingControl = `number:${entityId}`;
    this._forceWizardError = "";
    this._render();
    try {
      await this._setWizardNumber(entityId);
    } catch (error) {
      this._forceWizardError = error instanceof Error ? error.message : "Unable to save this charging setting.";
    } finally {
      this._forceWizardBusy = false;
      this._pendingControl = "";
      this._render();
    }
  }

  // The service call an Intelligent settings field would make for a raw draft, or why it cannot.
  _intelligentFieldRequest(entityId: string, raw: unknown):
    { value: string; domain: string; service: string; data: Record<string, any> } | { error: string } {
    if (entityId.startsWith("time.")) {
      const value = this._normaliseClock(raw);
      return value ? { value, domain: "time", service: "set_value", data: { entity_id: entityId, time: `${value}:00` } }
        : { error: "Enter a valid time." };
    }
    const meta = this._editorMeta(entityId);
    if (!meta.supported || meta.kind !== "number") return { error: "This setting is unavailable. Check its connection and try again." };
    const number = Number.parseFloat(String(raw ?? ""));
    if (!Number.isFinite(number)) return { error: "Enter a valid number." };
    const unit = meta.unit ? ` ${meta.unit}` : "";
    if (meta.min !== null && number < meta.min) return { error: `Value must be at least ${meta.min}${unit}.` };
    if (meta.max !== null && number > meta.max) return { error: `Value must be at most ${meta.max}${unit}.` };
    return { value: String(number), domain: meta.serviceDomain, service: meta.service, data: { entity_id: entityId, value: number } };
  }

  // A field's value as the entity holds it, in the form _intelligentFieldRequest writes.
  _intelligentFieldState(entityId: string) {
    const state = this._state(entityId);
    return entityId.startsWith("time.") ? this._normaliseClock(state) : String(this._num(state));
  }

  // The field's current value: the state, or the value just written while the state lags.
  _intelligentFieldCurrent(entityId: string) {
    const state = this._intelligentFieldState(entityId);
    const written = this._fieldWritten.get(entityId);
    return written && state === written.before ? written.value : state;
  }

  // A field whose value is being written, queued behind a write, or about to be committed.
  _fieldSaving(entityId: string) {
    return this._fieldWrites.has(entityId) || this._fieldQueued.has(entityId) || this._fieldDeferred.has(entityId);
  }

  _fieldPendingSource(entityId: string) {
    return this._fieldWrites.get(entityId)?.source ?? "";
  }

  // Saves one Intelligent settings field from its draft: ready-by times on blur, Enter or the
  // suggestion pill (never per edited segment), numbers on blur or Enter. While the field is
  // saving, only the newest entry is kept and written after it; nothing is dropped silently.
  async _commitIntelligentField(entityId: string, source: "field" | "suggest" = "field", report = true) {
    if (!entityId || !this._hass) return;
    const request = this._intelligentFieldRequest(entityId, this._editorDraft(entityId));
    if ("error" in request) {
      if (report) {
        this._forceWizardError = request.error;
        this._fieldError = { entityId, message: request.error };
        this._render();
      }
      return;
    }
    // A corrected entry clears the error its own invalid value raised (and nothing else).
    if (this._fieldError.entityId === entityId) {
      if (this._forceWizardError === this._fieldError.message) this._forceWizardError = "";
      this._fieldError = { entityId: "", message: "" };
      this._render();
    }
    const inFlight = this._fieldWrites.get(entityId);
    if (inFlight) {
      if (request.value === inFlight.value) this._fieldQueued.delete(entityId);
      else this._fieldQueued.set(entityId, source);
      return;
    }
    if (request.value === this._intelligentFieldCurrent(entityId)) return;
    if (!this._isAvailable(entityId)) {
      this._forceWizardError = "This setting is unavailable. Check its connection and try again.";
      this._render();
      return;
    }
    if (entityId.startsWith("time.")) this._updateEditorDraft(entityId, request.value);
    const before = this._intelligentFieldState(entityId);
    this._fieldWrites.set(entityId, { value: request.value, source });
    this._forceWizardError = "";
    this._render();
    try {
      await this._hass.callService(request.domain, request.service, request.data);
      this._fieldWritten.set(entityId, { value: request.value, before });
    } catch (error) {
      this._forceWizardError = error instanceof Error ? error.message : "Unable to save this charging setting.";
    } finally {
      this._fieldWrites.delete(entityId);
      const queued = this._fieldQueued.get(entityId);
      this._fieldQueued.delete(entityId);
      this._render();
      if (queued) await this._commitIntelligentField(entityId, queued);
    }
  }

  // Focus left a field. Saving re-renders the dialog, which would replace the control being
  // pressed and lose its click (and a disabled copy would refuse it), so the commit waits until
  // that press has delivered its click; without a press it runs on the next task.
  _deferIntelligentCommit(entityId: string) {
    this._fieldDeferred.add(entityId);
    if (this._pointerDown) {
      // A press whose release is never reported must not hold the value back for long.
      clearTimeout(this._deferredFallback);
      this._deferredFallback = setTimeout(() => this._flushDeferredCommits(true), 2000);
    } else {
      setTimeout(() => this._flushDeferredCommits(), 0);
    }
  }

  _flushDeferredCommits(force = false) {
    if (this._pointerDown && !force) return;
    clearTimeout(this._deferredFallback);
    const entities = [...this._fieldDeferred];
    this._fieldDeferred.clear();
    // An emptied time field is still being typed; an invalid number needs to be reported.
    for (const entityId of entities) void this._commitIntelligentField(entityId, "field", !entityId.startsWith("time."));
  }

  // Top-up is an Intelligent setting entity: it saves immediately and never starts a plan.
  async _toggleIntelligentTopUp() {
    if (this._writePending) return;
    const entityId = this._intelligentEntityIds().topUp;
    const state = this._state(entityId);
    if (!entityId || !["on", "off"].includes(state)) return;
    this._forceWizardBusy = true;
    this._pendingControl = "intelligent-top-up";
    this._forceWizardError = "";
    this._render();
    try {
      await this._setSwitchState(entityId, state !== "on");
    } catch (error) {
      this._forceWizardError = error instanceof Error ? error.message : "Unable to save this charging setting.";
    } finally {
      this._forceWizardBusy = false;
      this._pendingControl = "";
      this._render();
    }
  }

  async _applyForceMode(mode) {
    if (this._writePending || !["schedule", "simple", "price", "timer", "timer_price"].includes(mode)) {
      return;
    }
    // Freeze the requested plan before any asynchronous command or dialog navigation.
    const config = { ...this._config };
    const schedulePriceEntity = this._schedulePriceEntity();
    const independentPlans = this._supportsIndependentPlans();
    const target = this._forceModeEntity(mode);
    const schedulePriceGate = this._schedulePriceGate;
    const priceDraft = this._editorDraft(config.acceptable_price_entity);
    const durationDraft = this._editorDraft(config.force_charge_duration_entity);
    this._forceWizardBusy = true;
    this._pendingControl ||= mode === "schedule" ? "plan:schedule" : "plan:now";
    this._forceWizardError = "";
    this._render();
    try {
      const needsPrice = mode === "price" || mode === "timer_price" || (mode === "schedule" && schedulePriceGate);
      const needsTimer = mode === "timer" || mode === "timer_price";
      const required = mode === "schedule"
        ? [config.schedule_switch_entity, config.schedule_entity, ...(this._entity(schedulePriceEntity) ? [schedulePriceEntity] : [])]
        : [target, ...(independentPlans ? [config.force_charge_entity] : [])];
      if (needsPrice) required.push(config.price_entity, config.acceptable_price_entity,
        mode === "schedule" ? schedulePriceEntity : config.force_price_entity);
      if (needsTimer) required.push(config.force_timer_entity, config.force_charge_duration_entity);
      required.push(config.controller_entity);
      if (required.some(entity => !this._isAvailable(entity))) {
        throw new Error("A required charging control is unavailable. Check the connection before enabling this plan.");
      }
      if (mode === "schedule") {
        const scheduleEntity = config.schedule_switch_entity;
        if (!scheduleEntity || !this._entity(scheduleEntity)) {
          throw new Error("The scheduled-charging switch is unavailable.");
        }
        if (schedulePriceGate) {
          if (
            !schedulePriceEntity ||
            !this._entity(schedulePriceEntity) ||
            !this._entity(config.price_entity)
          ) {
            throw new Error("A required price-controlled charging entity is unavailable.");
          }
          await this._setWizardNumber(config.acceptable_price_entity, priceDraft);
        }

        await this._setSwitchState(scheduleEntity, true);
        if (schedulePriceEntity && this._entity(schedulePriceEntity)) {
          await this._setSwitchState(schedulePriceEntity, schedulePriceGate);
        }
        this._savePlanPreferences();
        return;
      }

      if (!target || !this._entity(target)) {
        throw new Error("The switch for this force-charge mode is unavailable.");
      }
      if (mode === "price" || mode === "timer_price") {
        if (!this._entity(config.price_entity)) {
          throw new Error("The electricity price sensor is unavailable.");
        }
        await this._setWizardNumber(config.acceptable_price_entity, priceDraft);
      }
      if (mode === "timer" || mode === "timer_price") {
        await this._setWizardNumber(config.force_charge_duration_entity, durationDraft);
      }

      const forceEntities = [
        config.force_charge_entity,
        config.force_price_entity,
        config.force_timer_entity,
      ].filter(Boolean);
      const activateForceEntity = independentPlans ? [config.force_charge_entity] : [];
      const targets =
        mode === "timer_price"
          ? [config.force_price_entity, config.force_timer_entity, ...activateForceEntity].filter(Boolean)
          : mode === "price"
            ? [config.force_price_entity, ...activateForceEntity].filter(Boolean)
            : mode === "timer"
              ? [config.force_timer_entity, ...activateForceEntity].filter(Boolean)
              : [config.force_charge_entity].filter(Boolean);
      for (const entityId of forceEntities) {
        if (!targets.includes(entityId) && this._state(entityId) === "on") {
          await this._setSwitchState(entityId, false);
        }
      }
      for (const entityId of targets) {
        await this._setSwitchState(entityId, true);
      }
      this._forcePlanEnabled = true;
      this._savePlanPreferences();
    } catch (error) {
      this._forceWizardError = error instanceof Error ? error.message : "Unable to apply the charging plan.";
    } finally {
      this._forceWizardBusy = false;
      this._pendingControl = "";
      this._render();
    }
  }

  _settingsControls({ policy, dutyCycleMinutes }) {
    return `
      <div class="controls home-controls setting-controls">
        ${this._settingTile({
          entityId: this._config.charge_policy_entity,
          icon: "mdi:source-fork",
          label: "Charge policy",
          value: policy,
          presentation: "submenu",
        })}
        ${this._settingTile({
          entityId: this._config.duty_cycle_entity,
          icon: "mdi:swap-horizontal-bold",
          label: "Duty cycle",
          value: this._formatMinutes(dutyCycleMinutes),
        })}
      </div>
      ${this._layoutChoice()}
    `;
  }

  _settingsModal(settingsControls) {
    if (!this._settingsModalOpen) {
      return "";
    }
    if (this._settingsSubmenuEntity) {
      return this._settingsSubmenuModal(this._settingsSubmenuEntity);
    }
    return `

        <div class="dialog-panel settings-panel">
          <div class="dialog-content">${settingsControls}
          ${this._settingsBusy ? this._pendingNote("Saving settings…") : ""}
          ${this._settingsError ? this._notice("error", this._settingsError) : ""}</div>
        </div>
    `;
  }

  _forceWizardNumberField(entityId, label) {
    const meta = this._editorMeta(entityId);
    if (!meta.supported || meta.kind !== "number") {
      return this._notice("warning", `The configured ${label.toLowerCase()} entity is unavailable.`);
    }
    const pending = this._isPendingControl(`number:${entityId}`);
    const min = meta.min !== null ? `min="${this._safe(meta.min)}"` : "";
    const max = meta.max !== null ? `max="${this._safe(meta.max)}"` : "";
    const step = meta.step !== null ? `step="${this._safe(meta.step)}"` : "";
    return `
      <label class="wizard-field" ${pending ? `aria-busy="true"` : ""}>
        <span class="wizard-field-label">${this._safe(label)}${pending ? `<span class="control-pending">${PENDING_INDICATOR}Saving…</span>` : ""}</span>
        <span class="wizard-input-wrap">
          <input
            class="setting-input force-input"
            data-entity="${this._safe(entityId)}"
            type="number"
            inputmode="decimal"
            value="${this._safe(this._editorDraft(entityId))}"
            ${min}
            ${max}
            ${step}
          />
          ${meta.unit ? `<span class="wizard-input-unit">${this._safe(meta.unit)}</span>` : ""}
        </span>
      </label>
    `;
  }

  _forceDurationField(entityId) {
    const meta = this._editorMeta(entityId);
    if (!meta.supported || meta.kind !== "number") {
      return this._notice("warning", "The configured charging duration entity is unavailable.");
    }
    const pending = this._isPendingControl(`number:${entityId}`);
    const rawMinutes = Number.parseFloat(this._editorDraft(entityId));
    const totalMinutes = Number.isFinite(rawMinutes) ? Math.max(0, Math.round(rawMinutes)) : 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const maximumHours = meta.max !== null ? `max="${this._safe(Math.floor(meta.max / 60))}"` : "";
    const minuteStep = Number.isFinite(Number(meta.step)) && Number(meta.step) > 0 && Number(meta.step) < 60
      ? Number(meta.step)
      : 1;
    return `
      <div class="wizard-field wizard-duration-field" ${pending ? `aria-busy="true"` : ""}>
        <span class="wizard-field-label">Charging duration${pending ? `<span class="control-pending">${PENDING_INDICATOR}Saving…</span>` : ""}</span>
        <div class="wizard-duration-inputs">
          <label class="wizard-duration-part">
            <span class="wizard-duration-part-label">Hours</span>
            <span class="wizard-input-wrap">
              <input
                class="setting-input force-input force-duration-input"
                data-entity="${this._safe(entityId)}"
                data-duration-part="hours"
                type="number"
                inputmode="numeric"
                min="0"
                ${maximumHours}
                step="1"
                value="${this._safe(hours)}"
              />
              <span class="wizard-input-unit">h</span>
            </span>
          </label>
          <label class="wizard-duration-part">
            <span class="wizard-duration-part-label">Minutes</span>
            <span class="wizard-input-wrap">
              <input
                class="setting-input force-input force-duration-input"
                data-entity="${this._safe(entityId)}"
                data-duration-part="minutes"
                type="number"
                inputmode="numeric"
                min="0"
                max="59"
                step="${this._safe(minuteStep)}"
                value="${this._safe(minutes)}"
              />
              <span class="wizard-input-unit">min</span>
            </span>
          </label>
        </div>
      </div>
    `;
  }

  _forceWizardModal() {
    if (!this._forceWizardOpen) {
      return "";
    }

    const busy = this._writePending;
    const error = this._forceWizardError ? this._notice("error", this._forceWizardError) : "";
    // Visible progress sits on the triggering control; this announces it once.
    const status = busy ? `<span class="family-visually-hidden" role="status">Updating charging plan…</span>` : "";
    const pendingLine = `<span class="control-pending">${PENDING_INDICATOR}Updating…</span>`;

    if (this._forceWizardStep === "choose") {
      const scheduleEnabled = this._isSchedulePlanActive();
      const forceEnabled = this._isForcePlanActive();
      const choices = [
        {
          mode: "schedule",
          icon: "mdi:calendar-clock",
          title: "Use a schedule",
          enabled: scheduleEnabled,
          available: Boolean(this._entity(this._config.schedule_switch_entity)),
          canToggle: this._isAvailable(this._config.schedule_switch_entity) &&
            (scheduleEnabled || this._isAvailable(this._config.schedule_entity)),
        },
        {
          mode: "now",
          icon: "mdi:lightning-bolt",
          title: "Force charge",
          enabled: forceEnabled,
          canToggle: this._isAvailable(this._config.force_charge_entity) ||
            (!this._supportsIndependentPlans() && [this._config.force_timer_entity, this._config.force_price_entity].some(id => this._isAvailable(id))),
          available: Boolean(
            this._entity(this._config.force_charge_entity) ||
              this._entity(this._config.force_timer_entity) ||
              this._entity(this._config.force_price_entity),
          ),
        },
        ...(this._intelligentSupported() ? [{
          mode: "intelligent",
          icon: "mdi:brain",
          title: "Intelligent charging",
          enabled: this._isIntelligentPlanActive(),
          available: true,
          canToggle: this._isAvailable(this._intelligentEntityIds().switch),
        }] : []),
      ];
      return `

          <div class="dialog-panel force-wizard-panel">
            <div class="dialog-content"><div class="wizard-options">
              ${choices
                .filter(choice => choice.available || choice.enabled)
                .map((choice) => {
                  // Follow the WLED idle effect: a static WLED visual keeps the glow still.
                  const glow = buildGlow(ACTIVE_GLOW, "static", choice.enabled).style;
                  const glowStyle = glow
                    ? `${glow} animation: var(--sdc-led-idle-glow-animation, none) var(--sdc-led-idle-glow-duration, 2.4s) ease-in-out infinite;`
                    : "";
                  const pending = this._isPendingControl(`plan:${choice.mode}`);
                  return `
                    <div class="family-tile-wrap wizard-option-wrap ${choice.enabled ? "selected" : ""}">
                      <div class="glow-under wizard-option-glow" style="${this._safe(glowStyle)}" aria-hidden="true"><div class="glow-overlay"></div></div>
                      <div class="wizard-option ${choice.enabled ? "selected" : ""}">
                        <button
                          class="wizard-option-main"
                          data-action="choose-force-mode"
                          data-mode="${this._safe(choice.mode)}"
                          type="button"
                          ${pending ? `aria-busy="true"` : ""}
                          ${!choice.available || busy ? "disabled" : ""}
                        >
                          <span class="wizard-option-icon"><ha-icon icon="${this._safe(choice.icon)}"></ha-icon></span>
                          <span class="wizard-option-copy">
                            <span class="wizard-option-title">${this._safe(choice.title)}</span>
                            ${pending ? pendingLine : !choice.canToggle ? `<span class="control-unavailable family-unavailable">${UNAVAILABLE_TEXT}</span>` : ""}
                          </span>
                          <ha-icon class="wizard-option-next" icon="mdi:chevron-right"></ha-icon>
                        </button>
                        <button
                          class="wizard-plan-toggle ${choice.enabled ? "selected" : ""}"
                          data-action="toggle-charging-plan"
                          data-mode="${this._safe(choice.mode)}"
                          type="button"
                          role="switch"
                          aria-checked="${choice.enabled ? "true" : "false"}"
                          aria-label="${this._safe(choice.title)}"
                          ${pending ? `aria-busy="true"` : ""}
                          ${!choice.canToggle || (!choice.enabled && !this._isAvailable(this._config.controller_entity)) || busy ? "disabled" : ""}
                        >
                          <span class="wizard-plan-toggle-thumb"></span>
                        </button>
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>
            ${this._entity(this._config.charge_policy_entity) || this._entity(this._config.duty_cycle_entity) ? `<button class="advanced-settings" data-action="open-settings" type="button" aria-haspopup="dialog"><ha-icon icon="${UI_ICONS.settings}" aria-hidden="true"></ha-icon><span>Settings</span><ha-icon icon="${UI_ICONS.next}" aria-hidden="true"></ha-icon></button>` : ""}
            ${error}${status}</div>
          </div>
      `;
    }

    const mode = this._forceWizardStep;
    if (mode === "intelligent") {
      return `

        <div class="dialog-panel force-wizard-panel wizard-step-panel intelligent-panel">
          <div class="dialog-content wizard-step-body intelligent-page">${this._intelligentPage()}${error}${status}</div>
        </div>
    `;
    }
    const isSchedule = mode === "schedule";
    const scheduleEntity = this._entity(this._config.schedule_entity);
    const scheduleName = String(scheduleEntity?.attributes?.friendly_name || "Charging schedule");
    const timerAvailable = Boolean(
      this._entity(this._config.force_timer_entity) &&
        this._entity(this._config.force_charge_duration_entity),
    );
    const priceAvailable = Boolean(
      this._entity(isSchedule ? this._schedulePriceEntity() : this._config.force_price_entity) &&
        this._entity(this._config.acceptable_price_entity) &&
        this._entity(this._config.price_entity),
    );
    const timerReady = this._isAvailable(this._config.force_timer_entity) && this._isAvailable(this._config.force_charge_duration_entity);
    const priceReady = this._isAvailable(isSchedule ? this._schedulePriceEntity() : this._config.force_price_entity) &&
      this._isAvailable(this._config.acceptable_price_entity) && this._isAvailable(this._config.price_entity);
    const field = isSchedule
      ? `
          <button
            class="wizard-schedule-entity"
            data-action="open-more-info"
            data-entity="${this._safe(this._config.schedule_entity)}"
            type="button"
            ${!scheduleEntity || busy ? "disabled" : ""}
          >
            <span class="wizard-option-icon"><ha-icon icon="mdi:calendar-clock"></ha-icon></span>
            <span class="wizard-option-copy">
              <span class="wizard-option-title">${this._safe(scheduleName)}</span>
            </span>
            <ha-icon class="wizard-option-next" icon="mdi:chevron-right"></ha-icon>
          </button>
          ${priceAvailable || this._schedulePriceGate ? `<div class="wizard-expandable ${this._schedulePriceGate ? "expanded" : ""}">
            <button
              class="wizard-toggle ${this._schedulePriceGate ? "selected" : ""}"
              data-action="toggle-schedule-price"
              type="button"
              role="switch"
              aria-checked="${this._schedulePriceGate ? "true" : "false"}"
              ${this._isPendingControl("schedule-price") ? `aria-busy="true"` : ""}
              ${busy || (!priceReady && !this._schedulePriceGate) || (this._isSchedulePlanActive() && !this._isAvailable(this._schedulePriceEntity())) ? "disabled" : ""}
            >
              <span class="wizard-option-icon"><ha-icon icon="mdi:currency-eur"></ha-icon></span>
              <span class="wizard-toggle-copy">
                <strong>Also require an acceptable price</strong>
                ${this._isPendingControl("schedule-price") ? pendingLine : !priceReady ? `<span class="control-unavailable family-unavailable">${UNAVAILABLE_TEXT}</span>` : ""}
              </span>
              <span class="wizard-toggle-state ${this._schedulePriceGate ? "selected" : ""}" aria-hidden="true">
                <span class="wizard-toggle-state-thumb"></span>
              </span>
            </button>
            ${
              this._schedulePriceGate
                ? `
                  <div class="wizard-expansion">
                    ${this._forceWizardNumberField(
                      this._config.acceptable_price_entity,
                      "Maximum acceptable price",
                    )}
                  </div>
                `
                : ""
            }
          </div>` : ""}
        `
      : `
          ${timerAvailable || this._forceNowTimer ? `<div class="wizard-expandable ${this._forceNowTimer ? "expanded" : ""}">
            <button
              class="wizard-toggle ${this._forceNowTimer ? "selected" : ""}"
              data-action="toggle-force-now-timer"
              type="button"
              role="switch"
              aria-checked="${this._forceNowTimer ? "true" : "false"}"
              ${this._isPendingControl("force-timer") ? `aria-busy="true"` : ""}
              ${(!timerReady && !this._forceNowTimer) || busy || (this._isForcePlanActive() && !this._isAvailable(this._config.force_timer_entity)) ? "disabled" : ""}
            >
              <span class="wizard-option-icon"><ha-icon icon="mdi:timer-outline"></ha-icon></span>
              <span class="wizard-toggle-copy">
                <strong>Stop after a set time</strong>
                ${this._isPendingControl("force-timer") ? pendingLine : !timerReady ? `<span class="control-unavailable family-unavailable">${UNAVAILABLE_TEXT}</span>` : ""}
              </span>
              <span class="wizard-toggle-state ${this._forceNowTimer ? "selected" : ""}" aria-hidden="true">
                <span class="wizard-toggle-state-thumb"></span>
              </span>
            </button>
            ${
              this._forceNowTimer
                ? `<div class="wizard-expansion">${this._forceDurationField(
                    this._config.force_charge_duration_entity,
                  )}</div>`
                : ""
            }
          </div>` : ""}
          ${priceAvailable || this._forceNowPrice ? `<div class="wizard-expandable ${this._forceNowPrice ? "expanded" : ""}">
            <button
              class="wizard-toggle ${this._forceNowPrice ? "selected" : ""}"
              data-action="toggle-force-now-price"
              type="button"
              role="switch"
              aria-checked="${this._forceNowPrice ? "true" : "false"}"
              ${this._isPendingControl("force-price") ? `aria-busy="true"` : ""}
              ${(!priceReady && !this._forceNowPrice) || busy || (this._isForcePlanActive() && !this._isAvailable(this._config.force_price_entity)) ? "disabled" : ""}
            >
              <span class="wizard-option-icon"><ha-icon icon="mdi:currency-eur"></ha-icon></span>
              <span class="wizard-toggle-copy">
                <strong>Require an acceptable price</strong>
                ${this._isPendingControl("force-price") ? pendingLine : !priceReady ? `<span class="control-unavailable family-unavailable">${UNAVAILABLE_TEXT}</span>` : ""}
              </span>
              <span class="wizard-toggle-state ${this._forceNowPrice ? "selected" : ""}" aria-hidden="true">
                <span class="wizard-toggle-state-thumb"></span>
              </span>
            </button>
            ${
              this._forceNowPrice
                ? `<div class="wizard-expansion">${this._forceWizardNumberField(
                    this._config.acceptable_price_entity,
                    "Maximum acceptable price",
                  )}</div>`
                : ""
            }
          </div>` : ""}
        `;

    return `

        <div class="dialog-panel force-wizard-panel wizard-step-panel">
          <div class="dialog-content wizard-step-body">${field}${error}${status}</div>
        </div>
    `;
  }

  // Readable text for controller_error; warnings never replace the title with "Controller error".
  _controllerErrorInfo(value): { level: "warning" | "error"; message: string } | null {
    const id = String(value ?? "").trim();
    if (!id || ["NONE", "None", "none", "unknown", "unavailable"].includes(id)) return null;
    if (CONTROLLER_WARNINGS[id]) return { level: "warning", message: CONTROLLER_WARNINGS[id] };
    const pattern = CONTROLLER_WARNING_PATTERNS.find(([expression]) => expression.test(id));
    if (pattern) return { level: "warning", message: pattern[1] };
    if (id.startsWith("intelligent_")) return { level: "warning", message: "Intelligent charging needs attention" };
    return { level: "error", message: CONTROLLER_ERRORS[id] || "Check the SmartEVSE Dual Charger integration" };
  }

  // `first` is the start of the plan's first remaining charge, clamped to now: a block that
  // began before midnight and is still running belongs to tonight, not to yesterday.
  _intelligentPlanHeading(first: number | null, now = Date.now()) {
    if (first === null) return "Plan";
    const day = this._localDayKey(first);
    const hour = this._localHour(first) ?? 0;
    if (day === this._localDayKey(new Date(now))) return hour >= 17 || hour < 6 ? "Tonight" : "Today";
    // Tomorrow morning is tonight only when seen from the day before; after midnight it is a day away.
    if (day === this._localDayKey(new Date(now + 86_400_000)) && hour < 12 && (this._localHour(now) ?? 12) >= 6) return "Tonight";
    return formatHassDate(this._hass, first, { year: false, weekday: true });
  }

  // "53% → 80% by 07:00 · ≈ €4.91 · saving ≈ €1.29"
  _intelligentCarSummary(charger, currency, now = Date.now()) {
    const status = String(charger?.status || "");
    if (status === "identifying") return "Identifying vehicle";
    if (status === "excluded") return "Not planned · charge policy";
    if (charger?.car_timer) return "Car’s own charging timer is on";
    if (status === "not_accepting" || charger?.not_accepting) return "Car isn’t accepting charge";
    const soc = this._num(charger?.soc);
    const target = charger?.target ?? charger?.minimum;
    const targetValue = this._num(target);
    const from = soc !== null ? `${this._formatPercent(soc)} → ` : "";
    const readyBy = this._intelligentDeadlineClock(charger);
    let progress: string;
    if (status === "reached" || status === "done") {
      const topUp = charger?.top_up && this._blocks(charger).some((block) => block.topUp && block.end > now);
      const limit = this._num(charger?.car_limit);
      // "done" also means no further charge (retries used up, battery level unknown); like the
      // tile, only a known level at or above the target reads as reached.
      const reached = status === "reached" || (soc !== null && targetValue !== null && soc >= targetValue);
      progress = topUp ? `Topping up${limit !== null ? ` to ${this._formatPercent(limit)}` : ""}`
        : reached ? `${this._formatPercent(target)} reached` : "Charging complete";
    } else if (charger?.estimated === true) {
      // Battery level unknown: the plan is an energy budget, so it names energy, not a target.
      return status === "at_risk" || status === "catch_up" ? this._intelligentShortHead(charger, status) : this._intelligentTargetClause(charger);
    } else if (status === "at_risk") {
      const projected = this._num(charger?.projected_soc);
      progress = `${from}${projected !== null ? `≈ ${this._formatPercent(projected)}` : UNAVAILABLE_TEXT} by ${readyBy} · below ${this._formatPercent(target)}`;
    } else if (status === "catch_up") {
      progress = `Below ${this._formatPercent(target)} after ${readyBy} · catching up`;
    } else {
      progress = `${from}${this._intelligentTargetClause(charger)}`;
    }
    const money = this._intelligentMoneyLine(charger, currency, status === "reached" || status === "done" ? "saved" : "saving");
    return [progress, money].filter(Boolean).join(" · ");
  }

  _intelligentLearningFact(vehicle) {
    const sessions = Math.max(0, Math.round(this._num(vehicle?.learned_sessions) ?? 0));
    if (vehicle?.model?.kwh_per_pct_source === "learned") return `Learned from ${sessions} ${sessions === 1 ? "charge" : "charges"}`;
    return `Learning · ${Math.min(sessions, 3)} of 3 charges`;
  }

  _intelligentTimeField(entityId, vehicleName) {
    const available = this._isAvailable(entityId);
    const pending = this._fieldWrites.has(entityId);
    const value = available ? this._normaliseClock(this._editorDraft(entityId)) : "";
    // The field being saved stays enabled; its own label carries the pending state.
    return `
      <label class="wizard-field intelligent-field" ${pending ? `aria-busy="true"` : ""}>
        <span class="wizard-field-label">Ready by${pending ? `<span class="control-pending">${PENDING_INDICATOR}Saving…</span>` : !available ? `<span class="control-unavailable family-unavailable">${UNAVAILABLE_TEXT}</span>` : ""}</span>
        <input
          class="setting-input intelligent-time-input"
          data-entity="${this._safe(entityId)}"
          type="time"
          value="${this._safe(value)}"
          aria-label="${this._safe(`${vehicleName} ready by`)}"
          ${available ? "" : "disabled"}
        />
      </label>
    `;
  }

  // An Intelligent number setting (minimum charge, top-up price): commits on blur or Enter, shows
  // its own pending state and stays enabled while it saves.
  _intelligentNumberField(entityId, label: string, options: { ariaLabel?: string; unit?: string; inputmode?: string; className?: string } = {}) {
    const meta = this._editorMeta(entityId);
    const available = meta.supported && meta.kind === "number";
    const pending = this._fieldWrites.has(entityId);
    const hasDraft = Object.prototype.hasOwnProperty.call(this._editorDrafts, entityId);
    const stateValue = this._num(this._state(entityId));
    const value = !available ? "" : hasDraft ? this._editorDrafts[entityId] : stateValue === null ? "" : String(stateValue);
    const min = available && meta.min !== null ? `min="${this._safe(meta.min)}"` : "";
    const max = available && meta.max !== null ? `max="${this._safe(meta.max)}"` : "";
    const step = available && meta.step !== null ? `step="${this._safe(meta.step)}"` : "";
    const unit = options.unit ?? (available ? meta.unit : "") ?? "";
    return `
      <label class="wizard-field ${this._safe(options.className ?? "")}" ${pending ? `aria-busy="true"` : ""}>
        <span class="wizard-field-label">${this._safe(label)}${pending ? `<span class="control-pending">${PENDING_INDICATOR}Saving…</span>` : !available ? `<span class="control-unavailable family-unavailable">${UNAVAILABLE_TEXT}</span>` : ""}</span>
        <span class="wizard-input-wrap">
          <input
            class="setting-input force-input intelligent-number-input"
            data-entity="${this._safe(entityId)}"
            type="number"
            inputmode="${this._safe(options.inputmode ?? "decimal")}"
            value="${this._safe(value)}"
            ${options.ariaLabel ? `aria-label="${this._safe(options.ariaLabel)}"` : ""}
            ${min}
            ${max}
            ${step}
            ${available ? "" : "disabled"}
          />
          ${unit ? `<span class="wizard-input-unit">${this._safe(unit)}</span>` : ""}
        </span>
      </label>
    `;
  }

  _intelligentMinimumField(entityId, vehicleName) {
    return this._intelligentNumberField(entityId, "Minimum charge",
      { ariaLabel: `${vehicleName} minimum charge`, unit: "%", inputmode: "numeric", className: "intelligent-field" });
  }

  // Learned departure suggestion: "Usually leaves 07:30" and a quiet action pill that writes
  // the suggested ready-by time.
  _intelligentSuggestion(entityId, vehicleName, suggested, usuallyLeaves = null) {
    const clock = this._normaliseClock(suggested);
    if (!clock || !this._isAvailable(entityId)) return "";
    const current = this._normaliseClock(this._state(entityId));
    if (clock === current) return "";
    const earlier = Boolean(current) && clock < current;
    const pending = this._fieldPendingSource(entityId) === "suggest";
    const label = this._formatClock(clock);
    const leaves = this._normaliseClock(usuallyLeaves);
    const fact = leaves ? `Usually leaves ${this._formatClock(leaves)}` : earlier ? "Usually leaves earlier" : "Usually leaves later";
    return `
      <div class="intelligent-suggestion" ${earlier ? `data-tone="warning"` : ""}>
        <span class="intelligent-fact">${earlier ? WARNING_GLYPH : ""}${this._safe(fact)}</span>
        <button
          class="family-action quiet intelligent-suggestion-pill"
          type="button"
          data-action="use-suggested-ready-by"
          data-entity="${this._safe(entityId)}"
          data-value="${this._safe(clock)}"
          aria-label="${this._safe(`Set ${vehicleName} ready by to ${label}`)}"
          aria-busy="${pending ? "true" : "false"}"
          ${this._writePending ? "disabled" : ""}
        >${pending ? `${PENDING_INDICATOR}Saving…` : `Use ${this._safe(label)}`}</button>
      </div>
    `;
  }

  _intelligentVehicleSettings(key: IntelligentVehicleKey, ids: IntelligentEntityIds) {
    const { readyBy, minimum } = ids.vehicles[key];
    const hasReadyBy = Boolean(readyBy && this._entity(readyBy));
    const hasMinimum = Boolean(minimum && this._entity(minimum));
    if (!hasReadyBy && !hasMinimum) return "";
    const name = this._intelligentVehicleLabel(key);
    const vehicle = this._intelligent()?.vehicles?.[key] || {};
    // An unidentified car's battery level is never known, so the integration plans it by an
    // energy estimate; its minimum does not change that plan.
    const learning = key === "other" ? (this._intelligent() ? "Battery level unknown · planned by energy" : "")
      : !this._intelligent()?.vehicles?.[key] ? "" : this._intelligentLearningFact(vehicle);
    return `
      <section class="intelligent-vehicle" aria-label="${this._safe(name)}" data-vehicle="${this._safe(key)}">
        <div class="intelligent-vehicle-head">
          <span class="intelligent-vehicle-name">${this._safe(name)}</span>
          ${learning ? `<span class="intelligent-fact">${this._safe(learning)}</span>` : ""}
        </div>
        <div class="intelligent-vehicle-fields">
          ${hasReadyBy ? this._intelligentTimeField(readyBy, name) : ""}
          ${hasMinimum ? this._intelligentMinimumField(minimum, name) : ""}
        </div>
        ${hasReadyBy && key !== "other" ? this._intelligentSuggestion(readyBy, name, vehicle.suggested_ready_by, vehicle.usually_leaves) : ""}
      </section>
    `;
  }

  // "No hours below 0.160 before 07:00" when no known price qualifies for a top-up. While the
  // hours before the deadline are not all priced yet, it only speaks for the known ones.
  _intelligentTopUpFact(ids: IntelligentEntityIds, now = Date.now()) {
    const payload = this._intelligent();
    const price = this._num(this._state(ids.topUpPrice)) ?? this._num(payload?.top_up?.price);
    const slots = Array.isArray(payload?.slots) ? payload.slots : [];
    const chargers = Object.values(this._intelligentChargers()).filter((charger) => Number.isFinite(Date.parse(charger.deadline)));
    if (price === null || !slots.length || !chargers.length) return "";
    const latest = chargers.reduce((best, charger) => Date.parse(charger.deadline) > Date.parse(best.deadline) ? charger : best);
    const deadline = Date.parse(latest.deadline);
    const qualifies = slots.some((slot) => slot?.kind === "known" && this._num(slot.price) !== null &&
      Number(slot.price) <= price && Date.parse(slot.end) > now && Date.parse(slot.start) < deadline);
    if (qualifies) return "";
    const unit = this._attr(ids.topUpPrice, "unit_of_measurement");
    const limit = this._safe(formatHassNumber(this._hass, price, { digits: 3, unit: unit || undefined }));
    const knownUntil = Date.parse(payload?.known_until);
    const allKnown = Number.isFinite(knownUntil) && knownUntil >= deadline;
    return `<p class="intelligent-fact intelligent-top-up-fact">${allKnown
      ? `No hours below ${limit} before ${this._safe(this._intelligentDeadlineClock(latest))}`
      : `No known hours below ${limit} yet`}</p>`;
  }

  _intelligentTopUp(ids: IntelligentEntityIds, now = Date.now()) {
    const entityId = ids.topUp;
    if (!entityId || !this._entity(entityId)) return "";
    const on = this._state(entityId) === "on";
    const ready = this._isAvailable(entityId);
    const pending = this._isPendingControl("intelligent-top-up");
    const pendingLine = `<span class="control-pending">${PENDING_INDICATOR}Updating…</span>`;
    const priceField = ids.topUpPrice && this._entity(ids.topUpPrice) ? this._intelligentNumberField(ids.topUpPrice, "Top up below") : "";
    const fact = on && this._isIntelligentPlanActive() ? this._intelligentTopUpFact(ids, now) : "";
    return `
      <div class="wizard-expandable intelligent-top-up ${on ? "expanded" : ""}">
        <button
          class="wizard-toggle ${on ? "selected" : ""}"
          data-action="toggle-intelligent-top-up"
          type="button"
          role="switch"
          aria-checked="${on ? "true" : "false"}"
          ${pending ? `aria-busy="true"` : ""}
          ${this._writePending || !ready ? "disabled" : ""}
        >
          <span class="wizard-option-icon"><ha-icon icon="mdi:battery-plus"></ha-icon></span>
          <span class="wizard-toggle-copy">
            <strong>Top up when price is low</strong>
            ${pending ? pendingLine : !ready ? `<span class="control-unavailable family-unavailable">${UNAVAILABLE_TEXT}</span>` : ""}
          </span>
          <span class="wizard-toggle-state ${on ? "selected" : ""}" aria-hidden="true">
            <span class="wizard-toggle-state-thumb"></span>
          </span>
        </button>
        ${on && (priceField || fact) ? `<div class="wizard-expansion">${priceField}${fact}</div>` : ""}
      </div>
    `;
  }

  // The Intelligent page: the plan first (read-only, from the integration), then its settings.
  _intelligentPage(now = Date.now()) {
    const payload = this._intelligent();
    const ids = this._intelligentEntityIds();
    const currency = payload?.currency;
    const chargers = this._intelligentChargers();
    const order = Array.isArray(payload?.order) ? payload.order.filter((key) => chargers[key]) : [];
    const keys = [...order, ...["smartevse_1", "smartevse_2"].filter((key) => chargers[key] && !order.includes(key))];
    const warning = this._controllerErrorInfo(this._attr(this._config.controller_entity, "controller_error"));
    const forceActive = this._isForcePlanActive() || payload?.overridden_by === "force";
    let plan = "";
    if (this._isIntelligentPlanActive()) {
      const blocks = keys
        .flatMap((key) => this._blocks(chargers[key]).filter((block) => block.end > now).map((block) => ({ ...block, key })))
        .sort((left, right) => left.start - right.start || left.key.localeCompare(right.key));
      // A block that is already running counts from now, so after midnight the plan is still tonight's.
      const firstStart = blocks.length ? Math.max(blocks[0].start, now) : null;
      const firstDay = firstStart !== null ? this._localDayKey(firstStart) : "";
      const blockRows = blocks.map((block) => {
        const start = this._localDayKey(Math.max(block.start, now)) === firstDay ? formatHassTime(this._hass, block.start) : this._formatDateTime(block.start);
        return `<li class="intelligent-block"><span class="intelligent-block-time">${this._safe(start)}–${this._safe(formatHassTime(this._hass, block.end))}</span> · <span class="intelligent-block-vehicle">${this._safe(this._intelligentVehicleName(chargers[block.key], block.key))}</span>${block.topUp ? `<span class="intelligent-block-tag"> · top-up</span>` : ""}</li>`;
      }).join("");
      const carRows = keys.map((key) => {
        const charger = chargers[key];
        const warn = ["at_risk", "catch_up", "not_accepting"].includes(charger.status) || charger.car_timer || charger.not_accepting;
        return `<li class="intelligent-car" data-charger="${this._safe(key)}"><span class="intelligent-car-name">${this._safe(this._intelligentVehicleName(charger, key))}</span><span class="intelligent-car-line"${warn ? ` data-tone="warning"` : ""}>${warn ? WARNING_GLYPH : ""}${this._safe(this._intelligentCarSummary(charger, currency, now))}</span></li>`;
      }).join("");
      const totals = payload?.totals && typeof payload.totals === "object" ? payload.totals : {};
      // A plan for an unknown battery level is energy, not money: its cost and saving are guesses.
      const estimated = keys.some((key) => chargers[key].estimated === true && !["excluded", "identifying"].includes(chargers[key].status));
      const totalEnergy = this._num(totals.energy_kwh);
      const totalCost = keys.length && !totals.partial && !estimated ? this._formatMoney(totals.cost, currency) : "";
      const totalSaving = keys.length && !totals.partial && !totals.includes_forecast && !estimated ? this._formatSaving(totals.saving, currency) : "";
      const totalRows = [
        estimated && totalEnergy !== null && totalEnergy > 0
          ? `<div><dt>Planned energy</dt><dd>≈ ${this._safe(formatHassNumber(this._hass, totalEnergy, { digits: totalEnergy >= 10 ? 0 : 1, unit: "kWh" }))}</dd></div>` : "",
        totalCost ? `<div><dt>Planned cost</dt><dd>≈ ${this._safe(totalCost)}${totals.includes_forecast ? " forecast" : ""}</dd></div>` : "",
        totalSaving ? `<div><dt>Saving vs charging at plug-in</dt><dd>≈ ${this._safe(totalSaving)}</dd></div>` : "",
      ].join("");
      const policyEntity = this._config.charge_policy_entity;
      const firstLabel = order.length >= 2 ? order[0].replace("smartevse_", "SmartEVSE ") : "";
      const policyMeta = policyEntity && this._entity(policyEntity) ? this._editorMeta(policyEntity) : null;
      const chargesFirst = !firstLabel ? "" : policyMeta
        ? `<button class="setting-tile intelligent-order" data-action="open-submenu" data-entity="${this._safe(policyEntity)}" type="button" aria-haspopup="dialog" ${!policyMeta.supported || this._writePending ? "disabled" : ""}>
            <div class="setting-icon"><ha-icon icon="mdi:source-fork" aria-hidden="true"></ha-icon></div>
            <div class="setting-copy"><div class="setting-label">Charges first</div><div class="setting-value">${this._safe(firstLabel)}</div></div>
            <ha-icon class="setting-next" icon="${UI_ICONS.next}" aria-hidden="true"></ha-icon>
          </button>`
        : `<p class="intelligent-fact">Charges first: ${this._safe(firstLabel)}</p>`;
      const facts: string[] = [];
      if (forceActive) facts.push("Resumes after force charge");
      if (keys.length) {
        const knownUntil = Date.parse(payload?.known_until);
        facts.push(Number.isFinite(knownUntil) ? `Prices until ${this._formatDateTime(knownUntil)}` : "Prices unavailable");
        const expectedAt = Date.parse(payload?.prices_expected_at);
        const beyondPrices = keys.some((key) => {
          const deadline = Date.parse(chargers[key].deadline);
          return Number.isFinite(deadline) && (!Number.isFinite(knownUntil) || deadline > knownUntil);
        });
        // Round 5: hours without a known price are used last; the plan waits for
        // tomorrow's prices while that is safe and is rebuilt when they arrive.
        if (Number.isFinite(expectedAt)) facts.push(`Waiting for tomorrow's prices (about ${this._safe(formatHassTime(this._hass, expectedAt))}) · plan updates then`);
        else if (beyondPrices) facts.push("Hours without prices are used only if needed");
      }
      const learnedDays = this._num(payload?.household?.learned_days);
      if (learnedDays !== null && learnedDays < 7) facts.push(`Learning household load (${Math.max(0, Math.round(learnedDays))} of 7 days)`);
      plan = `
        <section class="intelligent-plan" aria-label="Plan">
          <h3 class="intelligent-section-title">${this._safe(this._intelligentPlanHeading(firstStart, now))}</h3>
          ${keys.length === 0 ? `<p class="intelligent-fact">No vehicle connected</p>` : blocks.length ? `<ol class="intelligent-blocks">${blockRows}</ol>` : `<p class="intelligent-fact">No charging planned</p>`}
          ${carRows ? `<ul class="intelligent-cars">${carRows}</ul>` : ""}
          ${totalRows ? `<dl class="intelligent-totals">${totalRows}</dl>` : ""}
          ${chargesFirst}
          ${facts.length ? `<div class="intelligent-facts">${facts.map((fact) => `<span class="intelligent-fact">${this._safe(fact)}</span>`).join("")}</div>` : ""}
        </section>
      `;
    }
    const vehicles = INTELLIGENT_VEHICLES.map((key) => this._intelligentVehicleSettings(key, ids)).join("");
    return `
      ${warning?.level === "warning" ? this._notice("warning", warning.message) : ""}
      ${plan}
      ${vehicles ? `<div class="intelligent-settings">${vehicles}</div>` : ""}
      ${this._intelligentTopUp(ids, now)}
    `;
  }

  _settingsSubmenuModal(entityId) {
    const meta = this._editorMeta(entityId);
    const draft = this._editorDraft(entityId);
    const content =
      !meta.supported ? this._notice("warning", "This setting is unavailable.") : meta.kind === "select"
        ? `
          <div class="modal-options" role="group" aria-label="${this._safe(this._dialogTitle())}">
            ${meta.optionItems
              .map((option) => {
                const selected =
                  option.value === draft ||
                  (entityId === this._config.charge_policy_entity &&
                    option.label === this._chargePolicyDisplay(draft));
                const pending = this._isPendingControl(`option:${option.value}`);
                return `
                  <button
                    class="family-action family-toggle modal-option ${selected ? "selected" : ""}"
                    data-action="choose-option"
                    data-entity="${this._safe(entityId)}"
                    data-value="${this._safe(option.value)}"
                    aria-pressed="${selected ? "true" : "false"}"
                    aria-busy="${pending ? "true" : "false"}"
                    type="button" ${this._writePending ? "disabled" : ""}
                  >
                    <span class="modal-option-title">${this._safe(option.label)}</span>
                    ${pending ? PENDING_INDICATOR : `<ha-icon class="family-toggle-check" icon="${UI_ICONS.check}" aria-hidden="true"></ha-icon>`}
                  </button>
                `;
              })
              .join("")}
          </div>
        `
        : this._settingEditor(entityId, meta, draft);

    return `

        <div class="dialog-panel settings-panel submenu-panel">
          <div class="dialog-content">${content}
          ${this._settingsBusy ? `<span class="family-visually-hidden" role="status">Saving settings…</span>` : ""}
          ${this._settingsError ? this._notice("error", this._settingsError) : ""}</div>
        </div>
    `;
  }

  _settingTile({ entityId, icon, label, value, presentation = "inline" }) {
    if (!entityId || !this._entity(entityId)) return "";
    const meta = this._editorMeta(entityId);
    const action = presentation === "submenu" ? "open-submenu" : "edit";
    return `
      <button class="setting-tile" data-action="${this._safe(action)}" data-entity="${this._safe(entityId)}" type="button" aria-haspopup="dialog" ${!meta.supported || this._writePending ? "disabled" : ""}>
        <div class="setting-icon"><ha-icon icon="${this._safe(icon)}" aria-hidden="true"></ha-icon></div>
        <div class="setting-copy">
          <div class="setting-label">${this._safe(label)}</div>
          <div class="setting-value ${meta.supported ? "" : "family-unavailable"}">${meta.supported ? this._safe(value) : UNAVAILABLE_TEXT}</div>
        </div>
        <ha-icon class="setting-next" icon="${UI_ICONS.next}" aria-hidden="true"></ha-icon>
      </button>
    `;
  }

  _settingEditor(entityId, meta, draft) {
    const label = entityId === this._config.duty_cycle_entity ? "Duty cycle"
      : entityId === this._config.charge_policy_entity ? "Charge policy"
      : this._entity(entityId)?.attributes?.friendly_name || "Setting";
    const accessibleLabel = meta.unit ? `${label} (${meta.unit})` : label;
    let control = "";
    if (meta.kind === "select") {
      const options = meta.optionItems
        .map(
          (option) => `
            <option value="${this._safe(option.value)}" ${option.value === draft ? "selected" : ""}>
              ${this._safe(option.label)}
            </option>
          `,
        )
        .join("");
      control = `
        <select class="setting-select" aria-label="${this._safe(accessibleLabel)}" data-family-initial-focus data-entity="${this._safe(entityId)}" ${this._writePending ? "disabled" : ""}>
          ${options}
        </select>
      `;
    } else {
      const inputType = meta.kind === "time" ? "time" : meta.kind === "number" ? "number" : "text";
      const minAttr = meta.kind === "number" && meta.min !== null ? `min="${this._safe(meta.min)}"` : "";
      const maxAttr = meta.kind === "number" && meta.max !== null ? `max="${this._safe(meta.max)}"` : "";
      const stepAttr = meta.kind === "number" ? `step="${this._safe(meta.step)}"` : "";
      control = `
        <input
          class="setting-input"
          aria-label="${this._safe(accessibleLabel)}"
          data-family-initial-focus
          data-entity="${this._safe(entityId)}"
          type="${this._safe(inputType)}"
          value="${this._safe(draft)}"
          ${this._writePending ? "disabled" : ""}
          ${minAttr}
          ${maxAttr}
          ${stepAttr}
        />
      `;
    }

    return `
      <div class="setting-editor">
        ${control}
      </div>
    `;
  }

  // Apply/Cancel share the dialog's equal footer; Apply carries the pending state.
  _settingEditorFooter() {
    const entityId = this._settingsSubmenuEntity;
    const meta = entityId ? this._editorMeta(entityId) : null;
    if (!entityId || !meta?.supported || meta.kind === "select") return nothing;
    const saving = this._isPendingControl(`save:${entityId}`);
    return html`<button class="family-action" data-action="cancel-edit" data-entity=${entityId} type="button" ?disabled=${this._writePending}>Cancel</button><button
        class="family-action primary"
        data-action="save-edit"
        data-entity=${entityId}
        type="button"
        aria-busy=${saving ? "true" : "false"}
        ?disabled=${this._writePending}
      >${saving ? html`${pendingIndicator()}Saving…` : "Apply"}</button>`;
  }

  _costData() {
    return this._entity(this._config.controller_entity)?.attributes?.charging_costs;
  }

  // The Intelligent realised saving for one ledger session, matched by ledger id. One plug-in can
  // span several deadline windows with the same ledger id (one per night, and an empty one opened
  // by the last deadline roll before the car leaves): windows too small to carry a saving are
  // ignored and the rest combine. The sum is shown only when every remaining window has one.
  _intelligentSession(ledgerId): { saving: number | null; mixed: boolean; partial: boolean } | null {
    if (!ledgerId || !this._intelligentSupported()) return null;
    const sessions = this._intelligent()?.sessions;
    if (!Array.isArray(sessions)) return null;
    const windows = sessions.filter((session) => session && typeof session === "object" && session.ledger_id === ledgerId &&
      (this._num(session.energy_kwh) ?? 0) >= MIN_WINDOW_KWH);
    if (!windows.length) return null;
    const savings = windows.map((session) => this._num(session.saving));
    const complete = savings.every((saving) => saving !== null);
    return {
      saving: complete ? Math.round(savings.reduce((sum: number, saving) => sum + (saving as number), 0) * 100) / 100 : null,
      mixed: windows.some((session) => session.mixed === true),
      partial: windows.some((session) => session.partial === true),
    };
  }

  // "≈ €1.25" for the disconnected tile until the next plug-in; "" when not trustworthy.
  _lastChargeSaving(record) {
    const session = this._intelligentSession(record?.id);
    if (!session || session.mixed || session.partial) return "";
    return this._formatSaving(session.saving, this._intelligent()?.currency || record?.currency);
  }

  // History detail line comparing a recorded session with charging at plug-in.
  _historySaving(record) {
    const session = this._intelligentSession(record?.id);
    if (!session) return "";
    if (session.mixed) return "Force charge used";
    if (session.partial) return "";
    const currency = this._intelligent()?.currency || record?.currency;
    const saving = this._num(session.saving);
    if (saving === null || Math.abs(saving) < MIN_SAVING) return "";
    const amount = this._formatMoney(Math.abs(saving), currency);
    if (!amount) return "";
    return saving > 0 ? `Saved ≈ ${amount} vs charging at plug-in` : `≈ ${amount} more than charging at plug-in`;
  }

  _costAmount(record) {
    if (!record || !record.currency || typeof record.cost !== "number" || !Number.isFinite(record.cost)
      || (record.energy_kwh > 0 && !(record.priced_kwh > 0))) return UNAVAILABLE_TEXT;
    return formatHassCurrency(this._hass, record.cost, { currency: record.currency, digits: 2 });
  }

  _costLabel(record) {
    const amount = this._costAmount(record);
    return amount === UNAVAILABLE_TEXT ? amount : `≈ ${amount}`;
  }

  _costTime(value) {
    const time = formatHassDateTime(this._hass, value, { year: false });
    return time === UNAVAILABLE_TEXT ? "Time unavailable" : time;
  }

  _chargingHistory() {
    const ledger = this._costData();
    if (!ledger) return this._notice("accent", "Charging history requires the updated SmartEVSE integration.");
    const attrs = this._entity(this._config.controller_entity)?.attributes || {};
    const issues = {
      restart_or_telemetry_gap: "Some time was not observed, including while Home Assistant was offline.",
      shared_meter_ambiguous: "The shared meter could not be assigned to one charger.",
      charger_unavailable: "Charger status was unavailable for part of this session.",
      power_unavailable: "Power readings were unavailable for part of this session.",
      price_unavailable: "Electricity prices were unavailable for part of this session.",
      currency_changed: "The tariff currency changed during this session.",
      clock_changed: "A clock change interrupted accounting.",
      start_not_observed: "Charging was already in progress when tracking started.",
    };
    return `<section class="cost-history" aria-label="Charging history">
      ${ledger.error ? this._notice("error", ledger.error) : ""}
      <p class="cost-note">Estimated from measured power and Real Electricity Price at the time of charging. Shared across all users; latest ${this._safe(ledger.history_limit || 100)} sessions per charger.</p>
      ${["smartevse_1", "smartevse_2"].map(key => {
        const records = ledger.chargers?.[key]?.history;
        return `<details class="cost-charger" data-charger="cost-${key}"><summary><ha-icon icon="mdi:ev-station" aria-hidden="true"></ha-icon><span class="cost-charger-name">${this._safe(attrs[key + "_name"] || key.replace("smartevse_", "SmartEVSE "))}</span><span class="cost-charger-count">${Array.isArray(records) ? records.length : 0} ${Array.isArray(records) && records.length === 1 ? "session" : "sessions"}</span><ha-icon class="cost-disclosure" icon="mdi:chevron-down" aria-hidden="true"></ha-icon></summary>
        ${Array.isArray(records) && records.length ? records.map(r => `<details class="cost-record" data-charger="cost-${this._safe(r.id)}">
          <summary><span class="cost-record-copy"><strong>${this._safe(this._costTime(r.started_at))}</strong><small>${this._safe(r.vehicle && r.vehicle !== "unknown" ? r.vehicle : "Vehicle")} · ${this._safe(formatHassNumber(this._hass, Number(r.energy_kwh || 0), { digits: 2, unit: "kWh" }))}</small></span><span class="cost-record-value"><span class="cost-record-amount"><strong>${this._safe(this._costLabel(r))}</strong><ha-icon class="cost-disclosure" icon="mdi:chevron-down" aria-hidden="true"></ha-icon></span><small>${r.partial ? "Partial estimate" : this._safe(({charging:"Charging", paused:"Paused", complete:"Complete", finished:"Finished", unavailable:"Connection lost"})[r.status] || "Recorded")}</small></span></summary>
          <div class="cost-record-details">${this._historySaving(r) ? `<p class="cost-record-saving">${this._safe(this._historySaving(r))}</p>` : ""}${r.ended_at ? `<p>Ended ${this._safe(this._costTime(r.ended_at))}</p>` : ""}
          ${r.priced_kwh > 0 ? `<p>Average ${this._safe(this._costAmount({...r, cost:r.cost/r.priced_kwh}))}/kWh</p>` : ""}
          ${r.unpriced_kwh > 0 ? `<p>${this._safe(formatHassNumber(this._hass, Number(r.unpriced_kwh), { digits: 3, unit: "kWh" }))} without a price</p>` : ""}
          ${(Array.isArray(r.issues) ? r.issues : []).map(i=>`<p>${this._safe(issues[i] || "Some measurements are missing.")}</p>`).join("")}</div>
        </details>`).join("") : `<div class="family-async-state cost-empty" role="status"><span>No charging sessions recorded yet. Tracking starts with the next charge; earlier sessions are not reconstructed.</span></div>`}</details>`;
      }).join("")}</section>`;
  }

  _chargerDetails(ev1, ev2) {
    const ev = [ev1, ev2].find(item => item.key === this._chargerDetailsKey);
    if (!ev) return "";
    return `<section class="dialog-panel diagnostics-panel">
      <div class="dialog-content"><dl class="charger-diagnostics">
        <div><dt>State</dt>${this._diagnosticValue(ev.available, ev.state)}</div>
        <div><dt>Mode</dt>${this._diagnosticValue(ev.available, ev.mode)}</div>
        <div><dt>Current offered</dt>${this._diagnosticValue(ev.available, this._formatCurrent(ev.chargeCurrent))}</div>
        <div><dt>Limit</dt>${this._diagnosticValue(ev.available, this._formatCurrent(ev.maxCurrent))}</div>
      </dl></div>
    </section>`;
  }

  // Plan tones map onto the shared chip tones; "active" is the accent colour.
  _chipTone(tone): Tone {
    return tone === "active" ? "accent" : tone === "warn" ? "warning" : tone === "error" ? "error" : tone === "success" ? "success" : "neutral";
  }

  _diagnosticValue(available, value) {
    return available ? `<dd>${this._safe(value)}</dd>` : `<dd class="family-unavailable">${UNAVAILABLE_TEXT}</dd>`;
  }

  // Time states read HH:MM:SS while inputs return HH:MM; numbers compare numerically.
  _draftDiffers(key: string) {
    const draft = this._editorDrafts[key];
    const state = this._state(key);
    if (key.startsWith("time.")) return this._normaliseClock(draft) !== this._normaliseClock(state);
    return draft !== state && Number(draft) !== Number(state);
  }

  _dialogGuard(intent: string) {
    const keys = this._editingEntity ? [this._editingEntity]
      : this._forceWizardOpen && this._forceWizardStep === "intelligent" ? this._intelligentFieldEntities()
      : this._forceWizardOpen && this._forceWizardStep !== "choose"
      ? [this._forceWizardStep === "schedule" ? this._schedulePriceGate && this._config.acceptable_price_entity : this._forceNowPrice && this._config.acceptable_price_entity,
         this._forceWizardStep === "now" && this._forceNowTimer && this._config.force_charge_duration_entity].filter(Boolean) : [];
    // An Intelligent field that is saving (or just saved) is not an unsaved draft; its write
    // continues whichever way the dialog is left, and Back is never held for it.
    const committed = (key: string) => this._fieldSaving(key) || (this._fieldWritten.has(key) &&
      this._fieldWritten.get(key)?.value === (this._intelligentFieldRequest(key, this._editorDrafts[key]) as { value?: string }).value);
    const dirty = !this._writePending && keys.some(key => key && this._isAvailable(key) &&
      Object.prototype.hasOwnProperty.call(this._editorDrafts, key) &&
      !committed(key) && this._draftDiffers(key));
    // A sent request can be dismissed, but cannot be submitted twice. Pending
    // indicators/errors remain on the main card; no dismissal cancels a write.
    return {
      pending: intent === "back" && this._writePending,
      dirty,
      message: this._writePending ? "Wait for the current charging request to finish." : "Discard unsaved changes? Any charging request already sent continues.",
      discard: () => { for (const key of keys) if (key && !this._fieldSaving(key)) delete this._editorDrafts[key]; },
    };
  }

  _requestDialogClose() { this._flow.close(); }

  _closeActiveDialog() { this._flow.forceClose(); }

  _dialogTitle(ev1?, ev2?) {
    if (this._flow.current === "history") return "Charging history";
    if (this._chargerDetailsKey) return [ev1, ev2].find(ev => ev?.key === this._chargerDetailsKey)?.smartevseName || "Charger details";
    if (this._settingsSubmenuEntity) return this._settingsSubmenuEntity === this._config.charge_policy_entity ? "Charge policy" : this._settingsSubmenuEntity === this._config.duty_cycle_entity ? "Duty cycle" : this._entity(this._settingsSubmenuEntity)?.attributes?.friendly_name || "Setting";
    if (this._settingsModalOpen) return "Settings";
    return this._forceWizardStep === "schedule" ? "Schedule" : this._forceWizardStep === "now" ? "Force charge"
      : this._forceWizardStep === "intelligent" ? "Intelligent charging" : "Charging plan";
  }

  _evNode(ev) {
    const record = this._costData()?.chargers?.[ev.key]?.session;
    const knownVehicle = ev.connectedEvName && !["unknown", "unavailable", "none", "?", "n/a"].includes(ev.connectedEvName.toLowerCase());
    const vehicleTitle = knownVehicle ? ev.connectedEvName : "Vehicle connected";
    const battery = knownVehicle ? this._batteryPercent(ev.battery) : null;
    const status = !ev.available ? "Unavailable" : ev.hasError ? "Charger error" : !ev.connected ? "No vehicle connected"
      : ev.isCharging ? "Charging" : ev.sessionComplete ? "Session complete" : ev.active ? "Ready to charge" : "Connected · waiting";
    const visual = this._wledVisuals(this._entity(this._config.controller_entity)?.attributes || {});
    const diagnostics = ev.available && ev.connected ? `
      <button class="charger-details" type="button" data-action="open-charger-details" aria-haspopup="dialog" data-charger="${this._safe(ev.key)}" aria-label="${this._safe(ev.smartevseName)} charger details">
        Charger details<ha-icon icon="${UI_ICONS.details}" aria-hidden="true"></ha-icon>
      </button>` : "";
    // Intelligent plan facts: only for a healthy charger, and not while Force overrides the plan.
    const intelligent = this._isIntelligentPlanActive() ? this._intelligent() : null;
    const planCharger = intelligent && ev.available && !ev.hasError && !this._isForcePlanActive() && intelligent.overridden_by !== "force"
      ? intelligent.chargers?.[ev.key] : null;
    const planLines = ev.connected && planCharger && typeof planCharger === "object" ? this._intelligentTileLines(ev) : [];
    const minimum = planCharger ? this._num(planCharger.target ?? planCharger.minimum) : null;
    const lastSaving = !ev.connected && ev.available && !ev.hasError ? this._lastChargeSaving(record) : "";
    const planMarkup = planLines.length
      ? `<div class="charger-plan">${planLines.map((line) => `<p class="charger-plan-line"${line.tone ? ` data-tone="${this._safe(line.tone)}"` : ""}>${line.tone === "warning" ? WARNING_GLYPH : ""}${this._safe(line.text)}</p>`).join("")}</div>`
      : lastSaving ? `<div class="charger-plan"><p class="charger-plan-line">Last charge saved ≈ ${this._safe(lastSaving)}</p></div>` : "";
    const meter = ev.connected && battery !== null ? levelMeterMarkup({
      value: battery,
      label: `${vehicleTitle} battery`,
      tone: batteryTone(battery),
      className: "battery-meter",
      ...(minimum !== null ? { target: minimum, valueText: `${this._formatPercent(battery)}, minimum ${this._formatPercent(minimum)}` } : {}),
    }) : "";
    const nodeStyle = this._wledNodeStyle(visual, ev.visual);
    if (this._layout() === "plan" && ev.connected) {
      const level = battery !== null ? battery : this._num(planCharger?.soc);
      const projected = planCharger ? this._num(planCharger.projected_soc) : null;
      const ringClass = !nodeStyle || this._wledNumber({ [ev.visual]: visual?.[ev.visual] || visual?.off }, ev.visual, "fx") === 0 ? "static"
        : ev.visual === "charging" ? "chase" : "breathe";
      const gauge = this._podGauge({
        value: level, minimum, projected, risk: planCharger?.status === "at_risk", ringClass,
        label: `${vehicleTitle} battery ${level !== null ? this._formatPercent(level) : "unknown"}${minimum !== null ? `, minimum ${this._formatPercent(minimum)}` : ""}`,
      });
      return `
      <div class="family-tile-wrap ev-node-wrap ${this._safe(ev.key)} tone-${this._safe(ev.tone)} visual-${this._safe(ev.visual)}"
        style="${this._safe(nodeStyle)}">
        <div class="glow-under ev-glow" aria-hidden="true"><div class="glow-overlay"></div></div>
        <section class="ev-node ev-pod ${this._safe(ev.key)} tone-${this._safe(ev.tone)} visual-${this._safe(ev.visual)}"
          aria-label="${this._safe(ev.smartevseName)}">
          ${gauge}
          <div class="pod-copy">
            <div class="vehicle-name">${this._safe(vehicleTitle)}</div>
            <div class="charger-name">${this._safe(ev.smartevseName)}</div>
            <div class="charger-status"><span class="state-dot" aria-hidden="true"></span>${this._safe(status)}</div>
          </div>
          ${ev.hasError ? `<p class="charger-message" role="status">${this._safe(ev.error)}</p>` : ""}
          ${planMarkup}
          ${record ? `<button class="session-cost" data-action="open-history" data-charger="${this._safe(ev.key)}" aria-haspopup="dialog" aria-label="${this._safe(ev.smartevseName)} charging cost ${this._safe(this._costLabel(record))}; open history"><strong>${this._safe(this._costLabel(record))}</strong><small>${this._costData()?.error ? "History not saved" : record.partial ? "Partial estimate" : record.status !== "finished" ? "Session estimate" : "Last session"}</small></button>` : ""}
          ${diagnostics}
        </section>
      </div>`;
    }
    return `
      <div class="family-tile-wrap ev-node-wrap ${this._safe(ev.key)} tone-${this._safe(ev.tone)} visual-${this._safe(ev.visual)}"
        style="${this._safe(nodeStyle)}">
        <div class="glow-under ev-glow" aria-hidden="true"><div class="glow-overlay"></div></div>
        <section class="ev-node ${this._safe(ev.key)} tone-${this._safe(ev.tone)} visual-${this._safe(ev.visual)} ${!ev.connected ? "compact" : ""}"
          aria-label="${this._safe(ev.smartevseName)}">
          <div class="charger-heading">
            <span class="charger-icon"><ha-icon icon="mdi:ev-station" aria-hidden="true"></ha-icon></span>
            <div class="charger-copy">
              <div class="charger-name">${this._safe(ev.smartevseName)}</div>
              ${ev.connected ? `<div class="vehicle-name">${this._safe(vehicleTitle)}</div>` : ""}
              <div class="charger-status"><span class="state-dot" aria-hidden="true"></span>${this._safe(status)}</div>
            </div>
            <div class="charger-totals">
              ${ev.connected && battery !== null ? `<div class="battery-value">${this._safe(battery)}<span>%</span></div>` : ""}
              ${record ? `<button class="session-cost" data-action="open-history" data-charger="${this._safe(ev.key)}" aria-haspopup="dialog" aria-label="${this._safe(ev.smartevseName)} charging cost ${this._safe(this._costLabel(record))}; open history"><strong>${this._safe(this._costLabel(record))}</strong><small>${this._costData()?.error ? "History not saved" : record.partial ? "Partial estimate" : ev.connected && record.status !== "finished" ? "Session estimate" : "Last session"}</small></button>` : ev.connected && this._costData() ? `<span class="session-cost empty"><small>No cost recorded yet</small></span>` : ""}
            </div>
          </div>
          ${meter}
          ${ev.hasError ? `<p class="charger-message" role="status">${this._safe(ev.error)}</p>` : !ev.available ? `<p class="charger-message">Status cannot be read. Check the charger connection.</p>` : ""}
          ${planMarkup}
          ${diagnostics}
        </section>
      </div>`;
  }

  _render() {
    this.requestUpdate();
  }

  render() {
    if (!this._config || !this._hass) {
      return html``;
    }

    const controller = this._entity(this._config.controller_entity);
    if (!controller) {
      return html`${unsafeHTML(`
        <ha-card>
          <div class="missing">Controller entity not found: ${this._safe(this._config.controller_entity)}</div>
        </ha-card>
      `)}`;
    }

    const attrs = controller.attributes || {};
    const wledVisuals = this._wledVisuals(attrs);
    const wledStyleVars = this._wledCssVars(wledVisuals);
    const rawEv1 = this._evData(attrs, "smartevse_1", "SmartEVSE 1");
    const rawEv2 = this._evData(attrs, "smartevse_2", "SmartEVSE 2");
    const controllerError = String(attrs.controller_error ?? "").trim();
    const activeRaw = String(attrs.active_smartevse_raw ?? "");
    const chargeAllowed = Boolean(attrs.charge_allowed);
    const price = this._numberState(this._config.price_entity);
    const acceptablePrice = this._numberState(this._config.acceptable_price_entity);
    const chargeReason = String(attrs.charge_reason ?? "").trim().toLowerCase();

    const rawPolicy = this._state(this._config.charge_policy_entity) || this._pretty(attrs.charge_policy);
    const policyDraft =
      this._settingsModalOpen &&
      this._editorDrafts &&
      Object.prototype.hasOwnProperty.call(this._editorDrafts, this._config.charge_policy_entity)
        ? this._editorDrafts[this._config.charge_policy_entity]
        : null;
    const policy = this._displayState(this._config.charge_policy_entity, policyDraft ?? rawPolicy);
    const dutyLabel = this._formatSeconds(this._state(this._config.duty_remaining_entity));
    const timerLabel = this._formatSeconds(this._state(this._config.timer_remaining_entity));
    const scheduleState = this._state(this._config.schedule_entity);
    const scheduleSwitchOn = this._state(this._config.schedule_switch_entity) === "on";
    const scheduleNextEvent = this._attr(this._config.schedule_entity, "next_event");
    const forcePriceOn = this._state(this._config.force_price_entity) === "on";
    const forceTimerOn = this._state(this._config.force_timer_entity) === "on";
    const forceDuration = this._numberState(this._config.force_charge_duration_entity);
    const ev1 = rawEv1;
    const ev2 = rawEv2;
    const reportedActiveEv = activeRaw === "smartevse_1" ? ev1 : activeRaw === "smartevse_2" ? ev2 : null;
    const flowingEv = ev1.isCharging ? ev1 : ev2.isCharging ? ev2 : null;
    const activeEv = flowingEv || (reportedActiveEv?.available && reportedActiveEv.connected ? reportedActiveEv : null);
    // The hero represents the physical WLED device, so derive its glow from the
    // same per-SmartEVSE visuals instead of controller gating such as schedule,
    // price, or charge_allowed. Error wins, then charging, then connected/idle.
    const heroVisuals = [ev1.visual, ev2.visual];
    const heroVisual = heroVisuals.includes("error")
      ? "error"
      : heroVisuals.includes("charging")
        ? "charging"
        : heroVisuals.includes("idle")
          ? "idle"
          : "off";
    const priceAccepted = price !== null && acceptablePrice !== null ? price <= acceptablePrice : false;
    // Warning-level values (e.g. missing prices) keep the plan title and read as a notice.
    const controllerErrorInfo = this._controllerErrorInfo(controllerError);
    const hasControllerError = controllerErrorInfo?.level === "error";
    const controllerWarning = controllerErrorInfo?.level === "warning" ? controllerErrorInfo.message : "";
    const acceptablePriceValue = acceptablePrice !== null
      ? formatHassNumber(this._hass, acceptablePrice, { digits: 3, unit: this._currency })
      : UNAVAILABLE_TEXT;
    const priceLimitLabel = acceptablePrice === null ? "Price limit unavailable" : price === null
      ? `≤ ${acceptablePriceValue} · price unavailable` : `≤ ${acceptablePriceValue}`;
    const forcePlanActive = this._isForcePlanActive();
    const intelligentRestTitle = chargeReason.startsWith("intelligent_") ? this._intelligentRestTitle() : "";
    const gatingTitle = (() => {
      switch (chargeReason) {
        case "all_connected_evs_complete":
          return "All charging sessions complete";
        case "smartevse_api_unavailable":
        case "smartevse_1_api_unavailable":
        case "smartevse_2_api_unavailable":
        case "intelligent_planned_outlet_unavailable":
          return "Charger connection unavailable";
        case "smartevse_1_only_waiting_for_selected_ev":
        case "smartevse_2_only_waiting_for_selected_ev":
          return "Waiting for the selected vehicle";
        case "smartevse_1_only_selected_ev_already_complete":
        case "smartevse_2_only_selected_ev_already_complete":
        case "smartevse_1_only_session_complete":
        case "smartevse_2_only_session_complete":
          return "Selected vehicle’s session complete";
        case "waiting_for_connected_ev":
          return "Waiting for a vehicle";
        case "intelligent_waiting_for_connected_ev":
          // Connected cars that the charge policy leaves out are not "no vehicle".
          return intelligentRestTitle === "Waiting for the selected vehicle" ? intelligentRestTitle : "Waiting for a vehicle";
        case "intelligent_excluded_by_policy":
          return "Waiting for the selected vehicle";
        case "intelligent_waiting_for_planned_slot":
          return "Waiting for planned charge";
        // "Targets reached" only says no car needs more: a car that refuses charge, or one given up
        // below its minimum, is not "Minimum charge reached". The two other ids are the dedicated
        // reasons newer integrations may publish for those cases.
        case "intelligent_targets_reached":
        case "intelligent_charging_complete":
          return intelligentRestTitle || "Charging complete";
        case "intelligent_not_accepting":
        case "intelligent_vehicle_not_accepting":
          return intelligentRestTitle || "Car isn’t accepting charge";
        case "intelligent_identifying_vehicle":
          return "Identifying vehicle";
        case "intelligent_no_price_data":
          return "Charging without price data";
        case "intelligent_charging":
        case "intelligent_top_up":
        case "intelligent_catch_up":
          return "";
        case "waiting_for_acceptable_price":
          return forcePlanActive
            ? "Force charge waiting for acceptable price"
            : scheduleSwitchOn
              ? "Scheduled charge waiting for acceptable price"
              : "Waiting for acceptable price";
        case "price_sensor_unavailable":
          return "Electricity price unavailable";
        case "waiting_for_schedule_window":
          return "Waiting for scheduled charge";
        case "schedule_entity_unavailable":
          return "Charging schedule unavailable";
        case "mains_data_unavailable":
          return "Mains data unavailable";
        default:
          // Another idle Intelligent reason still gets an honest title from the car statuses.
          return chargeReason.startsWith("intelligent_") ? intelligentRestTitle : "";
      }
    })();
    // A lost charger connection is both the gating reason and its controller_error: it reads as
    // its own title ("Charger connection unavailable"), with the affected charger as the note.
    const connectionError = hasControllerError && controllerError.toLowerCase() === chargeReason &&
      chargeReason.endsWith("_api_unavailable") && Boolean(gatingTitle);
    const controllerErrorNote = hasControllerError && controllerErrorInfo.message !== (connectionError ? gatingTitle : "")
      ? controllerErrorInfo.message : "";
    const activeTitle = ["unavailable", "unknown"].includes(controller.state)
      ? "Controller unavailable"
      : hasControllerError && !connectionError
      ? "Controller error"
      : gatingTitle
        ? gatingTitle
        : activeEv
        ? activeEv.isCharging
          ? `Charging ${activeEv.connectedEvName && activeEv.connectedEvName.toLowerCase() !== "unknown" ? activeEv.connectedEvName : activeEv.smartevseName}`
          : `${activeEv.smartevseName} selected`
        : chargeAllowed
          ? "Waiting for an eligible EV"
          : "Charging paused";
    const heroPillGroups: Array<{
      id: string;
      label: string;
      tone: string;
      priority: number;
      pills: Array<{ label: string; tone: string; priority: number; icon?: string; description?: string }>;
    }> = [];
    const ensureHeroPillGroup = (groupId, groupLabel, groupTone, groupPriority) => {
      let group = heroPillGroups.find((candidate) => candidate.id === groupId);
      if (!group) {
        group = {
          id: groupId,
          label: groupLabel,
          tone: groupTone,
          priority: groupPriority,
          pills: [],
        };
        heroPillGroups.push(group);
      }
      return group;
    };
    const addHeroPill = (
      groupId,
      groupLabel,
      groupTone,
      groupPriority,
      label,
      tone = "neutral",
      priority = 100,
      icon = "",
      description = "",
    ) => {
      if (!label) {
        return;
      }
      const group = ensureHeroPillGroup(groupId, groupLabel, groupTone, groupPriority);
      if (!group.pills.some((pill) => pill.label === label)) {
        group.pills.push({ label, tone, priority, icon, description });
      }
    };
    const scheduleTimingPill = (() => {
      const nextEvent = this._formatDateTime(scheduleNextEvent);
      if (scheduleState === "on") {
        return nextEvent === UNAVAILABLE_TEXT ? "End unavailable" : `Ends ${nextEvent}`;
      }
      return nextEvent === UNAVAILABLE_TEXT ? "Start unavailable" : nextEvent;
    })();
    const scheduleControlAvailable = Boolean(this._entity(this._config.schedule_switch_entity));
    const scheduleEntityAvailable = Boolean(this._entity(this._config.schedule_entity));
    const forceControlAvailable = Boolean(
      this._entity(this._config.force_charge_entity) ||
        this._entity(this._config.force_timer_entity) ||
        this._entity(this._config.force_price_entity),
    );
    const rotationPolicy = String(attrs.charge_policy || this._state(this._config.charge_policy_entity)).toLowerCase();
    const heroRuntimePills = activeEv?.isCharging && [ev1, ev2].every(ev => ev.available && ev.connected && !ev.sessionComplete && !ev.hasError) && rotationPolicy.includes("first") && dutyLabel !== UNAVAILABLE_TEXT
      ? [{ label: `Switch charger in ${dutyLabel}`, tone: "neutral" }]
      : [];

    if (scheduleControlAvailable && scheduleSwitchOn) {
      ensureHeroPillGroup(
        "use-schedule",
        "Schedule",
        scheduleSwitchOn ? "active" : "neutral",
        10,
      );
    }
    if (scheduleControlAvailable && scheduleSwitchOn) {
      if (scheduleEntityAvailable) {
        addHeroPill(
          "use-schedule",
          "Schedule",
          "active",
          10,
          scheduleTimingPill,
          scheduleState === "on" ? "success" : "neutral",
          20,
          scheduleState === "on" ? "mdi:clock-end" : "mdi:clock-start",
          `${scheduleState === "on" ? "Schedule active now" : "Next scheduled charge"}. ${scheduleTimingPill}`,
        );
      }
      // The submenu's saved option is authoritative while Force charge is
      // overriding the schedule; the raw entity may temporarily remain stale.
      if (this._schedulePriceGate) {
        addHeroPill(
          "use-schedule",
          "Schedule",
          "active",
          10,
          priceLimitLabel,
          priceAccepted ? "success" : "neutral",
          30,
          "mdi:currency-eur",
          `Acceptable price ≤ ${acceptablePriceValue}`,
        );
      }
    }

    if (forceControlAvailable && forcePlanActive) {
      ensureHeroPillGroup(
        "force-charge",
        "Force charge",
        forcePlanActive ? "active" : "neutral",
        20,
      );
    }
    if (forceControlAvailable && forcePlanActive) {
      if (forceTimerOn) {
        const timerValue = timerLabel !== UNAVAILABLE_TEXT ? `${timerLabel} left` : forceDuration === null ? "Timer unavailable" : this._formatMinutes(forceDuration);
        addHeroPill(
          "force-charge",
          "Force charge",
          "active",
          20,
          timerValue,
          forcePriceOn && !priceAccepted ? "neutral" : "active",
          20,
          "mdi:timer-outline",
          `Timer ${timerValue}`,
        );
      }
      if (forcePriceOn) {
        addHeroPill(
          "force-charge",
          "Force charge",
          "active",
          20,
          priceLimitLabel,
          priceAccepted ? "success" : "neutral",
          30,
          "mdi:currency-eur",
          `Acceptable price ≤ ${acceptablePriceValue}`,
        );
      }
    }
    // Intelligent: an enabled-only group with one time pill and warning pills; no money in the hero.
    const intelligentActive = this._isIntelligentPlanActive();
    const intelligent = intelligentActive ? this._intelligent() : null;
    const intelligentOverridden = forcePlanActive || intelligent?.overridden_by === "force";
    if (intelligentActive) {
      ensureHeroPillGroup("intelligent", "Intelligent charging", "active", 15);
    }
    if (intelligent && !intelligentOverridden) {
      const now = Date.now();
      const chargers = this._intelligentChargers();
      const evByKey = { smartevse_1: ev1, smartevse_2: ev2 };
      const status = String(intelligent.status || "");
      // Like an open schedule window, a current planned block reads "Until …"; it is
      // green only while the charger physically reports Charging.
      const currentKeys = ["smartevse_1", "smartevse_2"]
        .filter((key) => chargers[key] && this._blocks(chargers[key]).some((block) => block.start <= now && block.end > now));
      const chargingKey = currentKeys.find((key) => evByKey[key].isCharging) || currentKeys.find((key) => attrs.active_smartevse_raw === key) || currentKeys[0];
      if (chargingKey) {
        const block = this._blocks(chargers[chargingKey]).find((candidate) => candidate.start <= now && candidate.end > now);
        const end = this._formatPlanTime(block.end, now);
        const flowing = evByKey[chargingKey].isCharging;
        addHeroPill("intelligent", "Intelligent charging", "active", 15, `Until ${end}`, flowing ? "success" : "neutral", 20, "mdi:clock-end",
          `${flowing ? "Charging" : "Planned charge"} until ${end}`);
      } else if (status !== "charging" && Number.isFinite(Date.parse(intelligent.next_charge))) {
        const next = this._formatDateTime(intelligent.next_charge);
        addHeroPill("intelligent", "Intelligent charging", "active", 15, next, "neutral", 20, "mdi:clock-start", `Next planned charge. ${next}`);
      }
      const atRisk = Object.keys(chargers).filter((key) => chargers[key].status === "at_risk");
      if (atRisk.length) {
        // "Both" only when two cars compete for the time: both are short, or the short car waits
        // behind a car that still charges. A car that is done, refusing or excluded takes no time.
        const competing = ["planned", "tight", "charging", "at_risk", "catch_up"];
        const both = atRisk.length >= 2 || atRisk.some((key) => {
          const before = chargers[key].queue_after;
          return Boolean(before) && before !== key && Boolean(chargers[before]) && competing.includes(String(chargers[before].status || ""));
        });
        const label = both ? "Not enough time for both" : `Not enough time for ${this._intelligentVehicleName(chargers[atRisk[0]], atRisk[0])}`;
        addHeroPill("intelligent", "Intelligent charging", "active", 15, label, "warn", 30, "mdi:alert-outline");
      }
      for (const key of Object.keys(chargers)) {
        const charger = chargers[key];
        if (charger.status === "not_accepting" || charger.not_accepting || charger.car_timer) {
          addHeroPill("intelligent", "Intelligent charging", "active", 15, `Check ${this._intelligentVehicleName(charger, key)}`, "warn", 40, "mdi:alert-outline");
        }
      }
    }
    // Force overrides every standing plan; Intelligent and Schedule follow it in that order.
    const groupRank = { "force-charge": 0, intelligent: 1, "use-schedule": 2 };
    const sortedHeroGroups = heroPillGroups
      .sort((left, right) => (groupRank[left.id] ?? 9) - (groupRank[right.id] ?? 9) || left.priority - right.priority);
    const groupNotes = (group) => [
      (group.id === "use-schedule" && forcePlanActive) || (group.id === "intelligent" && intelligentOverridden) ? "Resumes after force charge" : "",
      group.id === "use-schedule" && intelligentActive && !forcePlanActive ? "Intelligent charging has priority" : "",
    ].filter(Boolean);
    const noPlanEnabled = !sortedHeroGroups.length && !heroRuntimePills.length;
    // The hero button's name is "Edit charging plan"; this description carries everything it shows.
    const heroDescription = [
      activeTitle,
      controllerErrorNote,
      ...sortedHeroGroups.flatMap((group) => [`${group.label} enabled`, ...groupNotes(group), ...group.pills.map((pill) => pill.description || pill.label)]),
      ...heroRuntimePills.map((pill) => pill.label),
      noPlanEnabled ? "No charging plan enabled" : "",
    ].filter(Boolean).join(". ");
    const heroPillsMarkup = sortedHeroGroups
      .map(
        (group) => `
          <div class="status-pill-group" data-plan-group="${this._safe(group.id)}">
            <span class="family-chip status-pill-group-label" data-tone="${this._chipTone(group.tone)}" aria-label="${this._safe(group.label)} enabled" title="${this._safe(group.label)} enabled"><ha-icon class="status-pill-icon" icon="mdi:toggle-switch" aria-hidden="true"></ha-icon>${this._safe(group.label)}</span>
            ${groupNotes(group).map((note) => `<span class="family-chip plan-note" data-tone="neutral">${this._safe(note)}</span>`).join("")}
            <span class="status-pill-group-items">
              ${group.pills
                .sort((left, right) => left.priority - right.priority)
                .map(
                  (pill) =>
                    `<span class="family-chip status-pill" data-tone="${this._chipTone(pill.tone)}"${pill.description ? ` aria-label="${this._safe(pill.description)}" title="${this._safe(pill.description)}"` : ""}>${pill.icon ? `<ha-icon class="status-pill-icon" icon="${this._safe(pill.icon)}" aria-hidden="true"></ha-icon>` : ""}${this._safe(pill.label)}</span>`,
                )
                .join("")}
            </span>
          </div>
        `,
      )
      .join("");
    const heroRuntimePillsMarkup = heroRuntimePills.length
      ? `<div class="status-runtime-pills">
          ${heroRuntimePills
            .map(
              (pill) =>
                `<span class="family-chip status-pill status-runtime-pill" data-tone="${this._chipTone(pill.tone)}">${this._safe(pill.label)}</span>`,
            )
            .join("")}
        </div>`
      : "";
    const heroGlowColors: PulseColors | undefined =
      heroVisual === "charging"
        ? {
            weak: "rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-weak-alpha))",
            strong: "rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-strong-alpha))",
          }
        : heroVisual === "error"
          ? {
              weak: "rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-weak-alpha))",
              strong: "rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-strong-alpha))",
            }
          : heroVisual === "idle"
            ? ACTIVE_GLOW
            : undefined;
    const heroGlow = buildGlow(heroGlowColors, "pulse", heroVisual !== "off").style;
    const heroGlowStyle = heroGlow
      ? `${heroGlow} animation-name: var(--sdc-led-${heroVisual}-glow-animation); animation-duration: var(--sdc-led-${heroVisual}-glow-duration);`
      : "";

    const markup = `
      <style>${CARD_CSS}</style>

      <ha-card class="layout-${this._layout()}" style="${this._safe(wledStyleVars)}">
        <div class="wrap">
          <div class="flow-stage family-tile-group">
            <section class="house-node">
              <div class="family-tile-wrap status-hero-wrap visual-${this._safe(heroVisual)}">
                <div class="glow-under status-glow" style="${this._safe(heroGlowStyle)}" aria-hidden="true">
                  <div class="glow-overlay"></div>
                </div>
                <button
                  class="status-hero visual-${this._safe(heroVisual)}"
                  data-action="open-force-wizard"
                  type="button"
                  aria-label="Edit charging plan"
                  aria-describedby="sdc-hero-description"
                  aria-haspopup="dialog"
                >
                  <span id="sdc-hero-description" class="family-visually-hidden">${this._safe(heroDescription)}</span>
                  <div class="overview-heading"><span>EV charging</span><span class="edit-plan">Edit plan<ha-icon icon="${UI_ICONS.settings}" aria-hidden="true"></ha-icon></span></div>
                  <div class="status-copy">
                    <div class="status-title">${this._safe(activeTitle)}</div>
                    ${controllerErrorNote ? `<p class="overview-note">${this._safe(controllerErrorNote)}</p>` : ""}
                    ${noPlanEnabled ? `<p class="overview-note">No charging plan enabled</p>` : `<div class="status-pills status-pill-groups">${heroPillsMarkup}${heroRuntimePillsMarkup}</div>`}
                  </div>
                </button>
              </div>
            </section>

            ${controllerWarning ? this._notice("warning", controllerWarning) : ""}
            ${!this._settingsModalOpen && this._settingsBusy ? this._pendingNote("Saving settings…") : ""}
            ${!this._settingsModalOpen && this._settingsError ? this._notice("error", this._settingsError) : ""}
            ${!this._forceWizardOpen && this._forceWizardBusy ? this._pendingNote("Updating charging plan…") : ""}
            ${!this._forceWizardOpen && this._forceWizardError ? this._notice("error", this._forceWizardError) : ""}
            ${this._layout() === "plan" ? this._planTimeline(ev1, ev2) : ""}
            <div class="ev-row">
              ${this._evNode(ev1)}
              ${this._evNode(ev2)}
            </div>
            ${this._layout() === "plan" ? this._planTotals() : ""}
            <button class="advanced-settings charging-history-launcher" data-action="open-history" type="button" aria-haspopup="dialog"><ha-icon icon="${UI_ICONS.history}" aria-hidden="true"></ha-icon><span>Charging history</span><ha-icon icon="${UI_ICONS.next}" aria-hidden="true"></ha-icon></button>
          </div>

        </div>
      </ha-card>
    `;

    const dialogMarkup = this._flow.current === "history" ? this._chargingHistory() : this._chargerDetailsKey ? this._chargerDetails(ev1, ev2) : this._forceWizardModal() ||
      this._settingsModal(this._settingsControls({ policy, dutyCycleMinutes: this._numberState(this._config.duty_cycle_entity) }));
    // Pending state is announced on the triggering control, not the whole page.
    return html`${unsafeHTML(markup)}${renderFamilyDialog(this._flow, {
      title: this._dialogTitle(ev1, ev2),
      content: html`<div style=${wledStyleVars}>${unsafeHTML(dialogMarkup)}</div>`,
      footer: this._settingEditorFooter(),
      footerLayout: "equal",
    })}`;
  }

  _detailsKey(element: HTMLDetailsElement) {
    const explicit = element.dataset.key || element.dataset.charger || element.dataset.evse || element.dataset.entity || element.id;
    if (explicit) return explicit;
    const charger = element.closest<HTMLElement>(".ev-node-wrap");
    const chargerKey = charger?.dataset.key || charger?.dataset.charger ||
      Array.from(charger?.classList || []).find((name) => /^smartevse_[12]$/.test(name));
    if (chargerKey) return chargerKey;
    return `details-${Array.from(this.renderRoot.querySelectorAll("details")).indexOf(element)}`;
  }

  _uiFocusKey(element: HTMLElement) {
    const data = ["action", "entity", "mode", "durationPart", "value", "charger"]
      .map((name) => `${name}:${element.dataset[name] || ""}`).join("|");
    const detail = element.closest<HTMLDetailsElement>("details");
    return [element.localName, element.id, element.getAttribute("name") || "", element.getAttribute("aria-label") || "", data,
      detail ? this._detailsKey(detail) : ""].join("|");
  }

  _captureUiFocus(): UiFocusSnapshot | null {
    const element = (this.renderRoot as ShadowRoot).activeElement as HTMLElement | null;
    if (!element || element.matches('dialog, .dialog-panel, [data-family-heading]')) return null;
    const snapshot: UiFocusSnapshot = { key: this._uiFocusKey(element) };
    if (element.matches("input, textarea")) {
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      // Number inputs do not expose a selection range; text inputs do.
      try {
        if (input.selectionStart !== null && input.selectionEnd !== null) {
          snapshot.selectionStart = input.selectionStart;
          snapshot.selectionEnd = input.selectionEnd;
          snapshot.selectionDirection = input.selectionDirection || "none";
        }
      } catch { /* Unsupported input types retain focus without a caret range. */ }
    }
    return snapshot;
  }

  _findUiFocus(snapshot: UiFocusSnapshot | null): HTMLElement | null {
    if (!snapshot) return null;
    return Array.from(this.renderRoot.querySelectorAll<HTMLElement>(
      "button, input, select, textarea, a[href], summary, [tabindex]",
    )).find((element) => this._uiFocusKey(element) === snapshot.key) || null;
  }

  _restoreUiFocus(snapshot: UiFocusSnapshot | null) {
    const element = this._findUiFocus(snapshot);
    if (!element || element.matches(":disabled") || element.closest("[inert], [hidden]")) return false;
    element.focus({ preventScroll: true });
    if (snapshot?.selectionStart !== undefined && snapshot.selectionEnd !== undefined &&
        element.matches("input, textarea")) {
      try {
        (element as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd, snapshot.selectionDirection);
      } catch { /* Number inputs and other unsupported types have no caret API. */ }
    }
    return (this.renderRoot as ShadowRoot).activeElement === element;
  }

  willUpdate() {
    this._domUpdating = true;
    this.renderRoot.querySelectorAll<HTMLDetailsElement>("details").forEach((element) => {
      this._detailsOpen.set(this._detailsKey(element), element.open);
    });
    const focus = this._captureUiFocus();
    const active = (this.renderRoot as ShadowRoot).activeElement;
    this._pendingUiFocus = focus || (active?.matches('dialog, .dialog-panel, [data-family-heading]') ? this._busyUiFocus : null);
    if (!this._renderedDialogKey && (this._forceWizardOpen || this._settingsModalOpen || this._chargerDetailsKey)) {
      this._dialogReturnFocus = this._dialogReturnFocus || focus;
    }
  }

  updated() {
    this._domUpdating = false;
    this.renderRoot.querySelectorAll<HTMLDetailsElement>("details").forEach((element) => {
      const key = this._detailsKey(element);
      if (this._detailsOpen.has(key)) element.open = this._detailsOpen.get(key)!;
    });
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>('dialog');
    const dialogKey = this._flow.current || "";
    const previousDialogKey = this._renderedDialogKey;
    this._renderedDialogKey = dialogKey;
    const overview = this.renderRoot.querySelector<HTMLElement>(".flow-stage");
    if (overview) overview.inert = Boolean(dialog);
    if (dialog) {
      // Shared flow owns initial/route/confirmation focus. unsafeHTML content
      // needs only same-page field/caret restoration after telemetry updates.
      if (dialogKey === previousDialogKey && !this._flow.confirmation && this._pendingUiFocus) {
        if (this._restoreUiFocus(this._pendingUiFocus)) this._busyUiFocus = null;
        else {
          this._busyUiFocus = this._writePending ? this._pendingUiFocus : null;
          dialog.querySelector<HTMLElement>('[data-family-heading]')?.focus({preventScroll:true});
        }
      }
    } else if (previousDialogKey) {
      this._busyUiFocus = null;
      if (!this._nativeHandoff && !this._restoreUiFocus(this._dialogReturnFocus)) {
        this.renderRoot.querySelector<HTMLElement>('[data-action="open-force-wizard"]')?.focus({ preventScroll: true });
      }
      this._dialogReturnFocus = null;
      this._nativeHandoff = false;
    } else this._restoreUiFocus(this._pendingUiFocus);
    this._pendingUiFocus = null;
  }

  firstUpdated() {
    this._bindDelegatedActions();
  }

  _bindDelegatedActions() {
    const root: EventTarget = this.renderRoot;

    root.addEventListener("click", async (event: Event) => {
      const target = event.target as HTMLElement | null;
      const element = target?.closest<HTMLElement>("[data-action]");
      if (!element || element.matches(":disabled")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const { action, entity, value, mode, charger } = element.dataset;
      if (action === "open-charger-details") {
        if (charger) this._openRootDialog(`charger:${charger}`, element);
        return;
      }
      if (action === "open-history") {
        this._openChargingHistory(charger, element);
        return;
      }
      if (action === "open-settings") {
        this._openSettingsModal(element);
        return;
      }
      if (action === "set-layout") {
        this._setLayout(value);
        return;
      }
      if (action === "open-force-wizard") {
        this._openForceWizard(element);
        return;
      }
      if (action === "choose-force-mode") {
        this._selectForceMode(mode);
        return;
      }
      if (action === "toggle-charging-plan") {
        await this._toggleChargingPlan(mode);
        return;
      }
      if (action === "toggle-schedule-price") {
        await this._toggleSchedulePriceGate();
        return;
      }
      if (action === "toggle-force-now-timer") {
        await this._toggleForceNowTimer();
        return;
      }
      if (action === "toggle-force-now-price") {
        await this._toggleForceNowPrice();
        return;
      }
      if (action === "toggle-intelligent-top-up") {
        await this._toggleIntelligentTopUp();
        return;
      }
      if (action === "use-suggested-ready-by") {
        if (entity && value) {
          this._updateEditorDraft(entity, value);
          await this._commitIntelligentField(entity, "suggest");
        }
        return;
      }
      if (!entity) {
        return;
      }
      if (action === "open-more-info") {
        if (this._writePending) return;
        this._flow.handoff(() => {
          this._nativeHandoff = true;
          showEntityMoreInfo(this, entity);
        });
        return;
      }
      if (action === "toggle") {
        await this._toggleEntity(entity);
        return;
      }
      if (action === "edit") {
        this._openEditor(entity);
        return;
      }
      if (action === "open-submenu") {
        this._openSettingsSubmenu(entity);
        return;
      }
      if (action === "choose-option") {
        await this._chooseEditorOption(entity, value);
        return;
      }
      if (action === "cancel-edit") {
        this._closeEditor();
        return;
      }
      if (action === "save-edit") {
        await this._saveEditor(entity);
      }
    });

    root.addEventListener("input", (event: Event) => {
      const element = (event.target as HTMLElement | null)?.closest<HTMLInputElement>(
        ".setting-input[data-entity]",
      );
      if (!element) {
        return;
      }
      if (element.classList.contains("force-duration-input")) {
        this._updateForceDurationDraft(element);
        return;
      }
      this._updateEditorDraft(element.dataset.entity, element.value);
    });

    root.addEventListener("change", async (event: Event) => {
      const input = (event.target as HTMLElement | null)?.closest<HTMLInputElement>(
        ".force-input[data-entity]",
      );
      if (input) {
        if (input.classList.contains("force-duration-input")) {
          await this._saveForceDurationInput(input);
          return;
        }
        this._updateEditorDraft(input.dataset.entity, input.value);
        // Intelligent number fields commit on blur or Enter: a spinner fires change per step.
        if (input.classList.contains("intelligent-number-input")) return;
        await this._saveForceWizardNumber(input.dataset.entity);
        return;
      }
      const element = (event.target as HTMLElement | null)?.closest<HTMLSelectElement>(".setting-select[data-entity]");
      if (!element) {
        return;
      }
      this._updateEditorDraft(element.dataset.entity, element.value);
    });

    // A press inside the card may be what moves focus out of a field; see _deferIntelligentCommit.
    root.addEventListener("pointerdown", () => { this._pointerDown = true; }, true);
    root.addEventListener("pointerup", this._pointerReleased, true);
    root.addEventListener("pointercancel", this._pointerReleased, true);

    // Intelligent fields commit when they lose focus, not on each edited segment or spinner step.
    root.addEventListener("focusout", (event: Event) => {
      const input = (event.target as HTMLElement | null)?.closest?.<HTMLInputElement>(
        ".intelligent-time-input[data-entity], .intelligent-number-input[data-entity]",
      );
      if (!input || this._domUpdating || !input.isConnected || input.disabled) return;
      const entityId = input.dataset.entity;
      if (!entityId) return;
      // A time field reads "" while partly typed; keep the last complete value then.
      if (input.value || input.classList.contains("intelligent-number-input")) this._updateEditorDraft(entityId, input.value);
      this._deferIntelligentCommit(entityId);
    });

    root.addEventListener("keydown", async (event: Event) => {
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        ".setting-input[data-entity], .setting-select[data-entity]",
      );
      if (!element) {
        return;
      }
      const entityId = element.dataset.entity;
      if (element.classList.contains("intelligent-time-input") || element.classList.contains("intelligent-number-input")) {
        if ((event as KeyboardEvent).key === "Enter") {
          event.preventDefault();
          const input = element as HTMLInputElement;
          if (input.value || element.classList.contains("intelligent-number-input")) this._updateEditorDraft(entityId, input.value);
          await this._commitIntelligentField(entityId);
        }
        return;
      }
      if (element.classList.contains("force-input")) {
        if ((event as KeyboardEvent).key === "Enter") {
          event.preventDefault();
          if (element.classList.contains("force-duration-input")) {
            await this._saveForceDurationInput(element as HTMLInputElement);
          } else {
            await this._saveForceWizardNumber(entityId);
          }
        }
        return;
      }
      if ((event as KeyboardEvent).key === "Enter") {
        event.preventDefault();
        await this._saveEditor(entityId);
      }
    });
  }

  async _toggleEntity(entityId) {
    if (this._writePending) return;
    const state = this._state(entityId);
    if (!["on", "off"].includes(state)) return;
    const service = state === "on" ? "turn_off" : "turn_on";
    this._settingsBusy = true;
    this._settingsError = "";
    this._render();
    try {
      await this._hass.callService("homeassistant", service, { entity_id: entityId });
    } catch (error) {
      this._settingsError = error instanceof Error ? error.message : "Unable to change this setting.";
    } finally {
      this._settingsBusy = false;
      this._render();
    }
  }
}

if (!customElements.get("smartevse-flow-card")) {
  customElements.define("smartevse-flow-card", SmartEVSEFlowCard);
}

const _customCardsWindow = window as unknown as {
  customCards?: Array<Record<string, unknown>>;
};
_customCardsWindow.customCards = _customCardsWindow.customCards || [];
if (!_customCardsWindow.customCards.some((entry) => entry.type === "smartevse-flow-card")) {
  _customCardsWindow.customCards.push({
    type: "smartevse-flow-card",
    name: "SmartEVSE Flow Card",
    description: "Visual SmartEVSE state and current-routing card for SmartEVSE Dual Charger.",
    preview: true,
    version: CARD_VERSION,
  });
}
