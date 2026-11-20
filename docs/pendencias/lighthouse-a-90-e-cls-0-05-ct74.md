# CT-74 — Lighthouse ≥ 90 e CLS < 0,05

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

Lighthouse ≥ 90 e CLS < 0,05.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Desempenho em 4G
- **Existe hoje** (evidência da auditoria): Medido perf 44 / CLS 0,2452; a correção da faixa de KPIs não moveu o número (PLANO_FINALIZACAO:1190)
- **Falta**: Nova atribuição do layout-shift
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Tela pula e demora no celular

## Dependências

Nenhuma registrada.

## Critério de aceite

- Desempenho em 4G
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).