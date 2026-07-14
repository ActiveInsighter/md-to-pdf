export type MarkdownNormalizationResult = {
  text: string
  removedArtifactCount: number
}

const CHATGPT_CONTENT_REFERENCE_RE = /\uE200(?:filecite|cite)\uE202[^\uE201\r\n]*\uE201/gu
const CHATGPT_BROKEN_FILECITE_RE = /[□�]\s*filecite\s*[□�]\s*turn\d+file\d+(?:\s*[□�]\s*L\d+(?:-L?\d+)?)?\s*[□�]?/giu
const PROTECTED_MARKDOWN_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g

function stripChatGptArtifacts(segment: string): { text: string; removed: number } {
  let removed = 0
  const replaceArtifact = () => {
    removed += 1
    return ''
  }

  const text = segment
    .replace(CHATGPT_CONTENT_REFERENCE_RE, replaceArtifact)
    .replace(CHATGPT_BROKEN_FILECITE_RE, replaceArtifact)
    .replace(/[\u200B\u200C\u200D\u2060]/gu, '')
    .replace(/[ \t]+([，。；：！？,.!?;:])/gu, '$1')

  return { text, removed }
}

/**
 * Cleans text copied from ChatGPT before it is uploaded as Markdown.
 *
 * ChatGPT file citations use private-use delimiters such as
 * `\uE200filecite\uE202turn0file2\uE201`. Those delimiters are not part of
 * Markdown and become tofu squares in Chromium/PDF. The normalizer removes
 * those references outside fenced and inline code, while preserving the code
 * exactly as the user pasted it.
 */
export function normalizeMarkdownForPdf(markdown: string): MarkdownNormalizationResult {
  const normalizedInput = String(markdown ?? '')
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/gu, '\n')

  let removedArtifactCount = 0
  const parts = normalizedInput.split(PROTECTED_MARKDOWN_RE)
  const text = parts
    .map((part) => {
      if (/^(?:```|~~~|`)/u.test(part)) return part
      const normalized = stripChatGptArtifacts(part)
      removedArtifactCount += normalized.removed
      return normalized.text
    })
    .join('')
    .replace(/[ \t]+$/gmu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()

  return {
    text: text ? `${text}\n` : '',
    removedArtifactCount,
  }
}
