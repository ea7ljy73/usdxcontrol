import { app, dialog, ipcMain, safeStorage } from 'electron'
import { execFile } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { t } from '../i18n/i18n.js'
import {
  INTEGRATION_SERVICES,
  type IntegrationRequestConfig,
  type IntegrationService,
  type IntegrationUploadRequest,
  type IntegrationUploadResult,
  type SecureStorageInfo,
} from '../types/integrations.js'

const execFileAsync = promisify(execFile)
const serviceSet = new Set<string>(INTEGRATION_SERVICES)

const SERVICE_NAMES: Record<IntegrationService, string> = {
  qrz: 'QRZ',
  clublog: 'ClubLog',
  lotw: 'LoTW',
  eqsl: 'eQSL',
}

const QRZ_URL = 'https://logbook.qrz.com/api'
const CLUBLOG_URL = 'https://clublog.org/api/v1'
const EQSL_URL = 'https://www.eqsl.cc/qslcard/ImportADIF.cfm'

const clean = (value: unknown, max = 200): string => (typeof value === 'string' ? value.trim().slice(0, max) : '')

const errorText = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message
  return typeof cause === 'string' ? cause : String(cause)
}

const ok = (duplicate = false, message?: string): IntegrationUploadResult => ({ ok: true, duplicate, message })

const fail = (message: string, permanent = false, retryAfterMs?: number): IntegrationUploadResult => ({
  ok: false,
  permanent,
  message,
  retryAfterMs,
})

const serviceOf = (value: unknown): IntegrationService | null =>
  typeof value === 'string' && serviceSet.has(value) ? (value as IntegrationService) : null

const parseRequest = (value: unknown): IntegrationUploadRequest | null => {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const service = serviceOf(raw.service)
  if (service === null) return null
  const adif = typeof raw.adif === 'string' ? raw.adif : ''
  if (adif.length > 2_000_000) return null
  const rawConfig = typeof raw.config === 'object' && raw.config !== null ? (raw.config as Record<string, unknown>) : {}
  const config: IntegrationRequestConfig = {
    callsign: clean(rawConfig.callsign, 30).toUpperCase(),
    username: clean(rawConfig.username, 30).toUpperCase(),
    qthNickname: clean(rawConfig.qthNickname, 60),
    stationLocation: clean(rawConfig.stationLocation, 200),
    tqslPath: clean(rawConfig.tqslPath, 500),
  }
  return { service, adif, config }
}

const secretsPath = () => path.join(app.getPath('userData'), 'integrations-secrets.json')

const readSecrets = (): Record<string, string> => {
  try {
    const parsed = JSON.parse(readFileSync(secretsPath(), 'utf8')) as unknown
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

const writeSecrets = (values: Record<string, string>) => {
  const file = secretsPath()
  writeFileSync(file, JSON.stringify(values), { mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    // En sistemas sin permisos POSIX no hay nada que ajustar.
  }
}

const encrypt = (value: string): string => {
  try {
    if (safeStorage.isEncryptionAvailable()) return `enc:${safeStorage.encryptString(value).toString('base64')}`
  } catch {
    // sin clave del sistema: se guarda ofuscado
  }
  return `b64:${Buffer.from(value, 'utf8').toString('base64')}`
}

const decrypt = (value: string): string => {
  try {
    if (value.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
    if (value.startsWith('b64:')) return Buffer.from(value.slice(4), 'base64').toString('utf8')
  } catch {
    return ''
  }
  return ''
}

const getSecret = (service: IntegrationService): string => {
  const stored = readSecrets()[service]
  return stored ? decrypt(stored) : ''
}

const setSecret = (service: IntegrationService, value: string) => {
  const secrets = readSecrets()
  if (value === '') delete secrets[service]
  else secrets[service] = encrypt(value)
  writeSecrets(secrets)
}

const hasSecret = (service: IntegrationService): boolean => getSecret(service) !== ''

const userAgent = (callsign?: string): string => {
  const appPart = `uSDXControl/${app.getVersion()}`
  return (callsign ? `${appPart} (${callsign})` : appPart).slice(0, 128)
}

const retryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1_000, 3_600_000)
  const date = Date.parse(value)
  if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 3_600_000))
  return undefined
}

