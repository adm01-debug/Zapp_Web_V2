# Plano: "Arquivar" de verdade e contadores dos chips pela regra da lista

Decisões do Joaquim (11/10/2026), sobre o badge Arquivadas (`PLANO_BADGE_ARQUIVADAS_2026-10-11.md`):
1. "Arquivar" passa a gravar o estado `archived`, **em ordem segura**: primeiro a reabertura automática quando o cliente escreve, depois o arquivamento.
2. Os contadores dos outros chips passam a usar o status real, o mesmo critério da lista.

## Fatos verificados
- `public.set_conversation_status(p_contact_id, p_next, p_reason)` existe em produção (SECURITY DEFINER, executável por `authenticated`) e **nada no front a chama**.
- `ingest_inbound_message` não reabre conversa fechada (SL-079 provado e bloqueado há ~60 h esperando decisão; a flag `inbox.status-fsm` está ligada em produção).
- O ADR-005 permite `archived -> open` por mensagem inbound ou agente; `resolved` e `archived` só voltam para `open`.
- A lista (`useInboxFilters`) já usa `conversation_status`; os chips usam proxies antigos. Banco: 3.631 `open`, 17 `resolved`, 0 `waiting`, 0 `archived`. Efeito esperado: Resolvidas ~497 → real, Aguardando → 0 (correto; relatar).
- Decisão de desenho: arquivar **não** mexe em `assigned_to`; reabrir devolve ao mesmo responsável.

## Cartões (além de B1 e B2 já criados)
| Id | Perfil | O quê | Depende de |
|---|---|---|---|
| E1 | workersql | migration: `ingest_inbound_message` reabre resolved/archived (destrava SL-079) | – |
| E2 | hugo | Arquivar (individual, massa, atalho) grava `archived` via RPC, Desfazer reabre | E1 |
| H1 | hugo | `countByChip` e predicados compartilhados com a lista | B2 |
| I1 | iris | `StatusChips` usa `countByChip` | B1, H1 |

## Riscos
- A migration só vai para produção na promoção do Joaquim; até lá E2 não deve ser promovido sem E1.
- Aguardando mostrará 0 enquanto nenhuma conversa estiver `waiting` (falta backfill do ADR passo 4 em produção).

## Validação
Código da branch viva (RPC usada em todos os caminhos de arquivar, nenhum update direto de status, contador = tamanho da lista por teste de consistência, grants da função preservados), fila do integrador e relatório ao Joaquim.

## Adendo (11/10, validação do E2)
- A RPC `set_conversation_status` de produção **recusa `waiting -> archived`** (o ADR-005 e o gatilho FSM permitem). Cartão corretivo **W1** (`t_79ca0cf1`, workersql): migration que acrescenta só essa transição, com rollback, grants preservados e teste. **O E2 não deve ser promovido para produção sem o W1**, senão arquivar uma conversa em `waiting` falha.
