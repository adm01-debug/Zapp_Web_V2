# B13 — ai-auto-tag/auth_test.ts no CI

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.2 Registro de achados IA-003 / lacunas IA-004 (residuais)

## Descrição e origem

ai-auto-tag/auth_test.ts no CI.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.2 Registro de achados IA-003 / lacunas IA-004 (residuais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Rodar no CI
- **Existe hoje** (evidência da auditoria): Nenhuma referência em .github/workflows/ci.yml
- **Falta**: Incluir no CI
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Teste de autorização não protege nada

## Dependências

Nenhuma registrada.

## Critério de aceite

- Rodar no CI
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).