const summarize = (text: string, status: number): string => {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string }
    const message = parsed.error?.message ?? parsed.message
    if (message) return message
  } catch {
    // no era JSON
  }
  const plain = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
  return plain || `HTTP ${status}`
}

const fetchTimeout = () => AbortSignal.timeout(30_000)

const qrzUpload = async (adif: string, config: IntegrationRequestConfig): Promise<IntegrationUploadResult> => {
  const key = getSecret('qrz').trim()
  if (!key) return fail(t('errors.main.integrations.secretMissing', { service: 'QRZ' }), true)
  const response = await fetch(QRZ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent(config.callsign),
    },
    body: new URLSearchParams({ KEY: key, ACTION: 'INSERT', ADIF: adif }),
    signal: fetchTimeout(),
  })
  const params = new URLSearchParams(await response.text())
  const result = params.get('RESULT') ?? ''
  if (result === 'OK') return ok()
  if (result === 'REPLACE') return ok(true)
  if (result === 'AUTH') return fail(t('errors.main.integrations.qrzAuth'), true)
  if (result === 'FAIL') {
    const reason = params.get('REASON') ?? ''
    if (/duplicate/i.test(reason)) return ok(true)
    return fail(t('errors.main.integrations.rejected', { service: 'QRZ', error: reason || `HTTP ${response.status}` }), true)
  }
  if (response.status === 401 || response.status === 403) return fail(t('errors.main.integrations.qrzAuth'), true)
  if (response.status === 429) return fail(t('errors.main.integrations.rateLimit', { service: 'QRZ' }), false, retryAfter(response.headers.get('retry-after')))
  if (response.status >= 500) return fail(t('errors.main.integrations.server', { service: 'QRZ', status: response.status }), false, retryAfter(response.headers.get('retry-after')))
  return fail(t('errors.main.integrations.rejected', { service: 'QRZ', error: `HTTP ${response.status}` }), true)
}

const qrzTest = async (config: IntegrationRequestConfig): Promise<IntegrationUploadResult> => {
  const key = getSecret('qrz').trim()
  if (!key) return fail(t('errors.main.integrations.secretMissing', { service: 'QRZ' }), true)
  const response = await fetch(QRZ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent(config.callsign),
    },
    body: new URLSearchParams({ KEY: key, ACTION: 'STATUS' }),
    signal: fetchTimeout(),
  })
  const params = new URLSearchParams(await response.text())
  const result = params.get('RESULT') ?? ''
  if (result === 'OK') return ok(false, t('errors.main.integrations.testOk', { service: 'QRZ' }))
  if (result === 'AUTH') return fail(t('errors.main.integrations.qrzAuth'), true)
  return fail(t('errors.main.integrations.rejected', { service: 'QRZ', error: params.get('REASON') ?? `HTTP ${response.status}` }), true)
}

