import { db } from '../db/index.js'

async function getConfig() {
  const repo = await db.settings.get('github_repo')
  const token = await db.settings.get('github_token')
  if (!repo || !token) return null
  return { repo: repo.value, token: token.value }
}

async function getFileSha(config, path) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${config.repo}/contents/${path}`,
      { headers: { Authorization: `token ${config.token}` } }
    )
    if (res.ok) {
      const data = await res.json()
      return data.sha
    }
  } catch (e) {
    // file doesn't exist yet
  }
  return null
}

export async function pushToGitHub() {
  const config = await getConfig()
  if (!config) return { success: false, error: '未配置 GitHub' }

  try {
    const data = {
      departments: await db.departments.toArray(),
      staff: await db.staff.toArray(),
      itemTypes: await db.itemTypes.toArray(),
      batches: await db.batches.toArray(),
      records: await db.records.toArray(),
      exportedAt: new Date().toISOString(),
    }

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))))
    const path = 'data/laundry-data.json'
    const sha = await getFileSha(config, path)

    const body = {
      message: `数据同步 ${new Date().toLocaleString('zh-CN')}`,
      content,
    }
    if (sha) body.sha = sha

    const res = await fetch(
      `https://api.github.com/repos/${config.repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )

    if (res.ok) {
      return { success: true }
    } else {
      const err = await res.json()
      return { success: false, error: err.message }
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function pullFromGitHub() {
  const config = await getConfig()
  if (!config) return { success: false, error: '未配置 GitHub' }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${config.repo}/contents/data/laundry-data.json`,
      { headers: { Authorization: `token ${config.token}` } }
    )

    if (!res.ok) {
      if (res.status === 404) return { success: true, data: null }
      const err = await res.json()
      return { success: false, error: err.message }
    }

    const file = await res.json()
    const text = decodeURIComponent(escape(atob(file.content)))
    const data = JSON.parse(text)
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function importFromGitHub() {
  const result = await pullFromGitHub()
  if (!result.success) return result
  if (!result.data) return { success: true, message: '云端暂无数据' }

  const data = result.data

  await db.transaction('rw', db.departments, db.staff, db.itemTypes, db.batches, db.records, async () => {
    if (data.departments?.length) {
      await db.departments.clear()
      await db.departments.bulkAdd(data.departments)
    }
    if (data.staff?.length) {
      await db.staff.clear()
      await db.staff.bulkAdd(data.staff)
    }
    if (data.itemTypes?.length) {
      await db.itemTypes.clear()
      await db.itemTypes.bulkAdd(data.itemTypes)
    }
    if (data.batches?.length) {
      await db.batches.clear()
      await db.batches.bulkAdd(data.batches)
    }
    if (data.records?.length) {
      await db.records.clear()
      await db.records.bulkAdd(data.records)
    }
  })

  return { success: true, message: '数据已从云端导入' }
}
