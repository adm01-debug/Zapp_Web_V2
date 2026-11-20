# SL-062 — departments.whatsapp_api_key → Vault

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.6 Pendências do Dono (08/10) — itens da área

## Descrição e origem

departments.whatsapp_api_key → Vault.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.6 Pendências do Dono (08/10) — itens da área).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: DROP COLUMN, segredo no Vault
- **Existe hoje** (evidência da auditoria): 20261006213734_team_chat_f10_department_whatsapp_safe_config.sql deixa de devolver o segredo em claro; coluna continua em texto puro
- **Falta**: Mover para Vault + DROP
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Segredo de WhatsApp em tabela comum

## Dependências

trilha de banco

## Critério de aceite

- DROP COLUMN, segredo no Vault
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).