const clubLogUpload = async (adif: string, config: IntegrationRequestConfig): Promise<IntegrationUploadResult> => {
  const token = getSecret('clublog').trim()
  if (!token) return fail(t('errors.main.integrations.secretMissing', { service: 'ClubLog' }), true)
  const callsign = config.callsign ?? ''
  if (!callsign) return fail(t('errors.main.integrations.callsign'), true)
  const url = `${CLUBLOG_URL}/logs/${encodeURIComponent(callsign)}/uploads`
  const authorization = `Bearer ${token}`
  const ua = userAgent(callsign)

  const form = new FormData()
  form.set('file', new Blob([adif], { type: 'text/plain' }), `${callsign}.adi`)
  const attempts: { headers: Record<string, string>; body: string | FormData }[] = [
    { headers: { Authorization: authorization, 'User-Agent': ua }, body: form },
    { headers: { Authorization: authorization, 'User-Agent': ua, 'Content-Type': 'text/plain; charset=utf-8' }, body: adif },
    {
      headers: { Authorization: authorization, 'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ adif }).toString(),
    },
  ]

  let last: IntegrationUploadResult = fail(t('errors.main.integrations.rejected', { service: 'ClubLog', error: 'HTTP 400' }), true)
  for (const attempt of attempts) {
    const response = await fetch(url, { method: 'POST', headers: attempt.headers, body: attempt.body, signal: fetchTimeout() })
    const text = await response.text()
    if (response.ok) return ok(false, summarize(text, response.status))
    if (response.status === 409) return ok(true, summarize(text, response.status))
    if (response.status === 401 || response.status === 403) return fail(t('errors.main.integrations.clublogAuth'), true)
    if (response.status === 429) return fail(t('errors.main.integrations.rateLimit', { service: 'ClubLog' }), false, retryAfter(response.headers.get('retry-after')))
    if (response.status >= 500) return fail(t('errors.main.integrations.server', { service: 'ClubLog', status: response.status }), false, retryAfter(response.headers.get('retry-after')))
    last = fail(
      t('errors.main.integrations.rejected', { service: 'ClubLog', error: summarize(text, response.status) }),
      response.status !== 400 && response.status !== 415,
    )
    if (response.status !== 400 && response.status !== 415) return last
  }
  return last
}

const clubLogTest = async (config: IntegrationRequestConfig): Promise<IntegrationUploadResult> => {
  const token = getSecret('clublog').trim()
  if (!token) return fail(t('errors.main.integrations.secretMissing', { service: 'ClubLog' }), true)
  const response = await fetch(`${CLUBLOG_URL}/reference/cty`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': userAgent(config.callsign) },
    signal: fetchTimeout(),
  })
  if (response.ok) return ok(false, t('errors.main.integrations.testOk', { service: 'ClubLog' }))
  if (response.status === 401 || response.status === 403) return fail(t('errors.main.integrations.clublogAuth'), true)
  return fail(
    t('errors.main.integrations.rejected', { service: 'ClubLog', error: summarize(await response.text(), response.status) }),
    false,
  )
}

const eqslWithNickname = (adif: string, nickname?: string): string => {
  const cleanNick = (nickname ?? '').replace(/[<>]/g, '').trim()
  if (!cleanNick) return adif
  return adif.replaceAll('<EOR>', `<APP_EQSL_QTH_NICKNAME:${cleanNick.length}>${cleanNick} <EOR>`)
}

const parseEqsl = (text: string, status: number): IntegrationUploadResult => {
  const lower = text.toLowerCase()
  if (lower.includes('no match on eqsl')) return fail(t('errors.main.integrations.eqslAuth'), true)
  if (lower.includes('duplicate')) return ok(true, t('errors.main.integrations.duplicate', { service: 'eQSL' }))
  const match = /result:\s*(\d+)\s+out of\s+(\d+)\s+records added/i.exec(text)
  if (match) {
    const added = Number(match[1])
    if (added > 0) return ok(false, match[0])
    return fail(t('errors.main.integrations.rejected', { service: 'eQSL', error: summarize(text, status) }), true)
  }
  if (status === 429) return fail(t('errors.main.integrations.rateLimit', { service: 'eQSL' }), false)
  if (status >= 500) return fail(t('errors.main.integrations.server', { service: 'eQSL', status }), false)
  return fail(t('errors.main.integrations.rejected', { service: 'eQSL', error: summarize(text, status) }), true)
}

const eqslUpload = async (adif: string, config: IntegrationRequestConfig): Promise<IntegrationUploadResult> => {
  const password = getSecret('eqsl')
  if (!password) return fail(t('errors.main.integrations.secretMissing', { service: 'eQSL' }), true)
  const username = config.username ?? ''
  if (!username) return fail(t('errors.main.integrations.callsign'), true)
  const response = await fetch(EQSL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent(username),
    },
    body: new URLSearchParams({
      EQSL_USER: username,
      EQSL_PSWD: password,
      ADIFData: eqslWithNickname(adif, config.qthNickname),
    }),
    signal: fetchTimeout(),
  })
  return parseEqsl(await response.text(), response.status)
}

const eqslTest = async (config: IntegrationRequestConfig): Promise<IntegrationUploadResult> => {
  const password = getSecret('eqsl')
  if (!password) return fail(t('errors.main.integrations.secretMissing', { service: 'eQSL' }), true)
  const username = config.username ?? ''
  if (!username) return fail(t('errors.main.integrations.callsign'), true)
  const response = await fetch(EQSL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent(username),
    },
    body: new URLSearchParams({ EQSL_USER: username, EQSL_PSWD: password, ADIFData: '' }),
    signal: fetchTimeout(),
  })
  const text = await response.text()
  if (response.status === 401 || response.status === 403) return fail(t('errors.main.integrations.eqslAuth'), true)
  if (text.toLowerCase().includes('no match on eqsl')) return fail(t('errors.main.integrations.eqslAuth'), true)
  if (response.status >= 500) return fail(t('errors.main.integrations.server', { service: 'eQSL', status: response.status }), false)
  return ok(false, t('errors.main.integrations.testOk', { service: 'eQSL' }))
}

