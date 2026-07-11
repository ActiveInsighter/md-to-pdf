import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const validatorPath = path.resolve(process.cwd(), 'scripts', 'validate-workflows.mjs');
const checkoutSha = '9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0';
const setupNodeSha = '49933ea5288caeca8642d1e84afbd3f7d6820020';

function workflow({ checkout = `actions/checkout@${checkoutSha}`, persistCredentials = true, timeout = true, jobEnv = '', setupNode = `actions/setup-node@${setupNodeSha}` } = {}) {
  return `name: Policy fixture
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  validate:
${jobEnv}    runs-on: ubuntu-24.04
${timeout ? '    timeout-minutes: 5\n' : ''}    steps:
      - uses: ${checkout}
${persistCredentials ? '        with:\n          persist-credentials: false\n' : ''}      - uses: ${setupNode}
`;
}

function runValidator(directory) {
  return spawnSync(process.execPath, [validatorPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      WORKFLOW_DIRECTORY: directory,
    },
    encoding: 'utf8',
  });
}

async function runCase({ name, source, expectedStatus, expectedFragments }) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-policy-'));

  try {
    await fs.writeFile(path.join(directory, `${name}.yml`), source, 'utf8');
    const result = runValidator(directory);
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;

    assert.equal(result.error, undefined, `${name}: validator process failed to start`);
    assert.equal(
      result.status,
      expectedStatus,
      `${name}: expected exit ${expectedStatus}, received ${result.status}\n${output}`,
    );

    for (const fragment of expectedFragments) {
      assert.match(output, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${name}: missing output fragment: ${fragment}\n${output}`);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

const cases = [
  {
    name: 'valid',
    source: workflow(),
    expectedStatus: 0,
    expectedFragments: ['Workflow policy validation passed for 1 workflow file(s).'],
  },
  {
    name: 'floating-action',
    source: workflow({ setupNode: 'actions/setup-node@v4' }),
    expectedStatus: 1,
    expectedFragments: ['must be pinned to an immutable commit SHA: actions/setup-node@v4'],
  },
  {
    name: 'checkout-credentials',
    source: workflow({ persistCredentials: false }),
    expectedStatus: 1,
    expectedFragments: ['actions/checkout must set persist-credentials: false'],
  },
  {
    name: 'missing-timeout',
    source: workflow({ timeout: false }),
    expectedStatus: 1,
    expectedFragments: ['timeout-minutes must be a positive integer'],
  },
  {
    name: 'job-secret',
    source: workflow({ jobEnv: '    env:\n      DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}\n' }),
    expectedStatus: 1,
    expectedFragments: ['job-level env must not expose secrets to every step'],
  },
];

for (const testCase of cases) {
  await runCase(testCase);
}

console.log(`Workflow policy regression tests passed: ${cases.length} case(s).`);
