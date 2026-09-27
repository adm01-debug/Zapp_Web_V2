-- Hardening do Multiplix (item 2 do relatório de auditoria de 5 agentes,
-- 2026-09-27): as policies de ESCRITA de multiplix_dispatches/
-- multiplix_recipients checavam apenas "created_by = meu profile", sem
-- exigir papel de staff (admin/supervisor) — a mesma restrição que já existe
-- na UI (NavigationService.STAFF_ROLES) não estava replicada no banco, então
-- qualquer usuário autenticado (ex.: role "agent") podia criar/editar/excluir
-- disparos de Multiplix via API direta, ignorando o gate do front-end.
-- Nenhuma linha existe hoje em multiplix_dispatches (tabela vazia em prod),
-- então esta migration não precisa de backfill/migração de dados.

-- === multiplix_dispatches: policies de escrita passam a exigir staff ===

DROP POLICY IF EXISTS "Users can create dispatches" ON public.multiplix_dispatches;
CREATE POLICY "Users can create dispatches" ON public.multiplix_dispatches
  FOR INSERT WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS "Users can update own dispatches" ON public.multiplix_dispatches;
CREATE POLICY "Users can update own dispatches" ON public.multiplix_dispatches
  FOR UPDATE USING (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS "Users can delete own draft dispatches" ON public.multiplix_dispatches;
CREATE POLICY "Users can delete own draft dispatches" ON public.multiplix_dispatches
  FOR DELETE USING (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    AND status = 'draft'
  );

-- === multiplix_recipients: mesma exigência propagada; UPDATE ganha WITH CHECK explícito ===

DROP POLICY IF EXISTS "Users can insert recipients into own dispatches" ON public.multiplix_recipients;
CREATE POLICY "Users can insert recipients into own dispatches" ON public.multiplix_recipients
  FOR INSERT WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    )
  );

DROP POLICY IF EXISTS "Users can update recipients of own dispatches" ON public.multiplix_recipients;
CREATE POLICY "Users can update recipients of own dispatches" ON public.multiplix_recipients
  FOR UPDATE USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    )
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    )
  );

DROP POLICY IF EXISTS "Users can delete recipients of own draft dispatches" ON public.multiplix_recipients;
CREATE POLICY "Users can delete recipients of own draft dispatches" ON public.multiplix_recipients
  FOR DELETE USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );

-- === Realtime: retirar colunas de PII/token do payload publicado ===
-- destino_e164 (telefone do destinatário), personalized_message (conteúdo da
-- mensagem) e delivery_claim_token (token de lease/claim de worker) nunca são
-- lidos do payload realtime pelo front-end (MultiplixMonitor.tsx só usa o
-- evento como gatilho de invalidateQueries e refaz um SELECT normal) — então
-- removê-los do filtro de colunas da publication não quebra a UI, só reduz
-- a superfície de exposição do que trafega por postgres_changes.
-- REPLICA IDENTITY já é DEFAULT (chave primária "id") nas duas tabelas, então
-- o filtro de colunas via ADD TABLE (...) é suportado (Postgres 15+; este
-- projeto roda 17.6). Não usamos "SET TABLE" pois isso substituiria a lista
-- COMPLETA de tabelas da publication (24 tabelas hoje) — DROP+ADD afeta só
-- esta tabela.

ALTER PUBLICATION supabase_realtime DROP TABLE public.multiplix_recipients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplix_recipients (
  id, dispatch_id, company_id, company_name_snapshot, destino_origem,
  status, sent_at, delivered_at, error_message,
  delivery_claimed_at, delivery_claim_expires_at, delivery_claimed_by, delivery_attempt_count,
  created_at, updated_at, attempt_count, retry_after, provider_dispatch_started_at, external_id
);
