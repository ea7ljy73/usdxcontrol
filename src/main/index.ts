import { BrowserWindow, app, session } from 'electron'
import path from 'node:path'
import { registerRtlTcpIpc } from './rtlTcp.js'
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

// RTL-SDR por WebUSB: solo los RTL2832U (V3, V4 y clones), sin diálogo de elección.
const RTL_SDR_IDS = [
  { vendorId: 0x0bda, productId: 0x2832 },
  { vendorId: 0x0bda, productId: 0x2838 },
]
const isRtlSdr = (device: { vendorId?: number; productId?: number }) =>
  RTL_SDR_IDS.some((id) => id.vendorId === device.vendorId && id.productId === device.productId)

const allowRtlSdrUsb = () => {
  session.defaultSession.on('select-usb-device', (event, details, callback) => {
    event.preventDefault()
    callback(details.deviceList.find(isRtlSdr)?.deviceId)
  })
  session.defaultSession.setDevicePermissionHandler(
    (details) => details.deviceType === 'usb' && isRtlSdr(details.device as { vendorId?: number; productId?: number }),
  )
}

app.whenReady().then(() => {
  registerRadioIpc((channel: string, payload: string) => {
    windowRef?.webContents.send(channel, payload)
  })
  registerRtlTcpIpc()
  allowRtlSdrUsb()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
