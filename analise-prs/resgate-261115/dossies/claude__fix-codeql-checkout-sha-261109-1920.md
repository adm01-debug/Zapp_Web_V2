# Dossiê — claude__fix-codeql-checkout-sha-261109-1920 (PR #2906, fechada sem merge em 2026-11-09)

## Propósito
Fechar alertas CodeQL `cache-poisoning/poisonable-step` #66-70: trocar `ref: ${{ needs.image-metadata.outputs.sha }}` por `ref: ${{ github.sha }}` nos checkouts de `bootstrap-login`, `full-suite` e `network-proof` (e `ZAPP_PROOF_SHA`) em `.github/workflows/e2e-logado-isolado.yml`; regenerar `docs/ci/README.md`.
Commits: `104cfdb1d`, `ee3fb552d`, `7bf81f91c` (3 à frente de `fe6c6b0bf`).

## Achados por arquivo

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/e2e-logado-isolado.yml` | **Mudança funcional já na main** por outro commit (`32129d82b fix(ci): usar github.sha em checkouts para fechar alertas CodeQL #66-70`, 2026-11-09 18:38 -03) | `git grep` em `origin/main`: linhas 103, 173, 233 `ref: ${{ github.sha }}`; linha 265 `ZAPP_PROOF_SHA: ${{ github.sha }}`; `git log -S'needs.image-metadata.outputs.sha'` lista `32129d82b` como remoção |
| idem | As 34 linhas "em lacuna" são **só remoção de acentos** (suíte→suite, descartável→descartavel, código→codigo…) — efeito colateral do agente, não intenção da PR (corpo da PR: "apenas 3 linhas alteradas") | `git diff origin/main <branch>` filtrado com normalização NFD: 34 −/34 +, zero linhas sem par após tirar acentos |
| `docs/ci/README.md` | Idem: as 5 linhas em lacuna são a mesma linha/sessão sem acento. A main mantém a versão acentuada (linhas 21 e 105) e o README é gerado a partir dos comentários `# docs:` do workflow (check `ci.yml:153 "Verificar README gerado dos workflows"`) — portar os acentos removidos quebraria o check | `git grep -n 'e2e-logado-isolado' origin/main -- docs/ci/README.md` |

## Veredito
**INCORPORADA** (confiança alta). O que a branch pretendia (github.sha nos 4 pontos) está em `origin/main` via `32129d82b`. O resíduo (texto sem acento) é ruído com valor **nenhum** e contraria o padrão da main (acentuada); não portar.

## Lacunas a recuperar
Nenhuma.

## Branch
Segura para apagar: sim (tip `7bf81f91c` não é ancestral de main, mas todo conteúdo útil está lá).

## Verificação adversarial

Veredito mantido: **INCORPORADA**. Tentei refutar e não achei um único hunk de valor fora da main.

Provas (repo local, `origin/main` = `dac285f62`):

1. **A correção está na main, integral.** `git diff fe6c6b0b origin/main -- .github/workflows/e2e-logado-isolado.yml` mostra as 4 trocas
   `ref: ${{ needs.image-metadata.outputs.sha }}` → `ref: ${{ github.sha }}` e `ZAPP_PROOF_SHA: ... github.sha`.
   Na main: `origin/main:.github/workflows/e2e-logado-isolado.yml:56,103,173,233,265`. Commit `32129d82b82b5609b3f226e5d7199ea952014af0`
   "fix(ci): usar github.sha em checkouts para fechar alertas CodeQL #66-70" (2026-11-09). Nenhum `outputs.sha` sobrou em checkout.

2. **O resíduo da branch no workflow é 100% acento.** Normalizando NFKD→ASCII, `origin/main:.github/workflows/e2e-logado-isolado.yml`
   e a versão da branch ficam **byte-idênticos** (280 linhas em ambas). Ou seja: as 34 linhas de `missing_sample` do JSON não carregam
   nenhuma mudança de comportamento — só `suíte→suite`, `descartável→descartavel`, `execução→execucao`. A main está na forma acentuada,
   que é o padrão do arquivo; portar seria regressão cosmética.

3. **O resíduo em `docs/ci/README.md` é acento + desatualização do inventário.** Diff normalizado sem acentos deixa apenas duas
   diferenças, ambas de calendário, não de valor:
   - a branch documenta `auto-update-pr-branch.yml`, que **não existe mais na main** (`git ls-tree origin/main .github/workflows/auto-update-pr-branch.yml` → vazio; existia no merge-base `fe6c6b0b`);
   - a branch **não tem** a linha de `check-talkx-pr-body.yml`, que **existe na main** (`git ls-tree origin/main` → blob `64698781`, trazido por `41853318c`).
   Portar qualquer um dos dois colocaria o README em desacordo com os workflows reais da main. O arquivo é gerado/validado por
   `scripts/ci/render-workflow-docs.mjs` e `scripts/ci/ci-docs-baseline.unit.mjs`, logo o check ficaria vermelho.

4. **Não houve remoção deliberada de nada útil.** O único conteúdo exclusivo da branch é texto sem acento, introduzido pelos
   commits `ee3fb552d`/`7bf81f91c` ("regenera docs/ci/README.md", "corrige ... para 21 workflows no branch") — efeito colateral do
   agente, não pedido da PR #2906, cujo corpo fala de 3 linhas de `github.sha`.

Não verificado: se os alertas CodeQL #66–70 foram efetivamente fechados no Security do GitHub (não consultei a API). A correção de
código que os motivava está na main, o que é o que importa para a decisão de apagar a branch.

Branch segura para apagar: **sim**.
