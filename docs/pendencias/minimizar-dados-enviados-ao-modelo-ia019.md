# IA-019 — Minimizar dados enviados ao modelo

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Minimizar dados enviados ao modelo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Allowlist por finalidade, proteger notas internas, mascarar
- **Existe hoje** (evidência da auditoria): talkx-ai remove telefone/e-mail (talkx-ai/index.ts:13-15); ai-suggest-reply injeta notas internas e campos customizados no prompt (ai-suggest-reply/index.ts:95-113); nenhum mascaramento de CPF/cartão
- **Falta**: Allowlist + mascaramento por capacidade
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Risco LGPD: nota interna/dado pessoal vai a provedor externo

## Dependências

Nenhuma registrada.

## Critério de aceite

- Allowlist por finalidade, proteger notas internas, mascarar
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).