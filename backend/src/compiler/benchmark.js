import sharp from 'sharp'
import {
  COMPILER_VERSION,
  consentBitAt,
  protectImage,
  seedFromBuffer,
} from './imageCompiler.js'

async function decodeRgba(buffer) {
  const image = sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
    .rotate()
    .ensureAlpha()
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })

  return {
    data,
    width: info.width,
    height: info.height,
  }
}

function srgbChannelToLinear(value) {
  const normalized = value / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function rgbToLab(r, g, b) {
  const lr = srgbChannelToLinear(r)
  const lg = srgbChannelToLinear(g)
  const lb = srgbChannelToLinear(b)
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883
  const pivot = value => value > 0.008856
    ? Math.cbrt(value)
    : 7.787 * value + 16 / 116
  const fx = pivot(x)
  const fy = pivot(y)
  const fz = pivot(z)

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

function windowedSsim(reference, candidate, blockSize = 8) {
  const c1 = (0.01 * 255) ** 2
  const c2 = (0.03 * 255) ** 2
  let score = 0
  let windows = 0

  for (let top = 0; top < reference.height; top += blockSize) {
    for (let left = 0; left < reference.width; left += blockSize) {
      const right = Math.min(reference.width, left + blockSize)
      const bottom = Math.min(reference.height, top + blockSize)
      let sumRef = 0
      let sumCand = 0
      let samples = 0

      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const index = (y * reference.width + x) * 4
          sumRef += luminance(reference.data, index)
          sumCand += luminance(candidate.data, index)
          samples += 1
        }
      }

      const meanRef = sumRef / samples
      const meanCand = sumCand / samples
      let varianceRef = 0
      let varianceCand = 0
      let covariance = 0

      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const index = (y * reference.width + x) * 4
          const refDelta = luminance(reference.data, index) - meanRef
          const candDelta = luminance(candidate.data, index) - meanCand
          varianceRef += refDelta * refDelta
          varianceCand += candDelta * candDelta
          covariance += refDelta * candDelta
        }
      }

      const denominator = Math.max(1, samples - 1)
      varianceRef /= denominator
      varianceCand /= denominator
      covariance /= denominator
      score += ((2 * meanRef * meanCand + c1) * (2 * covariance + c2)) /
        ((meanRef * meanRef + meanCand * meanCand + c1) * (varianceRef + varianceCand + c2))
      windows += 1
    }
  }

  return windows ? score / windows : 1
}

function meanDeltaE76(reference, candidate) {
  const pixels = reference.width * reference.height
  const stride = Math.max(1, Math.floor(Math.sqrt(pixels / 200_000)))
  let total = 0
  let samples = 0

  for (let y = 0; y < reference.height; y += stride) {
    for (let x = 0; x < reference.width; x += stride) {
      const index = (y * reference.width + x) * 4
      const ref = rgbToLab(reference.data[index], reference.data[index + 1], reference.data[index + 2])
      const cand = rgbToLab(candidate.data[index], candidate.data[index + 1], candidate.data[index + 2])
      total += Math.hypot(ref.l - cand.l, ref.a - cand.a, ref.b - cand.b)
      samples += 1
    }
  }

  return samples ? total / samples : 0
}

function hogDescriptor(image, cellSize = 8, bins = 9) {
  const cellsX = Math.ceil(image.width / cellSize)
  const cellsY = Math.ceil(image.height / cellSize)
  const histogram = new Float64Array(cellsX * cellsY * bins)

  for (let y = 1; y < image.height - 1; y += 1) {
    for (let x = 1; x < image.width - 1; x += 1) {
      const dx = luminance(image.data, (y * image.width + x + 1) * 4) -
        luminance(image.data, (y * image.width + x - 1) * 4)
      const dy = luminance(image.data, ((y + 1) * image.width + x) * 4) -
        luminance(image.data, ((y - 1) * image.width + x) * 4)
      const magnitude = Math.hypot(dx, dy)
      const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 180) % 180
      const bin = Math.min(bins - 1, Math.floor(angle / (180 / bins)))
      const cellX = Math.floor(x / cellSize)
      const cellY = Math.floor(y / cellSize)
      histogram[(cellY * cellsX + cellX) * bins + bin] += magnitude
    }
  }

  for (let cell = 0; cell < cellsX * cellsY; cell += 1) {
    const offset = cell * bins
    let norm = 1e-9
    for (let bin = 0; bin < bins; bin += 1) {
      norm += histogram[offset + bin] ** 2
    }
    norm = Math.sqrt(norm)
    for (let bin = 0; bin < bins; bin += 1) {
      histogram[offset + bin] /= norm
    }
  }

  return histogram
}

