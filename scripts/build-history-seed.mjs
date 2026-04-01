import fs from 'node:fs/promises'
import path from 'node:path'

const projectRoot = process.cwd()
const sourceDir = 'C:\\Local\\上班库\\02_Work\\所有\\运营管理\\物业管理\\布草\\送洗记录'
const outputFile = path.join(projectRoot, 'src', 'data', 'history-seed.json')

const staffAliasMap = new Map([
  ['何总', '何威'],
  ['田总', '田海超'],
  ['马总', '马新枝'],
])

const staffDeptMap = new Map([
  ['侯磊', '展览项目运营部'],
  ['艾星羽', '综合办公室'],
  ['夏芳', '综合办公室'],
  ['苏燕麟', '采购部'],
])

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

function isSeparatorRow(cells) {
  return cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
}

function normalizeStaffName(value) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const noNote = trimmed
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim()

  return staffAliasMap.get(noNote) || noNote
}

function extractInlineNotes(value) {
  const notes = []
  for (const match of value.matchAll(/（([^）]+)）|\(([^)]+)\)/g)) {
    const note = (match[1] || match[2] || '').trim()
    if (note) notes.push(note)
  }
  return notes
}

function cleanDateToken(value) {
  return value
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim()
}

function parseDateValue(value, baseYear, referenceMonth = null) {
  const cleaned = cleanDateToken(value)
  if (!cleaned || cleaned === '无') {
    return { value: '', month: null, notes: extractInlineNotes(value) }
  }

  const match = cleaned.match(/(\d{1,2})\.(\d{1,2})/)
  if (!match) {
    return { value: '', month: null, notes: extractInlineNotes(value) }
  }

  let year = baseYear
  const month = Number(match[1])
  const day = Number(match[2])

  if (referenceMonth !== null && month < referenceMonth - 6) {
    year += 1
  }

  return {
    value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    month,
    notes: extractInlineNotes(value),
  }
}

function extractField(metaText, label) {
  const pattern = new RegExp(`${label}：([^/|]*)`)
  return metaText.match(pattern)?.[1]?.trim() || ''
}

function createStableId(sourceKey) {
  let hash = 2166136261
  for (const char of sourceKey) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `legacy-${(hash >>> 0).toString(16)}`
}

function parseBatchMeta(metaText, baseYear, sourceKey) {
  const sendRaw = extractField(metaText, '送洗日期')
  const receiveRaw = extractField(metaText, '领取日期')
  const billingRaw = extractField(metaText, '开单日期')

  const sendDate = parseDateValue(sendRaw, baseYear)
  const receiveDate = parseDateValue(receiveRaw, baseYear, sendDate.month)
  const billingDate = parseDateValue(
    billingRaw,
    baseYear,
    receiveDate.month ?? sendDate.month
  )

  const notes = [...sendDate.notes, ...receiveDate.notes, ...billingDate.notes]
  const batchNumber = metaText.match(/批次编号：(\d+)/)?.[1] || ''

  return {
    id: createStableId(sourceKey),
    sourceKey,
    batchNumber,
    sendDate: sendDate.value,
    receiveDate: receiveDate.value,
    billingDate: billingDate.value,
    notes,
  }
}

function getLifecycleHint(sourceFile, noteText) {
  if (sourceFile === '26年3月.md') {
    return 'received_only'
  }

  if (/收到衣服|仅接收|只接收/.test(noteText)) {
    return 'received_only'
  }

  if (/送洗登记|已送洗/.test(noteText)) {
    return 'sent_registered'
  }

  return ''
}

function parseQuantity(value) {
  const trimmed = value.trim()
  if (!trimmed) return 0

  const groupedMatches = [...trimmed.matchAll(/(\d+)\s*[*xX×]/g)]
  if (groupedMatches.length > 0) {
    return groupedMatches.reduce((sum, match) => sum + Number(match[1]), 0)
  }

  const simpleMatch = trimmed.match(/-?\d+/)
  return simpleMatch ? Number(simpleMatch[0]) : 0
}

