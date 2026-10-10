Especialista: senior (area-sql-banco)

L7 — Escolha de conexão no envio sem distinção de fila/departamento: lacuna já fechada pela migration 20260930200000. Nenhuma mudança de código necessária.

Ponto 1 — Guarda de escopo de conexão na RPC enqueue_outbound_message
  Arquivo: supabase/migrations/20260930200000_enforce_enqueue_connection_scope.sql (:102-131)
  Prova: bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/enqueue-connection-scope.test.sh
  Saída: 10 PASS / 0 FAIL (BLOCO A mostra o defeito antes da migration; BLOCO B mostra a recusa 42501 whatsapp_connection_out_of_scope depois, com B3/B4 permitidos, B5/B6 pelos fallbacks históricos e B7 provando que a guarda do L9 continua valendo)

Ponto 2 — Última definição da RPC e único caminho do navegador
  Arquivo: src/services/outbound-message.service.ts:110 (chamada a enqueue_outbound_message com p_whatsapp_connection_id)
  Prova: grep confirmou que a migration 20260930200000 é a última a repor a RPC e que nenhuma migration posterior (20260909220000, 20260909240000, 20260909250000, 20260930190000) a sobrescreve

Ponto 3 — Documentação da matriz atualizada
  Arquivo: docs/ia/IA-004-matriz-autorizacao.md §7.2 (linhas 317-324)
  Prova: grep confirmou que L7 está marcado como FECHADO com referência à migration e ao teste

Verificação final: bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/enqueue-connection-scope.test.sh = 10 PASS / 0 FAIL (exit 0)
