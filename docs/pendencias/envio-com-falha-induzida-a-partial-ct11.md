# CT-11 — Envio com falha induzida → partial

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

Envio com falha induzida → partial.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Linha partial no log
- **Existe hoje** (evidência da auditoria): Lógica de parcial existe (CatalogBulkSendDialog / useSendProduct)
- **Falta**: Envio real
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

O tratamento de falha parcial não foi provado

## Dependências

CT-10

## Critério de aceite

- Linha partial no log
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).