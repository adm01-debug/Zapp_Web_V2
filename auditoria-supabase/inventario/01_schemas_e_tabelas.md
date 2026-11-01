# Inventário — Schemas e Tabelas

**Data**: 2026-10-24 | **Projeto**: tnnnlkbymytvtqngbbqh

## Schemas encontrados

| Schema | Tipo | Tabelas | Observação |
|--------|------|---------|------------|
| `public` | Aplicação principal | ~150+ | RLS habilitado na maioria |
| `auth` | Supabase Auth | Gerenciado | JWT, usuários, sessões |
| `storage` | Supabase Storage | Gerenciado | 9 buckets |
| `extensions` | Extensões | Sistema | pg_stat_statements aqui |
| `cron` | pg_cron | Sistema | 24 jobs ativos |
| `vault` | Supabase Vault | Sistema | Segredos criptografados |
| `_bkp_261023` | Backup manual | 9 tabelas | **SEM RLS**, sem grants a roles de app |
| `ops` | Operacional | 1 tabela | RLS habilitado |
| `ops_backup` | Backup avatar fix | 1 tabela | Sem RLS, sem grants a roles de app |

## Extensões instaladas

- `pg_cron` 1.6.4
- `pg_net` 0.20.4
- `pg_trgm` (índices de busca textual)
- `pgcrypto`
- `uuid-ossp`
- `pg_stat_statements` (schema `extensions`)
- `vector` (embeddings)

## Buckets de Storage

| Bucket | Público | Limite | MIME Types |
|--------|---------|--------|------------|
| audio-memes | ✅ sim | 5MB | audio/* |
| custom-emojis | ✅ sim | 512KB | image/* |
| stickers | ✅ sim | 5MB | image/* |
| audio-messages | ❌ não | 25MB | áudios |
| avatars | ❌ não | 5MB | imagens |
| multiplix-voice | ❌ não | 50MB | sem filtro MIME |
| team-chat-files | ❌ não | 10MB | imagens/docs/áudio |
| voice-changer-tmp | ❌ não | 25MB | áudios |
| whatsapp-media | ❌ não | 25MB | imagens/vídeo/áudio |

## Migrações

- Total registradas no ledger: **1.054**
- Com `statements IS NULL`: **60** (anomalia — dados de auditoria ausentes)
- Versão máxima: `20261026150300`

## Edge Functions (83 funções no repo)

Lista completa em `inventario/08_edge_functions.md`.

Funções com `verify_jwt = false` (6):
- `auth-login` — login server-side antes de ter JWT
- `whatsapp-webhook` — recebe webhooks da Meta/Evolution (HMAC)
- `gmail-webhook` — recebe push notifications do Gmail
- `gmail-cron-sync` — cron via pg_cron (x-cron-secret)
- `batch-fetch-avatars` — cron via pg_cron (x-cron-secret)
- `elevenlabs-webhook` — recebe eventos do ElevenLabs

## Crons ativos (24)

Detalhes em `inventario/06_crons.md`.
