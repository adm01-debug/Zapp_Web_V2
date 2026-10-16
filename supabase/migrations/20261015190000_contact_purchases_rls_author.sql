-- contact_purchases_rls_author
-- Rollback: devolve contact_purchases ao estado de 20260409222809 (as duas policies voltam a olhar só a visibilidade do contato), remove os dois gatilhos de identidade e a função de guarda.
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists guard_contact_purchase_identity_update on public.contact_purchases;
--   drop trigger if exists guard_contact_purchase_identity_insert on public.contact_purchases;
--   drop function if exists public.guard_contact_purchase_identity();
--   drop policy if exists "Agents can insert purchases for assigned contacts" on public.contact_purchases;
--   drop policy if exists "Agents can delete purchases for assigned contacts" on public.contact_purchases;
--   create policy "Agents can insert purchases for assigned contacts" on public.contact_purchases for insert to authenticated with check (is_contact_visible_to_user(contact_id, auth.uid()) or is_admin_or_supervisor(auth.uid()));
--   create policy "Agents can delete purchases for assigned contacts" on public.contact_purchases for delete to authenticated using (is_contact_visible_to_user(contact_id, auth.uid()) or is_admin_or_supervisor(auth.uid()));
--
-- DEFEITO (compras do contato, RLS por dono): as quatro policies de
-- public.contact_purchases (20260409222809) olham SÓ a visibilidade do contato —
-- nenhuma delas usa created_by. Consequência: qualquer agente que enxergue o
-- contato grava compra EM NOME DE OUTRO (`created_by` = perfil de um terceiro,
-- aceito pela policy e sem rejeição no gatilho), troca o `contact_id` de uma
-- compra existente para OUTRO contato que ele também enxerga (o registro sai do
-- histórico do contato original) e APAGA compra registrada por outro agente.
-- `created_by` é a única coluna que diz QUEM registrou (FK para profiles) e é
-- exatamente ela que o histórico exibe.
--
-- CONSERTO (só o necessário):
--   1. INSERT: WITH CHECK ganha `created_by = get_profile_id_for_user(auth.uid())`.
--      O autor é o perfil do usuário logado. A coluna é nullable no banco e a tela
--      pode omiti-la (src/components/inbox/ContactPurchasesPanel.tsx:40 envia
--      `created_by: profileId`, que pode chegar nulo), então um gatilho BEFORE
--      INSERT preenche `created_by` com o perfil do chamador quando vem nulo e
--      REJEITA quando vem o perfil de outra pessoa. O WITH CHECK roda depois do
--      gatilho, sobre a linha já preenchida — a tela continua funcionando.
--      (O cartão diz `created_by = auth.uid()`; aqui a coluna é FK para
--      public.profiles e o app grava o ID do perfil — ver SalesViewTab.tsx:11 —
--      então o vínculo com o chamador é `get_profile_id_for_user(auth.uid())`.
--      Comparar com auth.uid() negaria todo INSERT da tela.)
--   2. DELETE: passa a exigir o autor OU admin/supervisor, mantendo a
--      visibilidade do contato exigida hoje. O admin continua apagando qualquer
--      compra; agente apaga o que ele mesmo registrou. Compra de autor
--      desconhecido (created_by NULL, legado) sai do alcance do agente e fica com
--      o admin — o app não tem nenhum caminho de DELETE de compra (o hook só lê e
--      insere: src/hooks/crm/useContactPurchases.ts), então nenhum fluxo atual
--      perde acesso.
--   3. UPDATE: o cartão pede WITH CHECK que impeça trocar `created_by` e
--      `contact_id`. A expressão de uma policy enxerga apenas a linha NOVA, nunca
--      a anterior — não há WITH CHECK que compare com o valor antigo. A trava
--      equivalente (e mais forte, porque vale para qualquer papel que entre por
--      JWT, inclusive admin, e em qualquer caminho de UPDATE) é o gatilho
--      guard_contact_purchase_identity_update, que RECUSA mudar `contact_id` e
--      `created_by`. A policy de UPDATE segue como está, sem afrouxar nada, e o
--      admin continua editando valores de compra registrada por outra pessoa
--      (sem condição de autor no UPDATE, não há regressão de acesso).
--      Mesmo padrão de public.contact_notes (guard_contact_note_identity,
--      20260909200000).
--
-- ESCOPO: nada de GRANT/REVOKE na tabela, nenhum índice novo (o filtro por autor
-- é coberto pelo índice da FK `contact_purchases_created_by_fkey`, criado em
-- 20260827120000_fk_indexes_backfill.sql) e nenhum DML: a migration não toca
-- linha existente. A policy de SELECT não muda.

-- ============================================================================
-- 1. Guarda de identidade: autor preenchido no INSERT, autor e contato imutáveis
-- ============================================================================
create or replace function public.guard_contact_purchase_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_profile uuid;
begin
  -- Caminho servidor (service_role, cron, psql do dono): sem JWT não há autor a
  -- impor nem a comparar — o registro de sistema segue gravando como sempre.
  if v_uid is null then
    return new;
  end if;

  v_profile := public.get_profile_id_for_user(v_uid);

  if tg_op = 'INSERT' then
    if new.created_by is null then
      if v_profile is null then
        raise exception 'purchase author cannot be resolved for the current user'
          using errcode = '42501';
      end if;
      new.created_by := v_profile;
    elsif v_profile is null or new.created_by is distinct from v_profile then
      raise exception 'purchase cannot be registered on behalf of another user'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE direto de uma linha: identidade do registro é imutável.
  if new.contact_id is distinct from old.contact_id then
    raise exception 'purchase contact is immutable'
      using errcode = '23514';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'purchase author is immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_contact_purchase_identity()
  from public, anon, authenticated;

drop trigger if exists guard_contact_purchase_identity_insert on public.contact_purchases;
create trigger guard_contact_purchase_identity_insert
  before insert on public.contact_purchases
  for each row
  execute function public.guard_contact_purchase_identity();

drop trigger if exists guard_contact_purchase_identity_update on public.contact_purchases;
create trigger guard_contact_purchase_identity_update
  before update of contact_id, created_by on public.contact_purchases
  for each row
  execute function public.guard_contact_purchase_identity();

-- ============================================================================
-- 2. INSERT: o autor é quem está gravando
-- ============================================================================
drop policy if exists "Agents can insert purchases for assigned contacts" on public.contact_purchases;
create policy "Agents can insert purchases for assigned contacts"
on public.contact_purchases for insert to authenticated
with check (
  (
    public.is_contact_visible_to_user(contact_id, auth.uid())
    or public.is_admin_or_supervisor(auth.uid())
  )
  and created_by = public.get_profile_id_for_user(auth.uid())
);

-- ============================================================================
-- 3. DELETE: o autor ou o admin — nunca outro agente do mesmo contato
-- ============================================================================
drop policy if exists "Agents can delete purchases for assigned contacts" on public.contact_purchases;
create policy "Agents can delete purchases for assigned contacts"
on public.contact_purchases for delete to authenticated
using (
  public.is_admin_or_supervisor(auth.uid())
  or (
    public.is_contact_visible_to_user(contact_id, auth.uid())
    and created_by = public.get_profile_id_for_user(auth.uid())
  )
);
