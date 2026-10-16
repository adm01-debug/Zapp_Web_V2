import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");

test("CI mínimo não simula um scanner de segurança que deixou de executar", () => {
  assert.doesNotMatch(workflow, /^  security:/m);
  assert.doesNotMatch(workflow, /gitleaks-action@|bun audit/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.match(workflow, /^  contents: read$/m);
  const checkouts = workflow.match(/uses: actions\/checkout@[a-f0-9]{40}/g) ?? [];
  const semCredenciais = workflow.match(/persist-credentials: false/g) ?? [];
  assert.ok(checkouts.length > 0);
  assert.equal(semCredenciais.length, checkouts.length);
});