function cosineSimilarity(left, right) {
  if (left.length !== right.length) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] * left[index]
    rightNorm += right[index] * right[index]
  }

  return dot / Math.sqrt(Math.max(leftNorm * rightNorm, Number.EPSILON))
}

async function perceptualHash(buffer) {
  const size = 32
  const lowFrequencySize = 8
  const { data } = await sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
    .rotate()
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const coefficients = []

  for (let v = 0; v < lowFrequencySize; v += 1) {
    for (let u = 0; u < lowFrequencySize; u += 1) {
      let coefficient = 0
      for (let y = 0; y < size; y += 1) {
        const cy = Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size))
        for (let x = 0; x < size; x += 1) {
          const cx = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size))
          coefficient += data[y * size + x] * cx * cy
        }
      }
      coefficients.push(coefficient)
    }
  }

  const comparison = coefficients.slice(1).sort((a, b) => a - b)
  const median = comparison[Math.floor(comparison.length / 2)]
  return coefficients.map(value => value >= median)
}

function hammingDistance(left, right) {
  let distance = 0
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) distance += 1
  }
  return distance + Math.abs(left.length - right.length)
}

function luminance(data, index) {
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722
}

function edgeAt(data, x, y, width, height) {
  const left = Math.max(0, x - 1)
  const right = Math.min(width - 1, x + 1)
  const top = Math.max(0, y - 1)
  const bottom = Math.min(height - 1, y + 1)
  const dx = Math.abs(luminance(data, (y * width + right) * 4) - luminance(data, (y * width + left) * 4))
  const dy = Math.abs(luminance(data, (bottom * width + x) * 4) - luminance(data, (top * width + x) * 4))
  return Math.min(255, dx + dy)
}

export async function measureSimilarity(referenceBuffer, candidateBuffer) {
  const [reference, candidate, referenceHash, candidateHash] = await Promise.all([
    decodeRgba(referenceBuffer),
    decodeRgba(candidateBuffer),
    perceptualHash(referenceBuffer),
    perceptualHash(candidateBuffer),
  ])

  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error('Similarity inputs must have matching dimensions.')
  }

  let absoluteDelta = 0
  let squaredDelta = 0
  let maxChannelDelta = 0
  let colorDriftR = 0
  let colorDriftG = 0
  let colorDriftB = 0
  let edgeDrift = 0
  let sumRef = 0
  let sumCand = 0
  let sumRefSq = 0
  let sumCandSq = 0
  let sumCross = 0

  const pixels = reference.width * reference.height

  for (let y = 0; y < reference.height; y += 1) {
    for (let x = 0; x < reference.width; x += 1) {
      const index = (y * reference.width + x) * 4
      const dr = Math.abs(reference.data[index] - candidate.data[index])
      const dg = Math.abs(reference.data[index + 1] - candidate.data[index + 1])
      const db = Math.abs(reference.data[index + 2] - candidate.data[index + 2])
      const refLum = luminance(reference.data, index)
      const candLum = luminance(candidate.data, index)

      absoluteDelta += dr + dg + db
      squaredDelta += dr * dr + dg * dg + db * db
      maxChannelDelta = Math.max(maxChannelDelta, dr, dg, db)
      colorDriftR += candidate.data[index] - reference.data[index]
      colorDriftG += candidate.data[index + 1] - reference.data[index + 1]
      colorDriftB += candidate.data[index + 2] - reference.data[index + 2]
      edgeDrift += Math.abs(
        edgeAt(reference.data, x, y, reference.width, reference.height) -
        edgeAt(candidate.data, x, y, candidate.width, candidate.height)
      )
      sumRef += refLum
      sumCand += candLum
      sumRefSq += refLum * refLum
      sumCandSq += candLum * candLum
      sumCross += refLum * candLum
    }
  }

  const channels = pixels * 3
  const mse = squaredDelta / channels
  const covariance = sumCross - (sumRef * sumCand) / pixels
  const varianceRef = sumRefSq - (sumRef * sumRef) / pixels
  const varianceCand = sumCandSq - (sumCand * sumCand) / pixels
  const luminanceCorrelation = covariance / Math.sqrt(Math.max(varianceRef * varianceCand, Number.EPSILON))
  const referenceHog = hogDescriptor(reference)
  const candidateHog = hogDescriptor(candidate)

  return {
    width: reference.width,
    height: reference.height,
    averageChannelDelta: absoluteDelta / channels,
    maxChannelDelta,
    mse,
    psnr: mse === 0 ? Infinity : 20 * Math.log10(255 / Math.sqrt(mse)),
    ssim: windowedSsim(reference, candidate),
    meanDeltaE76: meanDeltaE76(reference, candidate),
    perceptualHashDistance: hammingDistance(referenceHash, candidateHash),
    hogCosineSimilarity: cosineSimilarity(referenceHog, candidateHog),
    luminanceCorrelation,
    averageEdgeDrift: edgeDrift / pixels,
    colorDrift: {
      r: colorDriftR / pixels,
      g: colorDriftG / pixels,
      b: colorDriftB / pixels,
    },
  }
}

