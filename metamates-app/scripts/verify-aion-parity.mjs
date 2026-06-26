#!/usr/bin/env node
/**
 * AionUi parity verification — golden ACP fixtures + compiled module smoke.
 * Does not replace verify:functional (live CLI); catches protocol regressions early.
 */
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const results = []

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  console.log('\n══ AionUi 协议对齐验证 (golden fixtures) ══\n')

  try {
    execSync('npm run electron:compile', { cwd: ROOT, stdio: 'pipe', encoding: 'utf-8', timeout: 120_000 })
    record('构建', 'electron:compile', true)
  } catch (e) {
    record('构建', 'electron:compile', false, e.message)
    process.exit(1)
  }

  try {
    execSync(
      'npx vitest run src/test/acpGoldenFixtures.test.ts src/test/acpPermission.test.ts src/test/acpModels.test.ts src/test/promptTimeout.test.ts src/test/acpErrors.test.ts src/test/promptTimeout.test.ts',
      { cwd: ROOT, stdio: 'inherit', encoding: 'utf-8', timeout: 120_000 },
    )
    record('单测', 'ACP golden + permission + models + errors', true)
  } catch (e) {
    record('单测', 'ACP golden + permission + models + errors', false, e.message)
    process.exit(1)
  }

  const { pathToFileURL } = await import('url')
  const perm = await import(pathToFileURL(path.join(ROOT, 'dist-electron/shared/acpPermission.cjs')).href)
  const models = await import(pathToFileURL(path.join(ROOT, 'dist-electron/shared/acpModels.cjs')).href)

  const codebuddyOpts = [
    { kind: 'allow_always', optionId: 'allow_always' },
    { kind: 'allow_once', optionId: 'allow' },
    { kind: 'reject_once', optionId: 'reject' },
  ]
  const picked = perm.pickAllowPermissionOption(codebuddyOpts)
  record('运行时', 'CodeBuddy permission → allow', picked === 'allow', picked)

  const gemini = models.normalizeAcpModels({
    availableModels: [{ modelId: 'auto', name: 'Auto' }],
    currentModelId: 'auto',
  })
  record('运行时', 'Gemini availableModels', gemini.models[0]?.id === 'auto', gemini.models[0]?.id)

  console.log('\n══ 结果 ══')
  const failed = results.filter((r) => !r.ok)
  console.log(`${results.length - failed.length}/${results.length} 通过`)
  if (failed.length) {
    for (const f of failed) console.log(`  ❌ ${f.name}: ${f.detail}`)
    process.exit(1)
  }
  console.log('\n提示: 功能实测请运行 npm run verify:functional')
  console.log('提示: Electron UI 写盘 E2E 请运行 RUN_AGENT_E2E=1 npm run test:e2e\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
