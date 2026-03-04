import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDb, dbOps, getDb } from './db'
import { getSceneViewModel, toSerializable } from '../engine/scenes'
import { GameState, HudStats } from '../engine/types'
import { getRandomShipyardStock } from '../engine/ships'

let currentState: GameState = {
  player: null,
  currentSector: null,
  currentScene: 'title',
  lastMessage: null,
  currentPlanets: [],
  selectedPlanetId: null,
  combat: null,
  onlinePlayers: [],
  chatMessages: [],
  globalEvents: [],
  rankings: null,
  bounties: [],
  currentCompany: null,
  companyMembers: [],
  availableCompanies: [],
  companyChatMessages: [],
  companyAlliances: [],
  playerCargo: [],
  stocks: [],
  playerPortfolio: [],
  shipyardStock: getRandomShipyardStock(5)
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const getHudStats = (): HudStats | null => {
  if (!currentState.player) return null
  return {
    playerName: currentState.player.name,
    shipName: currentState.player.shipId || 'Escape Pod',
    turns: currentState.player.turns,
    maxTurns: currentState.player.maxTurns,
    credits: currentState.player.credits,
    sectorId: currentState.player.sectorId,
    alignment: currentState.player.alignment
  }
}

const returnSerializedScene = () => {
  let playerList: { id: string, name: string }[] | undefined
  if (currentState.currentScene === 'login') {
    playerList = dbOps.getAllPlayers()
  }
  
  if (currentState.player) {
    currentState.bounties = dbOps.getPlayerBounties(currentState.player.id, currentState.player.companyId) as any
    currentState.playerCargo = dbOps.getPlayerCargo(currentState.player.id) as any
    currentState.stocks = dbOps.getStocks() as any
    currentState.playerPortfolio = dbOps.getPlayerStocks(currentState.player.id) as any
    
    if (currentState.player.companyId) {
      currentState.currentCompany = dbOps.getCompany(currentState.player.companyId) as any
      currentState.companyMembers = dbOps.getCompanyMembers(currentState.player.companyId) as any
      currentState.companyChatMessages = dbOps.getCompanyMessages(currentState.player.companyId) as any
      currentState.companyAlliances = dbOps.getAlliances(currentState.player.companyId) as any
    } else {
      currentState.currentCompany = null
      currentState.companyMembers = []
      currentState.companyChatMessages = []
      currentState.companyAlliances = []
    }
  }
  
  if (currentState.currentScene === 'company') {
    currentState.availableCompanies = dbOps.getAvailableCompanies() as any
  }
  if (currentState.currentScene === 'rankings') {
    currentState.rankings = dbOps.getRankings() as any
  }

  return toSerializable(
    getSceneViewModel(currentState), 
    currentState.lastMessage, 
    currentState.selectedPlanetId, 
    playerList, 
    currentState.onlinePlayers, 
    currentState.chatMessages, 
    currentState.globalEvents, 
    currentState.rankings, 
    currentState.bounties, 
    currentState.currentCompany, 
    currentState.companyMembers, 
    currentState.availableCompanies, 
    currentState.companyChatMessages, 
    currentState.companyAlliances, 
    currentState.playerCargo, 
    getHudStats(), 
    currentState.stocks, 
    currentState.playerPortfolio,
    currentState.shipyardStock
  )
}

app.whenReady().then(() => {
  initDb()
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Stock Market Fluctuation (Every 5 minutes)
  setInterval(() => {
    dbOps.updateStockPrices()
    dbOps.insertGlobalEvent('STOCK_UPDATE', 'Galactic markets have shifted. Check the Exchange for updated prices.')
  }, 300000)

  // Shipyard Stock Rotation (Every 10 minutes)
  setInterval(() => {
    currentState.shipyardStock = getRandomShipyardStock(5)
    dbOps.insertGlobalEvent('SHIPYARD_UPDATE', 'New ship hulls have arrived at the Galactic Showroom.')
  }, 600000)

  ipcMain.handle('get-scene', () => returnSerializedScene())

  ipcMain.handle('execute-action', async (event, key: string) => {
    const db = getDb()
    const vm = getSceneViewModel(currentState)
    const option = vm.options.find((o) => o.key === key)
    
    if (option) {
      const oldScene = currentState.currentScene
      const newState = await option.action(currentState)
      
      if (newState) {
        if (newState.currentScene !== oldScene) {
          newState.lastMessage = null
        }

        // Handle Ship Purchase Persistence
        if (newState.pendingShipPurchase) {
          console.log('Persisting ship purchase:', newState.pendingShipPurchase.instanceName)
          dbOps.createPlayerShip(newState.player!.id, newState.pendingShipPurchase)
          newState.pendingShipPurchase = null // Clear after persistence
        }

        if (newState.player && newState.player !== currentState.player) {
          const p = newState.player
          db.prepare(`
            UPDATE players SET 
              credits = ?, 
              turns = ?, 
              sectorId = ?, 
              shields = ?, 
              weaponLevel = ?, 
              shieldLevel = ?, 
              engineLevel = ?,
              alignment = ?,
              kills = ?,
              companyId = ?,
              shipId = ?,
              maxTurns = ?
            WHERE id = ?
          `).run(p.credits, p.turns, p.sectorId, p.shields, p.weaponLevel, p.shieldLevel, p.engineLevel, p.alignment, p.kills || 0, p.companyId, p.shipId, p.maxTurns, p.id)
          
          if (p.sectorId !== currentState.player?.sectorId) {
            const sectorData = dbOps.getSector(p.sectorId)
            newState.currentSector = {
              ...sectorData,
              warps: JSON.parse(sectorData.warps)
            }
            newState.currentPlanets = dbOps.getPlanetsBySector(p.sectorId)
          }
        }
        currentState = newState
      }
    }
    
    return returnSerializedScene()
  })

  ipcMain.handle('poll-state', async () => {
    if (currentState.player) {
      const db = getDb()
      dbOps.updatePlayerHeartbeat(currentState.player.id)
      currentState.onlinePlayers = dbOps.getOnlinePlayersInSector(currentState.player.sectorId, currentState.player.id) as any
      currentState.chatMessages = dbOps.getSectorMessages(currentState.player.sectorId) as any
      currentState.globalEvents = dbOps.getGlobalEvents() as any
      
      if (Math.random() < 0.1) {
        const wanderingNpcs = db.prepare("SELECT * FROM npcs WHERE scheduleType IN ('wanderer', 'patrol')").all() as any[]
        for (const npc of wanderingNpcs) {
          const currentSector = dbOps.getSector(npc.sectorId)
          if (currentSector) {
            const warps = JSON.parse(currentSector.warps)
            const nextSector = warps[Math.floor(Math.random() * warps.length)]
            dbOps.updateNpcSector(npc.id, nextSector)
          }
        }
      }

      const allOnline = db.prepare("SELECT count(*) as count FROM players WHERE lastSeen > datetime('now', '-60 seconds')").get().count
      if (allOnline >= 2 && Math.random() < 0.05) {
        const payloads = [
          'A massive trade convoy has been spotted passing through the Neutral rim!',
          'Solar flares are disrupting warp signatures across the galaxy.',
          'A strange alien signal is broadcasting from deep space.'
        ]
        dbOps.insertGlobalEvent('MULTINODE_EVENT', payloads[Math.floor(Math.random() * payloads.length)])
      }
    }
    return returnSerializedScene()
  })

  ipcMain.handle('trade-commodity', async (event, name: string, quantity: number, price: number) => {
    if (!currentState.player) return
    const db = getDb()
    const qty = parseInt(quantity as any) || 0
    const prc = parseInt(price as any) || 0
    const isBuying = qty > 0
    const total = Math.abs(qty) * prc
    
    if (isBuying) {
      if (currentState.player.credits >= total) {
        currentState.player.credits -= total
        dbOps.updatePlayerCargo(currentState.player.id, name, qty)
        currentState.lastMessage = `Purchased ${qty} unit(s) of ${name.toUpperCase()} for ${total} cr.`
      } else {
        currentState.lastMessage = 'Not enough credits!'
      }
    } else { // Selling
      const cargo = dbOps.getPlayerCargo(currentState.player.id) as any[]
      const item = cargo.find(c => c.commodity === name)
      if (item && item.quantity >= Math.abs(qty)) {
        currentState.player.credits += total
        dbOps.updatePlayerCargo(currentState.player.id, name, qty) 
        currentState.lastMessage = `Sold ${Math.abs(qty)} unit(s) of ${name.toUpperCase()} for ${total} cr.`
      } else {
        currentState.lastMessage = 'Not enough cargo to sell!'
      }
    }
    
    db.prepare('UPDATE players SET credits = ? WHERE id = ?').run(currentState.player.credits, currentState.player.id)
    return returnSerializedScene()
  })

  ipcMain.handle('trade-stock', async (event, symbol: string, quantity: number, price: number) => {
    if (!currentState.player) return
    const db = getDb()
    const qty = parseInt(quantity as any) || 0
    const prc = parseFloat(price as any) || 0
    const isBuying = qty > 0
    const total = Math.round(Math.abs(qty) * prc)

    try {
      if (isBuying) {
        if (currentState.player.credits >= total) {
          dbOps.tradeStock(currentState.player.id, symbol, qty, prc)
          currentState.player.credits -= total
          currentState.lastMessage = `Bought ${qty} shares of ${symbol} for ${total} cr.`
        } else {
          currentState.lastMessage = 'Insufficient credits for stock purchase.'
        }
      } else {
        dbOps.tradeStock(currentState.player.id, symbol, qty, prc)
        currentState.player.credits += total
        currentState.lastMessage = `Sold ${Math.abs(qty)} shares of ${symbol} for ${total} cr.`
      }
      
      db.prepare('UPDATE players SET credits = ? WHERE id = ?').run(currentState.player.credits, currentState.player.id)
    } catch (e: any) {
      currentState.lastMessage = `Stock trade failed: ${e.message}`
    }

    return returnSerializedScene()
  })

  ipcMain.handle('send-message', async (event, message: string) => {
    if (currentState.player) {
      dbOps.insertSectorMessage(currentState.player.sectorId, currentState.player.id, message)
    }
    return returnSerializedScene()
  })

  ipcMain.handle('send-company-message', async (event, message: string) => {
    if (currentState.player && currentState.player.companyId) {
      dbOps.insertCompanyMessage(currentState.player.companyId, currentState.player.id, message)
    }
    return returnSerializedScene()
  })

  ipcMain.handle('create-character', async (event, name: string, faction: string) => {
    const player = {
      id: Math.random().toString(36).substring(7),
      name,
      faction,
      alignment: faction === 'alliance' ? 200 : faction === 'empire' ? -200 : 0,
      credits: 1000,
      turns: 75,
      maxTurns: 75,
      createdAt: new Date().toISOString()
    }
    dbOps.createPlayer(player)
    dbOps.updatePlayerLastLogin(player.id)
    
    const startingSectorId = faction === 'empire' ? 500 : 1
    const sectorData = dbOps.getSector(startingSectorId)
    const planets = dbOps.getPlanetsBySector(startingSectorId)
    
    currentState.player = {
      ...player,
      sectorId: startingSectorId,
      hp: 100,
      maxHp: 100,
      shields: 0,
      experience: 0,
      level: 1,
      shipId: null,
      faction: player.faction as any,
      weaponLevel: 1,
      shieldLevel: 1,
      engineLevel: 1,
      kills: 0,
      companyId: null
    }
    currentState.currentSector = {
      ...sectorData,
      warps: JSON.parse(sectorData.warps)
    }
    currentState.currentPlanets = planets
    currentState.currentScene = 'bridge'
    currentState.lastMessage = `Welcome, ${name}!`
    dbOps.insertGlobalEvent('NEW_PLAYER', `Captain ${name} has entered the galaxy.`)
    
    dbOps.createBounty({
      playerId: currentState.player.id,
      companyId: null,
      type: 'kill',
      target: 'npc_vex',
      required: 1,
      reward: 500,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    })

    return returnSerializedScene()
  })

  ipcMain.handle('login-id', async (event, playerId: string) => {
    const db = getDb()
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId) as any
    
    if (!player) {
      currentState.lastMessage = `Pilot record not found.`
      return returnSerializedScene()
    }

    dbOps.updatePlayerLastLogin(player.id)
    const sectorData = dbOps.getSector(player.sectorId)
    const planets = dbOps.getPlanetsBySector(player.sectorId)

    currentState.player = {
      ...player,
      hp: player.hp || 100,
      maxHp: player.maxHp || 100,
      shields: player.shields || 0,
      faction: player.faction as any,
      weaponLevel: player.weaponLevel || 1,
      shieldLevel: player.shieldLevel || 1,
      engineLevel: player.engineLevel || 1,
      kills: player.kills || 0,
      companyId: player.companyId
    }
    currentState.currentSector = {
      ...sectorData,
      warps: JSON.parse(sectorData.warps)
    }
    currentState.currentPlanets = planets
    currentState.currentScene = 'bridge'
    currentState.lastMessage = `Welcome back, Captain ${player.name}.`
    dbOps.insertGlobalEvent('PLAYER_LOGIN', `Captain ${player.name} has resumed command.`)
    return returnSerializedScene()
  })

  ipcMain.handle('login', async (event, name: string) => {
    const db = getDb()
    const player = db.prepare('SELECT * FROM players WHERE name = ?').get(name) as any
    
    if (!player) {
      currentState.lastMessage = `Pilot "${name}" not found.`
      return returnSerializedScene()
    }

    dbOps.updatePlayerLastLogin(player.id)
    const sectorData = dbOps.getSector(player.sectorId)
    const planets = dbOps.getPlanetsBySector(player.sectorId)

    currentState.player = {
      ...player,
      hp: player.hp || 100,
      maxHp: player.maxHp || 100,
      shields: player.shields || 0,
      faction: player.faction as any,
      weaponLevel: player.weaponLevel || 1,
      shieldLevel: player.shieldLevel || 1,
      engineLevel: player.engineLevel || 1,
      kills: player.kills || 0,
      companyId: player.companyId
    }
    currentState.currentSector = {
      ...sectorData,
      warps: JSON.parse(sectorData.warps)
    }
    currentState.currentPlanets = planets
    currentState.currentScene = 'bridge'
    currentState.lastMessage = `Welcome back, Captain ${player.name}.`
    dbOps.insertGlobalEvent('PLAYER_LOGIN', `Captain ${player.name} has resumed command.`)
    return returnSerializedScene()
  })

  ipcMain.handle('claim-planet', async (event, planetId: string) => {
    if (!currentState.player) return
    dbOps.claimPlanet(planetId, currentState.player.id, 'player')
    currentState.currentPlanets = dbOps.getPlanetsBySector(currentState.player.sectorId)
    currentState.lastMessage = 'Planet claimed!'
    const planet = currentState.currentPlanets.find(p => p.id === planetId)
    dbOps.insertGlobalEvent('PLANET_CLAIM', `Captain ${currentState.player.name} claimed ${planet?.name} in Sector ${currentState.player.sectorId}.`)
    return returnSerializedScene()
  })

  ipcMain.handle('create-company', async (event, name: string) => {
    if (!currentState.player || currentState.player.credits < 5000) {
      currentState.lastMessage = 'Insufficient credits to form a company (5000 required).'
      return returnSerializedScene()
    }
    
    const company = {
      id: Math.random().toString(36).substring(7),
      name,
      ceoPlayerId: currentState.player.id,
      faction: currentState.player.faction,
      createdAt: new Date().toISOString()
    }
    
    dbOps.createCompany(company)
    currentState.player.credits -= 5000
    currentState.player.companyId = company.id
    currentState.lastMessage = `Company "${name}" formed successfully!`
    dbOps.insertGlobalEvent('COMPANY_FORMED', `A new company, "${name}", has been established by Captain ${currentState.player.name}.`)
    
    dbOps.createBounty({
      playerId: null,
      companyId: company.id,
      type: 'kill',
      target: 'npc_vex',
      required: 5,
      reward: 2500,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    })

    return returnSerializedScene()
  })

  ipcMain.handle('join-company', async (event, companyId: string) => {
    if (!currentState.player) return
    dbOps.addCompanyMember(companyId, currentState.player.id)
    currentState.player.companyId = companyId
    const company = dbOps.getCompany(companyId) as any
    currentState.lastMessage = `You have joined ${company.name}.`
    dbOps.insertGlobalEvent('COMPANY_JOIN', `Captain ${currentState.player.name} has joined ${company.name}.`)
    return returnSerializedScene()
  })

  ipcMain.handle('deposit-treasury', async (event, amount: number) => {
    if (!currentState.player || !currentState.player.companyId || currentState.player.credits < amount) {
      currentState.lastMessage = 'Insufficient credits or not in a company.'
      return returnSerializedScene()
    }
    
    dbOps.updateCompanyTreasury(currentState.player.companyId, amount)
    currentState.player.credits -= amount
    getDb().prepare('UPDATE players SET credits = ? WHERE id = ?').run(currentState.player.credits, currentState.player.id)
    currentState.lastMessage = `Deposited ${amount} credits to company treasury.`
    return returnSerializedScene()
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
