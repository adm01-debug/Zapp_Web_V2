# Reconciliação LT-LAYOUT-02 — dois dos cinco apontamentos do layoutguard eram limitações de análise

**Achado:** LT-LAYOUT-02 (P2, categoria `CONFIRMED_GUARD_LIMITATION`, área docs, id de backlog #137).
**Fonte:** `docs/reconciliation/FINDINGS.json` → LT-LAYOUT-02 (baseline `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`); etapas `layout:6` e `layout:27` do `docs/design/PLANO_CORRECAO_LAYOUT_30_ETAPAS.md`.
**Registro original:** guard rodado na auditoria com **exit 1 → 5 apontamentos em 51 arquivos**; a própria auditoria classificou **2 dos 5** como limitação de análise (falsos positivos), não como bug visual.
**Data desta nota:** 2026-10-06 (cartão `t_92f2ef91`, refazer 1; modo V2, árvores locais).
**Escopo:** nota de evidência. **Este cartão NÃO altera código** — ver "Nota de escopo" no fim.

## Conclusão

A correção dos dois falsos positivos **já está na base do dia** e **não sofreu regressão**: entrou no commit `cccf8170781f37d510c9683955328e6d557a2836` (`fix(layout): eliminar falsos positivos do guard`, 2026-10-05 14:03:55 -0300), que é **ancestral de HEAD**. A prova é reproduzível: com o mesmo arquivo de teste (`scripts/ui-audit/layout-guard.unit.mjs`), o guard de antes (cópia byte a byte do baseline, sha256 `c8e3e6e3…`) falha 3 de 4 casos e o guard de hoje (sha256 `f98eda98…`) passa os 4.

## Hashes sha256 da evidência

Medidos agora, no workspace do cartão, com `sha256sum`. Os três do baseline foram conferidos contra o campo `evidence[].sha256` de LT-LAYOUT-02 em `FINDINGS.json`.

**Baseline da auditoria — `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`** (`baseline_main_sha` do `FINDINGS.json`):

| Arquivo | sha256 (baseline) | Bate com `FINDINGS.json`? |
|---|---|---|
| `scripts/ui-audit/layout-guard.mjs` | `c8e3e6e3947ae53ae2b5a629b36239e1c1a80e5a80819744ade359bb9ea785f4` | sim (`evidence[0].sha256`) |
| `src/components/calls/VoIPPanel.tsx` | `887c3ee8a1a3bbe52c2e9af979ce75b7827ed51cacdf86ddeb50231d44c411b0` | sim (`evidence[1].sha256`) |
| `src/components/talkx/TalkXView.tsx` | `e3c39a9b66354f14bcbd39c39bbbb2053fd3bcd4e3478e6294b7cdcbba79630e` | sim (`evidence[2].sha256`) |

Comando: `git show <baseline>:<arquivo> | sha256sum`.

**Estado atual — HEAD `cab247e7b8185d785a0f6b152fe9478834f43789`** (branch `v2/lt-layout-02-prova-versionada-261006163583e7`, base `dia/2026-10-06`):

| Arquivo | sha256 (hoje) | Observação |
|---|---|---|
| `scripts/ui-audit/layout-guard.mjs` | `f98eda98733e53901b714f0cfcbd91a213e112b0d44f3b2d869e46768720926f` | é o guard corrigido; idêntico desde `cccf81707` |
| `scripts/ui-audit/layout-guard.unit.mjs` | `4d672a08aee52fa4e689ba9b6d0f72fa1f84628c8dcea3346a0e94c81098068a` | idêntico desde `cccf81707` |
| `src/components/calls/VoIPPanel.tsx` | `887c3ee8a1a3bbe52c2e9af979ce75b7827ed51cacdf86ddeb50231d44c411b0` | **byte a byte igual ao da auditoria** |
| `src/components/talkx/TalkXView.tsx` | `eb90afb4e3225077e25e6069415026a913363875b64b3dfd6cbadac20a222e79` | **difere do baseline** — mudou depois por outros cartões (`c67578c11`, `93ceb9a6e`), não por esta correção |

Comando: `sha256sum scripts/ui-audit/layout-guard.mjs scripts/ui-audit/layout-guard.unit.mjs src/components/calls/VoIPPanel.tsx src/components/talkx/TalkXView.tsx`.

## O commit da correção

`cccf8170781f37d510c9683955328e6d557a2836` — `fix(layout): eliminar falsos positivos do guard` (2026-10-05, cartão V2 `26100512222e82`).

```
 scripts/ui-audit/layout-guard.mjs      | 45 inserções, 6 remoções
 scripts/ui-audit/layout-guard.unit.mjs | 88 inserções, 0 remoções (arquivo novo)
 2 files changed, 133 insertions(+), 6 deletions(-)
```

É **ancestral de HEAD** (`git merge-base --is-ancestor cccf81707 HEAD` → 0) e é o **único** commit que toca os dois arquivos do guard entre o baseline e HEAD:

```
$ git log --oneline 2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6..HEAD -- \
    scripts/ui-audit/layout-guard.mjs scripts/ui-audit/layout-guard.unit.mjs
cccf81707 fix(layout): eliminar falsos positivos do guard
```

O que a correção mudou:

- `hasUtility(cn, u)` (guard, linhas 66–73): compara o **token inteiro** (`=== u`, `endsWith(':u')`, `endsWith(':!u')`) em vez do regex `\b…\b` — `min-h-full` deixou de casar `h-full`;
- `resolveLocalModule()` + `loadAuditableView()` (guard, linhas 93–122): segue `export { X as Y } from './Z'` até a implementação real — o alias `VoIPPanel` deixa de virar `NAO AUDITAVEL` (a raiz auditada passa a ser a de `TelefoniaView`).

## PROVA 1 — vermelho antes / verde depois, MESMO arquivo de teste

Probe: `scripts/ui-audit/layout-guard.unit.mjs` (o teste de regressão que a correção acrescentou; está no inventário do CI — `scripts/ci/check-test-inventory.mjs` linha 69). Guard "antes" = `git show 2e7cf81…:scripts/ui-audit/layout-guard.mjs` copiado para `.tmp/oldguard/layout-guard.mjs` (sha256 conferido `c8e3e6e3947ae53ae2b5a629b36239e1c1a80e5a80819744ade359bb9ea785f4`, igual ao da auditoria).

**ANTES** — `node --test .tmp/oldguard/layout-guard.unit.mjs` — **exit 1**:

```
✖ audita a raiz real de uma view reexportada por alias
    AssertionError: NAO AUDITAVEL: src/components/AliasView.tsx — nenhuma raiz JSX no nivel do corpo do componente
    ✗ layout-guard: 1 violation(s) across 0 view files      →  1 !== 0
✖ nao confunde min-h-full com o token h-full
    AssertionError: VIOLATION [h-full without w-full/flex-1] className: "min-h-full"   →  1 !== 0
✔ continua rejeitando h-full sem largura
✖ aplica as regras na raiz do alvo reexportado
ℹ tests 4  ℹ pass 1  ℹ fail 3
```

**DEPOIS** — `node --test scripts/ui-audit/layout-guard.unit.mjs` — **exit 0**:

```
✔ audita a raiz real de uma view reexportada por alias
✔ nao confunde min-h-full com o token h-full
✔ continua rejeitando h-full sem largura
✔ aplica as regras na raiz do alvo reexportado
ℹ tests 4  ℹ pass 4  ℹ fail 0
```

O terceiro caso é a contraprova: a regra legítima (`h-full` sem largura) continua reprovada nos **dois** guards — a correção não desligou a regra, só deixou de casar a substring.

Reproduzir:

```
mkdir -p .tmp/oldguard
git show 2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6:scripts/ui-audit/layout-guard.mjs > .tmp/oldguard/layout-guard.mjs
cp scripts/ui-audit/root-className.mjs scripts/ui-audit/layout-guard.unit.mjs .tmp/oldguard/
node --test .tmp/oldguard/layout-guard.unit.mjs   # exit 1
node --test scripts/ui-audit/layout-guard.unit.mjs # exit 0
```

## PROVA 2 — mesma árvore `src` do baseline, guard ANTES vs guard DE HOJE

Entrada fixa: `git archive 2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6 src scripts/ui-audit | tar -x -C .tmp/baseline` (o guard do próprio arquivo, sha256 `c8e3e6e3…`, é o "antes"; o `scripts/ui-audit/layout-guard.mjs` de HEAD é o "depois"), rodados com `cwd=.tmp/baseline` (o guard usa `process.cwd()` como raiz).

| | ANTES (`c8e3e6e3`) | DEPOIS (`f98eda98`) |
|---|---|---|
| total | `5 violation(s) across 51 view files`, exit 1 | `3 violation(s) across 52 view files`, exit 1 |
| `NAO AUDITAVEL … src/components/calls/VoIPPanel.tsx` | **presente → limitação de análise** | **ausente** |
| `[h-full without w-full/flex-1] src/components/talkx/TalkXView.tsx` — `className: "min-h-full bg-background p-3 md:p-4 lg:p-6 space-y-5"` | **presente → limitação de análise** | **ausente** |
| `[h-full without w-full/flex-1] src/components/tasks/TasksModule.tsx` — `className: "flex flex-col h-full gap-4"` | presente (apontamento real) | presente (apontamento real) |
| `[p-6 duplicate padding] src/components/talkx/TalkXView.tsx` | presente (real) | presente (real) |
| `[p-6 duplicate padding] src/components/multiplix/MultiplixView.tsx` | presente (real) | presente (real) |

As duas linhas em negrito são exatamente as **limitações de análise** que o achado descreve:

1. **`VoIPPanel.tsx` é um ALIAS puro** — `export { TelefoniaView as VoIPPanel } from './TelefoniaView'` (8 linhas, sha256 `887c3ee8…`). Não existe raiz JSX no corpo do arquivo, então o guard antigo o declarava `NAO AUDITAVEL`; a raiz real é a de `TelefoniaView` (`w-full … min-w-0`), logo não havia violação nenhuma. O guard de hoje segue o reexport e audita a raiz real — por isso a contagem de arquivos auditados **sobe de 51 para 52**.
2. **`min-h-full` não é `h-full`** — o regex `\bh-full\b` casava a **substring** de `min-h-full` (há fronteira `\b` entre `-` e `h`). O guard de hoje compara token inteiro.

Os 3 que sobram são os apontamentos reais que a própria auditoria adjudicou; os 2 que saíram são as limitações.

Segundo par de medições, agora sobre a **árvore `src` de hoje** (sem `git archive`):

| | guard do baseline (`c8e3e6e3`) | guard de hoje (`f98eda98`) |
|---|---|---|
| hoje | `2 violation(s) across 51 view files` — `TasksModule.tsx` (real) + `NAO AUDITAVEL: VoIPPanel.tsx` (falso) | `1 violation(s) across 52 view files` — só `TasksModule.tsx` |

Nesta segunda medição o `TalkXView.tsx` **não** aparece nem no guard antigo, porque o arquivo mudou depois da auditoria (`c67578c11 fix(layout): evita padding duplicado em TalkX e Multiplix` removeu o `p-6` da raiz; hoje a raiz é `min-h-full w-full min-w-0 bg-background space-y-5`). O falso positivo do `h-full` só é observável na árvore do baseline, que é onde a auditoria o registrou.

## O que fica FORA desta nota (registrado, não corrigido)

- **`TasksModule.tsx` continua apontando** (`className="flex flex-col h-full gap-4"`, raiz sem largura): é apontamento **estático real**, registrado pela auditoria (etapa 6, `PARTIAL`) e de propósito **não** promovido a bug de sizing sem medição de DOM. **Não foi tocado** — não é o problema deste cartão.
- **Limitação residual conhecida, sem caso vivo:** `export * from './x'` não é seguido (só `export { … } from`). No `src` de hoje os `export *` existem apenas em `src/services/**` e nenhuma view roteada por `src/pages/lazyViews.ts` usa esse formato. Se aparecer, o guard falha **alto** (`NAO AUDITAVEL`), não em silêncio — foi assim que o caso do alias VoIP apareceu.

## Nota de escopo (exigida pelo cartão)

**Não houve alteração de código nem de `TasksModule`.** Este cartão acrescenta **apenas este arquivo markdown** em `docs/reconciliation/` (e o relato em `.tmp/`, ignorado pelo git). Nenhum arquivo de `src/`, nenhum `TasksModule.tsx`, nenhum teste de produto e nenhum script do layoutguard (`scripts/ui-audit/**`) foi modificado. Este commit **não é vazio**: `git diff --stat` mostra o arquivo novo.

## Não conferido

Nada visual ou de navegador: esta nota não toca tela, componente, token nem CSS. A prova é o `stdout` e o código de saída do analisador e do runner de teste — determinística e repetível. Não medi contraste, tema, largura nem teclado (não se aplicam).
