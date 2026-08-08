const BLOCK_SIZE = 8
const LUMA_QUANTIZATION_TABLE = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
]
const MID_BAND_POSITIONS = [
  [1, 2],
  [2, 1],
  [2, 2],
  [1, 3],
  [3, 1],
  [2, 3],
  [3, 2],
]
const COSINE = Array.from({ length: BLOCK_SIZE }, (_, position) =>
  Array.from({ length: BLOCK_SIZE }, (_, frequency) =>
    Math.cos(((2 * position + 1) * frequency * Math.PI) / (2 * BLOCK_SIZE))))
const ALPHA = Array.from({ length: BLOCK_SIZE }, (_, frequency) =>
  frequency === 0 ? 1 / Math.sqrt(BLOCK_SIZE) : Math.sqrt(2 / BLOCK_SIZE))

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function boundedByte(reference, value, maxDelta) {
  return clampByte(Math.max(reference - maxDelta, Math.min(reference + maxDelta, value)))
}

function luma(r, g, b) {
  return r * 0.299 + g * 0.587 + b * 0.114
}

function blockHash(blockX, blockY, lane, seed) {
  let value = (blockX * 374761393 + blockY * 668265263 + lane * 2246822519 + seed) >>> 0
  value = (value ^ (value >>> 13)) >>> 0
  value = Math.imul(value, 1274126177) >>> 0
  value = (value ^ (value >>> 16)) >>> 0
  return value
}

function quantizationTable(quality) {
  const normalizedQuality = Math.max(1, Math.min(100, Math.round(quality)))
  const scale = normalizedQuality < 50
    ? 5000 / normalizedQuality
    : 200 - normalizedQuality * 2

  return LUMA_QUANTIZATION_TABLE.map(value =>
    Math.max(1, Math.min(255, Math.floor((value * scale + 50) / 100))))
}

function forwardDct(block) {
  const coefficients = new Float64Array(BLOCK_SIZE * BLOCK_SIZE)
  const horizontal = new Float64Array(BLOCK_SIZE * BLOCK_SIZE)

  // The DCT is separable: apply the horizontal basis once, then the vertical
  // basis. This is mathematically equivalent to the original 2D sum while
  // reducing every 8 by 8 block from O(n^4) to O(n^3).
  for (let y = 0; y < BLOCK_SIZE; y += 1) {
    for (let u = 0; u < BLOCK_SIZE; u += 1) {
      let sum = 0
      for (let x = 0; x < BLOCK_SIZE; x += 1) {
        sum += (block[y * BLOCK_SIZE + x] - 128) * COSINE[x][u]
      }
      horizontal[y * BLOCK_SIZE + u] = ALPHA[u] * sum
    }
  }

  for (let v = 0; v < BLOCK_SIZE; v += 1) {
    for (let u = 0; u < BLOCK_SIZE; u += 1) {
      let sum = 0
      for (let y = 0; y < BLOCK_SIZE; y += 1) {
        sum += horizontal[y * BLOCK_SIZE + u] * COSINE[y][v]
      }
      coefficients[v * BLOCK_SIZE + u] = ALPHA[v] * sum
    }
  }

  return coefficients
}

function inverseDct(coefficients) {
  const block = new Float64Array(BLOCK_SIZE * BLOCK_SIZE)
  const vertical = new Float64Array(BLOCK_SIZE * BLOCK_SIZE)

  for (let y = 0; y < BLOCK_SIZE; y += 1) {
    for (let u = 0; u < BLOCK_SIZE; u += 1) {
      let sum = 0
      for (let v = 0; v < BLOCK_SIZE; v += 1) {
        sum += ALPHA[v] * coefficients[v * BLOCK_SIZE + u] * COSINE[y][v]
      }
      vertical[y * BLOCK_SIZE + u] = sum
    }
  }

  for (let y = 0; y < BLOCK_SIZE; y += 1) {
    for (let x = 0; x < BLOCK_SIZE; x += 1) {
      let sum = 0
      for (let u = 0; u < BLOCK_SIZE; u += 1) {
        sum += ALPHA[u] * vertical[y * BLOCK_SIZE + u] * COSINE[x][u]
      }
      block[y * BLOCK_SIZE + x] = sum + 128
    }
  }

  return block
}

