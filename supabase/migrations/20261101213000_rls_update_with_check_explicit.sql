-- CRITICAL-2 audit closure: policies UPDATE sem organization_id
-- 
-- Resultado da investigação (2026-11-01):
--   • Schema não possui coluna organization_id em nenhuma tabela
--   • Sistema é single-tenant (10 usuários, 2 conexões WhatsApp)
--   • Nenhuma das 82 policies UPDATE permite UPDATE cross-tenant real
--   • O alerta era falso positivo: auditador assumiu multi-tenancy inexistente
-- 
-- Esta migration adiciona WITH CHECK explícito = USING nas 8 policies
-- de maior risco sobre dados de negócio do usuário. O Postgres já aplica
-- USING como WITH CHECK quando WITH CHECK é NULL (doc §5.8), portanto
-- esta é mudança puramente documental — sem efeito comportamental.
-- 
-- Rollback: ALTER POLICY ... WITH CHECK (same expression) — reversível.

-- contacts: impede que UPDATE altere assigned_to/queue_id para fora do
-- escopo do agente autenticado (ex: reatribuir para agente de outra fila)
ALTER POLICY "Users can update their assigned contacts" ON public.contacts
  WITH CHECK (
    can_edit_contact(
      assigned_to,
      queue_id,
      (SELECT array_agg(v.v) FROM get_visible_agent_ids(auth.uid()) v(v)),
      (SELECT get_profile_id_for_user(auth.uid())),
      (SELECT is_admin_or_supervisor(auth.uid()))
    )
  );

-- calls: impede que agente mova uma ligação para agent_id de outro agente
ALTER POLICY "Users can update their calls" ON public.calls
  WITH CHECK (
    agent_id IN (
      SELECT profiles.id
      FROM profiles
      WHERE profiles.user_id = auth.uid()
    )
  );

-- message_templates: impede que template mude de dono (user_id)
ALTER POLICY "Users can update their own templates" ON public.message_templates
  WITH CHECK (user_id = auth.uid());

-- payment_links: impede que created_by seja alterado para outro perfil
ALTER POLICY "Users can update own payment links" ON public.payment_links
  WITH CHECK (
    (
      created_by IN (
        SELECT profiles.id
        FROM profiles
        WHERE profiles.user_id = auth.uid()
      )
    )
    OR is_admin_or_supervisor(auth.uid())
  );

-- sales_deals: impede reatribuição de negócio para perfil não visível
ALTER POLICY "Users can update assigned deals" ON public.sales_deals
  WITH CHECK (
    (
      assigned_to IN (
        SELECT profiles.id
        FROM profiles
        WHERE profiles.user_id = auth.uid()
      )
    )
    OR is_admin_or_supervisor(auth.uid())
  );

-- talkx_campaigns: impede que campanha mude de criador
ALTER POLICY "Users can update own campaigns" ON public.talkx_campaigns
  WITH CHECK (
    (
      created_by = (
        SELECT profiles.id
        FROM profiles
        WHERE profiles.user_id = auth.uid()
        LIMIT 1
      )
    )
    AND is_admin_or_supervisor(auth.uid())
  );

-- talkx_recipients: impede mover destinatário para campanha de outro
ALTER POLICY "Users can update recipients of own campaigns" ON public.talkx_recipients
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM talkx_campaigns tc
      WHERE tc.id = talkx_recipients.campaign_id
        AND tc.created_by = (
          SELECT profiles.id
          FROM profiles
          WHERE profiles.user_id = auth.uid()
          LIMIT 1
        )
    )
  );

-- talkx_templates: impede que template de disparo mude de criador
ALTER POLICY "talkx_templates_update" ON public.talkx_templates
  WITH CHECK (
    (
      created_by = (
        SELECT p.id
        FROM profiles p
        WHERE p.user_id = auth.uid()
        LIMIT 1
      )
    )
    OR is_admin_or_supervisor(auth.uid())
  );
