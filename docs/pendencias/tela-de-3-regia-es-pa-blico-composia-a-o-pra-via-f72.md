# F72 — Tela de 3 regiões (Público / Composição / Prévia)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.19 Multiplix — plano de finalização (F01–F100)

## Descrição e origem

Tela de 3 regiões (Público / Composição / Prévia).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.19 Multiplix — plano de finalização (F01–F100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Grid do protótipo
- **Existe hoje** (evidência da auditoria): MultiplixView.tsx = busca + lista + diálogo
- **Falta**: Tela
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Operador compõe às cegas, sem prévia

## Dependências

Nenhuma registrada.

## Critério de aceite

- Grid do protótipo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).