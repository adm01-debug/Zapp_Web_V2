# Baseline de queries lentas — E19 (PLANO_MELHORIAS_50)

> Snapshot de `extensions.pg_stat_statements` (banco oficial `tnnnlkbymytvtqngbbqh`), coletado em
> 2026-09-26. **Janela real: ~22h** (`stats_reset = 2026-09-25T12:28:28Z`) — a extensão já estava
> instalada (`extensions.pg_stat_statements`, v1.11, `shared_preload_libraries` inclui o módulo);
> o que faltava era só saber o schema certo (`extensions`, não `public`). Não é baseline de 30 dias
> — é uma amostra real de tráfego de produção, suficiente para achar o problema real abaixo. Repetir
> a consulta depois de uma semana de tráfego antes de decidir qualquer índice novo.

```sql
SELECT query, calls, round(mean_exec_time::numeric,1) media_ms, round(total_exec_time::numeric,0) total_ms
FROM extensions.pg_stat_statements
WHERE query !~* '^\s*(SET|SHOW|BEGIN|COMMIT|ROLLBACK|DEALLOCATE|DISCARD|LISTEN|pg_stat|EXPLAIN|SELECT pg_)'
ORDER BY total_exec_time DESC LIMIT 20;
```

## Top consumidoras (22h de janela)

| # | Query (resumo) | calls | média | total | % do tempo total |
|---|---|---|---|---|---|
| 1 | `wal->>… ` (decodificação de replicação/Realtime) | 148.893 | 16,0ms | 2.375.876ms | 73,4% |
| 2 | `UPDATE messages SET is_read=… WHERE contact_id=… AND sender=… AND is_read=…` | 93 | **551,2ms** | 51.263ms | 1,6% |
| 3 | `SELECT messages… WHERE NOT contact_id IS NULL ORDER BY created_at DESC LIMIT/OFFSET` | 84 | 319,7ms | 26.854ms | 0,8% |
| 4 | `SELECT contacts.*, COALESCE(contacts_conversation_sla_1.contac…` | 65 | 206,1ms | 13.396ms | 0,4% |
| 5 | `SELECT contacts.assigned_to WHERE NOT …` | 70 | 183,5ms | 12.844ms | 0,4% |

A #1 (73,4% do tempo total, 148.893 chamadas) é a decodificação do WAL pelo publisher do Realtime —
não é uma query do app, é o custo estrutural de manter `supabase_realtime` ativo. Não há ação aqui
além de manter sob monitoramento se crescer desproporcional ao volume de mensagens.

## Achado real — causa raiz da #2 (não é falta de índice)

`UPDATE messages SET is_read=true WHERE contact_id=$1 AND sender='contact' AND is_read=false`
(o "marcar como lido" da inbox) roda em **551ms de média** — muito acima do esperado para um UPDATE
de poucas linhas.

`EXPLAIN (ANALYZE, BUFFERS)` na mesma forma de query mostra que o plano já usa o índice ideal
(`idx_messages_unread_contact`, parcial em `is_read=false AND sender='contact'`) e executa em
~22ms de trabalho de índice — **o índice não é o gargalo**. Os 2 triggers `BEFORE UPDATE`
(`trg_guard_message_delivery_internal_fields`, `update_messages_updated_at`) somam <1ms.

Causa raiz confirmada:

```sql
SELECT relreplident FROM pg_class WHERE oid='public.messages'::regclass;  -- 'f' = REPLICA IDENTITY FULL
SELECT pubname FROM pg_publication_tables WHERE tablename='messages';    -- supabase_realtime
```

`messages` está com **`REPLICA IDENTITY FULL`** e publicada no `supabase_realtime`. Com FULL, todo
UPDATE grava no WAL a linha **antiga inteira** (não só a PK) — em uma tabela com colunas grandes
(`content`, `media_url`, `media_meta` jsonb, `caption`…), isso infla o custo de I/O de cada UPDATE,
mesmo quando o WHERE é seletivo e o índice é perfeito.

## Por que isto NÃO vira migration autônoma

Trocar para `REPLICA IDENTITY DEFAULT` (só a PK no WAL) reduziria o custo do UPDATE, mas o Realtime
do Supabase usa filtros `postgres_changes` (`.on('UPDATE', filter: 'contact_id=eq...')`) que podem
depender dos valores **antigos** das colunas filtradas para decidir quem recebe o evento — se algum
listener do front filtra por uma coluna que não é a PK, `DEFAULT` pode quebrar esse filtro
silenciosamente. Decidir isso exige auditar todo uso de `.channel(...).on('postgres_changes', ...)`
sobre `messages` no front (`useRealtimeMessages` e afins) antes de mudar — é uma decisão de
arquitetura/comportamento em produção, não uma etapa autônoma de banco. Registrado aqui para decisão.

## #3 — paginação sem filtro seletivo

`SELECT messages… WHERE NOT contact_id IS NULL ORDER BY created_at DESC LIMIT/OFFSET` (319,7ms,
84 calls) varre a tabela sem filtro seletivo real (`NOT contact_id IS NULL` é quase sempre
verdadeiro). Com 47.878 mensagens, paginação por `OFFSET` alto tende a piorar. Sem contexto de qual
tela dispara essa query (parece uma listagem administrativa "todas as mensagens", não a inbox por
contato, que já usa `idx_messages_contact_created`) — candidato a keyset pagination (`created_at <
$cursor`) em vez de `OFFSET`, mas precisa identificar o chamador antes de mudar contrato de API.

---
*Gerado em 2026-09-26, sessão de execução do `PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md` (E19).*
