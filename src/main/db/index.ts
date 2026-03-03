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
  const count = db.prepare('SELECT count(*) as count FROM sectors').get().count
  if (count === 0) {
    console.log('Generating initial galaxy...')
    const sectors = generateGalaxy(500)
    const insert = db.prepare(`
      INSERT INTO sectors (id, name, type, warps, portType)
      VALUES (@id, @name, @type, @warps, @portType)
    `)
    const insertMany = db.transaction((data) => {
      for (const d of data) {
        insert.run({
          ...d,
          warps: JSON.stringify(d.warps)
        })
      }
    })
    insertMany(sectors)
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
  }
}
