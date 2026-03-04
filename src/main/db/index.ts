import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { generateGalaxy } from '../../engine/galaxy'
import { SHIP_TEMPLATES, SHIP_PREFIXES, SHIP_SUFFIXES, LEGENDARY_SHIPS } from '../../engine/ships'
import { getPortInventory } from '../../engine/trading'

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
    console.log('Generating initial galaxy with dynamic ports...')
    const { sectors, planets } = generateGalaxy(500)
    const insertSector = db.prepare(`
      INSERT INTO sectors (id, name, type, warps, portType, portInventory) 
      VALUES (@id, @name, @type, @warps, @portType, @portInventory)
    `)
    const insertPlanet = db.prepare(`INSERT INTO planets (id, sectorId, name, type, population, maxPopulation, taxRate, createdAt) VALUES (@id, @sectorId, @name, @type, @population, @maxPopulation, @taxRate, @createdAt)`)
    
    db.transaction(() => {
      for (const s of sectors) {
        const inventory = s.portType ? getPortInventory(s.portType) : null
        insertSector.run({ 
          ...s, 
          warps: JSON.stringify(s.warps),
          portInventory: inventory ? JSON.stringify(inventory) : null
        })
      }
      for (const p of planets) insertPlanet.run(p)
    })()
  }

  // Check for portInventory column migration
  const sectorCols = db.prepare("PRAGMA table_info(sectors)").all() as any[]
  if (!sectorCols.some(c => c.name === 'portInventory')) {
    console.log('Migrating: Adding portInventory to sectors...')
    db.transaction(() => {
      db.prepare("ALTER TABLE sectors ADD COLUMN portInventory TEXT").run()
      const sectors = db.prepare('SELECT id, portType FROM sectors WHERE portType IS NOT NULL').all() as any[]
      const updateS = db.prepare('UPDATE sectors SET portInventory = ? WHERE id = ?')
      sectors.forEach(s => {
        const inv = getPortInventory(s.portType)
        updateS.run(JSON.stringify(inv), s.id)
      })
    })()
  }

  // CCG Migrations
  const hasCards = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='star_cards'").get()
  if (!hasCards) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS star_cards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        rarity TEXT DEFAULT 'common',
        preferredRow TEXT DEFAULT 'any',
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

  // Seed Cards
  const cardCount = db.prepare('SELECT count(*) as count FROM star_cards').get().count
  if (cardCount === 0) {
    console.log('Seeding expansive Star Card library...')
    const initialCards = [
      { id: 'c_wasp_drone', name: 'Wasp Drone', type: 'ship', row: 'vanguard', rarity: 'common', power: 2, effect: 'none', desc: 'Basic patrol unit.' },
      { id: 'c_hauler_con', name: 'Hauler Convoy', type: 'ship', row: 'fleet', rarity: 'common', power: 4, effect: 'none', desc: 'Bulk transport.' },
      { id: 'c_titan_cap', name: 'Imperial Titan', type: 'ship', row: 'vanguard', rarity: 'epic', power: 12, effect: 'booster', desc: 'Signal Booster: Doubles Row.' },
      { id: 'c_planet_killer', name: 'The Planet Killer', type: 'ship', row: 'vanguard', rarity: 'legendary', power: 20, effect: 'scorch', desc: 'Orbital Strike: Neutralize highest enemy.' },
      { id: 'c_emp_blast', name: 'EMP Burst', type: 'event', row: 'any', rarity: 'common', power: 0, effect: 'scorch', desc: 'Orbital Strike: Kill highest unit.' }
    ]
    const insertCard = db.prepare('INSERT INTO star_cards (id, name, type, preferredRow, rarity, power, effect, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    db.transaction(() => {
      initialCards.forEach(c => insertCard.run(c.id, c.name, c.type, c.row, c.rarity, c.power, c.effect, c.desc))
    })()
  }

  // Ship System Migrations
  const hasTemplates = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ship_templates'").get()
  if (!hasTemplates) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ship_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, baseHolds INTEGER DEFAULT 5, baseShields INTEGER DEFAULT 10, baseFighters INTEGER DEFAULT 0, baseCost INTEGER DEFAULT 500, description TEXT, tier INTEGER DEFAULT 1, isCustom BOOLEAN DEFAULT FALSE);
      CREATE TABLE IF NOT EXISTS ship_modifiers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, holdsMod REAL DEFAULT 1.0, shieldsMod REAL DEFAULT 1.0, fightersMod REAL DEFAULT 1.0, costMod REAL DEFAULT 1.0, description TEXT);
    `)
  }

  // Stock Market Migrations
  const hasStocks = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stocks'").get()
  if (!hasStocks) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS stocks (symbol TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, prevPrice REAL NOT NULL, volatility REAL DEFAULT 0.05, description TEXT);
      CREATE TABLE IF NOT EXISTS player_stocks (playerId TEXT NOT NULL, symbol TEXT NOT NULL, quantity INTEGER DEFAULT 0, avgPrice REAL DEFAULT 0, PRIMARY KEY (playerId, symbol));
    `)
  }

  // Planet Buildings Migration
  const hasBuildings = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='planet_buildings'").get()
  if (!hasBuildings) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS planet_buildings (id INTEGER PRIMARY KEY AUTOINCREMENT, planetId TEXT NOT NULL, type TEXT NOT NULL, level INTEGER DEFAULT 1, status TEXT DEFAULT 'operational', builtAt TEXT NOT NULL);
    `)
  }

  // Check for lastLoginAt column
  const playerCols = db.prepare("PRAGMA table_info(players)").all() as any[]
  if (!playerCols.some(col => col.name === 'lastLoginAt')) {
    console.log('Migrating: Adding lastLoginAt to players...')
    db.prepare("ALTER TABLE players ADD COLUMN lastLoginAt TEXT").run()
  }

  if (!playerCols.some(col => col.name === 'isBanned')) {
    console.log('Migrating: Adding isBanned to players...')
    db.prepare("ALTER TABLE players ADD COLUMN isBanned BOOLEAN DEFAULT FALSE").run()
  }
}

export function getDb(): Database.Database {
  if (!db) initDb()
  return db
}

export const dbOps = {
  getPlayer: (id: string) => db.prepare('SELECT * FROM players WHERE id = ?').get(id),
  createPlayer: (player: any) => db.prepare(`INSERT INTO players (id, name, faction, alignment, credits, turns, maxTurns, createdAt) VALUES (@id, @name, @faction, @alignment, @credits, @turns, @maxTurns, @createdAt)`).run(player),
  getSector: (id: number) => db.prepare('SELECT * FROM sectors WHERE id = ?').get(id),
  updatePlayerSector: (playerId: string, sectorId: number) => db.prepare('UPDATE players SET sectorId = ?, turns = turns - 1 WHERE id = ?').run(sectorId, playerId),
  getAllPlayers: () => db.prepare('SELECT id, name FROM players').all(),
  getPlanetsBySector: (sectorId: number) => db.prepare(`SELECT p.*, pl.name as ownerName FROM planets p LEFT JOIN players pl ON p.ownerId = pl.id WHERE p.sectorId = ?`).all(sectorId),
  claimPlanet: (planetId: string, playerId: string, ownerType: 'player' | 'company') => db.prepare('UPDATE planets SET ownerId = ?, ownerType = ? WHERE id = ?').run(playerId, ownerType, planetId),
  updatePlanetMiners: (planetId: string, ore: number, fuel: number, equipment: number) => db.prepare(`UPDATE planets SET oreMiners = ?, fuelMiners = ?, equipmentMiners = ? WHERE id = ?`).run(ore, fuel, equipment, planetId),
  updatePlanetPopulation: (planetId: string, amount: number) => db.prepare('UPDATE planets SET population = population + ? WHERE id = ?').run(amount, planetId),
  growAllPlanets: () => {
    const growthRates: Record<string, number> = { 'terran': 0.05, 'ocean': 0.03, 'desert': 0.01, 'ice': 0.01, 'volcanic': 0.005, 'gas_giant': 0, 'barren': 0.005 }
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
        const report = `Tick Report: Pop +${growth} (Total: ${newPop}). Taxes: ${taxCollected} cr.`
        db.prepare("INSERT INTO planet_reports (planetId, report, createdAt) VALUES (?, ?, datetime('now'))").run(p.id, report)
      })
    })()
  },
  getPlanetReport: (planetId: string) => db.prepare('SELECT report FROM planet_reports WHERE planetId = ? ORDER BY id DESC LIMIT 1').get(planetId),
  updatePlanetTaxRate: (planetId: string, taxRate: number) => db.prepare('UPDATE planets SET taxRate = ? WHERE id = ?').run(taxRate, planetId),
  updatePlanetName: (planetId: string, name: string) => db.prepare('UPDATE planets SET name = ? WHERE id = ?').run(name, planetId),
  updatePlanetAccess: (planetId: string, access: string) => db.prepare('UPDATE planets SET accessPolicy = ? WHERE id = ?').run(access, planetId),
  getNpcCooldown: (npcId: string) => db.prepare('SELECT value FROM world_settings WHERE key = ?').get(`cooldown_npc_${npcId}`),
  setNpcCooldown: (npcId: string, timestamp: string) => db.prepare('INSERT OR REPLACE INTO world_settings (key, value) VALUES (?, ?)').run(`cooldown_npc_${npcId}`, timestamp),
  updatePlayerCredits: (playerId: string, amount: number) => db.prepare('UPDATE players SET credits = credits + ? WHERE id = ?').run(amount, playerId),
  getPlayerCargo: (playerId: string) => db.prepare('SELECT commodity, quantity FROM player_cargo WHERE playerId = ? AND quantity > 0').all(playerId),
  updatePlayerCargo: (playerId: string, commodity: string, quantity: number) => db.prepare(`INSERT INTO player_cargo (playerId, commodity, quantity) VALUES (?, ?, ?) ON CONFLICT(playerId, commodity) DO UPDATE SET quantity = quantity + EXCLUDED.quantity`).run(playerId, commodity, quantity),
  updatePlayerShip: (playerId: string, shipId: string) => db.prepare('UPDATE players SET shipId = ? WHERE id = ?').run(shipId, playerId),
  resetAllNpcCooldowns: () => db.prepare("DELETE FROM world_settings WHERE key LIKE 'cooldown_npc_%'").run(),
  setPlayerAlignment: (playerId: string, alignment: number) => db.prepare('UPDATE players SET alignment = ? WHERE id = ?').run(alignment, playerId),
  refillPlayerTurns: (playerId: string) => db.prepare('UPDATE players SET turns = maxTurns WHERE id = ?').run(playerId),
  setPlayerBanned: (playerId: string, isBanned: boolean) => db.prepare('UPDATE players SET isBanned = ? WHERE id = ?').run(isBanned ? 1 : 0, playerId),
  updatePlayerHeartbeat: (playerId: string) => db.prepare("UPDATE players SET lastSeen = datetime('now') WHERE id = ?").run(playerId),
  updatePlayerLastLogin: (playerId: string) => db.prepare("UPDATE players SET lastLoginAt = datetime('now') WHERE id = ?").run(playerId),
  getOnlinePlayersInSector: (sectorId: number, excludePlayerId: string) => db.prepare(`SELECT id, name, faction, alignment, shipId, level FROM players WHERE sectorId = ? AND id != ? AND lastSeen > datetime('now', '-120 seconds')`).all(sectorId, excludePlayerId),
  insertSectorMessage: (sectorId: number, playerId: string, message: string) => db.prepare(`INSERT INTO sector_messages (sectorId, playerId, message, createdAt) VALUES (?, ?, ?, datetime('now'))`).run(sectorId, playerId, message),
  getSectorMessages: (sectorId: number, limit: number = 10) => db.prepare(`SELECT sm.id, sm.message, sm.createdAt, p.name as playerName FROM sector_messages sm LEFT JOIN players p ON sm.playerId = p.id WHERE sm.sectorId = ? ORDER BY sm.id DESC LIMIT ?`).all(sectorId, limit).reverse(),
  insertCompanyMessage: (companyId: string, playerId: string, message: string) => db.prepare(`INSERT INTO sector_messages (sectorId, playerId, message, createdAt) VALUES (-1, ?, ?, datetime('now'))`).run(playerId, message),
  getCompanyMessages: (companyId: string, limit: number = 10) => db.prepare(`SELECT sm.id, sm.message, sm.createdAt, p.name as playerName FROM sector_messages sm LEFT JOIN players p ON sm.playerId = p.id WHERE sm.sectorId = -1 AND p.companyId = ? ORDER BY sm.id DESC LIMIT ?`).all(companyId, limit).reverse(),
  createAlliance: (idA: string, idB: string) => db.prepare("INSERT INTO company_alliances (companyA, companyB, formedAt) VALUES (?, ?, datetime('now'))").run(idA, idB),
  getAlliances: (companyId: string) => db.prepare('SELECT * FROM company_alliances WHERE companyA = ? OR companyB = ?').all(companyId, companyId),
  insertGlobalEvent: (type: string, payload: string) => db.prepare(`INSERT INTO events (targetPlayerId, type, payload, createdAt) VALUES ('GLOBAL', ?, ?, datetime('now'))`).run(type, payload),
  getGlobalEvents: (limit: number = 5) => db.prepare(`SELECT id, type, payload, createdAt FROM events WHERE targetPlayerId = 'GLOBAL' ORDER BY id DESC LIMIT ?`).all(limit),
  getPlayerBounties: (playerId: string, companyId?: string | null) => companyId ? db.prepare('SELECT * FROM bounties WHERE (playerId = ? OR companyId = ?) AND completed = 0').all(playerId, companyId) : db.prepare('SELECT * FROM bounties WHERE playerId = ? AND completed = 0').all(playerId),
  createBounty: (bounty: any) => db.prepare(`INSERT INTO bounties (playerId, companyId, type, target, required, reward, expiresAt) VALUES (@playerId, @companyId, @type, @target, @required, @reward, @expiresAt)`).run(bounty),
  updateBountyProgress: (playerId: string, type: string, target: string, companyId?: string | null) => {
    db.prepare(`UPDATE bounties SET progress = progress + 1 WHERE (playerId = ? OR (companyId = ? AND companyId IS NOT NULL)) AND type = ? AND target = ? AND completed = 0`).run(playerId, companyId, type, target)
    const completed = db.prepare(`SELECT id, reward, companyId FROM bounties WHERE (playerId = ? OR (companyId = ? AND companyId IS NOT NULL)) AND type = ? AND target = ? AND progress >= required AND completed = 0`).all(playerId, companyId, type, target) as any[]
    for (const b of completed) {
      db.prepare('UPDATE bounties SET completed = 1 WHERE id = ?').run(b.id)
      if (b.companyId) dbOps.updateCompanyTreasury(b.companyId, b.reward); else dbOps.updatePlayerCredits(playerId, b.reward)
    }
    return completed.length > 0
  },
  getRankings: () => ({ netWorth: db.prepare(`SELECT name, (credits + (weaponLevel * 1000) + (shieldLevel * 1000)) as value FROM players ORDER BY value DESC LIMIT 10`).all(), kills: db.prepare('SELECT name, kills as value FROM players ORDER BY kills DESC LIMIT 10').all(), alignment: db.prepare('SELECT name, alignment as value FROM players ORDER BY ABS(alignment) DESC LIMIT 10').all(), companies: db.prepare('SELECT name, treasury as value FROM companies ORDER BY treasury DESC LIMIT 10').all() }),
  deploySectorAsset: (sectorId: number, playerId: string, type: string, quantity: number) => db.prepare(`INSERT INTO sector_deployments (sectorId, playerId, type, quantity, deployedAt) VALUES (?, ?, ?, ?, datetime('now'))`).run(sectorId, playerId, type, quantity),
  getSectorDeployments: (sectorId: number) => db.prepare(`SELECT sd.*, p.name as playerName, p.faction as playerFaction FROM sector_deployments sd LEFT JOIN players p ON sd.playerId = p.id WHERE sd.sectorId = ?`).all(sectorId),
  removeSectorDeployment: (id: number) => db.prepare('DELETE FROM sector_deployments WHERE id = ?').run(id),
  getNpc: (id: string) => db.prepare('SELECT * FROM npcs WHERE id = ?').get(id),
  getNpcsInSector: (sectorId: number) => db.prepare('SELECT * FROM npcs WHERE sectorId = ?').all(sectorId),
  updateNpcSector: (npcId: string, sectorId: number) => db.prepare('UPDATE npcs SET sectorId = ? WHERE id = ?').run(sectorId, npcId),
  updateNpcStats: (npcId: string, personality: string) => db.prepare('UPDATE npcs SET personality = ? WHERE id = ?').run(personality, npcId),
  addNpcMemory: (npcId: string, playerId: string, type: string, sentiment: number, details: string) => db.prepare(`INSERT INTO npc_memories (npcId, playerId, encounterType, sentiment, details, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))`).run(npcId, playerId, type, sentiment, details),
  getNpcMemories: (npcId: string, playerId: string) => db.prepare('SELECT * FROM npc_memories WHERE npcId = ? AND playerId = ? ORDER BY id DESC').all(npcId, playerId),
  getCompany: (id: string) => db.prepare('SELECT * FROM companies WHERE id = ?').get(id),
  getCompanyMembers: (companyId: string) => db.prepare(`SELECT cm.*, p.name as playerName, p.faction as playerFaction, p.level as playerLevel, p.lastSeen, p.lastLoginAt FROM company_members cm LEFT JOIN players p ON cm.playerId = p.id WHERE cm.companyId = ?`).all(companyId),
  createCompany: (company: any) => {
    db.transaction(() => {
      db.prepare(`INSERT INTO companies (id, name, ceoPlayerId, faction, createdAt) VALUES (@id, @name, @ceoPlayerId, @faction, @createdAt)`).run(company)
      db.prepare(`INSERT INTO company_members (companyId, playerId, role, joinedAt) VALUES (?, ?, 'ceo', ?)`).run(company.id, company.ceoPlayerId, company.createdAt)
      db.prepare('UPDATE players SET companyId = ? WHERE id = ?').run(company.id, company.ceoPlayerId)
    })()
  },
  updateCompanyTreasury: (companyId: string, amount: number) => db.prepare('UPDATE companies SET treasury = treasury + ? WHERE id = ?').run(amount, companyId),
  addCompanyMember: (companyId: string, playerId: string) => {
    db.transaction(() => {
      db.prepare(`INSERT INTO company_members (companyId, playerId, role, joinedAt) VALUES (?, ?, 'member', datetime('now'))`).run(companyId, playerId)
      db.prepare('UPDATE players SET companyId = ? WHERE id = ?').run(companyId, playerId)
    })()
  },
  getAvailableCompanies: () => db.prepare('SELECT * FROM companies').all(),
  getStocks: () => db.prepare('SELECT * FROM stocks').all(),
  updateStockPrices: () => {
    const stocks = db.prepare('SELECT * FROM stocks').all() as any[]
    const stmt = db.prepare('UPDATE stocks SET price = ?, prevPrice = ? WHERE symbol = ?')
    const histStmt = db.prepare("INSERT INTO stock_history (symbol, price, recordedAt) VALUES (?, ?, datetime('now'))")
    db.transaction(() => {
      stocks.forEach(s => { histStmt.run(s.symbol, s.price); const change = 1 + (Math.random() * s.volatility * 2 - s.volatility); const newPrice = Math.max(10, s.price * change); stmt.run(newPrice, s.price, s.symbol) })
    })()
  },
  getPlayerStocks: (playerId: string) => db.prepare(`SELECT ps.*, s.name, s.price as currentPrice FROM player_stocks ps JOIN stocks s ON ps.symbol = s.symbol WHERE ps.playerId = ?`).all(playerId),
  tradeStock: (playerId: string, symbol: string, quantity: number, price: number) => {
    const isBuy = quantity > 0
    return db.transaction(() => {
      if (isBuy) db.prepare(`INSERT INTO player_stocks (playerId, symbol, quantity, avgPrice) VALUES (?, ?, ?, ?) ON CONFLICT(playerId, symbol) DO UPDATE SET avgPrice = (avgPrice * quantity + ? * ?) / (quantity + ?), quantity = quantity + ?`).run(playerId, symbol, quantity, price, price, quantity, quantity, quantity)
      else {
        const current = db.prepare('SELECT quantity FROM player_stocks WHERE playerId = ? AND symbol = ?').get(playerId, symbol) as any
        if (!current || current.quantity < Math.abs(quantity)) throw new Error('Not enough shares')
        db.prepare('UPDATE player_stocks SET quantity = quantity + ? WHERE playerId = ? AND symbol = ?').run(quantity, playerId, symbol)
      }
    })()
  },
  createPlayerShip: (playerId: string, ship: any) => db.prepare(`INSERT INTO player_ships (playerId, shipDefId, name, shields, maxShields, fighters, holds) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(playerId, ship.templateId, ship.instanceName, ship.shields, ship.shields, ship.fighters, ship.holds),
  getPlayerShip: (playerId: string) => db.prepare('SELECT * FROM player_ships WHERE playerId = ? ORDER BY id DESC LIMIT 1').get(playerId),
  updatePlanetPort: (planetId: string, hasPort: boolean, prices: string) => db.prepare('UPDATE planets SET hasPort = ?, portPrices = ? WHERE id = ?').run(hasPort ? 1 : 0, prices, planetId),
  insertStockHistory: (symbol: string, price: number) => db.prepare("INSERT INTO stock_history (symbol, price, recordedAt) VALUES (?, ?, datetime('now'))").run(symbol, price),
  getStockHistory: (symbol: string, limit: number = 20) => db.prepare('SELECT price FROM stock_history WHERE symbol = ? ORDER BY recordedAt DESC LIMIT ?').all(symbol, limit).reverse(),
  getShipTemplates: () => db.prepare('SELECT * FROM ship_templates ORDER BY tier ASC, name ASC').all(),
  addShipTemplate: (template: any) => db.prepare(`INSERT INTO ship_templates (id, name, baseHolds, baseShields, baseFighters, baseCost, description, tier, isCustom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(template.id, template.name, template.baseHolds, template.baseShields, template.baseFighters, template.baseCost, template.description, template.tier),
  deleteShipTemplate: (id: string) => db.prepare('DELETE FROM ship_templates WHERE id = ?').run(id),
  getShipModifiers: (type?: string) => type ? db.prepare('SELECT * FROM ship_modifiers WHERE type = ?').all(type) : db.prepare('SELECT * FROM ship_modifiers').all(),
  addShipModifier: (mod: any) => db.prepare(`INSERT INTO ship_modifiers (name, type, holdsMod, shieldsMod, fightersMod, costMod, description) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(mod.name, mod.type, mod.holdsMod, mod.shieldsMod, mod.fightersMod, mod.costMod, mod.description),
  deleteShipModifier: (id: number) => db.prepare('DELETE FROM ship_modifiers WHERE id = ?').run(id),
  getAllStarCards: () => db.prepare('SELECT * FROM star_cards').all(),
  getPlayerCards: (playerId: string) => db.prepare(`SELECT pc.id as instanceId, pc.level, pc.equipped, pc.acquiredAt, sc.* FROM player_cards pc JOIN star_cards sc ON pc.cardId = sc.id WHERE pc.playerId = ?`).all(playerId),
  addPlayerCard: (playerId: string, cardId: string) => db.prepare(`INSERT INTO player_cards (playerId, cardId, acquiredAt) VALUES (?, ?, datetime('now'))`).run(playerId, cardId),
  equipPlayerCard: (instanceId: number, equipped: boolean) => db.prepare('UPDATE player_cards SET equipped = ? WHERE id = ?').run(equipped ? 1 : 0, instanceId),
  buyCardPack: (playerId: string, rarityWeights: Record<string, number>) => {
    const allCards = db.prepare('SELECT id, rarity FROM star_cards').all() as any[]
    const drawn: string[] = []
    for (let i = 0; i < 3; i++) {
      const roll = Math.random()
      let rarity = 'common'
      if (roll < 0.01) rarity = 'legendary'; else if (roll < 0.05) rarity = 'epic'; else if (roll < 0.15) rarity = 'rare'; else if (roll < 0.40) rarity = 'uncommon'
      const pool = allCards.filter(c => c.rarity === rarity)
      const choice = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : allCards[Math.floor(Math.random() * allCards.length)]
      drawn.push(choice.id); dbOps.addPlayerCard(playerId, choice.id)
    }
    return drawn
  },
  addStarCardDefinition: (card: any) => {
    return db.prepare(`
      INSERT INTO star_cards (id, name, type, preferredRow, rarity, power, effect, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(card.id, card.name, card.type, card.preferredRow, card.rarity, card.power, card.effect, card.description)
  },
  updateStarCardDefinition: (id: string, card: any) => {
    return db.prepare(`
      UPDATE star_cards 
      SET name = ?, type = ?, preferredRow = ?, rarity = ?, power = ?, effect = ?, description = ?
      WHERE id = ?
    `).run(card.name, card.type, card.preferredRow, card.rarity, card.power, card.effect, card.description, id)
  },
  deleteStarCardDefinition: (id: string) => {
    return db.prepare('DELETE FROM star_cards WHERE id = ?').run(id)
  },
  combineCards: (playerId: string, cardId: string) => {
    const instances = db.prepare('SELECT id FROM player_cards WHERE playerId = ? AND cardId = ? AND level = 1 LIMIT 2').all(playerId, cardId)
    if (instances.length < 2) throw new Error('Need at least 2 Level 1 cards to combine.')
    
    return db.transaction(() => {
      // Delete one, upgrade the other
      db.prepare('DELETE FROM player_cards WHERE id = ?').run(instances[1].id)
      db.prepare('UPDATE player_cards SET level = level + 1 WHERE id = ?').run(instances[0].id)
    })()
  },
  transferCard: (instanceId: number, fromPlayerId: string, toPlayerId: string) => {
    return db.prepare('UPDATE player_cards SET playerId = ?, equipped = 0 WHERE id = ? AND playerId = ?').run(toPlayerId, instanceId, fromPlayerId)
  },
  getPlanetBuildings: (planetId: string) => {
    return db.prepare('SELECT * FROM planet_buildings WHERE planetId = ?').all(planetId)
  },
  buildOnPlanet: (planetId: string, type: string) => {
    return db.prepare(`
      INSERT INTO planet_buildings (planetId, type, builtAt)
      VALUES (?, ?, datetime('now'))
    `).run(planetId, type)
  },
  upgradeBuilding: (buildingId: number) => {
    return db.prepare('UPDATE planet_buildings SET level = level + 1 WHERE id = ?').run(buildingId)
  },
  updatePlanetCustoms: (planetId: string, description: string, ascii: string) => {
    return db.prepare('UPDATE planets SET customDescription = ?, customAscii = ? WHERE id = ?').run(description, ascii, planetId)
  },
  getSpaceStations: (sectorId: number) => {
    return db.prepare('SELECT ss.*, p.name as ownerName FROM space_stations ss JOIN players p ON ss.playerId = p.id WHERE ss.sectorId = ?').all(sectorId)
  },
  addSpaceStation: (sectorId: number, playerId: string, name: string, type: string) => {
    return db.prepare(`
      INSERT INTO space_stations (sectorId, playerId, name, type, builtAt)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(sectorId, playerId, name, type)
  },
  getResourceNodes: (sectorId: number) => {
    return db.prepare('SELECT * FROM resource_nodes WHERE sectorId = ? AND isDepleted = 0').all(sectorId)
  },
  processAutomatedMining: () => {
    const stations = db.prepare('SELECT sectorId, playerId FROM space_stations').all() as any[]
    const nodes = db.prepare('SELECT * FROM resource_nodes WHERE isDepleted = 0').all() as any[]
    
    db.transaction(() => {
      stations.forEach(s => {
        const localNodes = nodes.filter(n => n.sectorId === s.sectorId)
        localNodes.forEach(node => {
          const yieldAmount = Math.floor(10 * node.abundance)
          dbOps.updatePlayerCargo(s.playerId, node.commodity, yieldAmount)
          db.prepare('UPDATE resource_nodes SET abundance = abundance - 0.05 WHERE id = ?').run(node.id)
          if (node.abundance <= 0.05) db.prepare('UPDATE resource_nodes SET isDepleted = 1 WHERE id = ?').run(node.id)
        })
      })
    })()
  },
  updateSectorPortInventory: (sectorId: number, inventory: string) => {
    return db.prepare('UPDATE sectors SET portInventory = ? WHERE id = ?').run(inventory, sectorId)
  },
  processEconomyRecovery: () => {
    const sectors = db.prepare('SELECT id, portType, portInventory FROM sectors WHERE portInventory IS NOT NULL').all() as any[]
    db.transaction(() => {
      sectors.forEach(s => {
        const inv = JSON.parse(s.portInventory)
        let changed = false
        Object.keys(inv).forEach(comm => {
          const item = inv[comm]
          // Stocks drift toward 1000
          if (item.stock < 1000) { item.stock += 10; changed = true }
          else if (item.stock > 1000) { item.stock -= 10; changed = true }
        })
        if (changed) {
          dbOps.updateSectorPortInventory(s.id, JSON.stringify(inv))
        }
      })
    })()
  },
  getRecentNews: (limit: number = 10) => {
    return db.prepare('SELECT * FROM news ORDER BY id DESC LIMIT ?').all(limit)
  },
  addNewsItem: (headline: string, body: string, category: string = 'GENERAL') => {
    return db.prepare("INSERT INTO news (headline, body, category, createdAt) VALUES (?, ?, ?, datetime('now'))").run(headline, body, category)
  },
  generateDailyNews: () => {
    // 1. War News (Recent Player Kills)
    const kills = db.prepare("SELECT count(*) as count FROM events WHERE type = 'PLAYER_KILLED' AND createdAt > datetime('now', '-24 hours')").get().count
    if (kills > 0) {
      dbOps.addNewsItem('WAR REPORT: Sector Conflict Rising', `Starfleet confirms ${kills} ship destructions in the last cycle. Tactical alerts issued.`, 'WAR')
    }

    // 2. Economy News (Stock shifts)
    const stocks = db.prepare('SELECT symbol, price, prevPrice FROM stocks').all() as any[]
    if (stocks.length > 0) {
      const biggest = stocks.reduce((prev, curr) => Math.abs(curr.price - curr.prevPrice) > Math.abs(prev.price - prev.prevPrice) ? curr : prev)
      const dir = biggest.price > biggest.prevPrice ? 'surged' : 'plummeted'
      dbOps.addNewsItem(`ECONOMY: ${biggest.symbol} Market Volatility`, `Shares in ${biggest.symbol} have ${dir} significantly. Traders are advised to re-evaluate portfolios.`, 'ECONOMY')
    }

    // 3. Social
    const comps = db.prepare("SELECT count(*) as count FROM companies WHERE createdAt > datetime('now', '-24 hours')").get().count
    if (comps > 0) {
      dbOps.addNewsItem('GALACTIC GROWTH: New Enterprises', `The Registrar reports ${comps} new company charters issued in the last cycle.`, 'SOCIAL')
    }
  }
}
