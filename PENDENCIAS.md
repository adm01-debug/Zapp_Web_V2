# PENDENCIAS.md — Workflows com falha não corrigível sem ação do Joaquim

_Atualizado em 2026-11-01 23:15 UTC por sessão `claude_04/gifted-ride-xq3mj4`._

---

## 1. DB Live Guard — diagnosticar artefato de evidência

**Workflow:** `db-live-guard.yml`  
**Run:** [41318522203](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41318522203)  
**Commit:** `532aa09b`  
**Hora:** 2026-11-01 ~15:29 UTC  

**O que falhou:** 7 de 7 passos do contrato vivo falharam simultaneamente. Os logs reais estão no artefato `db-live-evidence-41318522203-1`.

**O que o Joaquim precisa fazer:**
1. Abrir o artefato: https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41318522203/artifacts/13089517610
2. Baixar e inspecionar `step-migrations.log` para verificar se há drift de migration.
3. Verificar `step-types.log` para saber se `types.ts` está desatualizado.
4. Se for problema de conectividade (todos os logs mostram timeout ou "connection refused"), verificar validade do secret `DESTINO_URL` em Settings → Secrets → Actions.

**Atenção:** run `41356605138` estava `pending` na HEAD `1252bb5a` (iniciado 22:20 UTC). Se passou verde, o problema foi transitório; se falhou, os logs do novo artefato devem ser inspecionados.

**Por que agente não resolve:** os logs de falha estão em artefatos ZIP (não acessíveis via MCP). Sem ler o conteúdo de `step-migrations.log` ou `step-catalog.log` não é possível saber o que exatamente divergiu.

---

## 2. DB Migrate — item resolvido (orphan entries sendo reconciliadas via PRs)

**Contexto:** o run [41307726882](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41307726882) falhou com "9 versões faltando para target `20261030135126`". Diagnóstico posterior revelou que o target já estava no ledger — a falha real era drift de paridade (3 entradas no ledger sem arquivo local correspondente).

**Correção em andamento (agente, sem ação do Joaquim necessária):**
- PR #2525 (`claude_04/gifted-ride-xq3mj4`) — reconcilia `20261031170000` e `20261101213000` (auto_merge ativo)
- PR #2533 (`claude/chore-reconcile-ledger-drift-261101-2249`) — reconcilia `20261030145126` (auto_merge ativo)

Após merge das duas PRs, o próximo run do `db-live-guard` deve passar no passo "Paridade tripla". Nenhuma ação do Joaquim necessária para este item.

---

## 3. PRs em CI — aguardando merge automático (23:15 UTC 2026-11-01)

Todas com auto_merge (SQUASH) ativo; mergearão sozinhas quando os 6 required checks passarem:

| PR | Branch | O que corrige | Status CI |
|---|---|---|---|
| **#2513** | `claude/fix-email-navy-contrast-261101-2057` | Contraste WCAG AA (accessibility.css) | db-guard queued; ci.yml iniciando |
| **#2508** | `claude/fix-deploy-functions-types-node-011101` | @types/node em deploy-functions.yml | db-guard queued; ci.yml iniciando |
| **#2525** | `claude_04/gifted-ride-xq3mj4` | Reconciliação migrations 20261031170000 + 20261101213000 | db-guard queued; ci.yml iniciando |
| **#2533** | `claude/chore-reconcile-ledger-drift-261101-2249` | Reconciliação migration 20261030145126 | CI a verificar |

Se alguma PR falhar no CI, a sessão `claude_04/gifted-ride-xq3mj4` monitorará e corrigirá.

---

_Nada neste arquivo requer decisão de arquitetura ou custo — apenas acesso a artefatos (item 1) e aprovação de deploy em produção._
