# X085 — Variantes em conjunto, arquivar, guarda, importação

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.9 Talk X — Fase 8 · Templates (X083–X098: 0 concluídos)

## Descrição e origem

Variantes em conjunto, arquivar, guarda, importação.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.9 Talk X — Fase 8 · Templates (X083–X098: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Lote transacional
- **Existe hoje** (evidência da auditoria): Variantes legadas
- **Falta**: RPCs
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Template em uso pode ser apagado

## Dependências

X084

## Critério de aceite

- Lote transacional
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).