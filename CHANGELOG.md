# Changelog

## 0.1.2 — 2026-10-26

- Use the shared settings cog for editing the charging plan and opening Settings, and advertise modal launchers consistently to assistive technology.
- Give duty-cycle editing a named child page with Back, X and unsaved-draft protection. Keep settings writes and late-response safeguards unchanged.
- Move charging history into its own page; a charger cost opens its history directly, while Settings opens it as a child page. Remove redundant embedded-section spacing.
- Restore focus to the actual tapped control on touch browsers even when live telemetry replaces the card markup.

Validation: typecheck, production build and 116 offline smoke checks. Browser checks cover 320px/390px widths, short landscape, light/dark presentation, protected drafts and focus return. No physical charger commands were sent.

## 0.1.1 — 2026-10-25

- Size Settings to its content instead of forcing a tall dialog with unused space. Expanded charging history still scrolls inside the bounded shared modal body.

Validation: typecheck, production build and 108 smoke checks, plus 390px mobile and short-landscape browser checks. No physical charger commands were sent.

## 0.1.0 — 2026-10-25

- Bundle the versioned `@bitosome/ha-card-ui` library instead of maintaining local copies of shared UI code. Home Assistant still loads one self-contained card resource.
- Use the shared modal flow for charging plans, settings, per-setting pages and charger details: Back returns one page, and X or Escape closes the complete flow.
- Reuse shared draft-discard confirmation, route scroll restoration, safe-area sizing, focus handling and native Home Assistant dialog handoff. Keep charging requests immutable and prevent competing writes while services are pending.
- Preserve editable values, caret position and history disclosures across live telemetry updates. Retain the existing WLED state/glow mapping and all charging service behavior.

Validation: typecheck, production build and 107 offline smoke checks covering existing charge-plan/race protections plus shared navigation, dirty drafts, focus and native-dialog handoff. No physical charger commands were sent.

## 0.0.55 — 2026-10-25

- Keep an in-flight charging plan immutable when its dialog is dismissed, reopened or replaced by settings. Stale telemetry cannot clear a requested price gate, and later commands retain the original price, duration and target entities.
- Share pending protection across charging and settings: prevent duplicate or competing writes, retain pending/error feedback after dismissal, and keep late responses from closing a newer settings view.
- Add slow-service regressions for schedule price gates, combined timer/price plans, configuration changes, settings reopening and rejected writes.

Validation: typecheck/build and 99 offline smoke cases; no physical charger commands were sent.

## 0.0.54 — 2026-10-25

- Adopt the shared Space Hub presentation primitives, token synchronization and source/hash provenance.
- Use a stable native dialog for charging plans, settings and history with one MDI X convention, safe-area margins, a fixed header and a scrollable body.
- Move charger diagnostics into a detail dialog so opening them does not shift the dashboard. Current offered remains distinct from measured current or power.
- Retain keyboard focus, input caret, history disclosures and dialog scroll position across telemetry updates.
- Protect unsaved or rejected local values with an explicit discard confirmation. A pending request can be dismissed; its status and errors remain visible on the card and reopening does not enable duplicate writes.
- Align icon targets and spacing while preserving enabled plan pills, per-charger battery/cost estimates, WLED semantics and existing capability validation.

Validation: typecheck/build and smoke regression coverage, including native dialog identity, focus return, keyboard navigation, dirty drafts, pending dismissal, duplicate prevention, charging services and cost history. Browser previews checked at 320px/390px phone widths and short landscape height. No physical charger commands were sent during validation.
