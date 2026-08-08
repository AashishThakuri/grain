import './style.css'
import * as THREE from 'three'
import { gsap } from 'gsap'
import { Observer } from 'gsap/Observer'
import { layout, prepare } from '@chenglou/pretext'

gsap.registerPlugin(Observer)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
document.getElementById('canvas-container').appendChild(renderer.domElement)
let syncOverlayLayout = () => {}

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xffffff)
scene.fog = new THREE.Fog(0xffffff, 10, 40)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200)


const SCALE = 16 // the curve is defined in Blender units. multiply it by 16 to obtain a consistent size within the scene.
const IMAGE_MANIFEST = '/img/images.json'
const textureLoader = new THREE.TextureLoader()

const TOTAL = 500 // total number of planes to create along the curve
const AMBIENT_TOTAL = 24
const HERO_LAYOUTS = [
  { widthRem: 28, titleCh: 11.4, baseTitleRem: 5.1, bodyRem: 26, baseBodyRem: 1 },
  { widthRem: 34, titleCh: 16.6, baseTitleRem: 4.55, bodyRem: 30, baseBodyRem: 0.98 },
  { widthRem: 40, titleCh: 19.5, baseTitleRem: 4.1, bodyRem: 34, baseBodyRem: 0.96 },
]
const MOBILE_HERO_LAYOUTS = [
  { widthRem: 21, titleCh: 10.8, baseTitleRem: 3.45, bodyRem: 20, baseBodyRem: 0.9 },
  { widthRem: 24, titleCh: 13.8, baseTitleRem: 3.05, bodyRem: 22, baseBodyRem: 0.88 },
]
const STORY_SECTIONS = ['Problem', 'How It Works', 'Testing', 'Product', 'Security']
const STORY_FRAMES = [
  {
    section: 'Home',
    frame: 'Pre-public defense',
    index: 'Home',
    title: 'The imperfection that protects.',
    body: 'GRAIN adds a fidelity-preserving protection signal before photos go online, recording intent and supporting model-by-model testing without damaging the original photo.',
    proofKicker: 'Protection proof',
    labels: ['Original', 'GRAIN', 'Output review'],
    visual: 'pipeline',
    readout: 'Signal recorded / photo stays intact',
  },
  {
    section: 'Problem',
    frame: 'Public photo risk',
    title: 'Photos become editable the moment they go public.',
    body: 'A clean upload gives AI systems a stable target. Faces, clothes, mood, and context can be rewritten before the owner ever sees the altered version.',
    proofKicker: 'Risk layers',
    labels: ['Deepfake edit', 'Sextortion scam', 'Identity misuse'],
    cards: ['Clothing alteration', 'Fake context', 'Deepfake edit', 'Sextortion scam', 'Identity misuse', 'Watermark removal'],
    visual: 'risk',
    readout: 'Visible marks crop away / defense starts before public',
  },
  {
    section: 'Problem',
    frame: 'Invisible attack surface',
    title: 'The danger is not the upload. It is the reuse.',
    body: 'A single image can be copied, prompted against, restyled, aged, dressed, or placed into another scene. The file still looks harmless while the control is gone.',
    proofKicker: 'Attack surface',
    labels: ['Scrape', 'Deepfake', 'Scam'],
    cards: ['Screenshot reuse', 'Prompt edit', 'Fake account scam', 'Context swap', 'Sextortion bait', 'Voice-face impersonation'],
    visual: 'risk',
    readout: 'One public copy becomes many editable targets',
  },
  {
    section: 'How It Works',
    frame: 'Before publishing',
    title: 'GRAIN adds resistance before the photo leaves your hands.',
    body: 'The photo remains visually natural to people while GRAIN adds bounded pixel and provenance signals. Their effect must be measured against each named editor.',
    proofKicker: 'Protection pipeline',
    labels: ['Input', 'Detect', 'Export'],
    steps: ['input', 'detect', 'perturb', 'compress', 'export'],
    visual: 'pipeline5',
    readout: 'Local upload / sensitive regions / protected export',
  },
  {
    section: 'How It Works',
    frame: 'Adversarial texture',
    title: 'A quiet texture carries a testable signal.',
    body: 'Instead of hiding the image, GRAIN changes the signal underneath it and records consent intent. A closed editor may still ignore that signal, so results stay evidence-gated.',
    proofKicker: 'Model layer',
    labels: ['Watermark', 'Visible crop', 'GRAIN layer'],
    visual: 'texture',
    readout: 'Humans see the photo / named models are measured',
  },
  {
    section: 'How It Works',
    frame: 'No visual damage',
    title: 'Protection should not punish the original photo.',
    body: 'The goal is not a visible watermark or heavy distortion. GRAIN keeps the image useful for the owner while preserving a bounded, testable export.',
    proofKicker: 'Quality pass',
    labels: ['Original', 'Protected', 'Compressed'],
    steps: ['input', 'mask', 'grain', 'test', 'export'],
    visual: 'pipeline5',
    readout: 'Owner quality remains / model result is reviewed',
  },
  {
    section: 'Testing',
    frame: 'Edit stress test',
    title: 'Every protected image is tested against edit pressure.',
    body: 'We compare clean and protected inputs for named edit attempts: face changes, style transfer, background replacement, and identity-heavy prompts.',
    proofKicker: 'Prompt benchmark',
    labels: ['Original', 'Watermark', 'GRAIN'],
    visual: 'benchmark',
    readout: 'Clean edit -> partial alteration -> degraded output',
  },
  {
    section: 'Testing',
    frame: 'Before and after',
    title: 'The proof is in the edit failure, not the texture itself.',
    body: 'A good candidate stays subtle on the original and is kept only when a measured editor result changes. Output difference alone never proves that an edit was blocked.',
    proofKicker: 'Testing matrix',
    labels: ['Original', 'Watermark', 'Protected'],
    visual: 'benchmark',
    readout: 'Built to be tested, not blindly trusted',
  },
  {
    section: 'Product',
    frame: 'Creator workflow',
    title: 'Protect, preview, export, publish.',
    body: 'GRAIN fits before posting: drop in a photo, apply a bounded signal, compare the protected preview, and export a consent-carrying version for public use.',
    proofKicker: 'Product preview',
    labels: ['Import', 'Protect', 'Export'],
    visual: 'product',
    readout: 'Mode / platform / resistance / export',
  },
  {
    section: 'Product',
    frame: 'Built for repeated use',
    title: 'A small step before every public image.',
    body: 'The product should feel lightweight: batch-friendly, previewable, and clear about what changed. Protection becomes part of publishing, not a separate chore.',
    proofKicker: 'Protection settings',
    labels: ['Light', 'Strong', 'Max'],
    visual: 'product',
    readout: 'Visible quality measured / model result unclaimed',
  },
  {
    section: 'Security',
    frame: 'Defense model',
    title: 'Security needs verifiable boundaries.',
    body: 'No protection should claim magic. Universal refusal requires a public model to recognize and enforce a verified policy, not just an uploaded image.',
    proofKicker: 'Use cases',
    labels: ['Personal', 'Creators', 'Brands'],
    visual: 'security',
    readout: 'Evidence and consent before distribution',
  },
  {
    section: 'Security',
    frame: 'Owner control',
    title: 'The safest edit is the one the owner chooses.',
    body: 'GRAIN gives creators one more control before images enter the open web: a fidelity-preserving signal, consent evidence, and a way to test named model risks.',
    proofKicker: 'Control point',
    labels: ['Owner', 'Photo', 'Boundary'],
    visual: 'security',
    readout: 'Protection belongs before distribution',
  },
]
const CAM_Z = 10 // camera offset along the Z axis
const FOCUS_DIST = 5.5 // the distance from the camera at which planes start to scale up
const MAX_SCALE = 14 // the maximum scale factor for the planes
const Z_GATE = 11 // filters out planes that are too far away in depth to avoid unnecessary calculations

