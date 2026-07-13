/**
 * Zero-dependency boot splash for packaged cold start.
 * Loaded via data: URL before the main Vite bundle — paints in <100ms.
 */
export function buildInstantBootSplashHtml(): string {
  const cycleS = 5
  const drawRatio = 0.82
  const pathD =
    'M 119 5.3 L 123 5.3 L 124 6.8 L 124 101.3 L 123 102.8 L 103.5 122.8 L 100.5 122.8 L 100.5 99.3 L 99.5 98.8 L 76 122.8 L 73.5 122.8 L 73.5 68.8 L 73 68.3 L 66 74.3 L 64.5 74.8 L 55.5 67.3 L 55 67.8 L 55 122.8 L 20 122.8 L 4 105.3 L 4 10.8 L 4.5 9.8 L 5.5 8.8 L 10 7.3 L 13 7.3 L 65.5 36.8 L 104.5 13.3 L 118.5 5.8'

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="color-scheme" content="dark"/>
<title>MetaMates</title>
<style>
  html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#18181b;color:#fafafa;font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  #boot-splash{--startup-cycle:${cycleS}s;position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(ellipse 80% 60% at 50% 45%,#1f1f24 0%,#18181b 55%,#0f0f12 100%)}
  #boot-splash .boot-frame{position:absolute;inset:20px;pointer-events:none;border-radius:12px;border:1px solid rgba(255,255,255,.04);box-shadow:inset 0 0 40px rgba(255,122,0,.03)}
  #boot-splash .boot-frame-dot{position:absolute;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:#fff;box-shadow:0 0 8px 2px rgba(255,140,40,.95),0 0 18px 6px rgba(0,212,196,.45);animation:boot-border-walk var(--startup-cycle) linear infinite}
  @keyframes boot-border-walk{0%{top:0;left:0}25%{top:0;left:100%}50%{top:100%;left:100%}75%{top:100%;left:0}100%{top:0;left:0}}
  #boot-splash .boot-logo-stage{position:relative;width:min(168px,42vw);height:min(168px,42vw)}
  #boot-splash .boot-svg{width:100%;height:100%;overflow:visible}
  #boot-splash .boot-trace{fill:none;stroke-width:2.2;filter:url(#boot-glow)}
  #boot-splash .boot-brand{margin:28px 0 0;font-size:15px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:rgba(250,250,250,.88);animation:boot-brand-pulse var(--startup-cycle) ease-out infinite}
  #boot-splash .boot-slogan{margin:8px 0 0;font-size:12px;color:rgba(212,212,216,.82);letter-spacing:.04em;animation:boot-brand-pulse var(--startup-cycle) ease-out infinite}
  @keyframes boot-brand-pulse{0%,72%{opacity:.45}86%,100%{opacity:1}}
</style>
</head>
<body>
<div id="boot-splash" role="status" aria-live="polite" aria-busy="true">
  <div class="boot-frame" aria-hidden="true"><div class="boot-frame-dot"></div></div>
  <div class="boot-logo-stage">
    <svg class="boot-svg" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="boot-gradient-stroke" x1="0" y1="0" x2="128" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#ff8c28"/>
          <stop offset="50%" stop-color="#ff7a00"/>
          <stop offset="100%" stop-color="#00d4c4"/>
        </linearGradient>
        <filter id="boot-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path class="boot-trace" d="${pathD}" stroke="url(#boot-gradient-stroke)" stroke-dasharray="612" stroke-dashoffset="612">
        <animate attributeName="stroke-dashoffset" values="612;0;0" keyTimes="0;${drawRatio};1" dur="${cycleS}s" repeatCount="indefinite" calcMode="linear"/>
        <animate attributeName="opacity" values="0.4;1;1;0.35" keyTimes="0;${drawRatio};0.92;1" dur="${cycleS}s" repeatCount="indefinite" calcMode="linear"/>
      </path>
      <circle r="3.5" fill="#fff">
        <animateMotion dur="${cycleS}s" repeatCount="indefinite" path="${pathD}" keyPoints="0;1;1" keyTimes="0;${drawRatio};1" calcMode="linear" rotate="auto"/>
      </circle>
    </svg>
  </div>
  <p class="boot-brand">MetaMates</p>
  <p class="boot-slogan">灵感仓库 · 思考引擎</p>
</div>
</body>
</html>`
}

export function instantBootSplashDataUrl(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildInstantBootSplashHtml())}`
}
