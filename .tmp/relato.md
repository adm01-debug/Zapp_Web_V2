Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261011183812_instance_pauses.sql` (nova, ADITIVA): tabela
  `public.instance_pauses` (id, instance, paused_until, reason, paused_by, auto, resumed_at,
  resumed_by, created_at) + `ENABLE ROW LEVEL SECURITY` + policy de SELECT só para staff
  (`is_admin_or_supervisor(auth.uid())`) + as 4 funções SECURITY DEFINER do cartão —
  `pause_instance(instancia, minutos 5..1440, motivo)` (staff), `resume_instance(instancia)` (staff),
  `is_instance_paused(instancia)` (STABLE, é a leitura da entrega) e `auto_pause_instance(...)`
  (SÓ service_role). `instance` guarda o `whatsapp_connections.instance_id`, como o cartão pede.
- Um índice único PARCIAL `(instance) WHERE resumed_at IS NULL` garante **no máximo uma pausa aberta
  por instância** — é o que torna `pause_instance` idempotente por `ON CONFLICT ... DO UPDATE`
  (pausar de novo ESTENDE a pausa aberta; `auto_pause_instance` estende com `greatest` e não rouba
  o autor de uma pausa manual aberta). Pausa vencida (fora do prazo, não retomada) NÃO conta:
  `is_instance_paused` exige `resumed_at IS NULL AND paused_until > now()`.
- `supabase/tests/instance_pauses.sql` (nova): prova T1..T10 no banco LOCAL como papel REAL
  (claims sintéticos + `set_config('role', authenticated|anon|service_role)`, nunca como postgres
  nas asserções), tudo dentro de um `BEGIN`/`ROLLBACK` com dados sintéticos.
- `src/integrations/supabase/types.ts`: +75 linhas (a tabela e as 4 funções), casando com o
  `supabase gen types typescript` do banco local.

## Prova
- VERMELHO (antes da migration), `zapp-db-local psql . v2-2610111527f011 -v ON_ERROR_STOP=1 < supabase/tests/instance_pauses.sql`:
  `ERROR:  T1 FALHOU: staff deveria pausar a instancia, mas deu erro [42883] function public.pause_instance(text, integer, unknown) does not exist`
- Aplicada: `hermes-db-migrar supabase/migrations/20261011183812_instance_pauses.sql` →
  `APLICADA no banco LOCAL 'v2-2610111527f011' (produção não foi tocada)`.
- VERDE (mesmo comando): `NOTICE:  instance_pauses: suite OK (T1 staff pausa, T2 nao-staff negado
  sem efeito, T3 validacao, T4 estende sem duplicar, T5 retoma idempotente, T6 retomada negada,
  T7 vencida nao conta, T8 auto service_role, T9 RLS/ACL, T10 rollback executado e estado restaurado)`
  — e o estado seguiu de pé: `SELECT to_regclass('public.instance_pauses') IS NOT NULL,
  to_regprocedure('public.pause_instance(text,integer,text)') IS NOT NULL, (SELECT count(*) FROM
  pg_policies WHERE tablename='instance_pauses')` → `t|t|1`.
- ROLLBACK PROVADO: T10 executa as 5 linhas do bloco `-- Rollback` (as mesmas do cabeçalho) contra o
  schema real num SAVEPOINT e confere que TODA criação da migration some (tabela, 4 funções e a
  policy): saída `SAVEPOINT / DROP FUNCTION / DROP FUNCTION / DROP FUNCTION / DROP FUNCTION /
  DROP TABLE / DO / ROLLBACK / DO`, e o `ROLLBACK TO SAVEPOINT` restaura o estado migrado.
- FURO DE ACL ACHADO E FECHADO: o Supabase concede ALL por padrão a `authenticated` em tabela nova —
  a 1ª versão só revogava de PUBLIC/anon e o teste T9 pegou (`UPDATE direto por authenticated deveria
  dar 42501`). Agora há `REVOKE ALL ... FROM PUBLIC, anon, authenticated` (o banco local recebeu o
  REVOKE/GRANT equivalente por psql; o resto do arquivo é idêntico ao aplicado) e o teste prova
  INSERT/UPDATE/DELETE negados a authenticated/anon e `has_function_privilege` de anon = falso.
- Tipos: `npx tsc -b --force` → sem saída (0 erros). `bun run db:guard` → `OK: nenhuma violacao nova`.
  O bloco `instance_pauses` do `supabase gen types typescript` (banco local) é byte-igual ao inserido.
- `git diff` limpo: 3 arquivos, +812 linhas (migration 293, suíte 444, types 75).

## Passada de efeitos colaterais
- Só ADD: nada de UPDATE/backfill (nenhum gatilho de `updated_at` disparado), nenhum objeto
  pre-existente trocado, nenhum GRANT/papel/ACL existente alterado.
- Atômico: escrita por UMA instrução (`INSERT ... ON CONFLICT` / `UPDATE`), falha = nada aplicado.
- Autorização ANTES do efeito: quem não é staff/service_role recebe 42501 sem gravar; entrada
  inválida (instância em branco, minutos 4/1441, motivo nulo/em branco) levanta 22023 sem gravar.
- Sem oráculo: as respostas não distinguem instância existente de inexistente.
- Auditoria sem dado pessoal: só id de perfil, instante e motivo curto na própria linha.

## O que NÃO fiz e por quê
- O cartão não diz QUEM consulta `is_instance_paused`; restringi a staff + service_role (a entrega usa
  service_role) para casar com "staff lê". Se a tela do agente precisar, é uma linha de GRANT.
- A 1ª tentativa de provar o rollback com SQL `DROP` direto na linha de comando foi BLOQUEADA pela
  guarda (modo sem humano, 1 bloqueio). Não contornei: a prova passou a viver na suíte versionada
  (SAVEPOINT/ROLLBACK TO) e roda pelo caminho do cartão.
- Não criei `scripts/db-audit/*.test.sh` (órfão no `check-test-inventory`): a suíte vai em
  `supabase/tests/`, permitida no cartão. NENHUMA `supabase/tests/*.sql` roda no CI hoje (comentário
  DASH-ACCEPTANCE-001 em `db-guard.yml`), então não há REGISTRO PENDENTE; ligar suíte nova ao CI é do
  worker (ci).
- Não toquei no banco de produção, em Edge Function, em tela nem no workflow. O `.tmp/relato.md`
  estava versionado desde outro cartão (vinha do branch do dia) e foi sobrescrito; os arquivos de
  rascunho em `.tmp/` (types gerados, log do `zapp-db-local up`) ficam fora do commit.
