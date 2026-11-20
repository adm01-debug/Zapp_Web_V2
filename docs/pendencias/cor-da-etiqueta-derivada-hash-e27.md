# E27 — Cor da etiqueta derivada (hash)

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.6 Remoção de Etiquetas (100)

## Descrição e origem

Cor da etiqueta derivada (hash).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.6 Remoção de Etiquetas (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Cor por etiqueta
- **Existe hoje** (evidência da auditoria): Cor literal única #6366f1 (src/services/inbox.service.ts:11)
- **Falta**: Cor derivada/token
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Todas as etiquetas da mesma cor

## Dependências

Nenhuma registrada.

## Critério de aceite

- Cor por etiqueta
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).