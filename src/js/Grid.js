export default class Grid {
  constructor (canvas) {
    // Elements
    this.canvas = canvas

    // Properties
    this.settings = { cellSize: 24, scrollFactor: 0.05, color: '#9000FF33' }
    this.ctx = null
    this.width = 0
    this.height = 0
    this.ratio = 1

    // Init
    this.resize()
  }

  /**
   * Size the grid canvas
   */
  resize () {
    const { canvas } = this
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1

    // Draw in CSS pixels while keeping the backing bitmap sharp on high-DPI screens.
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    Object.assign(this, { ctx, width, height, ratio })
  }

  /**
   * Draw the grid offset by the smooth scroll position
   */
  draw (scroll) {
    const { ctx, width, height, ratio } = this
    if (!ctx) return

    const { cellSize, scrollFactor, color } = this.settings

    // Start by clearing the canvas to avoid drawing over the previous frame.
    ctx.clearRect(0, 0, width, height)

    // Set up the stroke style and line width for the grid lines.
    ctx.strokeStyle = color
    ctx.lineWidth = 1

    // Begin a new path for the grid lines.
    ctx.beginPath()

    // Calculate the starting positions for the grid lines based on the scroll position and cell size.
    const centeredX = (width - cellSize) * 0.5
    const scrolledY = (height - cellSize) * 0.5 - scroll * scrollFactor
    const startX = centeredX % cellSize
    const startY = ((scrolledY % cellSize + cellSize) % cellSize) - cellSize

    // Align one-pixel strokes to the device pixel grid instead of blurring between pixels.
    const align = value => (Math.round(value * ratio - ratio * 0.5) + ratio * 0.5) / ratio

    // Draw vertical grid lines
    for (let x = startX; x <= width; x += cellSize) {
      const position = align(x)
      ctx.moveTo(position, 0)
      ctx.lineTo(position, height)
    }

    // Draw horizontal grid lines
    for (let y = startY; y <= height; y += cellSize) {
      const position = align(y)
      ctx.moveTo(0, position)
      ctx.lineTo(width, position)
    }

    ctx.stroke()
  }
}
