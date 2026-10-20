# Talk X · Campanhas

Módulo de envio de campanhas WhatsApp em massa, com segmentação, templates, supressão e analytics.

## Documentação

| Arquivo | Conteúdo |
|---|---|
| **[PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md](./PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md)** | **Plano vigente** — 200 etapas (X001–X200), com etapas por fase em `v4/etapas/`, inventário em `v4/inventario/` e decisões em `v4/DECISOES.md` |
| [PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md](./PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md) | **Substituído pelo V4** — 100 etapas (V01–V100), histórico |
| **[AUDITORIA_PLANO_TALKX_2026-09-29.md](./AUDITORIA_PLANO_TALKX_2026-09-29.md)** | Auditoria exaustiva etapa a etapa (E01–E100 × código × banco × CI): bugs P0/P1, drifts, docs falsas |
| [PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md](./PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md) | Critério de aceite (DoD, gates, contrato de evidência) — continua valendo |
| [PLANO_IMPLEMENTACAO_TALKX_100.md](./PLANO_IMPLEMENTACAO_TALKX_100.md) | Plano original E01–E100 (08/09) — **histórico**, substituído pelo V3 |
| [ARQUITETURA.md](./ARQUITETURA.md) | Diagrama de componentes, máquina de estados, métrica→fonte (com correções pendentes — ver banner) |
| [CHANGELOG_TALKX.md](./CHANGELOG_TALKX.md) | Histórico por fase/etapa |
| [PARIDADE.md](./PARIDADE.md) | Checklist de paridade — **desatualizado**, será regenerado por evidência (V96) |

## Estado real (auditoria de 2026-09-29, base `main` `a0002bb`)

- **6/100 etapas completas** (E01–E03, E05–E07) · **74 parciais** · **20 ausentes**.
- **0 das 17 telas** completas; **3 sem componente** (13 Pausada, 14 Relatório, 15 Importação/CRM).
- **9 bugs confirmados em produção** (1 P0: view `talkx_campaign_metrics` sem `security_invoker`; 7 P1; 8 P2) e
  **2 drifts** de banco sem migration — detalhados na auditoria.
- Backend do motor (leases, claim, `outcome_unknown`, ACK, respostas, links, cron) existe e é a parte mais sólida;
  as 4 RPCs de agregação (E86/E89) **não têm consumidor** no front.
- Gates locais: `tsc` 0 · `eslint` 0 · `vitest` 89/89. CI da `main`: `E2E logado` ❌ (`talkx.spec.ts:160`) e
  `DB Live Guard` ❌.
- A afirmação anterior deste README ("Fases 1–7 implementadas e mergeadas", `talkx-v1.0.0`) **não corresponde ao
  código** — a mensagem da própria tag diz "F0 + F1".

## Próximas fases

Seguir o plano V4 na ordem numérica (X001 em diante), uma etapa = uma PR. A **Fase 0 (X001–X005)** institui a
régua e a governança; as correções imediatas vêm na **Fase 1 (X006–X009)**.
