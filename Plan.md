# Space Adventure Quest — Plan.md

**A BBS-style multiplayer space odyssey door game**
*Inspired by TradeWars / Planets: TEOS · Built on LoAF architecture patterns*

---

## Vision

Space Adventure Quest (SAQ) is a persistent multiplayer BBS door game where players pilot ships through a galaxy of sectors, colonize planets, trade commodities, form Companies (teams), wage war, negotiate alliances, and shape the galaxy itself. Players choose to be **Alliance**, **Empire**, or **Neutral** — and the galaxy shifts around them.

The game runs in Electron + React with a monospace BBS aesthetic. Multiple players connect via separate nodes (Electron windows or network clients), and the game world is shared in real-time via a central SQLite database with change-notification IPC.

**The #1 goal: Actually fun to play.**

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Architecture Overview](#2-architecture-overview)
3. [Multiplayer & Multinode](#3-multiplayer--multinode)
4. [Core Game Loop](#4-core-game-loop)
5. [Factions & Alignment](#5-factions--alignment)
6. [Companies (Teams)](#6-companies-teams)
7. [The Galaxy — Sectors & Navigation](#7-the-galaxy--sectors--navigation)
8. [Planets](#8-planets)
9. [Ships](#9-ships)
10. [NPCs](#10-npcs)
11. [Combat](#11-combat)
12. [Trading & Economy](#12-trading--economy)
13. [CCG: Star Cards](#13-ccg-star-cards)
14. [Rankings & Leaderboards](#14-rankings--leaderboards)
15. [Sansi Color Codes](#15-sansi-color-codes)
16. [Admin Panel](#16-admin-panel)
17. [Daily Systems](#17-daily-systems)
18. [Database Schema](#18-database-schema)
19. [Scene Map](#19-scene-map)
20. [Content Data Files](#20-content-data-files)
21. [Phase Plan](#21-phase-plan)
22. [Open Questions](#22-open-questions)

---

## 1. Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Shell | Electron (Node.js) | Same as LoAF |
| UI | React + CSS | Monospace BBS aesthetic, Sansi color support |
| State | In-process engine + shared SQLite | Engine per node, DB is the source of truth |
| DB | better-sqlite3 | Local SQLite, WAL mode for concurrent readers |
| Networking | Electron IPC + file/DB polling (local) | Phase 1: local multinode. Phase 2+: optional TCP/WebSocket server |
| Lang | TypeScript | Throughout |

### Differences from LoAF

| Concern | LoAF | SAQ |
|---------|------|-----|
| Players | Single-player, one engine | Multiplayer, one engine per node, shared DB |
| State sync | N/A | DB polling + IPC broadcast for real-time events |
| Turns | Daily turn limit | Daily turn limit + real-time interactions |
| Scenes | 13 scenes | 25+ scenes |
| Content scale | 5 monsters, 15 cards | 1000+ ships, 100+ NPCs, 50+ sectors, unlimited planets |
| IPC | Synchronous | Async for multiplayer events; sync for local choices |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Electron Main Process                  │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Node 1   │  │ Node 2   │  │ Node N   │  (one per     │
│  │ Engine   │  │ Engine   │  │ Engine   │   connected    │
│  │ Instance │  │ Instance │  │ Instance │   player)      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
│       │              │              │                     │
│       └──────────────┼──────────────┘                     │
│                      │                                    │
│              ┌───────▼────────┐                           │
│              │  Shared SQLite │  (WAL mode)               │
│              │  + Event Bus   │                           │
│              └───────┬────────┘                           │
│                      │                                    │
│              ┌───────▼────────┐                           │
│              │ Content Loader │  (JSON + DB custom)       │
│              └────────────────┘                           │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Notification Service                  │  │
│  │  (DB change polling → IPC broadcast to all nodes)  │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

Each Node:
  Renderer (React) ←→ Preload IPC ←→ Engine Instance
```

### Key Architecture Decisions

1. **One engine instance per connected player** — each player has their own engine state, but all read/write the same SQLite DB
2. **DB is the source of truth** — player positions, planet ownership, inventory, combat logs all live in SQLite
3. **Event bus for real-time** — when Player A attacks Player B, an event row is inserted; Player B's engine polls for events and surfaces them
4. **Scenes remain pure functions** — same pattern as LoAF: `(state, repo, content) => ViewModel`
5. **Async IPC for multiplayer events** — unlike LoAF's fully synchronous IPC, SAQ adds async channels for push notifications (incoming attacks, messages, trade offers)

---

## 3. Multiplayer & Multinode

### Node Model

Each "node" is an Electron BrowserWindow (local) or a connected TCP client (future). Every node runs its own engine instance scoped to one logged-in player.

```
Node = {
  playerId: string;
  engine: EngineInstance;
  window: BrowserWindow;   // or TCP socket
}
```

### Real-Time Interactions

Some game features only appear when 2+ players are online simultaneously:

| Feature | Requirement | How It Works |
|---------|-------------|--------------|
| Sector chat | 2+ in same sector | Messages stored in DB `sector_messages` table, polled by engines |
| Real-time PvP | 2+ in same sector | Attacker inserts combat event; defender's engine picks it up |
| Trade offers | 2+ online | Offer row in DB; recipient sees it on next poll |
| Company comms | 2+ company members online | Company message channel |
| Multinode events | 2+ online anywhere | Special random events, galaxy-wide announcements |
| Blockade running | 2+ (attacker + traveler) | Player sets blockade on sector; others must fight or flee |

### Presence Detection

```sql
-- Engine heartbeat: each node updates every 5 seconds
UPDATE players SET lastSeen = datetime('now') WHERE id = ?;

-- "Online" = lastSeen within 15 seconds
SELECT * FROM players WHERE lastSeen > datetime('now', '-15 seconds');
```

### Event Queue

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  targetPlayerId TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'attack', 'message', 'trade_offer', 'alert', etc.
  payload TEXT NOT NULL,       -- JSON
  createdAt TEXT NOT NULL,
  readAt TEXT                  -- NULL = unread
);
```

Each engine polls `events` for its player every 2-3 seconds. Unread events trigger UI notifications.

---

## 4. Core Game Loop

### Daily Flow

```
Player logs in
  → See MOTD / daily news / planet reports
  → Check Company status (who's played today)
  → Navigate galaxy (spend turns moving between sectors)
  → At each sector:
      → Trade commodities at ports
      → Land on planets (own or neutral)
      → Encounter NPCs
      → Fight other players or NPC ships
      → Deploy mines / fighters
      → Explore unknown sectors
  → Return to base (Alliance/Empire home planet or personal planet)
  → Play Star Cards (CCG) at cantinas
  → Manage planets (set taxes, build defenses, name it)
  → Log off (turns saved for next day)
```

### Turn System

- Each player gets **N turns per day** (configurable, default 75)
- Moving between sectors costs 1 turn per hop (warp drive reduces this)
- Combat costs 1 turn per round
- Landing on a planet costs 0 turns
- Trading costs 0 turns (but you must spend turns to reach the port)
- Some actions are turn-free (chatting, checking rankings, managing inventory)

---

## 5. Factions & Alignment

### Three Factions

| Faction | Alignment | Color | Home Planet | Description |
|---------|-----------|-------|-------------|-------------|
| **The Alliance** | Good | `%2` (Green) | Terra Prime (Sector 1) | Democratic federation, defensive focus, trade bonuses |
| **The Empire** | Evil | `%1` (Red) | Fortress Krath (Sector 50) | Authoritarian regime, combat bonuses, raid bonuses |
| **Neutral** | Neutral | `%7` (White) | None (nomadic) | Independent traders/pirates, stealth bonuses |

### Alignment Mechanics

- Alignment is a **spectrum** (-1000 to +1000), not a binary choice
- Actions shift alignment:
  - Attacking Alliance players/planets → shifts toward Empire
  - Defending Alliance territory → shifts toward Alliance
  - Trading fairly → slight Alliance shift
  - Raiding planets → shifts toward Empire
  - Helping NPCs → shifts toward Alliance
  - Smuggling / black market → slight Empire shift
- At thresholds: ≥200 = Alliance member, ≤-200 = Empire member, else Neutral
- Faction membership grants access to faction home planet, faction shop, faction missions

### Faction Benefits

| Perk | Alliance | Empire | Neutral |
|------|----------|--------|---------|
| Trade bonus | +10% sell prices | — | +5% buy discount |
| Combat bonus | — | +15% weapon damage | — |
| Stealth | — | — | +20% avoid detection |
| Planet defense | +10% defense | — | — |
| Raid bonus | — | +15% plunder | — |
| Home base | Terra Prime | Fortress Krath | Any owned planet |

---

## 6. Companies (Teams)

### Structure

```
Company (max 10 players)
  ├── CEO (founder, full permissions)
  ├── Officers (invite/kick, manage treasury)
  └── Members (basic access)

Allied Companies (up to 20 players across alliances)
  └── Mutual defense pacts, shared intel, no friendly fire
```

### Company Features

| Feature | Description |
|---------|-------------|
| **Treasury** | Shared gold pool. CEO/Officers deposit/withdraw. Used for Company ships, planet purchases |
| **Company planets** | Planets owned by the Company, not individual. Revenue split among members |
| **Company fleet** | Shared ships that any member can pilot |
| **Company chat** | Private message channel |
| **Activity tracker** | See which members have played today and how many turns used |
| **Alliance pacts** | Form alliances with other Companies. Allied players can't attack each other |
| **Company missions** | Special missions requiring multiple members to complete |
| **Company rankings** | Ranked by total assets, kills, planets, trade volume |

### Company Database

```sql
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  ceoPlayerId TEXT NOT NULL,
  faction TEXT,                    -- 'alliance', 'empire', 'neutral', or NULL (mixed)
  treasury INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE company_members (
  companyId TEXT NOT NULL,
  playerId TEXT NOT NULL,
  role TEXT DEFAULT 'member',      -- 'ceo', 'officer', 'member'
  joinedAt TEXT NOT NULL,
  PRIMARY KEY (companyId, playerId)
);

CREATE TABLE company_alliances (
  companyA TEXT NOT NULL,
  companyB TEXT NOT NULL,
  formedAt TEXT NOT NULL,
  PRIMARY KEY (companyA, companyB)
);
```

---

## 7. The Galaxy — Sectors & Navigation

### Galaxy Structure

The galaxy is a **graph of sectors** connected by warps. Default galaxy: 500 sectors (configurable 100–5000).

```
Sector = {
  id: number;                    // 1–500
  name?: string;                 // optional custom name
  type: SectorType;              // 'normal', 'nebula', 'asteroid_field', 'black_hole', 'station', 'home_alliance', 'home_empire'
  warps: number[];               // connected sector IDs (2–6 connections)
  planets: Planet[];             // 0–5 planets per sector
  port?: Port;                   // trading port (if present)
  hazard?: Hazard;               // environmental hazard
  mines: Mine[];                 // player-deployed mines
  fighters: Fighter[];           // player-deployed fighter drones
}
```

### Navigation

- **Warp drive**: move to an adjacent sector (1 turn per hop)
- **Transwarp**: jump to any explored sector (costs fuel + 1 turn)
- **Autopilot**: set a destination, engine calculates shortest path, auto-move (costs turns)
- **Sector scan**: see what's in adjacent sectors without moving (0 turns)
- **Galaxy map**: ASCII art showing explored sectors and connections

### Sector Types

| Type | Effect |
|------|--------|
| Normal | No special effects |
| Nebula | Sensors reduced, stealth +50%, navigation hazard |
| Asteroid Field | Mining possible, navigation damage risk |
| Black Hole | One-way warp, random destination, high risk/reward |
| Station | Safe zone, trading, repair, cantina |
| Home (Alliance) | Terra Prime, Alliance members only |
| Home (Empire) | Fortress Krath, Empire members only |

### Galaxy Generation

Procedural generation with constraints:
1. Alliance home always Sector 1, Empire home always Sector 500 (or max)
2. Each sector has 2–6 warp connections (graph is fully connected)
3. Ports placed in ~40% of sectors
4. Nebulae, asteroid fields, black holes placed randomly (~15% each)
5. Stations at key crossroads (~5%)

---

## 8. Planets

### Planet Ownership

Any player or Company can claim an unowned planet. Owned planets generate daily income and can be customized.

```
Planet = {
  id: string;
  sectorId: number;
  name: string;                      // customizable by owner
  ownerId?: string;                  // player or company ID
  ownerType?: 'player' | 'company';
  type: PlanetType;                  // 'terran', 'volcanic', 'ice', 'gas_giant', 'desert', 'ocean', 'barren'
  population: number;                // grows daily, generates taxes
  maxPopulation: number;
  credits: number;                   // stored credits from taxes
  fighters: number;                  // defense fighters
  shields: number;                   // 0–100%
  mines: { ore: number, fuel: number, equipment: number };
  buildings: Building[];
  customDescription?: string;        // owner's custom text
  customAscii?: string[];            // owner's custom ASCII art (≤8 lines)
  landingMessage?: string;           // shown to visitors
  taxRate: number;                   // 0–50%
  accessPolicy: 'open' | 'faction' | 'company' | 'locked';
}
```

### Planet Types

| Type | Pop. Cap | Mining | Special |
|------|----------|--------|---------|
| Terran | High | Balanced | Best for colonization |
| Volcanic | Low | Ore ++ | Equipment crafting bonus |
| Ice | Medium | Fuel ++ | Research bonus |
| Gas Giant | None | Fuel +++ | Fuel depot only |
| Desert | Low | Ore + | Cheap to defend |
| Ocean | Medium | None | Food production, pop growth ++ |
| Barren | Very Low | Ore + | Cheap to claim |

### Planet Customization

Owners can:
- Rename the planet
- Set a custom landing message
- Set access policy (open/faction/company/locked)
- Set tax rate (applied to traders using the planet's port)
- Build structures (shipyard, defense grid, sensor array, cantina, etc.)
- Write a custom description
- Set custom ASCII art for the planet display
- Deploy defense fighters and shields

### Daily Planet Reports

Each day, planet owners receive a report:
```
╔══════════════════════════════════════╗
║  DAILY REPORT — New Tortuga         ║
╠══════════════════════════════════════╣
║  Population: 12,450 (+320)          ║
║  Tax Revenue: 1,245 credits         ║
║  Mining Output: 50 ore, 30 fuel     ║
║  Visitors: 3 (TradeMaster, Zyx...)  ║
║  Attacks: 0                         ║
║  News: A trade fleet arrived from   ║
║        Sector 12.                   ║
╚══════════════════════════════════════╝
```

---

## 9. Ships

### Ship System

Ships are the player's primary asset. There are **thousands of ship types** organized into tiers/classes.

### Ship Classes (Tiers)

| Tier | Class | Example Ships | Holds | Shields | Weapons | Speed |
|------|-------|--------------|-------|---------|---------|-------|
| 1 | Scout | Wasp, Dart, Probe | 5–15 | 10–30 | 1–2 | Fast |
| 2 | Trader | Hauler, Freighter, Merchantman | 30–75 | 20–50 | 1–3 | Medium |
| 3 | Frigate | Falcon, Corsair, Interceptor | 15–30 | 50–100 | 3–5 | Fast |
| 4 | Cruiser | Warhawk, Battlecruiser, Dreadnought | 20–50 | 100–250 | 5–8 | Medium |
| 5 | Capital | Titan, Leviathan, Fortress | 50–200 | 200–500 | 8–15 | Slow |
| 6 | Legendary | Planet Killer, Ghost Ship, Ark | Special | Special | Special | Varies |

### Ship Definition

```typescript
type ShipDef = {
  id: string;
  name: string;
  class: ShipClass;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  holds: number;              // cargo capacity
  maxShields: number;
  maxFighters: number;        // fighter bay capacity
  weaponSlots: number;
  speed: number;              // sectors per turn with warp drive
  fuelCapacity: number;
  transwarp: boolean;         // can transwarp jump?
  cloak: boolean;             // has cloaking device?
  specialAbility?: string;    // unique per-ship ability
  cost: number;
  factionReq?: 'alliance' | 'empire' | 'neutral';
  description: string;
  ascii: string[];            // 5-line ASCII art
};
```

### Generating Thousands of Ships

Ships are defined by a **generation system** that combines:
1. **Base templates** (50–100 hand-crafted archetypes in JSON)
2. **Modifiers** (prefix/suffix system): "Reinforced Scout", "Stealth Frigate", "Heavy Warhawk Mk.III"
3. **Stat variation**: each modifier adjusts base stats (±10–30%)
4. **Procedural naming**: combine prefixes, roots, and suffixes

This means 100 base templates × 10+ modifiers × 3 variants = **3,000+ unique ship configurations**, but each is deterministic and reproducible from its ID.

```typescript
// Example generation
const base = shipTemplates.find(t => t.id === "scout_wasp");
const modifier = modifiers.find(m => m.id === "reinforced");
const result = applyModifier(base, modifier);
// → "Reinforced Wasp": holds=8 (was 5), shields=45 (was 30), cost=+40%
```

### Ship Upgrades

Players can upgrade individual components:
- **Weapons**: Laser → Plasma → Disruptor → Quantum
- **Shields**: Basic → Reinforced → Adaptive → Phase
- **Engine**: Standard → Enhanced → Warp → Transwarp
- **Special**: Cloak, Scanner, Mine Layer, Tractor Beam

---

## 10. NPCs

### Smart NPC System

NPCs are persistent characters with memory, personality, and dynamic behavior.

```typescript
type NpcDef = {
  id: string;
  name: string;
  title?: string;                    // "the Merchant", "Admiral of Sector 7"
  faction: 'alliance' | 'empire' | 'neutral';
  personality: {
    friendliness: number;            // -100 to 100
    greed: number;                   // 0 to 100
    aggression: number;              // 0 to 100
    humor: number;                   // 0 to 100
  };
  likes: string[];                   // "traders", "alliance_members", "brave_pilots"
  dislikes: string[];                // "pirates", "empire_members", "cowards"
  dialogueTree: DialogueNode[];      // custom dialogue options
  shipId?: string;                   // NPC's ship (for combat NPCs)
  sectorId?: number;                 // where they hang out
  scheduleType: 'stationary' | 'patrol' | 'wanderer';
  ascii: string[];                   // portrait
  description: string;
};
```

### NPC Memory

NPCs remember every encounter with every player:

```sql
CREATE TABLE npc_memories (
  id INTEGER PRIMARY KEY,
  npcId TEXT NOT NULL,
  playerId TEXT NOT NULL,
  encounterType TEXT NOT NULL,      -- 'trade', 'combat', 'dialogue', 'quest', 'betrayal'
  sentiment INTEGER NOT NULL,       -- -100 to +100 shift
  details TEXT,                     -- JSON: what happened
  createdAt TEXT NOT NULL
);
```

**How memory affects behavior:**
- NPC who remembers you helping them → better prices, unique quests, tips
- NPC who remembers you attacking them → hostile, refuses trade, may ambush
- NPC who remembers multiple encounters → references past events in dialogue
- Sentiment accumulates: each encounter shifts the NPC's opinion of that specific player

### NPC Dialogue Example

```
┌─────────────────────────────────────┐
│  Captain Vex — The Smuggler         │
│  ╭──────────╮                       │
│  │ >(•_•)>  │                       │
│  │  |/ |\   │                       │
│  ╰──────────╯                       │
│                                     │
│  "Well, well... if it isn't the     │
│  pilot who saved my hide in the     │
│  Nebula last week. What brings you  │
│  to this dusty corner of space?"    │
│                                     │
│  1) Ask about trade routes          │
│  2) Ask about rumors                │
│  3) Challenge to a card game        │
│  4) "Just passing through."         │
└─────────────────────────────────────┘
```

### Key NPCs (Starting Roster)

| NPC | Role | Location | Personality |
|-----|------|----------|-------------|
| Admiral Chen | Alliance Commander | Terra Prime | Stern, honorable, tactical |
| Warlord Krath | Empire Leader | Fortress Krath | Ruthless, cunning, ambitious |
| Captain Vex | Smuggler | Wanderer | Sly, humorous, greedy |
| Dr. Lyra | Scientist | Station Omega | Curious, helpful, quirky |
| The Broker | Black Market Dealer | Hidden sector | Secretive, expensive, resourceful |
| Old Zephyr | Retired Admiral | Cantina (various) | Wise, nostalgic, card master |
| Scrapjaw | Pirate King | Asteroid Field | Aggressive, honorable (to pirates) |

---

## 11. Combat

### Ship-to-Ship Combat

```
Combat Flow:
  1. Encounter (random, PvP, blockade, NPC)
  2. Pre-combat: scan opponent (see ship class, shields, faction)
  3. Choose: Fight / Flee / Hail / Surrender
  4. If fight:
     a. Both sides roll initiative (speed + RNG)
     b. Attacker fires weapons → damage = (weaponPower - targetShields%) + RNG
     c. Defender retaliates
     d. Repeat until one side is destroyed, flees, or surrenders
  5. Post-combat:
     - Victor loots cargo, credits, possible ship capture
     - Loser respawns at home base with starter ship (or is rescued by company)
     - Alignment shifts based on who attacked whom
```

### Combat Modifiers

| Factor | Effect |
|--------|--------|
| Ship speed | Determines initiative and flee chance |
| Cloaking | First-strike advantage, opponent can't scan |
| Fighters | Deployed as autonomous damage dealers |
| Mines | Triggered on sector entry, damage before combat starts |
| Nebula | All accuracy reduced 30% |
| Asteroid field | Random hull damage each round |
| Company backup | Allied players in sector can join the fight |

### PvP Rules

- Players cannot attack members of their own Company or allied Companies
- Attacking a player in a safe zone (station, home planet) is forbidden
- Attacking a much weaker player (3+ tiers below your ship) gives minimal rewards and heavy alignment penalty
- Players can set a "flee threshold" (auto-flee at X% shields)

---

## 12. Trading & Economy

### Commodities

| Commodity | Common Sources | High Demand At |
|-----------|---------------|----------------|
| Ore | Asteroid fields, volcanic planets | Stations, terran planets |
| Fuel | Gas giants, ice planets | Everywhere (ship fuel) |
| Equipment | Stations, terran planets | Frontier sectors |
| Organics | Ocean planets, terran planets | Desert/barren planets |
| Luxury Goods | Stations | Remote sectors (high markup) |
| Contraband | Black market, pirate NPCs | Anywhere (risky, high profit) |

### Port Trading

```
Port Types:
  Type 1 (BBS): Buys Ore, Sells Equipment
  Type 2 (BSB): Buys Equipment, Sells Ore
  Type 3 (SBB): Sells Ore, Sells Equipment, Buys Fuel
  Type 4 (BBB): Buys everything (consumer world)
  Type 5 (SSS): Sells everything (producer world)
  Type 6 (Special): Black market, rare goods
  Type 7 (SSB): Sells Ore, Sells Equipment, Buys Organics
  Type 8 (BBS): Buys Organics, Buys Fuel, Sells Luxury
```

### Price Mechanics

- Prices fluctuate based on supply/demand per port
- Buying from a port reduces its stock → price goes up
- Selling to a port increases its stock → price goes down
- Prices reset partially each day
- Players with Trade skill (Alliance bonus) get better prices
- Contraband trading: high profit but if scanned by Alliance patrols → combat + alignment penalty

### Trade Routes

Smart players find profitable loops: buy low at Port A, sell high at Port B, repeat. The game tracks "trade route efficiency" for rankings.

---

## 13. CCG: Star Cards

### Overview

A space-themed collectible card game played at cantinas (stations, planets, inn equivalents). Based on the Gwent-style duel system from LoAF but expanded for the space theme.

### Card Types

| Type | Description |
|------|-------------|
| **Ship Cards** | Power cards representing ships (like Gwent unit cards) |
| **Crew Cards** | Modifier cards that buff ships or debuff opponents |
| **Event Cards** | One-shot effects (scorch, fog, horn equivalents) |
| **Planet Cards** | Placed in a row, provide ongoing effects |
| **Legendary Cards** | Unique powerful cards (one per deck) |

### Rows

| Row | Theme |
|-----|-------|
| **Vanguard** | Close-range ships (melee equivalent) |
| **Fleet** | Main battle group (ranged equivalent) |
| **Support** | Long-range / special ships (siege equivalent — third row!) |

### Card Effects (Expanded from LoAF)

| Effect | Description |
|--------|-------------|
| spy | Card goes to opponent's field; you draw 2 |
| scorch | Destroy highest-power opposing card |
| fog | Reduce all cards in one row to power 1 |
| horn | Double power of all cards in one row |
| medic | Revive a card from discard |
| decoy | Return a played card to your hand |
| draw | Draw extra card(s) |
| rally | +1 bonus per card played |
| **shield** | Protect a card from scorch/fog (NEW) |
| **hack** | Steal an opponent's card for one round (NEW) |
| **warp** | Move a card to a different row (NEW) |
| **overload** | Sacrifice a card to deal its power as damage to a specific card (NEW) |
| **commander** | Buffs all cards of the same faction in your field (NEW) |

### Card Acquisition

- Defeat NPCs in card games at cantinas
- Win cards as combat loot (rare)
- Buy from card merchants at stations
- Company reward cards
- Faction-exclusive cards (Alliance/Empire themed)
- Legendary cards from boss NPCs or special quests

### Card Duel Stakes

| Venue | Entry Fee | Reward | Risk |
|-------|-----------|--------|------|
| Station Cantina | Free | Small credits + common card | None |
| Planet Cantina | 50 credits | Good credits + uncommon card | Lose entry fee |
| Underground | 200 credits | Great credits + rare card | Lose entry + a card |
| Championship | 1000 credits | Huge credits + legendary card | Lose entry + 3 cards |

---

## 14. Rankings & Leaderboards

### Individual Rankings

| Category | Metric |
|----------|--------|
| **Net Worth** | Credits + ship value + planet value + cargo value |
| **Combat** | PvP kills, NPC kills, combat rating |
| **Trading** | Total trade volume, profit efficiency |
| **Exploration** | Sectors explored, planets discovered |
| **Cards** | Duel wins, rare cards owned, deck rating |
| **Alignment** | Highest Alliance / Empire score |
| **Turns Played** | Total lifetime turns used |
| **Bounties** | Bounties completed |

### Company Rankings

| Category | Metric |
|----------|--------|
| **Total Assets** | Sum of all member net worth + treasury + company planets |
| **Military Power** | Combined fleet strength |
| **Territory** | Number of owned planets + sectors controlled |
| **Trade Volume** | Combined trade profits |

### Display

```
╔══════════════════════════════════════╗
║  `%2SPACE ADVENTURE QUEST`%7 RANKINGS   ║
╠══════════════════════════════════════╣
║  TOP PILOTS BY NET WORTH             ║
║  ─────────────────────────            ║
║  1. `%2StarTrader`%7     2,450,000 cr   ║
║  2. `%1DarkReaper`%7     1,890,000 cr   ║
║  3. `%7NomadX`%7         1,234,000 cr   ║
║  4. `%2BlueStar`%7         987,000 cr   ║
║  5. `%1Krath Jr.`%7        876,000 cr   ║
╚══════════════════════════════════════╝
```

---

## 15. Sansi Color Codes

BBS-style inline color codes for all text output. Parsed by the renderer into CSS classes.

### Syntax

```
%0  — Black         %8  — Dark Gray
%1  — Red           %9  — Light Red
%2  — Green         %a  — Light Green
%3  — Yellow        %b  — Light Yellow
%4  — Blue          %c  — Light Blue
%5  — Magenta       %d  — Light Magenta
%6  — Cyan          %e  — Light Cyan
%7  — White         %f  — Bright White

`   — Toggle bold
~   — Toggle blink (slow pulse in CSS)
```

### Examples

```
`%2Welcome`%7 to `%eSpace Adventure Quest`%7!
%1WARNING:%7 Shields critical!
`%bYou earned 500 credits!`%7
```

### Renderer Implementation

```typescript
// Parse Sansi codes into React spans with CSS classes
function parseSansi(text: string): JSX.Element[] {
  // Split on %X and ` tokens
  // Map to <span className="sansi-2 sansi-bold">text</span>
}
```

```css
.sansi-0 { color: #000000; }
.sansi-1 { color: #aa0000; }
.sansi-2 { color: #00aa00; }
/* ... etc ... */
.sansi-bold { font-weight: bold; }
.sansi-blink { animation: blink 1.5s ease-in-out infinite; }
```

---

## 16. Admin Panel

### Admin Scenes

| Section | Features |
|---------|----------|
| **Players** | List/edit/delete players. Edit credits, alignment, faction, ship, stats. Ban/unban. Force-reset turns. |
| **World** | MOTD, galaxy size, turn limit, daily reset time, game speed multiplier |
| **Ships** | Ship editor: create/edit/delete ship definitions. Preview ASCII art. Stat balancing tools |
| **NPCs** | NPC editor: create/edit/delete NPCs. Set personality, dialogue, likes/dislikes, location, ship |
| **Planets** | Planet editor: reassign ownership, set type, population, resources. Create custom planets |
| **Galaxy** | Regenerate galaxy, add/remove sectors, edit warp connections, place ports |
| **Economy** | Set base prices, inflation rate, daily price reset %. View trade volume reports |
| **Cards** | Card editor: create/edit/delete card definitions. Set stats, effects, drop tables |
| **Events** | View event log, send global announcements, trigger special events |
| **Rankings** | View all rankings, reset rankings, award custom titles |
| **Companies** | View/edit companies, dissolve companies, reassign CEO |

### Admin Access

```sql
-- Admin flag on players table
ALTER TABLE players ADD COLUMN isAdmin BOOLEAN DEFAULT FALSE;
```

Admin scene is accessible only if `player.isAdmin === true`. First player created is auto-admin (like LoAF).

---

## 17. Daily Systems

### Daily Reset (configurable time, default midnight UTC)

1. **Turn refresh**: All players get their daily turn allotment
2. **Planet production**: Planets generate credits, mining output, population growth
3. **Planet reports**: Generate and store daily report for each owned planet
4. **Price normalization**: Port prices drift back toward base values
5. **NPC movement**: Wandering NPCs move to new sectors
6. **Bounty refresh**: New daily bounties generated
7. **News generation**: Galaxy news based on yesterday's events (biggest battle, most active trader, etc.)
8. **Maintenance**: Unmanned fighters/mines decay by 5%

### Daily News

Auto-generated from event log:
```
╔══════════════════════════════════════╗
║  GALACTIC NEWS — Day 47              ║
╠══════════════════════════════════════╣
║  • DarkReaper destroyed 3 Alliance   ║
║    ships in Sector 23                ║
║  • StarTrader's planet "Haven" grew  ║
║    to 50,000 population              ║
║  • New trade route discovered in     ║
║    the Outer Rim                     ║
║  • The Alliance repelled an Empire   ║
║    attack on Sector 12               ║
╚══════════════════════════════════════╝
```

---

## 18. Database Schema

### Core Tables

```sql
-- Players
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  faction TEXT DEFAULT 'neutral',     -- 'alliance', 'empire', 'neutral'
  alignment INTEGER DEFAULT 0,        -- -1000 to 1000
  credits INTEGER DEFAULT 1000,
  turns INTEGER DEFAULT 75,
  maxTurns INTEGER DEFAULT 75,
  shipId TEXT,                         -- current ship definition ID
  sectorId INTEGER DEFAULT 1,         -- current location
  hp INTEGER,                          -- personal HP (for boarding/ground combat)
  maxHp INTEGER,
  shields INTEGER,                     -- current ship shields
  experience INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  kills INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0,
  tradingVolume INTEGER DEFAULT 0,
  sectorsExplored TEXT DEFAULT '[]',   -- JSON array of sector IDs
  lastResetAt TEXT,
  lastSeen TEXT,                       -- heartbeat for online detection
  isAdmin BOOLEAN DEFAULT FALSE,
  companyId TEXT,
  deck TEXT DEFAULT '[]',              -- CCG deck (JSON array of card IDs)
  createdAt TEXT NOT NULL
);

-- Ships (player's current ship state, not the definition)
CREATE TABLE player_ships (
  id INTEGER PRIMARY KEY,
  playerId TEXT NOT NULL,
  shipDefId TEXT NOT NULL,            -- references ship definition
  name TEXT,                           -- player's custom ship name
  shields INTEGER,
  maxShields INTEGER,
  fighters INTEGER,
  holds INTEGER,
  fuel INTEGER,
  maxFuel INTEGER,
  weaponLevel INTEGER DEFAULT 1,
  shieldLevel INTEGER DEFAULT 1,
  engineLevel INTEGER DEFAULT 1,
  cloak BOOLEAN DEFAULT FALSE,
  transwarp BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (playerId) REFERENCES players(id)
);

-- Cargo
CREATE TABLE player_cargo (
  id INTEGER PRIMARY KEY,
  playerId TEXT NOT NULL,
  commodity TEXT NOT NULL,            -- 'ore', 'fuel', 'equipment', 'organics', 'luxury', 'contraband'
  quantity INTEGER DEFAULT 0,
  UNIQUE(playerId, commodity)
);

-- Planets
CREATE TABLE planets (
  id TEXT PRIMARY KEY,
  sectorId INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  ownerId TEXT,
  ownerType TEXT,                     -- 'player' or 'company'
  population INTEGER DEFAULT 0,
  maxPopulation INTEGER DEFAULT 10000,
  credits INTEGER DEFAULT 0,
  fighters INTEGER DEFAULT 0,
  shields INTEGER DEFAULT 0,
  oreMiners INTEGER DEFAULT 0,
  fuelMiners INTEGER DEFAULT 0,
  equipmentMiners INTEGER DEFAULT 0,
  taxRate REAL DEFAULT 0.10,
  accessPolicy TEXT DEFAULT 'open',
  customDescription TEXT,
  customAscii TEXT,                    -- JSON string[]
  landingMessage TEXT,
  createdAt TEXT NOT NULL
);

-- Sectors
CREATE TABLE sectors (
  id INTEGER PRIMARY KEY,
  name TEXT,
  type TEXT DEFAULT 'normal',
  warps TEXT NOT NULL,                -- JSON array of connected sector IDs
  portType INTEGER,                   -- NULL if no port
  portInventory TEXT,                 -- JSON: { ore: N, fuel: N, equipment: N, ... }
  portPrices TEXT,                    -- JSON: { ore: N, fuel: N, ... }
  hazard TEXT                         -- NULL or hazard type
);

-- Mines & Fighters (deployed in sectors)
CREATE TABLE sector_deployments (
  id INTEGER PRIMARY KEY,
  sectorId INTEGER NOT NULL,
  playerId TEXT NOT NULL,
  type TEXT NOT NULL,                 -- 'mine' or 'fighter'
  quantity INTEGER DEFAULT 1,
  deployedAt TEXT NOT NULL
);

-- NPCs
CREATE TABLE npcs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT,
  faction TEXT,
  personality TEXT NOT NULL,          -- JSON: { friendliness, greed, aggression, humor }
  likes TEXT DEFAULT '[]',            -- JSON array
  dislikes TEXT DEFAULT '[]',         -- JSON array
  dialogueTree TEXT DEFAULT '[]',     -- JSON
  shipId TEXT,
  sectorId INTEGER,
  scheduleType TEXT DEFAULT 'stationary',
  ascii TEXT DEFAULT '[]',            -- JSON string[]
  description TEXT,
  isCustom BOOLEAN DEFAULT FALSE
);

-- NPC Memory
CREATE TABLE npc_memories (
  id INTEGER PRIMARY KEY,
  npcId TEXT NOT NULL,
  playerId TEXT NOT NULL,
  encounterType TEXT NOT NULL,
  sentiment INTEGER NOT NULL,
  details TEXT,
  createdAt TEXT NOT NULL
);

-- Events / Messages
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  targetPlayerId TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  readAt TEXT
);

-- Companies (see section 6)
-- company_members (see section 6)
-- company_alliances (see section 6)

-- CCG Cards (player inventory)
CREATE TABLE player_cards (
  id INTEGER PRIMARY KEY,
  playerId TEXT NOT NULL,
  cardDefId TEXT NOT NULL,
  acquiredAt TEXT NOT NULL
);

-- Bounties
CREATE TABLE bounties (
  id INTEGER PRIMARY KEY,
  playerId TEXT NOT NULL,
  day TEXT NOT NULL,
  type TEXT NOT NULL,
  target TEXT,
  targetName TEXT,
  required INTEGER NOT NULL,
  progress INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  rewardCredits INTEGER,
  rewardXp INTEGER
);

-- Planet Daily Reports
CREATE TABLE planet_reports (
  id INTEGER PRIMARY KEY,
  planetId TEXT NOT NULL,
  day TEXT NOT NULL,
  report TEXT NOT NULL,               -- JSON report data
  createdAt TEXT NOT NULL
);

-- Sector Messages (real-time chat)
CREATE TABLE sector_messages (
  id INTEGER PRIMARY KEY,
  sectorId INTEGER NOT NULL,
  playerId TEXT NOT NULL,
  message TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

-- World Settings
CREATE TABLE world_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Galaxy generation seed
-- INSERT INTO world_settings VALUES ('galaxy_seed', '...');
```

---

## 19. Scene Map

```
title
  └─→ login / create_character
        └─→ bridge (main hub - replaces "town")
              ├─→ navigation (galaxy map, move between sectors)
              │     ├─→ sector_view (see what's in current sector)
              │     ├─→ combat (PvP or NPC ship combat)
              │     └─→ scan (scan adjacent sectors)
              ├─→ planet_surface (land on a planet)
              │     ├─→ planet_manage (owner controls)
              │     ├─→ planet_trade (if planet has port)
              │     └─→ planet_cantina (card games, NPCs)
              ├─→ port (trade at sector port)
              ├─→ station (if in station sector)
              │     ├─→ shipyard (buy/sell/upgrade ships)
              │     ├─→ cantina (NPCs, card games, rumors)
              │     └─→ station_services (repair, refuel)
              ├─→ inventory (cargo, ship status, equipment)
              ├─→ company (team management)
              │     ├─→ company_create
              │     ├─→ company_manage
              │     └─→ company_chat
              ├─→ rankings (leaderboards)
              ├─→ bounty_board (daily missions)
              ├─→ card_collection (CCG deck management)
              ├─→ card_duel (Gwent-style duel)
              ├─→ messages (inbox, sector chat)
              ├─→ npc_dialogue (talking to an NPC)
              ├─→ faction_hq (Alliance/Empire home base features)
              └─→ admin (admin panel)
                    ├─→ admin_players
                    ├─→ admin_world
                    ├─→ admin_ships
                    ├─→ admin_npcs
                    ├─→ admin_planets
                    ├─→ admin_galaxy
                    ├─→ admin_economy
                    ├─→ admin_cards
                    └─→ admin_events
```

**SceneId union:**
```typescript
type SceneId =
  | "title" | "login" | "create_character"
  | "bridge" | "navigation" | "sector_view" | "scan"
  | "combat" | "planet_surface" | "planet_manage" | "planet_trade" | "planet_cantina"
  | "port" | "station" | "shipyard" | "cantina" | "station_services"
  | "inventory" | "company" | "company_create" | "company_manage" | "company_chat"
  | "rankings" | "bounty_board" | "card_collection" | "card_duel"
  | "messages" | "npc_dialogue" | "faction_hq"
  | "admin" | "admin_players" | "admin_world" | "admin_ships" | "admin_npcs"
  | "admin_planets" | "admin_galaxy" | "admin_economy" | "admin_cards" | "admin_events";
```

---

## 20. Content Data Files

```
content/base/
  ├── ships.json              # 50–100 base ship templates
  ├── ship_modifiers.json     # 30+ modifiers (prefix/suffix stats)
  ├── npcs.json               # 20+ base NPCs with dialogue trees
  ├── cards.json              # 40+ CCG card definitions
  ├── commodities.json        # 6 commodity types with base prices
  ├── buildings.json          # Planet building definitions
  ├── bounties.json           # Bounty templates
  ├── sector_types.json       # Sector type definitions & hazards
  ├── planet_types.json       # Planet type stat templates
  ├── events.json             # Random event templates
  ├── factions.json           # Faction definitions & perks
  └── galaxy_config.json      # Default galaxy generation parameters
```

---

## 21. Phase Plan

### Phase 1 — Foundation (Single-Player Core)
> Get the basic game working with one player

- [x] Project scaffolding (Electron + React + Vite + TypeScript + better-sqlite3)
- [x] Sansi color code parser + renderer
- [x] Core engine architecture (state machine, scene system, choose loop)
- [x] Database schema (players, sectors, ships, planets)
- [x] Title screen + character creation (name, faction choice)
- [x] Bridge scene (main hub)
- [x] Galaxy generation (procedural sector graph)
- [x] Navigation (move between sectors, turn cost, sector scan)
- [x] Basic ship system (3–5 starter ships, buy/sell)
- [x] Port trading (buy/sell commodities, price fluctuation)
- [x] Basic NPC encounters (2–3 NPCs with dialogue)

### Phase 2 — Combat & Planets
> Make space dangerous and give players something to own

- [x] Ship-to-ship combat (NPC enemies)
- [x] Ship upgrades (weapons, shields, engine)
- [x] Planet landing & colonization
- [x] Planet management (naming, taxes, access policy)
- [x] Death & respawn system
- [x] Alignment system (faction shifts from actions)
- [x] Admin section (for testing and resets)
- [x] Planet daily reports (basic)
- [x] Mine & fighter deployment in sectors
- [x] Bounty board (daily missions)
- [x] Basic rankings (net worth, kills, trading)

### Phase 3 — Multiplayer Core
> Multiple players in the same galaxy

- [x] Multi-engine node architecture (one engine per player)
- [x] SQLite WAL mode for concurrent access
- [x] Player presence detection (heartbeat)
- [x] Event queue system (async notifications)
- [x] PvP combat
- [x] Sector chat
- [x] Player scanning (see other players in sector)
- [x] Multinode-only events (appear when 2+ players online)
- [x] Blockade mechanics

### Phase 4 — Companies & Alliances
> Team play and social features

- [x] Company creation & management
- [x] Company treasury & shared assets
- [x] Company chat
- [x] Alliance pacts between Companies
- [x] Activity tracker (see who's played today)
- [x] Company rankings
- [x] Company missions (require multiple members)
- [x] Faction HQ scenes (Alliance/Empire home bases)

### Phase 5 — Smart NPCs
> NPCs that feel alive

- [x] NPC memory system (per-player sentiment tracking)
- [x] Dynamic NPC dialogue (references past encounters)
- [x] NPC schedules (patrol, wander, stationary)
- [x] NPC traders with personality-based pricing
- [x] NPC quest givers
- [x] NPC combat opponents with varied AI
- [x] Admin NPC editor

### Phase 6 — Ship Expansion
> Thousands of ships

- [ ] Ship modifier/generation system (prefix + base + suffix)
- [ ] Full ship template library (50–100 base templates)
- [ ] Ship modifier library (30+ modifiers)
- [ ] Legendary ships (unique, one-per-galaxy)
- [ ] Ship capture mechanic (board and steal opponent's ship)
- [ ] Admin ship editor

### Phase 7 — CCG: Star Cards
> Full card game system

- [ ] Card definitions (40+ cards, 3 rows)
- [ ] Duel engine (extended from LoAF's Gwent system)
- [ ] New effects (shield, hack, warp, overload, commander)
- [ ] Card acquisition (drops, merchants, prizes)
- [ ] Deck management (collection view, deck builder)
- [ ] Cantina scenes (duel venues with varying stakes)
- [ ] NPC card duel opponents with AI tiers
- [ ] Admin card editor

### Phase 8 — Planet Customization & Economy
> Deep planet management and economy tuning

- [ ] Planet buildings (shipyard, defense grid, sensor array, cantina, etc.)
- [ ] Planet custom ASCII art & descriptions
- [ ] Advanced economy (supply/demand curves, inflation, trade route optimization)
- [ ] Contraband/smuggling system
- [ ] Black market locations
- [ ] Daily news generation (auto-summary of galaxy events)

### Phase 9 — Admin Expansion
> Full game management tools

- [ ] Complete admin panel (all editors listed in Section 16)
- [ ] Galaxy editor (visual sector map editing)
- [ ] Economy dashboard (price charts, trade flow visualization)
- [ ] Event triggers (admin can spawn special events)
- [ ] Player management (ban, reset, grant items)
- [ ] World configuration (all settings exposed)

### Phase 10 — Polish & Fun
> The most important phase

- [ ] ASCII art for all ships, planets, NPCs, scenes
- [ ] Sound effects (optional, BBS-style beeps)
- [ ] Tutorial / new player experience
- [ ] Easter eggs and hidden content
- [ ] Balance pass (combat, economy, cards)
- [ ] Performance optimization (large galaxy, many players)
- [ ] Playtesting and iteration
- [ ] **Make it actually fun to play**

### Future / Stretch Goals
- [ ] TCP/WebSocket server mode (true remote multiplayer, not just local nodes)
- [ ] Web client (play in browser, no Electron required)
- [ ] Procedural quest generation
- [ ] Seasonal events / limited-time content
- [ ] Modding support (custom content packs)
- [ ] Cross-galaxy communication (if multiple servers exist)

---

## 22. Open Questions

1. **Galaxy persistence**: Should the galaxy be regenerated on admin command, or is it permanent once created? (Recommend: permanent, with admin tools to modify individual sectors)

2. **Turn system**: Fixed daily turns (like LoAF) or time-based regeneration (1 turn per 5 minutes)? (Recommend: daily reset, classic BBS style)

3. **Ship loss on death**: Lose your ship entirely (harsh, classic) or lose cargo + credits but keep ship (forgiving)? (Recommend: configurable per-world)

4. **Real-time vs turn-based PvP**: Should PvP combat be real-time (both players present) or asynchronous (attack offline players)? (Recommend: both — real-time if both online, auto-defense if offline)

5. **Maximum company size**: 10 players per company is stated. Is this hard-coded or admin-configurable? (Recommend: admin-configurable)

6. **Galaxy scale**: Default 500 sectors — should this be smaller for small player counts? (Recommend: auto-scale based on player count, minimum 100)

7. **NPC dialogue authoring**: Hand-written dialogue trees or procedural generation? (Recommend: hand-written for key NPCs, templates for generic NPCs)

8. **Card balance**: Port the LoAF card system directly and reskin, or redesign from scratch with 3 rows? (Recommend: extend LoAF system — add third row + new effects, keep core mechanics)

---

*This document is the living plan for Space Adventure Quest. Update it as design decisions are made and phases are completed.*
