# claude/feat-talkx-x003-demo-fixtures-261101-2143 (PR #2520) — OBSOLETA

- `ref`: `origin/claude/feat-talkx-x003-demo-fixtures-261101-2143` · tip `f9ca26332` · merge_base `1252bb5a4` (2026-11-01, 7 commits à frente)
- Triagem anterior (2026-11-08) marcou #2520 como OBSOLETA — **confirmado de forma independente** abaixo.

## Propósito da branch

Commits (`git log --format='%h %s' 1252bb5a4..origin/claude/...`):

```
b29331d17 feat(talkx): criar base de demonstração determinística das 17 telas (X003)
30c4dede9 fix(e2e): corrigir talkx-demo.ts, fixture e spec da tela 01 (X003)
d28b7cf30 fix: corrige 3 achados de code review no X003
2128a8bbe fix: fortalece assertions no talkx-demo.spec.ts (MEDIUM qodo)
067742e49 fix: restaura assertion de KPI no talkx-demo.spec.ts (HIGH qodo)
b2527631d fix: substituir em-dashes por -- em talkx-demo.ts (parser Playwright)
f9ca26332 fix: restaura assertion do valor KPI 24 em talkx-demo.spec.ts (HIGH qodo)
```

Apesar do título "criar base ... das 17 telas", a base **já existia no merge_base**: as 17 fixtures
`NN-nome.json`, o `talkx-demo.ts` (com `mockTalkXBackend`, `mockTalkXVisual`, `fixtureDaTela`,
`FixtureVaziaError`) e o `e2e/talkx-visual.spec.ts` estão em `1252bb5a4` e continuam em `origin/main`
(`git ls-tree -r --name-only origin/main -- e2e/fixtures/talkx-demo` → 17 arquivos `01-`…`17-`).

O delta real da branch (`git diff --stat 1252bb5a4 <tip>`: 137 inserções, 1018 deleções) é:
1. trocar em-dash (`—`) por `--` em comentários/mensagens do `talkx-demo.ts`;
2. **encolher** a fixture da tela 01 de 24 campanhas para 5;
3. adicionar 17 arquivos `tela-NN.json` contendo apenas `{}`;
4. reescrever `talkx-demo.spec.ts` para usar `mockTalkXVisual` + `fixtureDaTela`.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `e2e/fixtures/talkx-demo.ts` | Único delta são 15 linhas de em-dash → `--` em comentários e na mensagem do `FixtureVaziaError`. Zero mudança de comportamento. A tese "parser Playwright" não se sustenta: a main mantém os em-dashes hoje e o arquivo é exercitado pelo workflow `e2e-talkx.yml`. | `git diff 1252bb5a4 <tip> -- e2e/fixtures/talkx-demo.ts` só tem pares `-… — …` / `+… -- …`. `git show origin/main:e2e/fixtures/talkx-demo.ts \| grep -c '—'` = **10**; `e2e/talkx-visual.spec.ts` = **16**. `.github/workflows/e2e-talkx.yml:35-36` dispara nos paths `e2e/fixtures/talkx-demo.ts` e `e2e/fixtures/talkx-demo/**`. Além disso a main avançou +131 linhas nesse arquivo depois do base (tipo `DemoCampaign`, contagem de KPI) que a branch **não tem** (`git diff --stat origin/main <tip> -- e2e/fixtures/talkx-demo.ts` → 21 ins / 145 del). |
| `e2e/fixtures/talkx-demo/01-campanhas-visao-geral.json` | A branch **remove 915 linhas** e deixa uma fixture pobre: 5 campanhas (`demo-c01`…`demo-c05`), 19 campos cada, só as coleções `talkx_campaigns` e `talkx_segments`. A main tem a fixture rica e é ela que a suíte usa. Aplicar o patch seria **regressão**, não recuperação. | main: `{'talkx_campaigns': 24, 'talkx_segments': 5, 'talkx_templates': 0, 'talkx_campaign_metrics': 0, 'talkx_recipients': 0, 'talkx_link_clicks': 0}`, 36 campos por campanha (inclui `outcome_unknown_count`, `launched_at`, `revision`, `speed_profile`, `whatsapp_connection_id`). branch: 2 coleções, 5 campanhas, 105 linhas. `git show origin/main:e2e/talkx-demo.spec.ts:24-27` depende dessas 24 linhas ("A fixture tem 24 linhas, mas a RPC conta campanhas iniciadas na janela … logo o KPI é 21"). |
| `e2e/fixtures/talkx-demo/tela-01.json` … `tela-17.json` (17 arquivos novos) | Conteúdo = `{}` em todos. São placeholders num segundo esquema de nome, paralelo ao `NN-nome.json` que já está **completo** na main (17 arquivos). `fixtureDaTela(nn)` casa por `slug.startsWith(\`${nn}-\`)`, então `tela-01` nunca seria encontrado; entrariam só como ruído em `fixturesVazias()`. | `git show <tip>:e2e/fixtures/talkx-demo/tela-01.json` → `{}` (idem 02–17). `git show origin/main:e2e/fixtures/talkx-demo.ts` → `fixtureDaTela` usa `startsWith(\`${nn}-\`)`. `git ls-tree -r --name-only origin/main -- e2e/fixtures/talkx-demo` já lista `01-…17-`. |
| `e2e/talkx-demo.spec.ts` | A reescrita (import de `mockTalkXVisual`/`fixtureDaTela`, `declare global { Window.__BOOT_DEADLINE_MS }`, `test.skip` quando a fixture é `{}`) **já existe na main**, no spec dedicado `e2e/talkx-visual.spec.ts`. E a main endureceu o `talkx-demo.spec.ts` numa direção melhor que a da branch: escopa o KPI por `getByTestId('kpi-card')` e corrige o valor para **21** com razão documentada, enquanto a branch "restaura" o `getByText('24').first()` (commits `067742e49`/`f9ca26332`). | `git show origin/main:e2e/talkx-visual.spec.ts:1-19` (imports `mockTalkXVisual, loadDemoData, FixtureVaziaError, fixtureDaTela, fixturesComDados, fixturesVazias` + `declare global { __BOOT_DEADLINE_MS }`) e `:163-179` (skip de fixture vazia, contrato de crescimento). `git show origin/main:e2e/talkx-demo.spec.ts:22-27` (kpi-card + 21). `git diff 1252bb5a4 origin/main -- e2e/talkx-demo.spec.ts` mostra a main trocando `24` por `21` **de propósito**. |

