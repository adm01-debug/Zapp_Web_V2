# Auditoria de Referências de Banco de Dados — 2026-08-28

**Banco oficial:** `https://tnnnlkbymytvtqngbbqh.supabase.co` (Supabase Cloud, PG 17.6)
**Escopo:** repositório completo (código-fonte, migrations, exports SQL, docs, CI/workflows, secrets) **+ banco oficial vivo** (funções, views, defaults de coluna, cron jobs, vault)
**Contexto:** o projeto passou por ~3 bancos anteriores; objetivo = nenhuma referência funcional a banco antigo.

## Método

- `grep` por refs de projeto (`[a-z0-9]{20}\.supabase\.co`) e refs soltos (sem domínio) em todo o repo.
- Decodificação de **todos** os JWTs embutidos (`eyJ…` → claims `ref`/`role`/`exp`).
- Connection strings (`postgres://`, `postgresql://`, `pooler.supabase.com`, `db.<ref>`), chaves `sb-*-auth-token`, hosts legados (`atomicabr`, `rqmb…`).
- Inspeção de `supabase/config.toml`, `.env.*`, `index.html`, `public/version.json`, workflows do GitHub Actions e nomes dos secrets do repositório.
- No banco oficial vivo (via MCP, somente leitura): varredura de `pg_proc`, `pg_views`, `information_schema.columns` e `cron.job` por refs antigos.

## Projetos identificados

| Ref / host | Papel | Situação |
|---|---|---|
| `tnnnlkbymytvtqngbbqh` | **Banco oficial** (Supabase Cloud) | ✅ alvo de todo o runtime |
| `pgxfvjmuubtbowutlide` | CRM externo "Gestão de Clientes" — integração **intencional** via `src/integrations/supabase/externalClient.ts` | ✅ mantido (não é banco antigo do ZAPP) |
| `vpkmqeumtxhrwgawxdrl` | Banco antigo #1 — Lovable Cloud interno (origem da migração de 2026-08) | menções só em docs de migração/auditoria e comentários de alerta — intencionais |
| `allrjhkpuscmgbsnmjlv` | Banco antigo #2 — Supabase Cloud legado | **corrigido nesta auditoria** (3 migrations + 4 blocos de export) |
| `supabase.atomicabr.com.br` | Banco antigo #3 — Supabase self-hosted | menções só em docs históricos e `supabase/migrations/_foreign/` (já isolado do `db push`) |
| `rqmbchomazwsaupnuduf` | Banco antigo #4 — preconnect órfão no `index.html` | já removido antes desta auditoria (PLANO etapa 68) |

## Runtime verificado — já apontava 100% para o oficial (nenhuma alteração necessária)

| Item | Estado |
|---|---|
| `src/integrations/supabase/client.ts` | URL + anon key **fixos** no oficial; ignora `VITE_SUPABASE_URL` de propósito (Lovable injetava o banco interno `vpkm…`) ✅ |
| JWTs no repo (todos decodificados) | apenas **2** tokens distintos: anon `tnnnlkbymytvtqngbbqh` e anon `pgxfvjmuubtbowutlide` (CRM externo). Nenhuma `service_role`, nenhuma chave de banco antigo ✅ |
| `supabase/config.toml` | `project_id = "tnnnlkbymytvtqngbbqh"` ✅ |
| `.env.example` / `.env.production` | oficial + CRM externo, corretos ✅ |
| `index.html` (preconnect) e `public/version.json` | oficial ✅ |
| Edge functions (`supabase/functions/**`) | **zero** URL de banco hardcoded — tudo via env/secrets ✅ |
| Docs operacionais (DEPLOYMENT, INCIDENT-RUNBOOK, TROUBLESHOOTING, BACKUP, LGPD, RLS_MIGRATION, runbooks) | todas as refs = oficial ✅ |
| Connection strings / chaves `sb-*` | nenhuma hardcoded para banco antigo ✅ |

## Banco oficial vivo — verificado em 2026-08-28 (somente leitura)

- Única função com URL `supabase.co` no corpo: `public.notify_sicoob_on_reply` → **URL oficial** via `net.http_post` (estado da migration `20260827150000`) ✅
- `pg_proc`, `pg_views`, defaults de coluna: **0** ocorrências de `allrjhk…`, `vpkm…`, `rqmb…`, `atomicabr` ✅
- `cron.job`: 1 job (`cleanup-link-preview-cache`), sem URLs ✅
- Vault: secret `sicoob_service_role_key` existe (criado 2026-08-27) → a bridge Sicoob está **ativa** e postando na URL oficial ✅

