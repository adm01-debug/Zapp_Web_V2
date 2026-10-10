-- 20260929580000_multiplix_policies_consolidation
-- Bloco A (F04) do docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
--
-- Estado real hoje: as 9 policies de leitura/escrita de multiplix_dispatches e
-- multiplix_recipients estao TO authenticated — mas isso e efeito de ORDEM DE
-- APLICACAO, nao do conteudo dos arquivos. A 20260927130001 criou as 9 com
-- TO authenticated; a 20260927210000 (hardening de escrita: exige
-- is_admin_or_supervisor) recriou 6 delas SEM a clausula TO, o que em Postgres
-- volta a roles={public}. Em producao as duas rodaram na ordem inversa da do
-- repositorio (210000 antes de 130001), entao o estado vivo ficou
-- authenticated — mas um replay limpo (banco novo, ordem dos arquivos) terminaria
-- com PUBLIC, ou seja: a auditoria de 2026-09-29 encontrou o modulo em um estado
-- que o repositorio nao reproduz.
--
-- Este arquivo e o estado final autoritativo: recria as 9 policies com
-- TO authenticated E com a semantica de hardening (staff + dono), de forma
-- idempotente, para que um replay limpo chegue exatamente no estado vivo.
--
-- Divergencia deliberada do plano: F04 pede uma nota no cabecalho de
-- 20260927130001 dizendo que o "preserving exact USING" nao era verdade. Editar
-- migration ja aplicada e proibido pelo proprio repositorio (guard
-- "Rejeitar edicao de migration ja existente", .github/workflows/db-guard.yml,
-- regra 7 da secao 1 do CLAUDE.md), entao a correcao fica registrada aqui e em
-- docs/adr/ (F19) em vez de reescrever o arquivo antigo.
--
-- Nenhuma linha nas tabelas alvo: a recriacao nao altera acesso de dado nenhum
-- (e o mesmo recorte de hoje) — o efeito e a reprodutibilidade do replay.

-- === multiplix_dispatches ===
DROP POLICY IF EXISTS "Admins can view all dispatches" ON public.multiplix_dispatches;
CREATE POLICY "Admins can view all dispatches" ON public.multiplix_dispatches
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Users can view own dispatches" ON public.multiplix_dispatches;
CREATE POLICY "Users can view own dispatches" ON public.multiplix_dispatches
  FOR SELECT
  TO authenticated
  USING (
    created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS "Users can create dispatches" ON public.multiplix_dispatches;
CREATE POLICY "Users can create dispatches" ON public.multiplix_dispatches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS "Users can update own dispatches" ON public.multiplix_dispatches;
CREATE POLICY "Users can update own dispatches" ON public.multiplix_dispatches
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS "Users can delete own draft dispatches" ON public.multiplix_dispatches;
CREATE POLICY "Users can delete own draft dispatches" ON public.multiplix_dispatches
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    AND status = 'draft'
  );

-- === multiplix_recipients ===
DROP POLICY IF EXISTS "Users can view recipients of accessible dispatches" ON public.multiplix_recipients;
CREATE POLICY "Users can view recipients of accessible dispatches" ON public.multiplix_recipients
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND (
          md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          OR public.is_admin_or_supervisor(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Users can insert recipients into own dispatches" ON public.multiplix_recipients;
CREATE POLICY "Users can insert recipients into own dispatches" ON public.multiplix_recipients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );

DROP POLICY IF EXISTS "Users can update recipients of own dispatches" ON public.multiplix_recipients;
CREATE POLICY "Users can update recipients of own dispatches" ON public.multiplix_recipients
  FOR UPDATE
  TO authenticated
  USING (
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
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );
