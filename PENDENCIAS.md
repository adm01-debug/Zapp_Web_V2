# Pendências CI — Itens que dependem de ação do Joaquim

**Data:** 2026-10-26  
**Branch:** `claude_04/nice-cori-7snz6b`

---

## P1 — `db-live-guard`: secret `DESTINO_URL` (workflow não pode rodar sem ele)

**Workflow:** `.github/workflows/db-live-guard.yml`  
**Bloqueio:** secret de repo `DESTINO_URL` (connection string do banco de produção `tnnnlkbymytvtqngbbqh`).

O workflow só pode ser verificado por ti porque:
1. O secret não é visível por API (só o nome aparece, nunca o valor).
2. Não existe outro caminho seguro para validar o contrato ao vivo sem a connection string real.

**O que fazer:**  
Após este PR mergear e o `types-sync` rodar, o `db-live-guard` diário (06:13 UTC) ou um `workflow_dispatch` manual deverá passar. Se continuar falhando, verificar no dashboard do GitHub (Settings → Secrets → Actions) se `DESTINO_URL` está definido e válido.

**Impacto se não resolvido:** o `db-live-guard` continua falhando diariamente; não bloqueia merge de PRs (não é required check), mas gera ruído de issue diária.

---

## P2 — `deploy-functions.yml`: aprovação em `producao-edge-functions` após merge

**Workflow:** `.github/workflows/deploy-functions.yml`  
**Bloqueio:** o job pausa em `Waiting` no environment `producao-edge-functions` até aprovação manual.

**O que fazer:**  
Após este PR mergear, se houver edge functions a redeploy (este PR não altera edge functions — sem ação necessária agora).

---

## P3 — `types-sync` após merge: dispatch manual se não disparar automaticamente

**Workflow:** `.github/workflows/types-sync.yml`  
**Contexto:** o `types-sync` roda por agendamento (segunda 05:49 UTC) ou por `workflow_dispatch`. Após este PR mergear, ele deverá rodar no próximo ciclo e gerar PR de sincronização de `types.ts`/`schema-catalog.json`/`schema-manifest.json`.

**O que fazer:**  
Se até terça-feira nenhum PR de sincronização aparecer, disparar manualmente:  
Actions → "Sync Supabase Types" → Run workflow → branch `main`.

---

*Última atualização: 2026-10-26. Criado por sessão `session_01P12Q8mnhJbxDoQh5dUYAgj`.*
