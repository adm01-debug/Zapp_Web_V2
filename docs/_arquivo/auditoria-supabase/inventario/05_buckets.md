# Inventário — Storage Buckets

**Data**: 2026-10-24 | **Total**: 9 buckets auditados  
**Método**: `storage.buckets` + `pg_policies` (schema `storage`) + leitura de edge functions de upload

## Resumo

| Categoria | Qtd |
|-----------|-----|
| Total de buckets | 9 |
| Buckets públicos | 3 |
| Buckets privados | 6 |
| Com filtro MIME configurado | 8 |
| Sem filtro MIME | 1 (LOW-3) |

---

## Inventário detalhado

| Bucket | Público | Limite | MIME Types permitidos | Observação |
|--------|---------|--------|----------------------|------------|
| `audio-memes` | ✅ sim | 5 MB | `audio/*` | Conteúdo público intencional |
| `custom-emojis` | ✅ sim | 512 KB | `image/*` | Conteúdo público intencional |
| `stickers` | ✅ sim | 5 MB | `image/*` | Conteúdo público intencional |
| `audio-messages` | ❌ não | 25 MB | `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/webm`, `audio/wav` | Áudios de conversas — privado correto |
| `avatars` | ❌ não | 5 MB | `image/jpeg`, `image/png`, `image/webp`, `image/gif` | Avatares de usuário |
| `multiplix-voice` | ❌ não | 50 MB | **sem filtro MIME** | LOW-3: aceita qualquer tipo de arquivo |
| `team-chat-files` | ❌ não | 10 MB | `image/*`, `application/pdf`, `audio/*` | Arquivos de chat interno |
| `voice-changer-tmp` | ❌ não | 25 MB | `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/webm` | Temporário, voice changer |
| `whatsapp-media` | ❌ não | 25 MB | `image/*`, `video/*`, `audio/*`, `application/pdf` | Mídia do WhatsApp |

---

## Análise de segurança

### Buckets públicos (3)
`audio-memes`, `custom-emojis`, `stickers` — publicamente legíveis, intencionais. Verificado: apenas conteúdo de mídia, sem dados sensíveis. **INFO-1**.

### `multiplix-voice` sem MIME filter
Upload aceita qualquer tipo de arquivo (LOW-3 / MEDIUM-4 dependendo do contexto). Edge function `multiplix-voices` usa `requireAuth + enforceRateLimit` mas não valida MIME no código de edge — a validação de tipo ocorre apenas no servidor de storage se configurada no bucket. Sem o filtro, um usuário autenticado pode fazer upload de executáveis, scripts, etc.

**Risco real**: baixo em produção (somente usuários autenticados, sem execução de arquivos pelo servidor), mas boa prática exige filtro. Proposta: adicionar `allowed_mime_types: ['audio/*']` ao bucket via migration.

### Políticas RLS de storage

Todas as 6 políticas de storage auditadas seguem o padrão:
- Leitura: `authenticated` ou público onde bucket é público
- Escrita: `authenticated` + verificação de `organization_id` ou `user_id`
- Sem política `anon` de escrita encontrada em storage

---

## Achados desta seção

- **LOW-3**: `multiplix-voice` sem filtro MIME (aceita qualquer tipo)
- **INFO-1**: 3 buckets públicos intencionais (`audio-memes`, `custom-emojis`, `stickers`)
