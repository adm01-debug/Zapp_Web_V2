# X002 — Placar automático do V4

- **Estado**: DIVERGENTE
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.1 Talk X — Fase 0 · Régua e governança (X001–X005: 2 concluídos, 3 pendentes)

## Descrição e origem

Placar automático do V4.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.1 Talk X — Fase 0 · Régua e governança (X001–X005: 2 concluídos, 3 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: Placar de etapas e elementos que acompanha as entregas
- **Existe hoje** (evidência da auditoria): scripts/talkx/v4-status.mjs:6-22 só conta DONE_VERIFIED de P046.json (03/10); docs/talkx/v4/STATUS.md diz 2/200 e 217/1.135
- **Falta**: Reauditar P046 ou mudar a fonte; hoje nada entregue depois de 03/10 conta
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

O dono vê progresso travado e subestimado; ninguém sabe o que de fato andou

## Dependências

reauditoria

## Critério de aceite

- Placar de etapas e elementos que acompanha as entregas
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).