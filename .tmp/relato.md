Especialista: edgar

## O que mudou
Arquivo: `supabase/functions/revoke-auth-sessions/index.ts` (+ `index.test.ts`).

1. Matriz de papéis (critério 1). O papel do chamador e do alvo saem de
   `effective_role(_user_id)` (mesma fonte das policies; precedência
   admin > supervisor > special_agent > agent), consultado pela service role.
   A decisão vive na função pura `decideThirdPartyRevocation`:
   - admin -> revoga a sessão de admin, supervisor ou agente;
   - supervisor -> SÓ revoga a de agentes (`agent`/`special_agent`); nunca de
     admin nem de outro supervisor (antes: `is_admin_or_supervisor` deixava um
     supervisor derrubar um admin);
   - agente/outros -> 403 (só a própria sessão);
   - papel não confirmado (RPC com erro ou valor fora dos 4) -> nega (fail-closed).
   A própria sessão nunca é barrada, de qualquer papel.
   Antes eu chamava `is_admin_or_supervisor` (booleano "admin OU supervisor"), que
   tratava supervisor como admin na revogação de terceiro.

2. Auditoria (critério 2). Toda revogação bem-sucedida grava uma linha em
   `audit_logs` pela service role (`recordRevocationAudit`), só APÓS o RPC ter
   efeito. A linha (`buildRevocationAudit`) traz ator, alvo, escopo e resultado:
   `user_id` = chamador autenticado (quem agiu), `action` = "auth_sessions_revoke",
   `entity_type` = "auth_session", `entity_id` = sessão alvo no escopo local,
   `details` = { scope, target_user_id, revoked }. Sem token/JWT/sessão em claro;
   o IP vem de `getClientIP`. Falha ao auditar não desfaz o que já foi revogado:
   é logada e devolvida como `audited: false` (não é engolida).

## Prova (comandos rodados agora)
- Diff: 3 arquivos alterados; 1 deles de teste; 16 casos de teste novos (25 no total).
- `deno test supabase/functions/revoke-auth-sessions/index.test.ts` ->
  `ok | 25 passed | 0 failed (17ms)` (eram 9; +16 casos novos).
- Vermelho por mutação: tirando a checagem de alvo do supervisor, 3 casos da
  matriz falham (`FAILED | 22 passed | 3 failed`); recolocando, volta a 25/0.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (200s)`; `db_guard`, `tipos`,
  `lint` e `migrations` OK. (banco não verificado: sem nome de conjunto).

## Critério de pronto
1. Matriz de papéis aplicada — testes "matriz: supervisor → admin é 403",
   "supervisor → agente é permitido", "admin → qualquer é permitido",
   "agente → outro agente é 403" e "papel desconhecido nega (fail-closed)".
2. Auditoria em toda revogação — `recordRevocationAudit` no caminho de sucesso,
   com testes de ator/alvo/escopo e de falha do insert devolvida.
3. `zapp-verify . --rapido` verde (linha acima).

## Notas
- Sem dependência nova, sem migration (a matriz é da Edge; a primitiva SQL
  `revoke_auth_sessions` continua self-only fora do global).
- Alinhado ao SS1 (`t_3c129d07`, Edge nova de sessões de outro usuário): lá a
  mesma matriz deve valer; aqui não dupliquei a Edge, só a regra no endpoint atual.
