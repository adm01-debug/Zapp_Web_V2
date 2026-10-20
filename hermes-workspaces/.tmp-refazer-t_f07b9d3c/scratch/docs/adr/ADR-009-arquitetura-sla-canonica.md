# ADR-009 — Arquitetura do SLA canônico (fonte única de verdade)

- **Status:** Accepted
- **Data:** 2026-10-13
- **Contexto original (V3):** ADR-006 da V3 (`arquitetura-sla-canonica`),
  adaptado à realidade da V2.

## Contexto

O SLA tinha duas leituras possíveis na plataforma: a **regra** (quanto tempo é
"no prazo") e a **medição** (o que aconteceu em cada conversa). Se cada tela
escolher sua fonte, dois painéis mostram números diferentes para o mesmo dia —
e o gestor deixa de confiar nos dois.

Na V2 existem hoje três tabelas públicas relacionadas:

| Tabela | Papel | Criada em |
| --- | --- | --- |
| `sla_configurations` | política global: `first_response_minutes`, `resolution_minutes`, `priority`, `is_default`, `is_active` | `supabase/migrations/20251215173646_87479af1-3381-4264-af26-592da3439efd.sql:2-12` |
| `conversation_sla` | **medição por conversa**: `first_message_at`, `first_response_at`, `resolved_at`, `first_response_breached`, `resolution_breached` | idem, `:29-40` |
| `sla_rules` | regras por contato/empresa/cargo/tipo/fila/atendente, com `priority` | `supabase/migrations/20260408183046_cbc3a11b-8793-47fd-9629-b7f09d388399.sql:2-19` |

## Decisão

1. **`conversation_sla` é a fonte canônica de medição.** Todo número de SLA
   exibido sai dela, não de recomputações locais a partir de `messages`.
2. **`sla_configurations` define o limite** (minutos) e a política padrão;
   **`sla_rules` escolhe a política aplicável** por contato/empresa/fila/atendente,
   com fallback para a configuração global
   (`src/hooks/sla/useApplicableSLA.ts:102` e `:112-114`).
3. **Toda tela lê a mesma base.** O painel do dashboard e o painel de filas
   consomem o mesmo hook `useSLAMetrics`
   (`src/components/dashboard/SLAMetricsDashboard.tsx:38`,
   `src/components/queues/SLADashboard.tsx`), que lê `conversation_sla`
   (`src/hooks/sla/useSLAMetrics.ts:92`) via `fetchAllRows` (`:89`).
4. **O denominador é "conversas avaliadas".** Conversa sem desfecho
   (`first_response_at` nulo e `first_response_breached` falso) fica **fora** do
   numerador e do denominador (`src/hooks/sla/slaFirstResponse.ts:27-31`,
   `tallyFirstResponse` em `:45-61`).
5. **Sem amostra, a taxa é 0 — nunca 100** (R2-SLA-001,
   `src/hooks/sla/slaFirstResponse.ts:93` e o comentário em
   `src/hooks/sla/useSLAMetrics.ts:24-25`). O hook também expõe
   `overall.hasSample` (`useSLAMetrics.ts:120`).

## Estado na V2

Já vale pelo código atual: as três tabelas existem, o hook é compartilhado e a
taxa sem amostra é 0. O que **não** está resolvido é a exibição: a tela ainda
converte ausência de dado em 100% pelo fallback `?? 100` — tratado no ADR-010.

## Consequências

- Positivo: uma única régua; o painel de filas e o do dashboard não divergem.
- Positivo: conversa ainda sem resposta não infla nem derruba a taxa; ela é
  `pending` e aparece separada.
- Negativo/risco aceito: qualquer tela nova que leia `messages` direto para
  "calcular SLA" reintroduz a divergência. A regra é ler `conversation_sla`.
- Custo: as leituras passam por paginação (`fetchAllRows`) — teto de leitura
  registrado em `src/hooks/sla/useSLAMetrics.ts:105`.

## Referências

- `docs/HEALTH_SCORE.md` (a nota de saúde **não** mede SLA — não confundir).
- ADR-010 — Dashboard de SLA sem dados mostra "Sem dados".
- `src/hooks/sla/slaFirstResponse.ts`, `src/hooks/sla/useSLAMetrics.ts`,
  `src/hooks/sla/useSLAHistory.ts`, `src/hooks/sla/useApplicableSLA.ts`.
