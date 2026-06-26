import * as os from 'os'

/** Private IPv4 ranges suitable for LAN mobile access. */
function isPrivateIPv4(ip: string): boolean {
  if (ip.startsWith('192.168.')) return true
  if (ip.startsWith('10.')) return true
  const match = /^172\.(\d+)\./.exec(ip)
  if (match) {
    const second = parseInt(match[1], 10)
    return second >= 16 && second <= 31
  }
  return false
}

function isIPv4Family(family: string | number): boolean {
  return family === 'IPv4' || family === 4
}

function isLikelyVirtualInterface(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.includes('virtual') ||
    lower.includes('vmware') ||
    lower.includes('vethernet') ||
    lower.includes('hyper-v') ||
    lower.includes('wsl') ||
    lower.includes('docker') ||
    lower.includes('loopback') ||
    lower.includes('bluetooth') ||
    lower.includes('npcap')
  )
}

/**
 * Returns private IPv4 addresses for active non-virtual interfaces (WiFi/Ethernet first).
 */
export function getLanIPv4Addresses(): string[] {
  const interfaces = os.networkInterfaces()
  const candidates: Array<{ ip: string; score: number }> = []

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs?.length || isLikelyVirtualInterface(name)) continue

    const lower = name.toLowerCase()
    let score = 0
    if (lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('wlan') || lower.includes('无线')) score += 10
    if (lower.includes('ethernet') || lower.includes('eth') || lower.includes('以太网')) score += 8

    for (const addr of addrs) {
      if (!isIPv4Family(addr.family) || addr.internal) continue
      if (!isPrivateIPv4(addr.address)) continue
      candidates.push({ ip: addr.address, score })
    }
  }

  const seen = new Set<string>()
  const ordered = candidates
    .sort((a, b) => b.score - a.score)
    .map((c) => c.ip)
    .filter((ip) => {
      if (seen.has(ip)) return false
      seen.add(ip)
      return true
    })

  return ordered
}
