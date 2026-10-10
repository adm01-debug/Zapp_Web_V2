#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDeploymentAttestation } from './manifest-lib.mjs';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--manifest') args.manifestPath = argv[++index];
    else if (key === '--remote') args.remotePath = argv[++index];
    else if (key === '--output') args.outputPath = argv[++index];
    else if (key === '--git-sha') args.gitSha = argv[++index];
    else if (key === '--run-id') args.runId = argv[++index];
    else if (key === '--scope') args.deploymentScope = argv[++index];
    else throw new Error(`Unknown argument: ${key}`);
  }
  for (const required of ['manifestPath', 'remotePath', 'outputPath', 'gitSha', 'runId', 'deploymentScope']) {
    if (!args[required]) throw new Error(`Missing required argument: ${required}`);
  }
  return args;
}

export async function runVerifyRemote(args) {
  const manifest = JSON.parse(await readFile(args.manifestPath, 'utf8'));
  const remoteResponse = JSON.parse(await readFile(args.remotePath, 'utf8'));
  const attestation = buildDeploymentAttestation({ manifest, remoteResponse, ...args });
  await writeFile(args.outputPath, `${JSON.stringify(attestation, null, 2)}\n`, 'utf8');
  return attestation;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const attestation = await runVerifyRemote(args);
  console.log(
    `Remote manifest OK: ${attestation.function_count} functions, ` +
    `source=${attestation.source_manifest_sha256}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
