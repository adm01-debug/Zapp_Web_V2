Task t_e3cf292c: [refazer 2] Aplicar base original do outbox inbound #69 antes do rollback
  status:    running
  assignee:  senior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_e3cf292c
  max-retries: 2 (default)
  created:   2026-10-11 14:46 by user
  started:   2026-10-11 19:32

Body:
REFAZER (rodada 2 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: retirado pelo limpador: quebra o ESPELHO DO CI no empilhamento (node: docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir); correção em t_dbe2acf3

O QUE CORRIGIR: Reproduza a falha com `zapp-verify full .`, corrija e feche de novo.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/aplicar-base-original-outbox-inbound-69--26100705180667` (commit 089267260) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
· área migrations ·

PROBLEMA
O cartão t_a4bd1b27 não cabe no portão porque mistura o conteúdo original do outbox inbound #69 com a correção nova do rollback: medido em 98170 chars, acima do teto de 90000. A primeira parte precisa entrar sozinha: o conteúdo já entregue no commit c29325db0 da branch v2/fromme-outbox-efeitos-inbound-69-2610060851cef8, que inclui a migration 20261005224959_inbound_message_effects_outbox.sql, evolution-webhook-messages.ts e os testes do contrato fromMe=false. Não reescreva a solução; aproveite os commits anteriores do #69 e mantenha o contrato do outbox.

DECISÃO FECHADA
Este cartão é apenas a base original do #69. A correção do rollback executável e a decisão medida do deployment-manifest ficam para o cartão seguinte, dependente deste. A proteção permanece: talkx_reply e multiplix_reply só nascem quando fromMe=false; fromMe=true não cria esses efeitos.

TRABALHO ANTERIOR A APROVEITAR
- Branch: v2/fromme-outbox-efeitos-inbound-69-2610060851cef8
- Commit alvo: c29325db0
- Se precisar reaproveitar a primeira passada recusada, ela veio antes no próprio histórico do #69; não traga commits de outro trabalho.

ARQUIVOS QUE PODE TOCAR
- scripts/db-audit/inbound-effects-replay.test.sh
- supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts
- supabase/functions/_shared/__tests__/talkx-webhook-optout.test.ts
- supabase/functions/_shared/__tests__/talkx-webhook-reply.test.ts
- supabase/functions/_shared/evolution-webhook-messages.ts
- exatamente 1 migration nova em `supabase/migrations/*_inbound_message_effects_outbox.sql`, reaproveitando a migration ainda não integrada do commit c29325db0
Fora desta lista: não tocar. Achado em outro arquivo vira comentário no cartão.

CRITÉRIO DE PRONTO
1. O conteúdo original do outbox inbound #69 fica aplicado sem a correção nova do rollback do cartão seguinte; o diff não inclui d4009c410 nem faddbd58a como correção extra.
2. A migration única do cartão cria o contrato do outbox preservado no relato anterior: tabela inbound_message_effects, chave idempotente, efeitos optout_suppress/talkx_reply/multiplix_reply, RLS sem policy e permissões service_role.
3. ingest_inbound_message com p_from_me obrigatório preserva a regra fromMe=false: payload fromMe=true não enfileira talkx_reply nem multiplix_reply, e payload fromMe=false continua enfileirando os efeitos aplicáveis com idempotência.
4. `scripts/db-audit/inbound-effects-replay.test.sh` fica verde em banco local descartável e prova o item 3.
5. A prova vermelho→verde do defeito fromMe=true fica registrada no relato com comandos e resultados reais, reaproveitada ou reexecutada.
6. O diff medido do fechamento fica abaixo de 90000 caracteres; se ficar acima, registrar a medição exata no cartão e não tentar comprimir teste nem afrouxar escopo.
7. `zapp-verify . --rapido` fica verde.

Feche com relato ponto a ponto indicando que a correção executável do rollback ficou fora deste cartão por decomposição deliberada do diff.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Comments (1):
  [2026-10-11 14:47] default: [jev-entrada] rota=complexo (conf 0.97 → automatico, p_humano=0.01), faixa=migrations, injeção=0.26, ação externa=0.11 — REFAZER: complexo → senior

Events (40):
  [2026-10-11 19:46] [run 10584] heartbeat
  [2026-10-11 19:47] [run 10584] heartbeat
  [2026-10-11 19:48] [run 10584] heartbeat
  [2026-10-11 19:48] [run 10584] heartbeat {'note': 'zapp-verify full em execução; já passou db_guard, tipos, lint e migrations, aguardando suites finais.'}
  [2026-10-11 19:49] [run 10584] heartbeat
  [2026-10-11 19:50] [run 10584] heartbeat
  [2026-10-11 19:51] [run 10584] heartbeat
  [2026-10-11 19:52] [run 10584] heartbeat
  [2026-10-11 19:53] [run 10584] heartbeat
  [2026-10-11 19:54] [run 10584] heartbeat
  [2026-10-11 19:55] [run 10584] heartbeat
  [2026-10-11 19:56] [run 10584] heartbeat
  [2026-10-11 19:57] [run 10584] heartbeat
  [2026-10-11 19:58] [run 10584] heartbeat
  [2026-10-11 19:59] [run 10584] heartbeat
  [2026-10-11 20:00] [run 10584] heartbeat
  [2026-10-11 20:01] [run 10584] heartbeat
  [2026-10-11 20:02] [run 10584] heartbeat
  [2026-10-11 20:04] [run 10584] heartbeat
  [2026-10-11 20:05] [run 10584] heartbeat

Runs (1):
  #10584 running      @senior  active  2026-10-11 19:32
