# CT-49 — Rail "Envios hoje / 7 dias"

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

Rail "Envios hoje / 7 dias".

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Rail lendo a view catalog_send_stats
- **Existe hoje** (evidência da auditoria): A view existe (20260930740000; types.ts:9974), mas nenhum consumidor no front (grep send_stats em src = 0)
- **Falta**: Componente que leia a view
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

O gestor não vê o volume de envios do catálogo

## Dependências

Nenhuma registrada.

## Critério de aceite

- Rail lendo a view catalog_send_stats
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).