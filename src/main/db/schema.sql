-- Players
CREATE TABLE IF NOT EXISTS players (
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
  isBanned BOOLEAN DEFAULT FALSE,
  companyId TEXT,
  deck TEXT DEFAULT '[]',              -- CCG deck (JSON array of card IDs)
  weaponLevel INTEGER DEFAULT 1,
  shieldLevel INTEGER DEFAULT 1,
  engineLevel INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL
);

-- Ships (player's current ship state, not the definition)
CREATE TABLE IF NOT EXISTS player_ships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
CREATE TABLE IF NOT EXISTS player_cargo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playerId TEXT NOT NULL,
  commodity TEXT NOT NULL,            -- 'ore', 'fuel', 'equipment', 'organics', 'luxury', 'contraband'
  quantity INTEGER DEFAULT 0,
  UNIQUE(playerId, commodity)
);

-- Planets
CREATE TABLE IF NOT EXISTS planets (
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
  hasPort BOOLEAN DEFAULT FALSE,
  portPrices TEXT,                    -- JSON: { ore: N, fuel: N, equipment: N }
  customDescription TEXT,
  customAscii TEXT,                    -- JSON string[]
  landingMessage TEXT,
  createdAt TEXT NOT NULL
);

-- Sectors
CREATE TABLE IF NOT EXISTS sectors (
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
CREATE TABLE IF NOT EXISTS sector_deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sectorId INTEGER NOT NULL,
  playerId TEXT NOT NULL,
  type TEXT NOT NULL,                 -- 'mine' or 'fighter'
  quantity INTEGER DEFAULT 1,
  deployedAt TEXT NOT NULL
);

-- NPCs
CREATE TABLE IF NOT EXISTS npcs (
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
CREATE TABLE IF NOT EXISTS npc_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  npcId TEXT NOT NULL,
  playerId TEXT NOT NULL,
  encounterType TEXT NOT NULL,
  sentiment INTEGER NOT NULL,
  details TEXT,
  createdAt TEXT NOT NULL
);

-- Events / Messages
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  targetPlayerId TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  readAt TEXT
);

-- Sector Messages (real-time chat)
CREATE TABLE IF NOT EXISTS sector_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sectorId INTEGER NOT NULL,
  playerId TEXT NOT NULL,
  message TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

-- Bounties
CREATE TABLE IF NOT EXISTS bounties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playerId TEXT,                      -- NULL if company bounty
  companyId TEXT,                     -- NULL if player bounty
  type TEXT NOT NULL,                 -- 'kill', 'trade', 'explore'
  target TEXT,                        -- npcId or commodity
  required INTEGER NOT NULL,
  progress INTEGER DEFAULT 0,
  reward INTEGER NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  expiresAt TEXT NOT NULL
);

-- Players update: add lastLoginAt
-- (I will handle this via migration in DB index.ts)

-- Planet Daily Reports
CREATE TABLE IF NOT EXISTS planet_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planetId TEXT NOT NULL,
  report TEXT NOT NULL,               -- JSON
  createdAt TEXT NOT NULL
);

-- Companies
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  ceoPlayerId TEXT NOT NULL,
  faction TEXT,                    -- 'alliance', 'empire', 'neutral', or NULL (mixed)
  treasury INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL
);

-- Company Members
CREATE TABLE IF NOT EXISTS company_members (
  companyId TEXT NOT NULL,
  playerId TEXT NOT NULL,
  role TEXT DEFAULT 'member',      -- 'ceo', 'officer', 'member'
  joinedAt TEXT NOT NULL,
  PRIMARY KEY (companyId, playerId)
);

-- Company Alliances
CREATE TABLE IF NOT EXISTS company_alliances (
  companyA TEXT NOT NULL,
  companyB TEXT NOT NULL,
  formedAt TEXT NOT NULL,
  PRIMARY KEY (companyA, companyB)
);

