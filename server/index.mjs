import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const docsDir = path.join(projectRoot, 'docs')
const defaultConfigPath = path.join(__dirname, 'config.json')

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
}

function normalizeSnapshot(payload = {}) {
  return {
    departments: Array.isArray(payload.departments) ? payload.departments : [],
    staff: Array.isArray(payload.staff) ? payload.staff : [],
    itemTypes: Array.isArray(payload.itemTypes) ? payload.itemTypes : [],
    batches: Array.isArray(payload.batches) ? payload.batches : [],
    records: Array.isArray(payload.records) ? payload.records : [],
    exportedAt: payload.exportedAt || new Date().toISOString(),
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function loadConfig() {
  const fileConfig = (await readJsonIfExists(defaultConfigPath)) || {}
  const port = Number(process.env.PORT || fileConfig.port || 8787)
  const apiKey = process.env.LAUNDRY_API_KEY || fileConfig.apiKey || ''
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(item => item.trim()).filter(Boolean)
    : Array.isArray(fileConfig.allowedOrigins)
      ? fileConfig.allowedOrigins
      : ['*']
  const dataFile = path.resolve(projectRoot, process.env.DATA_FILE || fileConfig.dataFile || './server/data/laundry-data.json')

  return {
    port,
    apiKey,
    allowedOrigins,
    dataFile,
  }
}

const config = await loadConfig()
const dataDir = path.dirname(config.dataFile)
const backupDir = path.join(dataDir, 'backups')

async function ensureDataDirs() {
  await fs.mkdir(dataDir, { recursive: true })
  await fs.mkdir(backupDir, { recursive: true })
}

function setCorsHeaders(req, res) {
  const requestOrigin = req.headers.origin || ''
  const allowAny = config.allowedOrigins.includes('*')
  const allowOrigin = allowAny
    ? '*'
    : config.allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : config.allowedOrigins[0] || ''

  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin)
  }
  if (!allowAny) {
    res.setHeader('Vary', 'Origin')
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function sendJson(req, res, statusCode, payload) {
  setCorsHeaders(req, res)
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function isAuthorized(req) {
  if (!config.apiKey) return false
  const authHeader = req.headers.authorization || ''
  const expected = `Bearer ${config.apiKey}`
  return authHeader === expected
}

async function readRequestBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

async function readSnapshot() {
  const fileData = await readJsonIfExists(config.dataFile)
  if (!fileData) {
    return null
  }

  return {
    snapshot: normalizeSnapshot(fileData.snapshot || fileData),
    savedAt: fileData.savedAt || '',
  }
}

async function writeSnapshot(snapshot) {
  const normalized = normalizeSnapshot(snapshot)
  const savedAt = new Date().toISOString()
  const payload = {
    snapshot: normalized,
    savedAt,
  }

  await ensureDataDirs()

  const current = await readJsonIfExists(config.dataFile)
  if (current) {
    const backupPath = path.join(
      backupDir,
      `laundry-data-${savedAt.replace(/[:.]/g, '-')}.json`
    )
    await fs.writeFile(backupPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
  }

  const tempPath = `${config.dataFile}.tmp`
  await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  await fs.rename(tempPath, config.dataFile)

  return { snapshot: normalized, savedAt }
}

function resolveStaticFile(requestPath) {
  const cleanPath = requestPath.split('?')[0]
  const relativePath = cleanPath === '/' ? 'index.html' : cleanPath.replace(/^\/+/, '')
  const resolvedPath = path.resolve(docsDir, relativePath)
  if (!resolvedPath.startsWith(docsDir)) return null
  return resolvedPath
}

async function serveStatic(req, res) {
  const resolvedPath = resolveStaticFile(req.url || '/')
  if (!resolvedPath) {
    sendJson(req, res, 400, { error: '非法路径' })
    return
  }

  try {
    const stat = await fs.stat(resolvedPath)
    if (stat.isFile()) {
      const ext = path.extname(resolvedPath).toLowerCase()
      const contentType = MIME_TYPES[ext] || 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': contentType })
      res.end(await fs.readFile(resolvedPath))
      return
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      sendJson(req, res, 500, { error: error.message })
      return
    }
  }

  try {
    const indexFile = path.join(docsDir, 'index.html')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(await fs.readFile(indexFile))
  } catch (error) {
    sendJson(req, res, 404, { error: '未找到前端构建产物，请先执行 npm run build' })
  }
}

const server = http.createServer(async (req, res) => {
  try {
    setCorsHeaders(req, res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (url.pathname === '/api/health' && req.method === 'GET') {
      sendJson(req, res, 200, {
        ok: true,
        savedAt: (await readSnapshot())?.savedAt || '',
        now: new Date().toISOString(),
      })
      return
    }

    if (url.pathname === '/api/sync') {
      if (!isAuthorized(req)) {
        sendJson(req, res, 401, { error: '未授权，请检查访问密钥' })
        return
      }

      if (req.method === 'GET') {
        const data = await readSnapshot()
        sendJson(req, res, 200, data || { snapshot: null, savedAt: '' })
        return
      }

      if (req.method === 'PUT') {
        const body = await readRequestBody(req)
        const data = await writeSnapshot(body.snapshot || body)
        sendJson(req, res, 200, {
          success: true,
          savedAt: data.savedAt,
        })
        return
      }

      sendJson(req, res, 405, { error: '不支持的请求方法' })
      return
    }

    if (req.method === 'GET') {
      await serveStatic(req, res)
      return
    }

    sendJson(req, res, 404, { error: '未找到接口' })
  } catch (error) {
    sendJson(req, res, 500, { error: error.message || '服务器错误' })
  }
})

await ensureDataDirs()

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Laundry server running at http://0.0.0.0:${config.port}`)
  console.log(`Data file: ${config.dataFile}`)
  console.log(`Allowed origins: ${config.allowedOrigins.join(', ')}`)
  if (!config.apiKey) {
    console.warn('Warning: missing apiKey. API will reject sync requests until apiKey is configured.')
  }
})