## Correções aplicadas nesta auditoria

| Arquivo | Problema | Correção |
|---|---|---|
| `supabase/migrations/20260319210215_….sql` | fallback `https://allrjhk….supabase.co` no corpo de `notify_sicoob_on_reply` | URL → oficial + nota de auditoria no header |
| `supabase/migrations/20260319210228_….sql` | idem (URL fixa) | idem |
| `supabase/migrations/20260827130100_fix_sicoob_channel_type_c02.sql` | idem (URL default) | idem |
| `supabase-export/BLOCO_01_schema_completo.sql` | mesma URL antiga dentro da função exportada | URL → oficial |
| `supabase-export/BLOCO_04_functions.sql` | idem | URL → oficial |
| `supabase-export/BLOCO_10_functions.sql` | idem | URL → oficial |
| `supabase-export/BLOCO_15_triggers.sql` | idem | URL → oficial |
| `.github/workflows/supabase-sync.yml` | **risco alto**: qualquer push/PR tocando `supabase-export/**` aplicava automaticamente o snapshot legado no banco de `DESTINO_URL` | gatilhos `push`/`pull_request` removidos → somente `workflow_dispatch` (manual) |
| `supabase-export/README.md` | snapshot legado sem aviso | banner "LEGADO — não aplicar sem regerar" |
| `docs/HANDOFF_EVOLUTION_SECURITY_2026-04-12.md` | apresentava `allrjhk…` como "Supabase ZAPP" | banner de documento histórico |
| `HANDOFF_MISSION_10-10.md` | apresentava self-hosted `atomicabr` como "instância principal" | banner de documento histórico |

Notas de segurança das correções:

- Editar o **conteúdo** de migrations já aplicadas é seguro aqui: o Supabase CLI e o guard `scripts/db-audit/check-migration-drift.mjs` comparam apenas o **conjunto de versões** (`schema_migrations.version`), nunca o conteúdo. Em replay num ambiente novo, a cadeia agora nunca passa por estado apontando para banco antigo; o estado final continua sendo o de `20260827150000` (inalterada).
- O header histórico de `20260827140000_fix_sicoob_bridge_url_official_db.sql` continua nomeando o banco antigo — é o registro do incidente, mantido de propósito.
- O secret `DESTINO_URL` **não existe** hoje no repositório (verificado via API), então o workflow de sync não alcançava banco algum — a neutralização é preventiva para quando o secret for criado.

## Menções a bancos antigos MANTIDAS de propósito (histórico/alerta)

- `docs/migration/*` (PLANO, HANDOFF, DECISIONS, PARITY-REPORT) e `docs/audits/*` — registro da migração origem→destino; os refs antigos são o assunto do documento.
- Header de `supabase/migrations/20260827140000_…` — explica a correção da URL.
- Comentários em `src/integrations/supabase/client.ts` e `src/hooks/auth/useAuthForm.ts` — alertas para nunca voltar ao banco do Lovable (`vpkm…`).
- `supabase/migrations/_foreign/` — migrations do self-hosted, já fora do glob do `db push`, com README explicando.
- Handoffs históricos — agora com banner de obsolescência (correção acima).

## Recomendações (fora do escopo deste PR)

1. **Secrets do GitHub Actions**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` não são lidos por código nenhum (o `client.ts` é fixo no oficial por decisão documentada). Conferir os valores ou removê-los para eliminar ambiguidade. `VITE_CLIENTES_*` seguem em uso pelo `externalClient.ts`.
2. **Regerar `supabase-export/`** a partir do banco oficial (ou executar o gate 22 do DECISIONS.md, que prevê descartar a pasta). Só depois disso reavaliar os gatilhos do workflow de sync.
3. **`public/version.json`** aponta `evolution.atomicabr.com.br` enquanto `.env.*` usam `evolution-go-rxj2.srv1481814.hstgr.cloud` — não é banco de dados (Evolution API), mas é inconsistência do mesmo tipo; alinhar quando conveniente.
4. Manter esta auditoria como referência: qualquer novo grep de `allrjhkpuscmgbsnmjlv|vpkmqeumtxhrwgawxdrl|rqmbchomazwsaupnuduf|atomicabr` deve casar **apenas** com os arquivos da seção "mantidas de propósito".
