# HANDOFF EXAUSTIVO — ZAPP WEB V2 — Sessão 4
**Gerado:** 2026-08-26 ~23:00 UTC  
**De:** Claude (sessão 3) **Para:** Claude (sessão 4)  
**Dono:** Joaquim / Promo Brindes  
**Fonte de verdade:** Este arquivo. Leia 100% antes de executar qualquer coisa.

---

## 0. KICKOFF DA SESSÃO NOVA — Faça isso primeiro

```
tool_search: code_exec, code_read_file, src_query, db_query (SUPABASE - ZAPP WEB V2 - MCP),
             cf_worker_deploy, cf_secret_list, github_put_file, github_push_files,
             github_create_branch, VPS_getVirtualMachinesV1, github_get_content
```

**Verificações obrigatórias antes de qualquer ação:**

```sh
# 1. Worker no ar?
curl https://supabase-zapp-web-v2-mcp.adm01.workers.dev/health
# Esperado: {"version":"1.1.1","tools":77,...}

# 2. Worker no GitHub bate com Cloudflare?
github_get_content(repo=adm01-debug/supabase-lovable-mcp, path=workers/zapp-web-v2/worker.js)
# Versão deve ser 1.1.1. Commit 2c0f58fd.

# 3. HANDOFF.md no GitHub está atualizado?
github_get_content(repo=adm01-debug/zapp-web-v2, path=docs/migration/HANDOFF.md)
# Deve mostrar "Sessão 4" no cabeçalho.

# 4. source-ddl/ existe no GitHub?
github_get_content(repo=adm01-debug/zapp-web-v2, path=docs/migration/source-ddl/)
# Deve ter 10 arquivos .sql. Commit 715cb11c.

# 5. Destino tem schema do app?
db_query: SELECT COUNT(*) FROM supabase_migrations.schema_migrations
# Esperado: 258.

# 6. Container tem os artefatos?
code_exec: ls /workspace/repos/supabase-lovable-mcp/workers/zapp-web-v2/worker.js \
           /workspace/tmp/pgcli/sql.js \
           /workspace/tmp/migration/source-fp.txt \
           /tmp/source-ddl-b64.json 2>&1 | head -10
```

---

## 1. CONTRATO DE TRABALHO

- **Execução end-to-end via MCP.** Nunca "copie e cole", nunca "você faz X e eu faço Y".
- **Dev sênior decide.** Só pergunta para: custo, mudança de arquitetura, dado destrutivo em produção, trade-off real de negócio.
- **Verdade acima de validação.** Nunca afirmar que testou o que não rodou. Se falhou, diz que falhou.
- **Zero churn.** Não refatorar, renomear, "melhorar" o que não foi pedido.
- **Sem hedging.** Direto ao ponto.
- **`APROVADO`** = executar exatamente o plano, sem reconfirmar.
- **Diagnóstico antes de patch.** Ler logs/estado real antes de qualquer fix.
- **Origem `vpkmqeumtxhrwgawxdrl` é SOMENTE LEITURA.** Apenas `src_query` (SELECT). Zero DDL/DML.
- **Nenhum segredo em repo, nota ou chat.**
- **Fechar toda tarefa de execução com bloco `Próximos passos` (exatamente 3, via MCP, menu não pergunta).**

---

## 2. IDENTIDADES E ENDEREÇOS

| Item | Valor |
|---|---|
| **ORIGEM (read-only)** | `https://vpkmqeumtxhrwgawxdrl.supabase.co` · acesso via `src_query` (role postgres) |
| **DESTINO** | `https://tnnnlkbymytvtqngbbqh.supabase.co` · ref `tnnnlkbymytvtqngbbqh` · us-west-2 · PG 17.6 |
| **Pooler destino** | `aws-0-us-west-2.pooler.supabase.com:5432` (session) · usado por `sql.js` |
| **Repo app** | `github.com/adm01-debug/zapp-web-v2` · branch `feat/fresh-install-hostinger` |
| **Repo worker MCP** | `github.com/adm01-debug/supabase-lovable-mcp` · path `workers/zapp-web-v2/worker.js` |
| **Worker MCP destino** | `supabase-zapp-web-v2-mcp` (Cloudflare) · **v1.1.1** · **77 tools** · commit `2c0f58fd` |
| **Worker auditoria (origem)** | `supabase-zapp-audit-mcp` · conector "MCP - SUPABASE / LOVABLE CLOUD - ZAPP WEB V2" |
| **VPS Hostinger** | KVM 4 · `srv1481814.hstgr.cloud` · `187.77.151.129` · Docker + Traefik v3.6 |
| **Evolution GO** | projeto `evolution-go-rxj2` · porta 4000 |
| **Container claude-code** | VPS AtomicaBR · workspace `/workspace` · sem python3 · shell dash · **git push QUEBRADO** → usar GitHub MCP |
| **Lab replay** | VPS Hostinger · container `zapp-replay` · `127.0.0.1:15432` |

