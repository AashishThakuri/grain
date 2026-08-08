import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runLocalBenchmark } from '../compiler/benchmark.js'
import { COMPILER_VERSION } from '../compiler/imageCompiler.js'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff'])

function getArg(name, fallback = null) {
  const prefix = `--${name}=`
  const match = process.argv.slice(2).find(argument => argument.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

function safeId(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
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

function parseVariants(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.variants) || !payload.variants.length) {
    throw new Error('DCT variants must be a JSON object with a non-empty variants array.')
  }

  const ids = new Set()
  return payload.variants.map((variant, index) => {
    const id = safeId(variant?.id || `dct-variant-${index + 1}`)
    if (!id || ids.has(id)) throw new Error(`DCT variant ${index + 1} has an invalid or duplicate id.`)
    if (!variant?.dctOptions || typeof variant.dctOptions !== 'object') {
      throw new Error(`DCT variant ${id} needs dctOptions.`)
    }
    ids.add(id)
    return {
      id,
      label: String(variant.label || id),
      mode: String(variant.mode || 'dct-research').toLowerCase(),
      dctOptions: variant.dctOptions,
    }
  })
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value
}

function summarizeVariant(records) {
  const identity = records.map(record => record.report.cases.find(item => item.transform === 'identity').similarity)
  return {
    evaluatedImages: records.length,
    visualGatePasses: records.filter(record => record.report.visualQualityGate.pass).length,
    minimumPsnr: round(Math.min(...identity.map(item => item.psnr)), 4),
    minimumSsim: round(Math.min(...identity.map(item => item.ssim))),
    maximumMeanDeltaE76: round(Math.max(...identity.map(item => item.meanDeltaE76))),
    maximumPerceptualHashDistance: Math.max(...identity.map(item => item.perceptualHashDistance)),
  }
}

const inputPath = process.argv.slice(2).find(argument => !argument.startsWith('--'))
const variantsPath = getArg('variants', 'evaluation/dct-variants.json')
const limit = Number.parseInt(getArg('limit', '0'), 10)
const format = getArg('format', 'png')
const outputPath = path.resolve(getArg('out', 'reports/dct-variant-visual-report.json'))

if (!inputPath) {
  console.error('Usage: node src/cli/evaluate-dct-variants.js <image-or-directory> --variants=evaluation/dct-variants.json --limit=3 --out=reports/dct-variant-visual-report.json')
  process.exit(1)
}

const images = await collectImages(path.resolve(inputPath))
const selectedImages = limit > 0 ? images.slice(0, limit) : images
if (!selectedImages.length) throw new Error('No supported images found.')

const variants = parseVariants(JSON.parse(await readFile(path.resolve(variantsPath), 'utf8')))
const records = []

for (const imagePath of selectedImages) {
  const input = await readFile(imagePath)
  const imageId = safeId(path.parse(imagePath).name)

  for (const variant of variants) {
    process.stderr.write(`[grain-dct-eval] image=${path.basename(imagePath)} candidate=${variant.id}\n`)
    const report = await runLocalBenchmark(input, {
      mode: variant.mode,
      dctOptions: variant.dctOptions,
      format,
    })
    records.push({
      imageId,
      image: path.resolve(imagePath),
      candidate: variant,
      report,
    })
  }
}

const summaries = variants.map(variant => ({
  candidate: variant,
  ...summarizeVariant(records.filter(record => record.candidate.id === variant.id)),
}))

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  compilerVersion: COMPILER_VERSION,
  purpose: 'Deterministic DCT candidate visual and transform benchmark',
  claimBoundary: [
    'This report measures only deterministic image similarity and transform behavior.',
    'It does not prove resistance against any image editor or closed model.',
    'Only candidates that pass every evaluated visual gate may proceed to paired model evaluation.',
  ],
  variantsSource: path.resolve(variantsPath),
  format,
  selectedImages: selectedImages.map(image => path.resolve(image)),
  summaries,
  records,
}

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
process.stdout.write(`${outputPath}\n`)
