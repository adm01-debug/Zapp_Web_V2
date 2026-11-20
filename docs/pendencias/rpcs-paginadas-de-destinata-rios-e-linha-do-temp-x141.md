# X141 — RPCs paginadas de destinatários e linha do tempo

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.12 Talk X — Fase 11 · Acompanhar campanha (X140–X160: 0 concluídos)

## Descrição e origem

RPCs paginadas de destinatários e linha do tempo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.12 Talk X — Fase 11 · Acompanhar campanha (X140–X160: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Cursor no servidor
- **Existe hoje** (evidência da auditoria): Leituras diretas com teto: TalkXCampaignRunning.tsx:198,276,381,626, TalkXLiveMonitor.tsx:70 (limit 200/100/50/2000)
- **Falta**: RPCs
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Campanha grande mostra lista truncada

## Dependências

Nenhuma registrada.

## Critério de aceite

- Cursor no servidor
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).