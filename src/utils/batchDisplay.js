function getBatchDate(batch) {
  return batch?.sendDate || String(batch?.createdAt || '').slice(0, 10) || ''
}

function compareBatches(left, right) {
  const leftDate = getBatchDate(left)
  const rightDate = getBatchDate(right)
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)

  const leftCreated = left?.createdAt || ''
  const rightCreated = right?.createdAt || ''
  if (leftCreated !== rightCreated) return leftCreated.localeCompare(rightCreated)

  return String(left?.id || '').localeCompare(String(right?.id || ''))
}

function toLetters(index) {
  let value = index
  let result = ''

  do {
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26) - 1
  } while (value >= 0)

  return result
}

export function buildBatchCodeMap(batches) {
  const groups = new Map()
  const sortedBatches = [...batches].sort(compareBatches)

  sortedBatches.forEach(batch => {
    const date = getBatchDate(batch)
    if (!groups.has(date)) {
      groups.set(date, [])
    }
    groups.get(date).push(batch)
  })

  const batchCodeMap = new Map()
  groups.forEach(dayBatches => {
    const needCode = dayBatches.length > 1
    dayBatches.forEach((batch, index) => {
      batchCodeMap.set(batch.id, needCode ? toLetters(index) : '')
    })
  })

  return batchCodeMap
}

export function getBatchDisplayLabel(batch, batchCodeMap) {
  const date = getBatchDate(batch)
  const code = batchCodeMap.get(batch.id) || ''
  if (!date) return code ? `(${code})` : '批次'
  return code ? `${date}(${code})` : date
}

export function getBatchDateValue(batch) {
  return getBatchDate(batch)
}
