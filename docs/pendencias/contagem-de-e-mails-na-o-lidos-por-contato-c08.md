# C-08 — Contagem de e-mails não lidos por contato

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 5. Achados fora dos planos (varredura de código)

## Descrição e origem

Contagem de e-mails não lidos por contato.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (5. Achados fora dos planos (varredura de código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: PLANO_EMAIL_ALERTAS U02 (área 04)
- **Existe hoje** (evidência da auditoria): src/hooks/gmail/useContactUnreadEmails.ts só em teste
- **Falta**: ligar ao badge do contato
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Atendente não vê e-mail pendente do cliente no chat

## Dependências

Nenhuma registrada.

## Critério de aceite

- PLANO_EMAIL_ALERTAS U02 (área 04)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).