## Veredito

**OBSOLETA.** Nada de útil ficou fora da main:

- o que a branch "traria" de novo em `talkx-demo.ts` é só ASCII-ização de travessão (cosmético, e a main
  provou que não precisa);
- a fixture da tela 01 da branch é um **subconjunto mais pobre** da que está na main;
- os `tela-NN.json` são placeholders vazios duplicando um esquema já completo;
- a reescrita do spec foi **superada** pela main: o padrão visual vive em `talkx-visual.spec.ts` e o
  `talkx-demo.spec.ts` da main tem assertion mais forte (e com o valor de KPI certo, 21 — a branch insiste
  no 24, que a main corrigiu por análise do RPC).

`apagar_branch_seguro = true` (prova por arquivo acima; nenhuma lacuna com valor).

## Lacunas a recuperar

Nenhuma. Portar qualquer hunk desta branch pioraria a main (regressão na fixture 01 e no valor do KPI).

## Verificação adversarial

Papel: refutar a triagem (OBSOLETA). Resultado: **não foi possível refutar — concordo com OBSOLETA**, `apagar_branch_seguro = true`.

Escopo real do delta (`git diff --name-status 1252bb5a4 f9ca26332`): exatamente 20 arquivos, todos em `e2e/`
(`137 insertions, 1018 deletions`). Zero `src/`, zero `supabase/`, zero workflow. Nada de negócio.

### Hunk por hunk — procura ativa por valor ≥ médio não coberto

