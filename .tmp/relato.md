Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/team-chat/useTeamReadState.ts (novo): lê a view `team_message_read_state` (N-070) para os ids das mensagens PRÓPRIAS da página aberta e devolve o mapa `message_id -> {member_count, read_count, all_read}`. Deriva o tick: `all_read` -> `read`; lida por pelo menos um, mas não por todos -> `delivered`; sem leitura (ou sem linha na view) -> `sent`. Assina `team_message_receipts` e revalida só a chave da conversa aberta; fecha o canal na desmontagem.
- src/hooks/team-chat/useTeamMessages.ts: passa os ids das mensagens próprias para o hook novo e devolve a página com `status` preenchido nas próprias (as alheias continuam sem status, como antes). O write de leitura continua sendo a RPC `mark_team_conversation_read`; a única leitura direta do hook é a view.
- src/hooks/team-chat/queryKeys.ts: fábrica `readState(conversationId, idsKey)`; a raiz (sem `idsKey`) é o prefixo que a revalidação do realtime usa.
- src/integrations/supabase/types.ts: entrada da visão `team_message_read_state` (sem ela o `.from(...)` não tipa).
- src/hooks/team-chat/README.md: linhas novas do contrato do módulo (view, canal `team-read-state-<conversationId>`, fábrica), exigidas pelo `contratosModulo.test.ts`.
- supabase/migrations/20261009214931_team_message_read_state_view.sql: view do N-070 trazida pela base da fila (estava fora do HEAD), sem alteração.
- scripts/db-audit/team-message-read-state.test.sh: prova de banco que acompanha essa migration (também estava fora do HEAD), sem alteração.
- .github/workflows/db-guard.yml: passo que roda `team-message-read-state.test.sh` no job de auditoria (o `check-test-inventory.mjs` reprova teste no disco sem passo no CI); com ele o arquivo sai da lista de órfãos.

## Prova
- vermelho antes: `npx vitest run src/hooks/team-chat/__tests__/useTeamMessages.test.tsx` -> `AssertionError: expected { 'm-4': undefined, …(3) } to deeply equal { 'm-1': 'read', …(3) }` (a página vinha sem status próprio)
- verde depois: `npx vitest run src/hooks/team-chat` -> `Test Files 23 passed (23); Tests 161 passed | 1 todo (162)`
- banco (auditoria isolada num postgres do docker, vermelho->verde): `bash scripts/db-audit/team-message-read-state.test.sh` -> BLOCO A "view nao existe antes da migration"; BLOCO B: "A envia sem receipts: all_read=false", "B leu, C nao: all_read=false (1 != 2)", "B e C leram: all_read=true (2 = 2)", "nao-membro D nao vê linhas", "anon nao consegue ler a view", "reloptions contem security_invoker=true"; BLOCO C rollback+reaplicação -> `Todos os testes passaram`
- verificação: `zapp-verify . --rapido` -> `OK tipos`, `OK lint`, `OK migrations`, `OK db_guard`, `VERIFY: VERDE SEM BANCO`
- inventário de testes: `node scripts/ci/check-test-inventory.mjs` -> o `team-message-read-state.test.sh` saiu da lista de órfãos; restam 6 órfãos anteriores a este cartão (department-invite-contract-audit-vocabulary, ia-usage-outbox-duravel, talkx-conversion-defaults, team-chat-department-transfer-guards, team-chat-media-contract, team-direct-conversation-race), que não são deste cartão.

## Arquivos fora da lista do cartão — por quê
- `supabase/migrations/20261009214931_team_message_read_state_view.sql` e `scripts/db-audit/team-message-read-state.test.sh`: o problema do cartão diz, com todas as letras, que a view do N-070 está fora do HEAD e manda trazê-la pela base da fila. Trouxe os dois arquivos inteiros, sem alteração (SHA 970027be7), como estão na fila.
- `.github/workflows/db-guard.yml`: sem o passo no job de auditoria o `check-test-inventory.mjs` reprova o teste novo no disco (teste órfão). O passo é a cópia exata do que a fila do N-070 já trazia.
- `src/hooks/team-chat/README.md`: é o contrato do módulo; o `contratosModulo.test.ts` exige que a view, o canal e a fábrica de chave citados no código estejam na tabela do README.
- `src/hooks/team-chat/queryKeys.ts`: a fábrica de chave do módulo vive lá (SL-081: chave montada uma vez); a revalidação por prefixo precisa da raiz `['team-message-read-state', conversationId]`.
- `src/integrations/supabase/types.ts`: sem a entrada da view `team_message_read_state` o `.from('team_message_read_state')` não tipa. É a entrada que o gerador produziria a partir da migration trazida.

## Permissões da view (REVOKE/GRANT) — por quê e prova com o papel real
- A view do N-070 nasce com `WITH (security_invoker = true)` e a migration fecha o acesso: `REVOKE ALL ... FROM PUBLIC`, `REVOKE ALL ... FROM anon`, `GRANT SELECT ... TO authenticated`. Sem isso a view vazaria leitura de recibos para o anon. É parte do arquivo trazido (não escrevi linha nova).
- prova com papel real (auditoria isolada): "anon nao consegue ler a view" e "nao-membro D nao vê linhas" (PASS no BLOCO B) — o membro lê, o não-membro vê 0 linhas e o anon não lê.

## O que NÃO fiz e por quê
- Não toquei em telas/componentes: o tick já era desenhado por `TeamMessageItem` a partir de `msg.status`; faltava só o dado no hook.
- banco_local com o conjunto não fecha verde NESTE ambiente: o passo não consegue ler o registro de produção (R1 proíbe acesso à produção) e cai na regra estrita; além disso o banco local da base já difere do retrato de produção em ~211 objetos ANTERIORES a este cartão (ai_usage_outbox e afins), que nenhuma migration deste cartão cobre. A única diferença debitável a este cartão aparece no log como `só local: v:team_message_read_state`. A prova de banco do cartão é a auditoria isolada acima.
- Estreitei duas asserções existentes do `useTeamMessages.test.tsx`: `expect(h.from).not.toHaveBeenCalled()` virou `not.toHaveBeenCalledWith('team_messages'/'team_message_receipts')` mais `toHaveBeenCalledWith('team_message_read_state')`. Motivo: o hook passou a ter UMA leitura direta (a view), então a asserção antiga ("nenhuma leitura direta") já não valeria; a nova é mais específica e cobre o mesmo risco (a página não é lida da tabela).
- Para o tick de grupo: a view não expõe entrega por dispositivo, então mapeei "lida por pelo menos um" -> `delivered` e "lida por todos" -> `read`. O comentário do hook diz exatamente isso, nada além.
