import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'

function runPython(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['scripts/prepare-supabase-input.py', ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`prepare-supabase-input.py exited with ${code}: ${stderr}`))
    })
  })
}

test('source preparation restores copied math delimiters without touching code or links', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'md-to-pdf-prepare-'))
  try {
    const input = path.join(root, 'input.md')
    const work = path.join(root, 'work')
    await writeFile(input, `# 复制公式测试

行内变量 (N)、(M)、(k)，表达式 (\\frac{N}{M})。

[
p=\\left\\lceil\\log_k r\\right\\rceil
]

普通说明 (这是注释) 保持不变，[链接](https://example.com/a_(b)) 保持不变。

\`(code)\`

\`\`\`text
[
p=\\left\\lceil\\log_k r\\right\\rceil
]
(k)
\`\`\`
`, 'utf8')

    await runPython([
      '--markdown', input,
      '--work-dir', work,
      '--max-markdown-bytes', '10485760',
    ])

    const prepared = await readFile(path.join(work, 'input.md'), 'utf8')
    assert.match(prepared, /行内变量 \\(N\\)、\\\(M\\\)、\\\(k\\\)/)
    assert.match(prepared, /表达式 \\(\\frac\{N\}\{M\}\\\)/)
    assert.match(prepared, /\\\[\np=\\left\\lceil\\log_k r\\right\\rceil\n\\\]/)
    assert.match(prepared, /普通说明 \(这是注释\) 保持不变/)
    assert.match(prepared, /\[链接\]\(https:\/\/example\.com\/a_\(b\)\)/)
    assert.match(prepared, /`\(code\)`/)
    assert.match(prepared, /```text\n\[\np=\\left\\lceil\\log_k r\\right\\rceil\n\]\n\(k\)\n```/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
