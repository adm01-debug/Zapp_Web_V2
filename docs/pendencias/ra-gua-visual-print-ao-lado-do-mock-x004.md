# X004 — Régua visual (print ao lado do mock)

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.1 Talk X — Fase 0 · Régua e governança (X001–X005: 2 concluídos, 3 pendentes)

## Descrição e origem

Régua visual (print ao lado do mock).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.1 Talk X — Fase 0 · Régua e governança (X001–X005: 2 concluídos, 3 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Captura 1672×941 por tela em toda PR
- **Existe hoje** (evidência da auditoria): e2e/talkx-visual.spec.ts + .github/workflows/e2e-talkx.yml; pula as 16 fixtures vazias
- **Falta**: Cobertura 17/17
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem prova visual de fidelidade fora da tela 01

## Dependências

X003

## Critério de aceite

- Captura 1672×941 por tela em toda PR
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).