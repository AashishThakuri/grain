import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runLocalBenchmark } from '../compiler/benchmark.js'

function getArg(name, fallback = null) {
  const prefix = `--${name}=`
  const match = process.argv.slice(2).find(arg => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

const inputPath = process.argv.slice(2).find(arg => !arg.startsWith('--'))
const mode = getArg('mode', 'max')
const format = getArg('format', 'png')
const outPath = getArg('out')
const dctQuality = Number.parseFloat(getArg('dct-quality', ''))
const dctStrength = Number.parseFloat(getArg('dct-strength', ''))
const dctCoefficients = Number.parseInt(getArg('dct-coefficients', ''), 10)

if (!inputPath) {
  console.error('Usage: node src/cli/benchmark.js <image> --mode=max --format=png --out=reports/example.json')
  process.exit(1)
}

const input = await readFile(inputPath)
const dctOptions = {
  ...(Number.isFinite(dctQuality) ? { quality: dctQuality } : {}),
  ...(Number.isFinite(dctStrength) ? { strength: dctStrength } : {}),
  ...(Number.isFinite(dctCoefficients) ? { coefficientsPerBlock: dctCoefficients } : {}),
}
const report = await runLocalBenchmark(input, {
  mode,
  format,
  dctOptions: Object.keys(dctOptions).length ? dctOptions : undefined,
})
const json = `${JSON.stringify(report, null, 2)}\n`

if (outPath) {
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, json)
} else {
  process.stdout.write(json)
}
