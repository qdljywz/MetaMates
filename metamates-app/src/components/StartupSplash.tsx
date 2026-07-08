import React, { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { BRAND_I18N, PRODUCT_NAME } from '../constants/brand'
import { LOGO_TRACE_OUTLINE, LOGO_TRACE_PATH_LENGTH, LOGO_TRACE_VIEWBOX } from '../constants/logoTrace'
import logoPng from '../assets/logo.png'
import './StartupSplash.css'

/** Closed motion path for the traveling dot (outline + close). */
const LOGO_TRACE_MOTION = `${LOGO_TRACE_OUTLINE} Z`

interface StartupSplashProps {
  /** Reserved; splash shows brand only — no loading copy. */
  hint?: string
}

const StartupSplash = memo(({ hint: _hint }: StartupSplashProps) => {
  const { t } = useTranslation('common')

  return (
    <div
      className="startup-splash"
      data-testid="startup-splash"
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{ ['--logo-trace-length' as string]: LOGO_TRACE_PATH_LENGTH }}
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
              <stop offset="0%" stopColor="#ffb347" />
              <stop offset="45%" stopColor="#e85d4c" />
              <stop offset="55%" stopColor="#5eead4" />
              <stop offset="100%" stopColor="#1e3a8a" />
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
            pathLength={LOGO_TRACE_PATH_LENGTH}
            stroke="url(#startup-gradient-stroke)"
          />

          <circle className="startup-splash__trail-dot" r="3.5" fill="#fff">
            <animateMotion
              dur="5s"
              repeatCount="indefinite"
              path={LOGO_TRACE_MOTION}
              keyPoints="0;1"
              keyTimes="0;1"
              calcMode="linear"
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
