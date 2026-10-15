Especialista: workersql

## Pontos da recusa (só relato; nenhum código mudou)
- Ponto 1: primeira linha agora é exatamente `Especialista: workersql`.
- Ponto 2: removida a frase sobre o motivo da negação do `anon`; o relato diz apenas o comportamento observado (anon não lê nem grava), sem afirmar causa.
- Ponto 3: seção `## Prova` agora contém a linha VERIFY do `zapp-verify . --rapido` no formato pedido, mais a lista das etapas OK.

## O que mudou e por quê
- `supabase/migrations/20261013143000_user_ui_preferences.sql` (NOVO): cria
  `public.user_ui_preferences` — `user_id uuid primary key references auth.users(id) on delete
  cascade`; `prefs jsonb not null default '{}'` com CHECK de objeto
  (`jsonb_typeof(prefs) = 'object'`) e teto de tamanho (`octet_length(prefs::text) <= 16384`, 16
  KiB); `updated_at timestamptz not null default now()` com gatilho que reusa
  `public.update_updated_at_column()` (função já existente — nenhuma função nova nasce aqui). RLS
  ligada; policy `FOR ALL TO authenticated` com o MESMO predicado em `USING` e em `WITH CHECK`
  (`auth.uid() = user_id`) = "própria linha". Migration ADITIVA: cria só objeto novo (tabela,
  policy, gatilho, grant a authenticated); não altera, não revoga e não migra nada existente.
  Rollback completo no topo (linhas `--   <stmt>;`).
- `supabase/tests/user_ui_preferences.sql` (NOVO): prova de RLS no banco LOCAL com PAPEL REAL
  (`authenticated`, `anon`, `service_role`), cobrindo também os dois CHECKs e o gatilho.
- `src/integrations/supabase/types.ts`: entrada `user_ui_preferences` (Row/Insert/Update) na ordem
  alfabética, no formato do gerador. `Relationships: []` porque a FK aponta para `auth.users`, fora
  do schema `public` (igual às tabelas irmãs, ex.: `user_devices`/`user_settings`).

## Prova
- Verificação rápida (zapp-verify --rapido) no fechar: OK dependencias 3s; OK db_guard 0s; OK tipos 114s; OK lint 3s; OK migrations 1s
- Etapas OK: dependencias, db_guard, tipos, lint, migrations (todas OK, zero falha).
- verde depois: `zapp-db-local psql . v2-2610131429994a -v ON_ERROR_STOP=1 < supabase/tests/user_ui_preferences.sql`
  → última linha `user_ui_preferences: OK (RLS propria linha + CHECKs + gatilho; anon negado; service_role ve tudo)`, exit=0
- vermelho antes (sem a migration aplicada): mesmo comando →
  `ERROR: ... oid = 'public.user_ui_preferences'::regclass ... relation does not exist` (exit=3)
- rollback de verdade: `grep -E '^--   ' <migration> | sed 's/^--   //'` executado no banco local →
  `DROP TRIGGER` / `DROP TABLE`; em seguida `select to_regclass('public.user_ui_preferences') is null`
  → `t` (a tabela sumiu). Reapliquei (`psql < migration`) → `CREATE TABLE / ALTER TABLE / CREATE
  POLICY / CREATE TRIGGER / GRANT` e a suíte volta a verde (exit=0).
- O que a suíte exercita de fato: A insere e lê só a própria linha; A é negado ao gravar na linha de
  B (42501); prefs array e prefs acima de 16 KiB são negados (23514); o UPDATE reescreve `updated_at`
  mesmo quando o app tenta gravar um valor antigo (gatilho lido de volta); B não vê, não atualiza e
  não apaga a linha de A (0 linhas); `anon` não lê nem grava (negado); `service_role` vê as 2 linhas.

## Passada de efeitos colaterais (antes do relato)
- Não há backfill nem UPDATE/INSERT em dado existente: a migration só cria objeto novo. O único
  gatilho criado é o da própria tabela (reescreve só `updated_at` da linha atualizada).
- Nenhum GRANT, papel ou ACL existente mudou além do `grant ... to authenticated` pedido; não usei
  REVOKE. Sobre o `anon`: a suíte prova apenas que ele não lê nem grava (negado) — sem afirmar causa.
- Sem `create or replace`/`drop`/`alter` de objeto existente; sem `\` meta-comando.

## Teste novo deste cartão de banco
- O cartão pede a prova como suíte SQL em `supabase/tests/` (`user_ui_preferences.sql`), não como
  `.test.ts`/`.test.sh`. Ela é o teste novo vermelho→verde: sem a migration, o mesmo arquivo falha
  (`relation does not exist`, exit=3) e, com ela aplicada, passa (exit=0). O único arquivo de código
  tocado além da migration é `src/integrations/supabase/types.ts`, que é derivado do schema (não tem
  comportamento para testar) — por isso não há teste vitest novo no commit.

## O que NÃO fiz e por quê
- Não mexi em `scripts/db-audit/**` nem no workflow (fora dos ARQUIVOS do cartão). A prova do RLS
  ficou em `supabase/tests/user_ui_preferences.sql`, aplicada no banco local da tarefa, como o cartão
  pede; não criei `.test.sh` novo (o cartão não cita `scripts/db-audit/**`).
- Não gerei `types.ts` por `scripts/db-audit/gen-types.sh`: o modo padrão introspecta produção (não
  posso tocar) e o modo `--local` exige o stack do supabase CLI; editei à mão no formato exato do
  gerador.
