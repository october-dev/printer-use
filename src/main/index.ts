import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import { BUILT_IN_PROVIDERS } from '../shared/providers'
import { loadConfig, saveConfig } from './store'
import { resolveAvailability, runProvider } from './providers'
import {
  listPrinters,
  listJobs,
  cancelJob,
  cancelAll,
  setDefaultPrinter,
  submit,
  addPrinter,
  chooseDriverStrategy,
  findInstalledPpds,
  listModelDrivers
} from './cups'
import { discoverPrinters, resolveService } from './discovery'
import { translate } from './nl'
import type { AppConfig, Provider, AddPrinterOpts, TranslateContext } from '../shared/types'

let mainWindow: BrowserWindow | null = null

// Dev-only, env-guarded: capture a clean PNG of just the app's web contents
// (never a full-screen grab) so the UI can be verified/shared without a display.
if (process.env.CFP_USERDATA) app.setPath('userData', process.env.CFP_USERDATA)

function maybeCaptureAndQuit(win: BrowserWindow): void {
  const shot = process.env.CFP_SHOT
  if (!shot) return
  setTimeout(async () => {
    try {
      const image = await win.webContents.capturePage()
      await writeFile(shot, image.toPNG())
      // eslint-disable-next-line no-console
      console.log(`[shot] wrote ${shot}`)
    } catch (err) {
      console.error('[shot] failed', err)
    } finally {
      app.quit()
    }
  }, Number(process.env.CFP_SHOT_DELAY ?? 1800))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1140,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0b0d' : '#fbfbfa',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (mainWindow) maybeCaptureAndQuit(mainWindow)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const search = process.env.CFP_VIEW ? `view=${process.env.CFP_VIEW}` : ''
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + (search ? `?${search}` : ''))
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), search ? { search } : undefined)
  }
}

async function allProviders(): Promise<Provider[]> {
  const config = await loadConfig()
  const merged = [...BUILT_IN_PROVIDERS, ...config.customProviders]
  return resolveAvailability(merged)
}

async function selectedProvider(): Promise<Provider | null> {
  const config = await loadConfig()
  const providers = await allProviders()
  const found = providers.find((p) => p.id === config.selectedProviderId)
  return found ?? null
}

function applyTheme(theme: AppConfig['theme']): void {
  nativeTheme.themeSource = theme
}

function registerIpc(): void {
  ipcMain.handle(IPC.configGet, () => loadConfig())
  ipcMain.handle(IPC.configSave, async (_e, patch: Partial<AppConfig>) => {
    const cfg = await saveConfig(patch)
    if (patch.theme) applyTheme(cfg.theme)
    return cfg
  })

  ipcMain.handle(IPC.providersList, () => allProviders())
  ipcMain.handle(IPC.providerTest, async (_e, provider: Provider) => {
    return runProvider(provider, 'Reply with only this JSON and nothing else: {"summary":"ready","options":{}}', 45000)
  })

  ipcMain.handle(IPC.printersList, () => listPrinters())
  ipcMain.handle(IPC.printersSetDefault, (_e, name: string) => setDefaultPrinter(name))
  ipcMain.handle(IPC.printersDiscover, () => discoverPrinters())
  ipcMain.handle(IPC.printersResolveService, (_e, name: string, type: string) => resolveService(name, type))
  ipcMain.handle(IPC.printersChooseDriver, (_e, input: { advertisesIpp: boolean; uri: string; makeAndModelHint?: string }) =>
    chooseDriverStrategy(input)
  )
  ipcMain.handle(IPC.printersFindPpds, (_e, hint?: string) => findInstalledPpds(hint))
  ipcMain.handle(IPC.printersListDrivers, (_e, query?: string) => listModelDrivers(query))
  ipcMain.handle(IPC.printersAdd, (_e, opts: AddPrinterOpts) => addPrinter(opts))

  ipcMain.handle(IPC.jobsList, () => listJobs())
  ipcMain.handle(IPC.jobsCancel, (_e, jobId: string) => cancelJob(jobId))
  ipcMain.handle(IPC.jobsCancelAll, (_e, printer: string) => cancelAll(printer))

  ipcMain.handle(IPC.nlTranslate, async (_e, ctx: TranslateContext) => {
    const provider = await selectedProvider()
    if (!provider) return { ok: false, error: 'No AI provider selected. Open Settings to choose one.' }
    if (!provider.available) return { ok: false, error: `The "${provider.name}" command isn't on your PATH.` }
    return translate(provider, ctx)
  })

  ipcMain.handle(IPC.printSubmit, (_e, resolved) => submit(resolved))

  ipcMain.handle(IPC.filesPick, async () => {
    if (!mainWindow) return []
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose file(s) to print',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Printable', extensions: ['pdf', 'txt', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'ps', 'rtf', 'html'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    return res.canceled ? [] : res.filePaths
  })

  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })
}

app.whenReady().then(async () => {
  if (process.env.CFP_SEED_ONBOARDED) {
    await saveConfig({
      onboarded: true,
      selectedProviderId: process.env.CFP_SEED_PROVIDER || 'claude-code',
      theme: (process.env.CFP_THEME as 'light' | 'dark' | 'system') || 'system'
    })
  }
  const config = await loadConfig()
  applyTheme(config.theme)
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
