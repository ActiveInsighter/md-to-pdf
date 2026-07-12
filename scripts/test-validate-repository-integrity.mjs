import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { validateRepositoryIntegrity } from './validate-repository-integrity.mjs'

async function createFixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'repository-integrity-'))
  await mkdir(path.join(root, 'docs', 'nested'), { recursive: true })
  await mkdir(path.join(root, 'fixtures'), { recursive: true })
  await Promise.all([
    writeFile(
      path.join(root, 'README.md'),
      [
        '# Project',
        '',
        '[Service docs](docs/service.md)',
        '![Fixture](fixtures/example.svg)',
        '[Section](#project)',
        '[External](https://example.com)',
        '',
        '```md',
        '[Example only](docs/not-a-real-file.md)',
        '```',
        '',
      ].join('\n'),
    ),
    writeFile(path.join(root, 'docs', 'service.md'), '[Nested](nested/details.md)\n'),
    writeFile(path.join(root, 'docs', 'nested', 'details.md'), '# Details\n'),
    writeFile(path.join(root, 'fixtures', 'example.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n'),
  ])
  return root
}

const REQUIRED_PATHS = [
  'README.md',
  'docs/service.md',
  'docs/nested/details.md',
  'fixtures/example.svg',
]

async function withFixture(callback) {
  const root = await createFixtureRoot()
  try {
    await callback(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('accepts required paths and valid local Markdown links', async () => {
  await withFixture(async (root) => {
    assert.deepEqual(
      await validateRepositoryIntegrity({
        root,
        requiredPaths: REQUIRED_PATHS,
        markdownRoots: ['README.md', 'docs'],
      }),
      [],
    )
  })
})

test('reports missing required repository paths', async () => {
  await withFixture(async (root) => {
    const errors = await validateRepositoryIntegrity({
      root,
      requiredPaths: [...REQUIRED_PATHS, 'scripts/missing.mjs'],
      markdownRoots: ['README.md', 'docs'],
    })
    assert.ok(errors.includes('Missing required repository path: scripts/missing.mjs'))
  })
})

test('reports broken links from README and nested docs', async () => {
  await withFixture(async (root) => {
    await writeFile(path.join(root, 'README.md'), '[Missing](docs/missing.md)\n')
    await writeFile(path.join(root, 'docs', 'service.md'), '[Missing nested](nested/missing.md)\n')

    const errors = await validateRepositoryIntegrity({
      root,
      requiredPaths: REQUIRED_PATHS,
      markdownRoots: ['README.md', 'docs'],
    })
    assert.ok(errors.includes('README.md: broken local link: docs/missing.md'))
    assert.ok(errors.includes('docs/service.md: broken local link: nested/missing.md'))
  })
})

test('rejects local links that escape the repository root', async () => {
  await withFixture(async (root) => {
    await writeFile(path.join(root, 'docs', 'service.md'), '[Outside](../../outside.md)\n')

    const errors = await validateRepositoryIntegrity({
      root,
      requiredPaths: REQUIRED_PATHS,
      markdownRoots: ['README.md', 'docs'],
    })
    assert.ok(errors.includes('docs/service.md: local link escapes repository root: ../../outside.md'))
  })
})