---

## 3. CREDENCIAIS — ONDE ESTÃO (nunca copiar valores)

| Segredo | Localização |
|---|---|
| Destino (SUPABASE_URL, SUPABASE_REF, etc.) | `/root/.secrets/zapp-v2.env` no container claude-code |
| Token worker MCP | `/root/.secrets/zapp-v2-mcp-token` |
| SSH Hostinger | `/root/.ssh/hostinger_vps` |
| **ROTAÇÃO OBRIGATÓRIA (etapa 97)** | service_role, sb_secret_, senha Postgres, MCP_TOKEN, GLOBAL_API_KEY — vazaram no chat 1 |

---

## 4. ESTADO REAL (pós-sessão 4)

### GitHub — branch `feat/fresh-install-hostinger` — ATUALIZADO

| Arquivo | Status | Detalhe |
|---|---|---|
| `docs/migration/DECISIONS.md` | ✅ ATUALIZADO | D1–D7, sha f000594f |
| `docs/migration/PARITY-REPORT.md` | ✅ ATUALIZADO | Gate 2 assinado |
| `docs/migration/HANDOFF.md` | ✅ ATUALIZADO | **Esta versão (sessão 4)** |
| `docs/migration/PLANO.md` | ✅ OK | Sessão 2 |
| `docs/migration/source-ddl/` | ✅ CRIADO | 10 arquivos SQL, commit 715cb11c |

### Repo supabase-lovable-mcp — ATUALIZADO

| Arquivo | Status | Detalhe |
|---|---|---|
| `workers/zapp-web-v2/worker.js` | ✅ v1.1.1 | Commit 2c0f58fd |

### Destino `tnnnlkbymytvtqngbbqh`

| Item | Status |
|---|---|
| schema_migrations | ✅ 258 linhas |
| Schema public completo | ✅ + mcp_exec, mcp_exec_many |
| contacts + FKs | ✅ D1 executado |
| cron cleanup-link-preview-cache | ✅ D4 |
| storage 7 buckets + 23 policies | ✅ |
| realtime publication 11 tabelas | ✅ D5 |
| role settings | ✅ |
| auth config | ❌ P15 pendente |
| dados (~60 rows) | ❌ Gate 51 |
| edge functions | ❌ Fase 5 |

---

## 5. TAREFAS PENDENTES (por prioridade)

### Prioridade ALTA (documentação faltante)
```
P12 — Mapa deps infra antiga (funções com allrjhk/atomicabr/net.http_post)
P13 — Matriz edge function × tabela (CSV)
P14 — Inventário Evolution GO vs API v2
P15 — Inventário auth/storage não-SQL da origem
P16 — Planilha 28 secrets (grep Deno.env.get em functions)
P17 — Teste wildcard domain (dig zapp.srv1481814.hstgr.cloud)
```

### Prioridade MÉDIA (infraestrutura)
```
P11 — apply-batch.js (com NOTIFY pgrst)
P18 — Diff B export×replay + seção em DECISIONS.md
P19 — Fix step 36 em PLANO.md (remover purge-processed-webhook-events)
P21 — Concretizar backlog 99 em PLANO.md
P23–P26 — Replay 3 (validação post-hoc Gate 1)
P28 — Pré-checks formais destino
P29 — fp-dest.sql
P30 — Template Gate 3 em PARITY-REPORT.md
```