-- Stocks
CREATE TABLE IF NOT EXISTS stocks (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  prevPrice REAL NOT NULL,
  volatility REAL DEFAULT 0.05,
  description TEXT
);

-- Player Portfolio
CREATE TABLE IF NOT EXISTS player_stocks (
  playerId TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  avgPrice REAL DEFAULT 0,
  PRIMARY KEY (playerId, symbol)
);

-- Stock History
CREATE TABLE IF NOT EXISTS stock_history (
  symbol TEXT NOT NULL,
  price REAL NOT NULL,
  recordedAt TEXT NOT NULL
);

-- Dynamic Ship Templates
CREATE TABLE IF NOT EXISTS ship_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  baseHolds INTEGER DEFAULT 5,
  baseShields INTEGER DEFAULT 10,
  baseFighters INTEGER DEFAULT 0,
  baseCost INTEGER DEFAULT 500,
  description TEXT,
  tier INTEGER DEFAULT 1,
  ascii TEXT,                        -- JSON string[]
  isCustom BOOLEAN DEFAULT FALSE
);

-- Dynamic Ship Modifiers
CREATE TABLE IF NOT EXISTS ship_modifiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,               -- 'prefix' or 'suffix'
  holdsMod REAL DEFAULT 1.0,
  shieldsMod REAL DEFAULT 1.0,
  fightersMod REAL DEFAULT 1.0,
  costMod REAL DEFAULT 1.0,
  description TEXT
);

-- CCG Star Cards
CREATE TABLE IF NOT EXISTS star_cards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,               -- 'ship', 'crew', 'event', 'planet'
  rarity TEXT DEFAULT 'common',     -- 'common', 'uncommon', 'rare', 'epic', 'legendary'
  power INTEGER DEFAULT 0,
  effect TEXT,                      -- 'spy', 'scorch', 'horn', 'shield', etc.
  description TEXT
);

-- Player Card Collection
CREATE TABLE IF NOT EXISTS player_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playerId TEXT NOT NULL,
  cardId TEXT NOT NULL,
  level INTEGER DEFAULT 1,
  equipped BOOLEAN DEFAULT FALSE,
  acquiredAt TEXT NOT NULL,
  FOREIGN KEY (playerId) REFERENCES players(id),
  FOREIGN KEY (cardId) REFERENCES star_cards(id)
);

-- Planet Buildings
CREATE TABLE IF NOT EXISTS planet_buildings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planetId TEXT NOT NULL,
  type TEXT NOT NULL,               -- 'shipyard', 'defense_grid', 'sensor_array', 'cantina', 'refinery'
  level INTEGER DEFAULT 1,
  status TEXT DEFAULT 'operational', -- 'operational', 'under_construction', 'damaged'
  builtAt TEXT NOT NULL,
  FOREIGN KEY (planetId) REFERENCES planets(id)
);

-- Space Stations (Sector-based)
CREATE TABLE IF NOT EXISTS space_stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sectorId INTEGER NOT NULL,
  playerId TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'outpost',      -- 'outpost', 'refinery', 'fortress'
  level INTEGER DEFAULT 1,
  builtAt TEXT NOT NULL,
  FOREIGN KEY (playerId) REFERENCES players(id)
);

-- Resource Nodes (Sector-based)
CREATE TABLE IF NOT EXISTS resource_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sectorId INTEGER NOT NULL,
  type TEXT NOT NULL,               -- 'asteroid_belt', 'gas_cloud'
  commodity TEXT NOT NULL,          -- 'ore', 'fuel'
  abundance REAL DEFAULT 1.0,
  isDepleted BOOLEAN DEFAULT FALSE
);

-- Galactic News
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT DEFAULT 'GENERAL',  -- 'ECONOMY', 'WAR', 'SOCIAL'
  createdAt TEXT NOT NULL
);

-- World Settings
CREATE TABLE IF NOT EXISTS world_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
