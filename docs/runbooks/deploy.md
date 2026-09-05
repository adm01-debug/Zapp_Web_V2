# Runbook de Deploy e Operações

> Atualizado em 2026-09-03. O fluxo Lovable descrito na versão anterior foi
> descontinuado — o deploy é **GitHub-first**: commit na `main` → CI → Vercel
> (front) + GitHub Actions (edges). Se algo aqui divergir da infra real,
> corrija este arquivo no mesmo commit do fix.

---

## 1. Deploy

### 1.1 Frontend (Vercel)

O deploy é automático: todo merge na `main` dispara build e deploy de produção
na Vercel (projeto `zapp_web_v2`, team `juca1`).

- **Produção**: `https://zapp-web-v2.vercel.app`
- **Preview**: cada PR ganha URL própria (`zappwebv2-<hash>-juca1.vercel.app`; alias de
  branch `zappwebv2-git-<branch>-juca1.vercel.app`). O CORS das edges aceita esse padrão
  (`_shared/validation.ts`, `ORIGIN_PATTERNS`).
- Nenhum passo manual. O merge só é possível com os 3 checks obrigatórios
  verdes (Lint & TypeCheck, Unit Tests, Build) + conversas resolvidas.

### 1.2 Rollback do frontend (< 2 min)

1. Vercel Dashboard → projeto `zapp_web_v2` → **Deployments**
2. Localizar o último deployment de produção saudável (`isRollbackCandidate`)
3. Menu `⋯` → **Instant Rollback** (ou **Promote to Production**)
4. Confirmar — o alias de produção volta na hora, sem rebuild

### 1.3 Edge Functions (Supabase)

Deploy **manual** via workflow `deploy-functions.yml` (GitHub Actions → **Run workflow**, `workflow_dispatch`) — **não** é automático em push; só executa a partir de `refs/heads/main`. O manifest
`supabase/deployment-manifest.json` trava o conteúdo (sha256 por function):

- Mudou edge function → rodar `node scripts/edge-deploy/generate-manifest.mjs`
  e commitar o manifest junto, senão o CI falha em
  "Verify Edge deployment manifest freshness"
- Smoke test remoto: `node scripts/edge-deploy/smoke-functions.mjs`
- Teste manual de uma function:

```bash
curl -X POST https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/<function-name> \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

### 1.4 Migrations de banco

Procedimento completo no `CLAUDE.md` (seção 1) e `docs/MIGRATIONS.md`. Resumo:
DDL via MCP `db_query` + INSERT manual em
`supabase_migrations.schema_migrations` + arquivo em `supabase/migrations/` +
`schema-catalog.json`/`schema-manifest.json` atualizados. Validação:
`node scripts/db-audit/check-migration-drift.mjs` e workflow **DB Live Guard**.

**Rollback de migration**: não há DOWN scripts — rollback é DDL manual de
emergência via `db_query` (ex.: `DROP INDEX IF EXISTS ...`), seguido de
migration retroativa registrando a reversão, para manter a paridade
arquivos↔ledger.

### 1.5 Checklist pré-merge

- [ ] `bun run test:coverage` verde (2.5k+ testes, piso de cobertura em src/lib + src/services)
- [ ] `node scripts/ci/typecheck-ratchet.mjs` sem dívida nova
- [ ] `node scripts/ci/lint-ratchet.mjs` sem dívida nova
- [ ] Mexeu em edge → manifest regenerado (1.3)
- [ ] Mexeu em DDL → paridade validada (1.4)
- [ ] Secrets novos configurados (Vercel env / Supabase Edge Secrets)

---

## 2. Monitoramento

### 2.1 Web Vitals
Coletados via `src/lib/web-vitals.ts`: **LCP** < 2.5s · **INP** < 200ms · **CLS** < 0.1

### 2.2 Erros de produção (client)
Erros de runtime do front viram linhas em `audit_logs` com
`action = 'client_error'` (via `src/lib/errorReporter.ts` → RPC
`log_audit_event`; leitura admin-only). Consulta rápida:

```sql
SELECT created_at, details->>'message' AS msg, details->>'path' AS path,
       details->>'source' AS source, details->>'buildId' AS build
FROM audit_logs WHERE action = 'client_error'
ORDER BY created_at DESC LIMIT 50;
```

### 2.3 Logs de Edge Functions
Supabase Dashboard → Edge Functions → Logs. Marcadores úteis:
`[WEBHOOK_AUTH_SHADOW]` (gate de autenticação de webhook) e o `rid` de
correlação do Logger estruturado.

### 2.4 Banco de Dados
- Audit/erros: `audit_logs` · Logins: `login_attempts`
- Saúde WhatsApp: `connection_health_logs` + edge `connection-health-check`

### 2.5 Evolution GO (WhatsApp)
- URL pública (via Traefik): `https://evolution-go-rxj2.srv1481814.hstgr.cloud`
- VPS Hostinger `srv1481814` com firewall `zapp-evolution-go-rxj2`
  (id 355246 — accept TCP 22/80/443, resto drop). A porta 32783 NÃO é
  acessível de fora por design; todo tráfego passa pelo 443.
- Gestão: MCP `HOSTINGER` (containers do projeto `evolution-go-rxj2`)

---

## 3. Resposta a Incidentes

### 3.1 App não carrega
1. Vercel Dashboard → Deployments: último deploy de produção está READY?
2. Se o deploy quebrou: rollback (1.2)
3. `https://tnnnlkbymytvtqngbbqh.supabase.co/rest/v1/` responde? (status do Supabase)
4. Checar `audit_logs` action `client_error` (2.2) para erro de JS em massa

### 3.2 WhatsApp desconectado
1. `SELECT * FROM whatsapp_connections` — status da conexão
2. Invocar edge `connection-health-check` (retorna healthy/erro por instância)
3. Reconectar via painel de Conexões no app (QR)
4. Evolution GO fora? Hostinger → projeto `evolution-go-rxj2` → container
   `evolution-go-rxj2-api-1` (restart via painel/MCP se `Exited`)
5. Webhooks chegando? `SELECT max(created_at) FROM messages WHERE sender='contact'`

### 3.3 Erros de autenticação
1. `login_attempts` para bloqueios (`get_own_lockout_status`)
2. Email confirmado? MFA pendente?
3. RLS policies da tabela `profiles`
4. Logs de Auth no Supabase Dashboard

### 3.4 Template de Post-Mortem
```markdown
## Incidente: [Descrição]
## Data: YYYY-MM-DD HH:mm
## Duração: X horas
## Impacto: [Usuários afetados]
## Timeline:
- HH:mm - Incidente detectado
- HH:mm - Investigação iniciada
- HH:mm - Root cause identificado
- HH:mm - Fix aplicado
- HH:mm - Serviço restaurado
## Root Cause: [Causa raiz]
## Ações Corretivas:
- [ ] Ação 1
- [ ] Ação 2
```

---

## 4. Contatos e Escalação
- **Vercel**: dashboard do team `juca1` (status: vercel-status.com)
- **Supabase Cloud**: dashboard do projeto `tnnnlkbymytvtqngbbqh` (status.supabase.com)
- **Hostinger (Evolution GO)**: hPanel VPS `srv1481814` / MCP `HOSTINGER`
- **Evolution GO**: fork `evoapicloud/evolution-go` (docs da Evolution API)
