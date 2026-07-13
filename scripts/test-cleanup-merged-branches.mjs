import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROTECTED_BRANCH_NAMES,
  branchFromPullRequest,
  decideBranchDeletion,
  shouldCleanupBranch,
} from './cleanup-merged-branches.mjs';

test('allows documented temporary branch prefixes', () => {
  for (const branch of [
    'agent/project-hygiene',
    'feature/project-hygiene',
    'fix/project-hygiene',
    'refactor/project-hygiene',
    'style/project-hygiene',
    'docs/project-hygiene',
    'test/project-hygiene',
  ]) {
    assert.equal(shouldCleanupBranch(branch), true, branch);
  }

  for (const branch of ['codex/project-hygiene', 'queue/user-document', 'release/v1']) {
    assert.equal(shouldCleanupBranch(branch), false, branch);
  }
});

test('never marks protected branches for cleanup', () => {
  assert.deepEqual(PROTECTED_BRANCH_NAMES, ['main', 'master', 'output', 'gh-pages']);
  for (const branch of PROTECTED_BRANCH_NAMES) {
    assert.equal(shouldCleanupBranch(branch), false, branch);
  }
});

test('only accepts pull request branches from the current repository', () => {
  const sameRepository = {
    head: {
      ref: 'agent/project-hygiene',
      repo: { full_name: 'owner/repository' },
    },
  };
  const fork = {
    head: {
      ref: 'agent/project-hygiene',
      repo: { full_name: 'contributor/fork' },
    },
  };
  const missingRepository = { head: { ref: 'agent/project-hygiene' } };

  assert.equal(branchFromPullRequest(sameRepository, 'owner/repository'), 'agent/project-hygiene');
  assert.equal(branchFromPullRequest(fork, 'owner/repository'), null);
  assert.equal(branchFromPullRequest(missingRepository, 'owner/repository'), null);
  assert.equal(branchFromPullRequest({}, 'owner/repository'), null);
});

test('dry-run decisions remain non-destructive and auditable', () => {
  const decision = decideBranchDeletion({
    branch: 'refactor/project-hygiene',
    reason: 'merged pull request #123',
    currentSha: 'abc123',
    expectedSha: 'abc123',
    isDryRun: true,
  });

  assert.deepEqual(decision, {
    branch: 'refactor/project-hygiene',
    status: 'dry-run',
    reason: 'merged pull request #123',
    shouldDelete: false,
    auditMessage: '[dry-run] Would delete refactor/project-hygiene (merged pull request #123)',
  });
});

test('live decisions delete only existing eligible branches after policy checks', () => {
  const missing = decideBranchDeletion({
    branch: 'agent/already-gone',
    reason: 'merged pull request #124',
    currentSha: null,
    expectedSha: 'abc123',
    isDryRun: false,
  });
  const existing = decideBranchDeletion({
    branch: 'agent/project-hygiene',
    reason: 'merged pull request #125',
    currentSha: 'def456',
    expectedSha: 'def456',
    isDryRun: false,
  });

  assert.equal(missing.status, 'missing');
  assert.equal(missing.shouldDelete, false);
  assert.equal(existing.status, 'deleted');
  assert.equal(existing.shouldDelete, true);
  assert.match(existing.auditMessage, /agent\/project-hygiene/);
  assert.match(existing.auditMessage, /#125/);
});

test('never deletes a reused branch whose head no longer matches the merged pull request', () => {
  const changed = decideBranchDeletion({
    branch: 'feature/reused-name',
    reason: 'merged pull request #126',
    currentSha: 'new-head',
    expectedSha: 'merged-head',
    isDryRun: false,
  });
  const unverified = decideBranchDeletion({
    branch: 'feature/missing-head-sha',
    reason: 'merged pull request #127',
    currentSha: 'current-head',
    expectedSha: null,
    isDryRun: false,
  });

  assert.equal(changed.status, 'changed');
  assert.equal(changed.shouldDelete, false);
  assert.match(changed.auditMessage, /expected merged-head, found new-head/);
  assert.equal(unverified.status, 'changed');
  assert.equal(unverified.shouldDelete, false);
});
