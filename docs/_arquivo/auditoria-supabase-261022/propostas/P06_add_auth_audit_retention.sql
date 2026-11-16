-- P06: Habilitar e manter retenção do auth audit log
-- Severidade: MÉDIA
-- Status: NÃO APLICADA
-- Rollback: ver seção ROLLBACK abaixo
--
-- Situação: auth.audit_log_entries está vazio (0 registros, null min/max).
-- Sem audit log, não há rastreabilidade de logins, logouts e tentativas suspeitas.

-- ============================================================
-- DIAGNÓSTICO (somente leitura):
-- ============================================================

SELECT count(*), min(created_at), max(created_at) FROM auth.audit_log_entries;
-- Resultado: 0, null, null

-- Verificar schema da tabela:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'auth' AND table_name = 'audit_log_entries';
-- Colunas: id, instance_id, ip_address, payload, created_at

-- ============================================================
-- PROPOSTA:
-- ============================================================

/*
O auth audit log do Supabase é gerenciado internamente.
Para habilitá-lo/verificá-lo:

1. Verificar no painel: Authentication > Providers > configurações de log
2. Verificar se o plano Supabase atual inclui audit logging
   (planos Pro incluem; Free pode não incluir)

Se disponível, adicionar job de retenção para evitar crescimento ilimitado:

-- TEMPLATE para retention job (após habilitar o audit log):
SELECT cron.schedule(
  'auth-audit-retention-90d',
  '0 2 * * 0',  -- Domingo 02:00
  $$DELETE FROM auth.audit_log_entries WHERE created_at < NOW() - INTERVAL '90 days'$$
);
*/

-- ============================================================
-- ROLLBACK:
-- ============================================================

/*
-- Remover job de retenção se criado:
SELECT cron.unschedule('auth-audit-retention-90d');
*/