# Realtime Publication — Team Chat

## Decisão

As 5 tabelas do módulo Team Chat estão na publicação `supabase_realtime`:

| Tabela | Schema | Motivo |
|---|---|---|
| `team_conversations` | public | Lista de conversas e metadados |
| `team_conversation_members` | public | Membros, `last_read_at`, papéis |
| `team_messages` | public | Mensagens — REPLICA IDENTITY DEFAULT (E47) |
| `team_message_reactions` | public | Reações em tempo real |
| `team_message_receipts` | public | Recibos de leitura |

Confirmado via `pg_publication_tables` em 2026-09-29.

## Naming de canais

| Canal | Escopo | Tipo |
|---|---|---|
| `team:inbox:<profile_id>:<sfx>` | Por usuário | postgres_changes |
| `team:messages:<conv_id>:<sfx>` | Por conversa | postgres_changes |
| `team:reactions:<conv_id>:<sfx>` | Por conversa | postgres_changes |
| `team:receipts:<conv_id>:<sfx>` | Por conversa | postgres_changes |
| `team:typing:<conv_id>` | Por conversa | broadcast |
| `team:presence` | Global | presence |

`<sfx>` = `crypto.randomUUID().slice(0, 8)` — evita conflito entre tabs.

## Baseline

Ver `scripts/db-audit/realtime-publication-baseline.json`.
