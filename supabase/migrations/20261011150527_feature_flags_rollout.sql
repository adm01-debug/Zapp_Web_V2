-- feature_flags_rollout
-- Rollback: dropa a RPC evaluate_feature_flags, as quatro policies novas, apaga as 11 flags semeadas e remove as colunas novas; recria as policies originais da tabela (SELECT amplo para authenticated + escrita admin FOR ALL).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.evaluate_feature_flags();
--   drop policy if exists feature_flags_select_admin_supervisor on public.feature_flags;
--   drop policy if exists feature_flags_insert_admin on public.feature_flags;
--   drop policy if exists feature_flags_update_admin on public.feature_flags;
--   drop policy if exists feature_flags_delete_admin on public.feature_flags;
--   create policy feature_flags_select_authenticated on public.feature_flags for select to authenticated using (true);
--   create policy feature_flags_admin_write on public.feature_flags for all to authenticated using (public.has_role(auth.uid(), 'admin'::app_role)) with check (public.has_role(auth.uid(), 'admin'::app_role));
--   delete from public.feature_flags where key in ('chat_whisper_composer','chat_delivery_delay_alert','chat_inbox_scope','chat_group_sender','chat_ticket_actions','chat_requeue_button','chat_automation_suggestions','chat_message_actions','chat_team_files','chat_send_metrics','chat_forward_groups');
--   alter table public.feature_flags drop column if exists metadata, drop column if exists expires_at, drop column if exists blocked_user_ids, drop column if exists allowed_user_ids, drop column if exists allowed_roles, drop column if exists rollout_percentage;
--
-- Etapa 5 do plano de paridade V3 -> V2: rollout gradual por funcionalidade.
-- A V2 só tinha key/enabled (useFeatureFlag, liga-desliga). A V3 liberava aos poucos:
-- percentual estável por usuário, papéis, lista de permitidos/bloqueados e expiração.
--
-- Tudo ADITIVO: colunas com default que preservam o comportamento atual das linhas
-- existentes (100% e sem restrição). A avaliação sai do cliente e passa a ser no
-- servidor (public.evaluate_feature_flags) porque as listas de usuários são sensíveis
-- e NUNCA podem vazar para o navegador de um usuário comum.

-- 1. Colunas aditivas. Linhas existentes: rollout 100%, listas vazias, sem expiração,
--    metadata vazio — comportamento idêntico ao de antes (flag ligada = ligada para todos).
alter table public.feature_flags
  add column if not exists rollout_percentage integer not null default 100 check (rollout_percentage between 0 and 100),
  add column if not exists allowed_roles text[] not null default '{}',
  add column if not exists allowed_user_ids uuid[] not null default '{}',
  add column if not exists blocked_user_ids uuid[] not null default '{}',
  add column if not exists expires_at timestamptz,
  add column if not exists metadata jsonb not null default '{}';

comment on column public.feature_flags.rollout_percentage is 'Percentual estável (0..100) do rollout. Avaliado por hash de (user_id || key) mod 100 em public.evaluate_feature_flags.';
comment on column public.feature_flags.allowed_roles is 'Papéis (app_role::text) com acesso garantido. Vazio = todos os papéis passam pelo portão de papel.';
comment on column public.feature_flags.allowed_user_ids is 'UUIDs com acesso sempre garantido (vencem papel e percentual). NUNCA exposta ao cliente comum.';
comment on column public.feature_flags.blocked_user_ids is 'UUIDs sempre barrados (vencem permitidos). NUNCA exposta ao cliente comum.';
comment on column public.feature_flags.expires_at is 'Quando preenchida no passado, a flag deixa de valer. NULL = sem expiração.';

-- 2. RPC de avaliação no servidor. Devolve só as chaves LIGADAS para o usuário atual
--    (text[]), nunca a linha nem as listas. Ordem de decisão:
--      enabled (e não expirada) -> não bloqueado -> permitido explicitamente OU
--      (papel aprovado E percentual aprovado).
--    Hash estável: hashtextextended(user_id::text || '|' || key, 0) mod 100 — mesmo
--    par (usuário, chave) sempre cai no mesmo balde, entre sessões e deploys.
create or replace function public.evaluate_feature_flags()
returns text[]
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_keys text[];
begin
  if v_uid is null then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  select coalesce(array_agg(f.key order by f.key), '{}'::text[])
    into v_keys
  from public.feature_flags f
  where f.enabled
    and (f.expires_at is null or f.expires_at > now())
    and not (v_uid = any(f.blocked_user_ids))
    and (
      v_uid = any(f.allowed_user_ids)
      or (
        (
          cardinality(f.allowed_roles) = 0
          or exists (
            select 1
            from public.user_roles ur
            where ur.user_id = v_uid
              and ur.role::text = any(f.allowed_roles)
          )
        )
        and (
          f.rollout_percentage >= 100
          or ((hashtextextended(v_uid::text || '|' || f.key, 0) % 100) + 100) % 100 < f.rollout_percentage
        )
      )
    );

  return v_keys;
end;
$$;

comment on function public.evaluate_feature_flags() is 'Chaves de feature_flags ligadas para auth.uid(), aplicando enabled, expiração, bloqueios, papéis e percentual. As listas de usuários não saem na resposta.';

-- 3. Permissão da RPC: só o usuário autenticado executa; nada para anon/PUBLIC.
revoke all on function public.evaluate_feature_flags() from public;
revoke execute on function public.evaluate_feature_flags() from anon;
grant execute on function public.evaluate_feature_flags() to authenticated;

-- 4. RLS. As listas de usuários são sensíveis: leitura direta da tabela fica com
--    admin/supervisor; escrita só admin. O app comum consome apenas a RPC.
drop policy if exists feature_flags_select_authenticated on public.feature_flags;
drop policy if exists feature_flags_admin_write on public.feature_flags;

create policy feature_flags_select_admin_supervisor on public.feature_flags
  for select to authenticated
  using (public.is_admin_or_supervisor(auth.uid()));

create policy feature_flags_insert_admin on public.feature_flags
  for insert to authenticated
  with check (public.is_admin(auth.uid()));

create policy feature_flags_update_admin on public.feature_flags
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy feature_flags_delete_admin on public.feature_flags
  for delete to authenticated
  using (public.is_admin(auth.uid()));

revoke all on public.feature_flags from anon;

-- 5. Semeia as flags desta frente DESLIGADAS (idempotente). A flag do enviador de
--    agendadas NÃO entra de propósito: mensagem agendada é correção de defeito e
--    deve funcionar quando o job for aplicado.
insert into public.feature_flags (key, enabled, rollout_percentage, description)
values
  ('chat_whisper_composer',        false, 0, 'Compositor de sussurro no chat.'),
  ('chat_delivery_delay_alert',    false, 0, 'Alerta de atraso na entrega da mensagem.'),
  ('chat_inbox_scope',             false, 0, 'Escopo da inbox (departamento/tudo).'),
  ('chat_group_sender',            false, 0, 'Exibe o remetente nos grupos.'),
  ('chat_ticket_actions',          false, 0, 'Ações de ticket na conversa.'),
  ('chat_requeue_button',          false, 0, 'Botão de reenfileirar conversa.'),
  ('chat_automation_suggestions',  false, 0, 'Sugestões de automação no chat.'),
  ('chat_message_actions',         false, 0, 'Menu de ações da mensagem.'),
  ('chat_team_files',              false, 0, 'Arquivos do time no chat.'),
  ('chat_send_metrics',            false, 0, 'Métricas de envio no chat.'),
  ('chat_forward_groups',          false, 0, 'Encaminhar para grupos.')
on conflict (key) do nothing;
