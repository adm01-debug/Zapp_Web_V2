# T86 — E2E Telefonia no CI

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 03 · **Seção**: 3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)

## Descrição e origem

E2E Telefonia no CI.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: e2e/telefonia.spec.ts verde nos 3 navegadores, ligado no e2e-logado.yml
- **Existe hoje** (evidência da auditoria): Spec existe (mockada, 8 testes, e2e/telefonia.spec.ts:190-371), projeto chromium-telefonia em playwright.config.ts:107-108; não está na lista de projetos de ci.yml:417 nem de e2e-logado.yml:130
- **Falta**: Incluir no CI
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Regressão do discador passa sem aviso

## Dependências

SL-107

## Critério de aceite

- e2e/telefonia.spec.ts verde nos 3 navegadores, ligado no e2e-logado.yml
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).