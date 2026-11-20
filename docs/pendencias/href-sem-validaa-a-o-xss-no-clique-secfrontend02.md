# SEC-FRONTEND-02 — href sem validação (XSS no clique)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.9 Achados de segurança de 07/10 (Y24–Y29) — tratamento previsto no §5 do plano de qualidade

## Descrição e origem

href sem validação (XSS no clique).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.9 Achados de segurança de 07/10 (Y24–Y29) — tratamento previsto no §5 do plano de qualidade).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: isSafeHttpUrl
- **Existe hoje** (evidência da auditoria): Contact360Helpers.tsx:136,245
- **Falta**: Aplicar guard existente
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Script malicioso vindo do CRM roda com a sessão do atendente

## Dependências

Nenhuma registrada.

## Critério de aceite

- isSafeHttpUrl
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).