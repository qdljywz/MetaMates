(function () {
  try {
    var raw = localStorage.getItem('metamates-storage')
    var bg = '#18181b'
    var mode = 'dark'
    var palette = 'paper'
    var boot = document.documentElement.hasAttribute('data-boot')
    if (raw) {
      var settings = JSON.parse(raw).settings || {}
      palette = settings.lightPalette === 'cold' ? 'cold' : 'paper'
      var lightBg = palette === 'cold' ? '#fafaf9' : '#f0eeea'
      if (settings.theme === 'light') {
        mode = 'light'
        bg = lightBg
      } else if (
        settings.theme === 'system' &&
        window.matchMedia &&
        !window.matchMedia('(prefers-color-scheme: dark)').matches
      ) {
        mode = 'light'
        bg = lightBg
      }
    }
    document.documentElement.setAttribute('data-theme', mode)
    if (mode === 'light') {
      document.documentElement.setAttribute('data-light-palette', palette)
    }
    // Keep dark chrome while #boot-splash covers the window (avoids cream/white flash).
    var paint = boot ? '#18181b' : bg
    document.documentElement.style.backgroundColor = paint
    if (document.body) document.body.style.backgroundColor = paint
  } catch (e) {
    /* keep dark default */
  }
})()
