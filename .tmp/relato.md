Especialista: Edgar (area-edge-api).

Sensibilidade: o diff empilhado (herdado de t_bb810a9e) toca `service_role` e RLS na migration
novidade `supabase/migrations/20261009120000_talkx_test_sends.sql` (REVOKE de anon/authenticated,
GRANT só para `service_role`, policies de leitura por dono/admin). Eu NÃO alterei esse arquivo nem
afrouxei proteção nenhuma; a minha mudança é uma linha de documento (`ESTADO.md`, número da
âncora). Nada de produção, nenhum segredo, nenhuma referência ao banco de produção.

## O que mudou e por quê
- `ESTADO.md` (linha da tabela do grupo B, edge `talkx-link`): a âncora
  `supabase/functions/talkx-send/index.ts:455` passou para `...:523`.
  Motivo: a entrega de t_bb810a9e (branch `v2/talkx-teste-conexao-n105-2610101539fe3b`,
  commit `71b706b4e`) acrescentou linhas em `supabase/functions/talkx-send/index.ts` (limite
  do envio de teste + auditoria de falha), deslocando a chamada real
  `/functions/v1/talkx-link` de 455 para 523. O inventário publicado ficou apontando para
  uma linha que não cita mais a edge — exatamente o caso que a guarda
  `scripts/ci/docs-estado-registry-convention.unit.mjs` existe para pegar
  ("Mudou o código? O vermelho obriga a atualizar o documento na mesma entrega").
- Passos: `git cherry-pick` de `6139d4210` + `610c10d31` + `71b706b4e` (a branch da entrega,
  sem recomeçar; o 6139d4210 é quem cria a migration, por isso ele vem junto do 71b706b4e),
  sobre a ponta de `dia/2026-10-11` (`ebf1b4314`). Nenhuma asserção foi afrouxada; só o
  número da âncora foi corrigido.

## Prova
- vermelho antes (estado empilhado, sem a minha correção):
  `node --test --test-reporter=tap scripts/ci/docs-estado-registry-convention.unit.mjs`
  → `not ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`
  → `AssertionError: âncora desatualizada: supabase/functions/talkx-send/index.ts:455 não cita \`talkx-link\``
  (mesmo item que o `ci_espelho.sh` reporta: `node: ESTADO.md cita só âncoras reais, ...`).
- verde depois (mesmo comando, mesmo arquivo de guarda):
  `node --test --test-reporter=tap scripts/ci/docs-estado-registry-convention.unit.mjs`
  → `# tests 11` · `# pass 11` · `# fail 0` (exit 0)
- varredura de TODAS as âncoras do ESTADO.md (o teste real para na primeira desatualizada):
  `.tmp/check-anchors.mjs` → `ANCHORS OK` (nenhuma outra âncora desalinhada).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (131s)`.

## Pontos do cartão (O QUE FAZER 1–3)
- Ponto 1: parti do commit da entrega com `git cherry-pick` (`6139d4210` + `610c10d31` +
  `71b706b4e`, a branch `v2/talkx-teste-conexao-n105-2610101539fe3b`), sem recomeçar; o
  `6139d4210` vem junto porque é ele que cria a migration que o `71b706b4e` modifica.
- Ponto 2: reproduzi o item na ponta de `dia/2026-10-11` e corrigi a causa sem afrouxar
  asserção — `ESTADO.md`, âncora do `talkx-link` de `talkx-send/index.ts:455` para `:523`.
  Teste que prova: `scripts/ci/docs-estado-registry-convention.unit.mjs` (vermelho antes,
  verde depois).
- Ponto 3: prova verde pelo mesmo comando (`node --test ... docs-estado-registry-convention.unit.mjs`
  → `# pass 11` · `# fail 0`) e `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (131s)`;
  sha do commit da correção: `8dc79b7b4`.

## Avisos do juiz barato (ANTES DE ENTREGAR)
- "código alterado sem teste neste commit" (`useTalkX.ts`, `talkx-send/index.ts`,
  `_test-utils.ts`). Não procede: esses são os commits empilhados da entrega (não meus) e o
  diff `ebf1b4314..HEAD` inclui `supabase/functions/talkx-send/index.test.ts` (+116 linhas).
  O meu commit é doc-only (só a âncora do `ESTADO.md`), e o defeito que ele fecha é provado
  pelo teste JÁ EXISTENTE `scripts/ci/docs-estado-registry-convention.unit.mjs` (item 2 do
  `ci_espelho.sh`): vermelho antes, verde depois.
- "a migration muda permissão/RLS". Também não procede para mim: o
  `REVOKE ... / GRANT ... TO service_role` e as policies estão em
  `supabase/migrations/20261009120000_talkx_test_sends.sql`, arquivo da entrega de t_bb810a9e
  que o cartão mandou cherry-pickar (passo 1 do O QUE FAZER). Não alterei esse arquivo — meu
  único commit de conteúdo muda uma linha do `ESTADO.md` (número da âncora). A prova de papel
  real (tabela trancada para anon/authenticated, escrita só por `service_role`) pertence ao
  cartão de origem e já foi coberta lá; aqui o escopo é destravar o ESPELHO DO CI.

## O que NÃO fiz e por quê
- Não rodei `bash ~/arquitetura-v2/integrador/ci_espelho.sh .` direto: o `HERMES-GUARD` bloqueia
  qualquer comando que cite aquele caminho de ferramenta (`mexer nas guardas/ferramentas do
  Hermes é proibido`). Como o item do espelho é exatamente o teste node que rodei acima, a
  prova é a mesma execução; não contornei o bloqueio.
- Não toquei em `supabase/functions/**` nem na migration: a causa era só a âncora do documento.

sha do commit da correção: `8dc79b7b4`.
