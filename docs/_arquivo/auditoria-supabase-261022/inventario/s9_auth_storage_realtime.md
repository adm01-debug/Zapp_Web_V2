# S9 — Auth, Storage e Realtime

**Coletado em:** 2026-11-01

## Auth

### Usuários

```sql
SELECT 
  count(*) as total_users,
  count(*) FILTER (WHERE id NOT IN (SELECT user_id FROM auth.mfa_factors)) as users_no_mfa
FROM auth.users;
-- Resultado: {"total_users": 10, "users_no_mfa": 10}
```

| Métrica | Valor | Risco |
|---|---|---|
| Total de usuários | 10 | — |
| Usuários SEM MFA | **10 (100%)** | **ALTO** |

### Audit Log

```sql
SELECT count(*), min(created_at), max(created_at) FROM auth.audit_log_entries;
-- Resultado: count=0, min=null, max=null
```

**Auth audit log está VAZIO** — não há registros de eventos de autenticação.

## Storage

### Buckets

| Bucket | Público | Limite |
|---|---|---|
| `audio-messages` | ❌ privado | 25 MB |
| `whatsapp-media` | ❌ privado | 25 MB |
| `avatars` | ❌ privado | 5 MB |
| `stickers` | ✅ público | 5 MB |
| `audio-memes` | ✅ público | 5 MB |
| `custom-emojis` | ✅ público | 512 kB |
| `team-chat-files` | ❌ privado | 10 MB |
| `multiplix-voice` | ❌ privado | 50 MB |
| `voice-changer-tmp` | ❌ privado | 25 MB |

**3 buckets públicos** (stickers, audio-memes, custom-emojis) — aceitável para conteúdo de mídia não-PII.

**`multiplix-voice` sem `allowed_mime_types`** — aceita qualquer tipo de arquivo. Risco de upload inesperado.

## Realtime

**NÃO VERIFICADO** — verificação de publicações Realtime requer `pg_publication_tables` e comparação com RLS.