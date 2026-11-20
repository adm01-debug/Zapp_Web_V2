# TC-59 — Cabeçalho: fixar, arquivar, renomear, sair, transferir, estatísticas

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Cabeçalho: fixar, arquivar, renomear, sair, transferir, estatísticas.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: 6 ações persistentes
- **Existe hoje** (evidência da auditoria): TeamChatHeader.tsx:266-272 Fixar/Arquivar disabled; :150-156 "Performance (em breve)"; Panel não passa onToggleStats/onTransfer/onRenameGroup/onLeaveGroup (TeamChatPanel.tsx:101-105)
- **Falta**: Ligar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Usuário não consegue organizar nem sair de grupos

## Dependências

Nenhuma registrada.

## Critério de aceite

- 6 ações persistentes
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).