const tqslCandidates = (): string[] => {
  if (process.platform === 'win32') {
    return [
      'C:\\Program Files\\TrustedQSL\\tqsl.exe',
      'C:\\Program Files (x86)\\TrustedQSL\\tqsl.exe',
    ]
  }
  if (process.platform === 'darwin') {
    return ['/Applications/TrustedQSL.app/Contents/MacOS/tqsl', '/usr/local/bin/tqsl', '/opt/homebrew/bin/tqsl']
  }
  return ['/usr/bin/tqsl', '/usr/local/bin/tqsl', '/snap/bin/tqsl']
}

const pathTqsl = (): string | null => {
  const executable = process.platform === 'win32' ? 'tqsl.exe' : 'tqsl'
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, executable)
    if (existsSync(candidate)) return candidate
  }
  return null
}

const detectTqsl = (): string | null =>
  tqslCandidates().find((candidate) => existsSync(candidate)) ?? pathTqsl()

const resolveTqsl = (configured?: string): string | null => {
  const explicit = (configured ?? '').trim()
  if (explicit && existsSync(explicit)) return explicit
  return detectTqsl()
}

const adifField = (name: string, value: string): string => {
  const cleanValue = value.trim()
  return `<${name}:${cleanValue.length}>${cleanValue} `
}

