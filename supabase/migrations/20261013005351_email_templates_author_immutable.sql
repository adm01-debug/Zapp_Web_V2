-- email_templates_author_immutable
-- Rollback: dropa o gatilho e a funcao de guarda de autoria (esta migration nao cria nem altera dado, coluna, policy, GRANT ou ACL: nao ha dado a devolver). O trigger de updated_at e a tabela seguem intactos.
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists guard_email_templates_author_mutability on public.email_templates;
--   drop function if exists public.guard_email_templates_author_mutability();
--
-- hardening(db): torna imutavel a autoria (created_by) de email_templates no caminho
-- `authenticated` — fecha o furo em que staff editava o created_by de uma linha
-- compartilhada de outro usuario.
--
-- DEFEITO (este cartao): a policy de UPDATE (20261012112503) permite que staff edite
-- uma linha compartilhada de terceiro. O `WITH CHECK` repetia o `USING`
-- (`created_by = auth.uid() or (is_shared and is_admin_or_supervisor(...))`); com
-- `is_shared = true` o check passa mesmo quando o staff troca `created_by` para si no
-- MESMO UPDATE. Efeito: o staff se torna autor, o dono anterior deixa de casar
-- `created_by = auth.uid()` na policy de SELECT/DELETE e perde o proprio modelo.
-- Nao da para expressar "created_by nao muda" numa policy: `WITH CHECK` so enxerga a
-- linha NOVA. A garantia vive num gatilho BEFORE UPDATE, que compara com OLD.
--
-- DECISOES (medidas no repo, nao assumidas):
--  1. Mesmo padrao de public.enforce_multiplix_dispatch_mutability
--     (20260929590000_multiplix_mutability_guard.sql): a guarda vale so para o ator
--     `authenticated`. service_role e o dono postgres (worker, RPC/Edge admin)
--     continuam livres — o caminho legitimo de back-office nao regride.
--  2. Escopo minimo: so a coluna de autoria. As demais colunas (name, subject, body,
--     category, is_shared, updated_at) seguem editaveis pelo dono e, quando
--     compartilhada, por staff, como o cartao ET1 definiu.
--  3. Nenhum GRANT/REVOKE/policy/coluna/papel e tocado alem do gatilho. Tabela ja tem
--     dado possivel (uso novo): a migration e aditiva e nao mexe em linha existente.
--  4. Idempotente: CREATE OR REPLACE da funcao + DROP TRIGGER IF EXISTS antes do CREATE.

-- ============ 1. funcao de guarda ============
create or replace function public.guard_email_templates_author_mutability()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- So o ator authenticated e barrado; service_role/postgres seguem livres.
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'email_templates_author_immutable' using errcode = '42501';
  end if;

  return new;
end;
$function$;

comment on function public.guard_email_templates_author_mutability() is
  'Gatilho: no caminho authenticated, proibe trocar email_templates.created_by (reatribuicao de autoria). Dono do modelo nunca perde acesso por UPDATE de terceiro.';

-- ============ 2. gatilho ============
drop trigger if exists guard_email_templates_author_mutability on public.email_templates;
create trigger guard_email_templates_author_mutability
  before update on public.email_templates
  for each row execute function public.guard_email_templates_author_mutability();
