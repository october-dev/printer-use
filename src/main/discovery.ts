import { spawn } from 'node:child_process'
import { mergedEnv } from './exec'
import type { DiscoveredDevice, ResolvedService } from '../shared/types'

const PRINTER_SERVICE_TYPES = ['_ipps._tcp', '_ipp._tcp', '_pdl-datastream._tcp', '_printer._tcp']

/** Run `dns-sd -B <type>` for a fixed window and collect instance names of "Add" events. */
function browseOnce(serviceType: string, timeoutMs: number): Promise<string[]> {
  return new Promise((resolve) => {
    const found = new Set<string>()
    const child = spawn('dns-sd', ['-B', serviceType, 'local.'], { env: mergedEnv() })
    const done = () => {
      try {
        child.kill('SIGTERM')
      } catch {
        /* already gone */
      }
      resolve(Array.from(found))
    }
    const timer = setTimeout(done, timeoutMs)
    child.stdout.on('data', (buf: Buffer) => {
      for (const line of buf.toString().split('\n')) {
        // <time> <A/R> <flags> <if> <domain> <type> <instance...>
        const m = line.match(/^\S+\s+Add\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+?)\s*$/)
        if (m) found.add(m[1])
      }
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve([])
    })
    child.on('close', () => {
      clearTimeout(timer)
      resolve(Array.from(found))
    })
  })
}

/**
 * Browse the LAN for printers across the common Bonjour service types.
 * Non-AirPrint printers (like a driver-only Canon) may not appear here at all —
 * that's expected; the UI always offers a manual "Add by IP" path.
 */
export async function discoverPrinters(timeoutMs = 2500): Promise<DiscoveredDevice[]> {
  const results = await Promise.all(
    PRINTER_SERVICE_TYPES.map(async (type) => ({ type, names: await browseOnce(type, timeoutMs) }))
  )

  const byName = new Map<string, DiscoveredDevice>()
  for (const { type, names } of results) {
    for (const name of names) {
      const existing = byName.get(name)
      if (existing) {
        // Track the "best" (most driverless-friendly) service type per instance.
        existing.serviceType = preferType(existing.serviceType, type)
      } else {
        byName.set(name, { name, serviceType: type })
      }
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function preferType(a: string, b: string): string {
  const rank = (t: string) => PRINTER_SERVICE_TYPES.indexOf(t)
  return rank(a) <= rank(b) ? a : b
}

/** Resolve a Bonjour instance to host/port/IP, TXT metadata, and a suggested URI. */
export async function resolveService(name: string, serviceType: string, timeoutMs = 3200): Promise<ResolvedService> {
  const advertisesIpp = serviceType === '_ipp._tcp' || serviceType === '_ipps._tcp'
  const lookup = await new Promise<{ host?: string; port?: number; txt: string }>((resolve) => {
    let host: string | undefined
    let port: number | undefined
    let txt = ''
    let settle: ReturnType<typeof setTimeout> | null = null
    const child = spawn('dns-sd', ['-L', name, serviceType, 'local.'], { env: mergedEnv() })
    const done = () => {
      if (settle) clearTimeout(settle)
      try {
        child.kill('SIGTERM')
      } catch {
        /* noop */
      }
      resolve({ host, port, txt })
    }
    const timer = setTimeout(done, timeoutMs)
    child.stdout.on('data', (buf: Buffer) => {
      const text = buf.toString()
      txt += text
      const m = text.match(/can be reached at\s+(\S+):(\d+)/)
      if (m) {
        host = m[1]
        port = Number(m[2])
        // Give it a beat to also print the TXT record line, then finish.
        if (!settle) {
          settle = setTimeout(() => {
            clearTimeout(timer)
            done()
          }, 500)
        }
      }
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ host, port, txt })
    })
  })

  const txtVal = (key: string): string | undefined => {
    const m = lookup.txt.match(new RegExp(`\\b${key}=([^\\s]+(?:\\s(?![a-zA-Z0-9_]+=)[^\\s]+)*)`, 'i'))
    return m ? m[1].trim() : undefined
  }
  const model = txtVal('ty') || txtVal('product')?.replace(/[()]/g, '')
  const pdlRaw = txtVal('pdl')
  const pdls = pdlRaw ? pdlRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined
  const airprint = /\bURF=/i.test(lookup.txt) || (pdls?.some((p) => /urf/i.test(p)) ?? false)

  let ip: string | undefined
  if (lookup.host) ip = await resolveIp(lookup.host, timeoutMs)

  const target = ip ?? lookup.host
  let suggestedUri: string | undefined
  if (target) {
    if (advertisesIpp) suggestedUri = `${serviceType === '_ipps._tcp' ? 'ipps' : 'ipp'}://${lookup.host}:${lookup.port ?? 631}/ipp/print`
    else if (serviceType === '_pdl-datastream._tcp') suggestedUri = `socket://${target}:${lookup.port ?? 9100}`
    else suggestedUri = `lpd://${target}/`
  }

  return { host: lookup.host, port: lookup.port, ip, advertisesIpp, suggestedUri, model, pdls, airprint }
}

function resolveIp(host: string, timeoutMs: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    let ip: string | undefined
    const child = spawn('dns-sd', ['-G', 'v4', host], { env: mergedEnv() })
    const done = () => {
      try {
        child.kill('SIGTERM')
      } catch {
        /* noop */
      }
      resolve(ip)
    }
    const timer = setTimeout(done, timeoutMs)
    child.stdout.on('data', (buf: Buffer) => {
      const m = buf.toString().match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/)
      if (m) {
        ip = m[1]
        clearTimeout(timer)
        done()
      }
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(undefined)
    })
  })
}
