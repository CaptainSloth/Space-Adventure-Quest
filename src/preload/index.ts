import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args)
  },
  invoke: (channel: string, ...args: any[]) => {
    return ipcRenderer.invoke(channel, ...args)
  },
  receive: (channel: string, func: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args))
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
