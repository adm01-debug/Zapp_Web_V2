Especialista: Edgar (area-edge-api)

## Sensibilidade
- Toca `service_role`: o caminho afetado é o de entrega da mensagem (Edge `message-delivery`), que roda com service_role — e é exatamente por isso que a chamada removida falhava. Nenhuma proteção foi afrouxada: a mudança RETIRA uma chamada de RPC; nada de `rateLimit`, `requireRole`, `verifyHmac` ou `DELETE` foi alterado.
- Caso negado provado: o trigger `trg_messages_sla_first_response` (fire dentro de `complete_outbound_message` quando a mensagem vira 'sent') já registra o SLA; o teste de banco `scripts/db-audit/sla-first-response-delivery-contract.test.mjs` roda os 4 cenários e passa (inclui "envio pendente confirmado depois", "retentativa após falha", "resposta dentro do prazo").
- Nenhuma referência ao banco/endpoint de produção; nada de push/deploy.
- O que muda para quem chama: (a) `send-scheduled-report` com `type=sla_compliance` devolve campos novos (`evaluatedConversations`, `onTimeResponses`, `pendingResponses`, `responseBreaches`, `responseComplianceRate`) e deixa de devolver `totalConversations`, `resolutionComplianceRate`, `resolutionBreaches`; (b) `message-delivery` deixa de emitir o log `message_delivery_metric_error` (não havia mais o que logar).

## O que mudou e por quê
Arquivos tocados no commit: 2 de código (as duas Edge Functions) + 2 de teste (os dois `index.test.ts`) + este relato.
- `supabase/functions/send-scheduled-report/index.ts`: o ramo `sla_compliance` passa a contar pela MESMA regra de elegibilidade do painel/histórico (`src/hooks/sla/slaFirstResponse.ts`, R2-SLA-001/#458): AVALIADA = com desfecho; PENDENTE = sem desfecho (fora do numerador E do denominador); taxa = no prazo / avaliadas; sem nenhuma avaliada a taxa é `N/A` (nunca 100%). Novo helper `tallyFirstResponse` espelha `classifyFirstResponse` (a violação manda sobre o carimbo). Removida a taxa de resolução do relatório (`resolutionComplianceRate`/`resolutionBreaches`), que estava fora do escopo e contava o registro errado.
- `supabase/functions/message-delivery/index.ts`: removida a chamada `service.rpc('mark_first_response')` do caminho de entrega. Era redundante (o trigger já grava o SLA dentro de `complete_outbound_message`) e sempre falhava com 42501: a RPC exige `auth.uid()` e este caminho roda com service_role (uid nulo). Nenhum ramo de erro mudou além de sumir esse log de métrica.
- Testes: `supabase/functions/send-scheduled-report/index.test.ts` e `supabase/functions/message-delivery/index.test.ts` alterados — o primeiro com os novos casos de SLA, o segundo com uma guarda de contrato (a RPC não pode voltar); `serviceMock` passou a aceitar `slaRows`.

## Prova
- vermelho antes (SLA, código antigo via `git stash` no `index.ts`): `deno test --config scripts/ci/deno.json --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/send-scheduled-report/index.test.ts` → `sla: pendente não entra... FAILED`, `sla: sem nenhuma avaliada... FAILED`, `sla: taxa = no prazo / avaliadas... FAILED` (só os casos novos de SLA).
- verde depois (mesmo comando): `ok | 18 passed | 0 failed (37ms)`.
- vermelho/verde da guarda do message-delivery: com a RPC presente → `FAILED | 8 passed | 1 failed`; com a RPC removida → `ok | 9 passed | 0 failed (22ms)`.
- prova do trigger (banco local, Docker): `node --test scripts/db-audit/sla-first-response-delivery-contract.test.mjs` → `tests 4 / pass 4 / fail 0`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (dependencias/db_guard/tipos/lint/migrations OK).

## O que NÃO fiz e por quê
- Não removi a RPC `mark_first_response` do banco: ela ainda está exposta a `authenticated` e não é assunto deste cartão.
- Não alterei as telas/painéis (`src/hooks/sla/*`): a regra única já vive lá; o cartão só pediu o relatório.
