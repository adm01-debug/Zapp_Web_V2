Especialista: senior (area-sql-banco)

## Pontos da recusa

Ponto 1: a guarda anterior barrava qualquer UPDATE direto de `messages.content` e podia quebrar fluxos legítimos.
- O que mudei: em `supabase/migrations/20261011151650_edit_message_rpc.sql`, mantive a regra "editar texto só via RPC" e documentei/testei os fluxos legítimos de UPDATE: soft delete inicial com tombstone padrão (`OLD.is_deleted IS NOT TRUE` -> `NEW.is_deleted IS TRUE`), `is_read`, `transcription` e escrita de Edge/service_role. Também fechei a exceção do soft delete: `is_deleted=true` com outro texto, ou tentativa de alterar `content` de mensagem já apagada, cai em `message_content_edit_requires_rpc`.
- Teste que prova: `scripts/db-audit/edit-message-authorization.test.sh` executa a migration em Postgres real descartável com papéis `authenticated`/`service_role` e cobre B18 a B23 para os fluxos legítimos. Vermelho antes da correção final: `bash scripts/db-audit/edit-message-authorization.test.sh` falhou em `B20 mensagem ja apagada nao troca content via update direto: deveria falhar, mas passou`. Verde depois: o mesmo comando terminou com `[OK] contrato de autorizacao da edicao de mensagem (edit_message) verificado`.

Ponto 2: o teste anterior não provava SQL de verdade nem o defeito original de autorização.
- O que mudei: `scripts/db-audit/edit-message-authorization.test.sh` agora reproduz o defeito antes da migration (`A1` reescreve mensagem recebida por UPDATE direto; `A2` troca `sender`; `A3` confirma RPC ausente), aplica o SQL do cartão e valida a correção por comportamento real: UPDATE direto negado, marca de sessão forjada negada, RPC aceita só a própria mensagem enviada e recusa mensagem recebida, sem permissão, fora da janela, sem `external_id`, apagada, conteúdo inválido e contato invisível. O teste também valida ACL da RPC/guarda e o rollback do que a migration cria.
- Teste que prova: `bash scripts/db-audit/edit-message-authorization.test.sh` passou com todos os blocos A, B e C e terminou em `[OK] contrato de autorizacao da edicao de mensagem (edit_message) verificado`.

## Arquivos no diff (5 arquivos; 1 teste)

scripts/ci/check-test-inventory.mjs
scripts/db-audit/edit-message-authorization.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011151650_edit_message_rpc.sql
.tmp/relato.md

## Critério de pronto explicitado

- Soft delete fora da RPC só é permitido na transição inicial `OLD.is_deleted IS NOT TRUE` -> `NEW.is_deleted IS TRUE` com `NEW.content = '[Mensagem apagada]'`; isso está na condição de `guard_message_immutable_columns` em `supabase/migrations/20261011151650_edit_message_rpc.sql`.
- O teste B18 prova que o soft delete inicial continua permitido; B19 prova que `is_deleted=true` com texto arbitrário é negado; B20 prova que mensagem já apagada não pode trocar `content` por UPDATE direto.
- `scripts/db-audit/edit-message-authorization.test.sh` é o teste de banco pedido pelo ponto 2 da recusa. `scripts/ci/check-test-inventory.mjs` só registra esse teste novo na allowlist do inventário; não altera workflow nem afrouxa guarda.

## Verificações executadas

- `bash scripts/db-audit/edit-message-authorization.test.sh` -> passou; saída final: `[OK] contrato de autorizacao da edicao de mensagem (edit_message) verificado`.
- `hermes-db-migrar supabase/migrations/20261011151650_edit_message_rpc.sql` -> aplicou a migration no banco LOCAL da tarefa antes do ajuste final; depois reapliquei a versão final no mesmo banco local com `psql -f` após remover localmente a função/trigger criados, e confirmei `local_rpc_present=true` e `local_trigger_present=true`.
- Prova de rollback em transação no banco local (`psql` no Postgres local da tarefa) -> `rollback_rpc_absent=true`, `rollback_trigger_absent=true`, `after_rollback_reverted_rpc_present=true`, `after_rollback_reverted_trigger_present=true`.
- `bun run typecheck` -> exit 0; terminou `tsc -b --force` sem erros.
- `node scripts/ci/check-test-inventory.mjs` -> falhou por 3 órfãos já existentes fora deste diff (`department-invite-contract-audit-vocabulary`, `talkx-conversion-defaults`, `team-chat-media-contract`). O teste novo deste cartão está registrado na allowlist e não aparece como órfão.
- `git diff --cached --check` antes do commit -> exit 0.

## O que não fiz

- Não editei workflow nem removi os três testes órfãos preexistentes do inventário, porque isso é fora do escopo deste refazer.
- Mantive `scripts/ci/check-test-inventory.mjs` no diff só para registrar o teste SQL novo na allowlist exigida pelo próprio inventário; não mexi no YAML nem afrouxei a guarda.
- `scripts/db-audit/edit-message-authorization.test.sh` é indispensável para cumprir o ponto 2 da recusa (teste que executa o SQL e prova o defeito original), embora a lista resumida de arquivos permitidos do cartão cite apenas `tests de banco`.
- Não toquei em produção, push, PR ou deploy.
