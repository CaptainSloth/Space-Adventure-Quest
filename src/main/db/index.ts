import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { generateGalaxy } from '../../engine/galaxy'
import { SHIP_TEMPLATES, SHIP_PREFIXES, SHIP_SUFFIXES, LEGENDARY_SHIPS } from '../../engine/ships'

let db: Database.Database

export function initDb(): void {
  const dbPath = join(app.getPath('userData'), 'game.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  const schema = readFileSync(join(__dirname, '../../src/main/db/schema.sql'), 'utf8')
  db.exec(schema)

  // Check if galaxy exists
  const sectorCount = db.prepare('SELECT count(*) as count FROM sectors').get().count
  const planetCount = db.prepare('SELECT count(*) as count FROM planets').get().count

  if (sectorCount === 0) {
    console.log('Generating initial galaxy...')
    const { sectors, planets } = generateGalaxy(500)
    
    const insertSector = db.prepare(`
      INSERT INTO sectors (id, name, type, warps, portType)
      VALUES (@id, @name, @type, @warps, @portType)
    `)
    
    const insertPlanet = db.prepare(`
      INSERT INTO planets (id, sectorId, name, type, population, maxPopulation, taxRate, createdAt)
      VALUES (@id, @sectorId, @name, @type, @population, @maxPopulation, @taxRate, @createdAt)
    `)

    db.transaction(() => {
      for (const s of sectors) {
        insertSector.run({ ...s, warps: JSON.stringify(s.warps) })
      }
      for (const p of planets) {
        insertPlanet.run(p)
      }
    })()
  } else if (planetCount === 0) {
    console.log('Migrating: Adding planets to existing sectors...')
    const sectors = db.prepare('SELECT id FROM sectors').all()
    const insertPlanet = db.prepare(`
      INSERT INTO planets (id, sectorId, name, type, population, maxPopulation, taxRate, createdAt)
      VALUES (@id, @sectorId, @name, @type, @population, @maxPopulation, @taxRate, @createdAt)
    `)

    const PLANET_TYPES = ['terran', 'volcanic', 'ice', 'gas_giant', 'desert', 'ocean', 'barren']

    db.transaction(() => {
      for (const s of sectors) {
        const numPlanets = Math.floor(Math.random() * 6)
        for (let j = 0; j < numPlanets; j++) {
          const type = PLANET_TYPES[Math.floor(Math.random() * PLANET_TYPES.length)]
          insertPlanet.run({
            id: Math.random().toString(36).substring(7),
            sectorId: s.id,
            name: `Planet ${s.id}-${j + 1}`,
            type: type,
            population: Math.floor(Math.random() * 1500) + 500, // Start with some people!
            maxPopulation: type === 'terran' ? 100000 : 10000,
            taxRate: 0.1,
            createdAt: new Date().toISOString()
          })
        }
      }
    })()
    console.log('Migration complete.')
  }

  // Check for ship upgrade columns
  const tableInfo = db.prepare("PRAGMA table_info(players)").all() as any[]
  const hasWeaponLevel = tableInfo.some(col => col.name === 'weaponLevel')
  
  if (!hasWeaponLevel) {
    console.log('Migrating: Adding ship upgrade columns to players table...')
    db.transaction(() => {
      db.prepare('ALTER TABLE players ADD COLUMN weaponLevel INTEGER DEFAULT 1').run()
      db.prepare('ALTER TABLE players ADD COLUMN shieldLevel INTEGER DEFAULT 1').run()
      db.prepare('ALTER TABLE players ADD COLUMN engineLevel INTEGER DEFAULT 1').run()
    })()
    console.log('Migration complete.')
  }

  // Check for bounties table
  const hasBounties = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bounties'").get()
  if (!hasBounties) {
    console.log('Migrating: Adding bounties table...')
    db.exec(`
      CREATE TABLE bounties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playerId TEXT,
        companyId TEXT,
        type TEXT NOT NULL,
        target TEXT,
        required INTEGER NOT NULL,
        progress INTEGER DEFAULT 0,
        reward INTEGER NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        expiresAt TEXT NOT NULL
      )
    `)
  } else {
    // Check if companyId column exists
    const bountyCols = db.prepare("PRAGMA table_info(bounties)").all() as any[]
    if (!bountyCols.some(col => col.name === 'companyId')) {
      console.log('Migrating: Adding companyId to bounties...')
      db.prepare("ALTER TABLE bounties ADD COLUMN companyId TEXT").run()
    }
  }

  // Check for planet_reports table
  const hasReports = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='planet_reports'").get()
  if (!hasReports) {
    console.log('Migrating: Adding planet_reports table...')
    db.exec(`
      CREATE TABLE planet_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        planetId TEXT NOT NULL,
        report TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )
    `)
  }

  // Check for lastLoginAt column
  const playerCols = db.prepare("PRAGMA table_info(players)").all() as any[]
  if (!playerCols.some(col => col.name === 'lastLoginAt')) {
    console.log('Migrating: Adding lastLoginAt to players...')
    db.prepare("ALTER TABLE players ADD COLUMN lastLoginAt TEXT").run()
  }

  // Check for companies tables
  const hasCompanies = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='companies'").get()
  if (!hasCompanies) {
    console.log('Migrating: Adding company tables...')
    db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        ceoPlayerId TEXT NOT NULL,
        faction TEXT,
        treasury INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS company_members (
        companyId TEXT NOT NULL,
        playerId TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        joinedAt TEXT NOT NULL,
        PRIMARY KEY (companyId, playerId)
      );
      CREATE TABLE IF NOT EXISTS company_alliances (
        companyA TEXT NOT NULL,
        companyB TEXT NOT NULL,
        formedAt TEXT NOT NULL,
        PRIMARY KEY (companyA, companyB)
      );
    `)
  }

  // Check for stocks table
  const hasStocks = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stocks'").get()
  if (!hasStocks) {
    console.log('Migrating: Adding stock market tables...')
    db.exec(`
      CREATE TABLE IF NOT EXISTS stocks (
        symbol TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        prevPrice REAL NOT NULL,
        volatility REAL DEFAULT 0.05,
        description TEXT
      );
      CREATE TABLE IF NOT EXISTS player_stocks (
        playerId TEXT NOT NULL,
        symbol TEXT NOT NULL,
        quantity INTEGER DEFAULT 0,
        avgPrice REAL DEFAULT 0,
        PRIMARY KEY (playerId, symbol)
      );
    `)
  }

  // Check for planet port columns
  const planetCols = db.prepare("PRAGMA table_info(planets)").all() as any[]
  if (!planetCols.some(col => col.name === 'hasPort')) {
    console.log('Migrating: Adding port columns to planets...')
    db.transaction(() => {
      db.prepare("ALTER TABLE planets ADD COLUMN hasPort BOOLEAN DEFAULT FALSE").run()
      db.prepare("ALTER TABLE planets ADD COLUMN portPrices TEXT").run()
    })()
  }

  // Check for stock history
  const hasHistory = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stock_history'").get()
  if (!hasHistory) {
    db.exec('CREATE TABLE stock_history (symbol TEXT NOT NULL, price REAL NOT NULL, recordedAt TEXT NOT NULL)')
  }

  // Card System Migrations
  const hasCards = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='star_cards'").get()
  if (!hasCards) {
    console.log('Migrating: Adding CCG card tables...')
    db.exec(`
      CREATE TABLE IF NOT EXISTS star_cards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        rarity TEXT DEFAULT 'common',
        power INTEGER DEFAULT 0,
        effect TEXT,
        description TEXT
      );
      CREATE TABLE IF NOT EXISTS player_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playerId TEXT NOT NULL,
        cardId TEXT NOT NULL,
        level INTEGER DEFAULT 1,
        equipped BOOLEAN DEFAULT FALSE,
        acquiredAt TEXT NOT NULL
      );
    `)
  }

  // Seed Cards if empty
  const cardCount = db.prepare('SELECT count(*) as count FROM star_cards').get().count
  if (cardCount === 0) {
    console.log('Seeding initial Star Cards...')
    const initialCards = [
      // SHIP CARDS
      { id: 'c_wasp', name: 'Wasp Drone', type: 'ship', rarity: 'common', power: 2, effect: 'rally', desc: 'Cheap and disposable.' },
      { id: 'c_hauler', name: 'Hauler Convoy', type: 'ship', rarity: 'common', power: 4, effect: 'medic', desc: 'Heals adjacent cards.' },
      { id: 'c_falcon', name: 'Falcon Interceptor', type: 'ship', rarity: 'uncommon', power: 6, effect: 'warp', desc: 'Moves between rows.' },
      { id: 'c_titan', name: 'Imperial Titan', type: 'ship', rarity: 'rare', power: 10, effect: 'horn', desc: 'Doubles row power.' },
      { id: 'c_planet_killer', name: 'Planet Killer', type: 'ship', rarity: 'legendary', power: 15, effect: 'scorch', desc: 'Destroys strongest enemy.' },
      
      // CREW CARDS
      { id: 'c_ace_pilot', name: 'Ace Pilot', type: 'crew', rarity: 'common', power: 1, effect: 'shield', desc: 'Protects row from effects.' },
      { id: 'c_engineer', name: 'Master Engineer', type: 'crew', rarity: 'uncommon', power: 2, effect: 'medic', desc: 'Revives ship from discard.' },
      { id: 'c_hacker', name: 'Shadow Hacker', type: 'crew', rarity: 'rare', power: 3, effect: 'hack', desc: 'Steals an enemy card.' },
      
      // EVENT CARDS
      { id: 'c_emp', name: 'EMP Blast', type: 'event', rarity: 'common', power: 0, effect: 'fog', desc: 'Zeros enemy row power.' },
      { id: 'c_warp_jump', name: 'Warp Jump', type: 'event', rarity: 'uncommon', power: 0, effect: 'spy', desc: 'Draw 2 cards.' },
      { id: 'c_overload', name: 'System Overload', type: 'event', rarity: 'rare', power: 0, effect: 'overload', desc: 'Sacrifice card for damage.' },
      
      // PLANET CARDS
      { id: 'c_terran', name: 'Terran Colony', type: 'planet', rarity: 'common', power: 5, effect: 'commander', desc: 'Buffs all same faction.' },
      { id: 'c_station', name: 'Deep Space 9', type: 'planet', rarity: 'rare', power: 8, effect: 'horn', desc: 'Station support.' }
    ]
    const insertCard = db.prepare('INSERT INTO star_cards (id, name, type, rarity, power, effect, description) VALUES (?, ?, ?, ?, ?, ?, ?)')
    db.transaction(() => {
      initialCards.forEach(c => insertCard.run(c.id, c.name, c.type, c.rarity, c.power, c.effect, c.desc))
    })()
  }

  // Ship System Migrations
  const hasTemplates = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ship_templates'").get()
  if (!hasTemplates) {
    console.log('Migrating: Adding ship template tables...')
    db.exec(`
      CREATE TABLE IF NOT EXISTS ship_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        baseHolds INTEGER DEFAULT 5,
        baseShields INTEGER DEFAULT 10,
        baseFighters INTEGER DEFAULT 0,
        baseCost INTEGER DEFAULT 500,
        description TEXT,
        tier INTEGER DEFAULT 1,
        isCustom BOOLEAN DEFAULT FALSE
      );
      CREATE TABLE IF NOT EXISTS ship_modifiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        holdsMod REAL DEFAULT 1.0,
        shieldsMod REAL DEFAULT 1.0,
        fightersMod REAL DEFAULT 1.0,
        costMod REAL DEFAULT 1.0,
        description TEXT
      );
    `)
  }

  // Seed Ships if empty
  const templateCount = db.prepare('SELECT count(*) as count FROM ship_templates').get().count
  if (templateCount === 0) {
    console.log('Seeding initial ship templates and modifiers...')
    const insertT = db.prepare('INSERT INTO ship_templates (id, name, baseHolds, baseShields, baseFighters, baseCost, description, tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    const insertM = db.prepare('INSERT INTO ship_modifiers (name, type, holdsMod, shieldsMod, fightersMod, costMod, description) VALUES (?, ?, ?, ?, ?, ?, ?)')
    
    db.transaction(() => {
      SHIP_TEMPLATES.forEach((t: any) => insertT.run(t.id, t.name, t.baseHolds, t.baseShields, t.baseFighters, t.baseCost, t.description, t.tier))
      SHIP_PREFIXES.forEach((m: any) => insertM.run(m.name, 'prefix', m.holdsMod, m.shieldsMod, m.fightersMod, m.costMod, m.desc))
      SHIP_SUFFIXES.forEach((m: any) => insertM.run(m.name, 'suffix', m.holdsMod, m.shieldsMod, m.fightersMod, m.costMod, m.desc))
    })()
  }

  // Initialize Stocks
  const stockCount = db.prepare('SELECT count(*) as count FROM stocks').get().count
  if (stockCount === 0) {
    console.log('Initializing stock market data...')
    const initialStocks = [
      { symbol: 'ORE', name: 'Intergalactic Ore Corp', price: 100, volatility: 0.05, desc: 'Primary supplier of raw building materials.' },
      { symbol: 'FUEL', name: 'Nova Energy Systems', price: 150, volatility: 0.08, desc: 'Monopolizing the transwarp fuel market.' },
      { symbol: 'EQP', name: 'Atlas Equipment', price: 500, volatility: 0.12, desc: 'High-tech ship components and weaponry.' },
      { symbol: 'PLAN', name: 'Terran Terraforming', price: 1200, volatility: 0.04, desc: 'Real estate and planetary development.' }
    ]
    const stmt = db.prepare('INSERT INTO stocks (symbol, name, price, prevPrice, volatility, description) VALUES (?, ?, ?, ?, ?, ?)')
    initialStocks.forEach(s => stmt.run(s.symbol, s.name, s.price, s.price, s.volatility, s.desc))
  }
}

export function getDb(): Database.Database {
  if (!db) {
    initDb()
  }
  return db
}

// Helper methods for common operations
export const dbOps = {
  getPlayer: (id: string) => {
    return db.prepare('SELECT * FROM players WHERE id = ?').get(id)
  },
  createPlayer: (player: any) => {
    const stmt = db.prepare(`
      INSERT INTO players (id, name, faction, alignment, credits, turns, maxTurns, createdAt)
      VALUES (@id, @name, @faction, @alignment, @credits, @turns, @maxTurns, @createdAt)
    `)
    return stmt.run(player)
  },
  getSector: (id: number) => {
    return db.prepare('SELECT * FROM sectors WHERE id = ?').get(id)
  },
  updatePlayerSector: (playerId: string, sectorId: number) => {
    return db.prepare('UPDATE players SET sectorId = ?, turns = turns - 1 WHERE id = ?').run(sectorId, playerId)
  },
  getAllPlayers: () => {
    return db.prepare('SELECT id, name FROM players').all()
  },
  getPlanetsBySector: (sectorId: number) => {
    return db.prepare(`
      SELECT p.*, pl.name as ownerName 
      FROM planets p 
      LEFT JOIN players pl ON p.ownerId = pl.id 
      WHERE p.sectorId = ?
    `).all(sectorId)
  },
  claimPlanet: (planetId: string, playerId: string, ownerType: 'player' | 'company') => {
    return db.prepare('UPDATE planets SET ownerId = ?, ownerType = ? WHERE id = ?').run(playerId, ownerType, planetId)
  },
  updatePlanetMiners: (planetId: string, ore: number, fuel: number, equipment: number) => {
    return db.prepare(`
      UPDATE planets 
      SET oreMiners = ?, fuelMiners = ?, equipmentMiners = ? 
      WHERE id = ?
    `).run(ore, fuel, equipment, planetId)
  },
  updatePlanetPopulation: (planetId: string, amount: number) => {
    return db.prepare('UPDATE planets SET population = population + ? WHERE id = ?').run(amount, planetId)
  },
  growAllPlanets: () => {
    const growthRates: Record<string, number> = {
      'terran': 0.05,
      'ocean': 0.03,
      'desert': 0.01,
      'ice': 0.01,
      'volcanic': 0.005,
      'gas_giant': 0,
      'barren': 0.005
    }
    const planets = db.prepare('SELECT id, type, population, maxPopulation, ownerId, taxRate FROM planets').all() as any[]
    
    db.transaction(() => {
      planets.forEach(p => {
        const rate = growthRates[p.type] || 0.01
        const growth = Math.floor(Math.max(10, p.population * rate))
        const newPop = Math.min(p.maxPopulation, p.population + growth)
        
        let taxCollected = 0
        if (p.ownerId && p.population > 0) {
          taxCollected = Math.floor(p.population * 0.1 * p.taxRate)
          db.prepare('UPDATE players SET credits = credits + ? WHERE id = ?').run(taxCollected, p.ownerId)
        }
        
        db.prepare('UPDATE planets SET population = ?, credits = credits + ? WHERE id = ?').run(newPop, taxCollected, p.id)
        
        // Log real report
        const report = `Tick Report: Pop +${growth} (Total: ${newPop}). Taxes: ${taxCollected} cr.`
        db.prepare("INSERT INTO planet_reports (planetId, report, createdAt) VALUES (?, ?, datetime('now'))").run(p.id, report)
      })
    })()
  },
  getPlanetReport: (planetId: string) => {
    return db.prepare('SELECT report FROM planet_reports WHERE planetId = ? ORDER BY id DESC LIMIT 1').get(planetId)
  },
  updatePlanetTaxRate: (planetId: string, taxRate: number) => {
    return db.prepare('UPDATE planets SET taxRate = ? WHERE id = ?').run(taxRate, planetId)
  },
  updatePlanetName: (planetId: string, name: string) => {
    return db.prepare('UPDATE planets SET name = ? WHERE id = ?').run(name, planetId)
  },
  updatePlanetAccess: (planetId: string, access: string) => {
    return db.prepare('UPDATE planets SET accessPolicy = ? WHERE id = ?').run(access, planetId)
  },
  getNpcCooldown: (npcId: string) => {
    return db.prepare('SELECT value FROM world_settings WHERE key = ?').get(`cooldown_npc_${npcId}`)
  },
  setNpcCooldown: (npcId: string, timestamp: string) => {
    return db.prepare('INSERT OR REPLACE INTO world_settings (key, value) VALUES (?, ?)').run(`cooldown_npc_${npcId}`, timestamp)
  },
  updatePlayerCredits: (playerId: string, amount: number) => {
    return db.prepare('UPDATE players SET credits = credits + ? WHERE id = ?').run(amount, playerId)
  },
  getPlayerCargo: (playerId: string) => {
    return db.prepare('SELECT commodity, quantity FROM player_cargo WHERE playerId = ? AND quantity > 0').all(playerId)
  },
  updatePlayerCargo: (playerId: string, commodity: string, quantity: number) => {
    return db.prepare(`
      INSERT INTO player_cargo (playerId, commodity, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(playerId, commodity) DO UPDATE SET quantity = quantity + EXCLUDED.quantity
    `).run(playerId, commodity, quantity)
  },
  updatePlayerShip: (playerId: string, shipId: string) => {
    return db.prepare('UPDATE players SET shipId = ? WHERE id = ?').run(shipId, playerId)
  },
  resetAllNpcCooldowns: () => {
    return db.prepare("DELETE FROM world_settings WHERE key LIKE 'cooldown_npc_%'").run()
  },
  setPlayerAlignment: (playerId: string, alignment: number) => {
    return db.prepare('UPDATE players SET alignment = ? WHERE id = ?').run(alignment, playerId)
  },
  refillPlayerTurns: (playerId: string) => {
    return db.prepare('UPDATE players SET turns = maxTurns WHERE id = ?').run(playerId)
  },
  updatePlayerHeartbeat: (playerId: string) => {
    return db.prepare("UPDATE players SET lastSeen = datetime('now') WHERE id = ?").run(playerId)
  },
  updatePlayerLastLogin: (playerId: string) => {
    return db.prepare("UPDATE players SET lastLoginAt = datetime('now') WHERE id = ?").run(playerId)
  },
  getOnlinePlayersInSector: (sectorId: number, excludePlayerId: string) => {
    return db.prepare(`
      SELECT id, name, faction, alignment, shipId, level 
      FROM players 
      WHERE sectorId = ? AND id != ? AND lastSeen > datetime('now', '-120 seconds')
    `).all(sectorId, excludePlayerId)
  },
  insertSectorMessage: (sectorId: number, playerId: string, message: string) => {
    return db.prepare(`
      INSERT INTO sector_messages (sectorId, playerId, message, createdAt) 
      VALUES (?, ?, ?, datetime('now'))
    `).run(sectorId, playerId, message)
  },
  getSectorMessages: (sectorId: number, limit: number = 10) => {
    return db.prepare(`
      SELECT sm.id, sm.message, sm.createdAt, p.name as playerName
      FROM sector_messages sm
      LEFT JOIN players p ON sm.playerId = p.id
      WHERE sm.sectorId = ?
      ORDER BY sm.id DESC
      LIMIT ?
    `).all(sectorId, limit).reverse()
  },
  insertCompanyMessage: (companyId: string, playerId: string, message: string) => {
    return db.prepare(`
      INSERT INTO sector_messages (sectorId, playerId, message, createdAt) 
      VALUES (-1, ?, ?, datetime('now'))
    `).run(playerId, message)
  },
  getCompanyMessages: (companyId: string, limit: number = 10) => {
    return db.prepare(`
      SELECT sm.id, sm.message, sm.createdAt, p.name as playerName
      FROM sector_messages sm
      LEFT JOIN players p ON sm.playerId = p.id
      WHERE sm.sectorId = -1 AND p.companyId = ?
      ORDER BY sm.id DESC
      LIMIT ?
    `).all(companyId, limit).reverse()
  },
  createAlliance: (idA: string, idB: string) => {
    return db.prepare("INSERT INTO company_alliances (companyA, companyB, formedAt) VALUES (?, ?, datetime('now'))").run(idA, idB)
  },
  getAlliances: (companyId: string) => {
    return db.prepare('SELECT * FROM company_alliances WHERE companyA = ? OR companyB = ?').all(companyId, companyId)
  },
  insertGlobalEvent: (type: string, payload: string) => {
    return db.prepare(`
      INSERT INTO events (targetPlayerId, type, payload, createdAt)
      VALUES ('GLOBAL', ?, ?, datetime('now'))
    `).run(type, payload)
  },
  getGlobalEvents: (limit: number = 5) => {
    return db.prepare(`
      SELECT id, type, payload, createdAt
      FROM events
      WHERE targetPlayerId = 'GLOBAL'
      ORDER BY id DESC
      LIMIT ?
    `).all(limit)
  },
  getPlayerBounties: (playerId: string, companyId?: string | null) => {
    if (companyId) {
      return db.prepare('SELECT * FROM bounties WHERE (playerId = ? OR companyId = ?) AND completed = 0').all(playerId, companyId)
    }
    return db.prepare('SELECT * FROM bounties WHERE playerId = ? AND completed = 0').all(playerId)
  },
  createBounty: (bounty: any) => {
    const stmt = db.prepare(`
      INSERT INTO bounties (playerId, companyId, type, target, required, reward, expiresAt)
      VALUES (@playerId, @companyId, @type, @target, @required, @reward, @expiresAt)
    `)
    return stmt.run(bounty)
  },
  updateBountyProgress: (playerId: string, type: string, target: string, companyId?: string | null) => {
    db.prepare(`
      UPDATE bounties 
      SET progress = progress + 1 
      WHERE (playerId = ? OR (companyId = ? AND companyId IS NOT NULL)) 
      AND type = ? AND target = ? AND completed = 0
    `).run(playerId, companyId, type, target)

    const completed = db.prepare(`
      SELECT id, reward, companyId FROM bounties 
      WHERE (playerId = ? OR (companyId = ? AND companyId IS NOT NULL))
      AND type = ? AND target = ? AND progress >= required AND completed = 0
    `).all(playerId, companyId, type, target) as any[]

    for (const b of completed) {
      db.prepare('UPDATE bounties SET completed = 1 WHERE id = ?').run(b.id)
      if (b.companyId) {
        dbOps.updateCompanyTreasury(b.companyId, b.reward)
      } else {
        dbOps.updatePlayerCredits(playerId, b.reward)
      }
    }
    return completed.length > 0
  },
  getRankings: () => {
    return {
      netWorth: db.prepare(`
        SELECT name, (credits + (weaponLevel * 1000) + (shieldLevel * 1000)) as value 
        FROM players 
        ORDER BY value DESC 
        LIMIT 10
      `).all(),
      kills: db.prepare('SELECT name, kills as value FROM players ORDER BY kills DESC LIMIT 10').all(),
      alignment: db.prepare('SELECT name, alignment as value FROM players ORDER BY ABS(alignment) DESC LIMIT 10').all(),
      companies: db.prepare('SELECT name, treasury as value FROM companies ORDER BY treasury DESC LIMIT 10').all()
    }
  },
  deploySectorAsset: (sectorId: number, playerId: string, type: string, quantity: number) => {
    return db.prepare(`
      INSERT INTO sector_deployments (sectorId, playerId, type, quantity, deployedAt)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(sectorId, playerId, type, quantity)
  },
  getSectorDeployments: (sectorId: number) => {
    return db.prepare(`
      SELECT sd.*, p.name as playerName, p.faction as playerFaction
      FROM sector_deployments sd
      LEFT JOIN players p ON sd.playerId = p.id
      WHERE sd.sectorId = ?
    `).all(sectorId)
  },
  removeSectorDeployment: (id: number) => {
    return db.prepare('DELETE FROM sector_deployments WHERE id = ?').run(id)
  },
  getNpc: (id: string) => {
    return db.prepare('SELECT * FROM npcs WHERE id = ?').get(id)
  },
  getNpcsInSector: (sectorId: number) => {
    return db.prepare('SELECT * FROM npcs WHERE sectorId = ?').all(sectorId)
  },
  updateNpcSector: (npcId: string, sectorId: number) => {
    return db.prepare('UPDATE npcs SET sectorId = ? WHERE id = ?').run(sectorId, npcId)
  },
  updateNpcStats: (npcId: string, personality: string) => {
    return db.prepare('UPDATE npcs SET personality = ? WHERE id = ?').run(personality, npcId)
  },
  addNpcMemory: (npcId: string, playerId: string, type: string, sentiment: number, details: string) => {
    return db.prepare(`
      INSERT INTO npc_memories (npcId, playerId, encounterType, sentiment, details, createdAt)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(npcId, playerId, type, sentiment, details)
  },
  getNpcMemories: (npcId: string, playerId: string) => {
    return db.prepare('SELECT * FROM npc_memories WHERE npcId = ? AND playerId = ? ORDER BY id DESC').all(npcId, playerId)
  },
  getCompany: (id: string) => {
    return db.prepare('SELECT * FROM companies WHERE id = ?').get(id)
  },
  getCompanyMembers: (companyId: string) => {
    return db.prepare(`
      SELECT cm.*, p.name as playerName, p.faction as playerFaction, p.level as playerLevel, p.lastSeen, p.lastLoginAt
      FROM company_members cm
      LEFT JOIN players p ON cm.playerId = p.id
      WHERE cm.companyId = ?
    `).all(companyId)
  },
  createCompany: (company: any) => {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO companies (id, name, ceoPlayerId, faction, createdAt)
        VALUES (@id, @name, @ceoPlayerId, @faction, @createdAt)
      `).run(company)
      db.prepare(`
        INSERT INTO company_members (companyId, playerId, role, joinedAt)
        VALUES (?, ?, 'ceo', ?)
      `).run(company.id, company.ceoPlayerId, company.createdAt)
      db.prepare('UPDATE players SET companyId = ? WHERE id = ?').run(company.id, company.ceoPlayerId)
    })()
  },
  updateCompanyTreasury: (companyId: string, amount: number) => {
    return db.prepare('UPDATE companies SET treasury = treasury + ? WHERE id = ?').run(amount, companyId)
  },
  addCompanyMember: (companyId: string, playerId: string) => {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO company_members (companyId, playerId, role, joinedAt)
        VALUES (?, ?, 'member', datetime('now'))
      `).run(companyId, playerId)
      db.prepare('UPDATE players SET companyId = ? WHERE id = ?').run(companyId, playerId)
    })()
  },
  getAvailableCompanies: () => {
    return db.prepare('SELECT * FROM companies').all()
  },
  getStocks: () => {
    return db.prepare('SELECT * FROM stocks').all()
  },
  updateStockPrices: () => {
    const stocks = db.prepare('SELECT * FROM stocks').all() as any[]
    const stmt = db.prepare('UPDATE stocks SET price = ?, prevPrice = ? WHERE symbol = ?')
    const histStmt = db.prepare("INSERT INTO stock_history (symbol, price, recordedAt) VALUES (?, ?, datetime('now'))")
    
    db.transaction(() => {
      stocks.forEach(s => {
        // Record history before update
        histStmt.run(s.symbol, s.price)
        
        const change = 1 + (Math.random() * s.volatility * 2 - s.volatility)
        const newPrice = Math.max(10, s.price * change)
        stmt.run(newPrice, s.price, s.symbol)
      })
    })()
  },
  getPlayerStocks: (playerId: string) => {
    return db.prepare(`
      SELECT ps.*, s.name, s.price as currentPrice 
      FROM player_stocks ps 
      JOIN stocks s ON ps.symbol = s.symbol 
      WHERE ps.playerId = ?
    `).all(playerId)
  },
  tradeStock: (playerId: string, symbol: string, quantity: number, price: number) => {
    const isBuy = quantity > 0
    return db.transaction(() => {
      if (isBuy) {
        db.prepare(`
          INSERT INTO player_stocks (playerId, symbol, quantity, avgPrice)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(playerId, symbol) DO UPDATE SET
            avgPrice = (avgPrice * quantity + ? * ?) / (quantity + ?),
            quantity = quantity + ?
        `).run(playerId, symbol, quantity, price, price, quantity, quantity, quantity)
      } else {
        const current = db.prepare('SELECT quantity FROM player_stocks WHERE playerId = ? AND symbol = ?').get(playerId, symbol) as any
        if (!current || current.quantity < Math.abs(quantity)) throw new Error('Not enough shares')
        db.prepare('UPDATE player_stocks SET quantity = quantity + ? WHERE playerId = ? AND symbol = ?').run(quantity, playerId, symbol)
      }
    })()
  },
  createPlayerShip: (playerId: string, ship: any) => {
    return db.prepare(`
      INSERT INTO player_ships (playerId, shipDefId, name, shields, maxShields, fighters, holds)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(playerId, ship.templateId, ship.instanceName, ship.shields, ship.shields, ship.fighters, ship.holds)
  },
  getPlayerShip: (playerId: string) => {
    return db.prepare('SELECT * FROM player_ships WHERE playerId = ? ORDER BY id DESC LIMIT 1').get(playerId)
  },
  updatePlanetPort: (planetId: string, hasPort: boolean, prices: string) => {
    return db.prepare('UPDATE planets SET hasPort = ?, portPrices = ? WHERE id = ?').run(hasPort ? 1 : 0, prices, planetId)
  },
  insertStockHistory: (symbol: string, price: number) => {
    return db.prepare("INSERT INTO stock_history (symbol, price, recordedAt) VALUES (?, ?, datetime('now'))").run(symbol, price)
  },
  getStockHistory: (symbol: string, limit: number = 20) => {
    return db.prepare('SELECT price FROM stock_history WHERE symbol = ? ORDER BY recordedAt DESC LIMIT ?').all(symbol, limit).reverse()
  },
  getShipTemplates: () => {
    return db.prepare('SELECT * FROM ship_templates ORDER BY tier ASC, name ASC').all()
  },
  addShipTemplate: (template: any) => {
    return db.prepare(`
      INSERT INTO ship_templates (id, name, baseHolds, baseShields, baseFighters, baseCost, description, tier, isCustom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(template.id, template.name, template.baseHolds, template.baseShields, template.baseFighters, template.baseCost, template.description, template.tier)
  },
  deleteShipTemplate: (id: string) => {
    return db.prepare('DELETE FROM ship_templates WHERE id = ?').run(id)
  },
  getShipModifiers: (type?: string) => {
    if (type) return db.prepare('SELECT * FROM ship_modifiers WHERE type = ?').all(type)
    return db.prepare('SELECT * FROM ship_modifiers').all()
  },
  addShipModifier: (mod: any) => {
    return db.prepare(`
      INSERT INTO ship_modifiers (name, type, holdsMod, shieldsMod, fightersMod, costMod, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mod.name, mod.type, mod.holdsMod, mod.shieldsMod, mod.fightersMod, mod.costMod, mod.description)
  },
  deleteShipModifier: (id: number) => {
    return db.prepare('DELETE FROM ship_modifiers WHERE id = ?').run(id)
  },
  getAllStarCards: () => {
    return db.prepare('SELECT * FROM star_cards').all()
  },
  getPlayerCards: (playerId: string) => {
    return db.prepare(`
      SELECT pc.id as instanceId, pc.level, pc.equipped, pc.acquiredAt, sc.*
      FROM player_cards pc
      JOIN star_cards sc ON pc.cardId = sc.id
      WHERE pc.playerId = ?
    `).all(playerId)
  },
  addPlayerCard: (playerId: string, cardId: string) => {
    return db.prepare(`
      INSERT INTO player_cards (playerId, cardId, acquiredAt)
      VALUES (?, ?, datetime('now'))
    `).run(playerId, cardId)
  },
  equipPlayerCard: (instanceId: number, equipped: boolean) => {
    return db.prepare('UPDATE player_cards SET equipped = ? WHERE id = ?').run(equipped ? 1 : 0, instanceId)
  },
  buyCardPack: (playerId: string, rarityWeights: Record<string, number>) => {
    const allCards = db.prepare('SELECT id, rarity FROM star_cards').all() as any[]
    
    // Draw 3 cards
    const drawn: string[] = []
    for (let i = 0; i < 3; i++) {
      const roll = Math.random()
      let rarity = 'common'
      if (roll < 0.01) rarity = 'legendary'
      else if (roll < 0.05) rarity = 'epic'
      else if (roll < 0.15) rarity = 'rare'
      else if (roll < 0.40) rarity = 'uncommon'
      
      const pool = allCards.filter(c => c.rarity === rarity)
      const choice = pool.length > 0 
        ? pool[Math.floor(Math.random() * pool.length)] 
        : allCards[Math.floor(Math.random() * allCards.length)]
      
      drawn.push(choice.id)
      dbOps.addPlayerCard(playerId, choice.id)
    }
    return drawn
  }
}
