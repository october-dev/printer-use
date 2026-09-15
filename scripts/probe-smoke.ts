import { probeHost, parseDeviceUri } from '../src/main/diagnostics'

const host = process.argv[2] || '127.0.0.1'
probeHost(host).then((r) => {
  console.log('probe', host, '=>', JSON.stringify(r))
  console.log('parseDeviceUri lpd://192.168.1.16/ =>', JSON.stringify(parseDeviceUri('lpd://192.168.1.16/')))
  console.log('parseDeviceUri ipp://host:631/ipp/print =>', JSON.stringify(parseDeviceUri('ipp://host:631/ipp/print')))
  process.exit(0)
})
