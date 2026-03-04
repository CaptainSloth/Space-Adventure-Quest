# GEMINI.md - Developer Notes & Audit

## 🚨 CRITICAL MANDATES
- **PROTECT Plan.md**: Never overwrite `Plan.md` with summaries. This file is 50KB+ and contains vital architecture and content docs (20+ sections).
- **SURGICAL UPDATES**: Only use `replace` to toggle checkboxes in the Phase Plan.
- **VERIFY BEFORE COMMIT**: Always ensure the file size of `Plan.md` remains large after any edit.

## Current Focus: Phase 8 — Planet Customization & Economy

## Status Audit: 2026-03-03

### Phase 7 — CCG: Star Cards (100% Verified)
- [x] Duel Engine: 3-row board system with strategic AI opponents.
- [x] Database: 40+ cards seeded with unique sci-fi effects (Hijack, Scorch, Booster).
- [x] Pack System: Buy Star Packs at the Bridge Card Shop for 500 cr.
- [x] Progression: Card Leveling (combining duplicates) and victory prizes implemented.

### Phase 8 — Planet Customization & Economy (75% Verified)
- [x] Planet Buildings: Construction Bay added with Shipyards, Defense Grids, and more.
- [x] Personalization: Owners can set custom descriptions and ASCII art for planets.
- [x] Galaxy Expansion: Deep Space (Sectors 401-500) with Black Holes and Asteroid Fields.
- [x] Space Stations: Players can establish Outposts in empty sectors for 50k cr.
- [x] Resource Nodes: Asteroid belts and gas clouds spawned for automated mining.
- [x] Supply & Demand: Port prices now fluctuate based on stock levels (Ideal: 1000).
- [x] Economy Recovery: Stocks drift back to base levels during the 10m Galactic Tick.

### 🐛 Bug Fixes
- [x] Build Error: Fixed single-quote syntax in `datetime('now')` SQL strings.
- [x] UI Clutter: Cleaned up the scene registry to prevent redundant "Star Cards" options.
- [x] Population Fix: Planets now initialize with 500-2000 pop; unassigned pool is functional.

## Architectural Decisions
- **Supply/Demand Formula**: `Price = Base * (IdealStock / CurrentStock)`.
- **Hazards**: Black Holes teleport to random sectors and damage shields.
- **Automated Mining**: Space Stations in sectors with nodes yield resources every 10 minutes.
- **Personalization**: `customDescription` and `customAscii` columns added to `planets` table.
