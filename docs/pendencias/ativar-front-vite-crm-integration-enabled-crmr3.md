# CRM-R3 — Ativar front (VITE_CRM_INTEGRATION_ENABLED)

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 04 · **Seção**: 3.6 CRM externo (Singu) — integração, sincronização e segurança

## Descrição e origem

Ativar front (VITE_CRM_INTEGRATION_ENABLED).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.6 CRM externo (Singu) — integração, sincronização e segurança).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Fase 3
- **Existe hoje** (evidência da auditoria): .env.production:15 = false e build publicado com "false" (12/10); flag crm.integration nasceu false (20260909120000:8) mas estava true em produção em 12/10
- **Falta**: Smoke + decisão
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Botão CRM 360°, badges do ChatHeader, CRMAutoSync, sidebar Singu, contexto de empresa no E-mail ficam apagados

## Dependências

Joaquim

## Critério de aceite

- Fase 3
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).