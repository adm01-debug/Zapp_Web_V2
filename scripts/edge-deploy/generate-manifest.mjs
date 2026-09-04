#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDeploymentManifest, serializeManifest } from './manifest-lib.mjs';

function parseArgs(argv) {
  const args = { output: 'supabase/deployment-manifest.json', check: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output') args.output = argv[++index];
    else if (argv[index] === '--check') args.check = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return args;
}

export async function runGenerateManifest({ repoRoot, output, check }) {
  const manifest = await buildDeploymentManifest({ repoRoot });
  const serialized = serializeManifest(manifest);
  const outputPath = path.resolve(repoRoot, output);

  if (check) {
    const committed = await readFile(outputPath, 'utf8').catch(() => '');
    if (committed !== serialized) {
      throw new Error(`Deployment manifest is stale: ${output}. Run generate-manifest.mjs.`);
    }
    return manifest;
  }

  await writeFile(outputPath, serialized, 'utf8');
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await runGenerateManifest({ repoRoot: process.cwd(), ...args });
  console.log(
    `Edge manifest OK: ${manifest.summary.function_count} functions, ` +
    `${manifest.summary.source_file_count} source files, sha256=${manifest.manifest_sha256}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
