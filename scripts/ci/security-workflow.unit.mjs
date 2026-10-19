// CI minimo (16/10/2026): o job `security:` (gitleaks + bun audit) foi removido.
// Os tres testes abaixo verificam as invariantes de seguranca que sobraram e
// que continuam valendo no workflow simplificado.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");

// Todos os checkouts do CI devem ter persist-credentials: false para que o
// token do Actions nao vaze nos subprocessos de build/test.
test("all checkout steps disable credential persistence", () => {
  const checkoutUses = workflow.match(/uses: actions\/checkout@[^\n]+/gu) ?? [];
  assert.ok(checkoutUses.length > 0, "nenhum passo checkout encontrado em ci.yml");
  const persists = workflow.match(/persist-credentials: false/gu) ?? [];
  assert.equal(
    persists.length,
    checkoutUses.length,
    `esperado ${checkoutUses.length} ocorrencias de persist-credentials:false, encontrado ${persists.length}`,
  );
});

// DESTINO_URL e a credencial mais sensivel do projeto; jamais pode aparecer em
// ci.yml (workflow publico e de PR) -- nem no env, nem em secrets.
test("DESTINO_URL never appears in the CI workflow", () => {
  assert.doesNotMatch(workflow, /DESTINO_URL/u);
  assert.doesNotMatch(workflow, /secrets\.DESTINO/u);
});

// O unico par de secrets exposto no ci.yml deve ser o par de chaves publicaveis
// do Supabase (usadas so no job build, nunca em contexts privilegiados).
test("only publishable Supabase keys are exposed as secrets in CI", () => {
  // Só expressões reais ${{ secrets.XXX }} — evita falso positivo em comentários
  // que mencionam filenames como "check-pr-workflow-secrets.mjs".
  const secretRefs = [...workflow.matchAll(/\$\{\{\s*secrets\.(\w+)\s*\}\}/gu)].map((m) => m[1]);
  const permitidos = new Set(["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]);
  for (const s of secretRefs) {
    assert.ok(permitidos.has(s), `secret nao permitido em ci.yml: secrets.${s}`);
  }
});
