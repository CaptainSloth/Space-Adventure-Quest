import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDb, dbOps } from './db'
import { getSceneViewModel, toSerializable } from '../engine/scenes'
import { GameState } from '../engine/types'

let currentState: GameState = {
  player: null,
  currentSector: null,
  currentScene: 'title',
  lastMessage: null
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
    console.log('IPC: get-scene called, current scene:', currentState.currentScene)
    return toSerializable(getSceneViewModel(currentState), currentState.lastMessage)
  })

  ipcMain.handle('execute-action', async (_, key: string) => {
    console.log('IPC: execute-action called with key:', key)
    const vm = getSceneViewModel(currentState)
    const option = vm.options.find((o) => o.key === key)
    if (option) {
      const newState = await option.action(currentState)
      if (newState) {
        // If sector changed, update database
        if (newState.player?.sectorId !== currentState.player?.sectorId) {
          console.log('Sector changed to:', newState.player?.sectorId)
          dbOps.updatePlayerSector(newState.player!.id, newState.player!.sectorId)
          const sectorData = dbOps.getSector(newState.player!.sectorId)
          newState.currentSector = {
            ...sectorData,
            warps: JSON.parse(sectorData.warps)
          }
        }
        currentState = newState
      }
    }
    return toSerializable(getSceneViewModel(currentState), currentState.lastMessage)
  })

  ipcMain.handle('create-character', async (_, name: string, faction: string) => {
    console.log('IPC: create-character called')
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
    
    currentState.player = {
      ...player,
      sectorId: startingSectorId,
      hp: 100,
      maxHp: 100,
      shields: 0,
      experience: 0,
      level: 1,
      shipId: null,
      faction: player.faction as any
    }
    currentState.currentSector = {
      ...sectorData,
      warps: JSON.parse(sectorData.warps)
    }
    currentState.currentScene = 'bridge'
    return toSerializable(getSceneViewModel(currentState), currentState.lastMessage)
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
