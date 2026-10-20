-- MultiplixMonitor.tsx assina postgres_changes em multiplix_dispatches/
-- multiplix_recipients (progresso e contadores ao vivo do disparo). Sem
-- as tabelas na publicacao supabase_realtime, o evento nunca dispara em
-- producao -- e o guard offline (check-realtime-subscriptions.mjs) ja
-- barra isso no PR, comparando o codigo contra
-- scripts/db-audit/realtime-publication-baseline.json.
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplix_dispatches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplix_recipients;
