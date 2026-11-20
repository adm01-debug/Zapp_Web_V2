# X168 — Exportar PDF/CSV

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.13 Talk X — Fase 12 · Relatório (X161–X169: 0 concluídos)

## Descrição e origem

Exportar PDF/CSV.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.13 Talk X — Fase 12 · Relatório (X161–X169: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Sem window.print, com trilha
- **Existe hoje** (evidência da auditoria): Só e-mail via talkx-report (TalkXCampaignRunning.tsx:831)
- **Falta**: Export
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

X163

## Critério de aceite

- Sem window.print, com trilha
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).