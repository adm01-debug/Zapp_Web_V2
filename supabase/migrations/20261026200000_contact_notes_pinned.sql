-- contact_notes_pinned
-- Rollback: remove o indice parcial das fixadas e a coluna is_pinned; o default false nao gravou nada nas linhas antigas, entao nao ha dado a desfazer.
-- Rollback (SQL executavel, na ordem):
--   drop index if exists public.contact_notes_pinned_idx;
--   alter table public.contact_notes drop column if exists is_pinned;
--
-- Paridade V3 -> V2: a V3 tem contact_notes.is_pinned e ordena as notas fixadas primeiro; a V2
-- nao tinha a coluna. Migration ADITIVA e barata: um ALTER de metadado e um CREATE INDEX.
-- Nenhum UPDATE/backfill, nenhum GRANT/REVOKE novo, nenhuma policy alterada, nenhum trigger
-- tocado (o guard_contact_note_identity segue intacto).
--
-- 1) Coluna: ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false.
--    No PG 11+ isso e operacao de METADADO (sem reescrita da tabela): as linhas existentes
--    passam a ser lidas com is_pinned = false sem que nenhum gatilho rode. Em particular o
--    gatilho de updated_at NAO dispara e a data das notas antigas NAO muda (por isso NAO uso
--    UPDATE de backfill — o default cobre o caso legado). Prova no teste: nota anterior
--    continua com is_pinned = false e updated_at intacto.
-- 2) Indice parcial das fixadas: indexa so as notas marcadas (predicado WHERE is_pinned),
--    que e o caminho de acesso das fixadas de um contato; as nao fixadas nao entram no indice.
-- 3) Permissao: a concessao de TABELA ja existente cobre a coluna nova — 20260909200000
--    concedeu GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_notes TO authenticated,
--    service_role e revogou tudo de anon. Coluna nova de tabela com GRANT de tabela herda o
--    privilegio, entao NAO crio GRANT/REVOKE aqui. A RLS de UPDATE (autor + contato visivel)
--    segue a barreira de linha: so o autor fixa/desfixa a propria nota em contato que enxerga.
--
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa unica transacao; qualquer erro desfaz tudo.

ALTER TABLE public.contact_notes
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS contact_notes_pinned_idx
  ON public.contact_notes (contact_id, created_at DESC, id DESC)
  WHERE is_pinned;
