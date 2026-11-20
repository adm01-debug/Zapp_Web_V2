# I-1267 — Guards Multiplix fail-open

- **Estado**: DIVERGENTE
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.11 Issues abertas do GitHub (15)

## Descrição e origem

Guards Multiplix fail-open.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.11 Issues abertas do GitHub (15)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: issue MÉDIO
- **Existe hoje** (evidência da auditoria): Corrigido em 20260930300000_multiplix_guards_fail_closed.sql
- **Falta**: fechar issue
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- issue MÉDIO
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).