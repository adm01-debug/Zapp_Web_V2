# L-42 — Rotação de credenciais Evolution GO + runbook

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.8 Segurança, LGPD e IA

## Descrição e origem

Rotação de credenciais Evolution GO + runbook.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.8 Segurança, LGPD e IA).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Issue #380
- **Existe hoje** (evidência da auditoria): Restart da VPS documentado (docs/runbooks/deploy.md:123-124); nenhum procedimento de rotação de EVOLUTION_API_KEY/EVOLUTION_INSTANCE_TOKEN
- **Falta**: runbook + agenda
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Chave vazada = WhatsApp da empresa exposto

## Dependências

Joaquim

## Critério de aceite

- Issue #380
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).