// Canonical IPC channel names, shared by main (handlers) and preload (invokers).
export const IPC = {
  configGet: 'config:get',
  configSave: 'config:save',

  providersList: 'providers:list',
  providerTest: 'providers:test',

  printersList: 'printers:list',
  printersSetDefault: 'printers:setDefault',
  printersDiscover: 'printers:discover',
  printersResolveService: 'printers:resolveService',
  printersChooseDriver: 'printers:chooseDriver',
  printersFindPpds: 'printers:findPpds',
  printersListDrivers: 'printers:listDrivers',
  printersAdd: 'printers:add',

  printersProbe: 'printers:probe',
  printersDiagnose: 'printers:diagnose',
  printersExplain: 'printers:explain',
  printersEnable: 'printers:enable',
  printersAccept: 'printers:accept',
  printersRemove: 'printers:remove',
  printersTestPage: 'printers:testPage',

  jobsList: 'jobs:list',
  jobsCancel: 'jobs:cancel',
  jobsCancelAll: 'jobs:cancelAll',

  nlTranslate: 'nl:translate',
  printSubmit: 'print:submit',

  filesPick: 'files:pick',
  openExternal: 'system:openExternal'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
