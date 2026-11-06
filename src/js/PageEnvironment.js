export default class PageEnvironment {
  constructor () {
    this.browserInfo()
    this.initPageIcons()
  }

  /**
   * Switch icons when the page loses focus or becomes hidden
   */
  initPageIcons () {
    const icons = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map(el => {
      const activePath = el.getAttribute('href')
      return { el, activePath, idlePath: activePath.replace('/active/', '/idle/') }
    })

    const updateIcons = (isActive) => {
      icons.forEach(({ el, activePath, idlePath }) => {
        el.setAttribute('href', isActive ? activePath : idlePath)
      })
    }

    window.addEventListener('blur', () => updateIcons(false))
    window.addEventListener('focus', () => updateIcons(!document.hidden))
    document.addEventListener('visibilitychange', () => updateIcons(!document.hidden && document.hasFocus()))
    updateIcons(!document.hidden && document.hasFocus())
  }

  /**
   * Browser info detection for platform-specific tweaks. Adds classes to the <html> element.
   */
  browserInfo () {
    const { userAgent, maxTouchPoints } = window.navigator
    // iPadOS can advertise itself as a Mac when using desktop browsing mode.
    const isIPad = /iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
    const os = [
      ['ios', /iPhone|iPad|iPod/i],
      ['android', /Android/i],
      ['windows', /Windows/i],
      ['chromeos', /CrOS/i],
      ['macos', /Macintosh|Mac OS X/i],
      ['linux', /Linux/i],
    ]
    // Match specific browsers before Chrome and Safari, whose tokens they share.
    const browsers = [
      ['microsoft-edge', /Edg(?:e|A|iOS)?\//i],
      ['opera', /OPR\/|Opera|OPiOS\//i],
      ['samsung-internet', /SamsungBrowser\//i],
      ['firefox', /Firefox\/|FxiOS\//i],
      ['chrome', /Chrome\/|CriOS\//i],
      ['safari', /Version\/.*Safari\//i],
    ]
    const osName = isIPad ? 'ios' : os.find(([, pattern]) => pattern.test(userAgent))?.[0]
    const browserName = browsers.find(([, pattern]) => pattern.test(userAgent))?.[0]
    const isTablet = isIPad || /Tablet|Android(?!.*Mobile)/i.test(userAgent)
    const platform = isTablet ? 'tablet' : /Mobi|iPhone|iPod/i.test(userAgent) ? 'mobile' : 'desktop'

    ;[platform, osName, browserName].filter(Boolean).forEach(name => {
      document.documentElement.classList.add(`is-${name}`)
    })
  }
}
