import './protect.css'

const API_BASE = import.meta.env.VITE_GRAIN_API || 'http://127.0.0.1:8787'

const form = document.getElementById('protect-form')
const input = document.getElementById('image-input')
const modeInput = document.getElementById('mode-input')
const formatInput = document.getElementById('format-input')
const dropZone = document.getElementById('drop-zone')
const sourcePreview = document.getElementById('source-preview')
const outputPreview = document.getElementById('output-preview')
const apiStatus = document.getElementById('api-status')
const visibleDelta = document.getElementById('visible-delta')
const layerEnergy = document.getElementById('layer-energy')
const compressionSurvival = document.getElementById('compression-survival')
const consentSignal = document.getElementById('consent-signal')
const downloadLink = document.getElementById('download-link')

let latestDownloadUrl = ''

function setStatus(message) {
  apiStatus.textContent = message
}

function setPreview(file) {
  if (!file) return

  const url = URL.createObjectURL(file)
  sourcePreview.src = url
  sourcePreview.closest('.preview-card').classList.add('has-image')
}

function clearDownload() {
  if (latestDownloadUrl) {
    URL.revokeObjectURL(latestDownloadUrl)
    latestDownloadUrl = ''
  }

  downloadLink.hidden = true
  downloadLink.removeAttribute('href')
}

function setMetrics(metrics = {}) {
  visibleDelta.textContent = metrics.visibleDelta || 'Measured'
  layerEnergy.textContent = metrics.layerEnergy || 'Applied'
  compressionSurvival.textContent = metrics.compressionSurvival || 'Estimated'
  consentSignal.textContent = metrics.consentSignal || 'Embedded'
}

input.addEventListener('change', () => {
  clearDownload()
  setPreview(input.files?.[0])
  setStatus('Image ready')
})

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault()
    dropZone.classList.add('is-hot')
  })
}

for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault()
    dropZone.classList.remove('is-hot')
  })
}

dropZone.addEventListener('drop', event => {
  const file = event.dataTransfer?.files?.[0]
  if (!file) return

  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
  clearDownload()
  setPreview(file)
  setStatus('Image ready')
})

form.addEventListener('submit', async event => {
  event.preventDefault()

  const file = input.files?.[0]
  if (!file) {
    setStatus('Choose an image first')
    return
  }

  clearDownload()
  setStatus('Protecting image')

  const body = new FormData()
  body.set('image', file)
  body.set('mode', modeInput.value)
  body.set('format', formatInput.value)

  try {
    const response = await fetch(`${API_BASE}/api/protect`, {
      method: 'POST',
      body,
    })

    if (!response.ok) {
      const details = await response.json().catch(() => ({}))
      throw new Error(details.error || 'Protection failed')
    }

    const metrics = JSON.parse(response.headers.get('x-grain-metrics') || '{}')
    const blob = await response.blob()
    latestDownloadUrl = URL.createObjectURL(blob)

    outputPreview.src = latestDownloadUrl
    outputPreview.closest('.preview-card').classList.add('has-image')
    downloadLink.href = latestDownloadUrl
    downloadLink.download = `grain-protected.${formatInput.value === 'jpeg' ? 'jpg' : 'png'}`
    downloadLink.hidden = false
    setMetrics(metrics)
    setStatus('Protected export ready')
  } catch (error) {
    setStatus(error.message)
  }
})
