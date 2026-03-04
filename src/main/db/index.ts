import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { generateGalaxy } from '../../engine/galaxy'

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
            population: 0,
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
        playerId TEXT NOT NULL,
        type TEXT NOT NULL,
        target TEXT,
        required INTEGER NOT NULL,
        progress INTEGER DEFAULT 0,
        reward INTEGER NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        expiresAt TEXT NOT NULL
      )
    `)
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
  getOnlinePlayersInSector: (sectorId: number, excludePlayerId: string) => {
    // Online in the last 2 minutes (120 seconds)
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
    `).run(playerId, message) // Using sectorId -1 for company chat
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
    return db.prepare('INSERT INTO company_alliances (companyA, companyB, formedAt) VALUES (?, ?, datetime("now"))').run(idA, idB)
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
  getPlayerBounties: (playerId: string) => {
    return db.prepare('SELECT * FROM bounties WHERE playerId = ? AND completed = 0').all(playerId)
  },
  createBounty: (bounty: any) => {
    const stmt = db.prepare(`
      INSERT INTO bounties (playerId, type, target, required, reward, expiresAt)
      VALUES (@playerId, @type, @target, @required, @reward, @expiresAt)
    `)
    return stmt.run(bounty)
  },
  updateBountyProgress: (playerId: string, type: string, target: string) => {
    // Increment progress for matching bounties
    db.prepare(`
      UPDATE bounties 
      SET progress = progress + 1 
      WHERE playerId = ? AND type = ? AND target = ? AND completed = 0
    `).run(playerId, type, target)

    // Mark as completed if requirement met
    const completed = db.prepare(`
      SELECT id, reward FROM bounties 
      WHERE playerId = ? AND type = ? AND target = ? AND progress >= required AND completed = 0
    `).all(playerId, type, target) as any[]

    for (const b of completed) {
      db.prepare('UPDATE bounties SET completed = 1 WHERE id = ?').run(b.id)
      db.prepare('UPDATE players SET credits = credits + ? WHERE id = ?').run(b.reward, playerId)
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
      alignment: db.prepare('SELECT name, alignment as value FROM players ORDER BY ABS(alignment) DESC LIMIT 10').all()
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
  getCompany: (id: string) => {
    return db.prepare('SELECT * FROM companies WHERE id = ?').get(id)
  },
  getCompanyMembers: (companyId: string) => {
    return db.prepare(`
      SELECT cm.*, p.name as playerName, p.faction as playerFaction, p.level as playerLevel, p.lastSeen
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
  }
}
