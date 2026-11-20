# TL-180 — E95 vínculo/pendentes/sugestões de conversão

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.21 3ª leva — cartões sem X/F correspondente

## Descrição e origem

E95 vínculo/pendentes/sugestões de conversão.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.21 3ª leva — cartões sem X/F correspondente).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Além do badge
- **Existe hoje** (evidência da auditoria): Só badge CRM 360 (docs/talkx/help/segmentacao-crm-360/badge-crm-360.md)
- **Falta**: Vínculo/pendentes
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

X036

## Critério de aceite

- Além do badge
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).