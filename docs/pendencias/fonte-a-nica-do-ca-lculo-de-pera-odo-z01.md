# Z01 — Fonte única do cálculo de período

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.4 Consistência de design (Z01–Z03)

## Descrição e origem

Fonte única do cálculo de período.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.4 Consistência de design (Z01–Z03)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: filesPeriod.ts vira adaptador de journey/periodRange.ts
- **Existe hoje** (evidência da auditoria): src/lib/filesPeriod.ts:1 não importa periodRange; src/lib/journey/periodRange.ts:25-27 "a unificação fica para depois"
- **Falta**: Unificar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Arquivos e Journey podem divergir no mesmo período

## Dependências

Nenhuma registrada.

## Critério de aceite

- filesPeriod.ts vira adaptador de journey/periodRange.ts
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).