/**
 * CodeMirror autocomplete for `[[wikilink]]` targets.
 */

import { autocompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete'

/**
 * Create a wikilink completion source bound to a live note list provider.
 */
export function createWikiLinkAutocomplete(getNoteStems: () => string[]) {
  return autocompletion({
    activateOnTyping: true,
    override: [
      (context: CompletionContext) => {
        const before = context.matchBefore(/\[\[[^\]]*/)
        if (!before || before.text.length < 2) return null

        const query = before.text.slice(2).toLowerCase()
        const stems = getNoteStems()
        const options = (query
          ? stems.filter((stem) => stem.toLowerCase().includes(query))
          : stems
        )
          .slice(0, 30)
          .map((stem) => wikiLinkCompletion(stem))

        if (options.length === 0 && query) return null

        return {
          from: before.from + 2,
          options,
          validFor: /^\[\[[^\]]*$/,
        }
      },
    ],
  })
}

/** @param stem Note filename without `.md`. */
function wikiLinkCompletion(stem: string): Completion {
  return {
    label: stem,
    type: 'text',
    apply: `${stem}]]`,
  }
}
