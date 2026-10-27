(function () {
  try {
    var raw = localStorage.getItem('metamates-storage')
    var bg = '#18181b'
    var fg = '#fafafa'
    var mode = 'dark'
    var palette = 'paper'
    if (raw) {
      var settings = JSON.parse(raw).settings || {}
      palette = settings.lightPalette === 'cold' ? 'cold' : 'paper'
      var lightBg = palette === 'cold' ? '#fafaf9' : '#f0eeea'
      if (settings.theme === 'light') {
        mode = 'light'
        bg = lightBg
        fg = '#18181b'
      } else if (
        settings.theme === 'system' &&
        window.matchMedia &&
        !window.matchMedia('(prefers-color-scheme: dark)').matches
      ) {
        mode = 'light'
        bg = lightBg
        fg = '#18181b'
      }
    }
    document.documentElement.setAttribute('data-theme', mode)
    if (mode === 'light') {
      document.documentElement.setAttribute('data-light-palette', palette)
    } else {
      document.documentElement.removeAttribute('data-light-palette')
    }
    // Paint the PRESET theme during boot — splash and chrome must match user settings.
    // (Previously forced dark here, which made light-preset users see a black splash + flash.)
    document.documentElement.style.colorScheme = mode
    document.documentElement.style.backgroundColor = bg
    if (document.body) {
      document.body.style.backgroundColor = bg
      document.body.style.color = fg
    }
    var root = document.getElementById('root')
    if (root) root.style.backgroundColor = bg
  } catch (e) {
    /* keep dark default */
  }
})()
