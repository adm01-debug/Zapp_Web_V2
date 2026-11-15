# Dossiê — claude/fix-ga-resto-docs-regen-20261021-0726 (PR #2144)

- tip `52761c075` · merge-base `d7af7a671` (2026-10-19) · 1 commit: `docs(ga37-ga96-98): deploy edge automatico, regen talkx leve e docs sincronizadas`
- main analisada: `dac285f62` (2026-11-15)
- Propósito: 4 itens de um plano "GA": **GA37** docs dizendo que edge sobe sozinha no push (DEPLOYMENT.md, PR template, CLAUDE.md); **GA96** `talkx-status-regen.yml` leve (filtro de paths, timeout, concurrency única, corpo coerente com auto-merge); **GA97** CODEOWNERS sem "requer aprovação"; **GA98** passo órfão `talkx-current-template-version.test.sh` no db-guard, extrator `nao-e-bug` multi-linha + export em `render-workflow-docs.mjs`, lista de 11 nomes do shim substituída por critério. Teste `docs-deploy-coerencia.unit.mjs` protegendo tudo.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `docs/DEPLOYMENT.md` | **INCORPORADA** (outro texto, mesma intenção) via #2345 `8bfa587b3` | main:56 "Edge Functions são publicadas automaticamente…"; :81 "### 2. Deploy de Edge Functions (automático no push; manual para rollback)"; :83 "Desde 07/10/2026…"; :145; :312 "confirmar a conclusão verde do deploy automático" |
| `.github/PULL_REQUEST_TEMPLATE.md` | **INCORPORADA na linha-chave** (#2345): main:40 "confirmar `deploy-functions`; dispatch manual só para rollback". Resta só o comentário HTML main:37 "Estes dois têm passo obrigatório DEPOIS do merge" (levemente incoerente; branch reescrevia) | `git show origin/main:.github/PULL_REQUEST_TEMPLATE.md` l.37-40 |
| `.github/workflows/db-guard.yml` | **INCORPORADA** de outra forma: o teste roda no passo em lote "Provar contratos shell restantes em serviços descartáveis" (SKIP_DOCKER_SHIM=1) | main:1644 `scripts/db-audit/talkx-current-template-version.test.sh`; script existe (`git ls-tree origin/main scripts/db-audit/talkx-current-template-version.test.sh`) |
| `.github/workflows/notifica-falha-main.yml` | **INCORPORADA** (texto diferente) | main:4 `#   falha: a falha do workflow original fica sem issue de acompanhamento`; :5 `#   avisa: equipe de operacao, por meio da issue criada no repositorio` |
| `CLAUDE.md` | **OBSOLETA**: arquivo virou `@AGENTS.md` (#2762 `effd6b0bb`); conteúdo migrou para `docs/agentes/`. Agendamentos em `docs/agentes/github-ci.md:86-88` (inclui talkx-status-regen `45 7 * * 1`); critério do shim sem lista de nomes em `github-ci.md:98-101`; retificação 07/10 em `docs/agentes/vercel-deploy.md:29`. Afirmação da branch "settings-guard.yml não existe mais" está **errada hoje** (`.github/workflows/settings-guard.yml` existe, cron `15 7 * * *`) | `git ls-tree origin/main .github/workflows/ \| grep settings` |
| `.github/workflows/talkx-status-regen.yml` | **PARCIAL**: bloco `concurrency` duplicado já removido por #2156 `4b9585052` (main:38-40, único). **Faltam**: filtro `paths:` (docs/talkx/**, scripts/talkx/**), `cancel-in-progress: true` (main: `false`), `timeout-minutes: 10`, comentários GA96, corpo do PR (main:98 ainda diz "Revisão humana e checks da PR continuam obrigatórios" enquanto main:161-167 liga `gh pr merge --auto`). **Workflow está `disabled_manually`** (API GitHub, updated 2026-11-15 09:03) → valor baixo | `grep -n 'paths:\|timeout\|cancel' origin/main:…` sem ocorrências |
| `.github/CODEOWNERS` | **PERDIDA (baixo)**: main:9-11 ainda "DEFAULT OWNER / Todas as mudanças requerem aprovação do admin"; contradiz `docs/agentes/github-ci.md:35` ("review obrigatório: nenhum — deliberado") e baseline `required_approving_review_count: 0`. Só comentário; nenhum efeito funcional | `git show origin/main:.github/CODEOWNERS` l.9-12; `git log` do arquivo: só `57c031d01` |
| `scripts/ci/render-workflow-docs.mjs` | **PERDIDA (baixo)**: main sem continuação multi-linha em `extrairNaoEBug` e sem `export`. Hoje **nenhum** bloco `nao-e-bug:` da main tem item de várias linhas (4 blocos: ci, contexto, crm-sync-worker, types-sync; as linhas `#     …` de crm-sync-worker:12-17 ficam fora do bloco, após `# ====`). Sem truncamento real hoje; ganho = robustez + testabilidade | `git grep -c '^# nao-e-bug:' origin/main -- .github/workflows`; `git show origin/main:scripts/ci/render-workflow-docs.mjs \| grep -n export` vazio |
| `scripts/ci/docs-deploy-coerencia.unit.mjs` | **PARCIAL**: main tem versão própria (49 linhas, #2345/#2762) cobrindo GA37 (deploy automático, vercel-deploy.md, template). **Faltam** testes GA96/GA97/GA98 — dependem das lacunas acima (GA98 falharia: main não exporta `extrairNaoEBug`) | `git show origin/main:scripts/ci/docs-deploy-coerencia.unit.mjs` |

## Veredito
**PERDIDA_PARCIAL** — o núcleo (GA37 docs de deploy automático, passo do db-guard, docs do notifica, concurrency única) está na main. Faltam só itens de baixo valor: comentário do CODEOWNERS, filtro/timeout/corpo do talkx-status-regen (workflow hoje desligado), extrator multi-linha + export do render-workflow-docs e os testes correspondentes. Nada toca src/edge/banco. `apagar_branch_seguro=false` (há lacunas não incorporadas, ainda que baixas).

## Lacunas a recuperar (opcional, baixo valor) — hunks essenciais

### 1. `.github/CODEOWNERS` (alinhar comentário à regra "review obrigatório: nenhum")
```diff
-# DEFAULT OWNER
+# DEFAULT OWNER (roteamento de revisão; review obrigatório: nenhum — deliberado,
+# vários agentes com auto-merge; ver docs/agentes/github-ci.md, perímetro do GitHub)
 # ===================
-# Todas as mudanças requerem aprovação do admin
 * @adm01-debug
```
(na branch a referência era "CLAUDE.md seção 0"; hoje o lugar é `docs/agentes/github-ci.md:35`)

### 2. `.github/workflows/talkx-status-regen.yml` (só se o workflow for religado)
```diff
-#   gatilho: push na main; schedule semanal (seg 07:45 UTC); dispatch
+#   gatilho: push na main filtrado (docs/talkx/**, scripts/talkx/**); schedule semanal (seg 07:45 UTC); dispatch
@@ on: push:
     branches: [main]
+    paths:
+      - 'docs/talkx/**'
+      - 'scripts/talkx/**'
@@ concurrency:
   group: talkx-status-regen
-  cancel-in-progress: false
+  cancel-in-progress: true
@@ jobs: regen:
     runs-on: ubuntu-24.04
+    timeout-minutes: 10
@@ corpo do PR (main:98)
-            Revisão humana e checks da PR continuam obrigatórios.
+            Auto-merge (squash) ligado no passo abaixo: mergeia sozinho quando os checks passam.
```
Atenção: manter `fetch-depth: 0` (o regen lê `git log origin/main` em `scripts/talkx/v4-status.mjs`). Se mudar o cabeçalho `docs:`, `docs/ci/README.md` precisa ser regerado (`node scripts/ci/render-workflow-docs.mjs`; CI roda `--check`).

### 3. `scripts/ci/render-workflow-docs.mjs` (continuação multi-linha em `extrairNaoEBug` + export)
```diff
@@ function extrairNaoEBug — após `itens.push({ chave: m[1], descricao: m[2] }); continue;`
+    // Continuacao de item de varias linhas: `#     <texto>` (indentado além do `-`)
+    const cont = /^#\s{5,}(\S.*?)\s*$/.exec(linha);
+    if (cont && itens.length > 0) {
+      itens[itens.length - 1].descricao += ' ' + cont[1];
+      continue;
+    }
@@ após nomeDe()
+export { extrairDocs, extrairNaoEBug };
+if (process.argv[1] === fileURLToPath(import.meta.url)) {
   ... (todo o fluxo executável atual, incl. o `if (process.argv.includes('--check'))` e a escrita do README)
+}
```
Teste para `scripts/ci/docs-deploy-coerencia.unit.mjs` (a versão da main já importa os docs por `new URL`; adicionar):
```js
import { extrairDocs, extrairNaoEBug } from './render-workflow-docs.mjs';
test('GA98: nao-e-bug com continuação compõe a descrição em vez de truncar', () => {
  const texto = ['# docs:','#   gatilho: x','#   prova: y','#   falha: z','#   avisa: w','# nao-e-bug:',
    '#   - item longo: primeira parte','#     segunda parte da mesma descricao','# =====','name: X'].join('\n');
  const itens = extrairNaoEBug(texto);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].chave, 'item longo');
  assert.equal(itens[0].descricao, 'primeira parte segunda parte da mesma descricao');
});
```
Cuidado: com o export, o import no teste não pode mais executar o fluxo (daí o guard `process.argv[1] === fileURLToPath(import.meta.url)`). Rodar `node scripts/ci/render-workflow-docs.mjs --check` depois para garantir que o README continua idêntico.

### 4. Teste GA97 (CODEOWNERS) — só junto com o item 1
```js
test('GA97: CODEOWNERS não exige aprovação', async () => {
  const owners = await ler('../../.github/CODEOWNERS');
  assert.ok(!owners.includes('requerem aprovação'));
  assert.ok(owners.includes('review obrigatório: nenhum'));
});
```

## Não recuperar
- `CLAUDE.md`: arquivo é `@AGENTS.md`; o que a branch escrevia já mora em `docs/agentes/` e parte estava factualmente errada (settings-guard existe).
- `.github/PULL_REQUEST_TEMPLATE.md` l.37: ajuste cosmético do comentário HTML ("Estes dois" → só migration tem passo pós-merge); opcional.
- `docs/DEPLOYMENT.md`, `db-guard.yml`, `notifica-falha-main.yml`: já na main.

## Verificação adversarial

Parecer: **CONFIRMA PERDIDA_PARCIAL** (main `dac285f62`, 2026-11-15). Tentei refutar por dois lados — provar que a main já cobre tudo (→ INCORPORADA) e provar que alguma lacuna é maior do que "baixo". Nenhum dos dois se sustentou.

### As 4 lacunas são reais na main (conferidas uma por uma)
1. `.github/CODEOWNERS` — `git show origin/main:.github/CODEOWNERS` l.9-12: ainda `# DEFAULT OWNER` + `# Todas as mudanças requerem aprovação do admin`. Contradição confirmada em `docs/agentes/github-ci.md:35` ("Branch protection — review obrigatório | nenhum (deliberado: vários agentes com auto-merge)") e em `scripts/ci/github-settings-baseline.json` (`"required_approving_review_count":0`, medido 2026-11-02). Histórico do arquivo: só `57c031d01`.
2. `.github/workflows/talkx-status-regen.yml` — `grep -n` em `origin/main`: nenhuma ocorrência de `paths:` no bloco `on: push`, nenhum `timeout-minutes`, `cancel-in-progress: false` (l.40). Incoerência do corpo confirmada: main:98 "Revisão humana e checks da PR continuam obrigatórios" × main:167 `gh pr merge --auto --squash`. O bloco `concurrency` duplicado que a branch também arrumava já foi resolvido por #2156 (main tem um só) — ou seja, dessa lacuna sobra mesmo só paths/timeout/cancel/corpo.
3. `scripts/ci/render-workflow-docs.mjs` — `grep -n 'export'` em `origin/main` vazio; `extrairNaoEBug` da main (l.77-100) não tem o ramo de continuação `#     <texto>`. Histórico do arquivo: `c9c849285`, `6846cb173` — a continuação/export nunca entrou.
4. `scripts/ci/docs-deploy-coerencia.unit.mjs` — versão da main tem 4 testes, todos GA37/README; nenhum GA96/GA97/GA98.

### Não foram removidas de propósito
`git log -S"docs/talkx/**" -- .github/workflows/talkx-status-regen.yml`, `-S"timeout-minutes"` idem e `-S"export { extrairDocs"` em `scripts/ci/render-workflow-docs.mjs` → **zero commits** em `origin/main`. O conteúdo nunca chegou lá; não há revert nem remoção deliberada.

### Achado adicional: o fechamento da PR #2144 foi por premissa falsa
PR #2144 está `closed`, `merged_at: null`, fechada em 2026-10-31 com o corpo "Fechado: delta líquido contra a main é zero. As mudanças já estão na main. (GF-026)". **Falso** para as 4 lacunas acima (verificadas hoje na main). Ou seja, não houve rejeição de mérito pelo dono — foi encerramento por diff considerado nulo. Isso reforça PERDIDA_PARCIAL em vez de OBSOLETA.

### O que continua encaixando / o que esvazia valor
- O trabalho ainda aplica: `docs/talkx` e `scripts/talkx` existem na main; `extrairNaoEBug`/`extrairDocs` existem; `.github/CODEOWNERS` existe.
- `talkx-status-regen.yml` está `disabled_manually` na API (workflow 372647819, updated 2026-11-15 09:03) → o filtro de paths não economiza nada hoje; só vale se religado.
- Nenhum bloco `nao-e-bug:` da main usa item multi-linha (ci, contexto, crm-sync-worker, types-sync — todos de uma linha) → a continuação multi-linha é robustez, não correção de truncamento real.
- Confirmei também, contra a triagem, que as partes ditas INCORPORADA de fato estão na main: `docs/DEPLOYMENT.md:56,81,83,145,312`; `.github/PULL_REQUEST_TEMPLATE.md:40`; `db-guard.yml:1644` (o script órfão roda no passo em lote com `SKIP_DOCKER_SHIM=1`); `notifica-falha-main.yml:4-5`; `CLAUDE.md` = `@AGENTS.md`.

Conclusão: veredito mantido **PERDIDA_PARCIAL**, valor agregado das 4 lacunas = baixo (nenhuma toca `src/`, edge ou banco). `apagar_branch_seguro=false` enquanto as lacunas não forem recuperadas — os hunks estão todos transcritos acima neste dossiê, então um pacote de recuperação dispensa a branch depois de aplicado.
