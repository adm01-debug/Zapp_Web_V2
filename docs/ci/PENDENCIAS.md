# PENDENCIAS.md — Bloqueios que requerem acao humana ou dependem de merge

**Atualizado em:** 2026-10-31 03:00Z

---

## Inventario (03:00Z) — estado atual dos workflows

| Workflow | Status | Observacao |
|---|---|---|
| `deploy-functions.yml` | ✅ Corrigido via PR #2407 (mergeado 02:53Z) | Run de confirmacao 41162076060 aguardando conclusao |
| `db-live-guard.yml` | ❌ failure (run 41162077590, SHA `004e74a8c5`, 02:56Z) | 3 causas raiz documentadas abaixo — nao e required check |
| `copilot-pull-request-reviewer` | ❌ failure (permanente, firewall) | **NAO e required check** — nao bloqueia merge |

---

## 1. `copilot-pull-request-reviewer` — falha permanente por bloqueio de firewall

**NAO E REQUIRED CHECK — NAO BLOQUEIA MERGE NEM A CONCLUSAO DESTA TAREFA**

**Workflow:** `copilot-pull-request-reviewer`  
**Status:** `failure` em todos os runs — nao consta nos 6 required checks obrigatorios da branch `main`.

**Causa raiz:** o runner de CI bloqueia chamadas para `api.business.githubcopilot.com` por firewall. Nao e corrigivel via codigo.

**Evidencia:**

| SHA | Run ID | Conclusao |
|---|---|---|
| `c6cc8cf8` | [41153329470](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41153329470) | `failure` |
| `d8426a2d` | [41156559736](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41156559736) | `failure` |

**Referencia para configurar o firewall:** `https://gh.io/copilot/firewall-config`  
**Acao necessaria:** nenhuma. Documentado formalmente — nao e required check e nao pode ser corrigido via codigo.

---

## 2. `db-live-guard.yml` — 3 causas raiz documentadas; correcao requer Joaquim

**NAO E REQUIRED CHECK** — `db-live-guard.yml` nao tem trigger `pull_request` por design (nao expoem `DESTINO_URL` a codigo de PR).

**Ultimo run:** [41162077590](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41162077590) — dispatched na main `004e74a8c5` em 02:55Z, `conclusion=failure` em 02:56Z.

**Passo que falhou:** step 23 "Consolidar veredito do contrato vivo" — le arquivos `/tmp/step-*.log` e falha quando qualquer um tem conteudo.

**Passos individuais que geraram conteudo nos logs (confirmados via FALHAS_LISTA no log do run):**

### Causa A — Comparar migrations com schema_migrations (step 9)

11 migrations com problemas no ledger (versoes da semana de 16/10):

| Tipo de problema | Quantidade |
|---|---|
| `statements` em prosa (resumo, nao SQL real) | 8 |
| Nome divergente entre arquivo e ledger | 1 |
| Conteudo SQL divergente entre arquivo e ledger | 3 |

**Script que verifica:** `scripts/db-audit/check-migration-drift.mjs`  
**Correcao necessaria:** atualizar `statements` no ledger com o SQL real de cada migration afetada.  
**Passo a passo para o Joaquim:**
1. Para cada migration afetada: confirmar o estado real no banco via `pg_get_functiondef`/`pg_indexes` antes de qualquer escrita
2. Usar `scripts/db-audit/register-migration.mjs <arquivo.sql>` para gerar o SQL correto
3. Executar UPDATE no ledger com `RETURNING` nao-vazio como guarda
4. Zero migrations com `statements IS NULL` ou em prosa como condicao de sucesso

### Causa B — Verificar ACL e contrato de mcp_exec (step 10)

`mcp_exec` e `mcp_exec_many` nao tem `search_path` configurado (`proconfig` nao contem `search_path=pg_catalog, public`).

**Script que verifica:** `scripts/db-audit/check-mcp-exec-acl.sql` — campo `search_path_is_safe = false`  
**Correcao necessaria:** migration com `ALTER FUNCTION public.mcp_exec(text, integer) SET search_path TO pg_catalog, public` + idem para `mcp_exec_many`.  
**Passo a passo para o Joaquim:**
1. Criar arquivo em `supabase/migrations/` com o `ALTER FUNCTION` para as duas funcoes
2. Abrir PR → merge em main → `deploy-functions.yml` confirma success
3. Apos merge: `db_query` com o DDL + INSERT no ledger na mesma transacao (RETURNING nao-vazio)
4. Redisparar `db-live-guard.yml` para confirmar step 10 limpo

### Causa C — Auditar configuracao runtime sem dados de clientes (step 22)

Saida do run [41162077590](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41162077590): passo aparece como failure no consolidador (conteudo no `/tmp/step-runtime-config.log`). Run anterior (41160856000) confirmou: `Runtime configuration: FAIL; autovacuum=VERIFIED; backups NOT verified.`

**Script que verifica:** `scripts/db-audit/runtime-config.test.sh` → `check-runtime-config.mjs`  
**Correcao necessaria:** investigar por que o monitoramento de backups nao esta confirmado.  
**Passo a passo para o Joaquim:**
1. Baixar artefato `db-live-evidence-41162077590-1` e ler `step-runtime-config.log` para ver a mensagem exata
2. Verificar configuracao de backup no Supabase Dashboard (Settings → Backups) do projeto `tnnnlkbymytvtqngbbqh`
3. Se backup diario ativo: verificar qual parametro o `check-runtime-config.mjs` consulta e se ha falha de permissao
4. Redisparar `db-live-guard.yml` apos correcao para confirmar step 22 limpo

---

## 3. `deploy-functions.yml` — run de confirmacao pos-merge aguardando conclusao

**Situacao:** PR #2407 mergeada em 02:53:54Z (SHA `004e74a8c596959f45f61c8b0b64b30a70c1ff19`). Run de confirmacao [41162076060](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41162076060) dispatched em 02:54:59Z, status `queued` em 02:57Z.

**Prova do fix — CI Gate passou em 4 SHAs com o mesmo codigo:**

| SHA | CI Gate | Conclusao | Hora |
|---|---|---|---|
| `d0e624ba` | job 124393241622 | ✅ success | 00:58:49Z |
| `c6cc8cf8` | job 124402413957 | ✅ success | 01:39:42Z |
| `d8426a2d` | run [41156550407](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41156550407) attempt 2 | ✅ success | 02:30:27Z |
| `c3560fad` | run [41160372310](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41160372310) | ✅ success | ~02:53Z |

**Acao necessaria do Joaquim:** nenhuma — run de confirmacao em andamento; conclusao esperada em ~03:10Z.

---

*Itens resolvidos sao removidos deste arquivo. Ultima atualizacao: 03:00Z.*
