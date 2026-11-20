# ES-45 — Homologação visual com dados reais

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.8 E-mail — sidebar de contato/empresa (ES-01–ES-50)

## Descrição e origem

Homologação visual com dados reais.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.8 E-mail — sidebar de contato/empresa (ES-01–ES-50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Playwright na rota real
- **Existe hoje** (evidência da auditoria): e2e/email-navy-visual.spec.ts com fixture
- **Falta**: Dados reais
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- Playwright na rota real
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).