function collectTable(lines, startIndex) {
  const header = parseTableRow(lines[startIndex])
  const rows = []
  let index = startIndex + 1

  while (index < lines.length) {
    const line = lines[index].trim()
    if (!line.startsWith('|')) break

    const cells = parseTableRow(line)
    if (isSeparatorRow(cells)) {
      index += 1
      continue
    }

    if (index > startIndex + 1 && /送洗日期：|批次编号：/.test(cells[0] || '')) {
      break
    }

    rows.push(cells)
    index += 1
  }

  return { header, rows, nextIndex: index }
}

function parseBatchRows(headerCells, rowCellsList) {
  const itemHeaders = headerCells.slice(2).map(name => name.trim()).filter(Boolean)

  const rows = []
  let currentDepartment = ''

  for (const rowCells of rowCellsList) {
    const departmentCell = (rowCells[0] || '').trim()
    const staffCell = (rowCells[1] || '').trim()

    if (departmentCell) {
      currentDepartment = departmentCell
    }

    const departmentName = currentDepartment
    const staffName = normalizeStaffName(staffCell)

    const items = itemHeaders
      .map((itemName, index) => ({
        itemName,
        quantity: parseQuantity(rowCells[index + 2] || ''),
      }))
      .filter(item => item.quantity > 0)

    if (!departmentName || !staffName || items.length === 0) {
      continue
    }

    rows.push({
      departmentName,
      staffName,
      items,
    })
  }

  return rows
}

function parseLooseTextLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Match patterns like: 侯磊1件羽绒服 / 艾星羽，2件衬衫 / 夏芳，1件西服，1件西裤
  const nameMatch = trimmed.match(/^([^\d，,]+?)\s*[，,]?\s*(\d)/)
  if (!nameMatch) return null

  const staffName = normalizeStaffName(nameMatch[1])
  if (!staffName) return null

  const items = []
  for (const match of trimmed.matchAll(/(\d+)\s*件\s*([^，,\d]+)/g)) {
    const quantity = Number(match[1])
    const itemName = match[2].trim()
    if (quantity > 0 && itemName) {
      items.push({ itemName, quantity })
    }
  }

  if (items.length === 0) return null
  return { staffName, items }
}

