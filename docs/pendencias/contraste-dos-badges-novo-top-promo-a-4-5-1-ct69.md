# CT-69 — Contraste dos badges Novo/Top/Promo ≥ 4,5:1

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

Contraste dos badges Novo/Top/Promo ≥ 4,5:1.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Tokens que sigam os 4 temas
- **Existe hoje** (evidência da auditoria): alt feito; 13 de 24 pares abaixo de 4,5:1 (docs/catalogo/CONTRASTE.md; DEC-2 / SL-038)
- **Falta**: Decisão de cor
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Badges ilegíveis para baixa visão

## Dependências

decisão de produto

## Critério de aceite

- Tokens que sigam os 4 temas
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).