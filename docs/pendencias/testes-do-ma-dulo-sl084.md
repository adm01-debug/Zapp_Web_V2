# SL-084 — Testes do módulo

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Testes do módulo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Hooks, RTL, 0 tautologias, baseline ESLint limpa
- **Existe hoje** (evidência da auditoria): 0 expect(true).toBe(true) (grep); 32 it.todo (30 com títulos corrompidos em team-chat-exhaustive-audit.test.ts:37+, 1 em team-chat-comprehensive, 1 em rls-contract.test.ts); 5 entradas team-chat no eslint-baseline.json
- **Falta**: Converter/apagar todos e testes RTL de lista/cabeçalho
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Cobertura aparente maior que a real

## Dependências

Nenhuma registrada.

## Critério de aceite

- Hooks, RTL, 0 tautologias, baseline ESLint limpa
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).