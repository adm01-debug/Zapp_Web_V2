# HANDOFF — ZAPP WEB V2 (Estado real em produção)

Gerado: 2026-08-30 UTC · Por: Claude · Para: Claude (próxima sessão) · Dono: Joaquim / Promo Brindes

> **⚠️ ATENÇÃO CRÍTICA — NÃO MISTURAR OS SISTEMAS**
> ZAPP WEB V2 e ZAPP WEB V3 são sistemas **completamente independentes**.
> Cada um tem seu próprio repo GitHub, banco Supabase e instância Evolution API.
> Antes de qualquer escrita (commit, DDL, deploy, secret), confirmar em qual sistema você está operando.

---

## 0. Como iniciar uma nova sessão

1. Leia este documento inteiro antes de executar qualquer coisa.
2. Confirme o estado real com as verificações da seção 7.
3. Só pergunte ao Joaquim o que estiver marcado como GATE ou DECISÃO.
4. Respostas em PT-BR, resultado primeiro, diff mínimo, fechar com bloco `Próximos passos` (exatamente 3).

---

## 1. Identidade dos sistemas (não confundir)

### ZAPP WEB V2 — este documento

| Camada | Valor |
|---|---|
| GitHub repo | `adm01-debug/Zapp_Web_V2` (underscore) |
| Supabase projeto | `tnnnlkbymytvtqngbbqh` · PG 17.6 · us-west-2 |
| Supabase URL | `https://tnnnlkbymytvtqngbbqh.supabase.co` |
| Vercel projeto | `juca1/zapp_web_v2` · `prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp` |
| URL produção | `https://zapp-web-v2.vercel.app` |
| Evolution API | Evolution GO `evolution-go-rxj2` · VPS Hostinger `187.77.151.129` |
| Evolution URL | `https://evolution-go-rxj2.srv1481814.hstgr.cloud` |
| Webhook Evolution | `https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/evolution-webhook` |

### ZAPP WEB V3 — outro sistema, não tocar aqui

| Camada | Valor |
|---|---|
| GitHub repo | diferente (não confundir com `Zapp_Web_V2`) |
| Supabase projeto | `uqysyzndkfiwfztbqvsl` |
| Evolution API | instância `wpp2` na AtomicaBR |

---

## 2. Regras de trabalho

- Execução end-to-end via MCP. Nunca "copie e cole".
- Decidir como dev sênior. Perguntar só para custo, arquitetura, dado destrutivo, trade-off de negócio.
- Verdade acima de validação: nunca afirmar que testou o que não rodou.
- Zero churn: não refatorar o que não foi pedido.
- `APROVADO` = executar exatamente o plano.
- Diagnóstico antes de patch: ler logs/estado real antes de qualquer fix.

---

## 3. Ferramentas MCP — qual usar para quê

| MCP | Uso |
|---|---|
| `SUPABASE - ZAPP WEB V2 - MCP:db_query` | SQL arbitrário no destino (service_role, escrita permitida, multi-statement, timeout 120s) |
| `SUPABASE - ZAPP WEB V2 - MCP:db_batch_query` | Vários SQLs em sequência |
| `MCP - SUPABASE / LOVABLE CLOUD - ZAPP WEB V2:src_query` | SQL read-only na **origem** `vpkmqeumtxhrwgawxdrl` (Lovable Cloud, somente leitura) |
| `GITHUB - MCP - FOREVER:*` | Única forma confiável de escrever em `adm01-debug/Zapp_Web_V2` (MCP padrão dá 403 em write) |
| `HOSTINGER - MCP:VPS_*` | Docker Manager na VPS Hostinger (virtualMachineId `1481814`) |
| `Vercel:*` | Deploy, proteção, analytics do projeto `prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp` |
| `CLOUDFLARE - MCP - WORKERS:cf_worker_deploy` | Deploy de Cloudflare Workers (preserva secrets) |

### Armadilhas conhecidas

- `github_push_files` requer `content_base64` para binários; `text` para texto UTF-8.
- `github_push_files` com `create_branch_from` cria a branch se não existir — preferir isso a `github_create_branch` separado.
- Dois repos de nome parecido: `Zapp_Web_V2` (underscore, V2, este) e `zapp-web-v2` (hífen, repo antigo da migração). Nunca confundir.
- VPS `virtualMachineId`: sempre `1481814` (srv1481814.hstgr.cloud).
- `PORTAINER - MCP` é da VPS **AtomicaBR**, não da Hostinger. Não usar para o V2.
- `main` está protegida com branch protection (3 status checks). Todo PR entra por branch + merge.

