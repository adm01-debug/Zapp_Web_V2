# E06 — Bundle, stashes, branches locais, worktrees, MCP renomeado

- **Estado**: NÃO VERIFICÁVEL
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.2 PLANO_MELHORIAS_50_ETAPAS_2026-09-20 e PLANO_CORRECOES_50_ETAPAS_2026-09-16

## Descrição e origem

Bundle, stashes, branches locais, worktrees, MCP renomeado.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.2 PLANO_MELHORIAS_50_ETAPAS_2026-09-20 e PLANO_CORRECOES_50_ETAPAS_2026-09-16).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO VERIFICÁVEL.
- **Planejado**: Higiene da máquina local
- **Existe hoje** (evidência da auditoria): fora do repositório
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

máquina do Joaquim

## Critério de aceite

- Higiene da máquina local
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).