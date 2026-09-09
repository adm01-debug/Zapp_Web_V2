# Talk X · Campanhas

Módulo de envio de campanhas WhatsApp em massa, com segmentação, templates, supressão e analytics.

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [PLANO_IMPLEMENTACAO_TALKX_100.md](./PLANO_IMPLEMENTACAO_TALKX_100.md) | Plano completo — 100 etapas × 10 sub-etapas |
| [ARQUITETURA.md](./ARQUITETURA.md) | Diagrama de componentes, máquina de estados, métrica→fonte |
| [CHANGELOG_TALKX.md](./CHANGELOG_TALKX.md) | Histórico por fase/etapa |

## Estado Atual (2026-09-08)

- **Fase 0 (E01–E10):** ✅ Concluída e mergeada em `main`
  - tsc = 0 erros, lint-ratchet = 0 novas ocorrências
  - 5 legados removidos, Math.random eliminado
  - Cron `talkx-scheduler-1min` ativo no Supabase Cloud
  - Graphify: 12.097 nodes

## Próximas Fases

- **Fase 1 (E11–E20):** Design system — tiles gradiente, KpiCard, header "Campanhas", tabs com ícone
- **Fase 2 (E21–E30):** Visão geral completa (tela 01)
- ...ver plano completo
