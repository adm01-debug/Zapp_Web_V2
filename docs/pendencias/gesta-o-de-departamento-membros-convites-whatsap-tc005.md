# TC-005 — Gestão de departamento (membros, convites, WhatsApp, auditoria, "Entrar via código", admin abre canal)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Gestão de departamento (membros, convites, WhatsApp, auditoria, "Entrar via código", admin abre canal).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Tudo por RPC segura; "Entrar via código"; admin acessa qualquer canal
- **Existe hoje** (evidência da auditoria): Inacessível: TeamChatView.tsx:33-38 não passa canManageDepartments (botão em TeamConversationList.tsx:191); salvar WhatsApp grava na tabela inexistente department_whatsapp_configs com @ts-expect-error (useDepartmentManagement.ts:243-246); auditoria inserida direto com user.id (:144,165,189,213,248); membros por UPDATE em profiles (:185,209); leitura do modo por get_department_whatsapp_mode (20261009170000) ok; bloqueio de canal sem saída (TeamChatPanel.tsx:27,77-95 só "Solicite um convite")
- **Falta**: Ligar UI à RPC get/set_department_whatsapp_config (F10 já no banco), convites, entrada por código, override de admin
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Ninguém administra canais de departamento; agente bloqueado não tem como entrar

## Dependências

F15–F17, F47

## Critério de aceite

- Tudo por RPC segura; "Entrar via código"; admin acessa qualquer canal
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).