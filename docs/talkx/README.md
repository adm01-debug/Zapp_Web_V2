# Talk X · Campanhas

Módulo de envio de campanhas WhatsApp em massa, com segmentação, templates, supressão e analytics.

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [PLANO_IMPLEMENTACAO_TALKX_100.md](./PLANO_IMPLEMENTACAO_TALKX_100.md) | Plano completo — 100 etapas × 10 sub-etapas |
| [ARQUITETURA.md](./ARQUITETURA.md) | Diagrama de componentes, máquina de estados, métrica→fonte |
| [CHANGELOG_TALKX.md](./CHANGELOG_TALKX.md) | Histórico por fase/etapa |

## Estado Atual (2026-09-22)

- **Fase 0 (E01–E10):** ✅ Concluída e mergeada em `main`
- **Fases 1–7 (E11–E85):** ✅ Implementadas e mergeadas — design system, telas de visão geral/segmentos/templates,
  supressão, wizard, ciclo de vida da campanha. Detalhamento em `PARIDADE.md` e `PLANO_IMPLEMENTACAO_TALKX_100.md`
  (não registrado neste changelog)
- **Fase 8 (E86–E93):** ✅ Backend/observabilidade — RPCs de agregação, entregues/lidas via webhook, respostas
  reais, benchmarks, links rastreáveis, resiliência de envio, insights heurísticos, `talkx_settings`
- **Fase 9 (E94–E97):** parcial — importação CSV de contatos (E94) e badge CRM 360 (E95, apenas o badge) entregues;
  auditoria de estados/modais (E97) concluída; ajuda do Talk X (E96) e o restante do E95/E98–E100 seguem em aberto

Ver `CHANGELOG_TALKX.md` para o detalhamento das Fases 8–9.

## Próximas Fases

- **E96:** Ajuda do Talk X
- **E98–E100:** acessibilidade/performance, testes E2E e release — ver plano completo
