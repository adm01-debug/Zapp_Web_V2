# PAR-081 — Outlook/Graph; tracking pixel; Resend+IMAP, templates e assinaturas de e-mail

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada

## Descrição e origem

Outlook/Graph; tracking pixel; Resend+IMAP, templates e assinaturas de e-mail.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Paridade V1/V3
- **Existe hoje** (evidência da auditoria): grep email_templates/email_signatures/outlook/email-track = 0
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem assinatura/modelo de e-mail; só Gmail

## Dependências

Decisão (Azure AD, domínio Resend)

## Critério de aceite

- Paridade V1/V3
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).