import { LitElement, html } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { OVERVIEW_CSS } from "./styles/overview";
import { DESIGN_TOKENS_CSS } from "./shared/design-tokens";
import { buildGlow, type PulseColors } from "./shared/glow";

const CARD_VERSION = "0.0.53";

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
  time_format?: string;
}

interface HomeAssistant {
  states: Record<string, HassEntity | undefined>;
  locale?: HassLocale;
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
  [key: string]: unknown;
}

class SmartEVSEFlowCard extends LitElement {
  private _hass?: HomeAssistant;
  private _config?: SmartEvseCardConfig;
  private _currency = "EUR/kWh";
  private _editingEntity: string | null = null;
  private _editorDrafts: Record<string, string> = {};
  private _settingsModalOpen = false;
  private _settingsError = "";
  private _settingsSubmenuEntity: string | null = null;
  private _forceWizardOpen = false;
  private _forceWizardStep: "choose" | "schedule" | "now" = "choose";
  private _schedulePriceGate = false;
  private _forcePlanEnabled = false;
  private _forceNowTimer = false;
  private _forceNowPrice = false;
  private _forceWizardBusy = false;
  private _forceWizardError = "";
  private _lastRenderKey = "";
  // unsafeHTML replaces the subtree: preserve user-owned UI state explicitly.
  private _detailsOpen = new Map<string, boolean>();
  private _pendingUiFocus: UiFocusSnapshot | null = null;
  private _busyUiFocus: UiFocusSnapshot | null = null;
  private _dialogReturnFocus: UiFocusSnapshot | null = null;
  private _renderedDialogKey = "";
  private _dialogHadFocus = false;


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
    this.requestUpdate();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._forceWizardBusy && (!this._forceWizardOpen || this._forceWizardStep === "choose")) {
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
    ];
    const tracked = {
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
      return "n/a";
    }
    return text
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  _formatCurrent(value) {
    if (!Number.isFinite(value)) {
      return "0.0 A";
    }
    return `${value.toFixed(1)} A`;
  }

  _formatOptionalCurrent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "n/a";
    }
    return this._formatCurrent(number);
  }

  _formatSeconds(value) {
    const seconds = Number.parseInt(value, 10);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return "n/a";
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (hours > 0) {
      return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${String(rest).padStart(2, "0")}s`;
    }
    return `${rest}s`;
  }

  _formatMinutes(value) {
    const minutes = Number.parseInt(value, 10);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return "n/a";
    }
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours}:${String(rest).padStart(2, "0")}`;
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

  _homeAssistantDateTimeFormatOptions() {
    const locale = this._hass?.locale;
    const timeFormat = String(locale?.time_format || "").toLowerCase();
    const options: Intl.DateTimeFormatOptions = {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    };
    if (timeFormat === "12") {
      options.hour12 = true;
    }
    if (timeFormat === "24") {
      options.hour12 = false;
    }
    return { locale: locale?.language, options };
  }

  _formatDateTime(value) {
    if (!value) {
      return "n/a";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "n/a";
    }
    const { locale, options } = this._homeAssistantDateTimeFormatOptions();
    return new Intl.DateTimeFormat(locale, options).format(date);
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
      mode: mode || "n/a",
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

  _controlTile({ entityId, icon, label, value, tone = "default", state = "off", action = "toggle" }) {
    if (!entityId) {
      return "";
    }
    const normalizedState = String(state || "off").toLowerCase();
    return `
      <div class="control-tile-wrap tone-${this._safe(tone)} state-${this._safe(normalizedState)}">
        <div class="glow-under control-glow" aria-hidden="true">
          <div class="glow-overlay"></div>
        </div>
        <button
          class="control-tile tone-${this._safe(tone)} state-${this._safe(normalizedState)}"
          data-action="${this._safe(action)}"
          data-entity="${this._safe(entityId)}"
          type="button"
        >
          <div class="control-icon"><ha-icon icon="${this._safe(icon)}"></ha-icon></div>
          <div class="control-copy">
            <div class="control-label">${this._safe(label)}</div>
            <div class="control-value">${this._safe(value)}</div>
          </div>
        </button>
      </div>
    `;
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
    if (!this._editorMeta(entityId).supported) return;
    this._settingsError = "";
    this._editingEntity = entityId;
    if (!this._editorDrafts) {
      this._editorDrafts = {};
    }
    this._editorDrafts[entityId] = this._state(entityId) ?? "";
    this._render();
  }

  _closeEditor() {
    this._editingEntity = null;
    this._render();
  }

  _openSettingsSubmenu(entityId) {
    const meta = this._editorMeta(entityId);
    if (!meta.supported || meta.kind !== "select") return;
    this._settingsError = "";
    this._settingsSubmenuEntity = entityId;
    this._editingEntity = entityId;
    if (!this._editorDrafts) {
      this._editorDrafts = {};
    }
    if (!Object.prototype.hasOwnProperty.call(this._editorDrafts, entityId)) {
      this._editorDrafts[entityId] = this._state(entityId) ?? "";
    }
    this._render();
  }

  _closeSettingsSubmenu() {
    this._settingsSubmenuEntity = null;
    this._editingEntity = null;
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
    try {
      await this._hass.callService(meta.serviceDomain, meta.service, serviceData);
    } catch (error) {
      this._settingsError = error instanceof Error ? error.message : "Unable to save this setting.";
      this._render();
      return;
    }
    this._editingEntity = null;
    if (this._settingsSubmenuEntity === entityId) {
      this._settingsSubmenuEntity = null;
    }
    this._render();
  }

  async _chooseEditorOption(entityId, value) {
    const previousValue = this._editorDraft(entityId);
    this._updateEditorDraft(entityId, value);
    this._render();
    const meta = this._editorMeta(entityId);
    if (!meta.supported || meta.kind !== "select" || !meta.options.includes(value)) {
      return;
    }
    this._settingsError = "";
    try {
      await this._hass.callService(meta.serviceDomain, meta.service, {
        entity_id: entityId,
        option: value,
      });
    } catch (error) {
      this._updateEditorDraft(entityId, previousValue);
      this._settingsError = error instanceof Error ? error.message : "Unable to save this setting.";
      this._render();
    }
  }

  _openSettingsModal() {
    this._forceWizardOpen = false;
    this._settingsModalOpen = true;
    this._settingsError = "";
    this._settingsSubmenuEntity = null;
    this._editorDrafts = {};
    this._render();
  }

  _closeSettingsModal() {
    this._settingsModalOpen = false;
    this._settingsSubmenuEntity = null;
    this._editingEntity = null;
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

  _openForceWizard() {
    this._settingsModalOpen = false;
    this._forceWizardOpen = true;
    this._forceWizardStep = "choose";
    this._syncPlanPreferencesFromEntities();
    this._forceWizardBusy = false;
    this._forceWizardError = "";
    if (this._config.acceptable_price_entity) {
      this._editorDrafts[this._config.acceptable_price_entity] = this._state(this._config.acceptable_price_entity);
    }
    if (this._config.force_charge_duration_entity) {
      this._editorDrafts[this._config.force_charge_duration_entity] = this._state(
        this._config.force_charge_duration_entity,
      );
    }
    this._render();
  }

  _closeForceWizard() {
    if (this._forceWizardBusy) {
      return;
    }
    this._forceWizardOpen = false;
    this._forceWizardStep = "choose";
    this._forceWizardError = "";
    this._render();
  }

  _selectForceMode(mode) {
    if (!["schedule", "now"].includes(mode)) {
      return;
    }
    this._forceWizardStep = mode;
    this._forceWizardError = "";
    this._render();
  }

  _backForceWizard() {
    if (this._forceWizardBusy) {
      return;
    }
    this._forceWizardStep = "choose";
    this._forceWizardError = "";
    this._render();
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
    if (this._forceWizardBusy || !["schedule", "now"].includes(mode)) {
      return;
    }
    const enabled = mode === "schedule" ? this._isSchedulePlanActive() : this._isForcePlanActive();
    if (enabled) {
      await this._disableChargingPlan(mode);
      return;
    }
    await this._applyForceMode(mode === "schedule" ? "schedule" : this._forceNowMode());
  }

  async _disableChargingPlan(mode) {
    if (this._forceWizardBusy || !["schedule", "now"].includes(mode)) {
      return;
    }
    this._syncPlanPreferencesFromEntities();
    this._savePlanPreferences();
    this._forceWizardBusy = true;
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
      this._render();
    }
  }

  async _toggleSchedulePriceGate() {
    if (this._forceWizardBusy) {
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
      await this._applyForceMode("schedule");
      return;
    }
    this._render();
  }

  async _toggleForceNowTimer() {
    if (this._forceWizardBusy) {
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
      await this._applyForceMode(this._forceNowMode());
      return;
    }
    this._render();
  }

  async _toggleForceNowPrice() {
    if (this._forceWizardBusy) {
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

  async _setWizardNumber(entityId) {
    const meta = this._editorMeta(entityId);
    if (!meta.supported || meta.kind !== "number") {
      throw new Error("This force-charge setting is unavailable or is not a number entity.");
    }
    const value = Number.parseFloat(this._editorDraft(entityId));
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
    if (this._forceWizardBusy || !entityId) {
      return;
    }
    this._forceWizardBusy = true;
    this._forceWizardError = "";
    try {
      await this._setWizardNumber(entityId);
    } catch (error) {
      this._forceWizardError = error instanceof Error ? error.message : "Unable to save this charging setting.";
    } finally {
      this._forceWizardBusy = false;
      this._render();
    }
  }

  async _applyForceMode(mode) {
    if (this._forceWizardBusy || !["schedule", "simple", "price", "timer", "timer_price"].includes(mode)) {
      return;
    }
    this._forceWizardBusy = true;
    this._forceWizardError = "";
    this._render();
    try {
      const needsPrice = mode === "price" || mode === "timer_price" || (mode === "schedule" && this._schedulePriceGate);
      const needsTimer = mode === "timer" || mode === "timer_price";
      const required = mode === "schedule"
        ? [this._config.schedule_switch_entity, this._config.schedule_entity, ...(this._entity(this._schedulePriceEntity()) ? [this._schedulePriceEntity()] : [])]
        : [this._forceModeEntity(mode), ...(this._supportsIndependentPlans() ? [this._config.force_charge_entity] : [])];
      if (needsPrice) required.push(this._config.price_entity, this._config.acceptable_price_entity,
        mode === "schedule" ? this._schedulePriceEntity() : this._config.force_price_entity);
      if (needsTimer) required.push(this._config.force_timer_entity, this._config.force_charge_duration_entity);
      required.push(this._config.controller_entity);
      if (required.some(entity => !this._isAvailable(entity))) {
        throw new Error("A required charging control is unavailable. Check the connection before enabling this plan.");
      }
      if (mode === "schedule") {
        const scheduleEntity = this._config.schedule_switch_entity;
        const schedulePriceEntity = this._schedulePriceEntity();
        if (!scheduleEntity || !this._entity(scheduleEntity)) {
          throw new Error("The scheduled-charging switch is unavailable.");
        }
        if (this._schedulePriceGate) {
          if (
            !schedulePriceEntity ||
            !this._entity(schedulePriceEntity) ||
            !this._entity(this._config.price_entity)
          ) {
            throw new Error("A required price-controlled charging entity is unavailable.");
          }
          await this._setWizardNumber(this._config.acceptable_price_entity);
        }

        await this._setSwitchState(scheduleEntity, true);
        if (schedulePriceEntity && this._entity(schedulePriceEntity)) {
          await this._setSwitchState(schedulePriceEntity, this._schedulePriceGate);
        }
        this._savePlanPreferences();
        return;
      }

      const target = this._forceModeEntity(mode);
      if (!target || !this._entity(target)) {
        throw new Error("The switch for this force-charge mode is unavailable.");
      }
      if (mode === "price" || mode === "timer_price") {
        if (!this._entity(this._config.price_entity)) {
          throw new Error("The electricity price sensor is unavailable.");
        }
        await this._setWizardNumber(this._config.acceptable_price_entity);
      }
      if (mode === "timer" || mode === "timer_price") {
        await this._setWizardNumber(this._config.force_charge_duration_entity);
      }

      const forceEntities = [
        this._config.force_charge_entity,
        this._config.force_price_entity,
        this._config.force_timer_entity,
      ].filter(Boolean);
      const activateForceEntity = this._supportsIndependentPlans() ? [this._config.force_charge_entity] : [];
      const targets =
        mode === "timer_price"
          ? [this._config.force_price_entity, this._config.force_timer_entity, ...activateForceEntity].filter(Boolean)
          : mode === "price"
            ? [this._config.force_price_entity, ...activateForceEntity].filter(Boolean)
            : mode === "timer"
              ? [this._config.force_timer_entity, ...activateForceEntity].filter(Boolean)
              : [this._config.force_charge_entity].filter(Boolean);
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
      this._render();
    }
  }

  _settingsControls({ policy, dutyCycleMinutes }) {
    return `
      <div class="controls home-controls setting-controls">
        ${this._settingTile({
          entityId: this._config.charge_policy_entity,
          icon: "mdi:source-fork",
          label: "Charge Policy",
          value: policy,
          presentation: "submenu",
        })}
        ${this._settingTile({
          entityId: this._config.duty_cycle_entity,
          icon: "mdi:swap-horizontal-bold",
          label: "Duty Cycle",
          value: this._formatMinutes(dutyCycleMinutes),
        })}
      </div>
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
      <div class="settings-backdrop">
        <div class="dialog-panel settings-panel" role="dialog" aria-modal="true" aria-label="Charger settings">
          <div class="modal-head">
            <div>
              <div class="modal-kicker">Controls</div>
              <div class="modal-title">Charger settings</div>
            </div>
            <button class="modal-close" data-action="close-settings" type="button">Close</button>
          </div>
          ${settingsControls}
          ${this._chargingHistory()}
          ${this._settingsError ? `<div class="wizard-error" role="alert">${this._safe(this._settingsError)}</div>` : ""}
        </div>
      </div>
    `;
  }

  _forceWizardNumberField(entityId, label) {
    const meta = this._editorMeta(entityId);
    if (!meta.supported || meta.kind !== "number") {
      return `<div class="wizard-error">The configured ${this._safe(label.toLowerCase())} entity is unavailable.</div>`;
    }
    const min = meta.min !== null ? `min="${this._safe(meta.min)}"` : "";
    const max = meta.max !== null ? `max="${this._safe(meta.max)}"` : "";
    const step = meta.step !== null ? `step="${this._safe(meta.step)}"` : "";
    return `
      <label class="wizard-field">
        <span class="wizard-field-label">${this._safe(label)}</span>
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
      return `<div class="wizard-error">The configured charging duration entity is unavailable.</div>`;
    }
    const rawMinutes = Number.parseFloat(this._editorDraft(entityId));
    const totalMinutes = Number.isFinite(rawMinutes) ? Math.max(0, Math.round(rawMinutes)) : 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const maximumHours = meta.max !== null ? `max="${this._safe(Math.floor(meta.max / 60))}"` : "";
    const minuteStep = Number.isFinite(Number(meta.step)) && Number(meta.step) > 0 && Number(meta.step) < 60
      ? Number(meta.step)
      : 1;
    return `
      <div class="wizard-field wizard-duration-field">
        <span class="wizard-field-label">Charging duration</span>
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

    const busy = this._forceWizardBusy;
    const error = this._forceWizardError
      ? `<div class="wizard-error" role="alert">${this._safe(this._forceWizardError)}</div>`
      : "";

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
      ];
      return `
        <div class="force-backdrop settings-backdrop">
          <div class="dialog-panel force-wizard-panel" role="dialog" aria-modal="true" aria-label="Configure charging plan">
            <div class="modal-head">
              <div>
                <div class="modal-kicker">Charging plan</div>
                <div class="modal-title">How should charging run?</div>
              </div>
              <button class="modal-close" data-action="close-force-wizard" type="button" ${busy ? "disabled" : ""}>Close</button>
            </div>
            <div class="wizard-options">
              ${choices
                .filter(choice => choice.available || choice.enabled)
                .map((choice) => {
                  const glowStyle = buildGlow(ACTIVE_GLOW, "pulse", choice.enabled).style;
                  return `
                    <div class="wizard-option-wrap ${choice.enabled ? "selected" : ""}">
                      <div class="glow-under wizard-option-glow" style="${this._safe(glowStyle)}" aria-hidden="true"><div class="glow-overlay"></div></div>
                      <div class="wizard-option ${choice.enabled ? "selected" : ""}">
                        <button
                          class="wizard-option-main"
                          data-action="choose-force-mode"
                          data-mode="${this._safe(choice.mode)}"
                          type="button"
                          ${!choice.available || busy ? "disabled" : ""}
                        >
                          <span class="wizard-option-icon"><ha-icon icon="${this._safe(choice.icon)}"></ha-icon></span>
                          <span class="wizard-option-copy">
                            <span class="wizard-option-title">${this._safe(choice.title)}</span>
                            ${!choice.canToggle ? `<span class="control-unavailable">Unavailable</span>` : ""}
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
            ${this._entity(this._config.charge_policy_entity) || this._entity(this._config.duty_cycle_entity) || this._costData() ? `<button class="advanced-settings" data-action="open-settings" type="button">Settings &amp; charging history<ha-icon icon="mdi:chevron-right" aria-hidden="true"></ha-icon></button>` : ""}
            ${error}
          </div>
        </div>
      `;
    }

    const mode = this._forceWizardStep;
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
    const title = isSchedule ? "Scheduled charging" : "Force charge";
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
              ${busy || (!priceReady && !this._schedulePriceGate) || (this._isSchedulePlanActive() && !this._isAvailable(this._schedulePriceEntity())) ? "disabled" : ""}
            >
              <span class="wizard-option-icon"><ha-icon icon="mdi:currency-eur"></ha-icon></span>
              <span class="wizard-toggle-copy">
                <strong>Also require an acceptable price</strong>
                ${!priceReady ? `<span class="control-unavailable">Unavailable</span>` : ""}
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
              ${(!timerReady && !this._forceNowTimer) || busy || (this._isForcePlanActive() && !this._isAvailable(this._config.force_timer_entity)) ? "disabled" : ""}
            >
              <span class="wizard-option-icon"><ha-icon icon="mdi:timer-outline"></ha-icon></span>
              <span class="wizard-toggle-copy">
                <strong>Stop after a set time</strong>
                ${!timerReady ? `<span class="control-unavailable">Unavailable</span>` : ""}
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
              ${(!priceReady && !this._forceNowPrice) || busy || (this._isForcePlanActive() && !this._isAvailable(this._config.force_price_entity)) ? "disabled" : ""}
            >
              <span class="wizard-option-icon"><ha-icon icon="mdi:currency-eur"></ha-icon></span>
              <span class="wizard-toggle-copy">
                <strong>Require an acceptable price</strong>
                ${!priceReady ? `<span class="control-unavailable">Unavailable</span>` : ""}
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
      <div class="force-backdrop settings-backdrop">
        <div class="dialog-panel force-wizard-panel wizard-step-panel" role="dialog" aria-modal="true" aria-label="${this._safe(title)}">
          <div class="modal-head modal-head-navigation">
            <button class="modal-back" data-action="back-force-wizard" type="button" aria-label="Back" ${busy ? "disabled" : ""}>
              <ha-icon icon="mdi:chevron-left"></ha-icon>
            </button>
            <div class="modal-copy">
              <div class="modal-kicker">Charging plan</div>
              <div class="modal-title">${this._safe(title)}</div>
            </div>
            <button class="modal-close" data-action="close-force-wizard" type="button" ${busy ? "disabled" : ""}>Close</button>
          </div>
          <div class="wizard-step-body">${field}</div>
          ${error}
        </div>
      </div>
    `;
  }

  _settingsSubmenuModal(entityId) {
    const meta = this._editorMeta(entityId);
    const entity = this._entity(entityId);
    const name = entity?.attributes?.friendly_name || "Setting";
    const isChargePolicy = entityId === this._config.charge_policy_entity;
    const title = isChargePolicy ? "Charge Policy" : name;
    const draft = this._editorDraft(entityId);
    const content =
      !meta.supported ? `<p class="overview-note">This setting is unavailable.</p>` : meta.kind === "select"
        ? `
          <div class="modal-options">
            ${meta.optionItems
              .map((option) => {
                const selected =
                  option.value === draft ||
                  (entityId === this._config.charge_policy_entity &&
                    option.label === this._chargePolicyDisplay(draft));
                return `
                  <button
                    class="modal-option ${selected ? "selected" : ""}"
                    data-action="choose-option"
                    data-entity="${this._safe(entityId)}"
                    data-value="${this._safe(option.value)}"
                    type="button"
                  >
                    <span class="modal-option-title">${this._safe(option.label)}</span>
                    ${selected ? `<ha-icon class="modal-option-check" icon="mdi:check-circle"></ha-icon>` : ""}
                  </button>
                `;
              })
              .join("")}
          </div>
        `
        : "";

    return `
      <div class="settings-backdrop">
        <div class="dialog-panel settings-panel submenu-panel" role="dialog" aria-modal="true" aria-label="${this._safe(title)}">
          <div class="modal-head modal-head-navigation">
            <button class="modal-back" data-action="back-settings" type="button" aria-label="Back">
              <ha-icon icon="mdi:chevron-left"></ha-icon>
            </button>
            <div class="modal-copy">
              <div class="modal-kicker">Controls</div>
              <div class="modal-title">${this._safe(title)}</div>
            </div>
            <button class="modal-close" data-action="close-settings" type="button">Close</button>
          </div>
          ${content}
          ${this._settingsError ? `<div class="wizard-error" role="alert">${this._safe(this._settingsError)}</div>` : ""}
        </div>
      </div>
    `;
  }

  _settingTile({ entityId, icon, label, value, presentation = "inline" }) {
    if (!entityId || !this._entity(entityId)) {
      return "";
    }
    const meta = this._editorMeta(entityId);
    const isEditing = presentation === "inline" && this._editingEntity === entityId && meta.supported;
    if (!isEditing) {
      const action = presentation === "submenu" ? "open-submenu" : "edit";
      return `
        <button class="setting-tile" data-action="${this._safe(action)}" data-entity="${this._safe(entityId)}" type="button" ${!meta.supported ? "disabled" : ""}>
          <div class="setting-icon"><ha-icon icon="${this._safe(icon)}"></ha-icon></div>
          <div class="setting-copy">
            <div class="setting-label">${this._safe(label)}</div>
            <div class="setting-value">${meta.supported ? this._safe(value) : "Unavailable"}</div>
          </div>
        </button>
      `;
    }

    const draft = this._editorDraft(entityId);
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
        <select class="setting-select" data-entity="${this._safe(entityId)}">
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
          data-entity="${this._safe(entityId)}"
          type="${this._safe(inputType)}"
          value="${this._safe(draft)}"
          ${minAttr}
          ${maxAttr}
          ${stepAttr}
        />
      `;
    }

    return `
      <div class="setting-tile setting-tile-editing">
        <div class="setting-icon"><ha-icon icon="${this._safe(icon)}"></ha-icon></div>
        <div class="setting-copy">
          <div class="setting-label">${this._safe(label)}</div>
          <div class="setting-value">${this._safe(value)}</div>
          <div class="setting-editor">
            ${control}
            <div class="setting-editor-actions">
              <button class="setting-editor-button tone-primary" data-action="save-edit" data-entity="${this._safe(entityId)}" type="button">Apply</button>
              <button class="setting-editor-button" data-action="cancel-edit" data-entity="${this._safe(entityId)}" type="button">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _costData() {
    return this._entity(this._config.controller_entity)?.attributes?.charging_costs;
  }

  _costAmount(record) {
    if (!record || !record.currency || typeof record.cost !== "number" || !Number.isFinite(record.cost)
      || (record.energy_kwh > 0 && !(record.priced_kwh > 0))) return "Unavailable";
    try {
      return new Intl.NumberFormat(this._hass?.locale?.language || undefined, {
        style: "currency", currency: record.currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(record.cost);
    } catch { return "Unavailable"; }
  }

  _costTime(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString(this._hass?.locale?.language || undefined,
      { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Time unavailable";
  }

  _chargingHistory() {
    const ledger = this._costData();
    if (!ledger) return `<p class="cost-note">Charging history requires the updated SmartEVSE integration.</p>`;
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
      <h3>Charging history</h3>
      ${ledger.error ? `<p role="alert" class="wizard-error">${this._safe(ledger.error)}</p>` : ""}
      <p class="cost-note">Estimated from measured power and Real Electricity Price at the time of charging. Shared across all users; latest ${this._safe(ledger.history_limit || 100)} sessions per charger.</p>
      ${["smartevse_1", "smartevse_2"].map(key => {
        const records = ledger.chargers?.[key]?.history;
        return `<details class="cost-charger" data-charger="cost-${key}"><summary><ha-icon icon="mdi:ev-station" aria-hidden="true"></ha-icon>${this._safe(attrs[key + "_name"] || key.replace("smartevse_", "SmartEVSE "))}<span>${Array.isArray(records) ? records.length : 0}</span><ha-icon icon="mdi:chevron-down" aria-hidden="true"></ha-icon></summary>
        ${Array.isArray(records) && records.length ? records.map(r => `<details class="cost-record" data-charger="cost-${this._safe(r.id)}">
          <summary><span class="cost-record-copy"><strong>${this._safe(this._costTime(r.started_at))}</strong><small>${this._safe(r.vehicle && r.vehicle !== "unknown" ? r.vehicle : "Vehicle")} · ${this._safe(Number(r.energy_kwh || 0).toFixed(2))} kWh</small></span><span class="cost-record-value"><strong>≈ ${this._safe(this._costAmount(r))}</strong><small>${r.partial ? "Partial estimate" : this._safe(({charging:"Charging", paused:"Paused", complete:"Complete", finished:"Finished", unavailable:"Connection lost"})[r.status] || "Recorded")}</small></span></summary>
          <div class="cost-record-details">${r.ended_at ? `<p>Ended ${this._safe(this._costTime(r.ended_at))}</p>` : ""}
          ${r.priced_kwh > 0 ? `<p>Average ${this._safe(this._costAmount({...r, cost:r.cost/r.priced_kwh}))}/kWh</p>` : ""}
          ${r.unpriced_kwh > 0 ? `<p>${this._safe(Number(r.unpriced_kwh).toFixed(3))} kWh without a price</p>` : ""}
          ${(Array.isArray(r.issues) ? r.issues : []).map(i=>`<p>${this._safe(issues[i] || "Some measurements are missing.")}</p>`).join("")}</div>
        </details>`).join("") : `<p class="cost-note">No charging sessions recorded yet. Tracking starts with the next charge; earlier sessions are not reconstructed.</p>`}</details>`;
      }).join("")}</section>`;
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
      <details class="charger-details" data-charger="${this._safe(ev.key)}">
        <summary>Charger details<ha-icon icon="mdi:chevron-down" aria-hidden="true"></ha-icon></summary>
        <dl>
          <div><dt>State</dt><dd>${this._safe(ev.state)}</dd></div>
          <div><dt>Mode</dt><dd>${this._safe(ev.mode)}</dd></div>
          <div><dt>Current offered</dt><dd>${this._safe(this._formatCurrent(ev.chargeCurrent))}</dd></div>
          <div><dt>Limit</dt><dd>${this._safe(this._formatCurrent(ev.maxCurrent))}</dd></div>
        </dl>
      </details>` : "";
    return `
      <div class="ev-node-wrap ${this._safe(ev.key)} tone-${this._safe(ev.tone)} visual-${this._safe(ev.visual)}"
        style="${this._safe(this._wledNodeStyle(visual, ev.visual))}">
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
              ${record ? `<button class="session-cost" data-action="open-settings" aria-label="${this._safe(ev.smartevseName)} charging cost history"><strong>≈ ${this._safe(this._costAmount(record))}</strong><small>${this._costData()?.error ? "History not saved" : record.partial ? "Partial estimate" : ev.connected && record.status !== "finished" ? "Session estimate" : "Last session"}</small></button>` : ev.connected && this._costData() ? `<span class="session-cost empty"><small>No cost recorded yet</small></span>` : ""}
            </div>
          </div>
          ${ev.connected && battery !== null ? `<div class="battery-track" role="meter" aria-label="${this._safe(vehicleTitle)} battery" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${battery}"><span style="width:${battery}%"></span></div>` : ""}
          ${ev.hasError ? `<p class="charger-message" role="status">${this._safe(ev.error)}</p>` : !ev.available ? `<p class="charger-message">Status cannot be read. Check the charger connection.</p>` : ""}
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
    const hasControllerError = controllerError && !["NONE", "None", "unknown", "unavailable"].includes(controllerError);
    const acceptablePriceValue = acceptablePrice !== null ? `${acceptablePrice.toFixed(3)} ${this._currency}` : "n/a";
    const priceLimitLabel = acceptablePrice === null ? "Price limit unavailable" : price === null
      ? `≤ ${acceptablePriceValue} · price unavailable` : `≤ ${acceptablePriceValue}`;
    const forcePlanActive = this._isForcePlanActive();
    const gatingTitle = (() => {
      switch (chargeReason) {
        case "all_connected_evs_complete":
          return "All charging sessions complete";
        case "smartevse_api_unavailable":
          return "Charger connection unavailable";
        case "smartevse_1_only_waiting_for_selected_ev":
        case "smartevse_2_only_waiting_for_selected_ev":
          return "Waiting for the selected vehicle";
        case "smartevse_1_only_session_complete":
        case "smartevse_2_only_session_complete":
          return "Selected vehicle’s session complete";
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
          return "";
      }
    })();
    const activeTitle = ["unavailable", "unknown"].includes(controller.state)
      ? "Controller unavailable"
      : hasControllerError
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
        return nextEvent === "n/a" ? "End unavailable" : `Ends ${nextEvent}`;
      }
      return nextEvent === "n/a" ? "Start unavailable" : nextEvent;
    })();
    const scheduleControlAvailable = Boolean(this._entity(this._config.schedule_switch_entity));
    const scheduleEntityAvailable = Boolean(this._entity(this._config.schedule_entity));
    const forceControlAvailable = Boolean(
      this._entity(this._config.force_charge_entity) ||
        this._entity(this._config.force_timer_entity) ||
        this._entity(this._config.force_price_entity),
    );
    const rotationPolicy = String(attrs.charge_policy || this._state(this._config.charge_policy_entity)).toLowerCase();
    const heroRuntimePills = activeEv?.isCharging && [ev1, ev2].every(ev => ev.available && ev.connected && !ev.sessionComplete && !ev.hasError) && rotationPolicy.includes("first") && dutyLabel !== "n/a"
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
        const timerValue = timerLabel !== "n/a" ? `${timerLabel} left` : forceDuration === null ? "Timer unavailable" : this._formatMinutes(forceDuration);
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
    const heroPillsMarkup = heroPillGroups
      .sort((left, right) => left.id === "force-charge" ? -1 : right.id === "force-charge" ? 1 : left.priority - right.priority)
      .map(
        (group) => `
          <div class="status-pill-group" data-plan-group="${this._safe(group.id)}">
            <span class="status-pill-group-label tone-${this._safe(group.tone)}" aria-label="${this._safe(group.label)} enabled" title="${this._safe(group.label)} enabled"><ha-icon class="status-pill-icon" icon="mdi:toggle-switch" aria-hidden="true"></ha-icon>${this._safe(group.label)}</span>
            ${group.id === "use-schedule" && forcePlanActive ? `<span class="plan-note">Resumes after force charge</span>` : ""}
            <span class="status-pill-group-items">
              ${group.pills
                .sort((left, right) => left.priority - right.priority)
                .map(
                  (pill) =>
                    `<span class="status-pill tone-${this._safe(pill.tone)}"${pill.description ? ` aria-label="${this._safe(pill.description)}" title="${this._safe(pill.description)}"` : ""}>${pill.icon ? `<ha-icon class="status-pill-icon" icon="${this._safe(pill.icon)}" aria-hidden="true"></ha-icon>` : ""}${this._safe(pill.label)}</span>`,
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
                `<span class="status-pill status-runtime-pill tone-${this._safe(pill.tone)}">${this._safe(pill.label)}</span>`,
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
      <style>
        ${DESIGN_TOKENS_CSS}
        :host {
          --sdc-settings-panel-width: min(390px, calc(100vw - 32px));
          --panel-shadow-color: rgba(0,0,0,0.50);
          --pulse-weak: rgba(0,0,0,0.10);
          --pulse-strong: rgba(0,0,0,0.18);
          --sdc-card-base: var(--ha-card-background, var(--card-background-color));
          --sdc-surface-panel: var(--sdc-card-base);
          --sdc-surface-tile: var(
            --space-hub-tile-background,
            color-mix(in srgb, var(--sdc-card-base) 96%, var(--primary-text-color) 4%)
          );
          --sdc-surface-chip: rgba(0,0,0,0.06);
          --chip-background-color: var(--sdc-surface-chip);
          --chip-border-radius: var(--ha-badge-border-radius, 999px);
          --sdc-font-tiny: 8px;
          --sdc-font-label: 9px;
          --sdc-font-detail: 10px;
          --sdc-font-body: 11px;
          --sdc-font-button: 12px;
          --sdc-font-value: 12px;
          --sdc-font-title: 14px;
          --sdc-font-icon: 16px;
          --sdc-weight-medium: 600;
          --sdc-weight-strong: 700;
          --sdc-letter-label: 0.06em;
          --sdc-letter-title: 0;
          --sdc-led-off: rgb(var(--sdc-led-off-rgb));
          --sdc-led-idle: rgb(var(--sdc-led-idle-rgb));
          --sdc-led-error: rgb(var(--sdc-led-error-rgb));
          --sdc-led-charging: rgb(var(--sdc-led-charging-rgb));
          --sdc-border-subtle: 1px solid rgba(148, 163, 184, 0.16);
          --sdc-border-muted: 1px solid rgba(148, 163, 184, 0.18);
          --sdc-border-soft: 1px solid rgba(148, 163, 184, 0.14);
          --sdc-border-faint: 1px solid rgba(148, 163, 184, 0.12);
          --sdc-border-input: 1px solid rgba(148, 163, 184, 0.24);
          --sdc-border-hover: rgba(148, 163, 184, 0.28);
          --sdc-surface-muted: rgba(15, 23, 42, 0.08);
          --sdc-surface-soft: rgba(15, 23, 42, 0.12);
          --sdc-surface-control: var(--sdc-surface-tile);
          --sdc-surface-elevated: var(--sdc-surface-control);
          --sdc-surface-input: rgba(2, 6, 23, 0.52);
          --sdc-surface-badge: var(--chip-background-color);
          --sdc-surface-glass: rgba(0,0,0,0.06);
          --sdc-surface-icon: var(--chip-background-color);
          --sdc-action-color: var(--primary-color, var(--status-active-color));
          --sdc-action-foreground: var(--text-primary-color, #fff);
          --sdc-text-muted: var(--secondary-text-color);
          --sdc-shadow-soft: var(--tile-shadow-default);
          --sdc-shadow-badge: var(--tile-shadow-default);
        }

        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        ha-card {
          display: block;
          overflow: visible;
          position: relative;
          border-radius: var(--ha-card-border-radius, 16px);
          border: 0;
          background: var(--sdc-surface-panel);
          box-shadow: 0 10px 30px var(--panel-shadow-color);
          padding: var(--tile-padding-large);
          color: var(--primary-text-color);
          transition: filter 0.12s ease, box-shadow 0.12s ease;
        }

        .missing {
          padding: 20px;
          color: var(--sdc-text-muted);
        }

        .wrap {
          padding: 0;
          overflow: visible;
        }

        .controls {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--large-gap);
          margin: 0;
          overflow: visible;
          /* Shared stacking context so a tile glow never paints over a sibling tile. */
          isolation: isolate;
        }

        .control-tile-wrap,
        .status-hero-wrap,
        .ev-node-wrap,
        .wizard-option-wrap {
          position: relative;
          width: 100%;
          display: block;
          border-radius: var(--tile-border-radius);
          overflow: visible;
        }

        .control-tile-wrap .glow-under,
        .status-hero-wrap .glow-under,
        .ev-node-wrap .glow-under,
        .wizard-option-wrap .glow-under {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          display: block;
          border-radius: var(--tile-border-radius);
          opacity: 0;
        }

        .control-tile-wrap .glow-overlay,
        .status-hero-wrap .glow-overlay,
        .ev-node-wrap .glow-overlay,
        .wizard-option-wrap .glow-overlay {
          position: absolute;
          inset: -10px -14px -18px -14px;
          border-radius: inherit;
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0.9;
          -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 18px, rgba(0,0,0,0.9) 44px, rgba(0,0,0,1) 100%);
          mask-image: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 18px, rgba(0,0,0,0.9) 44px, rgba(0,0,0,1) 100%);
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
        }

        .control-tile,
        .setting-tile {
          appearance: none;
          display: grid;
          grid-template-columns: 28px 1fr;
          align-items: start;
          gap: var(--medium-gap);
          width: 100%;
          padding: var(--tile-padding);
          border-radius: var(--tile-border-radius);
          border: 0;
          background: var(--sdc-surface-control);
          box-shadow: var(--tile-shadow-default);
          color: inherit;
          cursor: pointer;
          font: inherit;
          position: relative;
          z-index: 1;
          text-align: left;
          overflow: hidden;
          clip-path: inset(0 round var(--tile-border-radius));
          background-clip: padding-box;
          --control-button-border-radius: var(--tile-border-radius);
          transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
        }

        .primary-controls {
          grid-template-columns: minmax(0, 1fr);
          gap: var(--large-gap);
        }

        .primary-controls .control-tile-wrap {
          height: 58px;
        }

        .primary-controls .control-tile {
          grid-template-columns: minmax(0, 1fr) 32px;
          height: 100%;
          min-height: 58px;
          align-items: center;
          padding: var(--tile-padding);
          border-radius: var(--tile-border-radius);
          background: var(--sdc-surface-control);
          box-shadow: var(--tile-shadow-default);
        }

        .primary-controls .control-icon {
          grid-column: 2;
          grid-row: 1;
          align-self: center;
          width: 32px;
          height: 32px;
          border-radius: var(--chip-border-radius);
        }

        .primary-controls .control-copy {
          grid-column: 1;
          grid-row: 1;
          align-self: center;
          align-content: center;
          gap: 4px;
        }

        .primary-controls .control-label {
          font-size: var(--sdc-font-label);
        }

        .primary-controls .control-value {
          font-size: var(--sdc-font-title);
          line-height: 1.1;
          letter-spacing: var(--sdc-letter-title);
        }

        .setting-controls {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .setting-controls .setting-tile {
          min-height: 62px;
          border-radius: var(--tile-border-radius);
          background: var(--sdc-surface-control);
        }

        .setting-tile-editing {
          cursor: default;
          transform: none;
        }

        .control-icon,
        .setting-icon {
          display: grid;
          place-items: center;
          align-self: start;
          width: 28px;
          height: 28px;
          border-radius: var(--chip-border-radius);
          background: var(--chip-background-color);
          color: var(--secondary-text-color);
          transition: color 0.12s ease, background 0.12s ease;
        }

        .control-icon ha-icon,
        .setting-icon ha-icon {
          --mdc-icon-size: var(--sdc-font-icon);
          color: inherit;
          display: inline-grid;
          place-items: center;
          width: var(--sdc-font-icon);
          height: var(--sdc-font-icon);
          font-size: var(--sdc-font-icon);
          line-height: 1;
        }

        .control-copy,
        .setting-copy {
          display: grid;
          align-content: start;
          gap: 2px;
          min-width: 0;
        }

        .control-label,
        .setting-label,
        .modal-kicker,
        .section-title span,
        .flow-line-icon {
          color: var(--sdc-text-muted);
          font-size: var(--sdc-font-label);
          font-weight: var(--sdc-weight-strong);
          letter-spacing: var(--sdc-letter-label);
          line-height: 1;
          text-transform: uppercase;
        }

        .control-value,
        .setting-value,
        .status-title,
        .modal-title,
        .modal-option-title,
        .ev-label-text {
          font-weight: var(--sdc-weight-strong);
          letter-spacing: var(--sdc-letter-title);
        }

        .control-label,
        .setting-label {
          margin-bottom: 0;
        }

        .control-value,
        .setting-value {
          font-size: var(--sdc-font-value);
          line-height: 1.2;
          margin-bottom: 0;
          transition: color 0.12s ease;
        }

        .control-tile.state-off {
          color: var(--secondary-text-color);
        }

        .control-tile.state-off .control-value {
          color: var(--secondary-text-color);
        }

        .control-tile.state-on .control-icon,
        .control-tile.state-on .control-value {
          color: var(--sdc-led-charging);
        }

        .control-tile.state-armed .control-icon,
        .control-tile.state-armed .control-value,
        .control-tile.state-waiting .control-icon,
        .control-tile.state-waiting .control-value {
          color: var(--sdc-led-idle);
        }

        .control-tile.state-warn .control-icon,
        .control-tile.state-warn .control-value {
          color: var(--sdc-led-error);
        }

        .setting-editor {
          display: grid;
          gap: var(--medium-gap);
          margin-top: var(--tile-padding);
        }

        .setting-input,
        .setting-select {
          width: 100%;
          appearance: none;
          border: 0;
          border-radius: var(--tile-border-radius);
          background: var(--chip-background-color);
          color: var(--primary-text-color);
          padding: 8px 10px;
          font: inherit;
          font-size: var(--sdc-font-value);
          font-weight: var(--sdc-weight-medium);
          outline: none;
        }

        .setting-input:focus,
        .setting-select:focus {
          box-shadow: 0 0 0 2px var(--primary-color, var(--status-active-color));
        }

        .setting-editor-actions {
          display: flex;
          gap: var(--medium-gap);
        }

        .setting-editor-button {
          appearance: none;
          border: 0;
          border-radius: var(--chip-border-radius);
          background: var(--chip-background-color);
          color: var(--primary-text-color);
          padding: 6px 10px;
          font: inherit;
          font-size: var(--sdc-font-button);
          font-weight: var(--sdc-weight-medium);
          cursor: pointer;
        }

        .setting-editor-button.tone-primary {
          border-color: var(--sdc-border-hover);
          background: var(--chip-background-color);
        }

        :where(
          .control-tile,
          .setting-tile,
          .setting-editor-button,
          .modal-close,
          .modal-back,
          .modal-option,
          .wizard-option-main,
          .wizard-plan-toggle,
          .wizard-schedule-entity,
          .wizard-toggle,
          .status-hero
        ) {
          transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
        }

        :where(
          .control-tile,
          .setting-tile,
          .setting-editor-button,
          .modal-close,
          .modal-back,
          .modal-option,
          .wizard-option-main,
          .wizard-plan-toggle,
          .wizard-schedule-entity,
          .wizard-toggle,
          .status-hero
        ):focus-visible {
          outline: 2px solid var(--primary-color, var(--status-active-color));
          outline-offset: 2px;
        }

        @media (hover: hover) and (pointer: fine) {
          :where(
            .control-tile,
            .setting-tile,
            .setting-editor-button,
            .modal-close,
            .modal-back,
            .modal-option,
            .wizard-option-main,
            .wizard-plan-toggle,
            .wizard-schedule-entity,
            .wizard-toggle,
            .status-hero
          ):not(:disabled):hover {
            filter: brightness(1.05);
          }
        }

        :where(
          .control-tile,
          .setting-tile,
          .setting-editor-button,
          .modal-close,
          .modal-back,
          .modal-option,
          .wizard-option-main,
          .wizard-plan-toggle,
          .wizard-schedule-entity,
          .wizard-toggle,
          .status-hero
        ):not(:disabled):active {
          transform: scale(0.99);
        }

        .settings-backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(0, 0, 0, 0.48);
        }

        .dialog-panel {
          width: var(--sdc-settings-panel-width);
          max-height: min(82vh, 640px);
          overflow: auto;
          padding: 12px;
          border-radius: var(--tile-border-radius);
          border: 0;
          background: var(--sdc-surface-panel);
          box-shadow: 0 22px 52px rgba(0, 0, 0, 0.36);
          color: var(--primary-text-color);
        }

        .settings-panel .setting-controls {
          grid-template-columns: minmax(0, 1fr);
          gap: 8px;
          margin-bottom: 0;
        }

        .settings-panel .setting-tile {
          min-height: 56px;
          padding: 8px;
          align-items: center;
        }

        .settings-panel .setting-icon {
          align-self: center;
        }

        .settings-panel .setting-copy {
          align-content: center;
        }

        .settings-panel .setting-tile-editing {
          grid-column: 1 / -1;
        }

        .submenu-panel {
          width: var(--sdc-settings-panel-width);
        }

        .modal-head {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: flex-start;
          margin-bottom: 10px;
        }

        .modal-head-navigation {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) auto;
          align-items: flex-start;
        }

        .modal-copy {
          min-width: 0;
        }

        .modal-kicker {
          margin-bottom: 5px;
        }

        .modal-title {
          color: var(--primary-text-color);
          font-size: var(--sdc-font-title);
          line-height: 1.12;
        }

        .modal-close {
          appearance: none;
          border: 0;
          border-radius: var(--chip-border-radius);
          background: var(--chip-background-color);
          color: var(--primary-text-color);
          cursor: pointer;
          flex: 0 0 auto;
          font: inherit;
          font-size: var(--sdc-font-body);
          font-weight: var(--sdc-weight-strong);
          padding: 6px 9px;
        }

        .modal-back {
          appearance: none;
          display: inline-grid;
          place-items: center;
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: var(--chip-border-radius);
          background: var(--chip-background-color);
          color: var(--primary-text-color);
          cursor: pointer;
          padding: 0;
        }

        .modal-back ha-icon {
          --mdc-icon-size: var(--sdc-font-icon);
          display: inline-grid;
          place-items: center;
          width: var(--sdc-font-icon);
          height: var(--sdc-font-icon);
          font-size: var(--sdc-font-icon);
          line-height: 1;
        }

        .modal-options {
          display: grid;
          gap: 8px;
        }

        .modal-option {
          appearance: none;
          border: 0;
          border-radius: var(--tile-border-radius);
          background: var(--sdc-surface-control);
          box-shadow: var(--tile-shadow-default);
          color: var(--primary-text-color);
          cursor: pointer;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: var(--medium-gap);
          min-height: 44px;
          padding: 9px 10px;
          position: relative;
          text-align: left;
          overflow: hidden;
          clip-path: inset(0 round var(--tile-border-radius));
          background-clip: padding-box;
          transition: box-shadow 0.12s ease, color 0.12s ease, filter 0.12s ease;
        }

        .modal-option.selected {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
          color: var(--sdc-led-idle);
          box-shadow: var(--tile-shadow-active);
        }

        .modal-option-title {
          font-size: 13px;
          letter-spacing: var(--sdc-letter-title);
          line-height: 1.15;
        }

        .modal-option-check {
          --mdc-icon-size: 18px;
          display: block;
          width: var(--mdc-icon-size);
          height: var(--mdc-icon-size);
          min-width: var(--mdc-icon-size);
          justify-self: end;
          color: inherit;
        }

        .force-wizard-panel {
          --wizard-tile-height: 64px;
          width: min(430px, calc(100vw - 32px));
        }

        .wizard-step-panel {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          max-height: min(calc(100dvh - 32px), 640px);
          overflow: hidden;
        }

        .wizard-step-panel .wizard-step-body {
          min-height: 0;
          overflow-y: auto;
          padding: 2px 4px 6px;
        }

        .wizard-options,
        .wizard-step-body {
          display: grid;
          gap: var(--medium-gap);
        }

        .wizard-option {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          min-height: var(--wizard-tile-height);
          width: 100%;
          border: 0;
          border-radius: var(--tile-border-radius);
          background: var(--sdc-surface-control);
          box-shadow: var(--tile-shadow-default);
          color: var(--primary-text-color);
          position: relative;
          overflow: hidden;
          z-index: 1;
        }

        .wizard-option-main {
          appearance: none;
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) 18px;
          align-items: center;
          gap: var(--medium-gap);
          min-width: 0;
          min-height: var(--wizard-tile-height);
          padding: var(--tile-padding);
          border: 0;
          background: transparent;
          color: inherit;
          cursor: pointer;
          font: inherit;
          text-align: left;
        }

        .wizard-plan-toggle {
          appearance: none;
          position: relative;
          width: 38px;
          height: 22px;
          margin: 0 10px 0 4px;
          padding: 0;
          border: 0;
          border-radius: var(--chip-border-radius);
          background: color-mix(in srgb, var(--secondary-text-color) 34%, transparent);
          cursor: pointer;
          transition: background 0.15s ease, filter 0.12s ease, transform 0.12s ease;
        }

        .wizard-plan-toggle-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--sdc-action-foreground);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
          transition: transform 0.15s ease;
        }

        .wizard-plan-toggle.selected {
          background: var(--sdc-action-color);
        }

        .wizard-plan-toggle.selected .wizard-plan-toggle-thumb {
          transform: translateX(16px);
        }

        .wizard-option.selected {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .wizard-option-wrap.selected .glow-under {
          opacity: 1;
        }

        .wizard-option-main:disabled,
        .wizard-plan-toggle:disabled,
        .wizard-toggle:disabled,
        .wizard-schedule-entity:disabled,
        .modal-close:disabled,
        .modal-back:disabled {
          cursor: default;
          opacity: 0.55;
        }

        .wizard-option-icon {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border-radius: var(--chip-border-radius);
          background: var(--chip-background-color);
          color: var(--sdc-action-color);
        }

        .wizard-option-icon ha-icon,
        .wizard-option-next {
          --mdc-icon-size: 18px;
        }

        .wizard-option-copy,
        .wizard-toggle-copy {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        .wizard-option-title,
        .wizard-toggle-copy strong,
        .wizard-field-label {
          font-size: var(--sdc-font-value);
          font-weight: var(--sdc-weight-strong);
          line-height: 1.2;
        }

        .wizard-option-next {
          color: var(--sdc-text-muted);
        }

        .wizard-option.selected .wizard-option-next {
          color: var(--sdc-action-color);
        }

        .wizard-schedule-entity {
          display: grid;
          align-items: center;
          gap: var(--medium-gap);
          padding: var(--tile-padding);
          border-radius: var(--tile-border-radius);
          background: var(--sdc-surface-control);
        }

        .wizard-schedule-entity {
          appearance: none;
          grid-template-columns: 36px minmax(0, 1fr) 18px;
          width: 100%;
          min-height: var(--wizard-tile-height);
          border: 0;
          box-shadow: var(--tile-shadow-default);
          color: var(--primary-text-color);
          cursor: pointer;
          font: inherit;
          text-align: left;
        }

        .wizard-expandable {
          border-radius: var(--tile-border-radius);
          background: var(--sdc-surface-control);
          box-shadow: var(--tile-shadow-default);
          overflow: hidden;
          transition: box-shadow 0.16s ease, filter 0.16s ease;
        }

        .wizard-expandable.expanded {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .wizard-toggle {
          appearance: none;
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) auto;
          align-items: center;
          gap: var(--medium-gap);
          width: 100%;
          min-height: var(--wizard-tile-height);
          padding: var(--tile-padding);
          border: 0;
          border-radius: var(--tile-border-radius);
          background: var(--sdc-surface-control);
          color: var(--primary-text-color);
          cursor: pointer;
          font: inherit;
          text-align: left;
        }

        .wizard-expandable .wizard-toggle {
          border-radius: inherit;
          background: transparent;
        }

        .wizard-expandable.expanded .wizard-toggle {
          border-radius: var(--tile-border-radius) var(--tile-border-radius) 0 0;
        }

        .wizard-toggle.selected {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
          box-shadow: none;
        }

        .wizard-expansion {
          border-top: 1px solid var(--sdc-border-hover);
          animation: wizardExpansionIn 0.18s cubic-bezier(0.22, 1, 0.36, 1);
          transform-origin: top;
        }

        .wizard-expandable .wizard-field {
          border-radius: 0;
          background: transparent;
        }

        .wizard-toggle-state {
          position: relative;
          width: 38px;
          height: 22px;
          flex: 0 0 auto;
          border-radius: var(--chip-border-radius);
          background: color-mix(in srgb, var(--secondary-text-color) 34%, transparent);
          transition: background 0.15s ease;
        }

        .wizard-toggle-state-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--sdc-action-foreground);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
          transition: transform 0.15s ease;
        }

        .wizard-toggle-state.selected {
          background: var(--sdc-action-color);
        }

        .wizard-toggle-state.selected .wizard-toggle-state-thumb {
          transform: translateX(16px);
        }

        .wizard-field {
          display: grid;
          gap: 6px;
          padding: var(--tile-padding);
          border-radius: var(--tile-border-radius);
          background: var(--sdc-surface-control);
        }

        .wizard-input-wrap {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: var(--medium-gap);
        }

        .wizard-duration-inputs {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--medium-gap);
          min-width: 0;
        }

        .wizard-duration-part {
          display: grid;
          gap: var(--small-gap);
          min-width: 0;
        }

        .wizard-duration-part-label {
          color: var(--sdc-text-muted);
          font-size: var(--sdc-font-label);
          font-weight: var(--sdc-weight-strong);
          letter-spacing: var(--sdc-letter-label);
          line-height: 1;
          text-transform: uppercase;
        }

        .wizard-input-unit {
          color: var(--sdc-text-muted);
          font-size: var(--sdc-font-body);
          font-weight: var(--sdc-weight-medium);
        }

        @keyframes wizardExpansionIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .wizard-error {
          margin-top: var(--medium-gap);
          padding: 8px 10px;
          border-radius: var(--tile-border-radius);
          background: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-weak-alpha));
          color: var(--sdc-led-error);
          font-size: var(--sdc-font-body);
          font-weight: var(--sdc-weight-medium);
          line-height: 1.35;
        }

        .control-tile.tone-ok {
          --pulse-weak: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .control-tile-wrap.tone-ok .glow-under {
          --pulse-weak: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-strong-alpha));
          opacity: 1;
          box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
        }

        .control-tile.tone-active {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .control-tile-wrap.tone-active .glow-under {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
          opacity: 1;
          box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
        }

        .control-tile.tone-warn {
          --pulse-weak: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .control-tile-wrap.tone-warn .glow-under {
          --pulse-weak: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-strong-alpha));
          opacity: 1;
          box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
        }

        .flow-stage {
          position: relative;
          display: grid;
          gap: 0;
          border-radius: 0;
          border: 0;
          background: transparent;
          padding: 0;
          overflow: visible;
        }

        .house-node {
          position: relative;
          z-index: 1;
          margin: 0 auto;
          width: 100%;
          padding: 0;
          border-radius: 0;
          border: 0;
          background: transparent;
          box-shadow: none;
          text-align: left;
          overflow: visible;
        }

        .status-hero-wrap {
          margin-bottom: 0;
        }

        .status-hero {
          appearance: none;
          position: relative;
          display: block;
          width: 100%;
          min-height: 92px;
          height: auto;
          padding: 10px var(--tile-padding-large);
          border-radius: var(--tile-border-radius);
          border: 0;
          background: var(--sdc-surface-control);
          box-shadow: var(--tile-shadow-default);
          color: var(--primary-text-color);
          cursor: pointer;
          font: inherit;
          text-align: left;
          overflow: hidden;
          clip-path: inset(0 round var(--tile-border-radius));
          background-clip: padding-box;
          --control-button-border-radius: var(--tile-border-radius);
          transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
        }

        .status-hero:focus-visible {
          outline: 2px solid var(--primary-color, var(--status-active-color));
          outline-offset: 2px;
        }

        .status-hero.visual-charging {
          --pulse-weak: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .status-hero-wrap.visual-charging .glow-under {
          opacity: 1;
        }

        .status-hero.visual-idle {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .status-hero-wrap.visual-idle .glow-under {
          opacity: 1;
        }

        .status-hero.visual-error {
          --pulse-weak: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .status-hero-wrap.visual-error .glow-under {
          opacity: 1;
        }

        .status-copy {
          position: relative;
          display: grid;
          align-content: start;
          gap: var(--tile-padding);
          min-width: 0;
        }

        .status-title {
          font-size: 16px;
          line-height: 1.18;
          overflow-wrap: anywhere;
        }

        .status-pills,
        .status-pill-groups {
          display: grid;
          gap: 5px;
          width: 100%;
          min-width: 0;
        }

        .status-pill-group {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 4px;
          width: 100%;
          min-width: 0;
        }

        .status-pill-group + .status-pill-group {
          margin-top: var(--small-gap);
          padding-top: var(--medium-gap);
          border-top: 1px solid color-mix(in srgb, var(--sdc-text-muted) 22%, transparent);
        }

        .status-pill-group-items {
          display: contents;
        }

        .status-runtime-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          width: 100%;
          min-width: 0;
        }

        .status-pill,
        .status-pill-group-label {
          --status-pill-color: var(--sdc-text-muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
          height: 26px;
          padding: 0 7px;
          border: 1px solid color-mix(in srgb, var(--status-pill-color) 30%, transparent);
          border-radius: var(--chip-border-radius);
          background: color-mix(in srgb, var(--status-pill-color) 13%, var(--chip-background-color));
          color: var(--status-pill-color);
          font-size: 10px;
          font-weight: var(--chip-text-font-weight);
          line-height: 1.35;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .status-pill-icon {
          --mdc-icon-size: 23.4px;
          width: 23.4px;
          height: 23.4px;
          flex: 0 0 23.4px;
          margin-right: 4px;
        }

        .status-pill-group-label .status-pill-icon {
          --mdc-icon-size: 34px;
          width: 34px;
          height: 34px;
          flex-basis: 34px;
        }

        .status-pill-group-label {
          flex: 0 0 auto;
          font-weight: 700;
        }

        .status-pill.tone-active,
        .status-pill-group-label.tone-active {
          --status-pill-color: var(--primary-color, var(--status-active-color));
        }

        .status-pill.tone-success,
        .status-pill-group-label.tone-success {
          --status-pill-color: var(--status-success-color);
        }

        .status-pill.tone-warn,
        .status-pill-group-label.tone-warn {
          --status-pill-color: var(--status-warn-color);
        }

        .status-pill.tone-error,
        .status-pill-group-label.tone-error {
          --status-pill-color: var(--status-alert-color);
        }

        .home-controls {
          margin-bottom: 0;
          overflow: visible;
        }

        .setting-controls {
          margin-bottom: 0;
        }

        .section-title {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          margin: 9px 2px 6px;
        }

        .section-title span {
          letter-spacing: var(--sdc-letter-label);
          color: var(--primary-text-color);
        }

        .section-title small {
          font-size: var(--sdc-font-detail);
          color: var(--sdc-text-muted);
        }

        .ev-row {
          position: relative;
          z-index: 3;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--large-gap);
          align-items: stretch;
          margin-top: -4px;
        }

        .ev-node {
          border-radius: var(--tile-border-radius);
          padding: var(--tile-padding-large);
          border: 0;
          background: var(--sdc-surface-control);
          box-shadow: var(--tile-shadow-default);
          position: relative;
          z-index: 1;
          overflow: hidden;
          clip-path: inset(0 round var(--tile-border-radius));
          background-clip: padding-box;
          --control-button-border-radius: var(--tile-border-radius);
          transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
        }

        .ev-node-wrap.visual-idle .glow-under {
          --pulse-weak: rgba(var(--node-rgb), var(--node-weak-alpha));
          --pulse-strong: rgba(var(--node-rgb), var(--node-strong-alpha));
          opacity: 1;
          box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
          animation: var(--node-glow-animation) var(--node-glow-duration) ease-in-out infinite;
        }

        .ev-node-wrap.visual-charging .glow-under {
          --pulse-weak: rgba(var(--node-rgb), var(--node-weak-alpha));
          --pulse-strong: rgba(var(--node-rgb), var(--node-strong-alpha));
          opacity: 1;
          box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
          animation: var(--node-glow-animation) var(--node-glow-duration) ease-in-out infinite;
        }

        .ev-node-wrap.visual-error .glow-under {
          --pulse-weak: rgba(var(--node-rgb), var(--node-weak-alpha));
          --pulse-strong: rgba(var(--node-rgb), var(--node-strong-alpha));
          opacity: 1;
          box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
          animation: var(--node-glow-animation) var(--node-glow-duration) ease-in-out infinite;
        }

        @keyframes glowPulse {
          0% { box-shadow: 0 10px 20px var(--pulse-weak); }
          50% { box-shadow: 0 28px 56px var(--pulse-strong); }
          100% { box-shadow: 0 10px 20px var(--pulse-weak); }
        }

        ${OVERVIEW_CSS}
      </style>

      <ha-card style="${this._safe(wledStyleVars)}">
        <div class="wrap">
          <div class="flow-stage">
            <section class="house-node">
              <div class="status-hero-wrap visual-${this._safe(heroVisual)}">
                <div class="glow-under status-glow" style="${this._safe(heroGlowStyle)}" aria-hidden="true">
                  <div class="glow-overlay"></div>
                </div>
                <button
                  class="status-hero visual-${this._safe(heroVisual)}"
                  data-action="open-force-wizard"
                  type="button"
                  aria-label="Edit charging plan"
                >
                  <div class="overview-heading"><span>EV charging</span><span class="edit-plan">Edit plan<ha-icon icon="mdi:chevron-right" aria-hidden="true"></ha-icon></span></div>
                  <div class="status-copy">
                    <div class="status-title">${this._safe(activeTitle)}</div>
                    ${hasControllerError ? `<p class="overview-note">${this._safe(controllerError)}</p>` : ""}
                    ${heroPillsMarkup || heroRuntimePillsMarkup ? `<div class="status-pills status-pill-groups">${heroPillsMarkup}${heroRuntimePillsMarkup}</div>` : `<p class="overview-note">No charging plan enabled</p>`}
                  </div>
                </button>
              </div>
            </section>

            <div class="ev-row">
              ${this._evNode(ev1)}
              ${this._evNode(ev2)}
            </div>
          </div>

          ${this._forceWizardModal()}
          ${this._settingsModal(this._settingsControls({ policy, dutyCycleMinutes: this._numberState(this._config.duty_cycle_entity) }))}
        </div>
      </ha-card>
    `;

    return html`${unsafeHTML(markup)}`;
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
    const data = ["action", "entity", "mode", "durationPart", "value"]
      .map((name) => `${name}:${element.dataset[name] || ""}`).join("|");
    const detail = element.closest<HTMLDetailsElement>("details");
    return [element.localName, element.id, element.getAttribute("name") || "", data,
      detail ? this._detailsKey(detail) : ""].join("|");
  }

  _captureUiFocus(): UiFocusSnapshot | null {
    const element = (this.renderRoot as ShadowRoot).activeElement as HTMLElement | null;
    if (!element || element.matches('[role="dialog"], .modal-title')) return null;
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
    this.renderRoot.querySelectorAll<HTMLDetailsElement>("details").forEach((element) => {
      this._detailsOpen.set(this._detailsKey(element), element.open);
    });
    const focus = this._captureUiFocus();
    const active = (this.renderRoot as ShadowRoot).activeElement;
    this._dialogHadFocus = Boolean(active?.matches('[role="dialog"]'));
    this._pendingUiFocus = focus || (active?.matches('[role="dialog"]') ? this._busyUiFocus : null);
    if (!this._renderedDialogKey && (this._forceWizardOpen || this._settingsModalOpen)) {
      this._dialogReturnFocus = focus;
    }
  }

  updated() {
    this.renderRoot.querySelectorAll<HTMLDetailsElement>("details").forEach((element) => {
      const key = this._detailsKey(element);
      if (this._detailsOpen.has(key)) element.open = this._detailsOpen.get(key)!;
    });
    const dialog = this.renderRoot.querySelector<HTMLElement>('.dialog-panel[role="dialog"]');
    const dialogKey = dialog?.getAttribute("aria-label") || "";
    const previousDialogKey = this._renderedDialogKey;
    this._renderedDialogKey = dialogKey;
    const overview = this.renderRoot.querySelector<HTMLElement>(".flow-stage");
    if (overview) overview.inert = Boolean(dialog);
    if (dialog) {
      dialog.tabIndex = -1;
      dialog.setAttribute("aria-busy", this._forceWizardBusy ? "true" : "false");
      if (dialogKey !== previousDialogKey) {
        this._busyUiFocus = null;
        dialog.focus({ preventScroll: true });
      } else if (this._pendingUiFocus) {
        if (this._restoreUiFocus(this._pendingUiFocus)) {
          this._busyUiFocus = null;
        } else {
          this._busyUiFocus = this._forceWizardBusy ? this._pendingUiFocus : null;
          dialog.focus({ preventScroll: true });
        }
      } else if (this._dialogHadFocus) {
        dialog.focus({ preventScroll: true });
      }
    } else if (previousDialogKey) {
      this._busyUiFocus = null;
      if (!this._restoreUiFocus(this._dialogReturnFocus)) {
        this.renderRoot.querySelector<HTMLElement>('[data-action="open-force-wizard"]')?.focus({ preventScroll: true });
      }
      this._dialogReturnFocus = null;
    } else {
      this._restoreUiFocus(this._pendingUiFocus);
    }
    this._pendingUiFocus = null;
  }

  _handleDialogKeydown(event: KeyboardEvent) {
    const dialog = this.renderRoot.querySelector<HTMLElement>('.dialog-panel[role="dialog"]');
    if (!dialog) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (this._forceWizardOpen) {
        if (this._forceWizardStep === "choose") this._closeForceWizard();
        else this._backForceWizard();
      } else if (this._settingsSubmenuEntity) {
        this._closeSettingsSubmenu();
      } else {
        this._closeSettingsModal();
      }
      return true;
    }
    if (event.key !== "Tab") return false;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])',
    )).filter((element) => {
      if (element.matches(":disabled") || element.closest("[hidden], [inert]")) return false;
      for (let node: HTMLElement | null = element; node && node !== dialog; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
      }
      return true;
    });
    const active = (this.renderRoot as ShadowRoot).activeElement as HTMLElement | null;
    const index = controls.indexOf(active!);
    if (!controls.length || index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
      event.preventDefault();
      event.stopPropagation();
      (event.shiftKey ? controls[controls.length - 1] : controls[0])?.focus({ preventScroll: true });
      if (!controls.length) dialog.focus({ preventScroll: true });
      return true;
    }
    return false;
  }

  firstUpdated() {
    this._bindDelegatedActions();
  }

  _bindDelegatedActions() {
    const root: EventTarget = this.renderRoot;

    root.addEventListener("click", async (event: Event) => {
      const target = event.target as HTMLElement | null;
      const forceBackdrop = target?.closest<HTMLElement>(".force-backdrop");
      if (forceBackdrop && event.target === forceBackdrop) {
        this._closeForceWizard();
        return;
      }
      const backdrop = target?.closest<HTMLElement>(".settings-backdrop");
      if (backdrop && event.target === backdrop) {
        this._closeSettingsModal();
        return;
      }
      const element = target?.closest<HTMLElement>("[data-action]");
      if (!element || element.matches(":disabled")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const { action, entity, value, mode } = element.dataset;
      if (action === "open-settings") {
        this._openSettingsModal();
        return;
      }
      if (action === "open-force-wizard") {
        this._openForceWizard();
        return;
      }
      if (action === "close-force-wizard") {
        this._closeForceWizard();
        return;
      }
      if (action === "back-force-wizard") {
        this._backForceWizard();
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
      if (action === "close-settings") {
        this._closeSettingsModal();
        return;
      }
      if (action === "back-settings") {
        this._closeSettingsSubmenu();
        return;
      }
      if (!entity) {
        return;
      }
      if (action === "open-more-info") {
        // Hand focus to Home Assistant only after our own modal and trap close.
        if (this._forceWizardBusy) return;
        if (this._forceWizardOpen) this._closeForceWizard();
        if (this._settingsModalOpen) this._closeSettingsModal();
        await this.updateComplete;
        this.dispatchEvent(
          new CustomEvent("hass-more-info", {
            detail: { entityId: entity },
            bubbles: true,
            composed: true,
          }),
        );
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
        await this._saveForceWizardNumber(input.dataset.entity);
        return;
      }
      const element = (event.target as HTMLElement | null)?.closest<HTMLSelectElement>(".setting-select[data-entity]");
      if (!element) {
        return;
      }
      this._updateEditorDraft(element.dataset.entity, element.value);
    });

    root.addEventListener("keydown", async (event: Event) => {
      if (this._handleDialogKeydown(event as KeyboardEvent)) return;
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        ".setting-input[data-entity], .setting-select[data-entity]",
      );
      if (!element) {
        return;
      }
      const entityId = element.dataset.entity;
      if (element.classList.contains("force-input")) {
        if ((event as KeyboardEvent).key === "Enter") {
          event.preventDefault();
          if (element.classList.contains("force-duration-input")) {
            await this._saveForceDurationInput(element as HTMLInputElement);
          } else {
            await this._saveForceWizardNumber(entityId);
          }
        }
        if ((event as KeyboardEvent).key === "Escape") {
          event.preventDefault();
          this._backForceWizard();
        }
        return;
      }
      if ((event as KeyboardEvent).key === "Enter") {
        event.preventDefault();
        await this._saveEditor(entityId);
      }
      if ((event as KeyboardEvent).key === "Escape") {
        event.preventDefault();
        this._closeEditor();
      }
    });
  }

  async _toggleEntity(entityId) {
    const state = this._state(entityId);
    if (!state) {
      return;
    }
    const service = state === "on" ? "turn_off" : "turn_on";
    await this._hass.callService("homeassistant", service, { entity_id: entityId });
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