function textureWeight(block) {
  let mean = 0
  for (const value of block) mean += value
  mean /= block.length

  let variance = 0
  for (const value of block) variance += (value - mean) ** 2
  variance /= block.length
  return Math.max(0.25, Math.min(1, Math.sqrt(variance) / 36))
}

export function applyQuantizedDctStage(reference, input, width, height, options = {}) {
  const output = Buffer.from(input)
  const quality = options.quality ?? 85
  const strength = options.strength ?? 0.45
  const coefficientsPerBlock = Math.max(1, Math.min(MID_BAND_POSITIONS.length, options.coefficientsPerBlock ?? 2))
  const maxDelta = options.maxDelta ?? 2
  const seed = options.seed ?? 0
  const quantization = quantizationTable(quality)
  let coefficientDelta = 0
  let spatialDelta = 0
  let blocks = 0

  for (let blockY = 0; blockY < height; blockY += BLOCK_SIZE) {
    for (let blockX = 0; blockX < width; blockX += BLOCK_SIZE) {
      const originalLuma = new Float64Array(BLOCK_SIZE * BLOCK_SIZE)

      for (let y = 0; y < BLOCK_SIZE; y += 1) {
        const sourceY = Math.min(height - 1, blockY + y)
        for (let x = 0; x < BLOCK_SIZE; x += 1) {
          const sourceX = Math.min(width - 1, blockX + x)
          const index = (sourceY * width + sourceX) * 4
          originalLuma[y * BLOCK_SIZE + x] = luma(input[index], input[index + 1], input[index + 2])
        }
      }

      const coefficients = forwardDct(originalLuma)
      const localWeight = textureWeight(originalLuma)
      const start = blockHash(blockX / BLOCK_SIZE, blockY / BLOCK_SIZE, 0, seed) % MID_BAND_POSITIONS.length

      for (let lane = 0; lane < coefficientsPerBlock; lane += 1) {
        const [u, v] = MID_BAND_POSITIONS[(start + lane) % MID_BAND_POSITIONS.length]
        const index = v * BLOCK_SIZE + u
        const step = quantization[index]
        const sign = (blockHash(blockX / BLOCK_SIZE, blockY / BLOCK_SIZE, lane + 1, seed) & 1) ? 1 : -1
        const delta = sign * step * strength * localWeight
        coefficients[index] += delta
        coefficientDelta += Math.abs(delta)
      }

      const reconstructed = inverseDct(coefficients)

      for (let y = 0; y < BLOCK_SIZE && blockY + y < height; y += 1) {
        for (let x = 0; x < BLOCK_SIZE && blockX + x < width; x += 1) {
          const pixelX = blockX + x
          const pixelY = blockY + y
          const index = (pixelY * width + pixelX) * 4
          const delta = reconstructed[y * BLOCK_SIZE + x] - originalLuma[y * BLOCK_SIZE + x]
          const nextR = boundedByte(reference[index], input[index] + delta, maxDelta)
          const nextG = boundedByte(reference[index + 1], input[index + 1] + delta, maxDelta)
          const nextB = boundedByte(reference[index + 2], input[index + 2] + delta, maxDelta)
          spatialDelta += Math.abs(nextR - input[index]) + Math.abs(nextG - input[index + 1]) + Math.abs(nextB - input[index + 2])
          output[index] = nextR
          output[index + 1] = nextG
          output[index + 2] = nextB
        }
      }

      blocks += 1
    }
  }

  return {
    data: output,
    metrics: {
      quality,
      strength,
      coefficientsPerBlock,
      blocks,
      meanAbsoluteCoefficientDelta: blocks ? coefficientDelta / (blocks * coefficientsPerBlock) : 0,
      meanAbsoluteSpatialDelta: width * height ? spatialDelta / (width * height * 3) : 0,
    },
  }
}
