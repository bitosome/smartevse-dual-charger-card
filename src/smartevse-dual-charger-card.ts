import { LitElement, html } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { DESIGN_TOKENS_CSS } from "./shared/design-tokens";
import { buildGlow, type PulseColors } from "./shared/glow";

const CARD_VERSION = "0.0.22";

const ACTIVE_GLOW: PulseColors = {
  weak: "rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha))",
  strong: "rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha))",
};

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
  private _settingsSubmenuEntity: string | null = null;
  private _forceWizardOpen = false;
  private _forceWizardStep: "choose" | "schedule" | "now" = "choose";
  private _schedulePriceGate = false;
  private _forceNowTimer = false;
  private _forceNowPrice = false;
  private _forceWizardBusy = false;
  private _forceWizardError = "";
  private _lastRenderKey = "";

  static getStubConfig() {
    return {
      type: "custom:smartevse-flow-card",
      controller_entity: "sensor.smartevse_dual_charger_controller_state",
      price_entity: "sensor.real_electricity_price_current_price",
      schedule_entity: "schedule.charge_schedule",
      schedule_switch_entity: "switch.smartevse_dual_charger_charge_with_schedule",
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
    this._config = config;
    this._currency = config.currency || "EUR/kWh";
    this.requestUpdate();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (this._editingEntity) {
      return;
    }
    const renderKey = this._buildRenderKey();
    if (renderKey === this._lastRenderKey) {
      return;
    }
    this._lastRenderKey = renderKey;
    this._render();
  }

  getCardSize() {
    return 12;
  }

  _entity(entityId) {
    return entityId ? this._hass?.states?.[entityId] ?? null : null;
  }

  _state(entityId) {
    return this._entity(entityId)?.state ?? "";
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
    if (index >= 0 && index < labels.length) {
      return labels[index];
    }
    return String(option ?? "");
  }

  _chargePolicyOptionItems(options = []) {
    const rawOptions = Array.isArray(options) && options.length ? options : this._chargePolicyLabels();
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
      "smartevse_1_connected_ev",
      "smartevse_1_battery",
      "smartevse_1_state",
      "smartevse_1_plug_state",
      "smartevse_1_mode",
      "smartevse_1_charge_current",
      "smartevse_1_max_current",
      "smartevse_1_override_current",
      "smartevse_1_error",
      "smartevse_1_session_complete",
      "smartevse_2_connected_ev",
      "smartevse_2_battery",
      "smartevse_2_state",
      "smartevse_2_plug_state",
      "smartevse_2_mode",
      "smartevse_2_charge_current",
      "smartevse_2_max_current",
      "smartevse_2_override_current",
      "smartevse_2_error",
      "smartevse_2_session_complete",
    ];
    const tracked = {
      controller: this._entitySnapshot(this._config.controller_entity, controllerAttrs),
      price: this._entitySnapshot(this._config.price_entity),
      schedule: this._entitySnapshot(this._config.schedule_entity, ["next_event"]),
      scheduleSwitch: this._entitySnapshot(this._config.schedule_switch_entity),
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

  _batteryTone(percent) {
    if (!Number.isFinite(percent)) {
      return "unknown";
    }
    if (percent <= 20) {
      return "low";
    }
    if (percent <= 55) {
      return "mid";
    }
    return "high";
  }

  _vehicleBatteryMarkup(rawValue) {
    const percent = this._batteryPercent(rawValue);
    if (percent === null) {
      return `
        <div class="vehicle-battery vehicle-battery-unknown">
          <div class="vehicle-battery-shell">
            <div class="vehicle-battery-track"></div>
            <div class="vehicle-battery-value">n/a</div>
          </div>
        </div>
      `;
    }
    const tone = this._batteryTone(percent);
    return `
      <div class="vehicle-battery vehicle-battery-${this._safe(tone)}">
        <div class="vehicle-battery-shell">
          <div class="vehicle-battery-cap"></div>
          <div class="vehicle-battery-track"></div>
          <div class="vehicle-battery-level" style="width: ${percent}%"></div>
          <div class="vehicle-battery-gloss"></div>
          <div class="vehicle-battery-value">${this._safe(`${percent}%`)}</div>
        </div>
      </div>
    `;
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

  _homeConnectorPath(side) {
    if (side === "left") {
      return "M 320 0 L 320 40 C 320 50 312 58 302 58 L 173 58 C 163 58 155 66 155 76 L 155 110";
    }
    return "M 320 0 L 320 40 C 320 50 328 58 338 58 L 467 58 C 477 58 485 66 485 76 L 485 110";
  }

  _vehicleConnectorPath() {
    return "M 60 0 L 60 56";
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
    const connected = attrs[`${key}_plug_state`] === "Connected";
    const state = String(attrs[`${key}_state`] ?? "").trim();
    const mode = String(attrs[`${key}_mode`] ?? "").trim();
    const chargeCurrent = Number(attrs[`${key}_charge_current`] ?? 0);
    const maxCurrent = Number(attrs[`${key}_max_current`] ?? 0);
    const overrideCurrent = Number(attrs[`${key}_override_current`] ?? 0);
    const error = String(attrs[`${key}_error`] ?? "").trim();
    const sessionComplete = Boolean(attrs[`${key}_session_complete`]);
    const active = attrs.active_smartevse_raw === key;
    const smartevseName = fallbackName;
    const connectedEvName = String(attrs[`${key}_connected_ev`] ?? "").trim();
    const battery = String(attrs[`${key}_battery`] ?? "").trim();
    const hasError = error && !["NONE", "None", "unknown", "unavailable"].includes(error);
    const isCharging = state === "Charging" && chargeCurrent > 0.1;
    // Match the integration's physical WLED state exactly. WLED switches to its
    // charging visual as soon as SmartEVSE reports Charging, even while current
    // is still ramping up from zero.
    const visual = !connected ? "off" : hasError ? "error" : state === "Charging" ? "charging" : "idle";

    let tone = "idle";
    if (!connected) {
      tone = "unplugged";
    } else if (hasError) {
      tone = "error";
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
      connectedEvName,
      connected,
      state: state || "Idle",
      mode: mode || "n/a",
      battery,
      chargeCurrent: Number.isFinite(chargeCurrent) ? chargeCurrent : 0,
      maxCurrent: Number.isFinite(maxCurrent) ? maxCurrent : 0,
      overrideCurrent: Number.isFinite(overrideCurrent) ? overrideCurrent : 0,
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
    if (!entity) {
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
      if (!Number.isFinite(parsed)) {
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
    await this._hass.callService(meta.serviceDomain, meta.service, serviceData);
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
    if (!meta.supported || meta.kind !== "select") {
      return;
    }
    try {
      await this._hass.callService(meta.serviceDomain, meta.service, {
        entity_id: entityId,
        option: value,
      });
    } catch (error) {
      this._updateEditorDraft(entityId, previousValue);
      this._render();
      throw error;
    }
  }

  _openSettingsModal() {
    this._forceWizardOpen = false;
    this._settingsModalOpen = true;
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

  _activeForceMode() {
    if (this._state(this._config.force_charge_entity) === "on") {
      return "simple";
    }
    const timerOn = this._state(this._config.force_timer_entity) === "on";
    const priceOn = this._state(this._config.force_price_entity) === "on";
    if (timerOn && priceOn) {
      return "timer_price";
    }
    if (timerOn) {
      return "timer";
    }
    if (priceOn) {
      return this._state(this._config.schedule_switch_entity) === "on" ? "schedule_price" : "price";
    }
    if (this._state(this._config.schedule_switch_entity) === "on") {
      return "schedule";
    }
    return null;
  }

  _openForceWizard() {
    this._settingsModalOpen = false;
    this._forceWizardOpen = true;
    this._forceWizardStep = "choose";
    this._schedulePriceGate =
      this._state(this._config.schedule_switch_entity) === "on" &&
      this._state(this._config.force_price_entity) === "on";
    const activeMode = this._activeForceMode();
    this._forceNowTimer = activeMode === "timer" || activeMode === "timer_price";
    this._forceNowPrice = activeMode === "price" || activeMode === "timer_price";
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

  _toggleSchedulePriceGate() {
    if (this._forceWizardBusy) {
      return;
    }
    if (
      !this._schedulePriceGate &&
      (!this._entity(this._config.force_price_entity) ||
        !this._entity(this._config.acceptable_price_entity) ||
        !this._entity(this._config.price_entity))
    ) {
      this._forceWizardError = "Price-controlled charging is unavailable because a required price entity is missing.";
      this._render();
      return;
    }
    this._schedulePriceGate = !this._schedulePriceGate;
    this._forceWizardError = "";
    this._render();
  }

  _toggleForceNowTimer() {
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
    this._render();
  }

  _toggleForceNowPrice() {
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
    this._render();
  }

  async _setSwitchState(entityId, enabled) {
    if (!entityId || !this._entity(entityId)) {
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

  async _applyForceMode(mode) {
    if (this._forceWizardBusy || !["schedule", "simple", "price", "timer", "timer_price"].includes(mode)) {
      return;
    }
    this._forceWizardBusy = true;
    this._forceWizardError = "";
    this._render();
    try {
      if (mode === "schedule") {
        const scheduleEntity = this._config.schedule_switch_entity;
        if (!scheduleEntity || !this._entity(scheduleEntity)) {
          throw new Error("The scheduled-charging switch is unavailable.");
        }
        if (this._schedulePriceGate) {
          if (
            !this._config.force_price_entity ||
            !this._entity(this._config.force_price_entity) ||
            !this._entity(this._config.price_entity)
          ) {
            throw new Error("A required price-controlled charging entity is unavailable.");
          }
          await this._setWizardNumber(this._config.acceptable_price_entity);
        }

        const incompatibleEntities = [
          this._config.force_charge_entity,
          this._config.force_timer_entity,
          ...(this._schedulePriceGate ? [] : [this._config.force_price_entity]),
        ].filter(Boolean);
        for (const entityId of incompatibleEntities) {
          if (this._state(entityId) === "on") {
            await this._setSwitchState(entityId, false);
          }
        }
        await this._setSwitchState(scheduleEntity, true);
        if (this._schedulePriceGate) {
          await this._setSwitchState(this._config.force_price_entity, true);
        }
        this._forceWizardOpen = false;
        this._forceWizardStep = "choose";
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
        if (this._state(this._config.schedule_switch_entity) === "on") {
          await this._setSwitchState(this._config.schedule_switch_entity, false);
        }
      }
      if (mode === "timer" || mode === "timer_price") {
        await this._setWizardNumber(this._config.force_charge_duration_entity);
      }

      const forceEntities = [
        this._config.force_charge_entity,
        this._config.force_price_entity,
        this._config.force_timer_entity,
      ].filter(Boolean);
      const targets =
        mode === "timer_price"
          ? [this._config.force_price_entity, this._config.force_timer_entity].filter(Boolean)
          : [target];
      for (const entityId of forceEntities) {
        if (!targets.includes(entityId) && this._state(entityId) === "on") {
          await this._setSwitchState(entityId, false);
        }
      }
      for (const entityId of targets) {
        await this._setSwitchState(entityId, true);
      }
      this._forceWizardOpen = false;
      this._forceWizardStep = "choose";
    } catch (error) {
      this._forceWizardError = error instanceof Error ? error.message : "Unable to apply the charging plan.";
    } finally {
      this._forceWizardBusy = false;
      this._render();
    }
  }

  async _stopForceCharge() {
    if (this._forceWizardBusy) {
      return;
    }
    this._forceWizardBusy = true;
    this._forceWizardError = "";
    this._render();
    try {
      const activeMode = this._activeForceMode();
      const activeEntities =
        activeMode === "simple"
          ? [this._config.force_charge_entity]
            : activeMode === "timer_price"
              ? [this._config.force_timer_entity, this._config.force_price_entity]
              : activeMode === "timer"
                ? [this._config.force_timer_entity]
            : activeMode === "schedule_price"
              ? [this._config.schedule_switch_entity, this._config.force_price_entity]
              : activeMode === "price"
                ? [this._config.force_price_entity]
                : activeMode === "schedule"
                  ? [this._config.schedule_switch_entity]
                  : [];
      for (const entityId of activeEntities) {
        if (entityId && this._state(entityId) === "on") {
          await this._setSwitchState(entityId, false);
        }
      }
      this._forceWizardOpen = false;
      this._forceWizardStep = "choose";
    } catch (error) {
      this._forceWizardError = error instanceof Error ? error.message : "Unable to turn off the charging plan.";
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
          detail: "Tap to edit",
          presentation: "submenu",
        })}
        ${this._settingTile({
          entityId: this._config.duty_cycle_entity,
          icon: "mdi:swap-horizontal-bold",
          label: "Duty Cycle",
          value: this._formatMinutes(dutyCycleMinutes),
          detail: "Tap to edit",
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
        <div class="dialog-panel settings-panel" role="dialog" aria-modal="true" aria-label="Policy and limits">
          <div class="modal-head">
            <div>
              <div class="modal-kicker">Controls</div>
              <div class="modal-title">Policy & limits</div>
              <div class="modal-subtitle">Configure charging priority and duty cycle.</div>
            </div>
            <button class="modal-close" data-action="close-settings" type="button">Close</button>
          </div>
          ${settingsControls}
        </div>
      </div>
    `;
  }

  _forceWizardNumberField(entityId, label, helper) {
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
        <span class="wizard-field-helper">${this._safe(helper)}</span>
      </label>
    `;
  }

  _forceWizardModal({
    priceValue,
    acceptablePrice,
    forceDuration,
    timerLabel,
    scheduleState,
    scheduleNextEvent,
    priceAccepted,
  }) {
    if (!this._forceWizardOpen) {
      return "";
    }

    const activeMode = this._activeForceMode();
    const activeDetail =
      activeMode === "schedule_price"
        ? scheduleState !== "on"
          ? "Waiting for the schedule window"
          : priceAccepted
            ? "Schedule is open and price is acceptable"
            : "Schedule is open; waiting for an acceptable price"
        : activeMode === "schedule"
          ? scheduleState === "on"
            ? "Schedule window is open"
            : `Next change ${this._formatDateTime(scheduleNextEvent)}`
          : activeMode === "price"
            ? priceAccepted
              ? `Current price accepted: ${priceValue}`
              : `Waiting for price ≤ ${
                  acceptablePrice !== null ? `${acceptablePrice.toFixed(3)} ${this._currency}` : "threshold"
                }`
            : activeMode === "timer" || activeMode === "timer_price"
              ? this._state(this._config.schedule_switch_entity) === "on"
                ? `Remaining ${timerLabel}; scheduled charging resumes afterward`
                : activeMode === "timer_price"
                  ? priceAccepted
                    ? `Charging below the price limit · ${timerLabel} remaining`
                    : `Waiting for an acceptable price · ${timerLabel} remaining`
                  : `Remaining ${timerLabel}`
              : activeMode === "simple" && this._state(this._config.schedule_switch_entity) === "on"
                ? "Scheduled charging will resume when this is turned off"
                : "Immediate charging request";
    const busy = this._forceWizardBusy;
    const error = this._forceWizardError
      ? `<div class="wizard-error" role="alert">${this._safe(this._forceWizardError)}</div>`
      : "";

    if (this._forceWizardStep === "choose") {
      const choices = [
        {
          mode: "schedule",
          icon: "mdi:calendar-clock",
          title: "Use a schedule",
          detail: "Charge only inside the configured schedule, optionally with a price limit.",
        },
        {
          mode: "now",
          icon: "mdi:lightning-bolt",
          title: "Charge now",
          detail: "Start immediately, with optional time and acceptable-price limits.",
        },
      ];
      return `
        <div class="force-backdrop settings-backdrop">
          <div class="dialog-panel force-wizard-panel" role="dialog" aria-modal="true" aria-label="Configure charging plan">
            <div class="modal-head">
              <div>
                <div class="modal-kicker">Charging plan</div>
                <div class="modal-title">How should charging run?</div>
                <div class="modal-subtitle">Choose one plan. Scheduled charging can also wait for an acceptable electricity price.</div>
              </div>
              <button class="modal-close" data-action="close-force-wizard" type="button" ${busy ? "disabled" : ""}>Close</button>
            </div>
            <div class="wizard-options">
              ${choices
                .map((choice) => {
                  const available =
                    choice.mode === "schedule"
                      ? Boolean(
                          this._entity(this._config.schedule_switch_entity) &&
                            this._entity(this._config.schedule_entity),
                        )
                      : Boolean(
                          this._entity(this._config.force_charge_entity) ||
                            this._entity(this._config.force_timer_entity) ||
                            this._entity(this._config.force_price_entity),
                        );
                  const selected =
                    choice.mode === "schedule"
                      ? activeMode === "schedule" || activeMode === "schedule_price"
                      : Boolean(activeMode && !["schedule", "schedule_price"].includes(activeMode));
                  const detail = selected && activeDetail ? activeDetail : choice.detail;
                  const glowStyle = buildGlow(ACTIVE_GLOW, "pulse", selected).style;
                  return `
                    <div class="wizard-option-wrap ${selected ? "selected" : ""}">
                      <div class="glow-under wizard-option-glow" style="${this._safe(glowStyle)}" aria-hidden="true"><div class="glow-overlay"></div></div>
                      <button
                        class="wizard-option ${selected ? "selected" : ""}"
                        data-action="choose-force-mode"
                        data-mode="${this._safe(choice.mode)}"
                        type="button"
                        ${!available || busy ? "disabled" : ""}
                      >
                        <span class="wizard-option-icon"><ha-icon icon="${this._safe(choice.icon)}"></ha-icon></span>
                        <span class="wizard-option-copy">
                          <span class="wizard-option-title">${this._safe(choice.title)}</span>
                          <span class="wizard-option-detail">${
                            available ? this._safe(detail) : "Required charging entities are unavailable."
                          }</span>
                        </span>
                        <ha-icon class="wizard-option-next" icon="${selected ? "mdi:check-circle" : "mdi:chevron-right"}"></ha-icon>
                      </button>
                    </div>
                  `;
                })
                .join("")}
            </div>
            ${
              activeMode
                ? `<button class="wizard-stop-plan" data-action="stop-force-charge" type="button" ${busy ? "disabled" : ""}>${
                    busy ? "Turning off…" : "Turn off charging plan"
                  }</button>`
                : ""
            }
            ${error}
          </div>
        </div>
      `;
    }

    const mode = this._forceWizardStep;
    const isSchedule = mode === "schedule";
    const nowMode = this._forceNowMode();
    const scheduleEntity = this._entity(this._config.schedule_entity);
    const scheduleName = String(scheduleEntity?.attributes?.friendly_name || "Charging schedule");
    const timerAvailable = Boolean(
      this._entity(this._config.force_timer_entity) &&
        this._entity(this._config.force_charge_duration_entity),
    );
    const priceAvailable = Boolean(
      this._entity(this._config.force_price_entity) &&
        this._entity(this._config.acceptable_price_entity) &&
        this._entity(this._config.price_entity),
    );
    const nowModeAvailable =
      nowMode === "simple"
        ? Boolean(this._entity(this._config.force_charge_entity))
        : nowMode === "timer"
          ? timerAvailable
          : nowMode === "price"
            ? priceAvailable
            : timerAvailable && priceAvailable;
    const title = isSchedule ? "Scheduled charging" : "Charge now";
    const subtitle = isSchedule
      ? "Charge inside your Home Assistant schedule, with an optional price limit."
      : "Choose optional limits. Leave both off for an unrestricted force charge.";
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
              <span class="wizard-option-detail">${
                scheduleEntity
                  ? `${scheduleState === "on" ? "Active now" : "Next change"}: ${this._formatDateTime(scheduleNextEvent)} · Tap to edit`
                  : "Configured schedule entity is unavailable."
              }</span>
              <span class="wizard-entity-id">${this._safe(this._config.schedule_entity)}</span>
            </span>
            <ha-icon class="wizard-option-next" icon="mdi:chevron-right"></ha-icon>
          </button>
          <div class="wizard-expandable ${this._schedulePriceGate ? "expanded" : ""}">
            <button
              class="wizard-toggle ${this._schedulePriceGate ? "selected" : ""}"
              data-action="toggle-schedule-price"
              type="button"
              role="switch"
              aria-checked="${this._schedulePriceGate ? "true" : "false"}"
              ${busy ? "disabled" : ""}
            >
              <span class="wizard-toggle-copy">
                <strong>Also require an acceptable price</strong>
                <span>Charging starts only when both the schedule and price conditions are satisfied.</span>
              </span>
              <ha-icon
                class="wizard-toggle-state ${this._schedulePriceGate ? "selected" : ""}"
                icon="${this._schedulePriceGate ? "mdi:check-circle" : "mdi:circle-outline"}"
              ></ha-icon>
            </button>
            ${
              this._schedulePriceGate
                ? `
                  <div class="wizard-expansion">
                    ${this._forceWizardNumberField(
                      this._config.acceptable_price_entity,
                      "Maximum acceptable price",
                      `Current price: ${priceValue}.`,
                    )}
                    <div class="wizard-rule">
                      <ha-icon icon="mdi:information-outline"></ha-icon>
                      <span>If the schedule is active but the price is too high, charging waits until the price becomes acceptable.</span>
                    </div>
                  </div>
                `
                : ""
            }
          </div>
        `
      : `
          <div class="wizard-expandable ${this._forceNowTimer ? "expanded" : ""}">
            <button
              class="wizard-toggle ${this._forceNowTimer ? "selected" : ""}"
              data-action="toggle-force-now-timer"
              type="button"
              role="switch"
              aria-checked="${this._forceNowTimer ? "true" : "false"}"
              ${!timerAvailable || busy ? "disabled" : ""}
            >
              <span class="wizard-toggle-copy">
                <strong>Stop after a set time</strong>
                <span>${timerAvailable ? `Current duration: ${this._formatMinutes(forceDuration)}.` : "Timer entities are unavailable."}</span>
              </span>
              <ha-icon
                class="wizard-toggle-state ${this._forceNowTimer ? "selected" : ""}"
                icon="${this._forceNowTimer ? "mdi:check-circle" : "mdi:circle-outline"}"
              ></ha-icon>
            </button>
            ${
              this._forceNowTimer
                ? `<div class="wizard-expansion">${this._forceWizardNumberField(
                    this._config.force_charge_duration_entity,
                    "Charging duration",
                    "The timer starts when this plan is enabled.",
                  )}</div>`
                : ""
            }
          </div>
          <div class="wizard-expandable ${this._forceNowPrice ? "expanded" : ""}">
            <button
              class="wizard-toggle ${this._forceNowPrice ? "selected" : ""}"
              data-action="toggle-force-now-price"
              type="button"
              role="switch"
              aria-checked="${this._forceNowPrice ? "true" : "false"}"
              ${!priceAvailable || busy ? "disabled" : ""}
            >
              <span class="wizard-toggle-copy">
                <strong>Require an acceptable price</strong>
                <span>${priceAvailable ? `Current price: ${priceValue}.` : "Price entities are unavailable."}</span>
              </span>
              <ha-icon
                class="wizard-toggle-state ${this._forceNowPrice ? "selected" : ""}"
                icon="${this._forceNowPrice ? "mdi:check-circle" : "mdi:circle-outline"}"
              ></ha-icon>
            </button>
            ${
              this._forceNowPrice
                ? `<div class="wizard-expansion">${this._forceWizardNumberField(
                    this._config.acceptable_price_entity,
                    "Maximum acceptable price",
                    this._forceNowTimer
                      ? "Charging stops when the timer expires and only runs while the price is acceptable."
                      : "Charging begins whenever the price becomes acceptable.",
                  )}</div>`
                : ""
            }
          </div>
        `;

    return `
      <div class="force-backdrop settings-backdrop">
        <div class="dialog-panel force-wizard-panel" role="dialog" aria-modal="true" aria-label="${this._safe(title)}">
          <div class="modal-head modal-head-navigation">
            <button class="modal-back" data-action="back-force-wizard" type="button" aria-label="Back" ${busy ? "disabled" : ""}>
              <ha-icon icon="mdi:chevron-left"></ha-icon>
            </button>
            <div class="modal-copy">
              <div class="modal-kicker">Charging plan</div>
              <div class="modal-title">${this._safe(title)}</div>
              <div class="modal-subtitle">${this._safe(subtitle)}</div>
            </div>
            <button class="modal-close" data-action="close-force-wizard" type="button" ${busy ? "disabled" : ""}>Close</button>
          </div>
          <div class="wizard-step-body">${field}</div>
          ${error}
          <div class="wizard-actions">
            <button
              class="wizard-primary"
              data-action="apply-force-mode"
              data-mode="${this._safe(isSchedule ? "schedule" : nowMode)}"
              type="button"
              ${busy || (!isSchedule && !nowModeAvailable) ? "disabled" : ""}
            >
              ${
                busy
                  ? "Applying…"
                  : isSchedule
                    ? activeMode === "schedule" || activeMode === "schedule_price"
                      ? "Apply schedule"
                      : "Enable scheduled charging"
                    : "Start charging"
              }
            </button>
          </div>
        </div>
      </div>
    `;
  }

  _settingsSubmenuModal(entityId) {
    const meta = this._editorMeta(entityId);
    if (!meta.supported) {
      return "";
    }
    const entity = this._entity(entityId);
    const name = entity?.attributes?.friendly_name || "Setting";
    const isChargePolicy = entityId === this._config.charge_policy_entity;
    const title = isChargePolicy ? "Charge Policy" : name;
    const subtitle = isChargePolicy
      ? "Choose which SmartEVSE gets priority when both vehicles can charge."
      : "Update this setting without opening the Home Assistant entity dialog.";
    const draft = this._editorDraft(entityId);
    const content =
      meta.kind === "select"
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
              <div class="modal-subtitle">${this._safe(subtitle)}</div>
            </div>
            <button class="modal-close" data-action="close-settings" type="button">Close</button>
          </div>
          ${content}
        </div>
      </div>
    `;
  }

  _settingTile({ entityId, icon, label, value, detail, presentation = "inline" }) {
    if (!entityId) {
      return "";
    }
    const meta = this._editorMeta(entityId);
    const isEditing = presentation === "inline" && this._editingEntity === entityId && meta.supported;
    if (!isEditing) {
      const action = presentation === "submenu" ? "open-submenu" : "edit";
      return `
        <button class="setting-tile" data-action="${this._safe(action)}" data-entity="${this._safe(entityId)}" type="button">
          <div class="setting-icon"><ha-icon icon="${this._safe(icon)}"></ha-icon></div>
          <div class="setting-copy">
            <div class="setting-label">${this._safe(label)}</div>
            <div class="setting-value">${this._safe(value)}</div>
            <div class="setting-detail">${this._safe(detail)}</div>
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
          <div class="setting-detail">${this._safe(detail)}</div>
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

  _evNode(ev) {
    const metaPills = [
      `
        <span class="ev-pill">
          <span class="ev-pill-label">State</span>
          <span class="ev-pill-value">${this._safe(ev.state)}</span>
        </span>
      `,
      `
        <span class="ev-pill">
          <span class="ev-pill-label">Mode</span>
          <span class="ev-pill-value">${this._safe(ev.mode)}</span>
        </span>
      `,
    ]
      .filter(Boolean)
      .join("");
    const smartevseTitle = ev.smartevseName || (ev.key === "smartevse_1" ? "SmartEVSE 1" : "SmartEVSE 2");
    const vehicleTitle =
      ev.connectedEvName && ev.connectedEvName.toLowerCase() !== "unknown" ? ev.connectedEvName : "?";
    const vehicleBattery =
      ev.connectedEvName && ev.connectedEvName.toLowerCase() !== "unknown" ? ev.battery || "n/a" : "n/a";
    const vehicleBatteryMarkup = this._vehicleBatteryMarkup(vehicleBattery);
    const vehicleConnectorPath = this._vehicleConnectorPath();
    const vehicleNode = ev.connected
      ? `
        <div class="vehicle-link-wrap">
          <svg class="vehicle-link" viewBox="0 0 120 56" preserveAspectRatio="none" aria-hidden="true">
            <path class="pipe-base vehicle-pipe-base" d="${vehicleConnectorPath}"></path>
            <path class="pipe-active tone-${this._safe(ev.tone)} vehicle-pipe-active" d="${vehicleConnectorPath}"></path>
          </svg>
        </div>
        <div class="vehicle-node-wrap tone-${this._safe(ev.tone)}">
          <div class="glow-under vehicle-glow" aria-hidden="true">
            <div class="glow-overlay"></div>
          </div>
          <section class="vehicle-node tone-${this._safe(ev.tone)}">
            <div class="vehicle-title">${this._safe(vehicleTitle)}</div>
            ${vehicleBatteryMarkup}
            ${ev.sessionComplete ? `<div class="vehicle-complete-badge">Done</div>` : ""}
          </section>
        </div>
      `
      : "";
    const visuals = this._wledVisuals(this._entity(this._config.controller_entity)?.attributes || {});
    const nodeStyle = this._wledNodeStyle(visuals, ev.visual);
    return `
      <div class="smartevse-stack">
        <div
          class="ev-node-wrap ${this._safe(ev.key)} tone-${this._safe(ev.tone)} visual-${this._safe(ev.visual)}"
          style="${this._safe(nodeStyle)}"
        >
          <div class="glow-under ev-glow" aria-hidden="true">
            <div class="glow-overlay"></div>
          </div>
          <section class="ev-node ${this._safe(ev.key)} tone-${this._safe(ev.tone)} visual-${this._safe(ev.visual)}">
            <div class="ev-node-head">
              <div class="ev-node-badges">
                <div class="ev-label-text">${this._safe(smartevseTitle)}</div>
              </div>
            </div>
            <div class="ev-meta-pills">${metaPills}</div>
            <div class="ev-measure-pills">
              <span class="ev-pill measure-pill">
                <span class="ev-pill-label">Offer</span>
                <span class="ev-pill-value">${this._safe(this._formatCurrent(ev.chargeCurrent))}</span>
              </span>
              <span class="ev-pill measure-pill">
                <span class="ev-pill-label">Max</span>
                <span class="ev-pill-value">${this._safe(this._formatCurrent(ev.maxCurrent))}</span>
              </span>
              <span class="ev-pill measure-pill">
                <span class="ev-pill-label">Override</span>
                <span class="ev-pill-value">${this._safe(this._formatCurrent(ev.overrideCurrent))}</span>
              </span>
            </div>
          </section>
        </div>
        ${vehicleNode}
      </div>
    `;
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
    const priceValue = price === null ? "n/a" : `${price.toFixed(3)} ${this._currency}`;
    const chargeReason = String(attrs.charge_reason ?? "").trim();

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
    const forceChargeOn = this._state(this._config.force_charge_entity) === "on";
    const forcePriceOn = this._state(this._config.force_price_entity) === "on";
    const forceTimerOn = this._state(this._config.force_timer_entity) === "on";
    const forceDuration = this._numberState(this._config.force_charge_duration_entity);
    const mainsPeak = Number(attrs.mains_peak);
    const ev1 = rawEv1;
    const ev2 = rawEv2;
    const activeEv = activeRaw === "smartevse_1" ? ev1 : activeRaw === "smartevse_2" ? ev2 : null;
    const flowActive = chargeAllowed && activeEv;
    const flowLeft = flowActive && activeEv.key === "smartevse_1";
    const flowRight = flowActive && activeEv.key === "smartevse_2";
    const flowTone = activeEv
      ? activeEv.isCharging
        ? "charging"
        : activeEv.hasError
          ? "error"
          : "active"
      : "idle";
    const anyConnected = ev1.connected || ev2.connected;
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
    const scheduleDetail = scheduleSwitchOn
      ? scheduleState === "on"
        ? `Ends ${this._formatDateTime(scheduleNextEvent)}`
        : `Starts ${this._formatDateTime(scheduleNextEvent)}`
      : "Tap to enable";

    const forceNowDetail = forceChargeOn ? (anyConnected ? "Charging requested now" : "Waiting for plug-in") : "Tap to start";

    const priceAccepted =
      forcePriceOn && price !== null && acceptablePrice !== null ? price <= acceptablePrice : false;
    const scheduleWithPrice = scheduleSwitchOn && forcePriceOn;
    const forcePriceDetail = forcePriceOn
      ? priceAccepted
        ? `Current ${priceValue}`
        : anyConnected
          ? `Threshold ${acceptablePrice !== null ? `${acceptablePrice.toFixed(3)} ${this._currency}` : "n/a"}`
          : "Waiting for plug-in"
      : "Tap to arm";

    const forceTimerDetail = forceTimerOn
      ? anyConnected
        ? `Remaining ${timerLabel}`
        : "Waiting for plug-in"
      : `Duration ${this._formatMinutes(forceDuration)}`;
    const hasControllerError = controllerError && !["NONE", "None", "unknown", "unavailable"].includes(controllerError);
    const acceptablePriceValue = acceptablePrice !== null ? `${acceptablePrice.toFixed(3)} ${this._currency}` : "n/a";
    const activeTitle = hasControllerError
      ? "Controller error"
      : activeEv
        ? activeEv.isCharging
          ? `Charging ${activeEv.smartevseName}`
          : `${activeEv.smartevseName} selected`
        : chargeAllowed
          ? "Waiting for an eligible EV"
          : "Charging paused";
    const currentDetail = hasControllerError
      ? this._pretty(controllerError)
      : scheduleWithPrice
        ? "Schedule + acceptable price"
        : activeEv
          ? `${activeEv.state} / ${this._formatCurrent(activeEv.chargeCurrent)} offered`
          : this._pretty(chargeReason);
    const modeDetail = (() => {
      if (activeRaw && dutyLabel !== "n/a") {
        return `Duty left: ${dutyLabel}`;
      }
      if (forceTimerOn) {
        return `Timer: ${forceTimerDetail}`;
      }
      if (forceChargeOn) {
        return `Force: ${forceNowDetail}`;
      }
      if (forcePriceOn) {
        if (scheduleSwitchOn && scheduleState !== "on") {
          return "Waiting for schedule window";
        }
        return priceAccepted
          ? `Price accepted: ${priceValue}`
          : `Waiting for price <= ${acceptablePriceValue}`;
      }
      if (scheduleSwitchOn) {
        return `Schedule: ${scheduleDetail}`;
      }
      if (ev1.connected && ev2.connected) {
        return `Policy: ${policy}`;
      }
      return "";
    })();
    const heroDetails = [currentDetail, modeDetail].filter(Boolean).slice(0, 2);
    const heroDetailsMarkup = heroDetails
      .map((detail) => `<div class="status-detail">${this._safe(detail)}</div>`)
      .join("");
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
    const leftConnectorPath = this._homeConnectorPath("left");
    const rightConnectorPath = this._homeConnectorPath("right");

    const markup = `
      <style>
        ${DESIGN_TOKENS_CSS}
        :host {
          container-name: smartevse-card;
          container-type: inline-size;
          --connector-stroke: 4px;
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
        .vehicle-node-wrap,
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
        .vehicle-node-wrap .glow-under,
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
        .vehicle-node-wrap .glow-overlay,
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

        .setting-detail,
        .status-detail,
        .modal-subtitle {
          color: var(--sdc-text-muted);
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

        .setting-detail {
          font-size: var(--sdc-font-detail);
          line-height: 1.35;
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
          .wizard-option,
          .wizard-schedule-entity,
          .wizard-toggle,
          .wizard-primary,
          .wizard-stop-plan,
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
          .wizard-option,
          .wizard-schedule-entity,
          .wizard-toggle,
          .wizard-primary,
          .wizard-stop-plan,
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
            .wizard-option,
            .wizard-schedule-entity,
            .wizard-toggle,
            .wizard-primary,
            .wizard-stop-plan,
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
          .wizard-option,
          .wizard-schedule-entity,
          .wizard-toggle,
          .wizard-primary,
          .wizard-stop-plan,
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

        .modal-subtitle {
          font-size: var(--sdc-font-body);
          line-height: 1.3;
          margin-top: 5px;
          max-width: 300px;
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
          color: inherit;
        }

        .force-wizard-panel {
          width: min(430px, calc(100vw - 32px));
        }

        .wizard-options,
        .wizard-step-body {
          display: grid;
          gap: var(--medium-gap);
        }

        .wizard-option {
          appearance: none;
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) 18px;
          align-items: center;
          gap: var(--medium-gap);
          min-height: 64px;
          width: 100%;
          padding: var(--tile-padding);
          border: 0;
          border-radius: var(--tile-border-radius);
          background: var(--sdc-surface-control);
          box-shadow: var(--tile-shadow-default);
          color: var(--primary-text-color);
          cursor: pointer;
          font: inherit;
          position: relative;
          text-align: left;
          z-index: 1;
        }

        .wizard-option.selected {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .wizard-option-wrap.selected .glow-under {
          opacity: 1;
        }

        .wizard-option:disabled,
        .wizard-toggle:disabled,
        .wizard-primary:disabled,
        .wizard-stop-plan:disabled,
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
          color: var(--sdc-led-idle);
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

        .wizard-option-detail,
        .wizard-toggle-copy span,
        .wizard-field-helper {
          color: var(--sdc-text-muted);
          font-size: var(--sdc-font-detail);
          line-height: 1.35;
        }

        .wizard-option-next {
          color: var(--sdc-text-muted);
        }

        .wizard-option.selected .wizard-option-next {
          color: var(--sdc-led-idle);
        }

        .wizard-schedule-entity,
        .wizard-rule {
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr);
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
          border: 0;
          box-shadow: var(--tile-shadow-default);
          color: var(--primary-text-color);
          cursor: pointer;
          font: inherit;
          text-align: left;
        }

        .wizard-entity-id {
          color: var(--sdc-text-muted);
          font-size: 10px;
          line-height: 1.25;
          opacity: 0.72;
          overflow-wrap: anywhere;
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
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: var(--medium-gap);
          width: 100%;
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

        .wizard-expandable .wizard-rule {
          padding-top: 0;
          border-radius: 0;
          background: transparent;
        }

        .wizard-toggle-state {
          --mdc-icon-size: 20px;
          width: 20px;
          height: 20px;
          color: var(--sdc-text-muted);
          transition: color 0.15s ease, transform 0.15s ease;
        }

        .wizard-toggle-state.selected {
          color: var(--sdc-led-idle);
          transform: scale(1.05);
        }

        .wizard-rule {
          grid-template-columns: 20px minmax(0, 1fr);
          align-items: start;
          color: var(--sdc-text-muted);
          font-size: var(--sdc-font-detail);
          line-height: 1.4;
        }

        .wizard-rule ha-icon {
          --mdc-icon-size: 16px;
          color: var(--sdc-led-idle);
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

        .wizard-actions {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: var(--medium-gap);
          margin-top: var(--medium-gap);
        }

        .wizard-primary {
          appearance: none;
          border: 0;
          border-radius: var(--chip-border-radius);
          cursor: pointer;
          font: inherit;
          font-size: var(--sdc-font-button);
          font-weight: var(--sdc-weight-strong);
          padding: 8px 12px;
        }

        .wizard-primary {
          background: var(--sdc-led-idle);
          color: var(--sdc-surface-panel);
        }

        .wizard-stop-plan {
          appearance: none;
          display: block;
          width: 100%;
          margin-top: var(--medium-gap);
          padding: 8px 12px;
          border: 0;
          border-radius: var(--chip-border-radius);
          background: transparent;
          color: var(--sdc-led-error);
          cursor: pointer;
          font: inherit;
          font-size: var(--sdc-font-button);
          font-weight: var(--sdc-weight-medium);
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

        .flow-svg {
          display: block;
          width: 100%;
          height: 104px;
          pointer-events: none;
          overflow: visible;
        }

        .pipe-base {
          fill: none;
          stroke: rgba(148, 163, 184, 0.24);
          stroke-width: var(--connector-stroke);
          stroke-linecap: round;
          vector-effect: non-scaling-stroke;
        }

        .pipe-active {
          fill: none;
          stroke-width: var(--connector-stroke);
          stroke-linecap: round;
          vector-effect: non-scaling-stroke;
          stroke-dasharray: 22 18;
          animation: dash 1.8s linear infinite;
          filter: drop-shadow(0 0 8px rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-strong-alpha)));
        }

        .pipe-active.tone-charging {
          stroke: var(--sdc-led-charging);
          filter: drop-shadow(0 0 12px rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-strong-alpha)));
        }

        .pipe-active.tone-active {
          stroke: var(--sdc-led-idle);
          filter: drop-shadow(0 0 12px rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha)));
        }

        .pipe-active.tone-error {
          stroke: var(--sdc-led-error);
          filter: drop-shadow(0 0 12px rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-strong-alpha)));
        }

        .pipe-active.tone-complete,
        .pipe-active.tone-idle,
        .pipe-active.tone-unplugged {
          stroke: transparent;
          animation: none;
          filter: none;
        }

        @keyframes dash {
          to {
            stroke-dashoffset: -160;
          }
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
          height: 92px;
          padding: 0;
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
          position: absolute;
          top: 10px;
          left: 12px;
          right: 48px;
          display: grid;
          align-content: start;
          gap: 5px;
          min-width: 0;
        }

        .status-title {
          font-size: 16px;
          line-height: 1.18;
          overflow-wrap: anywhere;
        }

        .status-action {
          position: absolute;
          top: 10px;
          right: 10px;
          display: grid;
          place-items: center;
          width: 30px;
          height: 30px;
          border-radius: var(--chip-border-radius);
          border: 0;
          background: var(--chip-background-color);
          color: var(--sdc-text-muted);
        }

        .status-action ha-icon {
          --mdc-icon-size: 16px;
          display: inline-grid;
          width: 16px;
          height: 16px;
        }

        .status-details {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 2px;
        }

        .status-detail {
          min-width: 0;
          font-size: 12px;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .status-detail:first-child {
          grid-column: auto;
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

        .flow-map {
          position: relative;
          z-index: 2;
          margin: 0 0 0;
          pointer-events: none;
        }

        .flow-line-badges {
          position: absolute;
          top: 10px;
          transform: translateX(-50%);
          display: grid;
          gap: 2px;
          z-index: 2;
          pointer-events: none;
        }

        .flow-line-badges.left {
          left: 24.2%;
        }

        .flow-line-badges.right {
          left: 75.8%;
        }

        .flow-line-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 5px;
          border-radius: var(--chip-border-radius);
          border: 0;
          background: var(--chip-background-color);
          box-shadow: var(--tile-shadow-default);
          white-space: nowrap;
        }

        .flow-line-badge.tone-charging {
          --pulse-weak: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .flow-line-badge.tone-active {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .flow-line-badge.tone-error {
          --pulse-weak: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-error-rgb), var(--sdc-led-error-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .flow-line-icon {
          min-width: 8px;
          text-align: center;
        }

        .flow-line-value {
          font-size: var(--sdc-font-detail);
          font-weight: var(--sdc-weight-medium);
          line-height: 1;
          color: var(--primary-text-color);
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

        .smartevse-stack {
          display: grid;
          gap: var(--large-gap);
          align-content: start;
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

        .ev-node-head {
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
          gap: 6px;
          margin-bottom: 4px;
        }

        .ev-node-badges {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex-wrap: wrap;
        }

        .ev-label-text {
          font-size: var(--sdc-font-value);
          text-transform: none;
          color: var(--primary-text-color);
          line-height: 1.05;
          white-space: nowrap;
        }

        .ev-meta-pills {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--medium-gap);
          margin-bottom: var(--medium-gap);
        }

        .ev-meta-pills .ev-pill:first-child {
          border-radius: var(--chip-border-radius);
          background: var(--chip-background-color);
        }

        .ev-meta-pills .ev-pill:first-child .ev-pill-value {
          font-size: var(--sdc-font-value);
          font-weight: var(--sdc-weight-strong);
          letter-spacing: var(--sdc-letter-title);
        }

        .ev-pill {
          position: relative;
          display: grid;
          place-items: center;
          min-width: 0;
          min-height: 25px;
          padding: 8px 6px 3px;
          border-radius: var(--chip-border-radius);
          background: var(--chip-background-color);
          border: 0;
          text-align: center;
        }

        .ev-pill-accent {
          background: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
        }

        .ev-pill-label {
          position: absolute;
          top: 3px;
          left: 6px;
          font-size: var(--sdc-font-tiny);
          letter-spacing: var(--sdc-letter-label);
          text-transform: uppercase;
          color: var(--sdc-text-muted);
          line-height: 1;
        }

        .ev-pill-value {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 12px;
          font-size: var(--sdc-font-button);
          font-weight: var(--sdc-weight-medium);
          min-width: 0;
          text-align: center;
          overflow-wrap: anywhere;
          line-height: 1.2;
        }

        .ev-measure-pills {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--medium-gap);
        }

        .vehicle-node {
          display: grid;
          justify-items: center;
          gap: var(--medium-gap);
          border-radius: var(--tile-border-radius);
          padding: var(--tile-padding-large);
          border: 0;
          background: var(--sdc-surface-control);
          box-shadow: var(--tile-shadow-default);
          text-align: center;
          overflow: hidden;
          clip-path: inset(0 round var(--tile-border-radius));
          background-clip: padding-box;
          --control-button-border-radius: var(--tile-border-radius);
          transition: box-shadow 0.12s ease, filter 0.12s ease;
        }

        .vehicle-link-wrap {
          height: 42px;
          display: flex;
          align-items: stretch;
          justify-content: center;
          margin: -8px 0 -8px;
        }

        .vehicle-link {
          width: 100%;
          max-width: 120px;
          height: 100%;
          overflow: visible;
        }

        .vehicle-pipe-base {
          opacity: 0.9;
        }

        .vehicle-battery {
          justify-self: center;
          width: 132px;
          max-width: calc(100% - 8px);
        }

        .vehicle-title {
          max-width: 100%;
          color: var(--primary-text-color);
          font-size: var(--sdc-font-body);
          font-weight: var(--sdc-weight-strong);
          letter-spacing: var(--sdc-letter-title);
          line-height: 1.15;
          overflow-wrap: anywhere;
        }

        .vehicle-battery-shell {
          position: relative;
          width: 100%;
          aspect-ratio: 65 / 18;
          border: 0;
          background: var(--chip-background-color);
          overflow: visible;
          box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.24);
        }

        .vehicle-battery-cap {
          position: absolute;
          top: 50%;
          right: -3px;
          width: 3px;
          height: 8px;
          transform: translateY(-50%);
          border-radius: 0 1px 1px 0;
          background: rgba(148, 163, 184, 0.42);
        }

        .vehicle-battery-track,
        .vehicle-battery-level,
        .vehicle-battery-value {
          position: absolute;
          inset: 0;
        }

        .vehicle-battery-track {
          inset: 2px;
          background: rgba(148, 163, 184, 0.08);
        }

        .vehicle-battery-level {
          inset: 2px auto 2px 2px;
          width: 0;
          border-radius: 1px;
          transition: width 240ms ease;
        }

        .vehicle-battery-value {
          display: grid;
          place-items: center;
          font-size: var(--sdc-font-value);
          font-weight: var(--sdc-weight-strong);
          color: #e2e8f0;
          text-shadow: 0 1px 2px rgba(2, 6, 23, 0.55);
          pointer-events: none;
        }

        .vehicle-battery-high .vehicle-battery-level {
          background: rgba(67, 160, 71, 0.82);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
        }

        .vehicle-battery-mid .vehicle-battery-level {
          background: rgba(251, 192, 45, 0.86);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
        }

        .vehicle-battery-low .vehicle-battery-level {
          background: rgba(229, 57, 53, 0.86);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
        }

        .vehicle-battery-unknown .vehicle-battery-shell {
          border-style: dashed;
        }

        .vehicle-battery-unknown .vehicle-battery-value {
          color: var(--sdc-text-muted);
        }

        .vehicle-complete-badge {
          display: inline-block;
          margin-top: var(--medium-gap);
          padding: 2px 8px;
          border-radius: var(--chip-border-radius);
          font-size: var(--sdc-font-detail);
          font-weight: var(--sdc-weight-strong);
          text-transform: uppercase;
          letter-spacing: var(--sdc-letter-label);
          border: 0;
          background: var(--chip-background-color);
          color: var(--primary-text-color);
        }

        .vehicle-node.tone-complete {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .vehicle-node-wrap.tone-complete .glow-under {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
          opacity: 1;
          box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
        }

        .ev-node.tone-charging {
          color: var(--primary-text-color);
        }

        .ev-node.tone-active {
          color: var(--primary-text-color);
        }

        .ev-node.tone-idle {
          color: var(--primary-text-color);
        }

        .ev-node.tone-complete {
          color: var(--primary-text-color);
        }

        .ev-node.tone-unplugged {
          color: var(--sdc-text-muted);
        }

        .ev-node.tone-error {
          color: var(--primary-text-color);
        }

        .ev-node.tone-charging {
          --pulse-weak: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-charging-rgb), var(--sdc-led-charging-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .ev-node.tone-active {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-weak-alpha));
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), var(--sdc-led-idle-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .ev-node.tone-complete,
        .ev-node.tone-unplugged {
          background: var(--sdc-surface-control);
        }

        .ev-node.visual-idle {
          --pulse-weak: rgba(var(--node-rgb), var(--node-weak-alpha));
          --pulse-strong: rgba(var(--node-rgb), var(--node-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .ev-node.visual-charging {
          --pulse-weak: rgba(var(--node-rgb), var(--node-weak-alpha));
          --pulse-strong: rgba(var(--node-rgb), var(--node-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .ev-node.visual-error {
          --pulse-weak: rgba(var(--node-rgb), var(--node-weak-alpha));
          --pulse-strong: rgba(var(--node-rgb), var(--node-strong-alpha));
          box-shadow: var(--tile-shadow-active);
        }

        .ev-node.visual-off {
          box-shadow: var(--tile-shadow-default);
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

        @container smartevse-card (max-width: 840px) {
          .flow-svg {
            height: 64px;
          }

          .ev-row {
            gap: 8px;
          }

          .settings-panel .setting-controls {
            grid-template-columns: 1fr;
          }
        }
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
                  aria-label="Open charging plan"
                >
                  <div class="status-copy">
                    <div class="status-title">${this._safe(activeTitle)}</div>
                    <div class="status-details">${heroDetailsMarkup}</div>
                  </div>
                  <div class="status-action">
                    <ha-icon icon="mdi:ev-station"></ha-icon>
                  </div>
                </button>
              </div>
            </section>

            <div class="flow-map">
              ${
                activeRaw && (dutyLabel !== "n/a" || timerLabel !== "n/a")
                  ? `
                    <div class="flow-line-badges ${this._safe(activeRaw === "smartevse_1" ? "left" : "right")}">
                      ${
                        dutyLabel !== "n/a"
                          ? `
                            <div class="flow-line-badge tone-${this._safe(flowTone)}">
                              <span class="flow-line-icon">D</span>
                              <span class="flow-line-value">${this._safe(dutyLabel)}</span>
                            </div>
                          `
                          : ""
                      }
                      ${
                        timerLabel !== "n/a"
                          ? `
                            <div class="flow-line-badge tone-${this._safe(flowTone)}">
                              <span class="flow-line-icon">T</span>
                              <span class="flow-line-value">${this._safe(timerLabel)}</span>
                            </div>
                          `
                          : ""
                      }
                    </div>
                  `
                  : ""
              }
              <svg class="flow-svg" viewBox="0 0 640 112" preserveAspectRatio="none">
                <path class="pipe-base" d="${leftConnectorPath}"></path>
                <path class="pipe-base" d="${rightConnectorPath}"></path>
                ${flowLeft ? `<path class="pipe-active tone-${this._safe(flowTone)}" d="${leftConnectorPath}"></path>` : ""}
                ${flowRight ? `<path class="pipe-active tone-${this._safe(flowTone)}" d="${rightConnectorPath}"></path>` : ""}
              </svg>
            </div>

            <div class="ev-row">
              ${this._evNode(ev1)}
              ${this._evNode(ev2)}
            </div>
          </div>

          ${this._forceWizardModal({
            priceValue,
            acceptablePrice,
            forceDuration,
            timerLabel,
            scheduleState,
            scheduleNextEvent,
            priceAccepted,
          })}
        </div>
      </ha-card>
    `;

    return html`${unsafeHTML(markup)}`;
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
      if (!element) {
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
      if (action === "toggle-schedule-price") {
        this._toggleSchedulePriceGate();
        return;
      }
      if (action === "toggle-force-now-timer") {
        this._toggleForceNowTimer();
        return;
      }
      if (action === "toggle-force-now-price") {
        this._toggleForceNowPrice();
        return;
      }
      if (action === "apply-force-mode") {
        await this._applyForceMode(mode);
        return;
      }
      if (action === "stop-force-charge") {
        await this._stopForceCharge();
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
      this._updateEditorDraft(element.dataset.entity, element.value);
    });

    root.addEventListener("change", (event: Event) => {
      const element = (event.target as HTMLElement | null)?.closest<HTMLSelectElement>(
        ".setting-select[data-entity]",
      );
      if (!element) {
        return;
      }
      this._updateEditorDraft(element.dataset.entity, element.value);
    });

    root.addEventListener("keydown", async (event: Event) => {
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
          await this._applyForceMode(
            this._forceWizardStep === "schedule" ? "schedule" : this._forceNowMode(),
          );
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
