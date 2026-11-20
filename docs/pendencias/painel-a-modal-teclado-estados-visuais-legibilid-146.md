# 146 — Painel × modal, teclado, estados visuais, legibilidade

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Painel × modal, teclado, estados visuais, legibilidade.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: A11y e estados padronizados
- **Existe hoje** (evidência da auditoria): Estados de job padronizados; auditoria A11Y aponta botões sem nome
- **Falta**: Correções de a11y
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Uso por teclado/leitor de tela falha

## Dependências

Nenhuma registrada.

## Critério de aceite

- A11y e estados padronizados
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).