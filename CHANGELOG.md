# Changelog

## 0.0.54 — 2026-10-25

- Adopt the shared Space Hub presentation primitives, token synchronization and source/hash provenance.
- Use a stable native dialog for charging plans, settings and history with one MDI X convention, safe-area margins, a fixed header and a scrollable body.
- Move charger diagnostics into a detail dialog so opening them does not shift the dashboard. Current offered remains distinct from measured current or power.
- Retain keyboard focus, input caret, history disclosures and dialog scroll position across telemetry updates.
- Protect unsaved or rejected local values with an explicit discard confirmation. A pending request can be dismissed; its status and errors remain visible on the card and reopening does not enable duplicate writes.
- Align icon targets and spacing while preserving enabled plan pills, per-charger battery/cost estimates, WLED semantics and existing capability validation.

Validation: typecheck/build and smoke regression coverage, including native dialog identity, focus return, keyboard navigation, dirty drafts, pending dismissal, duplicate prevention, charging services and cost history. Browser previews checked at 320px/390px phone widths and short landscape height. No physical charger commands were sent during validation.
