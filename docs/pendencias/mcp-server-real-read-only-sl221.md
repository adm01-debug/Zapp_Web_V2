# SL-221 — MCP server real read-only

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.5 Paridade V1/V3 (100) — blocos da área (1, 2, 4, 5, 6, 10); blocos 3/7/8/9 resumidos

## Descrição e origem

MCP server real read-only.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.5 Paridade V1/V3 (100) — blocos da área (1, 2, 4, 5, 6, 10); blocos 3/7/8/9 resumidos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: JSON-RPC com RLS
- **Existe hoje** (evidência da auditoria): só mcp_exec (gateway)
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- JSON-RPC com RLS
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).