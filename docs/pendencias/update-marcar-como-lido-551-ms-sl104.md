# SL-104 — UPDATE "marcar como lido" 551 ms

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.7 Segunda leva — CI/DevOps, Performance e seleção infra/segurança (status do TSV é de 07/10; abaixo o estado no código)

## Descrição e origem

UPDATE "marcar como lido" 551 ms.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.7 Segunda leva — CI/DevOps, Performance e seleção infra/segurança (status do TSV é de 07/10; abaixo o estado no código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Remover REPLICA IDENTITY FULL de messages
- **Existe hoje** (evidência da auditoria): nenhuma migration altera messages (só email_messages/whisper/team_messages)
- **Falta**: Avaliar e ajustar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Marcar conversa como lida lento

## Dependências

trilha de banco

## Critério de aceite

- Remover REPLICA IDENTITY FULL de messages
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).