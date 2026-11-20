# F89 — Integração da fila contra banco

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.19 Multiplix — plano de finalização (F01–F100)

## Descrição e origem

Integração da fila contra banco.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.19 Multiplix — plano de finalização (F01–F100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Confirmar→drenar→concluir
- **Existe hoje** (evidência da auditoria): multiplix-delivery-leases.test.sh
- **Falta**: Cenário com blocos reais
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Defeito MX01 passou despercebido

## Dependências

MX01

## Critério de aceite

- Confirmar→drenar→concluir
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).