export async function measureConsentCarrierAgreement(protectedBuffer, seed) {
  const image = await decodeRgba(protectedBuffer)
  let total = 0
  let matches = 0

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const expected = consentBitAt(x, y, seed)
      if (expected === null) continue

      total += 1
      const index = (y * image.width + x) * 4
      const observed = image.data[index + 2] & 1
      if (observed === expected) matches += 1
    }
  }

  return {
    comparableSamples: total,
    agreement: total ? matches / total : null,
  }
}

async function jpegTransform(buffer, quality) {
  return sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
    .rotate()
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer()
}

async function resizeTransform(buffer, ratio) {
  const metadata = await sharp(buffer, { failOn: 'none' }).metadata()
  const width = Math.max(16, Math.round((metadata.width || 16) * ratio))
  const height = Math.max(16, Math.round((metadata.height || 16) * ratio))

  return sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
    .rotate()
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer()
}

async function cropTransform(buffer, ratio) {
  const metadata = await sharp(buffer, { failOn: 'none' }).metadata()
  const sourceWidth = metadata.width || 16
  const sourceHeight = metadata.height || 16
  const width = Math.max(16, Math.round(sourceWidth * ratio))
  const height = Math.max(16, Math.round(sourceHeight * ratio))
  const left = Math.max(0, Math.floor((sourceWidth - width) / 2))
  const top = Math.max(0, Math.floor((sourceHeight - height) / 2))

  return sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
    .rotate()
    .extract({ left, top, width, height })
    .png()
    .toBuffer()
}

async function webpTransform(buffer, quality) {
  return sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
    .rotate()
    .webp({ quality })
    .toBuffer()
}

async function blurTransform(buffer, sigma) {
  return sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
    .rotate()
    .blur(sigma)
    .png()
    .toBuffer()
}

async function screenshotTransform(buffer) {
  const metadata = await sharp(buffer, { failOn: 'none' }).metadata()
  const sourceWidth = metadata.width || 16
  const sourceHeight = metadata.height || 16
  const width = Math.max(16, Math.round(sourceWidth * 0.72))
  const height = Math.max(16, Math.round(sourceHeight * 0.72))

  const encoded = await sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
    .rotate()
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: '4:2:0' })
    .toBuffer()

  return sharp(encoded, { failOn: 'none', limitInputPixels: 40_000_000 })
    .resize(sourceWidth, sourceHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()
}

const TRANSFORMS = [
  {
    name: 'identity',
    sameCoordinateCarrier: true,
    apply: async buffer => buffer,
  },
  {
    name: 'jpeg-95',
    sameCoordinateCarrier: true,
    apply: buffer => jpegTransform(buffer, 95),
  },
  {
    name: 'jpeg-75',
    sameCoordinateCarrier: true,
    apply: buffer => jpegTransform(buffer, 75),
  },
  {
    name: 'jpeg-50',
    sameCoordinateCarrier: true,
    apply: buffer => jpegTransform(buffer, 50),
  },
  {
    name: 'webp-90',
    sameCoordinateCarrier: true,
    apply: buffer => webpTransform(buffer, 90),
  },
  {
    name: 'webp-70',
    sameCoordinateCarrier: true,
    apply: buffer => webpTransform(buffer, 70),
  },
  {
    name: 'resize-three-quarter',
    sameCoordinateCarrier: false,
    apply: buffer => resizeTransform(buffer, 0.75),
  },
  {
    name: 'resize-half',
    sameCoordinateCarrier: false,
    apply: buffer => resizeTransform(buffer, 0.5),
  },
  {
    name: 'center-crop-90',
    sameCoordinateCarrier: false,
    apply: buffer => cropTransform(buffer, 0.9),
  },
  {
    name: 'gaussian-blur-0.5',
    sameCoordinateCarrier: true,
    apply: buffer => blurTransform(buffer, 0.5),
  },
  {
    name: 'gaussian-blur-1.2',
    sameCoordinateCarrier: true,
    apply: buffer => blurTransform(buffer, 1.2),
  },
  {
    name: 'screenshot-roundtrip',
    sameCoordinateCarrier: true,
    apply: screenshotTransform,
  },
]

function roundMetric(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value
}

