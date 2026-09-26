-- Reconciliação (db-live-guard): DDL aplicado direto em produção sem arquivo no Git.
-- Confirmado ao vivo em pg_publication_tables antes de escrever este arquivo — este
-- arquivo só espelha o que já está aplicado, nenhuma escrita nova no banco.
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplix_dispatches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplix_recipients;
