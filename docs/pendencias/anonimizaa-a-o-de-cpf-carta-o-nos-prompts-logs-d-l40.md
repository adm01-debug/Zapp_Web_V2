# L-40 — Anonimização de CPF/cartão nos prompts/logs de IA

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 08 · **Seção**: 3.8 Segurança, LGPD e IA

## Descrição e origem

Anonimização de CPF/cartão nos prompts/logs de IA.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.8 Segurança, LGPD e IA).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: audit_report "Auto-Anonymize" P0 ⏳
- **Existe hoje** (evidência da auditoria): ai-proxy sem redaction (grep cpf/redact/anonymi: 0); só talkx-ai remove telefone/e-mail do prompt
- **Falta**: camada de mascaramento no ai-proxy
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

PII de clientes enviada a provedores de IA

## Dependências

Nenhuma registrada.

## Critério de aceite

- audit_report "Auto-Anonymize" P0 ⏳
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).