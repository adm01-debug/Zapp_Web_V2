# 🚀 Guia de Deploy - ZAPP-WEB

Este documento descreve o processo de deploy e configuração do ZAPP-WEB.

## 📋 Índice

- [Ambientes](#ambientes)
- [Pré-requisitos](#pré-requisitos)
- [Deploy Automático (Vercel)](#deploy-automático-vercel)
- [Deploy Manual](#deploy-manual)
- [Configuração do Supabase](#configuração-do-supabase)
- [Edge Functions](#edge-functions)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Domínio Customizado](#domínio-customizado)
- [Rollback](#rollback)
- [Monitoramento](#monitoramento)

---

## Ambientes

| Ambiente | URL | Branch |
|----------|-----|--------|
| **Produção (canônica)** | https://zapp-web-v2.vercel.app | `main` |
| **Preview** | Gerada automaticamente pela Vercel por PR | qualquer branch |
| **Local** | http://localhost:5173 | qualquer |

> **Não há ambiente de staging separado.** Testes de integração usam banco local
> (ver seção 0 do CLAUDE.md). Preview Vercel cobre validação visual de PR.

---

## Pré-requisitos

### Ferramentas
- Node.js 20+ (use `.nvmrc`: `nvm use`)
- Bun 1.0+
- Supabase CLI
- Git

### Acessos necessários
- GitHub (repo privado)
- Supabase Dashboard
- Vercel Dashboard
- Evolution API (WhatsApp)

---

## Deploy Automático (Vercel)

O deploy do **frontend** é automático via Vercel (projeto `zapp_web_v2`, team `juca1`):

1. **Merge de PR na `main`** → Rebuild automático (push direto na `main` é proibido)
2. **Assets** → CDN global

> **Edge Functions sobem automaticamente** no push na `main` (filtrado por pasta — ver [Edge Functions](#edge-functions)). O front (Vercel) também é automático.

### Tempo médio de deploy
- Build Vercel: ~2–3 minutos
- Propagação CDN: ~1 minuto

---

## Deploy Manual

Para casos especiais onde o deploy automático não é suficiente:

### 1. Build local

```bash
# Instalar dependências
bun install

# Build de produção
bun run build

# Preview local
bun run preview
```

### 2. Deploy de Edge Functions (automático no push + manual para rollback)

Desde 07/10/2026 (decisão do Joaquim) o push na `main` que toca `supabase/functions/**`
ou `supabase/config.toml` dispara `deploy-functions.yml` sozinho — só a função cujo bundle
divergiu do publicado é republicada. O `workflow_dispatch` manual segue para rollback
(`source_ref`), uma função só (`function_name`), dry-run e rotação de secrets.

```
Push na main (edge alterada) → deploy-functions.yml dispara sozinho
GitHub Actions → deploy-functions.yml → Run workflow (só para rollback/uma função)
```

> **Não use `supabase functions deploy` direto em produção** — bypassa o gate do CI obrigatório e a comparação de digest local × remoto.
> As edge functions publicadas precisam bater com o repo (ver cabeçalho do `deploy-functions.yml`).

### 3. Aplicar migrations

Migrations em produção seguem o fluxo obrigatório (ver CLAUDE.md seção 1, regra 6):

```
arquivo em supabase/migrations/ → PR → merge em main → deploy do código →
db-migrate.yml (apply=false, dry-run) → aprovação em producao-ddl → apply=true
```

> `supabase db push` direto em produção está proibido — bypassa o dry-run e o gate.

---

## Configuração do Supabase

### Projeto Principal
- **ID**: `tnnnlkbymytvtqngbbqh`
- **URL**: https://tnnnlkbymytvtqngbbqh.supabase.co
- **Dashboard**: https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh

### Banco de Dados Externo (CRM)
- **ID**: `pgxfvjmuubtbowutlide`
- **Uso**: RPCs de inteligência e enriquecimento de contatos

### Configurações Obrigatórias

#### 1. Auth
- Email/password habilitado
- MFA (TOTP) habilitado
- Redirect URLs configurados

#### 2. RLS
- Todas as tabelas com RLS habilitado
- 181+ policies configuradas

#### 3. Realtime
- 16 tabelas com Realtime ativo
- Broadcast habilitado

#### 4. Storage
- Buckets: `avatars`, `media`, `documents`
- Policies de acesso configuradas

---

## Edge Functions

### Deploy (automático no push; manual só para rollback)

O push na `main` com alteração em edge dispara o deploy sozinho (filtrado por pasta).
O dispatch manual (`workflow_dispatch`) serve para rollback, função única, dry-run e
rotação de secrets. Nenhum agente dispara esse workflow de forma autônoma fora do push.

```
Push na main (edge alterada) → deploy automático
GitHub → Actions → deploy-functions.yml → Run workflow (só rollback/uma função)
```

### Lista de funções

| Função | Descrição | Secrets |
|--------|-----------|---------|
| `evolution-api` | Proxy WhatsApp (Evolution GO) | `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_TOKEN` |
| `evolution-webhook` | Webhook WhatsApp | `EVOLUTION_API_KEY` |
| `ai-suggest-reply` | IA sugestão | `OPENAI_API_KEY` |
| `ai-conversation-summary` | IA resumo | `OPENAI_API_KEY` |
| `elevenlabs-tts` | Text-to-speech | `ELEVENLABS_API_KEY` |
| `send-email` | Envio email | `RESEND_API_KEY` |
| `gmail-oauth` | OAuth Gmail | `GMAIL_CLIENT_*` |

### Configurar secrets

```bash
# Via CLI (development/staging)
supabase secrets set EVOLUTION_API_KEY=xxx --project-ref tnnnlkbymytvtqngbbqh

# Listar secrets
supabase secrets list --project-ref tnnnlkbymytvtqngbbqh
```

---

## Variáveis de Ambiente

### Frontend (Vite)

```env
# .env.local
VITE_SUPABASE_URL=https://tnnnlkbymytvtqngbbqh.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# Externo — manter false ate banco + Edge passarem os smokes do runbook
VITE_CRM_INTEGRATION_ENABLED=false

# As credenciais do CRM externo nao pertencem ao Vercel/frontend. Configure
# EXTERNAL_SUPABASE_URL e EXTERNAL_SUPABASE_SERVICE_ROLE_KEY somente nos Edge
# Secrets do projeto Supabase canonico. O gateway CRM recusa anon key.

# Sentry
VITE_SENTRY_DSN=xxx
```

### Edge Functions (Supabase Secrets)

```bash
# WhatsApp (Evolution GO — Hostinger srv1481814)
EVOLUTION_API_URL=https://evolution-go-rxj2.srv1481814.hstgr.cloud
EVOLUTION_API_KEY=xxx
EVOLUTION_INSTANCE_TOKEN=xxx

# Catálogo de produtos (usadas apenas pela edge promogifts-catalog — NÃO expostas ao front)
PROMOGIFTS_SUPABASE_URL=https://doufsxqlfjyuvxuezpln.supabase.co
PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY=xxx

# CRM empresas/contatos (somente edge crm-integration)
EXTERNAL_SUPABASE_URL=https://pgxfvjmuubtbowutlide.supabase.co
EXTERNAL_SUPABASE_SERVICE_ROLE_KEY=xxx

# IA
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx

# Email
RESEND_API_KEY=re_xxx

# Áudio
ELEVENLABS_API_KEY=xxx

# Gmail
GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=xxx
```

---

## Domínio Customizado

### Via Vercel
1. Dashboard do team `juca1` > projeto `zapp_web_v2` > Settings > Domains
2. Adicionar domínio customizado
3. Configurar DNS (CNAME ou A record)
4. Aguardar propagação e SSL

### DNS Records
```
CNAME: app.seudominio.com.br → cname.vercel-dns.com
```

---

## Rollback

### Via Vercel (front)
1. Dashboard do team `juca1` → projeto `zapp_web_v2` → Deployments
2. Selecionar o último deploy de produção saudável
3. Menu `⋯` → **Instant Rollback**

### Via Git (revert)
```bash
# Reverter para commit anterior: revert + PR (o merge dispara o rebuild Vercel)
git revert HEAD
git push origin <sua-branch>    # abra o PR e mergeie pelo fluxo normal (6 checks)

# Para voltar a um commit específico, reverta aquele commit (nunca reescreva a main)
git revert <commit-sha>
```

> ❌ **Não use `git reset --hard` + `git push --force` na `main`.** Reescreve histórico de
> produção, apaga trabalho de outros agentes e quebra os PRs abertos. Rollback de
> emergência = **Instant Rollback da Vercel** (seção acima), que não toca no git.

### Migration Rollback
Não há rollback automático. Crie uma nova migration de reversão seguindo o fluxo normal
(arquivo → PR → merge → `db-migrate.yml`). O ledger de migrations é append-only.

---

## Monitoramento

### Logs do Supabase
- Edge Functions: Dashboard > Edge Functions > Logs
- Database: Dashboard > Database > Query Performance
- Auth: Dashboard > Auth > Logs

### Sentry
- Erros de frontend
- Performance monitoring
- Release tracking

### Uptime
- Edge Functions: Supabase Dashboard → Edge Functions → Logs
- Frontend: Vercel Dashboard → Analytics

### Alertas
- Configurar alertas no Supabase Dashboard
- Integrar com Slack/Discord se necessário

---

## Checklist de Deploy

### Antes do merge (PR)
- [ ] `bun run typecheck` sem erros
- [ ] `bun run lint` sem erros
- [ ] `bun test` passando
- [ ] `bun run build` sem erros
- [ ] `node scripts/db-audit/supabase-usage-guard.mjs` → `novas: 0`
- [ ] Migrations em `supabase/migrations/` registradas no ledger

### Pós-merge (produção)
- [ ] Vercel rebuild concluído (automático)
- [ ] Se há migration nova: `db-migrate.yml` (dry-run → aprovar → apply)
- [ ] Se há edge function nova/alterada: `deploy-functions.yml` dispara sozinho no push (só confirmar o run verde)
- [ ] Se houve migration: `types-sync.yml` disparado (ou aguardar auto-dispatch W33)
- [ ] Verificar logs após deploy
- [ ] Testar fluxos críticos em produção

---

## Troubleshooting

### Build falha
```bash
# Limpar cache
rm -rf node_modules .vite dist
bun install
bun run build
```

### Edge Function não funciona
1. Verificar logs no Dashboard
2. Verificar secrets configurados
3. Testar localmente: `supabase functions serve`

### Migration falha
1. Verificar SQL syntax no arquivo local
2. Verificar dependências entre migrations (ordem de versions)
3. Testar no banco local (ver CLAUDE.md seção 0) antes de propor PR

---

## Contatos

- **DevOps**: ti@promobrindes.com.br
- **Emergências**: ti@promobrindes.com.br

---

*Última atualização: 2026-10-15*
