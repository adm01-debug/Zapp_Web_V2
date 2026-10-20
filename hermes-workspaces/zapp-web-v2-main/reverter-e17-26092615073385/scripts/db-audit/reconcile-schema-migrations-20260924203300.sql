-- =============================================================================
-- Reconciliacao de supabase_migrations.schema_migrations
-- Alvo: version = '20260924203300' (prevent_contact_assignee_hijack)
-- =============================================================================
--
-- ACHADO (diagnostico DBA, 2026-09-24 ~19:5x BRT / 22:5x UTC):
--
-- Investigacao anterior desta sessao apontou drift entre os arquivos de
-- migration do repo (458 arquivos em supabase/migrations/, excluindo os
-- subdiretorios _foreign/ e _superseded/) e o registro de controle em
-- supabase_migrations.schema_migrations (457 linhas), com a migration
--   supabase/migrations/20260924203300_prevent_contact_assignee_hijack.sql
-- ausente da tabela -- mesmo com o trigger `trg_prevent_contact_assignee_hijack`
-- e a funcao `prevent_contact_assignee_hijack()` JA aplicados em produção
-- (aparentemente via `db_apply_migration`/MCP, que nao grava schema_migrations,
-- em vez de `supabase db push`). Isso derrubava o job "Comparar migrations com
-- schema_migrations" do workflow "DB Live Guard".
--
-- RE-VALIDACAO NESTA EXECUCAO (leitura, nenhuma escrita feita):
--   1) SELECT count(*) FROM supabase_migrations.schema_migrations -> 458
--   2) SELECT EXISTS(... WHERE version = '20260924203300') -> true
--   3) supabase/migrations/ no GitHub (ref=main) -> 460 entradas, das quais
--      2 sao diretorios (_foreign, _superseded) => 458 arquivos .sql reais
--   4) O conteudo de statements[1] da linha 20260924203300 bate byte-a-byte
--      com supabase/migrations/20260924203300_prevent_contact_assignee_hijack.sql
--      (mesmo texto de CREATE OR REPLACE FUNCTION, DROP TRIGGER, CREATE TRIGGER)
--      e com pg_get_functiondef(prevent_contact_assignee_hijack()) ao vivo.
--   5) GitHub Actions: o run mais recente do workflow "DB Live Guard" em main
--      (id 36069398787, push, 2026-09-24T22:47:44Z) concluiu com sucesso,
--      apos uma sequencia de falhas entre ~20:48Z e ~22:39Z consistente com
--      o drift acima.
--
-- CONCLUSAO: o drift descrito na investigacao original JA FOI CORRIGIDO em
-- producao (por terceiros/automação, fora desta sessao, antes desta
-- execucao) -- muito provavelmente por um `supabase db push` real, que tambem
-- explica a PR #649 (automation/types-sync, nao relacionada a esta tabela)
-- ter sido mergeada no mesmo minuto (22:47:41Z) ao refletir mudanca de
-- manifesto/grants decorrente do mesmo push. NENHUM INSERT foi executado por
-- este agente -- apenas leituras (SELECT/describe/list) contra o banco.
--
-- PROPOSITO DESTE ARQUIVO: nao ha reconciliacao pendente para aplicar agora.
-- Este script fica versionado como *rede de seguranca idempotente* para o
-- caso especifico ja diagnosticado (ex.: reset de branch, restore de backup
-- anterior a 2026-09-24T22:4x, ou nova aplicacao de trigger via MCP sem
-- `supabase db push`). Ele SO escreve se a linha ainda nao existir; rodando
-- contra o estado atual (linha ja presente) e um no-op seguro.
--
-- Aguardando aprovacao humana antes de qualquer execucao -- ver PR.
-- =============================================================================

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT
  '20260924203300',
  'prevent_contact_assignee_hijack',
  ARRAY[
  $mig1$
CREATE OR REPLACE FUNCTION public.prevent_contact_assignee_hijack()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Espelha trg_prevent_contact_queue_hijack (20260924133700): a policy
  -- "Users can update their assigned contacts" tem USING (queue-membership
  -- ou ser o assigned_to atual) mas nenhum WITH CHECK simetrico -- um agente
  -- de fila compartilhada podia setar assigned_to para QUALQUER profiles.id
  -- do sistema (inclusive perfil de cliente, inativo ou UUID aleatorio), nao
  -- so um colega de verdade. Decisao de produto (2026-09-24): escopo e
  -- "qualquer colega ativo do time", nao restrito a fila especifica -- nao
  -- ha tabela de "time" no schema, entao o proxy e profiles.is_active +
  -- user_roles.role IN ('agent','supervisor','admin'), mesmo universo de
  -- roles operacionais ja usado em auto_assign_to_queue_agent/is_admin_or_supervisor.
  -- Mesmo guard de service_role do trigger irmao: Edge Functions (ex.
  -- reassign_absent_agents) continuam livres para rotear.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NEW.assigned_to IS NOT NULL
     AND NOT is_admin_or_supervisor(auth.uid())
  THEN
    IF NEW.queue_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.user_id
        WHERE p.id = NEW.assigned_to
          AND p.is_active = true
          AND ur.role IN ('agent', 'supervisor', 'admin')
      ) THEN
        RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
      END IF;
    ELSIF NEW.assigned_to <> get_profile_id_for_user(auth.uid()) THEN
      -- Sem fila (queue_id nulo): so pode reivindicar para si mesmo.
      RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
    END IF;
  END IF;

  RETURN NEW;
END;
$$
$mig1$,
  $mig2$
DROP TRIGGER IF EXISTS trg_prevent_contact_assignee_hijack ON public.contacts
$mig2$,
  $mig3$
CREATE TRIGGER trg_prevent_contact_assignee_hijack
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  WHEN (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
  EXECUTE FUNCTION public.prevent_contact_assignee_hijack()
$mig3$
]::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations
  WHERE version = '20260924203300'
);

-- Verificacao pos-execucao (deve retornar 1 linha e count=458 esteja ja
-- presente ou volte a 458 apos o INSERT acima):
--   SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '20260924203300';
--   SELECT count(*) FROM supabase_migrations.schema_migrations;
