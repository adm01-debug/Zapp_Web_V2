# L-04 — Chatbot / fluxos e Chatbot L1

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 08 · **Seção**: 3.2 Automação, chatbot e atendimento automático

## Descrição e origem

Chatbot / fluxos e Chatbot L1.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.2 Automação, chatbot e atendimento automático).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: FORGOTTEN #2, CSF 36: triggers keyword/first_message/menu/webhook/schedule
- **Existe hoje** (evidência da auditoria): CRUD + editor (src/hooks/integrations/useChatbotFlows.ts:87,108); Edge chatbot-l1 lê fluxo ai_l1 (supabase/functions/chatbot-l1/index.ts:87-94) mas só é chamada pelo botão "testar conexão" (src/components/settings/ChatbotL1Config.tsx:234); evolution-webhook não aciona chatbot (grep 0)
- **Falta**: ligar o recebimento de mensagem ao motor de fluxos/L1 e gravar chatbot_executions
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Atendimento automático (triagem/FAQ fora do horário) não acontece

## Dependências

pode existir chamada via n8n — não verificável

## Critério de aceite

- FORGOTTEN #2, CSF 36: triggers keyword/first_message/menu/webhook/schedule
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).