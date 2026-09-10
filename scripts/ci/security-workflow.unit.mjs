import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");

test("security workflow uses a SHA-pinned fail-closed secret scanner", () => {
  assert.match(
    workflow,
    /uses: gitleaks\/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e # v3\.0\.0/u,
  );
  assert.match(workflow, /GITLEAKS_ENABLE_COMMENTS: 'false'/u);
  assert.match(workflow, /GITLEAKS_ENABLE_UPLOAD_ARTIFACT: 'false'/u);
  assert.doesNotMatch(workflow, /! grep -rn/u);
});

test("security workflow fetches history without exposing privileged PR secrets", () => {
  const securitySection = workflow.slice(workflow.indexOf("  security:"));
  assert.match(securitySection, /fetch-depth: 0/u);
  assert.match(securitySection, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/u);
  assert.doesNotMatch(securitySection, /secrets\.DESTINO_URL/u);
});