### Gates (perguntar ao Joaquim)
```
Gate 16 — SSH hardening VPS (PasswordAuthentication no)
Gate 51 — Migrar ~60 rows ou destino nasce limpo?
Gate 57 — Fornecer Supabase PAT
Gate 60 — LOVABLE_API_KEY: provider próprio?
Gate 68 — Remover clientesClient.ts?
Gate 79 — Budget GitHub Actions?
```

### Sequência longa (começar após gates)
```
Etapas 39,51–66 → Fase 4 (dados) + Fase 5 (functions)
Etapas 67–78    → Fase 6 (código app)
Etapas 79–90    → Fase 7 (VPS deploy)
Etapas 91–100   → Fase 8 (cutover)
```

---

## 6. DECISÕES REGISTRADAS (D1–D7)

| ID | Decisão | Status |
|---|---|---|
| D1 | Restaurar `contacts` + FKs + policies | ✅ EXECUTADO |
| D2 | Aplicar SOMENTE migrations Lovable (UUID) — excluir retro-datadas + junho | ✅ EXECUTADO |
| D3 | Manter `20260412230000_fix_rls_policies_security` | ✅ EXECUTADO |
| D4 | Recriar cron `cleanup-link-preview-cache` (`0 3 * * *`) | ✅ EXECUTADO |
| D5 | Realtime = 11 tabelas | ✅ EXECUTADO |
| D6 | Lab `zapp-replay` até Gate 2 | ✅ Gate 2 passado |
| D7 | Publication realtime é expansão funcional; subscribers confirmados só após step 61 | ✅ DOCUMENTADO |

---

## 7. PROCEDIMENTOS PRONTOS

### Push de arquivo único para GitHub
```
github_put_file(
  repo="adm01-debug/<repo>",
  path="docs/migration/arquivo.md",
  message="docs(migration): <descrição>",
  text="<conteúdo>",
  branch="feat/fresh-install-hostinger"
)
```

### Push de múltiplos arquivos (ATENÇÃO: `content_base64`, não `content`)
```
github_push_files(
  repo="adm01-debug/<repo>",
  branch="feat/fresh-install-hostinger",
  message="...",
  files=[{"path": "...", "content_base64": "<base64>"}]
)
```

### SQL no destino
```sh
# Via MCP:
db_query(sql="SELECT ...")

# Via sql.js:
code_exec: cd /workspace/tmp/pgcli && \
  set -a; . /root/.secrets/zapp-v2.env; set +a && \
  node sql.js -c "SELECT ..."
```

### SSH na VPS Hostinger
```sh
code_exec: ssh -i ~/.ssh/hostinger_vps -o BatchMode=yes root@187.77.151.129 '<comando>'
```

---

## 8. ARMADILHAS CONHECIDAS

| Risco | Mitigação |
|---|---|
| `github_push_files` com `content` ao invés de `content_base64` | Sempre usar `content_base64` |
| `code_exec` >100s → error 524 | Sempre `nohup … &` + poll |
| git push do container quebrado | Nunca usar git push → sempre GitHub MCP |
| PostgREST cache de schema | `NOTIFY pgrst,'reload schema'` após DDL |
| Portainer da AtomicaBR ≠ Hostinger | Hostinger só via ssh ou Hostinger MCP |
| `allrjhk` hardcoded em `notify_sicoob_on_reply` | Steps 34 + 64 corrigem |
| Lovable injeta `vpkm…` no build | Step 67 remove dependência |

---

## 9. RESUMO EXECUTIVO

**Pronto:** Schema 100% migrado e validado. Zero divergências inexplicadas. Gates 0, 1, 2 passados. Worker v1.1.1 no Cloudflare e GitHub. source-ddl/ no GitHub.

**O que falta para o app funcionar:**
1. Gates 51+57+60 (dados, PAT, LOVABLE_API_KEY) — Joaquim decide
2. Fase 5 (62 edge functions) — deploy
3. Fase 6 (código: client.ts, Dockerfile, nginx) — refactor mínimo
4. Fase 7 (VPS: Docker Manager, Traefik, LE) — deploy
5. Gate 90 (go-live) — checklist

**Estimativa:** 6-8 sessões de 2-3h, com os gates respondidos.
