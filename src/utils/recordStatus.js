// 每个主状态下的流程节点
export const FLOW_NODES = {
  pending: [
    { key: 'pending_pack',    label: '正在打包',   icon: 'todo-list-o' },
    { key: 'pending_transit', label: '送往途中',   icon: 'logistics' },
    { key: 'pending_arrive',  label: '到达酒店',   icon: 'location-o' },
    { key: 'pending_sign',    label: '签字确认',   icon: 'certificate' },
  ],
  washed: [
    { key: 'washed_washing',  label: '酒店布草',   icon: 'shop-o' },
    { key: 'washed_sign',     label: '签字确认',   icon: 'certificate' },
    { key: 'washed_waiting',  label: '待取回',     icon: 'clock-o' },
    { key: 'washed_transit',  label: '取回途中',   icon: 'logistics' },
    { key: 'washed_arrived',  label: '到达我方',   icon: 'wap-home-o' },
  ],
  received: [
    { key: 'received_sort',   label: '待发放',     icon: 'gift-o' },
    { key: 'received_sign',   label: '签字确认',   icon: 'certificate' },
  ],
}

// 获取某主状态下的流程节点列表
export function getFlowNodes(mainStatus) {
  return FLOW_NODES[mainStatus] || []
}

// 获取下一个流程节点
export function getNextFlowNode(mainStatus, currentNode) {
  const nodes = FLOW_NODES[mainStatus] || []
  const idx = nodes.findIndex(n => n.key === currentNode)
  if (idx < 0 || idx >= nodes.length - 1) return null
  return nodes[idx + 1]
}

// 获取流程节点元信息
export function getFlowNodeMeta(nodeKey) {
  for (const nodes of Object.values(FLOW_NODES)) {
    const found = nodes.find(n => n.key === nodeKey)
    if (found) return found
  }
  return null
}

// 默认子状态
export function getDefaultSubStatus(mainStatus) {
  const nodes = FLOW_NODES[mainStatus]
  return nodes?.[0]?.key || ''
}

const STATUS_META = {
  pending: { key: 'pending', label: '待送洗', tag: 'warning', order: 0 },
  washed: { key: 'washed', label: '待取回', tag: 'primary', order: 1 },
  received: { key: 'received', label: '待发放', tag: 'success', order: 2 },
  distributed: { key: 'distributed', label: '已发放', tag: 'default', order: 3 },
}

const STATUS_ACTION = {
  pending: { label: '确认送洗', next: 'washed' },
  washed: { label: '确认取回', next: 'received' },
  received: { label: '确认发放', next: 'distributed' },
}

export function getStatusMeta(status) {
  return STATUS_META[status] || STATUS_META.pending
}

export function getStatusAction(status) {
  return STATUS_ACTION[status] || null
}

export function summarizeRecordStatus(records = []) {
  return records.reduce(
    (summary, record) => {
      const key = STATUS_META[record.status] ? record.status : 'pending'
      summary[key] += Number(record.quantity || 0)
      return summary
    },
    {
      pending: 0,
      washed: 0,
      received: 0,
      distributed: 0,
    }
  )
}

export function computeBatchProgress(records = []) {
  const summary = summarizeRecordStatus(records)
  const total = summary.pending + summary.washed + summary.received + summary.distributed

  if (total === 0) {
    return { key: 'empty', label: '暂无衣物', tag: 'default', percent: 0 }
  }

  if (summary.distributed === total) {
    return { key: 'completed', label: '已完成', tag: 'success', percent: 100 }
  }

  if (summary.pending > 0) {
    return {
      key: 'pending',
      label: '待送洗',
      tag: 'warning',
      percent: Math.round((summary.distributed / total) * 100),
    }
  }

  if (summary.washed > 0) {
    return {
      key: 'washing',
      label: '待取回',
      tag: 'primary',
      percent: Math.round(((summary.received + summary.distributed) / total) * 100),
    }
  }

  return {
    key: 'received',
    label: '待发放',
    tag: 'success',
    percent: Math.round((summary.distributed / total) * 100),
  }
}

export function getToday() {
  return new Date().toISOString().slice(0, 10)
}

export function resizeImageToBase64(file, maxSize = 1280) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = image

        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('图片处理失败'))
          return
        }

        ctx.drawImage(image, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      image.onerror = () => reject(new Error('图片处理失败'))
      image.src = reader.result
    }
    reader.onerror = () => reject(new Error('图片处理失败'))
    reader.readAsDataURL(file)
  })
}
