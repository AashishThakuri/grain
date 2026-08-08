import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { protectImage } from './compiler/imageCompiler.js'

const app = express()
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
  },
})

const PORT = Number(process.env.PORT || 8787)

function formatDetails(details) {
  return Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
}

function logProtect(requestId, event, details = {}) {
  const suffix = formatDetails(details)
  console.log(`[grain:${requestId}] ${event}${suffix ? ` | ${suffix}` : ''}`)
}

app.use(cors({
  origin: [/^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/localhost:\d+$/],
  exposedHeaders: ['x-grain-metrics'],
}))

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'grain-backend' })
})

app.post('/api/protect', upload.single('image'), async (request, response) => {
  const requestId = randomUUID().slice(0, 8)
  const startedAt = performance.now()

  try {
    if (!request.file) {
      logProtect(requestId, 'rejected', { reason: 'missing-image' })
      response.status(400).json({ error: 'Image file is required.' })
      return
    }

    const requestedMode = request.body.mode || 'pixel'
    logProtect(requestId, 'upload-received', {
      name: request.file.originalname,
      bytes: request.file.size,
      mode: requestedMode,
      format: request.body.format || 'png',
    })

    const protectedImage = await protectImage(request.file.buffer, {
      mode: requestedMode,
      format: request.body.format,
      logger: ({ stage, ...details }) => logProtect(requestId, stage, details),
    })

    logProtect(requestId, 'response-ready', {
      outputBytes: protectedImage.buffer.length,
      visibleDelta: protectedImage.metrics.visibleDelta,
      psnr: protectedImage.metrics.psnr,
      totalMs: Math.round(performance.now() - startedAt),
    })

    response.type(protectedImage.mime)
    response.setHeader('x-grain-metrics', JSON.stringify(protectedImage.metrics))
    response.setHeader('content-disposition', `attachment; filename="grain-protected.${protectedImage.extension}"`)
    response.send(protectedImage.buffer)
  } catch (error) {
    logProtect(requestId, 'failed', {
      error: error.message || 'Protection failed.',
      totalMs: Math.round(performance.now() - startedAt),
    })
    response.status(500).json({ error: error.message || 'Protection failed.' })
  }
})

app.use((error, request, response, next) => {
  if (error instanceof multer.MulterError) {
    const requestId = randomUUID().slice(0, 8)
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? `Image is larger than the ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB local processing limit.`
      : 'The image upload could not be processed.'

    logProtect(requestId, 'rejected', {
      reason: error.code,
      message,
    })
    response.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: message })
    return
  }

  next(error)
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`GRAIN backend listening on http://127.0.0.1:${PORT}`)
})
