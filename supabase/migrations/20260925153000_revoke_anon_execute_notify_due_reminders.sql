-- Auditoria: a migration 20260925170100_add_notify_due_reminders.sql fez
-- REVOKE ALL ON FUNCTION notify_due_reminders() FROM PUBLIC, mas neste
-- projeto o EXECUTE de funcoes novas em public e concedido por default
-- diretamente a anon/authenticated (via ALTER DEFAULT PRIVILEGES), nao via
-- PUBLIC. Resultado: anon conseguia chamar a function sem autenticacao via
-- PostgREST (POST /rest/v1/rpc/notify_due_reminders), disparando o
-- processamento de lembretes vencidos fora do ciclo do cron. Nenhum dado de
-- terceiro e exposto (a function so processa lembretes que ja venceriam de
-- qualquer forma), mas e superficie de abuso/DoS desnecessaria e contraria
-- a intencao do REVOKE original. Todas as outras SECURITY DEFINER functions
-- do projeto revogam anon/authenticated explicitamente -- esta migration so
-- alinha notify_due_reminders ao mesmo padrao.

REVOKE ALL ON FUNCTION public.notify_due_reminders() FROM PUBLIC, anon, authenticated;
