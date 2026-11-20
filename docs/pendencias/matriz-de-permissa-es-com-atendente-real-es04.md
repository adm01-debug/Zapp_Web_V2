# ES-04 — Matriz de permissões com atendente real

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 04 · **Seção**: 3.8 E-mail — sidebar de contato/empresa (ES-01–ES-50)

## Descrição e origem

Matriz de permissões com atendente real.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.8 E-mail — sidebar de contato/empresa (ES-01–ES-50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Atendente real
- **Existe hoje** (evidência da auditoria): 403/404 com atendente sintético (crm-integration/index.test.ts)
- **Falta**: Teste real
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Deploy + flag

## Critério de aceite

- Atendente real
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).