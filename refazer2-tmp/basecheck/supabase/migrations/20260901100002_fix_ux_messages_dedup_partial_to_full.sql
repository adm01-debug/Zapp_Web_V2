-- E08 fix: recriar ux_messages_dedup sem WHERE clause
-- Problema: índice parcial (WHERE external_id IS NOT NULL) é incompatível com
-- ON CONFLICT (cols) DO NOTHING do Supabase JS client — retorna 42P10
-- Solução: índice não-parcial (PostgreSQL permite múltiplos NULLs em UNIQUE por design)
-- Validado: 0 mensagens com external_id IS NULL; simulação confirmou ON CONFLICT funcionando
-- Janela de vulnerabilidade entre DROP e RENAME: ~8ms; taxa de 400 msgs/hora = risco negligível

-- Fase 1: criar novo índice enquanto o parcial ainda protege
CREATE UNIQUE INDEX ux_messages_dedup_v2
  ON public.messages (whatsapp_connection_id, external_id, sender);

-- Fase 2: drop do parcial (mínima janela de vulnerabilidade)
DROP INDEX public.ux_messages_dedup;

-- Fase 3: renomear para manter compatibilidade com referências existentes
ALTER INDEX public.ux_messages_dedup_v2 RENAME TO ux_messages_dedup;
