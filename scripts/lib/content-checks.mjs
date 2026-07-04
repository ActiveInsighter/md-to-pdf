import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensureInside, toPosix } from './path-utils.mjs';

function describeCheckTarget(manifest, check) {
  return toPosix(path.join(manifest.rootRel, check.path));
}

async function readCheckedFile(manifest, check) {
  const absolute = ensureInside(manifest.rootDir, path.resolve(manifest.rootDir, check.path), `content_checks.path`);
  const buffer = await fs.readFile(absolute);
  return {
    absolute,
    buffer,
    text: buffer.toString('utf8')
  };
}

export async function validateContentChecks(manifest) {
  if (!manifest.content_checks?.length) return;

  console.log(`\nContent checks: ${manifest.content_checks.length}`);

  for (const check of manifest.content_checks) {
    const label = describeCheckTarget(manifest, check);
    const { buffer, text } = await readCheckedFile(manifest, check);

    if (check.min_bytes != null && buffer.byteLength < check.min_bytes) {
      throw new Error(`Content check failed for ${label}: expected at least ${check.min_bytes} bytes, got ${buffer.byteLength}.`);
    }

    if (check.min_chars != null && text.length < check.min_chars) {
      throw new Error(`Content check failed for ${label}: expected at least ${check.min_chars} characters, got ${text.length}.`);
    }

    if (check.sha256) {
      const actual = crypto.createHash('sha256').update(buffer).digest('hex');
      if (actual !== check.sha256) {
        throw new Error(`Content check failed for ${label}: sha256 mismatch. Expected ${check.sha256}, got ${actual}.`);
      }
    }

    for (const needle of check.must_contain) {
      if (!text.includes(needle)) {
        throw new Error(`Content check failed for ${label}: missing required text ${JSON.stringify(needle)}.`);
      }
    }

    for (const needle of check.must_not_contain) {
      if (text.includes(needle)) {
        throw new Error(`Content check failed for ${label}: forbidden text found ${JSON.stringify(needle)}.`);
      }
    }

    if (check.must_end_with != null && !text.trimEnd().endsWith(check.must_end_with)) {
      throw new Error(`Content check failed for ${label}: file does not end with ${JSON.stringify(check.must_end_with)}.`);
    }

    console.log(`- OK ${label} (${buffer.byteLength} bytes, ${text.length} chars)`);
  }
}
