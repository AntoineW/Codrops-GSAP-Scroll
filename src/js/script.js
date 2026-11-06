import Grid from './Grid.js'
import PageEnvironment from './PageEnvironment.js'

import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { CustomEase } from 'gsap/CustomEase'
import { SlowMo } from 'gsap/EasePack'
import { Physics2DPlugin } from 'gsap/Physics2DPlugin'

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase, SlowMo, Physics2DPlugin)

;(() => {
  // ============================================================================
  // 1. PARAMETERS & VARIABLES
  // ============================================================================

  // Tweak the effect here. Distances are CSS pixels; animation times are seconds.
  const settings = {
    ghostCount: 6, // One cream front layer and five colored trail layers; see the SCSS palette.
    throwing: {
      windupDistance: 40, // Downward travel in pixels before the throw.
      windupDuration: 0.1, // Duration of the downward movement in seconds.
      maxPerSecond: 20, // Maximum number of new throws triggered per second.
      triggerViewportFraction: 0.5, // Enable throws within this many viewport heights of the scroll bottom.
      minScale: 0.2, // Minimum thrown-letter scale relative to its full size.
      trailDelay: 0.0125, // Delay in seconds between each ghost layer's flight start.
      recoveryDuration: 1.5, // Seconds for the source letter to scale back to full size.
      velocityRange: [0.75, 1.125], // Random launch speed bounds, multiplied by the smaller viewport dimension (px/s).
      angleRange: [-120, -60], // Random launch angle bounds in degrees; -90 points straight up.
      gravityFactor: 1.6, // Downward acceleration multiplier applied to viewport height (px/s²).
      rotationRange: [-100, 100], // Random final rotation bounds in degrees over the flight.
    },
  }

  // Hand-tuned scale easing for the letter scale animation.
  const scaleEase = CustomEase.create(
    'letterScale',
    'M0,0 C0.445,0 0.39,0.583 0.426,0.707 0.457,0.816 0.424,1 1,1 '
  )
  // SlowMo easing for the letter flight.
  const moveEase = gsap.parseEase('slow(0.25,0.95,false)')

  let refs = {}
  let lenis = null
  let introTimeline = null
  let grid = null

  const letterThrows = {
    container: null,
    letters: [],
    sources: new Map(), // Character element -> recovery state and scroll-animation proxies.
    active: new Set(), // Live flights; each removes itself when its last layer lands.
    recoveries: new Map(), // Source state -> tween, so another throw can restart recovery.
    lastThrowTime: -Infinity,
    triggerOffset: 0,
  }



  // ============================================================================
  // 2. CONSTRUCT / INIT & GENERIC PAGE LOGIC
  // ============================================================================

  /**
   * Collect elements once the markup exists
   */
  function construct () {
    refs = {
      grid: document.querySelector('.js-grid'),
      intro: document.querySelector('.js-intro'),
      step1: document.querySelector('.js-step-1'),
      step2: document.querySelector('.js-step-2'),
      step3: document.querySelector('.js-step-3'),
    }

    letterThrows.container = refs.step3.querySelector('.js-throw-letters')

    new PageEnvironment()
  }
  document.addEventListener('DOMContentLoaded', construct)

  /**
   * Prepare layout and animations after the fonts and other page assets load
   */
  function init () {
    grid = new Grid(refs.grid)
    grid.draw(0)

    // Split first: measurements and timelines need the generated character elements.
    splitTexts()
    measureThrowLetters()
    calculateCharsOrigin()

    initMotion()

    // Bind event listeners after the initial measurements, so the first resize doesn't clear the geometry.
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onThrowKeyDown)
  }

  /**
   * Enable animation only while the system allows motion
   */
  function initMotion () {
    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
      initLenis()
      measureThrowLetters()
      calculateCharsOrigin()
      createIntroTimeline()
      initStepsScroll()
      gsap.ticker.add(tick)
      ScrollTrigger.refresh()

      return () => {
        clearLetterThrows()
        gsap.ticker.remove(tick)
        lenis.destroy()
        lenis = null
        introTimeline = null
        letterThrows.sources.forEach(source => {
          source.ghostStates = []
        })
        document.querySelectorAll('.js-ghost').forEach(ghost => {
          ghost.style.transform = ''
        })
        grid.draw(0)
      }
    })
  }

  /**
   * Rebuild cached geometry and refresh the scroll ranges after a resize
   */
  function onResize () {
    grid.resize()
    if (!lenis) grid.draw(0)

    clearLetterThrows()
    measureThrowLetters()
    calculateCharsOrigin()

    ScrollTrigger.refresh()
  }

  /**
   * Tick handler
   */
  function tick (time) {
    // GSAP supplies seconds; Lenis expects milliseconds. Both share one animation clock.
    lenis.raf(time * 1000)

    grid.draw(lenis.scroll)
  }

  /**
   * Init Lenis
   */
  function initLenis () {
    lenis = new Lenis()
    lenis.on('scroll', ScrollTrigger.update)
    // Raw wheel/touch input still arrives when the document can no longer scroll.
    lenis.on('virtual-scroll', onThrowInput)
    gsap.ticker.lagSmoothing(0)
  }

  // Wait for assets and fonts before measuring the text and revealing the demo.
  window.addEventListener(
    'load',
    async () => {
      try {
        await document.fonts.ready
        init()
      } finally {
        document.body.classList.remove('loading')
        document.querySelector('.js-loader').hidden = true
      }
    }
  )



  // ============================================================================
  // 3. SPLIT TEXT & STEP TIMELINES
  // ============================================================================

  /**
   * Split texts
   */
  function splitTexts () {
    const steps = [refs.intro, refs.step1, refs.step2, refs.step3]

    steps.forEach((step, i) => {
      const text = step.querySelector('.js-text')

      splitText(text, i > 0) // The first step (intro) has no ghosts
    })
  }

  /**
   * Split a text row and add its character ghosts
   */
  function splitText (text, hasGhosts = true) {
    const split = new SplitText(
      text,
      {
        aria: 'none',
        type: 'chars',
        charsClass: 'char js-char',
        tag: 'span',
      }
    )

    // The transparent character keeps its layout; these overlapping spans draw the glyph.
    if (hasGhosts) {
      split.chars.forEach((el, j) => {
        const char = el.innerText

        el.style.zIndex = split.chars.length - j

        const ghostsEl = document.createElement('span')
        ghostsEl.classList.add('char__ghosts')

        for (let k = 0; k < settings.ghostCount; k++) {
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
   * Cache word-centered scroll origins and the offset to each letter center
   */
  function calculateCharsOrigin () {
    const steps = [refs.step1, refs.step2, refs.step3]

    steps.forEach(step => {
      const text = step.querySelector('.js-text')
      const chars = text.querySelectorAll('.js-char')

      // A shared origin makes the separate characters scale as one word.
      const textRect = text.getBoundingClientRect()
      const textCenterX = textRect.left + textRect.width * 0.5

      chars.forEach(char => {
        const charRect = char.getBoundingClientRect()
        const originX = textCenterX - charRect.left

        char.style.setProperty('--transform-origin-x', `${originX}px`)
        const source = letterThrows.sources.get(char)
        if (source) source.originOffsetX = charRect.width * 0.5 - originX
      })
    })
  }

  /**
   * Init steps scroll animation
   */
  function initStepsScroll () {
    const steps = [refs.step1, refs.step2, refs.step3]

    steps.forEach((step, index) => {
      const isLastStep = step === refs.step3
      const tl = createStepTimeline(step, isLastStep)

      ScrollTrigger.create(
        {
          trigger: step,
          toggleClass: 'is-active',
          start: 'top bottom',
          // The final word reaches its centered pose at the bottom of the document.
          end: isLastStep ? 'bottom bottom' : 'bottom top',
          scrub: 0,
          onRefresh: self => tl.invalidate().progress(self.progress),
          onUpdate: (self) => {
            tl.progress(self.progress)

            if (index === 0) {
              // Hide the small intro during the first 5% of the first word's scroll range.
              introTimeline.progress(Math.min(self.progress * 20, 1))
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
    const chars = text.querySelectorAll('.js-char')

    const tl = gsap.timeline(
      {
        paused: true,
        onUpdate: () => {
          const progress = tl.progress()
          refs.intro.classList.toggle('is-active', progress > 0 && progress < 1)
        },
      }
    )

    tl.to(
      chars,
      {
        y: '-100%',
        duration: 0.4,
        stagger: 0.01,
        ease: 'power3.in'
      }
    )

    introTimeline = tl
  }

  /**
   * Create the timeline animation for a step
   */
  function createStepTimeline (step, stopAtCenter = false) {
    const text = step.querySelector('.js-text')
    const ghosts = text.querySelectorAll('.js-ghost')

    const initialScale = 0.3
    const getTravelDistance = () => (window.innerHeight * 0.5 + text.clientHeight * 0.5) / initialScale

    // ScrollTrigger animates these plain objects. Recovery never overwrites their values.
    const ghostStates = []
    ghosts.forEach(ghost => {
      const source = letterThrows.sources.get(ghost.closest('.js-char'))
      const proxy = {
        el: ghost,
        source,
        scrollScale: 1,
        y: 0,
      }
      ghostStates.push(proxy)
      if (source) source.ghostStates.push(proxy)

      ghost.style.transform = 'scale(0)'
    })

    const tl = gsap.timeline(
      {
        paused: true,
        onUpdate: () => renderStepGhosts(ghostStates),
      }
    )

    tl.fromTo(
      ghostStates,
      {
        y: getTravelDistance,
      },
      {
        y: () => stopAtCenter ? 0 : -getTravelDistance(),
        duration: stopAtCenter ? 0.45 : 0.9,
        stagger: {
          each: 0.005,
        },
        // The final word uses only the entrance half of the same movement curve.
        ease: stopAtCenter ? progress => moveEase(progress * 0.5) * 2 : moveEase,
      },
      0
    )

    tl.fromTo(
      ghostStates,
      {
        scrollScale: initialScale,
      },
      {
        scrollScale: 1,
        duration: 0.4,
        stagger: {
          amount: 0.1,
        },
        ease: scaleEase,
      },
      0.25
    )

    return tl
  }

  /**
   * Compose scroll and recovery scales in the same ghost transform
   */
  function renderStepGhosts (ghosts) {
    ghosts.forEach(ghost => {
      const recoveryScale = ghost.source?.recoveryScale ?? 1
      const scale = ghost.scrollScale * recoveryScale
      // The CSS origin is the word center. This translation moves only the recovery
      // origin back to the letter center; it becomes zero when recovery finishes.
      // Multiplying by scrollScale applies the correction in the scaled word's space.
      const originOffsetX = ghost.source?.originOffsetX ?? 0
      const x = ghost.scrollScale * (1 - recoveryScale) * originOffsetX
      ghost.el.style.transform = `translate3d(${x}px, ${ghost.y}px, 0) scale(${scale})`
    })
  }



  // ============================================================================
  // 4. LAST STEP & LETTER THROWS
  // ============================================================================

  /**
   * Use downward scroll keys to throw letters while preserving native scrolling
   */
  function onThrowKeyDown (event) {
    if (!['ArrowDown', 'PageDown', ' '].includes(event.key)) return
    if (event.defaultPrevented || event.isComposing) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    if (event.target.isContentEditable) return
    if (event.target.closest('input, textarea, select, button, a, [role="button"], [role="textbox"]')) return

    onThrowInput({ deltaY: 1, event })
  }

  /**
   * Emit individual letters from downward input in the final half-viewport scroll range
   */
  function onThrowInput ({ deltaY, event }) {
    if (!lenis) return
    if (!['wheel', 'touchmove', 'keydown'].includes(event.type)) return
    // Ignore pinch-to-zoom gestures.
    if (event.ctrlKey || event.touches?.length > 1) return
    if (deltaY <= 0 || lenis.scroll < lenis.limit - letterThrows.triggerOffset) return
    if (!letterThrows.letters.length) return

    const now = performance.now()
    if (now - letterThrows.lastThrowTime < 1000 / settings.throwing.maxPerSecond) return

    // Pick a random letter.
    let index = gsap.utils.random(0, letterThrows.letters.length - 1, 1)
    letterThrows.lastThrowTime = now
    throwLetter(letterThrows.letters[index])
  }

  /**
   * Cache the centered word geometry outside the animation ticker
   */
  function measureThrowLetters () {
    const text = refs.step3.querySelector('.js-text')
    const inner = text.parentElement
    // offset* measurements ignore transforms, so a recovering letter keeps a stable launch point.
    const left = (inner.clientWidth - text.offsetWidth) * 0.5
    const top = (inner.clientHeight - text.offsetHeight) * 0.5

    letterThrows.letters = [...text.querySelectorAll('.js-char')].map(el => {
      // Keep this state object on resize: the scroll timeline holds references to it.
      if (!letterThrows.sources.has(el)) {
        letterThrows.sources.set(
          el,
          {
            recoveryScale: 1,
            ghostStates: [],
            originOffsetX: 0,
          }
        )
      }
      return {
        el,
        source: letterThrows.sources.get(el),
        x: left + el.offsetLeft,
        y: top + el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
      }
    })
    letterThrows.height = inner.clientHeight
    letterThrows.width = inner.clientWidth
    letterThrows.triggerOffset = window.innerHeight * settings.throwing.triggerViewportFraction
  }

  /**
   * Launch one letter with six time-offset copies of the same ballistic path
   */
  function throwLetter (letter) {
    // Snapshot the visible scale before resetting the source recovery.
    const frontLayer = letter.source.ghostStates[0]
    const sourceScale = Math.max(
      settings.throwing.minScale,
      letter.source.recoveryScale * frontLayer.scrollScale
    )
    const { el, ghosts } = createThrownLetter(letter, sourceScale)
    const { velocity, angle, gravity, duration, rotation } = getThrowPhysics(letter)
    const flight = { el, timeline: null }
    flight.timeline = gsap.timeline(
      {
        onComplete: () => {
          el.remove()
          letterThrows.active.delete(flight)
        },
      }
    )
    letterThrows.active.add(flight)

    // The windup is a downward movement before the ballistic flight. It makes the throw feel like a flick.
    flight.timeline.to(
      ghosts,
      {
        y: settings.throwing.windupDistance,
        duration: settings.throwing.windupDuration,
        ease: 'power1.inOut',
      }
    )

    // The layers follow the same path at different times, so the trail bends with the fall.
    flight.timeline.to(
      ghosts,
      {
        physics2D: { velocity, angle, gravity },
        rotation,
        duration,
        ease: 'none',
        stagger: settings.throwing.trailDelay,
      },
      settings.throwing.windupDuration
    )

    //
    recoverSourceLetter(letter.source)
  }

  /**
   * Clone the glyph and its trail without changing the source word
   */
  function createThrownLetter (letter, sourceScale) {
    // Create clone element.
    const el = letter.el.cloneNode(true)
    el.classList.add('step-throws__letter')
    el.classList.remove('js-char')
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = ''
    el.style.left = `${letter.x}px`
    el.style.top = `${letter.y}px`
    el.style.width = `${letter.width}px`
    el.style.height = `${letter.height}px`
    el.style.setProperty('--transform-origin-x', '50%')

    // Append to the throw container.
    letterThrows.container.append(el)

    // Reset the clone's ghost layers to the source scale, so the flight starts from the current visible state.
    const ghosts = [...el.querySelectorAll('.js-ghost')]
    gsap.set(
      ghosts,
      {
        x: 0,
        y: 0,
        scale: sourceScale,
        rotation: 0,
        transformOrigin: `${letter.width * 0.5}px ${letter.height * 0.5}px`,
      }
    )
    return { el, ghosts }
  }

  /**
   * Pick a trajectory and calculate how long it takes to leave the viewport
   */
  function getThrowPhysics (letter) {
    const { velocityRange, angleRange, gravityFactor, rotationRange } = settings.throwing
    const velocity = gsap.utils.random(...velocityRange) * letterThrows.height
    const angle = gsap.utils.random(...angleRange)
    const gravity = letterThrows.height * gravityFactor
    const verticalVelocity = Math.sin(angle * Math.PI / 180) * velocity
    const fallDistance = letterThrows.height + letter.height - letter.y - settings.throwing.windupDistance

    // Solve distance = velocityY * time + 0.5 * gravity * time^2 for the positive time.
    // The extra glyph height keeps the last layer alive until it is fully offscreen.
    const duration = (
      -verticalVelocity + Math.sqrt(verticalVelocity ** 2 + 2 * gravity * fallDistance)
    ) / gravity
    const rotation = gsap.utils.random(...rotationRange)

    return { velocity, angle, gravity, duration, rotation }
  }

  /**
   * Hide the source immediately and restart its scale-in after each throw
   */
  function recoverSourceLetter (source) {
    letterThrows.recoveries.get(source)?.kill()

    // Animate state rather than the DOM: scroll and recovery share one transform writer.
    const tween = gsap.fromTo(
      source,
      {
        recoveryScale: 0,
      },
      {
        recoveryScale: 1,
        duration: settings.throwing.recoveryDuration,
        ease: scaleEase,
        onUpdate: () => renderStepGhosts(source.ghostStates),
        onComplete: () => letterThrows.recoveries.delete(source),
      }
    )
    letterThrows.recoveries.set(source, tween)
  }

  /**
   * Remove ongoing flights when resizing
   */
  function clearLetterThrows () {
    letterThrows.active.forEach(flight => {
      flight.timeline.kill()
      flight.el.remove()
    })
    letterThrows.active.clear()
    restoreSourceLetters()
  }

  /**
   * Restore source scales without interrupting their thrown copies
   */
  function restoreSourceLetters () {
    letterThrows.recoveries.forEach((tween, source) => {
      tween.kill()
      source.recoveryScale = 1
      renderStepGhosts(source.ghostStates)
    })
    letterThrows.recoveries.clear()
  }

})()
