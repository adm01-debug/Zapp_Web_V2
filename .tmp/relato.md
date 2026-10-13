Especialista: Edgar (area-edge-api)

## Sensibilidade
- Toca: `supabase/functions/send-rate-limit-alert/index.ts` (Edge Function) — caminho de segurança/rate limit. NÃO criei nem alterei `rateLimit`, `requireRole`, `verifyHmac`, policy, RLS, `DELETE` nem grant; reuso o `requireInternalAuth` (HMAC `timingSafeEqual`) e o cliente service-role que já existiam, sem afrouxar.
- Nada saiu do sistema: nenhum export/import/edição em massa, nenhuma dependência nova, sem DDL.
- Contrato com quem chama: o corpo do 200 continua exatamente `{ success: true, message: "Alert processed" }`; o 401/500 não mudam. Quem chama não precisa mudar nada.

## Fatos do diff (conferem com `git show --stat HEAD`)
- 4 arquivos no commit: `supabase/functions/send-rate-limit-alert/index.ts` (código), `supabase/functions/send-rate-limit-alert/index.test.ts` (mocks ajustados), `supabase/functions/send-rate-limit-alert/__tests__/dedupe.test.ts` (novo) e `.tmp/relato.md`. Ou seja: 2 arquivos de teste.
- 5 casos de teste novos em `__tests__/dedupe.test.ts`.

## O que mudou e por quê
- `supabase/functions/send-rate-limit-alert/index.ts`: antes, cada chamada criava um `security_alerts` novo E um lote de `notifications` para todo admin, sem janela. Agora, antes de inserir, procura um alerta de rate limit ABERTO (`is_resolved = false`) do mesmo `(ip_address, endpoint)` criado dentro da janela (padrão 30 min, `deps.dedupeWindowMinutes` ou env `RATE_LIMIT_ALERT_WINDOW_MINUTES`):
  - encontrado e sem escalada → faz `UPDATE` do mesmo alerta (`request_count` e `last_seen_at` no `metadata`, `description` atualizada) e **não** cria alerta nem notificação;
  - encontrado e com escalada (warning/medium → blocked/high) → `UPDATE` promovendo `alert_type`/`severity`/`title` e envia a notificação;
  - não encontrado → cria o alerta (comportamento antigo) e notifica.
  - A notificação aos admins só sai na CRIAÇÃO ou na ESCALADA — nunca na atualização de rotina.
  - Ramo de erro novo: falha ao LER os alertas abertos é logada e o fluxo SEGUE criando alerta novo (fecha para o lado de alertar, nunca suprime alerta); erro no `UPDATE`/`INSERT` continua lançando (500), como antes.
- `supabase/functions/send-rate-limit-alert/index.test.ts`: os mocks ganharam `gte`/`order`/`limit` e devolvem `[]` para `security_alerts` no `select` (a leitura de dedupe), preservando os 11 testes de auth/bloqueio já existentes.
- `supabase/functions/send-rate-limit-alert/__tests__/dedupe.test.ts` (novo): mock com estado (linhas de `security_alerts` de verdade) e relógio injetável via `deps.now`.

## Prova
- vermelho antes: `git stash push -- supabase/functions/send-rate-limit-alert/index.ts` + `deno test --no-check supabase/functions/send-rate-limit-alert/__tests__/dedupe.test.ts` → 4 FAILED / 1 ok ("3 chamadas ... → 1 alerta" FAILED; "escalada warning→blocked ..." FAILED; "fora da janela (31 min) cria novo" FAILED; "blocked=true com falha de gravação NÃO escala" FAILED); a base não conhece `deps.now`/`dedupeWindowMinutes` (TS2353).
- verde depois: `deno test supabase/functions/send-rate-limit-alert` → `ok | 15 passed | 0 failed (375ms)`.

## Casos de borda cobertos pelo teste
- Mesmo `(ip, endpoint)` 3× seguidas → 1 linha em `security_alerts`, 1 lote de `notifications`, `metadata.request_count` = último valor, `last_seen_at` gravado.
- `(ip, endpoint)` diferente → não reaproveita o alerta aberto.
- Janela: 29 min depois → atualiza (1 alerta); +31 min desde a CRIAÇÃO → cria novo (2 alertas). A janela conta da criação, então ela é limitada (não escorrega para sempre).
- `blocked=true` com falha de gravação de `blocked_ips` → segue warning (sem escalada) e sem nova notificação.

## O que NÃO fiz e por quê
- Sem migration: a leitura de dedupe usa `ip_address`/`is_resolved`/`created_at` sobre índices já existentes (`idx_security_alerts_created`, `idx_security_alerts_type`). `hermes-db-migrar --nova=security_alerts_dedupe` saiu com código 2 e saída vazia (sem criar arquivo); como não há necessidade real de índice, não criei migration nem DDL.
- Não decidi quem chama a Edge: isso é do PE-102 (t_c2f65e14). Aqui a Edge apenas passa a ser idempotente por janela quando a chamada chegar.
- Sem telefone e sem texto de conversa no alerta (não havia e não adicionei).
