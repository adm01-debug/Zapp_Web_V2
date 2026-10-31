# Plano de Coordenação — Sessões ZAPP WEB V2
**Gerado em:** 2026-10-31 02:40 UTC  
**Sessão coordenadora:** ZAPP WEB V2 - BRANCHS CORREÇÕES (`session_014nTibVLQcoWAuwGA72Dxmv`)

---

## 🔴 ALERTA CRÍTICO: Colisão detectada

**`deploy-functions.yml` sendo corrigido em paralelo por 2 sessões:**

| Sessão | PR | Branch | Fix |
|--------|-----|--------|-----|
| GH ACTIONS REQUIRED | #2409 | `claude/fix-deploy-frozen-oct31` | `deno install --frozen=false + @types/node` |
| GH ACTIONS FAILURE | #2407 | (branch própria) | mesmo workflow |

**Ação imediata:** GH ACTIONS FAILURE deve verificar se PR #2409 já cobre o fix dela.
Se sim → fechar o PR duplicado e redirecionar energia para `db-live-guard.yml`.
Se não → coordenar para que as correções não se sobreponham.

---

## Mapa de responsabilidades (acordado neste plano)

| Sessão | Responsabilidade exclusiva | Não tocar |
|--------|---------------------------|-----------|
| **BRANCHS CORREÇÕES** | `analise/dossies/`, `analise/progresso.json`, PR #2396 | Supabase, workflows |
| **SUPABASE-02** | Auditoria Supabase — seções estruturais (schema, funções, índices, políticas RLS) | Branches, workflows |
| **SUPABASE-03** | Auditoria Supabase — seções operacionais (cron, edge functions, types diff, advisors) | Branches, workflows |
| **GH ACTIONS REQUIRED** | Corrigir required checks da `main` (CI gate obrigatório) | Supabase, branches |
| **GH ACTIONS FAILURE** | Corrigir workflows não-required com falha na `main` (`db-live-guard`, etc.) + confirmar sobreposição com GH-REQUIRED | Supabase, branches |
| **PRS ABERTAS-03** | Gerenciar fila de merge: rebases, CI gate, auto-merge de PRs em aberto | Não criar novos PRs |

---

## Divisão Supabase (evitar duplicidade entre SUPABASE-02 e SUPABASE-03)

**SUPABASE-02** cobre (seções estruturais):
- S02: Tabelas e colunas
- S03: Índices e performance
- S04: Políticas RLS
- S05: Funções e procedures
- S06: Views e materialized views

**SUPABASE-03** cobre (seções operacionais):
- S01: Estrutura base (enums, sequences, triggers) — JÁ EM ANDAMENTO
- S07: Cron jobs e pg_net
- S08: Edge functions (lista e estado)
- S09: Types diff (types.ts vs banco)
- S10: Advisors e alertas
- S11: Storage e buckets
- S12: Auth e usuários

Se alguma seção já foi coberta pela outra sessão, registrar em `auditoria-supabase/progresso.json` e pular.

---

## Estado atual (02:40 UTC, 31/10)

### BRANCHS CORREÇÕES (esta sessão)
- ✅ 18/176 branches analisadas (todas SUPERADA)
- ⏳ PR #2396 aguardando CI (docs-only, SHA `91d8da32a`)
- 🔜 Próximo: analisar lote 3 (branches Cat D — PRs abertos)

### SUPABASE-03
- ✅ 39 achados registrados (10 ALTO, 13 MÉDIO, 13 INFO)
- ⚠️ Push pendente para `claude/dreamy-bardeen-m4odyv`
- 🔜 Fazer push imediatamente; depois seções S07-S12

### GH ACTIONS REQUIRED
- ✅ PR #2409 aberto (`deno install --frozen=false`)
- ⏳ CI rodando (run 41160241806, desde 02:31Z)
- 🔜 Wakeup 02:55Z → verificar merge

### SUPABASE-02
- ✅ Auditoria completa (12 seções, 15 propostas SQL, commit `b4a615e`)
- ⚠️ Push pendente para `claude/festive-faraday-kv669k`
- 🔜 Fazer push imediatamente

### GH ACTIONS FAILURE
- ✅ PR #2407 em CI (deploy-functions.yml)
- ⏳ `db-live-guard.yml` redisparado (run 41160856000)
- 🔜 Verificar colisão com PR #2409; se duplicado → fechar #2407

### PRS ABERTAS-03
- ✅ CI gate em andamento para batch de PRs
- ⏳ Wakeup 03:08Z
- 🔜 Continuar fila de merge; notificar quando `main` avançar muito

---

## Protocolo de comunicação entre sessões

1. **Antes de abrir PR:** enviar mensagem para PRS ABERTAS-03 (`session_014nTibSHzggW5SPQNJ2z38L`) informando branch e arquivos tocados.
2. **Antes de aplicar migration SQL:** verificar `supabase/migrations/` via `SELECT max(version)` — usar `reserve_migration_version()` para reservar slot atômico.
3. **Conflito de arquivos:** se duas sessões editam o mesmo arquivo, a que chegar depois faz `git pull --rebase` antes de pushear.
4. **Atualizar este arquivo** quando o estado mudar: editar `analise/PLANO_COORDENACAO.md` e fazer commit.

---

## Prioridades por urgência

1. **🔴 P1 — Colisão deploy-functions.yml:** GH ACTIONS FAILURE verificar e fechar PR duplicado
2. **🔴 P1 — Push pendente:** SUPABASE-02 e SUPABASE-03 fazer push imediatamente (risco de perda de trabalho)
3. **🟡 P2 — CI da main verde:** GH ACTIONS REQUIRED e FAILURE resolver deploy + db-live-guard
4. **🟡 P2 — Fila de PRs:** PRS ABERTAS-03 continuar merges
5. **🟢 P3 — Branch analysis:** BRANCHS CORREÇÕES continuar lotes 3-6 (158 branches restantes)
6. **🟢 P3 — Supabase audit completo:** SUPABASE-02/03 completar seções faltantes

---

## O que cada sessão deve fazer AO RECEBER ESTE PLANO

- **SUPABASE-02:** `git push -u origin claude/festive-faraday-kv669k` imediatamente
- **SUPABASE-03:** `git push -u origin claude/dreamy-bardeen-m4odyv` imediatamente; depois seções S07-S12
- **GH ACTIONS REQUIRED:** aguardar CI do PR #2409; se verde → auto-merge
- **GH ACTIONS FAILURE:** verificar se PR #2407 duplica PR #2409; se sim → fechar #2407; focar em `db-live-guard.yml`
- **PRS ABERTAS-03:** continuar fila; avisar quando mergear PR que toque `supabase/` ou `src/`
- **BRANCHS CORREÇÕES:** continuar análise de branches (lote 3)
