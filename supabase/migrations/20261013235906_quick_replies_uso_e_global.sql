-- quick_replies_uso_e_global
-- Rollback: dropa a RPC de contagem e o gatilho/funcao de preservacao do updated_at e devolve as policies de INSERT e UPDATE de public.message_templates ao estado anterior (dono apenas).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.increment_quick_reply_use(uuid);
--   drop trigger if exists zz_message_templates_preserve_updated_at on public.message_templates;
--   drop function if exists public.message_templates_preserve_updated_at();
--   drop policy if exists "Users can create their own templates" on public.message_templates;
--   drop policy if exists "Users can update their own templates" on public.message_templates;
--   create policy "Users can create their own templates" on public.message_templates for insert to authenticated with check (user_id = auth.uid());
--   create policy "Users can update their own templates" on public.message_templates for update to authenticated using (user_id = auth.uid());
--
-- PH-10 / paridade V3 -> V2 do doc 06-features-inbox-hooks (auditoria de 13/10/2026).
-- Correcao de DOIS defeitos vivos de public.message_templates (respostas rapidas):
--
--   (a) O contador de uso so subia no template DO PROPRIO usuario. incrementUseCount
--       (src/hooks/chat/useQuickReplies.ts) fazia `update ... set use_count = use_count + 1`
--       e a policy de UPDATE exige `user_id = auth.uid()`: numa resposta GLOBAL de outro
--       usuario o UPDATE alcancava 0 linhas SEM erro, e o valor lido-e-somado no cliente
--       ainda corria entre abas. Aqui nasce a RPC `increment_quick_reply_use(p_id uuid)`:
--       SECURITY DEFINER (bypassa a RLS de UPDATE de proposito), soma ATOMICA no banco
--       (`use_count = coalesce(use_count,0) + 1`) e so toca linhas VISIVEIS ao chamador
--       (dono OU is_global) — a mesma regra do SELECT. Quem chama precisa estar autenticado.
--
--   (b) Qualquer atendente marcava `is_global = true` ao criar/editar e a resposta aparecia
--       (e era enviada ao cliente) por toda a equipe. As policies de INSERT e UPDATE passam a
--       exigir admin/supervisor para `is_global = true` (via public.is_admin_or_supervisor,
--       o mesmo helper das demais policies do sistema). NADA de dado e migrado: respostas
--       globais ja existentes ficam exatamente como estao (nao ha UPDATE/DELETE em massa).
--
-- Efeito colateral tratado de proposito: o gatilho update_message_templates_updated_at
-- carimba updated_at em TODO UPDATE. Como contar uso nao e editar a resposta (a tela
-- QuickReplyCardList mostra "atualizado em" a partir de updated_at), o gatilho novo
-- zz_message_templates_preserve_updated_at preserva o updated_at quando a unica coluna que
-- muda e use_count. Edicao de verdade (titulo/conteudo/atalho/categoria/is_global) continua
-- carimbando a data normalmente. O gatilho roda depois do carimbo (ordem alfabetica: 'u' < 'z').
--
-- Sem dependencia nova. Sem DROP de dado, sem TRUNCATE/DELETE. Grants explicitos. SET search_path.

-- ============================================================================
-- 1. Contagem atomica de uso (RPC SECURITY DEFINER)
-- ============================================================================

create or replace function public.increment_quick_reply_use(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_rows integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'invalid_quick_reply_id' using errcode = '22023';
  end if;

  update public.message_templates as t
     set use_count = coalesce(t.use_count, 0) + 1
   where t.id = p_id
     and (t.user_id = v_uid or t.is_global = true);

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Negar por padrao: so o papel authenticated executa (anon/PUBLIC fora).
revoke all on function public.increment_quick_reply_use(uuid) from public;
revoke all on function public.increment_quick_reply_use(uuid) from anon;
grant execute on function public.increment_quick_reply_use(uuid) to authenticated;

-- ============================================================================
-- 2. Contar uso nao e editar a resposta: preserva updated_at
-- ============================================================================

create or replace function public.message_templates_preserve_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.use_count is distinct from old.use_count
     and new.user_id = old.user_id
     and new.title = old.title
     and new.content = old.content
     and new.shortcut is not distinct from old.shortcut
     and new.category is not distinct from old.category
     and new.is_global is not distinct from old.is_global
     and new.created_at = old.created_at then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

revoke all on function public.message_templates_preserve_updated_at() from public;
revoke all on function public.message_templates_preserve_updated_at() from anon;

drop trigger if exists zz_message_templates_preserve_updated_at on public.message_templates;
create trigger zz_message_templates_preserve_updated_at
  before update on public.message_templates
  for each row
  execute function public.message_templates_preserve_updated_at();

-- ============================================================================
-- 3. is_global so por admin/supervisor (INSERT e UPDATE)
-- ============================================================================

drop policy if exists "Users can create their own templates" on public.message_templates;
create policy "Users can create their own templates" on public.message_templates
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (is_global is not true or public.is_admin_or_supervisor(auth.uid()))
  );

drop policy if exists "Users can update their own templates" on public.message_templates;
create policy "Users can update their own templates" on public.message_templates
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (is_global is not true or public.is_admin_or_supervisor(auth.uid()))
  );