1. `e2e/fixtures/talkx-demo.ts` — **cosmético, e a branch está ATRÁS da main.**
   `git diff 1252bb5a4 f9ca26332 -- e2e/fixtures/talkx-demo.ts` = 15 pares de linhas, todas trocando `—`/`→`
   por `--`/`->` em comentários e na mensagem de `FixtureVaziaError`. Nenhuma linha de código executável
   muda. A tese do commit `b2527631d` ("parser Playwright") não se sustenta: `git show
   origin/main:e2e/fixtures/talkx-demo.ts | grep -c '—'` = **10** (main roda com travessões) e
   `.github/workflows/e2e-talkx.yml` dispara em `e2e/fixtures/talkx-demo.ts` e `e2e/fixtures/talkx-demo/**`
   (paths do `on.pull_request`, linhas 30-36), logo o arquivo é exercitado como está.
   A main ganhou depois do merge-base o tipo `DemoCampaign` (`origin/main:e2e/fixtures/talkx-demo.ts`,
   após `fixtureDaTela`) e a derivação do KPI — nada disso existe na branch.

2. `e2e/fixtures/talkx-demo/01-campanhas-visao-geral.json` — **regressão, não lacuna.**
   main: `{'talkx_campaigns':24,'talkx_segments':5,'talkx_templates':0,'talkx_campaign_metrics':0,
   'talkx_recipients':0,'talkx_link_clicks':0}`, 36 campos por campanha, ids `camp-001..camp-024`.
   branch: `{'talkx_campaigns':5,'talkx_segments':4}`, 17 campos, ids `demo-c01..demo-c05`.
   Subconjunto pobre em toda dimensão. Os 3 nomes só da branch (`Promoção de Outubro`,
   `Reativação Clientes Inativos`, `Volta às Aulas 2027`) não têm valor: a main cobre tela 10
   (`Promoção de Outubro`) com a fixture própria `10-campanha-agendada.json`, já populada.

3. `tela-01.json … tela-17.json` (17 arquivos) — **`{}` puro**, confirmado por `git show
   f9ca26332:e2e/fixtures/talkx-demo/tela-NN.json`. `fixtureDaTela(nn)` na main casa por
   `slug.startsWith(`${nn}-`)`, então `tela-01` nunca é encontrado. Pior: entrariam em
   `fixturesVazias()` (que hoje é vazia — **todas as 17 fixtures da main têm dados reais**) e
   reativariam o teste `referenciar uma fixture vazia ({}) lança FixtureVaziaError`
   (`origin/main:e2e/talkx-visual.spec.ts:163-169`) apontando para arquivo-fantasma. Ruído puro.

4. `e2e/talkx-demo.spec.ts` — **a substituição alegada existe e é superior. Verificada na linha citada.**
   main `e2e/talkx-visual.spec.ts` (blob `e0b54bda1`) tem o mesmo padrão nas linhas 5-19 (`mockTalkXVisual`,
   `fixtureDaTela`, `fixturesComDados`, `fixturesVazias`, `declare global __BOOT_DEADLINE_MS`) e 117
   (`window.__BOOT_DEADLINE_MS = 60000`), mais 17 telas em laço com captura PNG, guard de tamanho ≥1 KB e
   dois testes de contrato de crescimento (163-179). A assertion da branch
   (`page.getByText('24').first()`) é mais fraca e **com valor errado**: a main escopa
   `getByTestId('kpi-card').filter({hasText:'Total de campanhas'})` e usa **21**, com a razão documentada
   em `origin/main:e2e/talkx-demo.spec.ts:23-27` ("duas agendadas e um rascunho ainda não têm
   `started_at`, logo o KPI é 21"). O commit `f9ca26332` ("restaura assertion do valor KPI 24") reintroduz
   justamente o bug que a main corrigiu de propósito.

### Checks de regressão exigidos pelo protocolo
- Nada foi removido por engano: a base X003 (`b29331d17`) está na main e evoluiu — as 17 fixtures passaram
  de 1 populada para 17 populadas (`git show origin/main:e2e/fixtures/talkx-demo/NN-*.json`).
- A régua visual X004 já existia no próprio merge-base (`git ls-tree 1252bb5a4 -- e2e/talkx-visual.spec.ts`),
  ou seja, a branch nasceu obsoleta.
- Nenhum hunk de valor ≥ médio sobrou. Não há fundamento para PERDIDA_PARCIAL.

**Veredito final: OBSOLETA. Branch segura para apagar.** Impacto no negócio: zero.