const tqslSample = (config: IntegrationRequestConfig): string => {
  const now = new Date()
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`
  const time = `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`
  const call = config.callsign || 'N0CALL'
  let record = '<ADIF_VER:5>3.1.4 <EOH>\n'
  record += adifField('QSO_DATE', date)
  record += adifField('TIME_ON', time)
  record += adifField('CALL', call)
  record += adifField('BAND', '20M')
  record += adifField('MODE', 'FT8')
  record += adifField('RST_SENT', '-10')
  record += adifField('RST_RCVD', '-10')
  record += adifField('STATION_CALLSIGN', call)
  record += '<EOR>'
  return record
}

type TqslResult = { code: number; output: string }

const runTqsl = async (adif: string, config: IntegrationRequestConfig, upload: boolean): Promise<TqslResult> => {
  const tqsl = resolveTqsl(config.tqslPath)
  if (!tqsl) throw new Error(t('errors.main.integrations.tqslMissing'))
  const station = (config.stationLocation ?? '').trim()
  if (!station) throw new Error(t('errors.main.integrations.tqslLocation'))
  const password = getSecret('lotw')
  const dir = await mkdtemp(path.join(os.tmpdir(), 'usdxcontrol-lotw-'))
  const source = path.join(dir, 'qso.adi')
  const signed = path.join(dir, 'qso.tq8')
  try {
    await writeFile(source, adif, 'utf8')
    const args = ['-d', '-x', '-a', 'compliant', '-l', station]
    if (password) args.push('-p', password)
    if (upload) args.push('-u')
    else args.push('-o', signed)
    args.push(source)
    try {
      const result = await execFileAsync(tqsl, args, { timeout: 90_000, maxBuffer: 1_000_000 })
      return { code: 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() }
    } catch (cause) {
      const execError = cause as { code?: number | string; stdout?: string; stderr?: string; message?: string }
      const code = typeof execError.code === 'number' ? execError.code : 1
      return { code, output: `${execError.stdout ?? ''}${execError.stderr ?? execError.message ?? ''}`.trim() }
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

const lotwUpload = async (adif: string, config: IntegrationRequestConfig): Promise<IntegrationUploadResult> => {
  try {
    const result = await runTqsl(adif, config, true)
    if (result.code === 0) return ok(false, result.output)
    if (result.code === 9 || result.code === 14) return ok(false, result.output)
    if (result.code === 8) {
      if (/duplicate/i.test(result.output) && !/out of date range/i.test(result.output)) {
        return ok(true, t('errors.main.integrations.duplicate', { service: 'LoTW' }))
      }
      return fail(t('errors.main.integrations.tqslFailed', { error: result.output || `código ${result.code}` }), true)
    }
    const transient = result.code === 3 || result.code === 11 || result.code === 12 || result.code === 13
    return fail(
      t('errors.main.integrations.tqslFailed', { error: result.output || `código ${result.code}` }),
      !transient,
    )
  } catch (cause) {
    return fail(errorText(cause), true)
  }
}

const lotwTest = async (config: IntegrationRequestConfig): Promise<IntegrationUploadResult> => {
  try {
    const result = await runTqsl(tqslSample(config), config, false)
    if (result.code === 0) return ok(false, t('errors.main.integrations.testOk', { service: 'LoTW' }))
    return fail(t('errors.main.integrations.tqslFailed', { error: result.output || `código ${result.code}` }), true)
  } catch (cause) {
    return fail(errorText(cause), true)
  }
}

const dispatchUpload = async (request: IntegrationUploadRequest): Promise<IntegrationUploadResult> => {
  switch (request.service) {
    case 'qrz':
      return qrzUpload(request.adif, request.config)
    case 'clublog':
      return clubLogUpload(request.adif, request.config)
    case 'lotw':
      return lotwUpload(request.adif, request.config)
    case 'eqsl':
      return eqslUpload(request.adif, request.config)
  }
}

const dispatchTest = async (request: IntegrationUploadRequest): Promise<IntegrationUploadResult> => {
  switch (request.service) {
    case 'qrz':
      return qrzTest(request.config)
    case 'clublog':
      return clubLogTest(request.config)
    case 'lotw':
      return lotwTest(request.config)
    case 'eqsl':
      return eqslTest(request.config)
  }
}

export function registerIntegrationsIpc() {
  ipcMain.handle('integrations:upload', async (_event, raw: unknown) => {
    const request = parseRequest(raw)
    if (request === null) return fail(t('errors.main.integrations.invalidPayload'), true)
    if (request.adif.trim() === '') return fail(t('errors.main.integrations.emptyAdif'), true)
    try {
      return await dispatchUpload(request)
    } catch (cause) {
      return fail(
        t('errors.main.integrations.network', {
          service: SERVICE_NAMES[request.service],
          error: errorText(cause),
        }),
      )
    }
  })

  ipcMain.handle('integrations:test', async (_event, raw: unknown) => {
    const request = parseRequest(raw)
    if (request === null) return fail(t('errors.main.integrations.invalidPayload'), true)
    try {
      return await dispatchTest(request)
    } catch (cause) {
      return fail(
        t('errors.main.integrations.network', {
          service: SERVICE_NAMES[request.service],
          error: errorText(cause),
        }),
      )
    }
  })

  ipcMain.handle('integrations:secret:has', (_event, raw: unknown): boolean => {
    const service = serviceOf(raw)
    return service !== null && hasSecret(service)
  })

  ipcMain.handle('integrations:secret:set', (_event, raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) throw new Error(t('errors.main.integrations.invalidPayload'))
    const { service: rawService, value } = raw as { service?: unknown; value?: unknown }
    const service = serviceOf(rawService)
    if (service === null || typeof value !== 'string' || value.length > 4_096) {
      throw new Error(t('errors.main.integrations.invalidPayload'))
    }
    setSecret(service, value)
  })

  ipcMain.handle('integrations:secret:clear', (_event, raw: unknown) => {
    const service = serviceOf(raw)
    if (service === null) throw new Error(t('errors.main.integrations.invalidPayload'))
    setSecret(service, '')
  })

  ipcMain.handle('integrations:secure', (): SecureStorageInfo => ({ available: safeStorage.isEncryptionAvailable() }))

  ipcMain.handle('integrations:tqsl:detect', (): string | null => detectTqsl())

  ipcMain.handle('integrations:tqsl:pick', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'TQSL',
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [{ name: 'TQSL', extensions: ['exe'] }]
          : process.platform === 'darwin'
            ? [{ name: 'TQSL', extensions: ['app'] }]
            : [],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}

export { SERVICE_NAMES }