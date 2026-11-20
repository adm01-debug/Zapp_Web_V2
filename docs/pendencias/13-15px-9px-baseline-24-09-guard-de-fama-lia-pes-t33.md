# T33 — 13/15px, 9px, baseline 24/09, guard de família/peso

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.9 Correção de layout (30) e tipografia (100)

## Descrição e origem

13/15px, 9px, baseline 24/09, guard de família/peso.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.9 Correção de layout (30) e tipografia (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: conforme plano
- **Existe hoje** (evidência da auditoria): 7px/8px zerados; 9px persiste; baseline-2026-09-24.json ausente
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Baixo

## Dependências

Nenhuma registrada.

## Critério de aceite

- conforme plano
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).