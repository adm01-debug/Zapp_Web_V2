# PENDENCIAS.md — Workflows com falha não corrigível sem ação do Joaquim

_Atualizado em 2026-11-01 por sessão `claude_04/gifted-ride-xq3mj4`._

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

**Atenção:** run `41356605138` está `pending` na HEAD atual `1252bb5a` (iniciado 22:20 UTC). Se este run passar verde, o problema foi transitório. Se falhar, os logs do novo artefato devem ser inspecionados.

**Por que agente não resolve:** os logs de falha estão em artefatos ZIP (não acessíveis via MCP). Sem ler o conteúdo de `step-migrations.log` ou `step-catalog.log` não é possível saber o que exatamente divergiu.

---

## 2. DB Migrate — 9 migrations faltando para target

**Workflow:** `db-migrate.yml`  
**Run:** [41307726882](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41307726882)  
**Commit:** `1252bb5a` (HEAD atual da main)  

**O que falhou:** o workflow foi disparado com `target=20261030135126`. Esse version não está registrado no ledger, e há 9 versões intermediárias não aplicadas entre o último version registrado e o target solicitado.

**O que o Joaquim precisa fazer:**
1. Acessar o run: https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41307726882
2. Ver quais são as 9 versões listadas como faltando.
3. Decidir se quer: (a) aplicar essas migrations agora via `workflow_dispatch` com `apply=false` (dry-run) + aprovação no environment `producao-ddl`; ou (b) cancelar o target e criar um dispatch com o version correto.
4. **Nunca** aplicar DDL sem antes fazer o dry-run (`apply=false`) e confirmar o hash SHA-256.

**Por que agente não resolve:** o DB Migrate envolve DDL em produção — requer aprovação humana no environment `producao-ddl`. Agente não tem permissão para aprovar deploys em produção.

---

## 3. PRs em CI (monitoramento)

As seguintes PRs estavam com CI rodando às 22:00 UTC de 2026-11-01. Se o CI falhar por motivo diferente do esperado, será necessária investigação adicional:

- **PR #2513** — `claude/fix-email-navy-contrast-261101-2057`: corrige contraste WCAG AA em `accessibility.css`. Se CI falhar → verificar se houve regressão no build ou nos testes unitários.
- **PR #2508** — `claude/fix-deploy-functions-types-node-011101`: adiciona `npm install @types/node` em `deploy-functions.yml`. Se CI falhar → verificar se versão do `@types/node` mudou ou se o step de deno check ainda falha.

---

_Nada neste arquivo requer decisão de arquitetura ou custo — apenas acesso a artefatos e aprovação de deploy em produção._