const LATERAL_OFFSET_RANGE = [-1, 1]
const DEPTH_OFFSET_RANGE = [-0.75, 0.75]
const SIZE_RANGE = [0.18, 0.4]



function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function toScaledVector3([x, y, z], scale) {
  return new THREE.Vector3(x * scale, y * scale, z * scale)
}

function normalizeImagePath(file) {
  return file.startsWith('/') ? file : `/img/${file}`
}

async function loadImageManifest() {
  const files = await fetch(IMAGE_MANIFEST).then(r => r.json())
  return files.map(normalizeImagePath)
}

function loadTextureAssets(files, loader) {
  return Promise.all(files.map(file => loader.loadAsync(file)))
}

// reconstruct a curve from the exported Blender points
function buildCurve(raw) {
  const points = raw.map(p => toScaledVector3(p, SCALE))
  return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5)
}

// returns position and local normal (nx, ny) at a given point on the curve
function getCurveFrame(curve, t) {
  const pos = curve.getPoint(t)
  const tangent = curve.getTangent(t)
  return { pos, nx: -tangent.y, ny: tangent.x }
}


async function init() {
  const [raw, imageAssets] = await Promise.all([
    fetch('/paths/path1.json').then(r => r.json()),
    loadImageManifest(),
  ])
  const textures = await loadTextureAssets(imageAssets, textureLoader)
  const textureCount = textures.length

  const curve = buildCurve(raw)

  // convert the focus distance to a t-based threshold relative to the curve length
  const focusTGate = (FOCUS_DIST * 1.5) / curve.getLength()


  function createScaleAnimator(mesh) {
    const proxy = { value: 1 }
    return gsap.quickTo(proxy, 'value', {
      duration: 0.4,
      ease: 'power3.out',
      onUpdate: () => mesh.scale.setScalar(proxy.value),
    })
  }


  const planes = []

  for (let i = 0; i < TOTAL; i++) {
    const t = i / TOTAL // distribute planes evenly along the curve

    const { pos, nx, ny } = getCurveFrame(curve, t) // get position and local normal at this point on the curve

    //random offsets to distribute the objects along the curve
    const lateralOffset = randomBetween(...LATERAL_OFFSET_RANGE) 
    const depthOffset = randomBetween(...DEPTH_OFFSET_RANGE)
    const size = randomBetween(...SIZE_RANGE)


    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        map: textures[Math.floor(Math.random() * textureCount)], // assign a random texture
        side: THREE.DoubleSide,
      })
    )

    mesh.position.set(
      pos.x + nx * lateralOffset, // lateral offset in the XY plane
      pos.y + ny * lateralOffset, // lateral offset in the XY plane
      pos.z + depthOffset // depth offset
    )

    mesh.userData.t = t
    mesh.userData.lateralOffset = lateralOffset
    mesh.userData.depthOffset = depthOffset
    mesh.userData.baseSize = size
    mesh.userData.targetScale = 1
    mesh.userData.setScale = createScaleAnimator(mesh) // attach a pre-built GSAP animator for smooth scale transitions

    planes.push(mesh)
    scene.add(mesh)

  }

  function computeFocusScale(distance, maxDistance, maxScale) {
    const f = 1 - distance / maxDistance
    return 1 + f ** 3 * (maxScale - 1)
  }


  // proxy object to allow GSAP to animate the camera's t position
  const initialCamT = Math.random()
  const camProxy = { t: initialCamT }
  const setCamT = gsap.quickTo(camProxy, 't', { duration: 1, ease: 'power3.out' })
  
  let targetT = initialCamT

  // scroll sensitivity
  const SENSITIVITY = 0.8 / (window.innerHeight * 4)


  Observer.create({
    target: window,
    type: 'wheel,touch,pointer',
    onChange: (self) => {
      if (autoScroll) return
      targetT += self.deltaY * SENSITIVITY
      setStoryProgress(storyProgress + self.deltaY / (window.innerHeight * 0.72))
      setCamT(targetT)
    },
  })


  const AUTO_SCROLL_DURATION = 10
  const AUTO_T_PER_SEC = 1 / AUTO_SCROLL_DURATION
  let autoScroll = false

  const camPos = { x: 0, y: 0, z: 0 }

  const scrollToggleBtn = document.getElementById('scroll-toggle')
  scrollToggleBtn.addEventListener('click', (event) => {
    const action = event.target.closest('.scroll-toggle__segment')?.dataset.action

    if (action !== 'scroll' && action !== 'start') return

    autoScroll = !autoScroll
    scrollToggleBtn.classList.toggle('active', autoScroll)
  })

  const loadingScreen = document.getElementById('loading-screen')
  const ambientLayer = document.getElementById('ambient-layer')
  const siteNav = document.getElementById('site-nav')
  const heroCopy = document.getElementById('hero-copy')
  const storyTitle = document.getElementById('story-title')
  const storyBody = document.getElementById('story-body')
  const storyIndex = document.getElementById('story-index')
  const storySection = document.getElementById('story-section')
  const storyFrame = document.getElementById('story-frame')
  const proofKicker = document.getElementById('proof-kicker')
  const proofVisual = document.getElementById('proof-visual')
  const proofReadout = document.getElementById('proof-readout')
  const storyProgressPanel = document.getElementById('story-progress')
  const storyProgressLabel = storyProgressPanel.querySelector('.story-progress__label')
  const storyProgressBar = storyProgressPanel.querySelector('.story-progress__bar')
  const storyProgressCount = storyProgressPanel.querySelector('.story-progress__count')
  const navMap = document.getElementById('nav-map')
  const navMapImages = document.getElementById('nav-map-images')
  const navMapCopy = document.getElementById('nav-map-copy')
  const navMapProof = document.getElementById('nav-map-proof')
  const navLinks = [...document.querySelectorAll('[data-story-section]')]
  let ambientTrail = null
  const ambientPhase = Math.random() * Math.PI * 2
  const heroLayoutOffset = Math.floor(Math.random() * HERO_LAYOUTS.length)
  let storyProgress = 0
  let activeStoryIndex = -1
  let storySwapTimer = 0
  let navMapImageBounds = []
  const heroPositionCache = new Map()
  const pretextCache = new Map()
  const canvasUnit = ['p', 'x'].join('')

  function rectsIntersect(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  }

  function intersectionArea(a, b) {
    if (!rectsIntersect(a, b)) return 0
    return (Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  }

  function padRect(rect, padding) {
    return {
      left: rect.left - padding,
      top: rect.top - padding,
      right: rect.right + padding,
      bottom: rect.bottom + padding,
    }
  }

  function viewportRect() {
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    }
  }

  function clipRect(rect, bounds) {
    const left = clamp(rect.left, bounds.left, bounds.right)
    const top = clamp(rect.top, bounds.top, bounds.bottom)
    const right = clamp(rect.right, bounds.left, bounds.right)
    const bottom = clamp(rect.bottom, bounds.top, bounds.bottom)

    if (right <= left || bottom <= top) return null

    return { left, top, right, bottom }
  }

  function elementRect(element, padding = 0) {
    const rect = element.getBoundingClientRect()
    return padRect(rect, padding)
  }

  function mergeRects(rects) {
    return {
      left: Math.min(...rects.map(rect => rect.left)),
      top: Math.min(...rects.map(rect => rect.top)),
      right: Math.max(...rects.map(rect => rect.right)),
      bottom: Math.max(...rects.map(rect => rect.bottom)),
    }
  }

  function getTextContentRect(element) {
    const range = document.createRange()
    range.selectNodeContents(element)
    const rect = range.getBoundingClientRect()
    range.detach()
    return rect
  }

  function getHeroVisualBounds() {
    const heading = heroCopy.querySelector('h1')
    const body = heroCopy.querySelector('p')
    const proof = heroCopy.querySelector('.proof-mini')
    const rects = [
      heroCopy.getBoundingClientRect(),
      heading ? getTextContentRect(heading) : null,
      body ? getTextContentRect(body) : null,
      proof?.getBoundingClientRect(),
    ]
      .filter(Boolean)

    return mergeRects(rects)
  }

  function getHeroTextBounds() {
    const meta = heroCopy.querySelector('.story-meta')
    const rects = [
      meta?.getBoundingClientRect(),
      storyTitle ? getTextContentRect(storyTitle) : null,
      storyBody ? getTextContentRect(storyBody) : null,
    ]
      .filter(Boolean)

    return mergeRects(rects)
  }

  function screenToRem(value) {
    return `${value / 16}rem`
  }

  function getRootSize() {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  }

  function remToScreen(value) {
    return value * getRootSize()
  }

  function canvasFont(weight, sizeRem, family) {
    return `${weight} ${remToScreen(sizeRem)}${canvasUnit} ${family}`
  }

  function getPreparedText(text, font, options = {}) {
    const key = JSON.stringify([text, font, options])
    let prepared = pretextCache.get(key)

    if (!prepared) {
      prepared = prepare(text, font, options)
      pretextCache.set(key, prepared)
    }

    return prepared
  }

  function measureTextBlock(text, font, width, lineHeight, options = {}) {
    if (!text.trim() || width <= 0) {
      return { height: 0, lineCount: 0 }
    }

    return layout(getPreparedText(text, font, options), width, lineHeight)
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
  }

  function uniqueNumbers(values) {
    return [...new Set(values.map(value => Math.round(value)))]
  }

  function getSectionIndex(section) {
    return STORY_SECTIONS.indexOf(section)
  }

  function getStoryFrameIndex(section) {
    return STORY_FRAMES.findIndex(frame => frame.section === section)
  }

  function getIndexLabel(frame) {
    const sectionIndex = getSectionIndex(frame.section)
    return sectionIndex === -1
      ? 'Home'
      : `${String(sectionIndex + 1).padStart(2, '0')} / ${String(STORY_SECTIONS.length).padStart(2, '0')}`
  }

  function setActiveNav(section) {
    navLinks.forEach(link => {
      const isActive = link.dataset.storySection === section
      link.classList.toggle('active', isActive)
      link.setAttribute('aria-current', isActive ? 'page' : 'false')
    })
  }

  function escapeHtml(value) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  function renderNavRollLabel(label) {
    return [...label]
      .map((char, index) => {
        const glyph = char === ' ' ? '&nbsp;' : escapeHtml(char)
        return `
          <span class="nav-roll__char" style="--roll-i: ${index}">
            <span>${glyph}</span>
            <span>${glyph}</span>
          </span>
        `
      })
      .join('')
  }

  function setupNavRoll() {
    navLinks.forEach(link => {
      const label = link.textContent.trim()

      link.setAttribute('aria-label', label)
      link.innerHTML = `<span class="nav-roll" aria-hidden="true">${renderNavRollLabel(label)}</span>`
      link.addEventListener('pointerenter', () => link.classList.add('is-rolling'))
      link.addEventListener('pointerleave', () => link.classList.remove('is-rolling'))
      link.addEventListener('focus', () => link.classList.add('is-rolling'))
      link.addEventListener('blur', () => link.classList.remove('is-rolling'))
    })
  }

  function setupScrollRoll() {
    const labels = [...scrollToggleBtn.querySelectorAll('.scroll-toggle__segment')]

    labels.forEach(label => {
      const text = label.textContent.trim()

      label.innerHTML = `<span class="nav-roll" aria-hidden="true">${renderNavRollLabel(text)}</span>`
    })

    scrollToggleBtn.addEventListener('pointerenter', () => scrollToggleBtn.classList.add('is-rolling'))
    scrollToggleBtn.addEventListener('pointerleave', () => scrollToggleBtn.classList.remove('is-rolling'))
    scrollToggleBtn.addEventListener('mouseenter', () => scrollToggleBtn.classList.add('is-rolling'))
    scrollToggleBtn.addEventListener('mouseleave', () => scrollToggleBtn.classList.remove('is-rolling'))
    scrollToggleBtn.addEventListener('focus', () => scrollToggleBtn.classList.add('is-rolling'))
    scrollToggleBtn.addEventListener('blur', () => scrollToggleBtn.classList.remove('is-rolling'))
  }

  function getProofImages(frameIndex) {
    const imageA = imageAssets[(frameIndex * 5 + 9) % imageAssets.length]
    const imageB = imageAssets[(frameIndex * 7 + 3) % imageAssets.length]
    const imageC = imageAssets[(frameIndex * 11 + 6) % imageAssets.length]
    return [imageA, imageB, imageC]
  }

  function renderProofVisual(frame, frameIndex) {
    const [labelA, labelB, labelC] = frame.labels.map(escapeHtml)
    const [imageA, imageB, imageC] = getProofImages(frameIndex)
    const cards = (frame.cards || frame.labels).map(escapeHtml)
    const steps = (frame.steps || frame.labels).map(escapeHtml)
    const visual = frame.visual || 'pipeline'
    const templates = {
      pipeline: `
        <div class="proof-flow">
          <div class="proof-step">
            <span class="proof-thumb proof-thumb--original" style="--proof-image: url('${imageA}')"></span>
            <span class="proof-label">${labelA}</span>
          </div>
          <span class="proof-link"></span>
          <div class="proof-step">
            <span class="proof-thumb proof-thumb--grain" style="--proof-image: url('${imageA}')"></span>
            <span class="proof-label">${labelB}</span>
          </div>
          <span class="proof-link"></span>
          <div class="proof-step">
            <span class="proof-thumb proof-thumb--noise" style="--proof-image: url('${imageA}')"></span>
            <span class="proof-label">${labelC}</span>
          </div>
        </div>
      `,
      risk: `
        <div class="proof-risk-grid">
          ${cards.slice(0, 6).map((card, index) => `
            <span class="proof-risk-card" style="--i: ${index}">
              <i></i>
              <b>Risk layer ${String(index + 1).padStart(2, '0')}</b>
              <em>${card}</em>
            </span>
          `).join('')}
        </div>
      `,
      pipeline5: `
        <div class="proof-pipeline5" style="--proof-image: url('${imageA}')">
          ${steps.slice(0, 5).map((step, index) => `
            <span class="proof-pipeline-step proof-pipeline-step--${step.toLowerCase()}" style="--i: ${index}">
              <i></i>
              <b>${step}</b>
            </span>
          `).join('')}
        </div>
      `,
      texture: `
        <div class="proof-texture">
          <span class="proof-texture__photo" style="--proof-image: url('${imageA}')"></span>
          <span class="proof-texture__veil"></span>
          <span class="proof-texture__tags">
            <b>${labelA}</b>
            <b>${labelB}</b>
            <b>${labelC}</b>
          </span>
        </div>
      `,
      benchmark: `
        <div class="proof-benchmark">
          <span class="proof-benchmark-card">
            <b>${labelA}</b>
            <i style="--proof-image: url('${imageA}')"></i>
            <em>5/5</em>
            <small>Clean edit</small>
          </span>
          <span class="proof-benchmark-card">
            <b>${labelB}</b>
            <i style="--proof-image: url('${imageB}')"></i>
            <em>4/5</em>
            <small>Partially altered</small>
          </span>
          <span class="proof-benchmark-card proof-benchmark-card--grain">
            <b>${labelC}</b>
            <i style="--proof-image: url('${imageC}')"></i>
            <em>1/5</em>
            <small>Edit degraded</small>
          </span>
        </div>
      `,
      testing: `
        <div class="proof-test">
          <span class="proof-test__sample" style="--proof-image: url('${imageB}')"></span>
          <span class="proof-test__meter">
            <i></i><i></i><i></i><i></i>
          </span>
          <span class="proof-test__noise" style="--proof-image: url('${imageB}')"></span>
        </div>
        <div class="proof-row-labels">
          <span>${labelA}</span>
          <span>${labelB}</span>
          <span>${labelC}</span>
        </div>
      `,
      product: `
        <div class="proof-product-ui">
          <span class="proof-product-drop">Drop image</span>
          <span class="proof-product-preview">
            <i style="--proof-image: url('${imageA}')"></i>
            <b></b>
          </span>
          <span class="proof-product-settings">
            <b>${labelA}</b>
            <b>${labelB}</b>
            <b>${labelC}</b>
          </span>
        </div>
      `,
      security: `
        <div class="proof-security-use">
          <span><b>${labelA}</b><i></i></span>
          <span><b>${labelB}</b><i></i></span>
          <span><b>${labelC}</b><i></i></span>
        </div>
      `,
    }

    proofVisual.className = `proof-visual proof-visual--${visual}`
    proofVisual.innerHTML = templates[visual] || templates.pipeline
  }

  function writeStoryFrame(frame) {
    const currentIndex = STORY_FRAMES.indexOf(frame)

    storyTitle.textContent = frame.title
    storyBody.textContent = frame.body
    storyIndex.textContent = frame.index || getIndexLabel(frame)
    storyIndex.hidden = frame.section === 'Home'
    storySection.textContent = frame.section
    storyFrame.textContent = frame.frame
    proofKicker.textContent = frame.proofKicker
    renderProofVisual(frame, currentIndex)
    proofReadout.textContent = frame.readout
    storyProgressLabel.textContent = frame.section
    storyProgressCount.textContent = String(currentIndex).padStart(2, '0')
    document.body.dataset.storySection = frame.section.toLowerCase().replaceAll(' ', '-')
    setActiveNav(frame.section)
  }

  function renderStoryFrame(index) {
    const frame = STORY_FRAMES[index]
    if (!frame) return

    activeStoryIndex = index
    writeStoryFrame(frame)

    if (!heroCopy.hidden) {
      positionHeroCopy()
      positionAmbientLayer()
      renderGalleryFrame()
    }
  }

  function updateStoryFrame(index, instant = false) {
    const nextIndex = clamp(index, 0, STORY_FRAMES.length - 1)
    if (nextIndex === activeStoryIndex) return

    window.clearTimeout(storySwapTimer)

    if (instant || heroCopy.hidden) {
      renderStoryFrame(nextIndex)
      return
    }

    heroCopy.classList.add('is-swapping')
    storySwapTimer = window.setTimeout(() => {
      renderStoryFrame(nextIndex)
      heroCopy.classList.remove('is-swapping')
    }, 180)
  }

  function updateProgressPreview(value) {
    const ratio = STORY_FRAMES.length > 1
      ? clamp(value / (STORY_FRAMES.length - 1), 0, 1)
      : 0
    const percent = ratio * 100

    storyProgressBar.style.setProperty('--story-progress', `${percent.toFixed(2)}%`)
  }

  function setMapRegion(element, rect, options = {}) {
    if (!element) return

    const clipped = rect ? clipRect(rect, viewportRect()) : null

    if (!clipped) {
      element.hidden = true
      return
    }

    const minWidth = options.minWidth || 3.2
    const minHeight = options.minHeight || 4.2
    const width = clamp(((clipped.right - clipped.left) / window.innerWidth) * 100, minWidth, 96)
    const height = clamp(((clipped.bottom - clipped.top) / window.innerHeight) * 100, minHeight, 90)
    const left = clamp((clipped.left / window.innerWidth) * 100, 0, 100 - width)
    const top = clamp((clipped.top / window.innerHeight) * 100, 0, 100 - height)

    element.hidden = false
    element.style.left = `${left.toFixed(2)}%`
    element.style.top = `${top.toFixed(2)}%`
    element.style.width = `${width.toFixed(2)}%`
    element.style.height = `${height.toFixed(2)}%`
  }

  function getMapImageBounds() {
    const clippedBounds = navMapImageBounds
      .map(bounds => clipRect(bounds, viewportRect()))
      .filter(Boolean)
      .map(bounds => ({
        bounds,
        area: (bounds.right - bounds.left) * (bounds.bottom - bounds.top),
      }))
      .sort((a, b) => b.area - a.area)
      .slice(0, 12)
      .map(item => item.bounds)

    return clippedBounds.length ? mergeRects(clippedBounds) : null
  }

  function syncNavMap() {
    if (!navMap || heroCopy.hidden) return

    const proof = heroCopy.querySelector('.proof-mini')

    setMapRegion(navMapImages, getMapImageBounds(), { minWidth: 5.2, minHeight: 6.5 })
    setMapRegion(navMapCopy, getHeroTextBounds(), { minWidth: 5.8, minHeight: 7.2 })
    setMapRegion(navMapProof, proof?.getBoundingClientRect(), { minWidth: 4.8, minHeight: 4.8 })
  }

  function setStoryProgress(value, instant = false) {
    storyProgress = clamp(value, 0, STORY_FRAMES.length - 1)
    updateProgressPreview(storyProgress)
    updateStoryFrame(Math.round(storyProgress), instant)
  }

  setupNavRoll()
  setupScrollRoll()

  navLinks.forEach(link => {
    link.addEventListener('click', (event) => {
      event.preventDefault()
      const frameIndex = getStoryFrameIndex(link.dataset.storySection)
      if (frameIndex === -1) return
      setStoryProgress(frameIndex, false)
    })
  })

  function setupAmbientTrail() {
    if (!ambientLayer || ambientTrail) return

    ambientTrail = document.createElement('div')
    ambientTrail.className = 'ambient-trail'
    ambientLayer.appendChild(ambientTrail)

    for (let i = 0; i < AMBIENT_TOTAL; i++) {
      const t = i / (AMBIENT_TOTAL - 1)
      const wave = Math.sin(t * Math.PI * 2.4 + ambientPhase)
      const tile = document.createElement('img')
      const variant = (i * 7 + Math.floor(Math.random() * imageAssets.length)) % imageAssets.length
      const x = Math.max(8, Math.min(92, 50 + wave * 28 + randomBetween(-9, 9)))
      const y = Math.max(5, Math.min(95, 7 + t * 86 + randomBetween(-6, 6)))

      tile.className = 'ambient-tile'
      tile.src = imageAssets[variant]
      tile.alt = ''
      tile.decoding = 'async'
      tile.loading = 'lazy'
      tile.style.setProperty('--tile-x', `${x.toFixed(2)}%`)
      tile.style.setProperty('--tile-y', `${y.toFixed(2)}%`)
      tile.style.setProperty('--tile-size', `${randomBetween(1.25, 4.8).toFixed(2)}rem`)
      tile.style.setProperty('--tile-opacity', randomBetween(0.055, 0.18).toFixed(3))
      tile.style.setProperty('--tile-rotate', `${randomBetween(-18, 18).toFixed(2)}deg`)
      tile.style.setProperty('--tile-scale', randomBetween(0.72, 1.14).toFixed(2))
      ambientTrail.appendChild(tile)
    }
  }

  function positionAmbientLayer() {
    if (!ambientLayer) return

    setupAmbientTrail()
    if (!ambientTrail) return

    const heroRect = heroCopy.hidden
      ? { left: window.innerWidth * 0.56, right: window.innerWidth }
      : getHeroVisualBounds()
    const heroCenter = (heroRect.left + heroRect.right) / 2
    const placeLeft = heroCenter > window.innerWidth * 0.5
    const sideInset = window.innerWidth < 780 ? 18 : 38
    const navHeight = siteNav.hidden ? 84 : siteNav.getBoundingClientRect().height
    const top = Math.max(navHeight + 44, window.innerHeight * 0.18)

    ambientTrail.style.left = placeLeft ? screenToRem(sideInset) : ''
    ambientTrail.style.right = placeLeft ? '' : screenToRem(sideInset)
    ambientTrail.style.top = screenToRem(top)
    ambientLayer.style.setProperty('--grain-focus-x', placeLeft ? '22%' : '78%')
  }

  function getPlaneScreenBounds(plane) {
    const projected = plane.position.clone().project(camera)
    if (
      projected.z < -1 ||
      projected.z > 1 ||
      projected.x < -1.4 ||
      projected.x > 1.4 ||
      projected.y < -1.4 ||
      projected.y > 1.4
    ) {
      return null
    }

    const x = (projected.x * 0.5 + 0.5) * window.innerWidth
    const y = (-projected.y * 0.5 + 0.5) * window.innerHeight
    const distance = Math.max(camera.position.distanceTo(plane.position), 0.6)
    const fov = THREE.MathUtils.degToRad(camera.fov)
    const screenUnitsPerWorld = window.innerHeight / (2 * Math.tan(fov / 2) * distance)
    const targetScale = plane.userData.targetScale ?? plane.scale.x ?? 1
    const halfSize = Math.max(
      14,
      Math.min(240, plane.userData.baseSize * targetScale * screenUnitsPerWorld * 0.7 + 20)
    )

    return {
      left: x - halfSize,
      top: y - halfSize,
      right: x + halfSize,
      bottom: y + halfSize,
    }
  }

  function getResponsiveHeroLayouts(isSmall) {
    const layouts = isSmall ? MOBILE_HERO_LAYOUTS : HERO_LAYOUTS
    return layouts.map((_, index) => layouts[(index + heroLayoutOffset) % layouts.length])
  }

  function getAdaptiveType(layout, widthRem) {
    const title = storyTitle.textContent.trim()
    const body = storyBody.textContent.trim()
    const proof = proofReadout.textContent.trim()
    const words = title.split(/\s+/).filter(Boolean)
    const longestWord = words.reduce((longest, word) => Math.max(longest, word.length), 0)
    const isSmall = window.innerWidth < 780
    const titlePressure =
      Math.max(0, title.length - 30) * 0.014 +
      Math.max(0, words.length - 4) * 0.048 +
      Math.max(0, longestWord - 13) * 0.022
    const bodyPressure = Math.max(0, body.length + proof.length - 175) * 0.0016
    const widthRelief = Math.max(0, widthRem - 30) * 0.004
    const titleScale = clamp(1 - titlePressure + widthRelief, isSmall ? 0.66 : 0.52, 1)
    const bodyScale = clamp(1 - bodyPressure, isSmall ? 0.82 : 0.88, 1)
    const titleExtraCh =
      Math.max(0, title.length - 34) * 0.24 +
      Math.max(0, longestWord - 12) * 0.42

    return {
      titleRem: layout.baseTitleRem * titleScale,
      bodyRem: layout.baseBodyRem * bodyScale,
      proofRem: clamp(layout.baseBodyRem * bodyScale * 0.78, isSmall ? 0.62 : 0.66, 0.82),
      leading: clamp(1 + (1 - titleScale) * 0.12, 1, 1.1),
      titleCh: Math.min(layout.titleCh + titleExtraCh, isSmall ? 17 : 29),
    }
  }

  function applyHeroCandidate(candidate) {
    const layout = candidate.layout
    const widthRem = candidate.width / 16
    const type = getAdaptiveType(layout, widthRem)

    heroCopy.style.left = screenToRem(candidate.left)
    heroCopy.style.top = screenToRem(candidate.top)
    heroCopy.style.width = screenToRem(candidate.width)
    heroCopy.style.setProperty('--hero-title-width', `${type.titleCh}ch`)
    heroCopy.style.setProperty('--hero-title-size', `${type.titleRem}rem`)
    heroCopy.style.setProperty('--hero-title-leading', type.leading)
    heroCopy.style.setProperty('--hero-body-width', `${Math.min(widthRem, layout.bodyRem)}rem`)
    heroCopy.style.setProperty('--hero-body-size', `${type.bodyRem}rem`)
    heroCopy.style.setProperty('--proof-size', `${type.proofRem}rem`)
  }

  function buildCopyCandidates() {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const isSmall = vw < 780
    const margin = isSmall ? 22 : 34
    const navHeight = siteNav.hidden ? 84 : siteNav.getBoundingClientRect().height
    const topY = navHeight + margin + 10
    const layouts = getResponsiveHeroLayouts(isSmall)
    const candidates = []

    for (const layout of layouts) {
      const width = Math.min(vw - margin * 2, layout.widthRem * 16)
      const xPositions = isSmall
        ? [margin]
        : uniqueNumbers([
          margin,
          vw * 0.22 - width * 0.5,
          vw * 0.38 - width * 0.5,
          vw * 0.5 - width * 0.5,
          vw * 0.62 - width * 0.5,
          vw * 0.78 - width * 0.5,
          vw - margin - width,
        ].map(left => clamp(left, margin, vw - margin - width)))
      const yPositions = isSmall
        ? uniqueNumbers([topY, vh * 0.48, vh * 0.64].map(top => clamp(top, topY, vh * 0.72)))
        : uniqueNumbers([
          topY,
          vh * 0.3,
          vh * 0.42,
          vh * 0.54,
          vh * 0.66,
        ].map(top => clamp(top, topY, vh * 0.72)))

      for (const left of xPositions) {
        for (const top of yPositions) {
          candidates.push({
            left,
            top,
            width,
            layout,
          })
        }
      }
    }

    return candidates
  }

  function keepHeroInsideViewport() {
    const sideLimit = window.innerWidth < 780 ? 18 : 34
    const topLimit = (siteNav.hidden ? 84 : siteNav.getBoundingClientRect().height) + 16
    const bottomLimit = window.innerHeight - 92
    const bounds = getHeroVisualBounds()
    const shiftX =
      Math.max(0, sideLimit - bounds.left) -
      Math.max(0, bounds.right - (window.innerWidth - sideLimit))
    const shiftY =
      Math.max(0, topLimit - bounds.top) -
      Math.max(0, bounds.bottom - bottomLimit)

    if (shiftX || shiftY) {
      heroCopy.style.left = screenToRem(heroCopy.getBoundingClientRect().left + shiftX)
      heroCopy.style.top = screenToRem(heroCopy.getBoundingClientRect().top + shiftY)
    }
  }

  function getHeroCacheKey() {
    return [
      activeStoryIndex,
      Math.round(window.innerWidth / 16),
      Math.round(window.innerHeight / 16),
    ].join(':')
  }

  function getAppliedHeroCandidate(candidate) {
    const rect = heroCopy.getBoundingClientRect()
    return {
      ...candidate,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    }
  }

  function estimateProofHeight(frame) {
    const visualHeights = {
      pipeline: 7.8,
      risk: 9.6,
      pipeline5: 8.1,
      texture: 8.6,
      benchmark: 14.6,
      testing: 8.5,
      product: 7.8,
      security: 7.5,
    }

    return remToScreen(visualHeights[frame?.visual] || 8.4)
  }

  function estimateHeroBounds(candidate) {
    const frame = STORY_FRAMES[activeStoryIndex] || STORY_FRAMES[0]
    const layoutConfig = candidate.layout
    const widthRem = candidate.width / 16
    const type = getAdaptiveType(layoutConfig, widthRem)
    const root = getRootSize()
    const titleText = storyTitle.textContent.trim()
    const bodyText = storyBody.textContent.trim()
    const titleWidth = Math.min(candidate.width, type.titleCh * type.titleRem * root * 0.57)
    const bodyWidth = Math.min(candidate.width, Math.min(widthRem, layoutConfig.bodyRem) * root)
    const titleFont = canvasFont(720, type.titleRem, 'Inter, Arial, Helvetica, sans-serif')
    const bodyFont = canvasFont(500, type.bodyRem, '"Cascadia Code", Consolas, monospace')
    const titleMetrics = measureTextBlock(
      titleText,
      titleFont,
      titleWidth,
      type.titleRem * root * type.leading
    )
    const bodyMetrics = measureTextBlock(
      bodyText,
      bodyFont,
      bodyWidth,
      type.bodyRem * root * 1.65,
      { letterSpacing: remToScreen(0.035) }
    )
    const metaHeight = remToScreen(1.85)
    const stackGap = remToScreen(1.55)
    const proofHeight = estimateProofHeight(frame)
    const visualWidth = Math.min(candidate.width, Math.max(titleWidth, bodyWidth))
    const height = Math.ceil(
      metaHeight +
      titleMetrics.height +
      stackGap +
      bodyMetrics.height +
      stackGap +
      proofHeight
    )

    return {
      ...candidate,
      left: candidate.left,
      top: candidate.top,
      right: candidate.left + visualWidth,
      bottom: candidate.top + height,
      width: candidate.width,
      visualWidth,
      height,
    }
  }

  function scoreCopyCandidates(imageBounds) {
    return buildCopyCandidates()
      .map(candidate => {
        const measured = estimateHeroBounds(candidate)
        const protectedCandidate = padRect(measured, 28)
        const score = imageBounds.reduce(
          (total, imageBound) => total + intersectionArea(protectedCandidate, imageBound),
          0
        )
        const topLimit = (siteNav.hidden ? 84 : siteNav.getBoundingClientRect().height) + 16
        const bottomLimit = window.innerHeight - 92
        const sideLimit = window.innerWidth < 780 ? 18 : 34
        const outsidePenalty =
          Math.max(0, sideLimit - measured.left) +
          Math.max(0, measured.right - (window.innerWidth - sideLimit)) +
          Math.max(0, topLimit - measured.top) +
          Math.max(0, measured.bottom - bottomLimit)
        return {
          ...measured,
          left: candidate.left,
          top: candidate.top,
          right: measured.right,
          bottom: measured.bottom,
          score: score + outsidePenalty * 1000,
          area: measured.visualWidth * measured.height,
        }
      })
      .sort((a, b) => a.score - b.score || b.area - a.area)
  }

  function positionHeroCopy({ force = false } = {}) {
    const cacheKey = getHeroCacheKey()
    const cached = heroPositionCache.get(cacheKey)

    if (cached && !force) {
      applyHeroCandidate(cached)
      keepHeroInsideViewport()
      return
    }

    const imageBounds = planes
      .map(plane => getPlaneScreenBounds(plane))
      .filter(Boolean)

    const scored = scoreCopyCandidates(imageBounds)
    const safeCandidates = scored.filter(candidate => candidate.score === 0)
    const choices = safeCandidates.length ? safeCandidates.slice(0, 8) : scored.slice(0, 3)
    const chosen = choices[Math.max(0, activeStoryIndex) % choices.length]

    applyHeroCandidate(chosen)
    keepHeroInsideViewport()
    heroPositionCache.set(cacheKey, getAppliedHeroCandidate(chosen))
  }

  function applyUiExclusion() {
    const protectedRects = []
    const visibleImageBounds = []

    if (!siteNav.hidden) {
      protectedRects.push(elementRect(siteNav, 10))
    }

    if (!heroCopy.hidden) {
      protectedRects.push(elementRect(heroCopy, 32))
    }

    if (!scrollToggleBtn.hidden) {
      protectedRects.push(elementRect(scrollToggleBtn, 18))
    }

    for (const plane of planes) {
      const bounds = getPlaneScreenBounds(plane)
      plane.visible = !bounds || !protectedRects.some(rect => rectsIntersect(bounds, rect))

      if (bounds && plane.visible && rectsIntersect(bounds, viewportRect())) {
        visibleImageBounds.push(bounds)
      }
    }

    navMapImageBounds = visibleImageBounds
  }

  function revealScene() {
    siteNav.hidden = false
    heroCopy.hidden = false
    scrollToggleBtn.hidden = false
    storyProgressPanel.hidden = false
    if (ambientLayer) ambientLayer.hidden = false
    setStoryProgress(0, true)

    requestAnimationFrame(() => {
      document.body.classList.remove('is-loading')
      document.body.classList.add('is-ready')
      loadingScreen?.classList.add('is-hiding')
      loadingScreen?.addEventListener('transitionend', () => loadingScreen.remove(), { once: true })
    })
  }


  let lastTime = performance.now()


  function renderGalleryFrame(delta = 0) {
    if (autoScroll) {
      targetT += AUTO_T_PER_SEC * delta
      setStoryProgress(storyProgress + delta * 0.42)
      setCamT(targetT)
    }

    
    const t = ((1 - camProxy.t) % 1 + 1) % 1

    const pathPos = curve.getPoint(t)
    if (!gsap.isTweening(camPos)) {
      camPos.x = pathPos.x
      camPos.y = pathPos.y
      camPos.z = pathPos.z + CAM_Z
    }
    camera.position.set(camPos.x, camPos.y, camPos.z)



    for (const plane of planes) {
      const dx = camera.position.x - plane.position.x
      const dy = camera.position.y - plane.position.y
      const dz = Math.abs(camera.position.z - plane.position.z)
      const distXY = Math.sqrt(dx * dx + dy * dy)

      let dt = Math.abs(plane.userData.t - t)
      if (dt > 0.5) {
        dt = 1 - dt
      }

      const isInFocusZone = dt < focusTGate && dz < Z_GATE && distXY < FOCUS_DIST
      const targetScale = isInFocusZone ? computeFocusScale(distXY, FOCUS_DIST, MAX_SCALE) : 1

      plane.userData.targetScale = targetScale
      plane.userData.setScale(targetScale)
    }

    camera.updateMatrixWorld()
    applyUiExclusion()
    syncNavMap()
    renderer.render(scene, camera)
  }

  function animate() {
    requestAnimationFrame(animate)

    const now = performance.now()
    const delta = (now - lastTime) / 1000
    lastTime = now

    renderGalleryFrame(delta)
  }

  renderGalleryFrame()
  revealScene()
  syncOverlayLayout = () => {
    if (!heroCopy.hidden) {
      heroPositionCache.clear()
      positionHeroCopy({ force: true })
      positionAmbientLayer()
      renderGalleryFrame()
    }
  }
  animate();
}


init()


window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  syncOverlayLayout()
})
