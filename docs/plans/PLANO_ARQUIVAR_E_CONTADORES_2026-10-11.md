# Plano: "Arquivar" de verdade e contadores dos chips pela regra da lista

Decisões do Joaquim (11/10/2026), sobre o badge Arquivadas (`PLANO_BADGE_ARQUIVADAS_2026-10-11.md`):
1. "Arquivar" passa a gravar o estado `archived`, **em ordem segura**: primeiro a reabertura automática quando o cliente escreve, depois o arquivamento.
2. Os contadores dos outros chips passam a usar o status real, o mesmo critério da lista.

## Fatos verificados
- `public.set_conversation_status(p_contact_id, p_next, p_reason)` existe em produção (SECURITY DEFINER, executável por `authenticated`, autorização por `require_contact_edit_permission`) e **nada no front a chamava**.
- `ingest_inbound_message` não reabria conversa fechada (SL-079 provado e bloqueado esperando decisão; a flag `inbox.status-fsm` está ligada em produção).
- O ADR-005 permite `archived -> open` por mensagem inbound ou agente; `resolved` e `archived` só voltam para `open`.
- A lista (`useInboxFilters`) já usava `conversation_status`; os chips usavam proxies antigos. Banco: 3.631 `open`, 17 `resolved`, 0 `waiting`, 0 `archived`. Efeito esperado: Resolvidas ~497 → real, Aguardando → 0 (correto).
- Decisão de desenho: arquivar **não** mexe em `assigned_to`; reabrir devolve ao mesmo responsável.

## Cartões
| Id | Cartão | Perfil | O quê | Depende de |
|---|---|---|---|---|
| E1 | `t_598cbd7d` | workersql | migration: `ingest_inbound_message` reabre resolved/archived (destrava SL-079) | – |
| E2 | `t_a4e3109e` | hugo | Arquivar (individual, massa, atalho) grava `archived` via RPC, Desfazer reabre | E1 |
| H1 | `t_9637c51a` | hugo | `countByChip` e predicados compartilhados com a lista | B2 |
| I1 | `t_a05d4ef4` (refazer `t_7d4d9088`) | iris | `StatusChips` usa `countByChip` | B1, H1 |
| W1 | `t_79ca0cf1` | workersql | `set_conversation_status` permite `waiting -> archived` | – |

## Riscos
- A migration só vai para produção na promoção do Joaquim; **E2 não deve ser promovido sem E1 e W1**.
- Aguardando mostrará 0 enquanto nenhuma conversa estiver `waiting` (falta o preenchimento inicial do ADR passo 4 em produção; cartão não criado, sem aprovação).

## Validação (11/10)
- E1 aprovado no código: reabre só mensagem realmente inserida, só com a flag ligada, não toca `assigned_to`, rollback e grants preservados, teste com 5 casos.
- E2 aprovado no código: todos os caminhos de arquivar usam a RPC; nenhum grava status direto nem mexe no responsável.

## Adendo (11/10, validação do E2)
- A RPC `set_conversation_status` de produção **recusa `waiting -> archived`** (o ADR-005 e o gatilho FSM permitem). Cartão corretivo **W1** (`t_79ca0cf1`, workersql): migration que acrescenta só essa transição, com rollback, grants preservados e teste. **O E2 não deve ser promovido para produção sem o W1**, senão arquivar uma conversa em `waiting` falha.
