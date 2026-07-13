import React, { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { BRAND_I18N, PRODUCT_NAME } from '../constants/brand'
import { LOGO_TRACE_OUTLINE, LOGO_TRACE_PATH_LENGTH, LOGO_TRACE_VIEWBOX, STARTUP_SPLASH_CYCLE_S, STARTUP_SPLASH_DRAW_RATIO } from '../constants/logoTrace'
import logoPng from '../assets/logo.png'
import './StartupSplash.css'

interface StartupSplashProps {
  /** Reserved; splash shows brand only — no loading copy. */
  hint?: string
}

/** Brand splash — timing is LOCKED via logoTrace + startupUx (5s cycle, 5.5s enter). Do not add dynamic dur. */
const StartupSplash = memo(({ hint: _hint }: StartupSplashProps) => {
  const { t } = useTranslation('common')

  return (
    <div
      className="startup-splash"
      data-testid="startup-splash"
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        ['--logo-trace-length' as string]: LOGO_TRACE_PATH_LENGTH,
        ['--startup-cycle' as string]: `${STARTUP_SPLASH_CYCLE_S}s`,
      }}
    >
      <div className="startup-splash__frame" aria-hidden>
        <div className="startup-splash__frame-glow" />
        <div className="startup-splash__frame-dot" />
      </div>

      <div className="startup-splash__logo-stage">
        <svg
          className="startup-splash__svg"
          viewBox={`0 0 ${LOGO_TRACE_VIEWBOX} ${LOGO_TRACE_VIEWBOX}`}
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <linearGradient id="startup-gradient-stroke" x1="0" y1="0" x2="128" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="var(--brand-orange-start)" />
              <stop offset="50%" stopColor="var(--brand-orange-mid)" />
              <stop offset="100%" stopColor="var(--brand-teal-end)" />
            </linearGradient>
            <filter id="startup-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="startup-dot-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path
            className="startup-splash__trace"
            d={LOGO_TRACE_OUTLINE}
            stroke="url(#startup-gradient-stroke)"
            strokeDasharray={LOGO_TRACE_PATH_LENGTH}
            strokeDashoffset={LOGO_TRACE_PATH_LENGTH}
          >
            {/* SMIL — same keyTimes/dur as trail-dot animateMotion for pixel-synced draw */}
            <animate
              attributeName="stroke-dashoffset"
              values={`${LOGO_TRACE_PATH_LENGTH};0;0`}
              keyTimes={`0;${STARTUP_SPLASH_DRAW_RATIO};1`}
              dur={`${STARTUP_SPLASH_CYCLE_S}s`}
              repeatCount="1"
              fill="freeze"
              calcMode="linear"
            />
            {/* repeatCount=1: one M lap per 5s — indefinite caused a visible second lap before 5.5s enter */}
            <animate
              attributeName="opacity"
              values="0.4;1;1;0.35"
              keyTimes={`0;${STARTUP_SPLASH_DRAW_RATIO};${STARTUP_SPLASH_DRAW_RATIO + 0.1};1`}
              dur={`${STARTUP_SPLASH_CYCLE_S}s`}
              repeatCount="1"
              fill="freeze"
              calcMode="linear"
            />
          </path>

          <circle className="startup-splash__trail-dot" r="3.5" fill="#fff">
            <animateMotion
              dur={`${STARTUP_SPLASH_CYCLE_S}s`}
              repeatCount="1"
              fill="freeze"
              path={LOGO_TRACE_OUTLINE}
              keyPoints="0;1;1"
              keyTimes={`0;${STARTUP_SPLASH_DRAW_RATIO};1`}
              calcMode="linear"
              rotate="auto"
            />
          </circle>
        </svg>

        <img className="startup-splash__logo-img" src={logoPng} alt="" draggable={false} />
      </div>

      <p className="startup-splash__brand">{PRODUCT_NAME}</p>
      <p className="startup-splash__slogan">{t(BRAND_I18N.sloganShort)}</p>
    </div>
  )
})

StartupSplash.displayName = 'StartupSplash'

export default StartupSplash
