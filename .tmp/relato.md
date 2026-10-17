Especialista: hugo (area-front-hooks)

Cartão t_34640b42 — "Reproduzir falha e trazer commits anteriores (cherry-pick)".
Preparo de workspace do cartão pai t_d75cff6a ([refazer 1] arquivar grava o estado arquivada).

## O que fiz
- Workspace novo criado por `hermes-tarefa-iniciar Zapp_Web_V2 ...` sobre `dia/2026-10-17`
  (tip `d723a90107`); branch `v2/reproduce-falha-cherry-pick-34640b42-2610170717ba2a`.
- Passo 2: `git merge-base --is-ancestor 9305240ff HEAD` -> rc=1 (não é ancestral).
  `git cherry-pick 9305240ff` aplicado como `8a66dbfd5f`. Único conflito: `.tmp/relato.md`
  ("deleted in HEAD and modified in 9305240ff"), resolvido com `git add -f .tmp/relato.md`.
  O relato anterior ficou preservado no fim deste arquivo (é o "trabalho anterior" a reaproveitar).
- Passo 1: `zapp-verify full .` rodado neste workspace, saída em `.tmp/verify-full.log`.

## Prova (comandos reais, agora)
`zapp-verify full .` ->
```
OK      db_guard        0s
OK      tipos          60s
OK      lint           78s
OK      migrations      0s
AVISO   banco_local  NÃO VERIFICADO: sem nome de conjunto (passe o nome como terceiro argumento)
FALHOU  testes        567s
VERIFY: VERMELHO em testes (705s)
rc=1
```
- Detalhe dos testes: `/home/joaquim_ataides/.local/state/zapp-verify/1e1f1d52ef3b/testes.log`
  — captura truncada em 12.288 bytes, terminando no meio de uma linha; o resumo do vitest não
  chegou ao arquivo e o nome do caso que falhou não é recuperável daí.
- Causa medida do vermelho: o disco da MÁQUINA está cheio. `df -h /` -> `1007G  956G  65M  100%`.
  Qualquer comando que precise escrever falha:
  `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx`
  -> `npm error nospc ENOSPC: no space left on device, write`; o próprio `write_file` deste relato
  já falhou uma vez com `No space left on device`. O `testes.log` cortado no meio de uma linha é o
  mesmo ENOSPC. Ou seja: o vermelho desta rodada é do ambiente, não do código do cartão, e não é
  reproduzível de forma confiável com o disco cheio.
- Com o disco assim eu não consigo rodar nenhum teste no host para identificar o caso que falhou.

## Passo 3 — cartões pai
- B1 (`t_2bcde689`) e B2 (`t_e476c02e`), chips Arquivadas: INTEGRADOS.
  B2 está em dia (`32c68d56a3 fix(inbox): filtro Arquivadas lista só conversation_status archived`,
  `src/hooks/inbox/useInboxFilters.ts` + `StatusChips.test.tsx`); B1 nos commits do chip
  (`82bf569ff9`, `de5a0c4162`); fila `.v2-fila`: `integrado_em 2026-10-11` para ambos.
- E1 (`t_598cbd7d`, workersql — migration `ingest_inbound_message` reabre resolved/archived):
  NÃO ESTÁ INTEGRADO na base `dia/2026-10-17`. Evidências:
  - `supabase/migrations/20261014160000_ingest_inbound_message_reabre_conversa.sql` não existe em
    nenhuma `dia/*` (conferido ref a ref: dia/2026-10-10 … dia/2026-10-17 -> 0 ocorrências).
  - `git for-each-ref --contains=d67c5deb1d` -> apenas
    `v2/ingest-inbound-reabre-conversa-2610161152e726` (retomada de 16/10) e a antiga
    `v2/ingest-inbound-reabre-conversa-2610111149a58e`.
  - `git log --all -- <caminho>`: o arquivo só aparece em `d67c5deb1d`, `f8fd690de7`, `17850c89e6`,
    `2e09eef8af` e no "lote 880 cartões" que foi REVERTIDO
    (`312bd59920 revert: desfaz o lote #1976 (main não compilava)`).
  - O corpo vigente de `ingest_inbound_message` (migrations 20260905050000 / 20260905070000) não
    menciona `conversation_status` e não há `status-fsm` no `schema-catalog.json`: a reabertura
    automática não existe no banco desta base.
  - A fila diz `integrado_em 2026-10-14` para `t_598cbd7d`, mas o código não está em nenhuma `dia/*`:
    a integração foi perdida/desfeita. E1 precisa ser reintegrado (commit `d67c5deb1d`, branch de
    16/10) antes do pai `t_d75cff6a` — decisão do Joaquim (11/10): arquivar só grava `archived`
    DEPOIS que a reabertura automática existir.

