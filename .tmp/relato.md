Especialista: workersql
Executor do refazer: senior (area-sql-banco)

Aviso do juiz sobre arquivos fora da lista:
- scripts/db-audit/enqueue-connection-scope.test.sh é indispensável porque a própria recusa exigiu prova SQL que falha sem a correção, incluindo DORA fora da fila em g_fila, rollback executado e tipos/claim de grupo. Sem esse arquivo, o defeito de banco ficaria provado só por leitura de SQL, que o revisor recusou.
- src/adapters/evolutionAdapter.ts é indispensável por typecheck: o contrato NormalizedRealtimeMessage já consumido pelo front ganhou whatsapp_group_id no tipo gerado de messages; o adaptador real que constrói esse shape precisava preencher o campo como null no caminho legado de Evolution, sem mudar comportamento visual.

Ponto 1: rollback real e executável da migration de grupo.
- O que mudei: supabase/migrations/20261011155946_enqueue_group_outbound_message.sql agora traz, no cabeçalho, o rollback executável que recria public.claim_outbound_message com o corpo anterior completo, remove a RPC nova, os índices, o CHECK e a coluna whatsapp_group_id. O teste extrai esse bloco do próprio arquivo e executa no Postgres descartável.
- Prova vermelha antes: com a migration anterior e os testes novos, o script falhou em C1a antes de chegar ao rollback: [FAIL] C1a DORA fora da fila nao enfileira em g_fila sem conexao explicita (sem oraculo): deveria falhar, mas passou.
- Prova verde depois: bash scripts/db-audit/enqueue-connection-scope.test.sh -> [PASS] E1 a coluna whatsapp_group_id foi removida; [PASS] E2 a RPC de grupo foi removida; [PASS] E3 os indices de grupo foram removidos; [PASS] E3b o CHECK de destino unico foi removido; [PASS] E4 claim volta ao corpo so-de-contato (sem whatsapp_group_id); [OK] rollback da migration de grupo executado e verificado.

Ponto 2: prova SQL do acesso ao grupo por fila/conexão, sem oracle e sem mock.
- O que mudei: na RPC public.enqueue_group_outbound_message, a visibilidade do grupo agora nega usuário comum fora da fila quando a conexão do grupo, ou a conexão resolvida para grupo sem conexão, tem vínculo em public.whatsapp_connection_queues. A resposta é message_group_not_authorized, igual a grupo inexistente, para não enumerar grupos. Mantive a guarda L7 da conexão efetivamente usada no envio quando ela difere da conexão própria do grupo.
- O que mudei no teste: scripts/db-audit/enqueue-connection-scope.test.sh agora cria g_fila, g_free e g_sem_conn; cobre DORA fora da fila com conexão nula e com conn_fila, CARLA membro da fila, ADM, grupo sem conexão, conexão sem fila, idempotência, claim/complete e regressão do contato.
- Prova vermelha antes: com a migration anterior e os testes novos, DORA enfileirou em g_fila sem conexão explícita e o script parou com [FAIL] C1a DORA fora da fila nao enfileira em g_fila sem conexao explicita (sem oraculo): deveria falhar, mas passou.
- Prova verde depois: bash scripts/db-audit/enqueue-connection-scope.test.sh -> [PASS] C1a DORA fora da fila nao enfileira em g_fila sem conexao explicita (sem oraculo); [PASS] C1b DORA fora da fila nao enfileira em g_fila nem escolhendo a propria conexao da fila; [PASS] C1c as recusas de visibilidade de grupo nao gravaram mensagens; [PASS] C2 CARLA enfileira mensagem para o grupo -- permitido, 1 linha; [PASS] C2b ADM (admin/supervisor) enfileira no grupo da fila -- permitido; [PASS] C16 DORA envia para grupo de conexao sem fila -- permitido; [OK] enfileiramento e delivery de grupo (whatsapp_group_id) verificado.

Ponto 3: types.ts reflete o novo contrato de mensagens/RPC.
- O que mudei: src/integrations/supabase/types.ts agora expõe messages.whatsapp_group_id em Row/Insert/Update, a relação messages_whatsapp_group_id_fkey para whatsapp_groups, a RPC enqueue_group_outbound_message e o retorno com whatsapp_group_id. src/adapters/evolutionAdapter.ts recebeu o campo whatsapp_group_id: null para manter o shape NormalizedRealtimeMessage tipado no caminho existente.
- Prova: bun run typecheck -> $ tsc -b --force, exit 0.
- Observação do fluxo de geração: tentei validar o fluxo local com supabase db start && bash scripts/db-audit/gen-types.sh --local .tmp/types.local.generated.ts; ele falhou antes desta migration, em uma migration legada de cron job inexistente no banco local descartável. Não usei produção nem DESTINO_URL.

Ponto transversal: invariantes de estrutura e segurança da migration.
- O que mudei: a coluna nova recebeu FK para public.whatsapp_groups, índice de FK, índice único parcial de idempotência por grupo, CHECK que impede contact_id e whatsapp_group_id simultâneos em mensagens novas, e a RPC nova usa SECURITY DEFINER com SET search_path = pg_catalog, public e EXECUTE só para authenticated.
- Prova verde: bash scripts/db-audit/enqueue-connection-scope.test.sh -> [PASS] D1 whatsapp_group_id e FK para whatsapp_groups; [PASS] D2 indice unico parcial de idempotencia de grupo existe; [PASS] D3 RPC de grupo e SECURITY DEFINER com search_path fixo; [PASS] D4 RPC de grupo so tem EXECUTE para authenticated; [PASS] D5 RPC de grupo fixa search_path em pg_catalog,public; [PASS] D6 CHECK impede mensagem com contact_id e whatsapp_group_id ao mesmo tempo; [PASS] D7 CHECK recusa destino duplo na mesma mensagem.

Arquivos do diff:
.tmp/relato.md
scripts/db-audit/enqueue-connection-scope.test.sh
src/adapters/evolutionAdapter.ts
src/integrations/supabase/types.ts
supabase/migrations/20261011155946_enqueue_group_outbound_message.sql

Comandos de verificação executados:
- bash scripts/db-audit/enqueue-connection-scope.test.sh 2>&1 | tee .tmp/green-enqueue-group.log -> exit 0; terminou com [OK] contrato de escopo de conexao no enfileiramento verificado, [OK] enfileiramento e delivery de grupo (whatsapp_group_id) verificado e [OK] rollback da migration de grupo executado e verificado.
- bun run typecheck 2>&1 | tee .tmp/typecheck.log -> exit 0; saída: $ tsc -b --force.
- git diff --cached --check -> exit 0.
- varredura dos arquivos do diff pelo identificador do banco de produção -> prod-id-ausente-nos-arquivos-do-diff.
- hermes-tarefa-fechar "fix(banco): corrige refazer envio de grupo" .tmp/relato.md -> verificação rápida OK db_guard; OK tipos; OK lint; OK migrations.

O que não fiz:
- Não toquei produção, não rodei DESTINO_URL e não fiz deploy/push.
- Não mexi em CI, guardas ou manifestos para “fazer passar”.
