# E20 — Remover 'PRINCIPAL' fixo dos fluxos

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.7 Multi-conexão Evolution GO (50)

## Descrição e origem

Remover 'PRINCIPAL' fixo dos fluxos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.7 Multi-conexão Evolution GO (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: —
- **Existe hoje** (evidência da auditoria): Fallbacks pelo nome padrão ainda existem (evolution-send.ts:66-68)
- **Falta**: Limpeza após E16/E18/E23
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

E16

## Critério de aceite

- —
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).