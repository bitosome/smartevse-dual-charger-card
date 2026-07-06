const CARD_VERSION = "0.0.10";

const FALLBACK_WLED_NODE_VISUALS = {
  off: {
    color: [148, 163, 184],
    fx: 0,
    sx: 0,
    ix: 0,
  },
  idle: {
    color: [0, 100, 255],
    fx: 2,
    sx: 45,
    ix: 128,
  },
  error: {
    color: [255, 0, 0],
    fx: 2,
    sx: 60,
    ix: 200,
  },
  charging: {
    color: [0, 255, 0],
    fx: 41,
    sx: 80,
    ix: 100,
    pal: 2,
    c1: 128,
    c2: 128,
    c3: 16,
  },
};

class SmartEVSEFlowCard extends HTMLElement {
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

  setConfig(config) {
    if (!config.controller_entity) {
      throw new Error("controller_entity is required");
    }
    this._config = config;
    this._currency = config.currency || "EUR/kWh";
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
  }

  set hass(hass) {
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
    const snapshot = { state: entity.state };
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
    const options = {
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
    return FALLBACK_WLED_NODE_VISUALS;
  }

  _wledRgb(visuals, key) {
    const fallback = FALLBACK_WLED_NODE_VISUALS[key]?.color || FALLBACK_WLED_NODE_VISUALS.off.color;
    const source = Array.isArray(visuals?.[key]?.color) ? visuals[key].color : fallback;
    const values = source.slice(0, 3).map((value) => Number.parseInt(value, 10));
    if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
      return fallback.join(", ");
    }
    return values.map((value) => Math.min(255, Math.max(0, value))).join(", ");
  }

