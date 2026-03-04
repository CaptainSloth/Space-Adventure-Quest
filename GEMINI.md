# GEMINI.md - Developer Notes & Audit

## 🚨 CRITICAL MANDATES
- **PROTECT Plan.md**: Never overwrite `Plan.md` with summaries. This file is 50KB+ and contains vital architecture and content docs (20+ sections).
- **SURGICAL UPDATES**: Only use `replace` to toggle checkboxes in the Phase Plan.
- **VERIFY BEFORE COMMIT**: Always ensure the file size of `Plan.md` remains large after any edit.

## Current Focus: Phase 7 — CCG Star Cards

## Status Audit: 2026-03-03

### Phase 6 — Advanced Economy & Ship Expansion (100% Verified)
- [x] Galactic Stock Market: 4 resource stocks with 5m fluctuations and ASCII charts.
- [x] Player-run Ports: owners can establish trading stations on planets for 10k credits.
- [x] Real-time charts: Historical price tracking (last 20 ticks) visualized in-engine.
- [x] Ship Expansion: Move from hardcoded ships to database-driven templates and modifiers.
- [x] Modifiers: Prefix/Suffix system (Reinforced, Stealth, Mk.II, etc) with multipliers.
- [x] Legendary Ships: Rare unique hulls (Planet Killer, Midas Touch) with tiered spawning.
- [x] Ship Capture: Boarding party mechanic added to combat for stealing disabled ships.
- [x] Admin Ship Editor: Expansive menu for managing the fleet library and building custom hulls.

### 🐛 Critical Bug Fixes
- [x] HUD Junk: Replaced fragile regex parsing with direct `HudStats` object transmission.
- [x] Trade NaN: Fixed IPC argument shift by updating preload wrapper and main handlers.
- [x] Planet Ghost-towns: Initialized planets with 500-2000 pop to allow immediate mining.
- [x] Real Reports: Swapped placeholder daily report with actual tick result data.
- [x] SQLite Syntax: Corrected single-quote usage in `datetime('now')` calls.

## Architectural Decisions
- **Unified State Sync**: All IPC handlers now return `returnSerializedScene()` to ensure cargo, stocks, and world state are never stale.
- **Dynamic Ships**: Hull definitions are now stored in `ship_templates` and `ship_modifiers` instead of engine code.
- **Tick System**: Background timer handles population growth and tax collection every 10m.
- **Admin Build Flow**: Multi-step state machine (`adminBuilder`) for complex hull commissioning.
