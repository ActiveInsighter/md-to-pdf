import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  loadManifest,
  outputBaseForManifest,
  resolveJobInputs,
  resolveManifestTarget
} from './lib/manifest.mjs';
import { validateContentChecks } from './lib/content-checks.mjs';
import {
  ensureInside,
  rewriteMarkdownResourcePaths,
  toPosix
} from './lib/path-utils.mjs';

const projectRoot = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const target = args.find((arg) => !arg.startsWith('--'));

function runNode(script, scriptArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...scriptArgs], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

function buildPdfArgs(inputRel, outputRel, theme) {
  return [inputRel, outputRel, '--theme', theme || 'chatgpt-light'];
}

function outputPathForSingle(manifest, job, inputPath, inputCount, outputBase) {
  if (inputCount === 1 && job.output) {
    return ensureInside(outputBase, path.resolve(outputBase, job.output), `${job.id}.output`);
  }

  const outputDir = job.output_dir ?? job.id;
  const filename = `${path.basename(inputPath, path.extname(inputPath))}.pdf`;
  return ensureInside(outputBase, path.resolve(outputBase, outputDir, filename), `${job.id}.output_dir`);
}

function outputPathForMerge(job, outputBase) {
  const output = job.output ?? `${job.id}.pdf`;
  return ensureInside(outputBase, path.resolve(outputBase, output), `${job.id}.output`);
}

async function writeCombinedMarkdown(manifest, job, inputFiles) {
  const combinedPath = path.resolve(projectRoot, '.tmp', 'combined', manifest.year, manifest.month, manifest.day, `${job.id}.md`);
  await fs.mkdir(path.dirname(combinedPath), { recursive: true });

  const sections = [];
  if (job.title && job.add_title !== false) {
    sections.push(`# ${job.title}\n`);
  } else if (manifest.title && job.add_title !== false) {
    sections.push(`# ${manifest.title}\n`);
  }

  for (const [index, inputFile] of inputFiles.entries()) {
    if (index > 0 && job.page_break !== false) {
      sections.push('<div class="page-break"></div>\n');
    }

    const sourceRel = toPosix(path.relative(projectRoot, inputFile));
    const raw = await fs.readFile(inputFile, 'utf8');
    const rewritten = rewriteMarkdownResourcePaths(raw, inputFile, combinedPath);
    sections.push(`<!-- source: ${sourceRel} -->\n\n${rewritten.trim()}\n`);
  }

  await fs.writeFile(combinedPath, `${sections.join('\n')}\n`, 'utf8');
  return combinedPath;
}

async function buildManifest(manifestPath) {
  const manifest = await loadManifest(manifestPath, projectRoot);
  await validateContentChecks(manifest);

  const outputBase = outputBaseForManifest(manifest, projectRoot);
  await fs.mkdir(outputBase, { recursive: true });

  const results = [];
  console.log(`Manifest: ${manifest.manifestRel}`);
  console.log(`Date: ${manifest.date}`);
  console.log(`Theme: ${manifest.theme}`);

  for (const job of manifest.jobs) {
    const inputs = await resolveJobInputs(manifest, job);
    console.log(`\nJob ${job.id} (${job.type})`);
    console.log(`Theme: ${job.theme}`);
    console.log(`Inputs: ${inputs.map((file) => toPosix(path.relative(projectRoot, file))).join(', ')}`);

    if (job.type === 'single') {
      for (const inputFile of inputs) {
        const outputPath = outputPathForSingle(manifest, job, inputFile, inputs.length, outputBase);
        const outputRel = toPosix(path.relative(projectRoot, outputPath));
        console.log(`Build single: ${toPosix(path.relative(projectRoot, inputFile))} -> ${outputRel}`);

        if (!dryRun) {
          await runNode('scripts/build-pdf.mjs', buildPdfArgs(toPosix(path.relative(projectRoot, inputFile)), outputRel, job.theme));
        }

        results.push({ job: job.id, type: job.type, theme: job.theme, input: toPosix(path.relative(projectRoot, inputFile)), output: outputRel });
      }
      continue;
    }

    if (job.type === 'merge') {
      const outputPath = outputPathForMerge(job, outputBase);
      const outputRel = toPosix(path.relative(projectRoot, outputPath));
      const combinedPath = await writeCombinedMarkdown(manifest, job, inputs);
      const combinedRel = toPosix(path.relative(projectRoot, combinedPath));

      console.log(`Build merged: ${combinedRel} -> ${outputRel}`);

      if (!dryRun) {
        await runNode('scripts/build-pdf.mjs', buildPdfArgs(combinedRel, outputRel, job.theme));
      }

      results.push({
        job: job.id,
        type: job.type,
        theme: job.theme,
        inputs: inputs.map((file) => toPosix(path.relative(projectRoot, file))),
        combined: combinedRel,
        output: outputRel
      });
    }
  }

  return { manifest: manifest.manifestRel, root: manifest.rootRel, date: manifest.date, theme: manifest.theme, consume: manifest.consume, results };
}

async function main() {
  const manifestPath = await resolveManifestTarget(target, projectRoot);
  const summary = await buildManifest(manifestPath);
  console.log(`\nBuilt ${summary.results.length} output(s) from ${summary.manifest}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
