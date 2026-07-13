import assert from 'node:assert/strict'
import test from 'node:test'
import {
  documentNameFromMarkdown,
  inferMarkdownDocumentName,
  markdownFilename,
  markdownSourceToFile,
  validateAssetsFile,
  validateMarkdownFile,
} from '../src/features/pdf-builder/lib/files'

test('file validation keeps extensions and limits centralized', () => {
  assert.equal(validateMarkdownFile(new File(['# ok'], 'note.md')), null)
  assert.match(validateMarkdownFile(new File(['x'], 'note.txt')) || '', /\.md/)
  assert.equal(validateAssetsFile(new File(['zip'], 'assets.zip')), null)
  assert.match(validateAssetsFile(new File(['zip'], 'assets.rar')) || '', /\.zip/)
})

test('Markdown file sources keep the default basename for PDF naming', () => {
  const source = new File(['# Notes'], 'study-notes.md', { type: 'text/markdown', lastModified: 123 })
  const converted = markdownSourceToFile({ kind: 'file', file: source }, documentNameFromMarkdown(source.name))
  assert.equal(converted.name, 'study-notes.md')
  assert.equal(converted.lastModified, 123)
})

test('Pasted Markdown becomes a Windows-safe file named from its highest-level heading', async () => {
  const markdown = '### Intro\n\n# 操作系统：进程/线程*总结?\n\n正文'
  const documentName = inferMarkdownDocumentName(markdown)
  const converted = markdownSourceToFile({ kind: 'text', text: markdown, filename: 'ignored.md' }, documentName)
  assert.equal(documentName, '操作系统：进程/线程总结?')
  assert.equal(converted.name, '操作系统：进程-线程总结-.md')
  assert.equal(await converted.text(), markdown)
})

test('Custom document names are normalized to safe Markdown filenames', () => {
  assert.equal(markdownFilename(' A/B:C*D?E"F<G>H|I '), 'A-B-C-D-E-F-G-H-I.md')
})
