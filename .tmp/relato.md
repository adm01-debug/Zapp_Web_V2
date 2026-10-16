Especialista: senior (area-sql-banco)

## Pontos da recusa
- Ponto 1: a entrega anterior estava aprovada, mas não integrava por conflito com a ponta da `dia`. Refiz em workspace novo sobre `dia/2026-10-13`, trouxe apenas o commit funcional `ef625b98b` e deixei de fora o relato `.tmp` conflitante da cherry-pick. O diff de código tem o commit `08a206383`; o segundo commit contém somente este relato exigido pelo fechamento.
- Ponto 2: preservei o comportamento da entrega aprovada e acrescentei prova de rollback executável. A migration `supabase/migrations/20261011154648_rls_scheduled_whisper_visibility.sql` recria as policies de INSERT/UPDATE de `scheduled_messages` com contato visível + `send_messages` e a policy de INSERT de `whisper_messages` com contato visível, mantendo o bypass de admin/supervisor e sem DML em linhas existentes.

## O que mudou e por quê
- `supabase/migrations/20261011154648_rls_scheduled_whisper_visibility.sql`: aplica a troca transacional das três policies citadas e deixa rollback SQL no cabeçalho para recriar as policies anteriores.
- `scripts/db-audit/scheduled-whisper-visibility-rls.test.sh`: sobe PostgreSQL descartável, cria o estado antigo das policies, prova o RED das brechas antes da migration, aplica a migration real, prova as recusas GREEN por RLS, prova que supervisor continua passando, que anônimo não enxerga/insere, que linhas existentes permanecem intactas e que o rollback do cabeçalho executa/restaura as policies antigas antes de reaplicar a migration.
- `.github/workflows/db-guard.yml`: mantém o passo do `db-guard` da entrega original, agora rebaseado no final do workflow atual, para executar o teste novo via `retry-disposable-postgres-test.sh` com `SKIP_DOCKER_SHIM=1`.

## Prova
- Vermelho antes da correção (dentro do teste): `bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/scheduled-whisper-visibility-rls.test.sh` imprime `[PASS] RED: agente agenda para contato INVISÍVEL (a policy antiga aceita)`, `[PASS] RED: usuário SEM send_messages agenda (a policy antiga aceita)` e `[PASS] RED: sussurro em contato INVISÍVEL (a policy antiga aceita)` antes de aplicar a migration.
- Verde depois: o mesmo comando termina com `OK: agendar exige contato visível e permissão; sussurrar exige contato visível; supervisor passa; anônimo não vê nada; linhas existentes intactas; rollback executável`.
- Verificação rápida: `zapp-verify . --rapido` terminou com `VERIFY: VERDE SEM BANCO (22s) — o banco NÃO foi verificado; registros em /home/joaquim_ataides/.local/state/zapp-verify/dbea58e6ff85`.
- `zapp-verify full .` foi tentado, mas não consegui obter verde completo com banco local neste workspace: sem nome de conjunto ele passou por `db_guard`, `tipos`, `lint` e `migrations` e saiu sem verificar banco; com conjunto `t-8ed401d9` falhou porque o nome tinha `_`; com `t-8ed401d9` falhou em `travas` dizendo `conjunto t-8ed401d9 não está de pé`. Tentei `zapp-db-local up . t-8ed401d9`, mas ficou sem saída por mais de 12 minutos e matei o processo para não deixar job preso. A prova SQL do cartão usa PostgreSQL descartável próprio e passou.

## Arquivos do diff
.github/workflows/db-guard.yml
.tmp/relato.md
scripts/db-audit/scheduled-whisper-visibility-rls.test.sh
supabase/migrations/20261011154648_rls_scheduled_whisper_visibility.sql

## Escopo dos arquivos tocados fora da migration
- `scripts/db-audit/scheduled-whisper-visibility-rls.test.sh` é o teste de banco pedido pelo cartão; ele executa a migration real e prova RED/GREEN/rollback.
- `.github/workflows/db-guard.yml` é indispensável para o `db:guard` executar esse teste novo no CI. A alteração só adiciona um step que chama o teste; não afrouxa guarda nem remove validação.
- `.tmp/relato.md` foi versionado porque `hermes-tarefa-fechar` exige árvore limpa antes de entregar.

## Comandos rodados
- `git cherry-pick -n ef625b98b4bf5f36210c573c42e8866ad31b2e61` e restauração de `.tmp/relato.md` para evitar diff alheio.
- `bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/scheduled-whisper-visibility-rls.test.sh` → verde, com RED/GREEN e rollback executável.
- `zapp-verify . --rapido` → verde sem banco.
- `git diff --check` → sem saída de erro.
- `git diff --stat $(git merge-base HEAD dia/2026-10-13)...HEAD` → 4 arquivos, 530 inserções e 13 remoções.

## O que não fiz
- Não alterei dados, tipos gerados, manifestos, Edge Functions nem código de front.
- Não usei produção, push, deploy, PR nem banco remoto.
