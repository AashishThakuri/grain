import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import sharp from 'sharp'
import { runLocalBenchmark } from '../src/compiler/benchmark.js'
import { protectImage } from '../src/compiler/imageCompiler.js'

async function createSampleImage() {
  const width = 96
  const height = 72
  const data = Buffer.alloc(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      data[index] = Math.round(80 + x * 1.2)
      data[index + 1] = Math.round(56 + y * 1.8)
      data[index + 2] = Math.round(96 + ((x + y) % 40))
      data[index + 3] = 255
    }
  }

  return sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  }).png().toBuffer()
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

test('compiler is deterministic for the same input and mode', async () => {
  const input = await createSampleImage()
  const first = await protectImage(input, { mode: 'max', format: 'png' })
  const second = await protectImage(input, { mode: 'max', format: 'png' })

  assert.equal(sha256(first.buffer), sha256(second.buffer))
  assert.deepEqual(first.metrics, second.metrics)
})

test('max stress mode stays inside its configured channel bound', async () => {
  const input = await createSampleImage()
  const result = await protectImage(input, { mode: 'max', format: 'png' })
  const average = Number.parseFloat(result.metrics.visibleDelta)
  const maxDelta = Number.parseFloat(result.metrics.maxChannelDelta)

  assert.ok(average <= 4, `average delta too high: ${average}`)
  assert.ok(maxDelta <= 16, `max channel delta too high: ${maxDelta}`)
  assert.equal(result.mime, 'image/png')
})

test('pixel-safe mode limits every changed channel to one step', async () => {
  const input = await createSampleImage()
  const result = await protectImage(input, { mode: 'pixel', format: 'png' })
  const average = Number.parseFloat(result.metrics.visibleDelta)
  const maxDelta = Number.parseFloat(result.metrics.maxChannelDelta)
  const psnr = Number.parseFloat(result.metrics.psnr)

  assert.ok(average <= 0.45, `average delta too high: ${average}`)
  assert.ok(maxDelta <= 1, `max channel delta too high: ${maxDelta}`)
  assert.ok(psnr >= 54, `psnr too low: ${psnr}`)
})

test('resistance mode adds stronger bounded signal than pixel-safe mode', async () => {
  const input = await createSampleImage()
  const pixel = await protectImage(input, { mode: 'pixel', format: 'png' })
  const resistance = await protectImage(input, { mode: 'resistance', format: 'png' })
  const pixelAverage = Number.parseFloat(pixel.metrics.visibleDelta)
  const resistanceAverage = Number.parseFloat(resistance.metrics.visibleDelta)
  const resistanceMaxDelta = Number.parseFloat(resistance.metrics.maxChannelDelta)

  assert.ok(resistanceAverage > pixelAverage, `resistance did not increase signal: ${resistanceAverage} <= ${pixelAverage}`)
  assert.ok(resistanceMaxDelta <= 10, `resistance max channel delta too high: ${resistanceMaxDelta}`)
  assert.equal(resistance.metrics.compressionSurvival, 'Transform stress hypothesis')
})

test('default mode is the benchmark-gated visual-fidelity baseline', async () => {
  const input = await createSampleImage()
  const implicit = await protectImage(input, { format: 'png' })
  const explicit = await protectImage(input, { mode: 'pixel', format: 'png' })

  assert.equal(implicit.metrics.mode, 'pixel')
  assert.equal(sha256(implicit.buffer), sha256(explicit.buffer))
})

test('dct research mode is bounded, deterministic, and reports its active stage', async () => {
  const input = await createSampleImage()
  const first = await protectImage(input, { mode: 'dct-research', format: 'png' })
  const second = await protectImage(input, { mode: 'dct-research', format: 'png' })

  assert.equal(sha256(first.buffer), sha256(second.buffer))
  assert.ok(Number.parseFloat(first.metrics.maxChannelDelta) <= 2)
  assert.ok(first.metrics.stages.includes('quantization-aware-dct'))
  assert.equal(first.metrics.dctStage.quality, 75)
  assert.equal(first.metrics.dctStage.coefficientsPerBlock, 2)
})

test('custom DCT candidates remain deterministic and preserve their configuration', async () => {
  const input = await createSampleImage()
  const dctOptions = {
    quality: 75,
    strength: 1.2,
    coefficientsPerBlock: 4,
  }
  const first = await protectImage(input, { mode: 'dct-research', format: 'png', dctOptions })
  const second = await protectImage(input, { mode: 'dct-research', format: 'png', dctOptions })

  assert.equal(sha256(first.buffer), sha256(second.buffer))
  assert.equal(first.metrics.dctStage.quality, dctOptions.quality)
  assert.equal(first.metrics.dctStage.strength, dctOptions.strength)
  assert.equal(first.metrics.dctStage.coefficientsPerBlock, dctOptions.coefficientsPerBlock)
  assert.ok(Number.parseFloat(first.metrics.maxChannelDelta) <= 2)
})

test('compiler exposes versioned stage metrics', async () => {
  const input = await createSampleImage()
  const result = await protectImage(input, { mode: 'strong', format: 'jpeg' })

  assert.equal(result.extension, 'jpg')
  assert.equal(result.metrics.consentSignal, 'metadata + rgb directive carrier')
  assert.ok(result.metrics.compilerVersion)
  assert.ok(result.metrics.stages.includes('bounded-frequency-field'))
  assert.ok(result.metrics.stages.includes('directive-morse-carrier'))
})

test('consent-frame mode adds a visible no-edit frame outside the photo', async () => {
  const input = await createSampleImage()
  const result = await protectImage(input, { mode: 'consent-frame', format: 'png' })
  const metadata = await sharp(result.buffer).metadata()

  assert.equal(result.mime, 'image/png')
  assert.ok(metadata.width > 96, `framed width was not expanded: ${metadata.width}`)
  assert.ok(metadata.height > 72, `framed height was not expanded: ${metadata.height}`)
  assert.ok(result.metrics.consentSignal.includes('visible consent frame'))
  assert.equal(result.metrics.compressionSurvival, 'Visible consent frame')
})

test('semantic-mesh mode keeps size while adding pixel-level consent text', async () => {
  const input = await createSampleImage()
  const result = await protectImage(input, { mode: 'semantic-mesh', format: 'png' })
  const metadata = await sharp(result.buffer).metadata()

  assert.equal(result.mime, 'image/png')
  assert.equal(metadata.width, 96)
  assert.equal(metadata.height, 72)
  assert.ok(result.metrics.consentSignal.includes('semantic mesh'))
  assert.equal(result.metrics.compressionSurvival, 'Semantic consent mesh')
})

test('hard-refusal mode keeps size while exposing a visible refusal layer', async () => {
  const input = await createSampleImage()
  const result = await protectImage(input, { mode: 'hard-refusal', format: 'png' })
  const metadata = await sharp(result.buffer).metadata()

  assert.equal(result.mime, 'image/png')
  assert.equal(metadata.width, 96)
  assert.equal(metadata.height, 72)
  assert.ok(result.metrics.consentSignal.includes('hard refusal layer'))
  assert.equal(result.metrics.compressionSurvival, 'Hard visible refusal')
})

test('local benchmark reports visual robustness cases', async () => {
  const input = await createSampleImage()
  const report = await runLocalBenchmark(input, { mode: 'pixel', format: 'png' })
  const identity = report.cases.find(item => item.transform === 'identity')
  const jpeg = report.cases.find(item => item.transform === 'jpeg-95')
  const resize = report.cases.find(item => item.transform === 'resize-half')
  const screenshot = report.cases.find(item => item.transform === 'screenshot-roundtrip')

  assert.ok(identity)
  assert.ok(jpeg)
  assert.ok(resize)
  assert.ok(screenshot)
  assert.ok(identity.similarity.averageChannelDelta <= 0.7)
  assert.ok(identity.similarity.ssim >= 0.99)
  assert.ok(identity.similarity.meanDeltaE76 <= 1.5)
  assert.ok(identity.similarity.perceptualHashDistance <= 6)
  assert.ok(identity.similarity.hogCosineSimilarity >= 0 && identity.similarity.hogCosineSimilarity <= 1)
  assert.ok(identity.consentCarrier.agreement > 0.9)
  assert.equal(resize.consentCarrier.agreement, null)
  assert.ok(screenshot.consentCarrier.agreement < 0.75)
  assert.equal(identity.signalRetention, 1)
  assert.equal(report.visualQualityGate.pass, true)
  assert.ok(report.robustnessSummary.transformCount >= 10)
  assert.ok(report.evidenceScope.doesNotProve.includes('reduced effectiveness of any AI image editor'))
})
