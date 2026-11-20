# TC-86 — Faxina de órfãos

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Faxina de órfãos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Apagar arquivos sem uso
- **Existe hoje** (evidência da auditoria): src/i18n/team-chat.ts, TeamChatA11y.tsx, team-chat-tokens.css, scripts/team-chat-db-validate.mjs existem
- **Falta**: Apagar ou ligar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- Apagar arquivos sem uso
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).