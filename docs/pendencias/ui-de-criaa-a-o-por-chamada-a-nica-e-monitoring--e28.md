# E28 — UI de criação por chamada única e monitoring por instância

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.7 Multi-conexão Evolution GO (50)

## Descrição e origem

UI de criação por chamada única e monitoring por instância.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.7 Multi-conexão Evolution GO (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: QR, polling, badge
- **Existe hoje** (evidência da auditoria): create-connection existe; falta badge/estado sem credencial e prova com 2 instâncias
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

E13

## Critério de aceite

- QR, polling, badge
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).