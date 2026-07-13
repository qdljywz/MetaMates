import { startWindowsSpeech, stopWindowsSpeech } from '../dist-electron/speech/windowsSpeech.cjs'

let gotError = false
const result = await startWindowsSpeech(
  'zh-CN',
  (u) => console.log('transcript', u),
  (err) => {
    gotError = true
    console.error('speech-error', err)
  },
)

console.log('start returned', result)
await new Promise((r) => setTimeout(r, 4000))
console.log('done, gotError=', gotError)
stopWindowsSpeech()
process.exit(gotError || !result.success ? 1 : 0)
