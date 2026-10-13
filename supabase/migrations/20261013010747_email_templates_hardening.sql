-- email_templates_hardening
-- Rollback: remove o gatilho e a funcao de guarda e o CHECK de corpo (esta migration nao cria nem altera dado, policy, GRANT ou ACL; a tabela, as demais constraints e o default de body sao da ET1 e permanecem).
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists guard_email_templates on public.email_templates;
--   drop function if exists public.guard_email_templates();
--   alter table public.email_templates drop constraint if exists email_templates_body_not_blank;
--
-- fix(db): hardening do contrato de email_templates (ET1) — paridade V3->V2
-- Migration ADITIVA sobre a tabela da ET1 (20261012112503). Sem backfill (tabela vazia).
--
-- DECISOES (registradas como o cartao pede):
--  1. Autoria imutavel: gatilho BEFORE UPDATE rejeita (ERRCODE 42501) trocar created_by.
--     Escolha RAISE (nao NEW.created_by := OLD.created_by) para nao mascarar a tentativa
--     de escalada; espelha 20260929590000_multiplix_mutability_guard.sql.
--  2. Compartilhar (is_shared = true) SO staff: admin/supervisor por
--     public.is_admin_or_supervisor(auth.uid()), no INSERT e no UPDATE. O agente comum
--     nao compartilha o proprio modelo; staff compartilha.
--  3. Guarda so para o papel authenticated (auth.role()): service_role/back-office segue
--     livre, como na migration do multiplix.
--  4. Corpo vazio barrado por CHECK (nome em branco ja e barrado pela ET1). O default ''
--     de body nao foi tocado: com o CHECK novo, omitir o corpo passa a ser rejeitado.
--
-- ============ 1. CHECK de corpo ============
alter table public.email_templates
  drop constraint if exists email_templates_body_not_blank;
alter table public.email_templates
  add constraint email_templates_body_not_blank check (btrim(body) <> '');

-- ============ 2. gatilho de guarda (autoria imutavel + compartilhar so staff) ============
create or replace function public.guard_email_templates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  -- Back-office (service_role/postgres) nao e afetado: a guarda vale para o ator humano.
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  -- Autoria imutavel no UPDATE: ninguem "doa" nem reatribui o modelo (nem o dono).
  if tg_op = 'UPDATE' and new.created_by is distinct from old.created_by then
    raise exception 'email_templates_author_immutable' using errcode = '42501';
  end if;

  -- Compartilhar (is_shared = true) so staff (admin/supervisor).
  if new.is_shared and not public.is_admin_or_supervisor(auth.uid()) then
    raise exception 'email_templates_share_requires_staff' using errcode = '42501';
  end if;

  return new;
end;
$function$;

comment on function public.guard_email_templates() is
  'Guarda de email_templates: autoria imutavel no UPDATE e is_shared=true so staff, para o ator authenticated.';

revoke all on function public.guard_email_templates() from public, anon, authenticated;

drop trigger if exists guard_email_templates on public.email_templates;
create trigger guard_email_templates
  before insert or update on public.email_templates
  for each row execute function public.guard_email_templates();
