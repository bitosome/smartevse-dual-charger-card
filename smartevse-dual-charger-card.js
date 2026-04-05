const CARD_VERSION = "0.0.1";

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
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
  }

  set hass(hass) {
    this._hass = hass;
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
      "active_smartevse_raw",
      "charge_policy",
      "wled_visuals",
      "smartevse_1_name",
      "smartevse_1_battery",
      "smartevse_1_state",
      "smartevse_1_plug_state",
      "smartevse_1_mode",
      "smartevse_1_charge_current",
      "smartevse_1_max_current",
      "smartevse_1_override_current",
      "smartevse_1_error",
      "smartevse_1_session_complete",
      "smartevse_2_name",
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

  _formatDateTime(value) {
    if (!value) {
      return "n/a";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "n/a";
    }
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
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
    const name = String(attrs[`${key}_name`] || fallbackName);
    const battery = String(attrs[`${key}_battery`] ?? "").trim();
    const hasError = error && !["NONE", "None", "unknown", "unavailable"].includes(error);
    const isCharging = state === "Charging" && chargeCurrent > 0.1;
    const visual = !connected ? "off" : hasError ? "error" : isCharging ? "charging" : "idle";

    let tone = "idle";
    let badge = "Idle";
    if (!connected) {
      tone = "unplugged";
      badge = "Unplugged";
    } else if (hasError) {
      tone = "error";
      badge = "Error";
    } else if (isCharging) {
      tone = "charging";
      badge = "Charging";
    } else if (active) {
      tone = "active";
      badge = "Active";
    } else if (sessionComplete) {
      tone = "complete";
      badge = "Complete";
    }

    return {
      key,
      name,
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
      badge,
      visual,
    };
  }

  _chip(label, value, tone = "default") {
    if (value === "" || value === null || value === undefined) {
      return "";
    }
    return `
      <div class="chip chip-${tone}">
        <span class="chip-label">${this._safe(label)}</span>
        <span class="chip-value">${this._safe(value)}</span>
      </div>
    `;
  }

  _controlTile({ entityId, icon, label, value, detail, tone = "default", action = "toggle" }) {
    if (!entityId) {
      return "";
    }
    return `
      <button class="control-tile tone-${this._safe(tone)}" data-action="${this._safe(action)}" data-entity="${this._safe(entityId)}">
        <div class="control-icon"><ha-icon icon="${this._safe(icon)}"></ha-icon></div>
        <div class="control-copy">
          <div class="control-label">${this._safe(label)}</div>
          <div class="control-value">${this._safe(value)}</div>
          <div class="control-detail">${this._safe(detail)}</div>
        </div>
      </button>
    `;
  }

  _settingTile({ entityId, icon, label, value, detail }) {
    if (!entityId) {
      return "";
    }
    return `
      <button class="setting-tile" data-action="more-info" data-entity="${this._safe(entityId)}">
        <div class="setting-icon"><ha-icon icon="${this._safe(icon)}"></ha-icon></div>
        <div class="setting-copy">
          <div class="setting-label">${this._safe(label)}</div>
          <div class="setting-value">${this._safe(value)}</div>
          <div class="setting-detail">${this._safe(detail)}</div>
        </div>
      </button>
    `;
  }

  _evNode(ev) {
    const errorLine = ev.hasError
      ? `<div class="ev-error">${this._safe(ev.error)}</div>`
      : "";
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
    const smartevseTitle = ev.name || (ev.key === "smartevse_1" ? "SmartEVSE 1" : "SmartEVSE 2");
    const vehicleBattery = ev.battery || "n/a";
    const vehicleConnectorPath = this._vehicleConnectorPath();
    const vehicleNode = ev.connected
      ? `
        <div class="vehicle-link-wrap">
          <svg class="vehicle-link" viewBox="0 0 120 56" preserveAspectRatio="none" aria-hidden="true">
            <path class="pipe-base vehicle-pipe-base" d="${vehicleConnectorPath}"></path>
            <path class="pipe-active tone-${this._safe(ev.tone)} vehicle-pipe-active" d="${vehicleConnectorPath}"></path>
          </svg>
        </div>
        <section class="vehicle-node">
          <div class="vehicle-kicker">Vehicle</div>
          <div class="vehicle-title">${this._safe(ev.name)}</div>
          <div class="vehicle-charge">${this._safe(vehicleBattery)}</div>
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
              <span class="ev-pill-label">Current</span>
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
          ${errorLine}
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
    const rawEv1 = this._evData(attrs, "smartevse_1", "SmartEVSE 1");
    const rawEv2 = this._evData(attrs, "smartevse_2", "SmartEVSE 2");
    const controllerError = String(attrs.controller_error ?? "").trim();
    const activeRaw = String(attrs.active_smartevse_raw ?? "");
    const chargeAllowed = Boolean(attrs.charge_allowed);
    const price = this._numberState(this._config.price_entity);
    const acceptablePrice = this._numberState(this._config.acceptable_price_entity);
    const priceValue = price === null ? "n/a" : `${price.toFixed(3)} EUR/kWh`;
    const priceTone =
      price !== null && acceptablePrice !== null
        ? price <= acceptablePrice
          ? "ok"
          : "warn"
        : "default";

    const policy = this._state(this._config.charge_policy_entity) || this._pretty(attrs.charge_policy);
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

    const scheduleValue = scheduleSwitchOn ? (scheduleState === "on" ? "On now" : "Armed") : "Off";
    const scheduleDetail = scheduleSwitchOn
      ? scheduleState === "on"
        ? `Ends ${this._formatDateTime(scheduleNextEvent)}`
        : `Starts ${this._formatDateTime(scheduleNextEvent)}`
      : "Tap to enable";

    const forceNowValue = forceChargeOn ? (anyConnected ? "Active" : "Waiting EV") : "Off";
    const forceNowDetail = forceChargeOn ? (anyConnected ? "Charging requested now" : "Waiting for plug-in") : "Tap to start";

    const priceAccepted =
      forcePriceOn && price !== null && acceptablePrice !== null ? price <= acceptablePrice : false;
    const forcePriceValue = forcePriceOn ? (priceAccepted ? "Accepted" : anyConnected ? "Waiting" : "Waiting EV") : "Off";
    const forcePriceDetail = forcePriceOn
      ? priceAccepted
        ? `Current ${priceValue}`
        : anyConnected
          ? `Threshold ${acceptablePrice !== null ? `${acceptablePrice.toFixed(3)} EUR/kWh` : "n/a"}`
          : "Waiting for plug-in"
      : "Tap to arm";

    const forceTimerValue = forceTimerOn ? (anyConnected ? "Active" : "Waiting EV") : "Off";
    const forceTimerDetail = forceTimerOn
      ? anyConnected
        ? `Remaining ${timerLabel}`
        : "Waiting for plug-in"
      : `Duration ${this._formatMinutes(forceDuration)}`;
    const leftConnectorPath = this._homeConnectorPath("left");
    const rightConnectorPath = this._homeConnectorPath("right");

    const errorBanner =
      controllerError && !["NONE", "None", "unknown", "unavailable"].includes(controllerError)
        ? `<div class="error-banner">${this._safe(this._pretty(controllerError))}</div>`
        : "";

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          --connector-stroke: 4px;
        }

        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        ha-card {
          overflow: hidden;
          border-radius: 28px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background:
            radial-gradient(circle at top, rgba(245, 158, 11, 0.12), transparent 32%),
            radial-gradient(circle at bottom left, rgba(14, 165, 233, 0.1), transparent 28%),
            radial-gradient(circle at bottom right, rgba(20, 184, 166, 0.08), transparent 26%),
            var(--ha-card-background, var(--card-background-color));
          color: var(--primary-text-color);
        }

        .missing {
          padding: 20px;
          color: var(--error-color);
        }

        .wrap {
          padding: 18px 18px 20px;
        }

        .meta {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 12px;
        }

        .chip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(15, 23, 42, 0.04);
          backdrop-filter: blur(10px);
        }

        .chip-label {
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }

        .chip-value {
          font-size: 12px;
          font-weight: 700;
          text-align: right;
        }

        .chip-ok {
          border-color: rgba(34, 197, 94, 0.35);
          background: rgba(34, 197, 94, 0.08);
        }

        .chip-warn {
          border-color: rgba(245, 158, 11, 0.35);
          background: rgba(245, 158, 11, 0.08);
        }

        .controls {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin: 0;
        }

        .control-tile,
        .setting-tile {
          appearance: none;
          display: grid;
          grid-template-columns: 28px 1fr;
          gap: 8px;
          width: 100%;
          padding: 10px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(15, 23, 42, 0.08);
          color: inherit;
          cursor: pointer;
          font: inherit;
          text-align: left;
          transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
        }

        .control-tile:hover,
        .setting-tile:hover {
          transform: translateY(-1px);
          border-color: rgba(148, 163, 184, 0.28);
          background: rgba(15, 23, 42, 0.12);
        }

        .control-icon,
        .setting-icon {
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border-radius: 10px;
          background: rgba(255,255,255,0.06);
        }

        .control-icon ha-icon,
        .setting-icon ha-icon {
          --mdc-icon-size: 16px;
        }

        .control-copy,
        .setting-copy {
          min-width: 0;
        }

        .control-label,
        .setting-label {
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
          margin-bottom: 3px;
        }

        .control-value,
        .setting-value {
          font-size: 13px;
          font-weight: 800;
          line-height: 1.2;
          margin-bottom: 2px;
        }

        .control-detail,
        .setting-detail {
          font-size: 10px;
          line-height: 1.35;
          color: var(--secondary-text-color);
        }

        .control-tile.tone-ok {
          border-color: rgba(34, 197, 94, 0.3);
          background: rgba(34, 197, 94, 0.08);
        }

        .control-tile.tone-active {
          border-color: rgba(14, 165, 233, 0.3);
          background: rgba(14, 165, 233, 0.08);
        }

        .control-tile.tone-warn {
          border-color: rgba(245, 158, 11, 0.3);
          background: rgba(245, 158, 11, 0.08);
        }

        .flow-stage {
          border-radius: 20px;
          border: 1px solid rgba(148, 163, 184, 0.12);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.04), transparent 26%),
            rgba(2, 6, 23, 0.06);
          padding: 14px;
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
          stroke: rgba(100, 116, 139, 0.28);
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
          filter: drop-shadow(0 0 8px rgba(34, 197, 94, 0.3));
        }

        .pipe-active.tone-charging {
          stroke: #22c55e;
          filter: drop-shadow(0 0 12px rgba(34, 197, 94, 0.45));
        }

        .pipe-active.tone-active {
          stroke: #0ea5e9;
          filter: drop-shadow(0 0 12px rgba(14, 165, 233, 0.4));
        }

        .pipe-active.tone-error {
          stroke: #ef4444;
          filter: drop-shadow(0 0 12px rgba(239, 68, 68, 0.45));
        }

        @keyframes dash {
          to {
            stroke-dashoffset: -160;
          }
        }

        .house-node {
          margin: 0 auto 8px;
          width: 100%;
          padding: 14px 14px 12px;
          border-radius: 18px;
          border: 1px solid rgba(245, 158, 11, 0.32);
          background:
            radial-gradient(circle at top, rgba(245, 158, 11, 0.16), transparent 54%),
            rgba(15, 23, 42, 0.18);
          box-shadow: 0 10px 24px rgba(2, 6, 23, 0.12);
          text-align: center;
        }

        .house-summary {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
          margin-bottom: 10px;
          text-align: left;
        }

        .home-controls {
          margin-bottom: 10px;
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
          border-radius: 999px;
          border: 1px solid rgba(14, 165, 233, 0.22);
          background: rgba(15, 23, 42, 0.92);
          box-shadow: 0 8px 18px rgba(2, 6, 23, 0.18);
          white-space: nowrap;
        }

        .flow-line-badge.tone-charging {
          border-color: rgba(34, 197, 94, 0.28);
          box-shadow: 0 8px 18px rgba(34, 197, 94, 0.12);
        }

        .flow-line-badge.tone-active {
          border-color: rgba(14, 165, 233, 0.28);
          box-shadow: 0 8px 18px rgba(14, 165, 233, 0.14);
        }

        .flow-line-badge.tone-error {
          border-color: rgba(239, 68, 68, 0.28);
          box-shadow: 0 8px 18px rgba(239, 68, 68, 0.12);
        }

        .flow-line-icon {
          min-width: 8px;
          font-size: 8px;
          font-weight: 800;
          color: var(--secondary-text-color);
          line-height: 1;
          text-align: center;
        }

        .flow-line-value {
          font-size: 9px;
          font-weight: 700;
          line-height: 1;
          color: var(--primary-text-color);
        }

        .ev-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          align-items: stretch;
          margin-top: -4px;
        }

        .smartevse-stack {
          display: grid;
          gap: 8px;
          align-content: start;
        }

        .ev-node {
          border-radius: 18px;
          padding: 12px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(15, 23, 42, 0.18);
          box-shadow:
            0 8px 20px rgba(2, 6, 23, 0.1),
            0 0 0 rgba(var(--node-rgb, 148, 163, 184), 0);
          position: relative;
          overflow: hidden;
        }

        .ev-node::before {
          content: "";
          position: absolute;
          inset: -55% 0 auto 0;
          width: 100%;
          height: 70%;
          background: linear-gradient(180deg, transparent, rgba(var(--node-rgb, 148, 163, 184), 0.24), transparent);
          opacity: 0;
          pointer-events: none;
          transform: translateY(0);
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
          font-size: 8px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
          line-height: 1;
          white-space: nowrap;
        }

        .ev-meta-pills {
          display: grid;
          grid-template-columns: 1fr;
          gap: 6px;
          margin-bottom: 6px;
        }

        .ev-pill {
          position: relative;
          display: grid;
          place-items: center;
          min-width: 0;
          min-height: 28px;
          padding: 9px 7px 4px;
          border-radius: 14px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(148, 163, 184, 0.12);
          text-align: center;
        }

        .ev-pill-accent {
          border-color: rgba(14, 165, 233, 0.22);
          background: rgba(14, 165, 233, 0.1);
        }

        .ev-pill-label {
          position: absolute;
          top: 3px;
          left: 7px;
          font-size: 8px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
          line-height: 1;
        }

        .ev-pill-value {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 12px;
          font-size: 12px;
          font-weight: 700;
          min-width: 0;
          text-align: center;
          overflow-wrap: anywhere;
          line-height: 1.2;
        }

        .ev-measure-pills {
          display: grid;
          grid-template-columns: 1fr;
          gap: 6px;
        }

        .measure-pill {
          min-height: 30px;
          padding: 9px 7px 4px;
        }

        .vehicle-node {
          border-radius: 14px;
          padding: 10px 12px;
          border: 1px solid rgba(148, 163, 184, 0.14);
          background: rgba(255,255,255,0.04);
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

        .vehicle-kicker {
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
          margin-bottom: 4px;
        }

        .vehicle-title {
          font-size: 14px;
          font-weight: 800;
          line-height: 1.1;
          margin-bottom: 4px;
        }

        .vehicle-charge {
          margin-top: 8px;
          color: #dbeafe;
          font-size: 16px;
          line-height: 1.1;
          font-weight: 700;
        }

        .ev-error,
        .error-banner {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(239, 68, 68, 0.25);
          background: rgba(239, 68, 68, 0.08);
          color: #ef4444;
          font-size: 13px;
          font-weight: 700;
        }

        .error-banner {
          margin-top: 16px;
        }

        .tone-charging {
          border-color: rgba(34, 197, 94, 0.32);
          color: #22c55e;
        }

        .tone-active {
          border-color: rgba(14, 165, 233, 0.32);
          color: #0ea5e9;
        }

        .tone-idle {
          border-color: rgba(148, 163, 184, 0.22);
          color: var(--primary-text-color);
        }

        .tone-complete {
          border-color: rgba(100, 116, 139, 0.24);
          color: #94a3b8;
        }

        .tone-unplugged {
          border-color: rgba(148, 163, 184, 0.18);
          color: #94a3b8;
        }

        .tone-error {
          border-color: rgba(239, 68, 68, 0.28);
          color: #ef4444;
        }

        .ev-node.tone-charging {
          border-color: rgba(34, 197, 94, 0.32);
          background:
            radial-gradient(circle at top, rgba(34, 197, 94, 0.14), transparent 50%),
            rgba(15, 23, 42, 0.18);
        }

        .ev-node.tone-active {
          border-color: rgba(14, 165, 233, 0.32);
          background:
            radial-gradient(circle at top, rgba(14, 165, 233, 0.12), transparent 50%),
            rgba(15, 23, 42, 0.18);
        }

        .ev-node.tone-complete,
        .ev-node.tone-unplugged {
          background: rgba(15, 23, 42, 0.12);
        }

        .ev-node.visual-idle {
          border-color: rgba(0, 100, 255, 0.28);
          box-shadow:
            0 8px 20px rgba(2, 6, 23, 0.1),
            0 0 18px rgba(0, 100, 255, 0.14);
          animation: idlePulse 2.2s ease-in-out infinite;
        }

        .ev-node.visual-charging {
          border-color: rgba(0, 255, 0, 0.32);
          box-shadow:
            0 8px 20px rgba(2, 6, 23, 0.1),
            0 0 22px rgba(0, 255, 0, 0.18);
          animation: chargingPulse 1.6s ease-in-out infinite;
        }

        .ev-node.visual-charging::before {
          opacity: 1;
          animation: chargeSweep 1.8s linear infinite;
        }

        .ev-node.visual-error {
          border-color: rgba(255, 0, 0, 0.34);
          box-shadow:
            0 8px 20px rgba(2, 6, 23, 0.1),
            0 0 22px rgba(255, 0, 0, 0.2);
          animation: errorPulse 1.2s ease-in-out infinite;
        }

        .ev-node.visual-off {
          box-shadow: 0 8px 20px rgba(2, 6, 23, 0.08);
        }

        @keyframes idlePulse {
          0%, 100% {
            box-shadow:
              0 8px 20px rgba(2, 6, 23, 0.1),
              0 0 12px rgba(0, 100, 255, 0.12);
          }
          50% {
            box-shadow:
              0 8px 20px rgba(2, 6, 23, 0.12),
              0 0 24px rgba(0, 100, 255, 0.26);
          }
        }

        @keyframes chargingPulse {
          0%, 100% {
            box-shadow:
              0 8px 20px rgba(2, 6, 23, 0.1),
              0 0 16px rgba(0, 255, 0, 0.16);
          }
          50% {
            box-shadow:
              0 8px 20px rgba(2, 6, 23, 0.12),
              0 0 30px rgba(0, 255, 0, 0.3);
          }
        }

        @keyframes chargeSweep {
          from {
            transform: translateY(-110%);
          }
          to {
            transform: translateY(220%);
          }
        }

        @keyframes errorPulse {
          0%, 100% {
            box-shadow:
              0 8px 20px rgba(2, 6, 23, 0.1),
              0 0 12px rgba(255, 0, 0, 0.16);
          }
          50% {
            box-shadow:
              0 8px 20px rgba(2, 6, 23, 0.12),
              0 0 28px rgba(255, 0, 0, 0.28);
          }
        }

        @media (max-width: 840px) {
          .flow-svg {
            height: 64px;
          }

          .ev-row {
            gap: 8px;
          }

          .vehicle-title {
            font-size: 13px;
          }
        }
      </style>

      <ha-card>
        <div class="wrap">
          <div class="flow-stage">
            <section class="house-node">
              <div class="house-summary">
                ${this._chip("Price", priceValue, priceTone)}
              </div>
              <div class="controls home-controls">
                ${this._controlTile({
                  entityId: this._config.schedule_switch_entity,
                  icon: "mdi:calendar-clock",
                  label: "Schedule",
                  value: scheduleValue,
                  detail: scheduleDetail,
                  tone: scheduleSwitchOn ? (scheduleState === "on" ? "ok" : "active") : "default",
                })}
                ${this._controlTile({
                  entityId: this._config.force_charge_entity,
                  icon: "mdi:lightning-bolt",
                  label: "Force Charge",
                  value: forceNowValue,
                  detail: forceNowDetail,
                  tone: forceChargeOn ? "ok" : "default",
                })}
                ${this._controlTile({
                  entityId: this._config.force_price_entity,
                  icon: "mdi:currency-eur",
                  label: "Force By Price",
                  value: forcePriceValue,
                  detail: forcePriceDetail,
                  tone: forcePriceOn ? (priceAccepted ? "ok" : "warn") : "default",
                })}
                ${this._controlTile({
                  entityId: this._config.force_timer_entity,
                  icon: "mdi:timer-sand",
                  label: "Force Timer",
                  value: forceTimerValue,
                  detail: forceTimerDetail,
                  tone: forceTimerOn ? "ok" : "default",
                })}
                ${this._settingTile({
                  entityId: this._config.charge_policy_entity,
                  icon: "mdi:source-fork",
                  label: "Charge Policy",
                  value: policy,
                  detail: "Tap to edit",
                })}
                ${this._settingTile({
                  entityId: this._config.acceptable_price_entity,
                  icon: "mdi:cash-edit",
                  label: "Acceptable Price",
                  value: acceptablePrice !== null ? `${acceptablePrice.toFixed(3)} EUR/kWh` : "n/a",
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

          ${errorBanner}
        </div>
      </ha-card>
    `;

    this._bindActions();
  }

  _bindActions() {
    for (const element of this.shadowRoot.querySelectorAll("[data-action][data-entity]")) {
      element.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const { action, entity } = element.dataset;
        if (!entity) {
          return;
        }
        if (action === "toggle") {
          await this._toggleEntity(entity);
          return;
        }
        this._showMoreInfo(entity);
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

  _showMoreInfo(entityId) {
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId },
      }),
    );
  }
}

if (!customElements.get("smartevse-flow-card")) {
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
