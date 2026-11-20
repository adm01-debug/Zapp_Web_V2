# X079 — Tabela nas colunas do mock

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 01 · **Seção**: 3.8 Talk X — Fase 7 · Visão geral (X077–X082: 0 concluídos)

## Descrição e origem

Tabela nas colunas do mock.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.8 Talk X — Fase 7 · Visão geral (X077–X082: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: TalkXTable com miniatura, chips
- **Existe hoje** (evidência da auditoria): Tabela atual
- **Falta**: Colunas do mock
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Cosmético

## Dependências

X078

## Critério de aceite

- TalkXTable com miniatura, chips
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).