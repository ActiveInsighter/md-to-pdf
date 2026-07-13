import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'

function runPython(args) {
  return new Promise((resolve, reject) => {
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
    const child = spawn(python, ['scripts/prepare-supabase-input.py', ...args], {
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

test('source preparation preserves pasted Markdown byte-for-byte', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'md-to-pdf-prepare-'))
  try {
    const input = path.join(root, 'input.md')
    const work = path.join(root, 'work')
    const source = `# 原文保留与公式测试

普通括号 (N)、(这是注释) 和链接 [示例](https://example.com/a_(b)) 必须保持原样。

行内公式：\\(F'(x)=f(x)\\)。

\\[
\\boxed{F'(x)=f\\bigl(\\beta(x)\\bigr)\\beta'(x)-f\\bigl(\\alpha(x)\\bigr)\\alpha'(x)}
\\]

$$
\\begin{aligned}
F'(x)&=\\sqrt{\\ln(1+x)}\\,\\mathrm e^{\\ln(1+x)}\\frac{1}{1+x}\\\\
&\\quad-\\sqrt{2x}\\,\\mathrm e^{2x}\\cdot 2
\\end{aligned}
$$

\`(code)\`

\`\`\`text
F'(x) and \\(x\\)
\`\`\`
`
    await writeFile(input, source, 'utf8')

    await runPython([
      '--markdown', input,
      '--work-dir', work,
      '--max-markdown-bytes', '10485760',
    ])

    const prepared = await readFile(path.join(work, 'input.md'), 'utf8')
    assert.equal(prepared, source)
    assert.ok(prepared.includes("F'(x)"))
    assert.ok(!prepared.includes("F'\\(x\\)"))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
