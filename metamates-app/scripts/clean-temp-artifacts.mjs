#!/usr/bin/env node
/** Remove stale MetaMates E2E / verify temp dirs from %TEMP%. */
import { removeStaleMetamatesTemp } from './lib/remove-temp-path.mjs'

const { removed } = removeStaleMetamatesTemp({ label: 'clean:temp' })
if (removed === 0) {
  console.log('[clean:temp] nothing to remove')
}
