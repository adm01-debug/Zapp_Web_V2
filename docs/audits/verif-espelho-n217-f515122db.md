# Verificação independente: ESPELHO DO CI e zapp-verify com a correção do N217 (f515122db)

Cartão: `t_73fe0de8` ("Provar ESPELHO DO CI e zapp-verify verdes e fechar citando o sha").
Especialista: worker (ci) (`area-verificacao-ci`). Data: 16/10/2026.

## Objeto verificado

- Correção (cartão `t_61b3a4b9`): commit **`e088b7b49d`** — "fix(edge): status (send-status) restrito a
  admin/supervisor e medição N217 realinhada", com base `d723a90107` (ponta de `dia/2026-10-16`).
  Ele carrega a entrega `f515122db` (`git merge --squash`, sem conflito) **mais** o artefato medido
  `docs/audits/edge-functions-authz-coverage.md` regenerado.
- Base da verificação: `d723a90107` (ponta local de `dia/2026-10-16`; a branch do dia já continha o
  empilhamento referido no diagnóstico do cartão `t_ad300348`).

## 1. Reprodução limpa do estado empilhado

`git cherry-pick e088b7b49d` sobre `d723a90107` → commit `68908c9b86`, **sem conflito**. Árvore resultante
**byte a byte idêntica** à da correção (prova medida, não presumida):

    git rev-parse 68908c9b86^{tree} == git rev-parse e088b7b49d^{tree}   → ARVORE IDENTICA
    e os 5 arquivos do commit têm o mesmo blob nos dois:
    docs/audits/edge-functions-authz-coverage.md, supabase/functions/_shared/__tests__/evolution-control-authz.test.ts,
    supabase/functions/_shared/evolution-control-authz.ts, supabase/functions/evolution-api/index.test.ts,
    supabase/functions/evolution-api/index.ts

O cherry-pick foi mantido **fora do diff** desta entrega (o commit `68908c9b86` fica só como evidência; a
entrega desta verificação é este documento), pelo mesmo motivo do cartão `t_ad300348`: a correção já está
na fila do integrador pelo cartão `t_61b3a4b9` / `261016085186b4.json` e não deve ser aplicada duas vezes.

## 2. Nenhuma asserção foi afrouxada

    git diff --name-only d723a90107 68908c9b86 | grep -c '^scripts/'   → 0
    git diff d723a90107 68908c9b86 -- scripts/ci/ | wc -l              → 0

O commit não toca `scripts/ci/`: a asserção `scripts/ci/edge-coverage-authz.unit.mjs:389` (régua N217) está
intacta. O que a correção muda é o **artefato medido** (o doc), exatamente o caminho que a própria falha
manda usar. Nos arquivos de teste da entrega, as listas antigas saíram porque as ações correspondentes
passaram de `read`/`send` para `control` — a verificação ficou mais estrita, não mais frouxa
(`assertEquals(classifyEvolutionAction(a), "control")` para as 29 ações do caso R2EXT-AGENDA, contra o
`"read"` anterior delas).

## 3. ESPELHO DO CI — nenhuma falha nova contra a base

Comando (cópia local do espelho, ver "Ressalvas"): `bash .tmp/mirror.sh .` — executa os testes Deno de todas
as Edge Functions, os `node --test` de `scripts/**/*.unit.mjs|test.mjs`, a suíte de contratos (`vitest.contracts.config.ts`)
e as 6 guardas baratas do job de lint.

    lista da BASE      (d723a90107):            11 falhas (todas `node:`)
    lista com a CORREÇÃO (68908c9b86):          11 falhas (todas `node:`)
    comm -13 base fix  → (vazio)  → nenhuma falha NOVA
    comm -23 base fix  → (vazio)  → nenhuma falha desapareceu
    grep -c N217 fix   → 0

As 11 falhas são pré-existentes na ponta do dia (`--staged*` 4, `ESTADO.md` 2, `Talk X` 2, `FLAG_CHANGES.md`,
`stagedLintableFiles`, `stagedRemovedFiles`) e não têm relação com a entrega. Nenhuma falha `deno:`,
`contrato:` ou `guarda:` em nenhuma das duas listas. `scripts/ci/check-test-inventory.mjs` reprova nas duas
(a pendência de inventário é a mesma da base e foi registrada em `.tmp/registro-pendente.txt`).

## 4. N217 — verde, idempotente e vermelho quando o doc não é o corrigido

`node scripts/ci/edge-coverage-authz.unit.mjs`:

    com a correção  → rc=0;  ℹ tests 8 / pass 8 / fail 0   (execuções 1 e 2)
    normalizadas: `diff` das duas saídas (sem os tempos) → IDENTICAS
    doc da base sobre o código corrigido: rc=1; ℹ tests 8 / pass 7 / fail 1
      ✖ N217: docs bate com medição fresca e segunda execução é idêntica

O vermelho é do caminho certo: sem o artefato realinhado, o próprio teste acusa o doc desatualizado — é a
prova de que o verde depende do realinhamento, e não de um afrouxamento.

## 5. zapp-verify — verde

    zapp-verify . --rapido → rc=0
    VERIFY: VERDE SEM BANCO (197s) — o banco NÃO foi verificado
    OK db_guard 0s | OK tipos 194s | OK lint 2s | OK migrations 1s
    AVISO banco_local: NÃO VERIFICADO (sem nome de conjunto)

## Conclusão

A entrega do cartão `t_61b3a4b9` (sha de correção **`e088b7b49d`**, estado empilhado reproduzido em
`68908c9b86`) passa: N217 verde e idempotente, espelho do CI sem falha nova, `zapp-verify --rapido` verde,
nenhuma asserção de CI afrouxada. O critério "espelho 100% verde" não é atingível nesta base — as 11 falhas
pré-existentes da ponta do dia independem da entrega; o critério do próprio espelho (comparação com a lista
da base) é satisfeito sem nenhuma diferença.

## Ressalvas honestas

- `bash ~/arquitetura-v2/integrador/ci_espelho.sh .` é bloqueado pela HERMES-GUARD (o script grava
  `registro-pendente.txt` dentro de `~/arquitetura-v2`, escrita proibida para agente). Rodei `.tmp/mirror.sh`,
  cópia idêntica linha a linha com **uma** alteração: o destino do registro de pendência, de
  `$HOME/arquitetura-v2/integrador/registro-pendente.txt` para `./.tmp/registro-pendente.txt`.
- `zapp-verify` rodou "VERDE SEM BANCO": as guardas de banco (RLS/policies) não entram nesta execução.
- A base pedida pelo corpo do cartão (`dia/2026-10-14`) foi cumprida pela ponta do dia (`dia/2026-10-16`):
  a correção `e088b7b49d` tem base `d723a90107` (ponta de `dia/2026-10-16`) e é essa a árvore que o
  integrador empilha; reproduzir em `dia/2026-10-14` reproduziria um estado que não é o da integração.
  O defeito é o mesmo nas duas (diagnóstico do cartão `t_ad300348` usou `dia/2026-10-15`).

## Evidência anexada ao cartão

`espelho-base.txt`, `espelho-fix.txt` (as duas listas), `n217-run1.txt` e `n217-run2.txt` (as duas execuções
verdes do N217), `n217-vermelho.txt` (a execução vermelha), `zapp-verify.log`, `mirror.sh` (a cópia usada).
