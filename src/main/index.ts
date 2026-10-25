import { BrowserWindow, app } from 'electron'
import path from 'node:path'
import { registerRadioIpc } from './serialManager.js'

let windowRef: BrowserWindow | null = null

const createWindow = () => {
  windowRef = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 960,
    minHeight: 600,
    title: 'uSDX Control',
    autoHideMenuBar: true,
    backgroundColor: '#0b0f13',
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  windowRef.on('closed', () => {
    windowRef = null
  })
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void windowRef.loadURL(devUrl)
  } else {
    void windowRef.loadFile(path.join(import.meta.dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerRadioIpc((channel: string, payload: string) => {
    windowRef?.webContents.send(channel, payload)
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
