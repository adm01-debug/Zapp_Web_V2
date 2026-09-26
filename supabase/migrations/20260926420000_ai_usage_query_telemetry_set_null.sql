-- Fecha o achado ALTO da auditoria de 2026-09-26 sobre o E17 (20260926200000):
-- ai_usage_logs.user_id e query_telemetry.user_id foram criadas com ON DELETE
-- CASCADE. Apagar um usuario apagaria junto o historico de custo/uso de IA
-- (billing) e a telemetria operacional (evidencia de investigacao/seguranca)
-- daquele usuario -- efeito colateral de uma migration de integridade
-- referencial, nao uma decisao deliberada de retencao.
--
-- Versao reversionada de 20260926260000 para 20260926420000: max(version)
-- avancou para 20260926410000 entre a abertura da PR e a aplicacao (varias
-- sessoes paralelas). Conteudo SQL idêntico, so o cabecalho mudou.
--
-- Ambas as colunas ja sao NULLABLE (confirmado ao vivo antes desta migration
-- via information_schema.columns), entao SET NULL nao quebra nenhuma
-- constraint na hora do delete. Nenhuma tabela referencia ai_usage_logs.id ou
-- query_telemetry.id (sem risco de cascata encadeada, confirmado via
-- pg_constraint). As policies de admin
-- ("Admins can view all AI usage logs" / "Admins can delete telemetry",
-- ambas is_admin_or_supervisor(auth.uid())) nao dependem de user_id, entao a
-- linha continua visivel para auditoria/cobranca apos o SET NULL -- so some
-- da visao "minha", que e o comportamento correto para um usuario removido.
ALTER TABLE public.ai_usage_logs
  DROP CONSTRAINT ai_usage_logs_user_id_fkey;

ALTER TABLE public.ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.query_telemetry
  DROP CONSTRAINT query_telemetry_user_id_fkey;

ALTER TABLE public.query_telemetry
  ADD CONSTRAINT query_telemetry_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
