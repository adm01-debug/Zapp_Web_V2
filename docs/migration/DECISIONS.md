# DECISIONS — ZAPP WEB V2 Migration

## Decisões D1–D8
Ver histórico de commits. Resumo: D1 contacts+FKs, D2 migrations UUID-only, D3 RLS hardening, D4 cron, D5 realtime 11 tabelas, D6 lab até Gate 2, D7 publication expansão funcional, D8 wildcard domain confirmado.

---

## D9 — Diff B: source × destino (P18)

**Data:** 2026-08-27 · Sessão 4  
**Ferramenta:** `diffd.js` (source-fp.txt vs dest-fp.txt)  
**Resultado:** ✅ **Zero divergências inexplicadas.**

### Tabela de divergências

| Categoria | Só origem | Só destino | Divergentes | Explicação |
|---|---|---|---|---|
| COLS | 0 | 1 (`contacts`) | 0 | D1 — restauração correta |
| CONS | 0 | 1 (`contacts`) | 34 | D1 — 34 FKs inbound para contacts |
| IDX | 0 | 1 (`contacts`) | 0 | D1 |
| POL | 0 | 3 | 10 | D3 — hardening RLS (políticas extras adicionadas) |
| TRG | 0 | 1 (`contacts`) | 0 | D1 |
| VIEW | 0 | 0 | 0 | ✅ Limpo |
| ENUM | 0 | 0 | 0 | ✅ Limpo |
| EXT | 0 | 0 | 1 (`pg_net`) | Versão minor gerida pelo Supabase Cloud (Gate 2) |
| CRON | 0 | 0 | 0 | ✅ D4 executado — cron no destino idêntico ao origem |
| PUB | 3 | 8 extras | 0 | D5/D7 — expansão intencional de realtime |
| FN | 0 | 2 extras (`mcp_exec`, `mcp_exec_many`) | 0 | Helpers do worker MCP (step 35, não são código de app) |

### Comparativo Gate 2 vs Gate 3

| Diff | Fonte | Estado |
|---|---|---|
| Diff A (source×replay) | source-fp × replay-fp | Gate 2 ✅ (sessão 2) — base para validação inicial |
| Diff B (source×dest) | source-fp × dest-fp | Gate 3 pre-check ✅ (esta análise) |

### Conclusão

O destino `tnnnlkbymytvtqngbbqh` está **limpo**: todas as diferenças em relação à origem são rastreáveis a uma decisão documentada (D1–D7). Nenhuma divergência inesperada.  
As funções `get_own_gmail_accounts()` e `log_audit_event()` que estavam "só na origem" no Diff A (replay) **estão presentes no destino** — foram criadas por migrations do Lovable. O replay era um subset das migrations.

**Gate 3 pré-aprovado a nível de schema.** Dados e edge functions são os próximos bloqueantes (etapas 39, 51–66).

---

## D10 — Plano de 30 etapas (pendentes)

| ID | Decisão | Status |
|----|---------|--------|
| D7 | Publication realtime = expansão funcional; subscribers confirmados após step 61 | ✅ |
| D8 | Wildcard `*.srv1481814.hstgr.cloud` confirmado | ✅ |
| D9 | Diff B source×dest — zero divergências inexplicadas | ✅ |

## Gates seguintes (pendentes do Joaquim)

```
Gate 16  — SSH hardening VPS (PasswordAuthentication no)
Gate 51  — Migrar ~60 rows ou destino nasce limpo?
Gate 57  — PAT Supabase destino
Gate 60  — LOVABLE_API_KEY: provider próprio?
Gate 68  — Remover clientesClient.ts?
Gate 79  — Budget GitHub Actions?
Gate pré-62 — Ativar licença Evolution GO (aguardando serviço deles voltar)
```
