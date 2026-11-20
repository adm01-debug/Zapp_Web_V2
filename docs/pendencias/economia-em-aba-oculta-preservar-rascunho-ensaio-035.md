# 035 — Economia em aba oculta, preservar rascunho, ensaio de reversão, rastreabilidade, revisão autenticada online

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.6 Talk Me (100 + refinamento 50)

## Descrição e origem

Economia em aba oculta, preservar rascunho, ensaio de reversão, rastreabilidade, revisão autenticada online.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.6 Talk Me (100 + refinamento 50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: conforme plano
- **Existe hoje** (evidência da auditoria): relatórios históricos; buildId sem revisão autenticada
- **Falta**: Evidências
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Baixo

## Dependências

QA logado

## Critério de aceite

- conforme plano
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).