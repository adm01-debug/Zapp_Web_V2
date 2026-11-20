# SL-050 — Zod no corpo do evolution-api

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.7 Segunda leva — CI/DevOps, Performance e seleção infra/segurança (status do TSV é de 07/10; abaixo o estado no código)

## Descrição e origem

Zod no corpo do evolution-api.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.7 Segunda leva — CI/DevOps, Performance e seleção infra/segurança (status do TSV é de 07/10; abaixo o estado no código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Schema
- **Existe hoje** (evidência da auditoria): supabase/functions/evolution-api/index.ts sem z.object (grep 0)
- **Falta**: Validar corpo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Entrada malformada chega ao provedor

## Dependências

Nenhuma registrada.

## Critério de aceite

- Schema
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).