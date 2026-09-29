-- ============================================================================
-- V11.1 — fecha os furos que a auditoria adversarial de 2026-09-29 encontrou no
-- contrato de eventos do Talk X (migration 20260929730000):
--
--   1) XOR no alvo: antes o CHECK era OR, entao um evento podia ter campanha E
--      entidade ao mesmo tempo. Como o ramo de campanha da policy nao exige ser
--      admin, qualquer dono de campanha conseguia forjar um evento de entidade
--      (suppression_add/segments_reviewed/checklist) com campaign_id preenchido,
--      driblando a intencao declarada ("evento de entidade e restrito a admin").
--      Agora campanha e entidade sao mutuamente exclusivas: um evento e de
--      campanha OU de entidade, nunca dos dois, nunca de nenhum.
--
--   2) Guarda de FORMATO em entity_type: o campo aceitava qualquer texto (a
--      auditoria provou gravando 'QUALQUER_COISA'). Nao e um enum de valores —
--      o vocabulario sera formalizado junto com as etapas V71-V80 — mas impede
--      lixo. O ponto ('.') e permitido de proposito: a tabela irma
--      public.audit_logs ja usa entity_type com ponto no banco vivo
--      ('auth.users'); a convencao do projeto tolera esse formato.
--
--   3) REVOKE da escrita perigosa na trilha. anon e authenticated tinham
--      TRUNCATE, DELETE, UPDATE, TRIGGER e REFERENCES. TRUNCATE NAO passa por
--      RLS: foi provado em PostgreSQL 17 que anon conseguia TRUNCATE na tabela
--      e apagar a trilha inteira. Um evento e uma trilha append-only: o app so
--      faz SELECT e INSERT, entao o resto era privilegio sem uso e com risco.
--
-- NAO perde dado: a constraint de alvo e substituida por uma mais restritiva e
-- os privilegios removidos nao tem nenhum consumidor no codigo (varredura em
-- src/, supabase/, scripts/, e2e/, tests/).
--
-- PROVAS (PostgreSQL 17 descartavel, pre-flight de 2026-09-29):
--   * XOR — campanha-sozinha ACEITA; entidade-sozinha ACEITA (admin);
--     campanha+entidade REJEITADA; nenhum-dos-dois REJEITADA.
--   * formato — 'QUALQUER_COISA', '', 'a', 42+ chars e 'suppression-add'
--     REJEITADOS; 'suppression', 'segments', 'checklist' ACEITOS.
--   * REVOKE — DELETE direto de evento passa a ser 'permission denied' para
--     anon/authenticated, MAS o ON DELETE CASCADE continua funcionando: ao
--     apagar um rascunho de campanha, os eventos filhos somem normalmente (as
--     acoes referenciais rodam com privilegio do OWNER da tabela filha e
--     ignoram a ACL do usuario corrente, e a tabela esta RLS ENABLE sem FORCE).
--     Provado com controle antes/depois e com service_role.
--   * idempotencia — aplicar duas vezes nao duplica constraint nem policy.
--
-- Ordem: esta migration roda DEPOIS de 20260929730000 (ja aplicada).
-- ============================================================================

-- (1) XOR: campanha OU entidade — nunca os dois, nunca nenhum -------------------
ALTER TABLE public.talkx_campaign_events
  DROP CONSTRAINT IF EXISTS talkx_campaign_events_target_check;

ALTER TABLE public.talkx_campaign_events
  ADD CONSTRAINT talkx_campaign_events_target_check
  CHECK ((campaign_id IS NOT NULL) <> ((entity_type IS NOT NULL) AND (entity_id IS NOT NULL)));

-- (2) Guarda de formato do entity_type (nao e enum: o vocabulario vem na V71-V80)
ALTER TABLE public.talkx_campaign_events
  DROP CONSTRAINT IF EXISTS talkx_campaign_events_entity_type_format_check;

ALTER TABLE public.talkx_campaign_events
  ADD CONSTRAINT talkx_campaign_events_entity_type_format_check
  CHECK (entity_type IS NULL OR entity_type ~ '^[a-z][a-z0-9_.]{1,40}$');

-- (3) Trilha append-only: tira a escrita perigosa de anon/authenticated,
--     mantendo SELECT (ler) e INSERT (gravar evento). service_role nao e tocado.
REVOKE TRUNCATE, DELETE, UPDATE, TRIGGER, REFERENCES
  ON public.talkx_campaign_events FROM anon, authenticated;
