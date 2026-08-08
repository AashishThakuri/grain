import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { runLocalBenchmark } from '../compiler/benchmark.js'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff'])

function getArg(name, fallback = null) {
  const prefix = `--${name}=`
  const match = process.argv.slice(2).find(argument => argument.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

async function collectImages(inputPath) {
  const inputStats = await stat(inputPath)
  if (inputStats.isFile()) return [inputPath]

  const entries = await readdir(inputPath, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map(entry => path.join(inputPath, entry.name))
    .sort((left, right) => left.localeCompare(right))
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function round(value, digits = 6) {
  return value === null ? null : Number(value.toFixed(digits))
}

function summarize(results, modes) {
  return modes.map(mode => {
    const matching = results.filter(result => result.mode === mode && !result.error)
    const identityCases = matching.map(result => result.report.cases.find(item => item.transform === 'identity'))
    const jpegCases = matching.map(result => result.report.cases.find(item => item.transform === 'jpeg-75'))
    const screenshotCases = matching.map(result => result.report.cases.find(item => item.transform === 'screenshot-roundtrip'))
    return {
      mode,
      completedImages: matching.length,
      visualQualityPasses: matching.filter(result => result.report.visualQualityGate.pass).length,
      meanIdentitySsim: round(mean(identityCases.map(item => item.similarity.ssim))),
      meanIdentityDeltaE76: round(mean(identityCases.map(item => item.similarity.meanDeltaE76))),
      meanIdentityPsnr: round(mean(identityCases.map(item => item.similarity.psnr))),
      meanIdentityChannelDelta: round(mean(identityCases.map(item => item.similarity.averageChannelDelta))),
      meanJpeg75ChannelDelta: round(mean(jpegCases.map(item => item.similarity.averageChannelDelta))),
      meanJpeg75SignalRetention: round(mean(jpegCases.map(item => item.signalRetention))),
      meanScreenshotChannelDelta: round(mean(screenshotCases.map(item => item.similarity.averageChannelDelta))),
      meanScreenshotSignalRetention: round(mean(screenshotCases.map(item => item.signalRetention))),
      meanRuntimeMs: round(mean(matching.map(result => result.runtimeMs)), 2),
    }
  })
}

const inputPath = process.argv.slice(2).find(argument => !argument.startsWith('--'))
const outPath = getArg('out', 'reports/benchmark-suite.json')
const modes = getArg('modes', 'pixel,resistance,max')
  .split(',')
  .map(mode => mode.trim())
  .filter(Boolean)
const limit = Number.parseInt(getArg('limit', '0'), 10)

if (!inputPath) {
  console.error('Usage: node src/cli/benchmark-suite.js <image-or-directory> --modes=pixel,resistance,max --limit=0 --out=reports/suite.json')
  process.exit(1)
}

const allImages = await collectImages(inputPath)
const images = limit > 0 ? allImages.slice(0, limit) : allImages
const results = []
const suiteStartedAt = performance.now()

for (const imagePath of images) {
  const input = await readFile(imagePath)
  for (const mode of modes) {
    const startedAt = performance.now()
    process.stderr.write(`[grain-benchmark] ${path.basename(imagePath)} mode=${mode}\n`)
    try {
      const report = await runLocalBenchmark(input, { mode, format: 'png' })
      results.push({
        image: path.resolve(imagePath),
        mode,
        runtimeMs: Math.round(performance.now() - startedAt),
        report,
      })
    } catch (error) {
      results.push({
        image: path.resolve(imagePath),
        mode,
        runtimeMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  inputPath: path.resolve(inputPath),
  selectedImages: images.length,
  selectedModes: modes,
  totalRuntimeMs: Math.round(performance.now() - suiteStartedAt),
  claimBoundary: 'This suite measures fidelity and preprocessing behavior only. It does not measure AI-edit resistance.',
  summary: summarize(results, modes),
  results,
}

await mkdir(path.dirname(outPath), { recursive: true })
await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`)
process.stdout.write(`${path.resolve(outPath)}\n`)
