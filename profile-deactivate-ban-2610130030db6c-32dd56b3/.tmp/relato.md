Especialista: workersql

## O que mudou e por quê
- `supabase/migrations/20261013033159_profile_deactivate_ban.sql` (novo): desativar o perfil passa a banir o usuário no Auth real e reativar limpa o ban, em trigger próprio no mesmo evento do trigger de revogação de sessões do PD-02, idempotente e com rollback que remove só o que este arquivo cria.
- `scripts/db-audit/revoke-auth-sessions.test.sh`: a suíte descartável do PD-02 passa a cobrir o ban junto da revogação — vermelho antes do trigger, verde ao desativar, repetição sem reescrever, liberação ao reativar e remoção de função e trigger no rollback.
- Este relato: reescrito no formato de quatro seções exigido na recusa, sem seção extra e sem o marcador de sucesso.

## Prova
- `bash scripts/db-audit/revoke-auth-sessions.test.sh` (harness PostgreSQL descartável com papéis reais): cobre trigger ausente antes, ban com revogação ao desativar, idempotência na repetição, limpeza do ban ao reativar e rollback de função e trigger.
- Banco local da tarefa com usuário sintético: antes de desativar há sessão e não há ban; desativar bane e revoga; repetir não reescreve; reativar limpa; papel authenticated não altera `auth.users`.

## Pontos do revisor
- Ponto 1 (quatro seções): relato reescrito com exatamente `O que mudou e por quê`, `Prova`, `Pontos do revisor` e `O que NÃO fiz e por quê`, sem a seção extra anterior.
- Ponto 2 (teto de bullets): cada seção tem no máximo seis bullets.
- Ponto 3 (citar a suíte): a seção Prova cita `scripts/db-audit/revoke-auth-sessions.test.sh`.
- Ponto 4 (sem marcador e sem código novo): relato sem o marcador de sucesso e nenhum arquivo de código alterado além do já entregue.

## O que NÃO fiz e por quê
- Não alterei a migration nem a suíte: o código do commit anterior permanece intacto, como a recusa determina.
- Não criei teste novo: a recusa veda acrescentar teste; a cobertura vem da suíte citada na Prova.
- Não toquei no portão automático, na migration do PD-02, em GRANT/RLS/papéis existentes nem em produção.
