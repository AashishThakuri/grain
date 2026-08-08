import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  DEFAULT_VISUAL_QUALITY_GATE,
  measureSimilarity,
} from '../compiler/benchmark.js'

function getArg(name, fallback = null) {
  const prefix = `--${name}=`
  const match = process.argv.slice(2).find(argument => argument.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

function requiredInput() {
  const input = process.argv.slice(2).find(argument => !argument.startsWith('--'))
  if (!input) {
    console.error('Usage: node src/cli/score-model-evaluation.js <evaluation-report.json> --out=reports/model-score.json')
    process.exit(1)
  }
  return path.resolve(input)
}

function groupKey(result) {
  return `${result.caseId}::${result.promptId}::${result.seed}`
}

function compact(metrics) {
  return {
    averageChannelDelta: Number(metrics.averageChannelDelta.toFixed(4)),
    maxChannelDelta: Number(metrics.maxChannelDelta.toFixed(4)),
    psnr: Number.isFinite(metrics.psnr) ? Number(metrics.psnr.toFixed(4)) : metrics.psnr,
    ssim: Number(metrics.ssim.toFixed(6)),
    meanDeltaE76: Number(metrics.meanDeltaE76.toFixed(6)),
    perceptualHashDistance: metrics.perceptualHashDistance,
    hogCosineSimilarity: Number(metrics.hogCosineSimilarity.toFixed(6)),
    luminanceCorrelation: Number(metrics.luminanceCorrelation.toFixed(6)),
    averageEdgeDrift: Number(metrics.averageEdgeDrift.toFixed(4)),
  }
}

function passesVisualGate(metrics, gate = DEFAULT_VISUAL_QUALITY_GATE) {
  return metrics.psnr >= gate.minimumPsnr &&
    metrics.ssim >= gate.minimumSsim &&
    metrics.meanDeltaE76 <= gate.maximumMeanDeltaE76 &&
    metrics.perceptualHashDistance <= gate.maximumPerceptualHashDistance
}

function isMaterialOutputShift(metrics) {
  return metrics.ssim <= 0.9 ||
    metrics.meanDeltaE76 >= 6 ||
    metrics.perceptualHashDistance >= 8 ||
    metrics.averageChannelDelta >= 10
}

async function modelInputBuffer(filePath, resolution) {
  const source = await readFile(filePath)
  return sharp(source, { failOn: 'none', limitInputPixels: 40_000_000 })
    .rotate()
    .resize(resolution, resolution, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer()
}

const reportPath = requiredInput()
const outputPath = path.resolve(getArg('out', 'reports/model-evaluation-score.json'))
const report = JSON.parse(await readFile(reportPath, 'utf8'))
const resolution = Number(report.settings?.resolution || 512)
const groups = new Map()

for (const result of report.results || []) {
  if (result.status !== 'complete') continue
  const key = groupKey(result)
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(result)
}

const comparisons = []
let failedGroups = 0

for (const [key, results] of groups) {
  const clean = results.find(result => result.conditionId === 'clean')
  if (!clean?.outputImage) {
    failedGroups += 1
    continue
  }

  const protectedResults = results.filter(result => result.conditionId !== 'clean')
  if (!protectedResults.length) {
    failedGroups += 1
    continue
  }

  const cleanOutput = await readFile(clean.outputImage)
  const cleanInput = await modelInputBuffer(clean.inputImage, resolution)

  for (const protectedResult of protectedResults) {
    const protectedOutput = await readFile(protectedResult.outputImage)
    const protectedInput = await modelInputBuffer(protectedResult.inputImage, resolution)
    const [inputSimilarity, outputSimilarity] = await Promise.all([
      measureSimilarity(cleanInput, protectedInput),
      measureSimilarity(cleanOutput, protectedOutput),
    ])
    const inputGatePass = passesVisualGate(inputSimilarity)
    const materialOutputShift = isMaterialOutputShift(outputSimilarity)

    comparisons.push({
      key,
      caseId: protectedResult.caseId,
      promptId: protectedResult.promptId,
      promptFamily: protectedResult.promptFamily,
      seed: protectedResult.seed,
      conditionId: protectedResult.conditionId,
      instruction: protectedResult.instruction,
      cleanOutputImage: clean.outputImage,
      protectedOutputImage: protectedResult.outputImage,
      protectedInputVisualGatePass: inputGatePass,
      materialOutputShift,
      interpretation: materialOutputShift
        ? 'The protected input changed the model output relative to clean control; this is not proof that the requested edit was blocked.'
        : 'No material model-output shift was observed relative to the clean control.',
      protectedInputVsCleanInput: compact(inputSimilarity),
      protectedOutputVsCleanOutput: compact(outputSimilarity),
    })
  }
}

const visuallyValidComparisons = comparisons.filter(item => item.protectedInputVisualGatePass)
const materialShifts = comparisons.filter(item => item.materialOutputShift)
const visuallyValidMaterialShifts = comparisons.filter(item => (
  item.protectedInputVisualGatePass && item.materialOutputShift
))

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceEvaluationReport: reportPath,
  model: report.model,
  compilerVersion: report.compilerVersion,
  settings: report.settings,
  thresholds: {
    protectedInputVisualGate: DEFAULT_VISUAL_QUALITY_GATE,
    materialOutputShift: {
      maximumSsim: 0.9,
      minimumMeanDeltaE76: 6,
      minimumPerceptualHashDistance: 8,
      minimumAverageChannelDelta: 10,
    },
  },
  summary: {
    matchedGroups: groups.size,
    failedGroups,
    protectedComparisons: comparisons.length,
    protectedInputVisualGatePass: visuallyValidComparisons.length,
    materialOutputShifts: materialShifts.length,
    visuallyValidMaterialOutputShifts: visuallyValidMaterialShifts.length,
  },
  claimBoundary: [
    'A material output shift means the protected input changed this model run relative to the clean control.',
    'It does not mean the edit failed, identity was protected, or another model will behave the same way.',
    'Edit-success scoring still requires visual or task-specific review of the saved output images.',
  ],
  comparisons,
}

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
process.stdout.write(`${outputPath}\n`)
