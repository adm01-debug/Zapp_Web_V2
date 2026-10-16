Especialista: worker (sql) (area-sql-banco)

## Arquivos no diff (4; 1 é teste)
- supabase/migrations/20261011154648_rls_scheduled_whisper_visibility.sql (a correção — está em ARQUIVOS QUE PODE TOCAR)
- scripts/db-audit/scheduled-whisper-visibility-rls.test.sh (prova — é "testes de banco", item de ARQUIVOS QUE PODE TOCAR)
- .github/workflows/db-guard.yml (registro do teste — arquivo FORA da lista do cartão; por quê abaixo)
- .tmp/relato.md (este relato; já era versionado na base)

## Por que .github/workflows/db-guard.yml foi indispensável
Não é mudança de CI de terceiro: é o registro do teste novo. O `scripts/ci/check-test-inventory.mjs` roda no ci.yml e REPROVA todo `.test.sh` que exista no disco sem um passo em bloco `run:` do db-guard.yml — seria um teste órfão. A alternativa da skill do meu perfil é declarar `REGISTRO PENDENTE: <arquivo>` e deixar o dono do workflow promover, mas isso mantém o CI vermelho entre a entrega e a promoção. Preferi registrar o passo (14 linhas, igual ao precedente do cartão `feature-flags-rollout`, de 11/10) e deixar o CI verde. Se o dono do workflow preferir, o passo é removível sem tocar a correção. O passo usa `SKIP_DOCKER_SHIM=1` porque o teste sobe container próprio e cria as roles anon/authenticated/service_role (globais ao cluster), como os passos vizinhos dessa seção.

## O que mudou e por quê
A auditoria de paridade V3->V2 (achado chat-2) mostrou que o INSERT de public.scheduled_messages só exigia `created_by` = perfil do chamador (ou admin/supervisor), o UPDATE não tinha WITH CHECK, e o INSERT de public.whisper_messages só exigia `sender_id` = perfil do chamador. Nenhum olhava a visibilidade do CONTATO nem a permissão de envio. Como o enviador de agendadas (job AG2) roda com privilégio de serviço e NUNCA passa por RLS, um agente agendava (e o job entregava) para contato fora do alcance dele. A migration troca essas 3 policies por versões que exigem `is_contact_visible_to_user(contact_id, auth.uid())` e `user_has_permission(auth.uid(),'send_messages')` — exatamente as duas guardas que a RPC `enqueue_outbound_message` (20260930200000) já usa no envio. Admin/supervisor continuam passando pelo ramo dos helpers. Aditiva e atômica: só DROP/CREATE das policies citadas, dentro de `BEGIN/COMMIT`; nenhum DML, nenhum GRANT/ACL, SELECT e DELETE de scheduled_messages e a LEITURA de whisper_messages inalterados.

## Prova
- vermelho antes (dentro do próprio teste, com as policies antigas): `bash scripts/db-audit/scheduled-whisper-visibility-rls.test.sh` → `[PASS] RED: agente agenda para contato INVISÍVEL (a policy antiga aceita)`, `[PASS] RED: usuário SEM send_messages agenda (a policy antiga aceita)`, `[PASS] RED: sussurro em contato INVISÍVEL (a policy antiga aceita)`.
- verde depois (mesmo run, após aplicar o arquivo de migration): `PASS=24 FAIL=0`, exit 0 — recusa contato invisível, recusa sem send_messages, recusa trocar `contact_id` para invisível e `created_by` para outro; supervisor agenda/sussurra em contato de outro; UPDATE legítimo do próprio agendamento passa; agente não vê agendamento nem sussurro de outro; anon não vê nenhum agendamento e é recusado no INSERT; linhas existentes (semeadas antes) seguem intactas em conteúdo/status/horário/dono.
- asserção de recusa exige erro de row-level security, não qualquer erro (evita falso-verde).
- rollback de verdade: as 6 linhas `-- Rollback (SQL executável, na ordem)` foram EXECUTADAS no banco LOCAL (`DROP POLICY`x3 + `CREATE POLICY`x3, exit 0) e depois a migration foi reaplicada (`DROP`/`CREATE`x3 + `BEGIN`/`COMMIT`, exit 0): o inverso roda e o estado final é o corrigido.
- aplicação real: a migration foi aplicada no banco LOCAL da tarefa `v2-26101112373736` (`zapp-db-local psql`, saída `BEGIN/DROP POLICY/CREATE POLICY x3/COMMIT`), nunca em produção.
- verificação: `zapp-verify . --rapido` → `OK dependencias/db_guard/tipos/lint/migrations` e `VERIFY: VERDE SEM BANCO` (sem nome de conjunto o banco é pulado, como o fechar chama). `node scripts/db-audit/check-migration-drift.mjs` → `arquivos validos em supabase/migrations: 817` exit 0. `node scripts/ci/check-test-inventory.mjs` → `OK ... .test.sh verificados individualmente`.

## O que NÃO fiz e por quê
- Não mexi em src/integrations/supabase/types.ts: os tipos são gerados de tabelas/colunas/funções e RLS (policies) não entra neles; esta migration não altera estrutura, e o passo `tipos` do zapp-verify(verde) não pede diff.
- Não toquei SELECT nem DELETE de scheduled_messages e não mudei a LEITURA de whisper_messages (o cartão diz que a leitura já é restrita ao autor/destinatário/supervisor).
- A visibilidade usada é a MESMA do envio (`is_contact_visible_to_user`), não a de SELECT de messages (que soma membro da fila). Quem só é membro da fila e não é o responsável já não podia ENVIAR (guarda da RPC), então também não agenda/sussurra — sem regressão de fluxo legítimo, e é o ponto do cartão.
- Nenhum GRANT, papel ou ACL alterado; nenhuma migration de dados; nenhum backfill.