  _wledCssVars(visuals) {
    return ["off", "idle", "error", "charging"]
      .map((key) => `--sdc-led-${key}-rgb: ${this._wledRgb(visuals, key)};`)
      .join(" ");
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
    const visual = !connected ? "off" : hasError ? "error" : isCharging ? "charging" : "idle";

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
    let serviceData = { entity_id: entityId };
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

  _settingsControls({ policy, acceptablePrice, forceDuration, dutyCycleMinutes }) {
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
          entityId: this._config.acceptable_price_entity,
          icon: "mdi:cash-edit",
          label: "Acceptable Price",
          value: acceptablePrice !== null ? `${acceptablePrice.toFixed(3)} ${this._currency}` : "n/a",
          detail: "Tap to edit",
        })}
        ${this._settingTile({
          entityId: this._config.force_charge_duration_entity,
          icon: "mdi:clock-time-four-outline",
          label: "Force Duration",
          value: this._formatMinutes(forceDuration),
          detail: "Tap to edit",
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
              <div class="modal-subtitle">Configure priority, price threshold, force timer duration, and duty cycle.</div>
            </div>
            <button class="modal-close" data-action="close-settings" type="button">Close</button>
          </div>
          ${settingsControls}
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
        <section class="vehicle-node tone-${this._safe(ev.tone)}">
          <div class="vehicle-title">${this._safe(vehicleTitle)}</div>
          ${vehicleBatteryMarkup}
          ${ev.sessionComplete ? `<div class="vehicle-complete-badge">Done</div>` : ""}
        </section>
      `
      : "";
    const visuals = this._wledVisuals(this._entity(this._config.controller_entity)?.attributes || {});
    const visual = visuals[ev.visual] || visuals.off || FALLBACK_WLED_NODE_VISUALS.off;
    return `
      <div class="smartevse-stack">
        <section
          class="ev-node ${this._safe(ev.key)} tone-${this._safe(ev.tone)} visual-${this._safe(ev.visual)}"
          style="--node-rgb: ${visual.color.join(", ")}; --node-sx: ${visual.sx}; --node-ix: ${visual.ix}; --node-fx: ${visual.fx};"
        >
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
        ${vehicleNode}
      </div>
    `;
  }

  _render() {
    if (!this._config || !this._hass) {
      return;
    }

    const controller = this._entity(this._config.controller_entity);
    if (!controller) {
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div class="missing">Controller entity not found: ${this._safe(this._config.controller_entity)}</div>
        </ha-card>
      `;
      return;
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
    const dutyCycleMinutes = this._numberState(this._config.duty_cycle_entity);
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
    const activeTitle = activeEv
      ? activeEv.isCharging
        ? `Charging ${activeEv.smartevseName}`
        : `${activeEv.smartevseName} selected`
      : chargeAllowed
        ? "Waiting for an eligible EV"
        : "Charging paused";
    const activeDetail = activeEv
      ? `${activeEv.smartevseName} / ${activeEv.state} / ${this._formatCurrent(activeEv.chargeCurrent)} offered`
      : this._pretty(chargeReason);
    const statusTone = controllerError && !["NONE", "None", "unknown", "unavailable"].includes(controllerError)
      ? "error"
      : activeEv?.isCharging
        ? "charging"
        : chargeAllowed
          ? "active"
          : "idle";
    const scheduleValue = scheduleSwitchOn ? (scheduleState === "on" ? "On now" : "Armed") : "Off";
    const scheduleControlState = scheduleSwitchOn ? (scheduleState === "on" ? "on" : "armed") : "off";
    const scheduleDetail = scheduleSwitchOn
      ? scheduleState === "on"
        ? `Ends ${this._formatDateTime(scheduleNextEvent)}`
        : `Starts ${this._formatDateTime(scheduleNextEvent)}`
      : "Tap to enable";

    const forceNowValue = forceChargeOn ? (anyConnected ? "Active" : "Waiting EV") : "Off";
    const forceNowState = forceChargeOn ? (anyConnected ? "on" : "waiting") : "off";
    const forceNowDetail = forceChargeOn ? (anyConnected ? "Charging requested now" : "Waiting for plug-in") : "Tap to start";

    const priceAccepted =
      forcePriceOn && price !== null && acceptablePrice !== null ? price <= acceptablePrice : false;
    const forcePriceValue = forcePriceOn ? (priceAccepted ? "Accepted" : anyConnected ? "Waiting" : "Waiting EV") : "Off";
    const forcePriceState = forcePriceOn ? (priceAccepted ? "on" : "waiting") : "off";
    const forcePriceDetail = forcePriceOn
      ? priceAccepted
        ? `Current ${priceValue}`
        : anyConnected
          ? `Threshold ${acceptablePrice !== null ? `${acceptablePrice.toFixed(3)} ${this._currency}` : "n/a"}`
          : "Waiting for plug-in"
      : "Tap to arm";

    const forceTimerValue = forceTimerOn ? (anyConnected ? "Active" : "Waiting EV") : "Off";
    const forceTimerState = forceTimerOn ? (anyConnected ? "on" : "waiting") : "off";
    const forceTimerDetail = forceTimerOn
      ? anyConnected
        ? `Remaining ${timerLabel}`
        : "Waiting for plug-in"
      : `Duration ${this._formatMinutes(forceDuration)}`;
    const hasControllerError = controllerError && !["NONE", "None", "unknown", "unavailable"].includes(controllerError);
    const acceptablePriceValue = acceptablePrice !== null ? `${acceptablePrice.toFixed(3)} ${this._currency}` : "n/a";
    const heroDetails = [activeDetail];
    if (hasControllerError) {
      heroDetails.push(`Error: ${this._pretty(controllerError)}`);
    }
    if (ev1.connected && ev2.connected) {
      heroDetails.push(`Policy: ${policy}`);
    }
    if (activeRaw && dutyLabel !== "n/a") {
      heroDetails.push(`Duty left: ${dutyLabel}`);
    }
    if (scheduleSwitchOn) {
      heroDetails.push(`Schedule: ${scheduleDetail}`);
    }
    if (forceChargeOn) {
      heroDetails.push(`Force: ${forceNowDetail}`);
    }
    if (forcePriceOn) {
      heroDetails.push(`Price force: ${forcePriceDetail} / limit ${acceptablePriceValue}`);
    }
    if (forceTimerOn) {
      heroDetails.push(`Timer: ${forceTimerDetail}`);
    }
    const heroDetailsMarkup = heroDetails
      .map((detail) => `<div class="status-detail">${this._safe(detail)}</div>`)
      .join("");
    const settingsControls = this._settingsControls({
      policy,
      acceptablePrice,
      forceDuration,
      dutyCycleMinutes,
    });
    const leftConnectorPath = this._homeConnectorPath("left");
    const rightConnectorPath = this._homeConnectorPath("right");

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          --connector-stroke: 4px;
          --tile-padding: 8px;
          --tile-padding-large: 12px;
          --tile-border-radius: var(--ha-card-border-radius, 12px);
          --small-gap: 2px;
          --medium-gap: 6px;
          --large-gap: 12px;
          --panel-shadow-color: rgba(0,0,0,0.30);
          --pulse-weak: rgba(0,0,0,0.10);
          --pulse-strong: rgba(0,0,0,0.18);
          --tile-shadow-default:
            0 10px 24px rgba(0,0,0,0.22),
            0 2px 6px rgba(0,0,0,0.10),
            inset 0 1px 0 rgba(255,255,255,0.025);
          --tile-shadow-hover:
            0 14px 30px rgba(0,0,0,0.28),
            0 4px 10px rgba(0,0,0,0.12),
            inset 0 1px 0 rgba(255,255,255,0.035);
          --tile-shadow-active:
            0 18px 40px var(--pulse-strong),
            0 10px 24px rgba(0,0,0,0.22),
            0 6px 18px var(--pulse-weak),
            inset 0 1px 0 rgba(255,255,255,0.035);
          --sdc-card-base: var(--ha-card-background, var(--card-background-color));
          --sdc-surface-panel: color-mix(
            in srgb,
            var(--sdc-card-base) 84%,
            #000 16%
          );
          --sdc-surface-tile: color-mix(
            in srgb,
            var(--sdc-card-base) 92%,
            var(--primary-text-color) 8%
          );
          --sdc-surface-chip: color-mix(in srgb, var(--sdc-surface-tile) 82%, #000 18%);
          --chip-background-color: var(--sdc-surface-chip);
          --chip-border-radius: var(--ha-badge-border-radius, 999px);
          --sdc-font-tiny: 7px;
          --sdc-font-label: 8px;
          --sdc-font-detail: 9px;
          --sdc-font-body: 10px;
          --sdc-font-button: 11px;
          --sdc-font-value: 12px;
          --sdc-font-title: 13px;
          --sdc-font-icon: 15px;
          --sdc-weight-medium: 700;
          --sdc-weight-strong: 800;
          --sdc-letter-label: 0.08em;
          --sdc-letter-title: -0.02em;
          --sdc-radius-xs: 8px;
          --sdc-radius-sm: 10px;
          --sdc-radius-md: 12px;
          --sdc-radius-lg: 14px;
          --sdc-radius-xl: 16px;
          --sdc-radius-2xl: 18px;
          --sdc-radius-3xl: 22px;
          --sdc-radius-stage: 24px;
          --sdc-radius-card: 28px;
          --sdc-radius-round: 999px;
          --sdc-led-off-rgb: 148, 163, 184;
          --sdc-led-idle-rgb: 0, 100, 255;
          --sdc-led-error-rgb: 255, 0, 0;
          --sdc-led-charging-rgb: 0, 255, 0;
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
        }

        .controls {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--large-gap);
          margin: 0;
        }

        .control-tile-wrap {
          position: relative;
          width: 100%;
          display: block;
          isolation: isolate;
          border-radius: var(--tile-border-radius);
        }

        .control-tile-wrap .glow-under {
          position: absolute;
          inset: 0;
          z-index: 0;
          display: block;
          pointer-events: none;
          border-radius: var(--tile-border-radius);
          opacity: 0;
        }

        .control-tile-wrap .glow-overlay {
          position: absolute;
          inset: -10px -14px -18px;
          border-radius: inherit;
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0.9;
          background: radial-gradient(ellipse at 50% 100%, var(--pulse-strong) 0%, var(--pulse-weak) 34%, transparent 72%);
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
          background-clip: padding-box;
          transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
        }

        .primary-controls {
          grid-template-columns: repeat(2, minmax(0, 1fr));
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
          border-radius: var(--sdc-radius-md);
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

        .control-tile:hover,
        .setting-tile:hover {
          transform: translateY(-1px);
          box-shadow: var(--tile-shadow-hover);
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
          box-shadow: 0 0 0 2px rgba(var(--sdc-led-idle-rgb), 0.28);
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
          width: min(560px, calc(100vw - 32px));
          max-height: min(82vh, 640px);
          overflow: auto;
          padding: 18px;
          border-radius: var(--tile-border-radius);
          border: 0;
          background: var(--sdc-surface-panel);
          box-shadow: 0 22px 52px rgba(0, 0, 0, 0.36);
          color: var(--primary-text-color);
        }

        .settings-panel .setting-controls {
          grid-template-columns: minmax(0, 1fr);
          margin-bottom: 0;
        }

        .settings-panel .setting-tile {
          min-height: 74px;
        }

        .settings-panel .setting-tile-editing {
          grid-column: 1 / -1;
        }

        .submenu-panel {
          width: min(430px, calc(100vw - 32px));
        }

        .modal-head {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 14px;
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
          margin-bottom: 7px;
        }

        .modal-title {
          color: var(--primary-text-color);
          font-size: var(--sdc-font-title);
          line-height: 1.12;
        }

        .modal-subtitle {
          font-size: var(--sdc-font-body);
          line-height: 1.35;
          margin-top: 6px;
          max-width: 270px;
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
          padding: 7px 10px;
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
          gap: var(--large-gap);
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
          min-height: 48px;
          padding: 10px 12px;
          text-align: left;
          overflow: hidden;
          background-clip: padding-box;
          transition: box-shadow 0.12s ease, color 0.12s ease, filter 0.12s ease;
        }

        .modal-option.selected {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), 0.30);
          color: var(--sdc-led-idle);
          box-shadow: var(--tile-shadow-active);
        }

        .modal-option-title {
          font-size: 15px;
          letter-spacing: var(--sdc-letter-title);
          line-height: 1.15;
        }

        .modal-option-check {
          --mdc-icon-size: 18px;
          color: inherit;
        }

        .control-tile.tone-ok {
          --pulse-weak: rgba(var(--sdc-led-charging-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-charging-rgb), 0.30);
          box-shadow: var(--tile-shadow-active);
        }

        .control-tile-wrap.tone-ok .glow-under {
          --pulse-weak: rgba(var(--sdc-led-charging-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-charging-rgb), 0.30);
          opacity: 1;
          box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
          animation: glowPulse 2.4s ease-in-out infinite;
        }

        .control-tile.tone-active {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), 0.30);
          box-shadow: var(--tile-shadow-active);
        }

        .control-tile-wrap.tone-active .glow-under {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), 0.30);
          opacity: 1;
          box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
          animation: glowPulse 2.4s ease-in-out infinite;
        }

        .control-tile.tone-warn {
          --pulse-weak: rgba(var(--sdc-led-error-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-error-rgb), 0.30);
          box-shadow: var(--tile-shadow-active);
        }

        .control-tile-wrap.tone-warn .glow-under {
          --pulse-weak: rgba(var(--sdc-led-error-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-error-rgb), 0.30);
          opacity: 1;
          box-shadow: 0 18px 40px var(--pulse-strong), 0 6px 18px var(--pulse-weak);
          animation: glowPulse 1.6s ease-in-out infinite;
        }

        .flow-stage {
          display: grid;
          gap: 0;
          border-radius: 0;
          border: 0;
          background: transparent;
          padding: 0;
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
          filter: drop-shadow(0 0 8px rgba(var(--sdc-led-charging-rgb), 0.3));
        }

        .pipe-active.tone-charging {
          stroke: var(--sdc-led-charging);
          filter: drop-shadow(0 0 12px rgba(var(--sdc-led-charging-rgb), 0.45));
        }

        .pipe-active.tone-active {
          stroke: var(--sdc-led-idle);
          filter: drop-shadow(0 0 12px rgba(var(--sdc-led-idle-rgb), 0.4));
        }

        .pipe-active.tone-error {
          stroke: var(--sdc-led-error);
          filter: drop-shadow(0 0 12px rgba(var(--sdc-led-error-rgb), 0.45));
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
          margin: 0 auto;
          width: 100%;
          padding: 0;
          border-radius: 0;
          border: 0;
          background: transparent;
          box-shadow: none;
          text-align: left;
        }

        .status-hero {
          appearance: none;
          position: relative;
          display: block;
          width: 100%;
          height: 132px;
          padding: 0;
          margin-bottom: 8px;
          border-radius: var(--tile-border-radius);
          border: 0;
          background: var(--sdc-surface-control);
          box-shadow: var(--tile-shadow-default);
          color: var(--primary-text-color);
          cursor: pointer;
          font: inherit;
          text-align: left;
          overflow: hidden;
          background-clip: padding-box;
          transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
        }

        .status-hero:hover {
          transform: translateY(-1px);
          box-shadow: var(--tile-shadow-hover);
        }

        .status-hero:focus-visible {
          outline: 2px solid rgba(var(--sdc-led-idle-rgb), 0.42);
          outline-offset: 2px;
        }

        .status-hero.tone-charging {
          --pulse-weak: rgba(var(--sdc-led-charging-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-charging-rgb), 0.30);
          box-shadow: var(--tile-shadow-active);
        }

        .status-hero.tone-active {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), 0.30);
          box-shadow: var(--tile-shadow-active);
        }

        .status-hero.tone-error {
          --pulse-weak: rgba(var(--sdc-led-error-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-error-rgb), 0.30);
          box-shadow: var(--tile-shadow-active);
        }

        .status-copy {
          position: absolute;
          top: 8px;
          left: 10px;
          right: 10px;
          display: grid;
          align-content: start;
          gap: 7px;
          min-width: 0;
        }

        .status-title {
          font-size: 17px;
          line-height: 1.18;
          overflow-wrap: anywhere;
        }

        .status-action {
          position: absolute;
          top: 8px;
          right: 8px;
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
          gap: 3px;
        }

        .status-detail {
          min-width: 0;
          font-size: 13px;
          line-height: 1.22;
          overflow-wrap: anywhere;
        }

        .status-detail:first-child {
          grid-column: auto;
        }

        .home-controls {
          margin-bottom: 0;
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
          margin: 0 0 0;
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
          --pulse-weak: rgba(var(--sdc-led-charging-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-charging-rgb), 0.30);
          box-shadow: var(--tile-shadow-active);
        }

        .flow-line-badge.tone-active {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), 0.30);
          box-shadow: var(--tile-shadow-active);
        }

        .flow-line-badge.tone-error {
          --pulse-weak: rgba(var(--sdc-led-error-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-error-rgb), 0.30);
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
          overflow: hidden;
          background-clip: padding-box;
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
          background: rgba(var(--sdc-led-idle-rgb), 0.1);
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
          background-clip: padding-box;
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
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), 0.12);
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), 0.22);
          box-shadow: var(--tile-shadow-active);
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
          --pulse-weak: rgba(var(--sdc-led-charging-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-charging-rgb), 0.30);
          box-shadow: var(--tile-shadow-active);
        }

        .ev-node.tone-active {
          --pulse-weak: rgba(var(--sdc-led-idle-rgb), 0.16);
          --pulse-strong: rgba(var(--sdc-led-idle-rgb), 0.30);
          box-shadow: var(--tile-shadow-active);
        }

        .ev-node.tone-complete,
        .ev-node.tone-unplugged {
          background: var(--sdc-surface-control);
        }

        .ev-node.visual-idle {
          --pulse-weak: rgba(var(--node-rgb, var(--sdc-led-idle-rgb)), 0.16);
          --pulse-strong: rgba(var(--node-rgb, var(--sdc-led-idle-rgb)), 0.30);
          box-shadow: var(--tile-shadow-active);
          animation: glowPulse 2.4s ease-in-out infinite;
        }

        .ev-node.visual-charging {
          --pulse-weak: rgba(var(--node-rgb, var(--sdc-led-charging-rgb)), 0.16);
          --pulse-strong: rgba(var(--node-rgb, var(--sdc-led-charging-rgb)), 0.30);
          box-shadow: var(--tile-shadow-active);
          animation: glowPulse 1.8s ease-in-out infinite;
        }

        .ev-node.visual-error {
          --pulse-weak: rgba(var(--node-rgb, var(--sdc-led-error-rgb)), 0.16);
          --pulse-strong: rgba(var(--node-rgb, var(--sdc-led-error-rgb)), 0.30);
          box-shadow: var(--tile-shadow-active);
          animation: glowPulse 1.2s ease-in-out infinite;
        }

        .ev-node.visual-off {
          box-shadow: var(--tile-shadow-default);
        }

        @keyframes glowPulse {
          0% { box-shadow: 0 10px 20px var(--pulse-weak); }
          50% { box-shadow: 0 28px 56px var(--pulse-strong); }
          100% { box-shadow: 0 10px 20px var(--pulse-weak); }
        }

        @media (max-width: 840px) {
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
              <button
                class="status-hero tone-${this._safe(statusTone)}"
                data-action="open-settings"
                type="button"
                aria-label="Open policy and limits"
              >
                <div class="status-copy">
                  <div class="status-title">${this._safe(activeTitle)}</div>
                  <div class="status-details">${heroDetailsMarkup}</div>
                </div>
                <div class="status-action">
                  <ha-icon icon="mdi:tune-variant"></ha-icon>
                </div>
              </button>
              <div class="section-title">
                <span>Charging modes</span>
                <small>Tap to toggle</small>
              </div>
              <div class="controls home-controls primary-controls">
                ${this._controlTile({
                  entityId: this._config.schedule_switch_entity,
                  icon: "mdi:calendar-clock",
                  label: "Schedule",
                  value: scheduleValue,
                  tone: scheduleSwitchOn ? (scheduleState === "on" ? "ok" : "active") : "default",
                  state: scheduleControlState,
                })}
                ${this._controlTile({
                  entityId: this._config.force_charge_entity,
                  icon: "mdi:lightning-bolt",
                  label: "Force Charge",
                  value: forceNowValue,
                  tone: forceChargeOn ? "ok" : "default",
                  state: forceNowState,
                })}
                ${this._controlTile({
                  entityId: this._config.force_price_entity,
                  icon: "mdi:currency-eur",
                  label: "Force By Price",
                  value: forcePriceValue,
                  tone: forcePriceOn ? (priceAccepted ? "ok" : "active") : "default",
                  state: forcePriceState,
                })}
                ${this._controlTile({
                  entityId: this._config.force_timer_entity,
                  icon: "mdi:timer-sand",
                  label: "Force Timer",
                  value: forceTimerValue,
                  tone: forceTimerOn ? "ok" : "default",
                  state: forceTimerState,
                })}
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

          ${this._settingsModal(settingsControls)}
        </div>
      </ha-card>
    `;

    this._bindActions();
  }

  _bindActions() {
    for (const element of this.shadowRoot.querySelectorAll("[data-action]")) {
      element.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const { action, entity, value } = element.dataset;
        if (action === "open-settings") {
          this._openSettingsModal();
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
    }

    for (const backdrop of this.shadowRoot.querySelectorAll(".settings-backdrop")) {
      backdrop.addEventListener("click", (event) => {
        if (event.target === event.currentTarget) {
          this._closeSettingsModal();
        }
      });
    }

    for (const element of this.shadowRoot.querySelectorAll(".setting-input[data-entity]")) {
      element.addEventListener("input", (event) => {
        const entityId = event.currentTarget.dataset.entity;
        this._updateEditorDraft(entityId, event.currentTarget.value);
      });
      element.addEventListener("keydown", async (event) => {
        const entityId = event.currentTarget.dataset.entity;
        if (event.key === "Enter") {
          event.preventDefault();
          await this._saveEditor(entityId);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          this._closeEditor();
        }
      });
    }

    for (const element of this.shadowRoot.querySelectorAll(".setting-select[data-entity]")) {
      element.addEventListener("change", (event) => {
        const entityId = event.currentTarget.dataset.entity;
        this._updateEditorDraft(entityId, event.currentTarget.value);
      });
      element.addEventListener("keydown", async (event) => {
        const entityId = event.currentTarget.dataset.entity;
        if (event.key === "Enter") {
          event.preventDefault();
          await this._saveEditor(entityId);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          this._closeEditor();
        }
      });
    }
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

const existingSmartEVSEFlowCard = customElements.get("smartevse-flow-card");
if (existingSmartEVSEFlowCard) {
  for (const name of Object.getOwnPropertyNames(SmartEVSEFlowCard.prototype)) {
    if (name === "constructor") {
      continue;
    }
    Object.defineProperty(
      existingSmartEVSEFlowCard.prototype,
      name,
      Object.getOwnPropertyDescriptor(SmartEVSEFlowCard.prototype, name),
    );
  }
  for (const name of Object.getOwnPropertyNames(SmartEVSEFlowCard)) {
    if (["length", "name", "prototype"].includes(name)) {
      continue;
    }
    Object.defineProperty(
      existingSmartEVSEFlowCard,
      name,
      Object.getOwnPropertyDescriptor(SmartEVSEFlowCard, name),
    );
  }
  queueMicrotask(() => {
    const findCards = (root) => {
      const cards = [...root.querySelectorAll("smartevse-flow-card")];
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot) {
          cards.push(...findCards(element.shadowRoot));
        }
      }
      return cards;
    };
    for (const card of findCards(document)) {
      card._lastRenderKey = "";
      card._render?.();
    }
  });
} else {
  customElements.define("smartevse-flow-card", SmartEVSEFlowCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((entry) => entry.type === "smartevse-flow-card")) {
  window.customCards.push({
    type: "smartevse-flow-card",
    name: "SmartEVSE Flow Card",
    description: "Visual SmartEVSE state and current-routing card for SmartEVSE Dual Charger.",
    preview: true,
    version: CARD_VERSION,
  });
}
