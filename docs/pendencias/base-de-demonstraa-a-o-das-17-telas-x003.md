# X003 — Base de demonstração das 17 telas

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.1 Talk X — Fase 0 · Régua e governança (X001–X005: 2 concluídos, 3 pendentes)

## Descrição e origem

Base de demonstração das 17 telas.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.1 Talk X — Fase 0 · Régua e governança (X001–X005: 2 concluídos, 3 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Fixture determinística por tela
- **Existe hoje** (evidência da auditoria): e2e/fixtures/talkx-demo/01-campanhas-visao-geral.json (31 KB); 02–17 são {} (3 bytes)
- **Falta**: Popular 16 fixtures
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Só a tela 01 pode ser comparada com o desenho

## Dependências

telas faltantes

## Critério de aceite

- Fixture determinística por tela
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).