function compactSimilarity(metrics) {
  return {
    width: metrics.width,
    height: metrics.height,
    averageChannelDelta: roundMetric(metrics.averageChannelDelta),
    maxChannelDelta: roundMetric(metrics.maxChannelDelta),
    psnr: roundMetric(metrics.psnr),
    ssim: roundMetric(metrics.ssim, 6),
    meanDeltaE76: roundMetric(metrics.meanDeltaE76, 6),
    perceptualHashDistance: metrics.perceptualHashDistance,
    hogCosineSimilarity: roundMetric(metrics.hogCosineSimilarity, 6),
    luminanceCorrelation: roundMetric(metrics.luminanceCorrelation, 6),
    averageEdgeDrift: roundMetric(metrics.averageEdgeDrift),
    colorDrift: {
      r: roundMetric(metrics.colorDrift.r),
      g: roundMetric(metrics.colorDrift.g),
      b: roundMetric(metrics.colorDrift.b),
    },
  }
}

export const DEFAULT_VISUAL_QUALITY_GATE = {
  minimumPsnr: 40,
  minimumSsim: 0.99,
  maximumMeanDeltaE76: 1.5,
  maximumPerceptualHashDistance: 6,
}

function evaluateVisualQualityGate(identity, thresholds = DEFAULT_VISUAL_QUALITY_GATE) {
  const checks = {
    psnr: identity.psnr >= thresholds.minimumPsnr,
    ssim: identity.ssim >= thresholds.minimumSsim,
    meanDeltaE76: identity.meanDeltaE76 <= thresholds.maximumMeanDeltaE76,
    perceptualHash: identity.perceptualHashDistance <= thresholds.maximumPerceptualHashDistance,
  }

  return {
    pass: Object.values(checks).every(Boolean),
    thresholds,
    checks,
  }
}

function summarizeRobustness(cases) {
  const transformed = cases.filter(item => item.transform !== 'identity')
  const carrierCases = transformed.filter(item => item.consentCarrier.agreement !== null)
  const minimumSsim = Math.min(...transformed.map(item => item.similarity.ssim))
  const maximumDeltaE76 = Math.max(...transformed.map(item => item.similarity.meanDeltaE76))
  const maximumPerceptualHashDistance = Math.max(...transformed.map(item => item.similarity.perceptualHashDistance))
  const minimumHogCosineSimilarity = Math.min(...transformed.map(item => item.similarity.hogCosineSimilarity))
  const meanCarrierAgreement = carrierCases.length
    ? carrierCases.reduce((sum, item) => sum + item.consentCarrier.agreement, 0) / carrierCases.length
    : null

  return {
    transformCount: transformed.length,
    minimumSsim: roundMetric(minimumSsim, 6),
    maximumMeanDeltaE76: roundMetric(maximumDeltaE76, 6),
    maximumPerceptualHashDistance,
    minimumHogCosineSimilarity: roundMetric(minimumHogCosineSimilarity, 6),
    meanSameCoordinateCarrierAgreement: meanCarrierAgreement === null
      ? null
      : roundMetric(meanCarrierAgreement, 6),
  }
}

export async function runLocalBenchmark(inputBuffer, options = {}) {
  const mode = options.mode || 'max'
  const exportFormat = options.format || 'png'
  const seed = seedFromBuffer(inputBuffer)
  const protectedImage = await protectImage(inputBuffer, {
    mode,
    format: exportFormat,
    dctOptions: options.dctOptions,
  })
  const cases = []

  for (const transform of TRANSFORMS) {
    const [reference, candidate] = await Promise.all([
      transform.apply(inputBuffer),
      transform.apply(protectedImage.buffer),
    ])
    const similarity = await measureSimilarity(reference, candidate)
    const carrier = transform.sameCoordinateCarrier
      ? await measureConsentCarrierAgreement(candidate, seed)
      : { comparableSamples: 0, agreement: null }

    cases.push({
      transform: transform.name,
      similarity: compactSimilarity(similarity),
      consentCarrier: {
        comparableSamples: carrier.comparableSamples,
        agreement: carrier.agreement === null ? null : roundMetric(carrier.agreement, 6),
      },
    })
  }

  const identity = cases.find(item => item.transform === 'identity')
  const identityDelta = identity.similarity.averageChannelDelta

  for (const benchmarkCase of cases) {
    benchmarkCase.signalRetention = identityDelta > 0
      ? roundMetric(benchmarkCase.similarity.averageChannelDelta / identityDelta, 6)
      : null
  }

  return {
    compilerVersion: COMPILER_VERSION,
    mode,
    exportFormat,
    compilerMetrics: protectedImage.metrics,
    evidenceScope: {
      proves: [
        'determinism when paired with the compiler determinism test',
        'visual similarity under the reported full-reference metrics',
        'signal behavior under the listed deterministic preprocessing transforms',
      ],
      doesNotProve: [
        'reduced effectiveness of any AI image editor',
        'transfer across unknown model architectures',
        'resistance to adaptive purification',
      ],
    },
    visualQualityGate: evaluateVisualQualityGate(identity.similarity, options.qualityGate),
    robustnessSummary: summarizeRobustness(cases),
    cases,
  }
}
