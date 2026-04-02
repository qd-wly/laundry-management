import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const docsDir = path.join(projectRoot, 'docs')
const port = Number(process.env.PORT || 8788)
const dataFile = path.join(projectRoot, 'server', 'data', 'laundry-data.json')
const backupDir = path.join(projectRoot, 'server', 'data', 'backups')

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
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function ensureDataDirs() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true })
  await fs.mkdir(backupDir, { recursive: true })
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

async function readRequestBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return {}
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

async function readSnapshot() {
  const fileData = await readJsonIfExists(dataFile)
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

  const current = await readJsonIfExists(dataFile)
  if (current) {
    const backupPath = path.join(
      backupDir,
      `laundry-data-${savedAt.replace(/[:.]/g, '-')}.json`
    )
    await fs.writeFile(backupPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
  }

  const tempPath = `${dataFile}.tmp`
  await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  await fs.rename(tempPath, dataFile)

  return {
    snapshot: normalized,
    savedAt,
  }
}

function resolveStaticFile(requestPath) {
  const cleanPath = requestPath.split('?')[0]
  const relativePath = cleanPath === '/' ? 'index.html' : cleanPath.replace(/^\/+/, '')
  const resolvedPath = path.resolve(docsDir, relativePath)
  if (!resolvedPath.startsWith(docsDir)) {
    return null
  }
  return resolvedPath
}

async function serveStatic(req, res) {
  const resolvedPath = resolveStaticFile(req.url || '/')
  if (!resolvedPath) {
    sendJson(res, 400, { error: '非法路径' })
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
      sendJson(res, 500, { error: error.message })
      return
    }
  }

  try {
    const indexFile = path.join(docsDir, 'index.html')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(await fs.readFile(indexFile))
  } catch {
    sendJson(res, 404, { error: '未找到前端构建产物，请先执行 npm run build' })
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (url.pathname === '/api/health' && req.method === 'GET') {
      const snapshot = await readSnapshot()
      sendJson(res, 200, {
        ok: true,
        savedAt: snapshot?.savedAt || '',
        dataFile,
        now: new Date().toISOString(),
      })
      return
    }

    if (url.pathname === '/api/local-data') {
      if (req.method === 'GET') {
        const data = await readSnapshot()
        sendJson(res, 200, data || { snapshot: null, savedAt: '' })
        return
      }

      if (req.method === 'PUT') {
        const body = await readRequestBody(req)
        const data = await writeSnapshot(body.snapshot || body)
        sendJson(res, 200, {
          success: true,
          savedAt: data.savedAt,
          dataFile,
        })
        return
      }

      sendJson(res, 405, { error: '不支持的请求方法' })
      return
    }

    if (req.method === 'GET') {
      await serveStatic(req, res)
      return
    }

    sendJson(res, 404, { error: '未找到接口' })
  } catch (error) {
    sendJson(res, 500, { error: error.message || '本地服务异常' })
  }
})

await ensureDataDirs()

server.listen(port, '0.0.0.0', () => {
  console.log(`Laundry local site running at http://127.0.0.1:${port}`)
  console.log(`Data file: ${dataFile}`)
})
