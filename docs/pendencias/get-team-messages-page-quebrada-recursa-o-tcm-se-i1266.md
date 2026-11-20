# I-1266 — get_team_messages_page quebrada / recursão tcm_select_own

- **Estado**: DIVERGENTE
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.11 Issues abertas do GitHub (15)

## Descrição e origem

get_team_messages_page quebrada / recursão tcm_select_own.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.11 Issues abertas do GitHub (15)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: issue ALTO
- **Existe hoje** (evidência da auditoria): Corrigido em 20260930280000_team_rpc_ambiguity_and_tcm_recursion.sql (a própria migration diz "nenhum chamador em src/")
- **Falta**: fechar issue (RPC segue sem uso — C-04)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- issue ALTO
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).