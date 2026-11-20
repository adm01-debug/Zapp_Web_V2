# SEC-GMAIL — OIDC Gmail bloqueante

- **Estado**: JÁ PRONTO
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.8 LGPD, backup, observabilidade e segurança operacional

## Descrição e origem

OIDC Gmail bloqueante.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.8 LGPD, backup, observabilidade e segurança operacional).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): JÁ PRONTO.
- **Planejado**: Bloquear antes do service role
- **Existe hoje** (evidência da auditoria): gmail-webhook/index.ts:115-131 (R2-API-021) exige GMAIL_OIDC_AUDIENCE/EMAIL
- **Falta**: Confirmar secrets no painel (NV)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões, functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Se faltarem, todo push do Gmail é recusado

## Dependências

painel

## Critério de aceite

- Bloquear antes do service role
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).