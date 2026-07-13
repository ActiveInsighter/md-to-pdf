import test from 'node:test'
import assert from 'node:assert/strict'
import { documentNameFromMarkdown, markdownFilename, validateAssetsFile, validateMarkdownFile } from '../src/features/pdf-builder/lib/files'

test('file validation keeps extensions and limits centralized', () => {
  assert.equal(validateMarkdownFile(new File(['# ok'], 'note.md')), null)
  assert.match(validateMarkdownFile(new File(['x'], 'note.txt')) || '', /\.md/)
  assert.equal(validateAssetsFile(new File(['zip'], 'assets.zip')), null)
  assert.match(validateAssetsFile(new File(['zip'], 'assets.rar')) || '', /\.zip/)
})

test('document naming keeps task and output source names aligned', () => {
  assert.equal(documentNameFromMarkdown('操作系统第5章.md'), '操作系统第5章')
  assert.equal(markdownFilename('操作系统/第5章'), '操作系统-第5章.md')
})
