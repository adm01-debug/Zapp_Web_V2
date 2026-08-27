# Inventário Auth + Storage — Origem `vpkmqeumtxhrwgawxdrl`

Gerado: 2026-08-27 · Sessão 4 · src_query read-only

---

## Storage — Buckets (7)

| Bucket | Public | file_size_limit | allowed_mime_types | Objetos |
|---|---|---|---|---|
| audio-memes | ✅ sim | ilimitado | any | 0 |
| audio-messages | ❌ não | ilimitado | any | 0 |
| avatars | ✅ sim | 5 MB | any | 0 |
| custom-emojis | ✅ sim | 500 KB | any | 0 |
| stickers | ✅ sim | ilimitado | any | 0 |
| team-chat-files | ❌ não | ilimitado | any | 0 |
| whatsapp-media | ❌ não | ilimitado | any | 0 |

**Total de objetos na origem: 0** — nada para migrar em storage.

Destino já tem os 7 buckets com as mesmas configurações (D1/step 37). ✅

---

## Auth — Usuários (3)

| Email | Provider | Criado | Último login |
|---|---|---|---|
| `ti@promobrindes.com.br` | email | 2026-05-18 | 2026-05-27 |
| `ti02.promobrindes@gmail.com` | google | 2026-05-20 | 2026-05-20 |
| `adm01@promobrindes.com.br` | google | 2026-05-27 | 2026-06-12 |

**Providers ativos na origem:** email + google OAuth.

### Providers para configurar no destino (etapa 39)

| Provider | Ação |
|---|---|
| Email/senha | Habilitado por padrão — verificar `SMTP` e `email templates` |
| Google OAuth | **Requer** `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` no dashboard do destino |
| site_url | Ajustar para `https://zapp.srv1481814.hstgr.cloud` (D8) |
| redirect_urls | Adicionar `https://zapp.srv1481814.hstgr.cloud/**` |
| JWT expiry | Verificar — origin usa 3600s (`app.settings.jwt_exp`) |

### Gate 51 — migrar usuários?

Os 3 usuários existentes usam emails reais da Promo Brindes. **Decisão pendente do Joaquim:**
- **Sim:** exportar via `auth.users` + import via `auth_create_user` no destino (preserva emails)
- **Não:** destino nasce limpo, usuários fazem login novo (Google OAuth autocria)

---

## Nota

Auth config (site_url, SMTP, OAuth credentials) não é acessível via SQL na origem — 
configurar manualmente no dashboard do destino na etapa 39 usando os valores acima.
