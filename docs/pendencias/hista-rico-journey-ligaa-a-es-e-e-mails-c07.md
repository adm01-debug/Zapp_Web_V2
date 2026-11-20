# C-07 — Histórico (Journey): ligações e e-mails

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 5. Achados fora dos planos (varredura de código)

## Descrição e origem

Histórico (Journey): ligações e e-mails.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (5. Achados fora dos planos (varredura de código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: PLANO_JOURNEY_HISTORICO S019–S029 (área 06)
- **Existe hoje** (evidência da auditoria): useJourneyCalls.ts, useJourneyEmails.ts, JourneyStatsHero.tsx, lib/journey/{model,stats,periodRange}.ts só usados por testes; aba usa useConversationHistoryTimeline (src/components/inbox/tabs/JourneyTab.tsx:84)
- **Falta**: ligar as fontes
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Histórico do cliente sem ligações e e-mails

## Dependências

Nenhuma registrada.

## Critério de aceite

- PLANO_JOURNEY_HISTORICO S019–S029 (área 06)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).