function parseFileContent(fileName, content) {
  const yearMatch = fileName.match(/^(\d{2})年/)
  const baseYear = yearMatch ? 2000 + Number(yearMatch[1]) : new Date().getFullYear()
  const lines = content.split(/\r?\n/)
  const batches = []
  let order = 0
  let lastTableEndIndex = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line.startsWith('|')) continue

    const cells = parseTableRow(line)
    const firstCell = cells[0] || ''

    if (!/送洗日期：|批次编号：/.test(firstCell)) {
      continue
    }

    order += 1
    const sourceKey = `${fileName}#${String(order).padStart(3, '0')}`
    const meta = parseBatchMeta(firstCell, baseYear, sourceKey)

    if (cells[1] === '姓名') {
      const table = collectTable(lines, index)
      const rows = parseBatchRows(table.header, table.rows)
        if (rows.length > 0 && meta.sendDate) {
          const note = meta.notes.join('；')
          batches.push({
            ...meta,
            sourceFile: fileName,
            note,
            lifecycleHint: getLifecycleHint(fileName, note),
            rows,
          })
        }
      index = table.nextIndex - 1
      lastTableEndIndex = table.nextIndex
      continue
    }

    let cursor = index + 1
    const noteParts = [...meta.notes]

    while (cursor < lines.length) {
      const raw = lines[cursor].trim()
      if (!raw) {
        cursor += 1
        continue
      }

      if (!raw.startsWith('|')) {
        cursor += 1
        continue
      }

      const table = collectTable(lines, cursor)
      if (table.header[0] === '部门') {
        const rows = parseBatchRows(table.header, table.rows)
        if (rows.length > 0 && meta.sendDate) {
          const note = noteParts.filter(Boolean).join('；')
          batches.push({
            ...meta,
            sourceFile: fileName,
            note,
            lifecycleHint: getLifecycleHint(fileName, note),
            rows,
          })
        }
        index = table.nextIndex - 1
        lastTableEndIndex = table.nextIndex
        break
      }

      const noteText = table.rows
        .flat()
        .map(cell => cell.trim())
        .filter(Boolean)
        .join(' ')

      if (noteText && !/送洗日期：|批次编号：/.test(noteText)) {
        noteParts.push(noteText)
      }

      cursor = table.nextIndex
    }
  }

  // Parse loose text records after the last table
  if (lastTableEndIndex < lines.length) {
    let looseDate = ''
    const looseRows = []

    for (let index = lastTableEndIndex; index < lines.length; index += 1) {
      const line = lines[index].trim()
      if (!line || line.startsWith('#') || line.startsWith('|') || line.startsWith('---')) continue

      // Check for date line like "2026年3月31日"
      const dateMatch = line.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
      if (dateMatch) {
        looseDate = `${dateMatch[1]}-${String(Number(dateMatch[2])).padStart(2, '0')}-${String(Number(dateMatch[3])).padStart(2, '0')}`
        continue
      }

      const parsed = parseLooseTextLine(line)
      if (parsed) {
        looseRows.push({
          departmentName: staffDeptMap.get(parsed.staffName) || '',
          staffName: parsed.staffName,
          items: parsed.items,
        })
      }
    }

    if (looseRows.length > 0) {
      const sendDate = looseDate || (batches.length > 0 ? batches[batches.length - 1].sendDate : '')
      if (sendDate) {
        order += 1
        const sourceKey = `${fileName}#${String(order).padStart(3, '0')}`
        batches.push({
          id: createStableId(sourceKey),
          sourceKey,
          batchNumber: '',
          sendDate,
          receiveDate: '',
          billingDate: '',
          notes: [],
          sourceFile: fileName,
          note: '',
          lifecycleHint: getLifecycleHint(fileName, ''),
          rows: looseRows,
        })
      }
    }
  }

  return batches
}

async function ensureOutputDir() {
  await fs.mkdir(path.dirname(outputFile), { recursive: true })
}

async function buildSeed() {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })
  const markdownFiles = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))

  const allBatches = []

  for (const fileName of markdownFiles) {
    const fullPath = path.join(sourceDir, fileName)
    const content = await fs.readFile(fullPath, 'utf8')
    const fileBatches = parseFileContent(fileName, content)
    allBatches.push(...fileBatches)
  }

  allBatches.sort((left, right) => {
    const dateCompare = (left.sendDate || '').localeCompare(right.sendDate || '')
    if (dateCompare !== 0) return dateCompare
    return left.sourceKey.localeCompare(right.sourceKey)
  })

  const batchCount = allBatches.length
  const recordCount = allBatches.reduce((sum, batch) => sum + batch.rows.length, 0)
  const itemRecordCount = allBatches.reduce(
    (sum, batch) => sum + batch.rows.reduce((rowSum, row) => rowSum + row.items.length, 0),
    0
  )

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceDir,
    summary: {
      fileCount: markdownFiles.length,
      batchCount,
      recordCount,
      itemRecordCount,
    },
    batches: allBatches,
  }

  await ensureOutputDir()
  await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  console.log(`历史种子已生成：${outputFile}`)
  console.log(`文件数：${markdownFiles.length}`)
  console.log(`批次数：${batchCount}`)
  console.log(`人员记录数：${recordCount}`)
  console.log(`物品明细数：${itemRecordCount}`)
}

buildSeed().catch(error => {
  console.error('生成历史种子失败：', error)
  process.exitCode = 1
})
