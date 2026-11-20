# E18 — Contraste ≥4,5:1 do player/slider

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.5 Controles de volume da sidebar (S01–S50) e Volume de mídia (E01–E50)

## Descrição e origem

Contraste ≥4,5:1 do player/slider.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.5 Controles de volume da sidebar (S01–S50) e Volume de mídia (E01–E50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Tokens com contraste AA
- **Existe hoje** (evidência da auditoria): Ajuste #1435 revertido por #1458 a pedido do dono (manter azul)
- **Falta**: Decisão de design
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Slider com trilha 1,30–2,88:1 pouco visível p/ baixa visão

## Dependências

dono

## Critério de aceite

- Tokens com contraste AA
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).