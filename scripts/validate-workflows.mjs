import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';

const workflowDirectory = path.resolve(process.cwd(), '.github', 'workflows');
const pinnedCommitPattern = /@[0-9a-f]{40}$/i;
const pinnedContainerPattern = /@sha256:[0-9a-f]{64}$/i;
const secretExpressionPattern = /\$\{\{\s*secrets\./i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function containsSecretExpression(value) {
  if (typeof value === 'string') return secretExpressionPattern.test(value);
  if (Array.isArray(value)) return value.some(containsSecretExpression);
  if (isObject(value)) return Object.values(value).some(containsSecretExpression);
  return false;
}

function isPinnedReference(reference) {
  if (reference.startsWith('./')) return true;
  if (reference.startsWith('docker://')) return pinnedContainerPattern.test(reference);
  return pinnedCommitPattern.test(reference);
}

function checkoutDisablesCredentialPersistence(step) {
  const setting = step.with?.['persist-credentials'];
  return setting === false || setting === 'false';
}

function validateActionReference(reference, location, errors) {
  if (!isPinnedReference(reference)) {
    errors.push(`${location}: external action or reusable workflow must be pinned to an immutable commit SHA: ${reference}`);
  }
}

async function workflowFiles() {
  const entries = await fs.readdir(workflowDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function validateWorkflow(fileName) {
  const errors = [];
  const filePath = path.join(workflowDirectory, fileName);
  const source = await fs.readFile(filePath, 'utf8');
  let workflow;

  try {
    workflow = load(source);
  } catch (error) {
    return [`${fileName}: invalid YAML: ${error instanceof Error ? error.message : String(error)}`];
  }

  if (!isObject(workflow)) return [`${fileName}: workflow root must be a YAML mapping`];
  if (!Object.prototype.hasOwnProperty.call(workflow, 'permissions')) {
    errors.push(`${fileName}: top-level permissions must be declared explicitly`);
  }
  if (containsSecretExpression(workflow.env)) {
    errors.push(`${fileName}: top-level env must not expose repository secrets to every job`);
  }

  const jobs = workflow.jobs;
  if (!isObject(jobs) || Object.keys(jobs).length === 0) {
    errors.push(`${fileName}: workflow must declare at least one job`);
    return errors;
  }

  for (const [jobName, job] of Object.entries(jobs)) {
    const jobLocation = `${fileName} jobs.${jobName}`;
    if (!isObject(job)) {
      errors.push(`${jobLocation}: job must be a YAML mapping`);
      continue;
    }

    if (containsSecretExpression(job.env)) {
      errors.push(`${jobLocation}: job-level env must not expose secrets to every step`);
    }

    if (typeof job.uses === 'string') {
      validateActionReference(job.uses, `${jobLocation}.uses`, errors);
      continue;
    }

    const timeout = job['timeout-minutes'];
    if (!Number.isInteger(timeout) || timeout <= 0) {
      errors.push(`${jobLocation}: timeout-minutes must be a positive integer`);
    }

    if (!Array.isArray(job.steps) || job.steps.length === 0) {
      errors.push(`${jobLocation}: job must declare at least one step`);
      continue;
    }

    job.steps.forEach((step, index) => {
      const stepLocation = `${jobLocation}.steps[${index}]`;
      if (!isObject(step) || typeof step.uses !== 'string') return;

      validateActionReference(step.uses, `${stepLocation}.uses`, errors);
      if (step.uses.startsWith('actions/checkout@') && !checkoutDisablesCredentialPersistence(step)) {
        errors.push(`${stepLocation}: actions/checkout must set persist-credentials: false`);
      }
    });
  }

  return errors;
}

async function main() {
  const files = await workflowFiles();
  const results = await Promise.all(files.map(async (file) => ({ file, errors: await validateWorkflow(file) })));
  const errors = results.flatMap((result) => result.errors);

  if (errors.length > 0) {
    console.error(`Workflow policy validation failed with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`Workflow policy validation passed for ${files.length} workflow file(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
