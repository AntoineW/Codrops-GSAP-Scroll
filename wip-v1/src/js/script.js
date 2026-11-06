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
  let isLastStepIn = false
  const lastStepLoop = { distance: 0, gap: 0, height: 0, columns: [] }
  const loopInput = { delta: 0, speed: 0, boost: 0 }
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

    if (isLastStepIn) {
      animateLastStepLoop(deltaTime / 1000)
    }
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
   * Convert input to a nonnegative speed boost and ease it away on idle
   */
  function updateLoopSpeed (deltaTime) {
    if (deltaTime <= 0) return

    loopInput.speed = loopInput.delta / deltaTime
    const gain = loopInput.speed < 0 ? loopInput.speed * -0.0025 : 0.8
    loopInput.boost = Math.max(0, loopInput.boost + loopInput.speed * deltaTime * gain)
    loopInput.delta = 0

    loopInput.boost *= 0.99
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
   * Fill the last step with text plus one extra row
   */
  function duplicateLastText () {
    if (lastStepTl) {
      lastStepTl.scrollTrigger.kill()
      lastStepTl.kill()
    }

    const step = refs.step3
    const text = step.querySelector('.js-text')

    step.querySelectorAll('.js-text-copy').forEach(copy => copy.remove())

    const rowHeight = text.getBoundingClientRect().height
    if (!rowHeight) return

    const rowGap = parseFloat(getComputedStyle(text.parentElement).rowGap) || 0
    const rowCount = Math.ceil((step.getBoundingClientRect().height + rowGap) / (rowHeight + rowGap)) + 1
    const copies = document.createDocumentFragment()

    for (let i = 1; i < rowCount; i++) {
      const copy = text.cloneNode(false)
      copy.textContent = text.textContent
      copy.classList.remove('js-text')
      copy.classList.add('js-text-copy')
      copy.setAttribute('aria-hidden', 'true')
      copies.append(copy)
    }

    text.parentElement.append(copies)
    step.querySelectorAll('.js-text-copy').forEach(copy => splitText(copy))

    lastStepLoop.distance = rowHeight + rowGap
    lastStepLoop.gap = rowGap * 0.8
    lastStepLoop.height = step.getBoundingClientRect().height
    lastStepLoop.scroll = lenis.scroll
    lastStepLoop.columns = []

    step.querySelectorAll('.step-text').forEach(row => {
      row.querySelectorAll('.js-char').forEach((char, index) => {
        if (!lastStepLoop.columns[index]) {
          const rand = Math.random()

          lastStepLoop.columns[index] = {
            chars: [],
            ghosts: [],
            ghostOffsets: Array(6).fill(0),
            ghostScales: Array(6).fill(1),
            positions: [],
            movement: 0,
            verticalSpeed: 0,
            previousProgress: 0,
            inProgress: 0,
            speed: 200 * (1 + rand),
            boostMultiplier: 0.5 + rand,
          }
        }

        char.style.transform = 'translate3d(0, 0, 0)'
        lastStepLoop.columns[index].chars.push(char)
        lastStepLoop.columns[index].ghosts.push([...char.querySelectorAll('.js-ghost')])
        lastStepLoop.columns[index].positions.push(
          (lastStepLoop.columns[index].chars.length - 1) * lastStepLoop.distance + lastStepLoop.height
        )
      })
    })

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
    const lastStepTrigger = ScrollTrigger.create({
      trigger: refs.step3,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: self => { isLastStepIn = self.isActive },
    })
    isLastStepIn = lastStepTrigger.isActive

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
   * Stagger the columns into view over the last step scroll range
   */
  function createLastStepTimeline () {
    lastStepTl = gsap.timeline({
      onUpdate: () => animateLastStepLoop(0),
      scrollTrigger: {
        trigger: refs.step3,
        start: 'top 0%',
        end: 'bottom 100%',
        scrub: 1,
      },
    })

    lastStepTl.fromTo(
      lastStepLoop.columns,
      {
        inProgress: 0
      },
      {
        inProgress: 1,
        duration: 1,
        stagger: {
          each: 0.05,
          from: 'start'
        },
        ease: 'power1.out',
      }
    )

    lastStepTl.progress(lastStepTl.scrollTrigger.progress)
    animateLastStepLoop(0)
  }

  /**
   * Animate last step infinite loop
   */
  function animateLastStepLoop (deltaTime) {
    const { distance, height, columns } = lastStepLoop
    if (!distance) return

    const scrollDelta = lenis.scroll - lastStepLoop.scroll
    lastStepLoop.scroll = lenis.scroll

    columns.forEach(column => {
      const progressChange = column.inProgress - column.previousProgress
      const columnHeight = column.chars.length * distance
      const boost = loopInput.boost * column.boostMultiplier * column.inProgress
      const loopMove = column.inProgress > 0 ? (column.speed + boost) * deltaTime : 0
      let entranceMove = -progressChange * height

      if (progressChange < 0) {
        // Move the remaining fraction toward a fully hidden column without pausing its loop.
        const remainingDistance = Math.max(0, height - Math.min(...column.positions) + loopMove)
        entranceMove = remainingDistance * -progressChange / column.previousProgress
      }

      column.chars.forEach((char, index) => {
        const rowTop = index * distance
        let position = column.positions[index] + entranceMove - loopMove

        // Measure one row before recycling, including movement through the viewport.
        if (index === 0) column.movement += position - column.positions[index] - scrollDelta

        // Keep recycling at the fixed step edge, never at the entrance offset.
        if (position < -distance) {
          position += Math.ceil((-distance - position) / columnHeight) * columnHeight
        }

        column.positions[index] = position
        const y = position - rowTop
        char.style.transform = `translate3d(0, ${y}px, 0)`
      })

      column.previousProgress = column.inProgress

      if (deltaTime > 0) {
        column.verticalSpeed = column.movement / deltaTime
        column.movement = 0

        const blend = 1 - Math.exp(-deltaTime / 0.08)
        const layerCount = column.ghostOffsets.length - 1
        const scaleProgress = ghostScaleEase(boost / (boost + 800))
        const trailHeight = -column.verticalSpeed * layerCount * 0.0125
        const trail = Math.max(-lastStepLoop.gap, Math.min(lastStepLoop.gap, trailHeight))
        column.ghostOffsets.forEach((offset, index) => {
          // Spread all layers evenly within the capped trail.
          const target = layerCount > 0 ? trail * index / layerCount : 0
          column.ghostOffsets[index] = offset + (target - offset) * blend

          const targetScale = 1 - scaleProgress
          column.ghostScales[index] += (targetScale - column.ghostScales[index]) * blend
        })

        column.ghosts.forEach(ghosts => {
          ghosts.forEach((ghost, index) => {
            ghost.style.transform = `translate3d(0, ${column.ghostOffsets[index]}px, 0) scale(${column.ghostScales[index]})`
          })
        })
      }
    })
  }

  /* Init page on load */
  window.addEventListener('load', () => {
    init()
  })
})()
