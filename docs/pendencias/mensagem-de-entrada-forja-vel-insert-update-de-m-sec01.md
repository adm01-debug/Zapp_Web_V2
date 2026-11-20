# SEC-01 — Mensagem de entrada forjável (INSERT/UPDATE de messages sem fixar origem)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 04 · **Seção**: 3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada

## Descrição e origem

Mensagem de entrada forjável (INSERT/UPDATE de messages sem fixar origem).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Policy/trigger
- **Existe hoje** (evidência da auditoria): nenhuma migration após 07/10 toca policies de messages
- **Falta**: Migration
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Atendente pode forjar mensagem "do cliente"

## Dependências

Banco local → lote

## Critério de aceite

- Policy/trigger
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).