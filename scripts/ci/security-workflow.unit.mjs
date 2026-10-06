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

// R2-INF-009: `bun audit` sai com 1 tanto para advisory quanto para falha de
// registry; neutralizar o status com `|| true` sem preserva-lo deixava o gate
// decidir so pelo texto. O passo informativo guarda o codigo do coletor e o
// gate bloqueante o consome (o relatorio continua sendo o que decide).
test("security workflow preserves the dependency collector exit status", () => {
  const securitySection = workflow.slice(workflow.indexOf("  security:"));
  assert.match(securitySection, /bun audit --audit-level=low > audit-report\.txt 2>&1 \|\| status=\$\?/u);
  assert.match(securitySection, /echo "\$status" > audit-status\.txt/u);
  assert.match(
    securitySection,
    /audit-prod\.mjs --level high --input audit-report\.txt --status audit-status\.txt/u,
  );
});
