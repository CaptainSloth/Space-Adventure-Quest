import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDb, dbOps, getDb } from './db'
import { getSceneViewModel, toSerializable } from '../engine/scenes'
import { GameState } from '../engine/types'

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
  bounties: []
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
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

app.whenReady().then(() => {
  console.log('App: ready, initializing DB...')
  initDb()
  console.log('App: DB initialized.')
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('get-scene', () => {
    let playerList: { id: string, name: string }[] | undefined
    if (currentState.currentScene === 'login') {
      playerList = dbOps.getAllPlayers()
    }
    if (currentState.player) {
      currentState.bounties = dbOps.getPlayerBounties(currentState.player.id) as any
    }
    if (currentState.currentScene === 'rankings') {
      currentState.rankings = dbOps.getRankings() as any
    }
    return toSerializable(getSceneViewModel(currentState), currentState.lastMessage, currentState.selectedPlanetId, playerList, currentState.onlinePlayers, currentState.chatMessages, currentState.globalEvents, currentState.rankings, currentState.bounties)
  })
ipcMain.handle('execute-action', async (_, key: string) => {
  const db = getDb()
  const vm = getSceneViewModel(currentState)
  const option = vm.options.find((o) => o.key === key)

  if (option) {
    // Clear last message when taking an action that changes scenes
    const oldScene = currentState.currentScene
    const newState = await option.action(currentState)

    if (newState) {
      if (newState.currentScene !== oldScene) {
        newState.lastMessage = null
      }

      // Persist Player State if changed
      if (newState.player && newState.player !== currentState.player) {
// ... (rest of the persist logic)

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
              kills = ?
            WHERE id = ?
          `).run(p.credits, p.turns, p.sectorId, p.shields, p.weaponLevel, p.shieldLevel, p.engineLevel, p.alignment, p.kills || 0, p.id)
          
          // If sector changed, update planets
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
    
    let playerList: { id: string, name: string }[] | undefined
    if (currentState.currentScene === 'login') {
      playerList = dbOps.getAllPlayers()
    }
    if (currentState.player) {
      currentState.bounties = dbOps.getPlayerBounties(currentState.player.id) as any
    }
    if (currentState.currentScene === 'rankings') {
      currentState.rankings = dbOps.getRankings() as any
    }
    return toSerializable(getSceneViewModel(currentState), currentState.lastMessage, currentState.selectedPlanetId, playerList, currentState.onlinePlayers, currentState.chatMessages, currentState.globalEvents, currentState.rankings, currentState.bounties)
  })

  ipcMain.handle('poll-state', async () => {
    if (currentState.player) {
      dbOps.updatePlayerHeartbeat(currentState.player.id)
      currentState.onlinePlayers = dbOps.getOnlinePlayersInSector(currentState.player.sectorId, currentState.player.id) as any
      currentState.chatMessages = dbOps.getSectorMessages(currentState.player.sectorId) as any
      currentState.globalEvents = dbOps.getGlobalEvents() as any
      currentState.bounties = dbOps.getPlayerBounties(currentState.player.id) as any
      
      // Multinode-only events (if 2+ players online)
      const allOnline = db.prepare("SELECT count(*) as count FROM players WHERE lastSeen > datetime('now', '-60 seconds')").get().count
      if (allOnline >= 2 && Math.random() < 0.05) { // 5% chance per poll
        const eventType = 'MULTINODE_EVENT'
        const payloads = [
          'A massive trade convoy has been spotted passing through the Neutral rim!',
          'Solar flares are disrupting warp signatures across the galaxy.',
          'A strange alien signal is broadcasting from deep space.'
        ]
        dbOps.insertGlobalEvent(eventType, payloads[Math.floor(Math.random() * payloads.length)])
      }

      if (currentState.currentScene === 'rankings') {
        currentState.rankings = dbOps.getRankings() as any
      }
    }
    return toSerializable(getSceneViewModel(currentState), currentState.lastMessage, currentState.selectedPlanetId, undefined, currentState.onlinePlayers, currentState.chatMessages, currentState.globalEvents, currentState.rankings, currentState.bounties)
  })

  ipcMain.handle('send-message', async (_, message: string) => {
    if (currentState.player) {
      dbOps.insertSectorMessage(currentState.player.sectorId, currentState.player.id, message)
      currentState.chatMessages = dbOps.getSectorMessages(currentState.player.sectorId) as any
    }
    return toSerializable(getSceneViewModel(currentState), currentState.lastMessage, currentState.selectedPlanetId, undefined, currentState.onlinePlayers, currentState.chatMessages, currentState.globalEvents, currentState.rankings, currentState.bounties)
  })

  ipcMain.handle('create-character', async (_, name: string, faction: string) => {
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
      kills: 0
    }
    currentState.currentSector = {
      ...sectorData,
      warps: JSON.parse(sectorData.warps)
    }
    currentState.currentPlanets = planets
    currentState.currentScene = 'bridge'
    currentState.lastMessage = `Welcome, ${name}!`
    dbOps.insertGlobalEvent('NEW_PLAYER', `Captain ${name} has entered the galaxy.`)
    
    // Generate initial bounty
    dbOps.createBounty({
      playerId: currentState.player.id,
      type: 'kill',
      target: 'npc_vex',
      required: 1,
      reward: 500,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    })

    return toSerializable(getSceneViewModel(currentState), currentState.lastMessage, currentState.selectedPlanetId, undefined, currentState.onlinePlayers, currentState.chatMessages, currentState.globalEvents, currentState.rankings, currentState.bounties)
  })

  ipcMain.handle('login-id', async (_, playerId: string) => {
    console.log('IPC: login called for ID:', playerId)
    const db = getDb()
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId) as any
    
    if (!player) {
      currentState.lastMessage = `Pilot record not found.`
      return toSerializable(getSceneViewModel(currentState), currentState.lastMessage, currentState.selectedPlanetId, undefined, currentState.onlinePlayers, currentState.chatMessages, currentState.globalEvents, currentState.rankings, currentState.bounties)
    }

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
      kills: player.kills || 0
    }
    currentState.currentSector = {
      ...sectorData,
      warps: JSON.parse(sectorData.warps)
    }
    currentState.currentPlanets = planets
    currentState.currentScene = 'bridge'
    currentState.lastMessage = `Welcome back, Captain ${player.name}.`
    dbOps.insertGlobalEvent('PLAYER_LOGIN', `Captain ${player.name} has resumed command.`)
    return toSerializable(getSceneViewModel(currentState), currentState.lastMessage, currentState.selectedPlanetId, undefined, currentState.onlinePlayers, currentState.chatMessages, currentState.globalEvents, currentState.rankings, currentState.bounties)
  })

  ipcMain.handle('claim-planet', async (_, planetId: string) => {
    if (!currentState.player) return
    dbOps.claimPlanet(planetId, currentState.player.id, 'player')
    currentState.currentPlanets = dbOps.getPlanetsBySector(currentState.player.sectorId)
    currentState.lastMessage = 'Planet claimed!'
    const planet = currentState.currentPlanets.find(p => p.id === planetId)
    dbOps.insertGlobalEvent('PLANET_CLAIM', `Captain ${currentState.player.name} claimed ${planet?.name} in Sector ${currentState.player.sectorId}.`)
    return toSerializable(getSceneViewModel(currentState), currentState.lastMessage, currentState.selectedPlanetId, undefined, currentState.onlinePlayers, currentState.chatMessages, currentState.globalEvents, currentState.rankings, currentState.bounties)
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
