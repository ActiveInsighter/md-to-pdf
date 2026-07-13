import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findForbiddenTrackedFiles,
  validateGeneratedFiles,
} from './validate-generated-files.mjs'

test('repository hygiene rejects generated outputs and repository-external toolkits', () => {
  const trackedFiles = [
    'frontend/src/app/App.tsx',
    'dist/output.pdf',
    'frontend/tsconfig.tsbuildinfo',
    'ui-ux-pro-max/SKILL.md',
  ]

  assert.deepEqual(findForbiddenTrackedFiles(trackedFiles), [
    'dist/output.pdf',
    'frontend/tsconfig.tsbuildinfo',
    'ui-ux-pro-max/SKILL.md',
  ])
})

test('repository hygiene accepts source files when ignore rules are present', () => {
  const checked = []
  const errors = validateGeneratedFiles({
    trackedFiles: [
      'frontend/src/app/App.tsx',
      'scripts/build-pdf.mjs',
      'themes/chatgpt-light.css',
    ],
    ignoredPaths: ['dist/example.txt', 'coverage/example.txt'],
    checkIgnored(target) {
      checked.push(target)
      return true
    },
  })

  assert.deepEqual(errors, [])
  assert.deepEqual(checked, ['dist/example.txt', 'coverage/example.txt'])
})

test('repository hygiene reports missing ignore rules', () => {
  const errors = validateGeneratedFiles({
    trackedFiles: [],
    ignoredPaths: ['dist/example.txt'],
    checkIgnored: () => false,
  })

  assert.deepEqual(errors, ['Expected path to be ignored: dist/example.txt'])
})