---

## 4. Estado do banco `tnnnlkbymytvtqngbbqh` (conferido em 2026-08-30)

| Item | Valor |
|---|---|
| PostgreSQL | 17.6 |
| Migrations aplicadas | **299** |
| Última migration | `20260829120000_revoke_anon_ai_providers` |
| Tabelas public | 124 |
| RLS habilitado | 124/124 (100%) |
| Policies | 366 |
| Tabelas com RLS e sem policy | 0 |
| Funções public | 67 |
| Auth users | 3 |
| Storage buckets | 7 |
| Cron jobs ativos | 3 |

### Paridade repo ↔ banco

Confirmada: 299 migrations no banco = 299 arquivos em `supabase/migrations/`. Última auditoria em 29/08/2026 (PR #62) fechou todos os gaps conhecidos.

### Storage buckets

| Bucket | Público | Limite tamanho | MIME permitidos |
|---|---|---|---|
| audio-memes | ✅ | — | qualquer |
| audio-messages | ✅ | — | qualquer |
| avatars | ✅ | 5 MB | jpeg/png/webp/gif |
| custom-emojis | ✅ | 512 KB | png/webp/gif/jpeg/svg |
| stickers | ✅ | — | qualquer |
| team-chat-files | ✅ | — | qualquer |
| whatsapp-media | ✅ | — | qualquer |

---

## 5. Cron jobs (auditado em 2026-08-30 — zero falhas históricas)

| jobid | Nome | Schedule | Alvo | 48h: ok/fail | Duração avg |
|---|---|---|---|---|---|
| 1 | `cleanup-link-preview-cache` | `0 3 * * *` (diário 03:00 UTC) | `public.cleanup_link_preview_cache()` SQL direto | 2/0 | 39 ms |
| 3 | `avatars-refresh` | `0 * * * *` (a cada hora) | edge fn `batch-fetch-avatars` via `net.http_post` (vault: `sicoob_service_role_key`) | 43/0 | 34 ms |
| 4 | `gmail-incremental-sync` | `*/5 * * * *` (a cada 5 min) | edge fn `gmail-cron-sync` via `net.http_post` (anon key + vault: `gmail_cron_secret`) | 306/0 | 27 ms |

**Obs 1:** o `duration` reportado é o tempo de disparo do `net.http_post`, não a execução da edge function em si. Erros na função aparecem nos logs da edge function, não em `cron.job_run_details`.

**Obs 2:** `avatars-refresh` usa o secret vault chamado `sicoob_service_role_key`. O nome é legado — é a service_role key do próprio projeto `tnnnlkbymytvtqngbbqh`, não do Sicoob. Não renomear sem recriar o cron.

---

## 6. Edge functions (61 funções + `_shared`)

Todas sob `supabase/functions/` no repo `Zapp_Web_V2`.

AI: ai-auto-tag, ai-churn-analysis, ai-classify-tickets, ai-conversation-analysis, ai-conversation-summary, ai-enhance-message, ai-proxy, ai-suggest-reply, ai-transcribe-audio

Auth/User: approve-password-reset, create-user, detect-new-device, webauthn

Auto/Cleanup: auto-close-conversations, cleanup-rate-limit-logs

Media: batch-fetch-avatars, migrate-media-storage, recover-corrupted-audios

Integrações: bitrix-api, chatbot-l1, classify-audio-meme, classify-emoji, classify-sticker, connection-health-check, fetch-link-preview, get-mapbox-token, get-sip-password, promogifts-catalog, public-api

ElevenLabs: elevenlabs-agent-token, elevenlabs-dialogue, elevenlabs-scribe-token, elevenlabs-sfx, elevenlabs-sts, elevenlabs-tts, elevenlabs-tts-stream, elevenlabs-voice-design, elevenlabs-webhook

Evolution: evolution-api, evolution-sync, evolution-webhook

External DB: external-db-bridge, external-db-proxy

Gmail: gmail-cron-sync, gmail-oauth, gmail-send, gmail-sync, gmail-webhook

Email/Notif: send-email, send-rate-limit-alert, send-scheduled-report, sentiment-alert

Sicoob: sicoob-bridge, sicoob-bridge-reply

TalkX: talkx-scheduler, talkx-send

Voice: voice-agent, voice-changer, voice-copilot-action

Webhook/Diag: webhook-diagnostic, whatsapp-webhook

---

## 7. Verificações de kickoff (rodar no início de cada sessão)

```sql
-- Estado rápido do banco
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migrations,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS ultima,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public') AS tabelas,
  (SELECT count(*) FROM auth.users) AS auth_users,
  (SELECT count(*) FROM cron.job WHERE active) AS crons_ativos;
```

```sql
-- Últimas execuções dos crons (deve ser tudo 'succeeded')
SELECT j.jobname, d.status, d.start_time, d.return_message
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE d.start_time > now() - interval '2 hours'
ORDER BY d.start_time DESC LIMIT 20;
```

App Vercel: `curl -s -o /dev/null -w "%{http_code}" https://zapp-web-v2.vercel.app/` → esperado `200`.

Evolution GO: `curl -s -o /dev/null -w "%{http_code}" https://evolution-go-rxj2.srv1481814.hstgr.cloud/manager` → esperado `200`.

---

## 8. Deploy e CI

- **Frontend:** push em `main` → Vercel redeploya automaticamente via integração GitHub.
- **Edge functions:** `supabase functions deploy <nome>` requer PAT do owner do projeto Supabase (não commitado; Joaquim fornece quando necessário).
- **GitHub Actions:** workflow `chore(db): sincronizar artefatos com o banco [auto]` ativo. Budget de Actions liberado.
- **Migrations:** nunca editar migration histórica. Sempre criar arquivo novo com timestamp de 14 dígitos.
- **Branch protection:** `main` exige PR com 3 status checks. Usar `github_push_files(create_branch_from='main')` e depois `github_create_pull_request`.

---

## 9. Evolution GO na Hostinger

- Projeto Docker Manager: `evolution-go-rxj2`
- VPS: `srv1481814.hstgr.cloud` · `187.77.151.129` · virtualMachineId `1481814`
- Imagem atual: `evoapicloud/evolution-go:0.7.2` (pinada)
- API pública: `https://evolution-go-rxj2.srv1481814.hstgr.cloud`
- GLOBAL_API_KEY: no env do projeto (ler via `VPS_getProjectContentsV1`)
- Webhook configurado: `https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/evolution-webhook`
- Instância ativa: `c66e1968-fe9e-4686-8c31-ed64bf0d5de6` (conectada, entregando webhooks com status 200)
- Backup diário: `evogo_auth` + `evogo_users` em volume `pg_backups` (retenção 7 dias)

---

## 10. Segurança — estado atual

| Item | Status |
|---|---|
| RLS em todas as tabelas | ✅ 124/124 |
| Nenhuma tabela com RLS sem policy | ✅ verificado |
| TRUNCATE revogado de anon em `ai_providers` | ✅ migration 20260829120000 |
| `get_team_profiles` — filtra apenas `is_active=true` | ✅ fix 29/08 |
| `clear_login_attempts` — operador correto `->>`| ✅ fix 29/08 |
| Bundle produção — zero refs a infra antiga | ✅ auditado 30/08 |
| Porta 32822 da Evolution GO pública (`0.0.0.0`) | ⚠️ pendente — restringir ao Traefik |
| SSH VPS Hostinger — `PasswordAuthentication yes` | ⚠️ pendente hardening |

---

## 11. Histórico de decisões relevantes

| Data | Decisão |
|---|---|
| 2026-08-29 | `clientesClient.ts` deletado — zero consumidores; `externalClient.ts` é o client canônico do CRM externo |
| 2026-08-29 | `email_messages` sem política DELETE — intencional; cascade via `email_threads` DELETE |
| 2026-08-29 | Migrations lote junho/2026 (V3: `evolution_messages_wpp2`, `outbound_message_queue`, etc.) não aplicadas no V2 |
| 2026-08-29 | PR #62: paridade final banco=299, repo=299 |
| 2026-08-30 | Vercel projeto renomeado para `zapp_web_v2`; URL de produção permanece `zapp-web-v2.vercel.app` |

---

## 12. Pendências conhecidas

1. **Backup externo Evolution GO** — dumps diários só existem no volume local da VPS Hostinger. Mover para MinIO ou Supabase Storage.
2. **Porta 32822 exposta** — Evolution GO publica em `0.0.0.0`; restringir ao Traefik (remover `publish` no compose).
3. **SSH hardening VPS Hostinger** — `PasswordAuthentication yes` / `PermitRootLogin yes` ainda ativos.
4. **Domínio próprio** — hoje serve em `zapp-web-v2.vercel.app`; considerar domínio próprio no Cloudflare.
5. **Vault key `sicoob_service_role_key`** — nome enganoso (não é do Sicoob, é a service_role do próprio V2). Renomear + recriar cron em oportu-nidade.
