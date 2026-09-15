import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AppConfig,
  Provider,
  Printer,
  PrintJob,
  DiscoveredDevice,
  ProviderRunResult,
  CommandResult,
  ResolvedCommand,
  TranslateResult,
  TranslateContext,
  AddPrinterOpts,
  PpdEntry,
  DriverStrategy,
  ResolvedService
} from '../shared/types'

const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.configGet),
    save: (patch: Partial<AppConfig>): Promise<AppConfig> => ipcRenderer.invoke(IPC.configSave, patch)
  },
  providers: {
    list: (): Promise<Provider[]> => ipcRenderer.invoke(IPC.providersList),
    test: (provider: Provider): Promise<ProviderRunResult> => ipcRenderer.invoke(IPC.providerTest, provider)
  },
  printers: {
    list: (): Promise<Printer[]> => ipcRenderer.invoke(IPC.printersList),
    setDefault: (name: string): Promise<CommandResult> => ipcRenderer.invoke(IPC.printersSetDefault, name),
    discover: (): Promise<DiscoveredDevice[]> => ipcRenderer.invoke(IPC.printersDiscover),
    resolveService: (name: string, type: string): Promise<ResolvedService> =>
      ipcRenderer.invoke(IPC.printersResolveService, name, type),
    chooseDriver: (input: { advertisesIpp: boolean; uri: string; makeAndModelHint?: string }): Promise<DriverStrategy> =>
      ipcRenderer.invoke(IPC.printersChooseDriver, input),
    findPpds: (hint?: string): Promise<PpdEntry[]> => ipcRenderer.invoke(IPC.printersFindPpds, hint),
    listDrivers: (query?: string): Promise<{ model: string; label: string }[]> =>
      ipcRenderer.invoke(IPC.printersListDrivers, query),
    add: (opts: AddPrinterOpts): Promise<CommandResult & { hint?: string }> => ipcRenderer.invoke(IPC.printersAdd, opts)
  },
  jobs: {
    list: (): Promise<PrintJob[]> => ipcRenderer.invoke(IPC.jobsList),
    cancel: (jobId: string): Promise<CommandResult> => ipcRenderer.invoke(IPC.jobsCancel, jobId),
    cancelAll: (printer: string): Promise<CommandResult> => ipcRenderer.invoke(IPC.jobsCancelAll, printer)
  },
  nl: {
    translate: (ctx: TranslateContext): Promise<TranslateResult> => ipcRenderer.invoke(IPC.nlTranslate, ctx)
  },
  print: {
    submit: (resolved: ResolvedCommand): Promise<CommandResult> => ipcRenderer.invoke(IPC.printSubmit, resolved)
  },
  files: {
    pick: (): Promise<string[]> => ipcRenderer.invoke(IPC.filesPick)
  },
  system: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.openExternal, url)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
