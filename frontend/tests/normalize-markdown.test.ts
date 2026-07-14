import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMarkdownForPdf } from '../src/features/pdf-builder/lib/normalizeMarkdown'

const fileCitation = '\uE200filecite\uE202turn0file2\uE202L10-L20\uE201'

test('removes ChatGPT file citations from normal Markdown text', () => {
  const result = normalizeMarkdownForPdf(`# 标题\n\n正文内容。${fileCitation}\n`)

  assert.equal(result.text, '# 标题\n\n正文内容。\n')
  assert.equal(result.removedArtifactCount, 1)
})

test('removes broken tofu-style file citation text', () => {
  const result = normalizeMarkdownForPdf('正文 □filecite□turn0file2□ 后续。')

  assert.equal(result.text, '正文  后续。')
  assert.equal(result.removedArtifactCount, 1)
})

test('preserves citation-looking text inside inline and fenced code', () => {
  const markdown = `正文 ${fileCitation}\n\n\`${fileCitation}\`\n\n\`\`\`text\n${fileCitation}\n\`\`\``
  const result = normalizeMarkdownForPdf(markdown)

  assert.equal(result.removedArtifactCount, 1)
  assert.match(result.text, new RegExp(`\\\`${fileCitation}\\\``))
  assert.match(result.text, new RegExp(`\\\`\\\`\\\`text\\n${fileCitation}`))
})

test('normalizes line endings and trims excessive blank lines', () => {
  const result = normalizeMarkdownForPdf('\uFEFF# 标题\r\n\r\n\r\n正文\u2028下一行')

  assert.equal(result.text, '# 标题\n\n正文\n下一行')
})