## Bloqueio (o que falta)
1. E1 (`t_598cbd7d`) não integrado na base — é pré-requisito declarado do cartão pai.
2. Disco do host 100% cheio (`/` com 65 M livres): `zapp-verify full` não dá resultado confiável e
   nenhum teste roda; liberar espaço não é da minha alçada (`rm` é proibido para mim).

Nada foi alterado fora de `.tmp/relato.md` neste cartão — o cherry-pick trouxe só o próprio relato.

---
## Trabalho anterior preservado (cherry-pick 9305240ff)

Especialista: hugo (area-front-hooks) — executado por iris (perfil escalado na retomada)

## O que mudou e por quê
Retomei a entrega já aprovada do cartão anterior (commit `42a10859a`, branch
`v2/arquivar-grava-estado-arquivada-261011121791df`) e a trouxe para a base atual
`dia/2026-10-13`, sem reimplementar: o defeito ainda existe na base (o arquivamento
gravava `contacts.assigned_to = null` em vez do estado arquivada).

- `src/hooks/chat/useConversationActions.ts`: o arquivar individual e o desfazer passam a
  usar a RPC `set_conversation_status` (grava `conversation_status = 'archived'`; o desfazer
  reabre com `'open'`); `assigned_to` deixa de ser tocado.
- `src/hooks/inbox/useBulkActions.ts`: no arquivamento genérico, quando a tabela é `contacts`
  a transição vai por RPC (uma chamada por id); as demais tabelas seguem com `status`.
- `src/hooks/inbox/useInboxBulkActions.ts`: arquivamento em massa por RPC com no máximo
  `BULK_ARCHIVE_CONCURRENCY` (5) chamadas em voo; falha isolada entra na lista de falhas e o
  desfazer reabre só as que foram arquivadas de verdade.
- Testes: `useConversationActions.test.ts`, `useInboxBulkActions.test.ts`,
  `useBulkActions.archive-fsm.test.tsx`, `ContactDetails.quickActions.test.tsx`.

Rebase: só houve conflito em `useConversationActions.test.ts`, onde a base nova já mockava a
RPC `transfer_conversation` (cartão de transferência). Juntei os dois mocks num só: o mock de
`rpc` empilha em `rpcCalls` (prova do `set_conversation_status`) e, quando o nome é
`transfer_conversation`, empilha também em `transferRpcCalls` e responde `transferRpcResult`.
Nenhum teste do cartão de transferência foi afrouxado.

## Prova
- verde depois: `npx vitest run src/hooks/chat/__tests__/useConversationActions.test.ts src/hooks/inbox/__tests__/useInboxBulkActions.test.ts src/hooks/__tests__/useBulkActions.archive-fsm.test.tsx src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx` → `Test Files 4 passed (4); Tests 54 passed (54)`
- vermelho antes: na base, `archiveContact` fazia `supabase.from('contacts').update({ assigned_to: null })` e o em massa usava `status: 'archived'`; o teste do RPC (`expect(rpcCalls).toEqual([...set_conversation_status...])`) não teria a chamada — é exatamente o caminho que o diff troca.
- contrato conferido: `zapp-esquema set_conversation_status` → `função set_conversation_status({ p_contact_id: string; p_next: string; p_reason?: string })`, que casa com os argumentos usados.

## Ponto do juiz: arquivo fora da lista (ContactDetails.quickActions.test.tsx)
- O juiz apontou que `src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx` não está
  em `src/hooks/**/__tests__/`. É **indispensável**: é o teste EXISTENTE que cobre o caminho do MENU
  ("Arquivar" na ficha do contato), um dos caminhos do CRITÉRIO 1. Ele afirmava
  `expect(h.update).toHaveBeenCalledWith({ assigned_to: null })` — exatamente o comportamento REMOVIDO
  pelo fix. Sem ajustá-lo, a suíte ficaria vermelha e o teste passaria a exigir o defeito. Por isso o
  assert foi trocado pela chamada RPC real (`set_conversation_status`, `archived`/`open`) e
  `expect(h.update).not.toHaveBeenCalled()`. Não é escopo novo: é o mesmo defeito provado pelo menu,
  veio junto da entrega aprovada anterior (commit `42a10859a`).

## O que NÃO fiz e por quê
- Não toquei na RPC/migration `set_conversation_status`: ela veio do cartão pai, fora do diff.
- Não reimplementei nada: o conteúdo de produção é o mesmo já aprovado (cherry-pick), só o
  mock do teste foi reconciliado com a base nova.
