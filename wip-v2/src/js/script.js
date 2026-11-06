import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { CustomEase } from 'gsap/CustomEase'
import { SlowMo  } from 'gsap/EasePack'

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase, SlowMo )

;(() => {
  let refs = {}
  let lenis = null
  let introTl = null
  let lastStepTl = null
  const lastStepLoop = { distance: 0, gap: 0, height: 0, columns: [], dirty: true, settled: true, expanded: null }
  const loopInput = { delta: 0, speed: 0, boost: 0 }
  const lastStepState = { expandProgress: 0 }
  const ghostScaleEase = gsap.parseEase('expo.in')
  const grid = { ctx: null, width: 0, height: 0, ratio: 1 }

  function construct () {
    refs = {
      grid: document.querySelector('.js-grid'),
      intro: document.querySelector('.js-intro'),
      step1: document.querySelector('.js-step-1'),
      step2: document.querySelector('.js-step-2'),
      step3: document.querySelector('.js-step-3'),
    }
  }
  document.addEventListener('DOMContentLoaded', construct)

  /**
  * Page and animation initialisation
  */
  function init () {
    resizeGrid()
    initLenis()

    splitTexts()
    duplicateLastText()
    calculateCharsOrigin()

    createIntroTimeline()
    initStepsScroll()
    gsap.ticker.add(tick)
  }

  /**
  * Resize handler
  */
  function onResize () {
    resizeGrid()
    if (lenis) {
      duplicateLastText()
      ScrollTrigger.refresh()
    }
  }
  window.addEventListener('resize', onResize)

  /**
   * Size the grid canvas
   */
  function resizeGrid () {
    const canvas = refs.grid
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1

    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    Object.assign(grid, { ctx, width, height, ratio })
  }

  /**
   * Tick handler
   */
  function tick (time, deltaTime) {
    updateLoopSpeed(deltaTime / 1000)

    // Advance smooth scrolling
    lenis.raf(time * 1000)

    // Grid frame drawing
    drawGrid()

    animateLastStepLoop(deltaTime / 1000)
  }

  /**
   * Draw the grid offset by the smooth scroll position
   */
  function drawGrid () {
    const { ctx, width, height, ratio } = grid
    if (!ctx) return

    const cellSize = 24
    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = '#9000FF33'
    ctx.lineWidth = 1
    ctx.beginPath()

    // Center a cell in the viewport and align strokes to device pixels.
    const startX = ((width - cellSize) * 0.5) % cellSize
    const startY = (((height - cellSize) * 0.5 - lenis.scroll * 0.05) % cellSize + cellSize) % cellSize - cellSize
    const align = value => (Math.round(value * ratio - ratio * 0.5) + ratio * 0.5) / ratio

    for (let x = startX; x <= width; x += cellSize) {
      const position = align(x)
      ctx.moveTo(position, 0)
      ctx.lineTo(position, height)
    }

    for (let y = startY; y <= height; y += cellSize) {
      const position = align(y)
      ctx.moveTo(0, position)
      ctx.lineTo(width, position)
    }

    ctx.stroke()
  }

  /**
   * Init Lenis
   */
  function initLenis () {
    lenis = new Lenis();
    lenis.on('scroll', ScrollTrigger.update);
    lenis.on('virtual-scroll', onLoopInput)
    gsap.ticker.lagSmoothing(0);
  }

  /**
   * Accumulate normalized wheel and swipe movement, even at the page boundary
   */
  function onLoopInput ({ deltaY, event }) {
    if (event.type !== 'wheel' && event.type !== 'touchmove') return
    if (event.ctrlKey || event.touches?.length > 1) return
    if (!deltaY) return

    loopInput.delta += deltaY
  }

  /**
   * Restore the loop's scroll boost and braking, without an automatic base speed
   */
  function updateLoopSpeed (deltaTime) {
    if (deltaTime <= 0) return
    if (lastStepState.expandProgress === 0) {
      Object.assign(loopInput, { delta: 0, speed: 0, boost: 0 })
      return
    }

    loopInput.speed = loopInput.delta / deltaTime
    const gain = loopInput.speed < 0 ? loopInput.speed * -0.0025 : 0.8
    loopInput.boost = Math.max(0, loopInput.boost + loopInput.speed * deltaTime * gain)
    loopInput.delta = 0

    loopInput.boost *= Math.pow(0.99, deltaTime * 60)
    if (loopInput.boost < 0.1) loopInput.boost = 0
  }

  /**
   * Split texts
   */
  function splitTexts () {
    const steps = [refs.intro, refs.step1, refs.step2, refs.step3]

    steps.forEach((step, i) => {
      const text = step.querySelector('.js-text')

      splitText(text, i > 0)
    })
  }

  /**
   * Split a text row and add its character ghosts
   */
  function splitText (text, hasGhosts = true) {
    const st = new SplitText(
      text,
      {
        aria: 'none',
        type: 'chars',
        charsClass: 'char js-char',
        tag: 'span',
      }
    )

    if (hasGhosts) {
      st.chars.forEach((el, j) => {
        const char = el.innerText

        el.style.zIndex = st.chars.length - j

        const ghostsEl = document.createElement('span')
        ghostsEl.classList.add('char__ghosts')

        for ( let k = 0; k < 6; k++ ) {
          const ghostEl = document.createElement('span')
          ghostEl.classList.add('char__ghost', 'js-ghost')
          ghostEl.setAttribute('data-char', char)

          ghostsEl.append(ghostEl)
        }

        el.append(ghostsEl)
      })
    }
  }

  /**
   * Create centered rows with overscan for recycling each column
   */
  function duplicateLastText () {
    if (lastStepTl) {
      lastStepTl.scrollTrigger.kill()
      lastStepTl.kill()
    }

    const step = refs.step3
    const text = step.querySelector('.js-text')
    const inner = text.parentElement
    const previousColumns = lastStepLoop.columns
    step.querySelectorAll('.js-text-copy').forEach(copy => copy.remove())

    const rowHeight = text.offsetHeight
    const height = inner.clientHeight
    const gap = rowHeight * 0.3
    const distance = rowHeight + gap
    if (!distance) return

    const sideRows = Math.ceil(height / (2 * distance)) + 1
    const rows = [{ el: text, offset: 0 }]
    for (let offset = -sideRows; offset <= sideRows; offset++) {
      if (offset === 0) continue
      const copy = text.cloneNode(false)
      copy.textContent = text.textContent
      copy.classList.remove('js-text')
      copy.classList.add('js-text-copy')
      copy.setAttribute('aria-hidden', 'true')
      inner.append(copy)
      splitText(copy)
      rows.push({ el: copy, offset })
    }

    Object.assign(lastStepLoop, { distance, gap, height, rows, columns: [], dirty: true, settled: true, expanded: null, previousProgress: 0, collapsing: false })
    rows.forEach(row => {
      row.el.style.transform = 'none'
      row.el.querySelectorAll('.js-char').forEach((char, index) => {
        if (!lastStepLoop.columns[index]) {
          lastStepLoop.columns[index] = {
            chars: [],
            ghosts: [],
            positions: [],
            renderedPositions: [],
            collapsePositions: [],
            movement: previousColumns[index]?.movement || 0,
            multiplier: previousColumns[index]?.multiplier || 0.5 + Math.random(),
            ghostOffsets: Array(6).fill(0),
            ghostScales: Array(6).fill(1),
            entrance: Array.from({ length: 6 }, () => ({ y: 0, scale: 0.3 })),
          }
        }
        lastStepLoop.columns[index].chars.push(char)
        lastStepLoop.columns[index].ghosts.push([...char.querySelectorAll('.js-ghost')])
        lastStepLoop.columns[index].positions.push(Array(6).fill(row.offset * distance))
        lastStepLoop.columns[index].renderedPositions.push(Array(6).fill(0))
        char.style.transform = 'none'
        char.style.setProperty('--entrance-origin-x', `${row.el.offsetWidth * 0.5 - char.offsetLeft}px`)
      })
    })

    loopInput.delta = 0
    createLastStepTimeline()
  }

  /**
   * Calculate chars origin within their parent
   */
  function calculateCharsOrigin () {
    const steps = [refs.step1, refs.step2]

    steps.forEach(step => {
      const text = step.querySelector('.js-text')
      const chars = text.querySelectorAll('.js-char')

      // Calculate text horizontal center
      const textRect = text.getBoundingClientRect()
      const textCenterX = textRect.left + textRect.width * 0.5

      chars.forEach(char => {
        const charRect = char.getBoundingClientRect()
        const originX = textCenterX - charRect.left

        char.style.setProperty('--transform-origin-x', `${originX}px`)
      })
    })
  }

  /**
   * Init steps scroll animation
   */
  function initStepsScroll () {
    const steps = [refs.step1, refs.step2]

    steps.forEach((step, index) => {
      const tl = createStepTimeline(step)

      const scrollTrigger = ScrollTrigger.create(
        {
          trigger: step,
          start: 'top 100%',
          end: 'bottom 80%',
          scrub: 0,
          onUpdate: (self) => {
            tl.progress(self.progress)

            if ( index === 0 ) {
              introTl.progress(Math.min(self.progress * 20, 1))
            }
          },
        }
      )
    })
  }

  /**
   * Create the timeline animation for the intro text
   */
  function createIntroTimeline () {
    const text = refs.intro.querySelector('.js-text')
    const chars = text.querySelectorAll('.char')

    const tl = gsap.timeline({ paused: true })

    tl.to(
      chars,
      {
        y: '-100%',
        duration: 0.4,
        stagger: 0.01,
        ease: 'power3.in'
      }
    )

    introTl = tl
  }

  /**
   * Create the timeline animation for a step
   */
  function createStepTimeline (step) {
    const text = step.querySelector('.js-text')
    const ghosts = text.querySelectorAll('.js-ghost')

    const scale = 0.3
    const move = (window.innerHeight * 0.5 + text.clientHeight * 0.5) / scale

    const _proxyGhosts = []
    ghosts.forEach(ghost => {
      _proxyGhosts.push({
        el: ghost,
        scale: 1,
        y: 0
      })

      ghost.style.transform = `scale(0) `
    });

    const tl = gsap.timeline(
      {
        paused: true,
        duration: 1,
        onUpdate: () => {
          _proxyGhosts.forEach(ghost => {
            ghost.el.style.transform = `translate3d(0, ${ghost.y}px, 0) scale(${ghost.scale}) `
          })
        }
      }
    )

    tl.fromTo(
      _proxyGhosts,
      {
        y: move
      },
      {
        y: move * -1,
        duration: 0.9,
        stagger: {
          each: 0.005,
        },
        ease: 'slow(0.25,0.95,false)'
      },
      0
    )

    tl.fromTo(
      _proxyGhosts,
      {
        scale,
      },
      {
        scale: 1,
        duration: 0.4,
        stagger: {
          amount: 0.1,
        },
        ease: CustomEase.create('custom', 'M0,0 C0.445,0 0.39,0.583 0.426,0.707 0.457,0.816 0.424,1 1,1 ')
      },
      0.25
    )

    return tl
  }

  /**
   * Enter, hold in the center, and unfold the surrounding rows
   */
  function createLastStepTimeline () {
    const move = (lastStepLoop.height + refs.step3.querySelector('.js-text').offsetHeight) * 0.5 / 0.3
    const entrance = lastStepLoop.columns.flatMap(column => column.entrance)
    const moveEase = gsap.parseEase('slow(0.25,0.95,false)')
    lastStepState.expandProgress = 0
    lastStepTl = gsap.timeline({
      onUpdate: () => { lastStepLoop.dirty = true },
      scrollTrigger: {
        trigger: refs.step3,
        start: 'top bottom',
        end: 'bottom 150%',
        scrub: true,
      },
    })
    // Use the first half of the other steps' movement, stopping at the center.
    lastStepTl.fromTo(entrance, { y: move }, {
      y: 0,
      duration: 0.45,
      stagger: { each: 0.005 },
      ease: progress => moveEase(progress * 0.5) * 2,
    }, 0)
    lastStepTl.fromTo(entrance, { scale: 0.3 }, {
      scale: 1,
      duration: 0.4,
      stagger: { amount: 0.1 },
      ease: CustomEase.create('lastStepScale', 'M0,0 C0.445,0 0.39,0.583 0.426,0.707 0.457,0.816 0.424,1 1,1 '),
    }, 0.25)
    lastStepTl.to(lastStepState, { expandProgress: 1, duration: 0.8, ease: 'power2.inOut' }, 0.85)
    lastStepTl.progress(lastStepTl.scrollTrigger.progress)
    animateLastStepLoop(0)
  }

  /**
   * Render the formation and recycle characters with scroll-driven momentum
   */
  function animateLastStepLoop (deltaTime) {
    const { distance, gap, columns, rows } = lastStepLoop
    if (!distance) return
    if (!lastStepLoop.dirty && loopInput.boost === 0 && lastStepLoop.settled) return
    lastStepLoop.dirty = false
    lastStepLoop.settled = true

    const { expandProgress } = lastStepState
    if (expandProgress < lastStepLoop.previousProgress && !lastStepLoop.collapsing) {
      // Freeze the positions actually on screen, not their unwrapped loop coordinates.
      columns.forEach(column => {
        column.collapsePositions = column.renderedPositions.map(positions =>
          positions.map(y => y / lastStepLoop.previousProgress)
        )
      })
      lastStepLoop.collapsing = true
    }
    if (lastStepLoop.collapsing) {
      Object.assign(loopInput, { delta: 0, speed: 0, boost: 0 })
    }
    const isExpanded = expandProgress > 0
    if (lastStepLoop.expanded !== isExpanded) {
      rows.forEach((row, index) => {
        row.el.style.visibility = index === 0 || isExpanded ? 'visible' : 'hidden'
      })
      columns.forEach(column => {
        column.chars.forEach(char => {
          char.style.setProperty('--transform-origin-x', isExpanded ? '50%' : 'var(--entrance-origin-x)')
        })
      })
      lastStepLoop.expanded = isExpanded
    }

    const columnHeight = rows.length * distance
    const minPosition = -columnHeight * 0.5
    columns.forEach(column => {
      const boost = loopInput.boost * column.multiplier
      // Earlier steps must not build up travel behind the collapsed word.
      if (expandProgress === 0) {
        column.movement = 0
        column.positions.forEach((positions, rowIndex) => positions.fill(rows[rowIndex].offset * distance))
      }
      column.movement += boost * expandProgress * deltaTime

      const blend = 1 - Math.exp(-deltaTime / 0.08)
      const scaleProgress = ghostScaleEase(boost / (boost + 800))
      const trail = Math.min(gap * 0.8, boost * 5 * 0.0125)
      column.ghostOffsets.forEach((offset, index) => {
        const target = trail * index / 5
        column.ghostOffsets[index] = offset + (target - offset) * blend
        column.ghostScales[index] += (1 - scaleProgress - column.ghostScales[index]) * blend
        if (Math.abs(target - column.ghostOffsets[index]) < 0.01) column.ghostOffsets[index] = target
        else lastStepLoop.settled = false
        if (Math.abs(1 - scaleProgress - column.ghostScales[index]) < 0.0001) column.ghostScales[index] = 1 - scaleProgress
        else lastStepLoop.settled = false
      })
      column.ghosts.forEach((ghosts, rowIndex) => {
        if (!isExpanded && rowIndex > 0) return
        ghosts.forEach((ghost, index) => {
          const entrance = column.entrance[index]
          const expandedY = (column.positions[rowIndex][index] - column.movement + column.ghostOffsets[index]) * expandProgress
          // Recycle after blending so the wrap boundaries stay outside the viewport.
          const loopedY = lastStepLoop.collapsing
            ? column.collapsePositions[rowIndex][index] * expandProgress
            : ((expandedY - minPosition) % columnHeight + columnHeight) % columnHeight + minPosition
          column.renderedPositions[rowIndex][index] = loopedY
          if (lastStepLoop.collapsing && expandProgress === 1) {
            // Resume from this position if scrolling reverses again before full collapse.
            column.positions[rowIndex][index] = loopedY + column.movement - column.ghostOffsets[index]
          }
          const y = entrance.y + loopedY
          const scale = entrance.scale * (1 + (column.ghostScales[index] - 1) * expandProgress)
          ghost.style.transform = `translate3d(0, ${y}px, 0) scale(${scale})`
        })
      })
    })
    lastStepLoop.previousProgress = expandProgress
    if (expandProgress === 0 || expandProgress === 1) lastStepLoop.collapsing = false
  }

  /* Init page on load */
  window.addEventListener('load', () => {
    init()
  })
})()
