import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { COMPILER_VERSION, protectImage } from '../compiler/imageCompiler.js'

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

function safeId(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function parseDctVariants(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.variants)) {
    throw new Error('DCT variants must be a JSON object with a variants array.')
  }

  return payload.variants.map((variant, index) => {
    if (!variant || typeof variant !== 'object') {
      throw new Error(`DCT variant ${index + 1} must be an object.`)
    }

    const id = safeId(variant.id || `dct-variant-${index + 1}`)
    if (!id) throw new Error(`DCT variant ${index + 1} needs a usable id.`)
    if (!variant.dctOptions || typeof variant.dctOptions !== 'object') {
      throw new Error(`DCT variant ${id} needs dctOptions.`)
    }

    return {
      id,
      label: String(variant.label || id),
      mode: String(variant.mode || 'dct-research').toLowerCase(),
      dctOptions: variant.dctOptions,
    }
  })
}

const inputPath = process.argv.slice(2).find(argument => !argument.startsWith('--'))
const dctVariantsPath = getArg('dct-variants')
const modes = getArg('modes', dctVariantsPath ? '' : 'pixel,dct-research')
  .split(',')
  .map(mode => mode.trim())
  .filter(Boolean)
const seeds = getArg('seeds', '101,202')
  .split(',')
  .map(value => Number.parseInt(value.trim(), 10))
  .filter(Number.isFinite)
const limit = Number.parseInt(getArg('limit', '0'), 10)
const outputDirectory = path.resolve(getArg('out-dir', 'reports/model-benchmark-inputs'))
const manifestPath = path.resolve(getArg('manifest', path.join(outputDirectory, 'manifest.json')))
const promptsPath = path.resolve(getArg('prompts', 'evaluation/prompts.json'))

if (!inputPath) {
  console.error('Usage: node src/cli/prepare-model-benchmark.js <image-or-directory> --modes=pixel,dct-research --limit=1 --out-dir=reports/model-inputs')
  console.error('   or: node src/cli/prepare-model-benchmark.js <image-or-directory> --dct-variants=evaluation/dct-variants.json --limit=1 --out-dir=reports/dct-inputs')
  process.exit(1)
}

const allImages = await collectImages(inputPath)
const images = limit > 0 ? allImages.slice(0, limit) : allImages
const promptManifest = JSON.parse(await readFile(promptsPath, 'utf8'))
const dctVariants = dctVariantsPath
  ? parseDctVariants(JSON.parse(await readFile(path.resolve(dctVariantsPath), 'utf8')))
  : []
const candidates = [
  ...modes.map(mode => ({ id: mode, label: mode, mode, dctOptions: null })),
  ...dctVariants,
]
const seenCandidateIds = new Set()

for (const candidate of candidates) {
  if (seenCandidateIds.has(candidate.id)) {
    throw new Error(`Duplicate protected condition id: ${candidate.id}`)
  }
  seenCandidateIds.add(candidate.id)
}

if (!candidates.length) {
  throw new Error('At least one mode or DCT variant is required.')
}

const cases = []

await mkdir(outputDirectory, { recursive: true })

for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
  const imagePath = images[imageIndex]
  const input = await readFile(imagePath)
  const id = `${String(imageIndex + 1).padStart(3, '0')}-${safeId(path.parse(imagePath).name)}`
  const caseDirectory = path.join(outputDirectory, id)
  const cleanExtension = path.extname(imagePath).toLowerCase() || '.img'
  const cleanPath = path.join(caseDirectory, `clean${cleanExtension}`)
  const conditions = []

  await mkdir(caseDirectory, { recursive: true })
  await copyFile(imagePath, cleanPath)
  conditions.push({
    id: 'clean',
    kind: 'control',
    image: path.resolve(cleanPath),
    compilerMetrics: null,
  })

  for (const candidate of candidates) {
    process.stderr.write(`[grain-prepare] ${path.basename(imagePath)} condition=${candidate.id} mode=${candidate.mode}\n`)
    const protectedImage = await protectImage(input, {
      mode: candidate.mode,
      format: 'png',
      dctOptions: candidate.dctOptions || undefined,
    })
    const protectedPath = path.join(caseDirectory, `${candidate.id}.png`)
    await writeFile(protectedPath, protectedImage.buffer)
    conditions.push({
      id: candidate.id,
      kind: 'protected',
      image: path.resolve(protectedPath),
      compilerMetrics: protectedImage.metrics,
      compilerConfig: {
        label: candidate.label,
        mode: candidate.mode,
        dctOptions: candidate.dctOptions,
      },
    })
  }

  cases.push({
    id,
    originalSource: path.resolve(imagePath),
    conditions,
    prompts: promptManifest.prompts,
    seeds,
  })
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  compilerVersion: COMPILER_VERSION,
  purpose: 'Matched clean/protected external image-edit evaluation',
  claimBoundary: 'No result exists until an evaluator runs every recorded condition and saves the outputs.',
  dctVariantsSource: dctVariantsPath ? path.resolve(dctVariantsPath) : null,
  cases,
}

await mkdir(path.dirname(manifestPath), { recursive: true })
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(`${manifestPath}\n`)
