# 🛡️ ZAPP-WEB — Política de Retenção de Dados (LGPD)

**Versão:** 1.0  
**Data:** 2026-04-11  
**Autor:** Claude AI — Compliance Agent  

> Este documento descreve as políticas de retenção de dados pessoais armazenados pelo sistema ZAPP-WEB, em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).

---

## Dados cobertos (geral)

Ver versão completa no histórico do repositório.

---

## Copiloto RADAR (CV-019) — adicionado em 2026-10-16

| Dado | Tabela | Prazo |
|---|---|---|
| Insights gerados pelo RADAR | `copilot_insights` | 90 dias |
| Texto final enviado pelo vendedor | `copilot_feedback.final_text` | 30 dias |
| Hash do texto final | `copilot_feedback.final_text_hash` | indefinido |
| Contagens agregadas anônimas | `copilot_retention_aggregates` | indefinido |
| Metadados de sessão (etapa, B·R·I·N·D·E, temperatura) | `copilot_sessions` | enquanto ativa |

**Mecanismo:** função `public.run_copilot_retention()` + `pg_cron` diário às 3h UTC.  
**Prazo D5** é decisão aberta — ver `docs/adr/CV-009-decisoes-D1-D5.md`.
