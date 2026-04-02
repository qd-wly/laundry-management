import { ref } from 'vue'

const STORAGE_KEY = 'laundry-confetti-enabled'

export const confettiEnabled = ref(loadSetting())

function loadSetting() {
  const val = window.localStorage.getItem(STORAGE_KEY)
  return val === null ? true : val === 'true'
}

export function setConfettiEnabled(val) {
  confettiEnabled.value = val
  window.localStorage.setItem(STORAGE_KEY, String(val))
}

export function fireConfetti() {
  if (!confettiEnabled.value) return

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none'
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  const particles = []
  const colors = ['#68d0c8', '#e8a14a', '#edf2f7', '#7eb8f0', '#e36e60', '#a78bfa', '#f0c27f', '#ff6b9d', '#c4e538', '#ffd32a']
  const cx = canvas.width / 2
  const cy = canvas.height * 0.42

  // Wave 1: big burst from center
  for (let i = 0; i < 150; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = Math.random() * 16 + 5
    particles.push({
      x: cx + (Math.random() - 0.5) * 60,
      y: cy + (Math.random() - 0.5) * 40,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      size: Math.random() * 8 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 14,
      shape: ['rect', 'circle', 'star'][Math.floor(Math.random() * 3)],
      delay: 0,
    })
  }

  // Wave 2: side bursts
  for (let i = 0; i < 60; i++) {
    const side = Math.random() > 0.5 ? 0.25 : 0.75
    const angle = Math.random() * Math.PI * 2
    const speed = Math.random() * 12 + 4
    particles.push({
      x: canvas.width * side,
      y: cy + (Math.random() - 0.5) * 80,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      size: Math.random() * 7 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      shape: Math.random() > 0.4 ? 'rect' : 'circle',
      delay: 15 + Math.random() * 10,
    })
  }

  // Wave 3: top rain
  for (let i = 0; i < 40; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -20,
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 4 + 2,
      size: Math.random() * 5 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 8,
      shape: 'rect',
      delay: 30 + Math.random() * 30,
    })
  }

  let frame = 0
  const maxFrames = 240

  function drawStar(ctx, size) {
    const spikes = 5
    const outerR = size
    const innerR = size * 0.4
    ctx.beginPath()
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR
      const a = (i * Math.PI) / spikes - Math.PI / 2
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
  }

  function animate() {
    frame++
    if (frame > maxFrames) {
      canvas.remove()
      return
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    particles.forEach(p => {
      if (frame < p.delay) return

      const age = frame - p.delay
      p.x += p.vx
      p.vy += 0.15
      p.y += p.vy
      p.vx *= 0.985
      p.rotation += p.rotationSpeed
      p.rotationSpeed *= 0.995

      const fadeStart = maxFrames * 0.5
      p.alpha = age < fadeStart ? 1 : Math.max(0, 1 - (age - fadeStart) / (maxFrames - p.delay - fadeStart))

      if (p.alpha <= 0) return

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.globalAlpha = p.alpha
      ctx.fillStyle = p.color

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6)
      } else if (p.shape === 'star') {
        drawStar(ctx, p.size / 2)
      } else {
        ctx.beginPath()
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()
    })

    requestAnimationFrame(animate)
  }

  requestAnimationFrame(animate)
}
