# PLANO — ALERTAS DE E-MAIL NÃO LIDO (SIDEBAR, ABAS DO CHAT E ÍCONE DO CONTATO) — 12 ETAPAS

> **Data:** 2026-10-07 · **Escopo:** front-end · **Sem DDL, sem Edge Function, sem migration.**
> **Pedido do dono (com prints):** (1) quando chega e-mail na caixa de entrada, o item **Email** da barra lateral principal mostra a quantidade; (2) quando chega e-mail de um contato específico e o usuário abre o chat dele, aparece **um alerta na barra de abas do topo** com a quantidade (1, 2…) e **o mesmo número no ícone de e-mail** de "Detalhes do Contato".
> Este documento é plano; nenhuma linha de código de produto foi alterada ao escrevê-lo.

## 1. Estado verificado (dia/2026-10-07)
- `Sidebar.tsx:136-138`: o selo só existe para `inbox` (`inboxBadge`) e `tasks`. O item `email-chat` **não tem selo**.
- O módulo de E-mail já conta não lidos: `useGmail.ts` (~linha 120) faz `email_threads … eq('is_unread', true)` por conta; hoje só aparece dentro do módulo.
- Abas do topo do chat: `ConversationTabs.tsx`; contagens vêm de `get_conversation_tab_counts(p_contact_id)` → `tasks_open`, `notes_total`, `files_total` (**sem e-mail**), mais um canal "client-side" de contagens (`RealtimeInboxView.tsx:142-143`).
- Dados: `email_threads` (`contact_id`, `is_unread`, `gmail_account_id`, `last_message_at`) e `email_messages` (`thread_id`, `is_read`, `direction`). **Nada a migrar.**
- O ícone de e-mail do contato está em `ContactActionButtons.tsx` (~152-157) e é editado pelos cartões C02 e C03.

## 2. Decisões (o dono pode reverter)
- **D01.** **Sidebar:** selo no item Email com o número de **conversas não lidas** (o mesmo contador do módulo), de todas as contas do usuário; some em 0; `99+` acima de 99; atualiza em tempo real.
- **D02.** **Alerta do contato:** conta os **e-mails recebidos e ainda não lidos** daquele contato (`email_messages` com `is_read=false` e `direction='inbound'` das conversas com o `contact_id` dele). Mostra **só quando > 0**, como um alerta, e some depois de lidos.
- **D03.** Onde aparece: **(a)** um chip "E-mail" com a contagem na barra de abas do topo do chat, **só quando houver não lidos**; **(b)** o mesmo número como selo no ícone de e-mail de "Detalhes do Contato".
- **D04.** Clicar no chip ou no ícone abre o módulo de E-mail na conversa do contato (usa o link do cartão C03).
- **D05.** Sem migration: contagem por consulta com `count: exact, head: true` e atualização por realtime em `email_threads` (filtro por `contact_id`).
- **D06 (limite declarado).** E-mails de conversas **sem `contact_id`** não entram na contagem do contato.

## 3. Onda 1 — independente (arquivos novos e o item da sidebar)
- **U01** [iris] **Selo do item Email na sidebar principal.** Hook novo `src/hooks/gmail/useUnreadEmailCount.ts` (conversas `is_unread` de todas as contas visíveis por RLS; realtime; sem mexer em `useGmail`) e a ligação em `Sidebar.tsx` (`item.id === 'email-chat'`). Testes: contagem, 0 some, 99+, realtime, falha de consulta não quebra a barra.
- **U02** [hugo] **Hook da contagem por contato** `src/hooks/gmail/useContactUnreadEmails.ts` (arquivo novo + teste novo, sem UI): recebe `contactId`, devolve `{ count, status }`; consulta `email_messages` com junção em `email_threads` por `contact_id` (confirmar o nome da relação no `types.ts`; se a junção não existir, duas consultas), `is_read=false`, `direction='inbound'`; realtime em `email_threads` com filtro `contact_id`; cancela ao trocar de contato; erro → `status:'erro'`, nunca exceção.

## 4. Onda 2 — criada **depois** que C03 e a onda 1 estiverem integrados
- **U03** [iris] **Chip "E-mail" na barra de abas do topo** (`ConversationTabs.tsx` + `RealtimeInboxView.tsx`, pelo canal de contagens client-side), só quando `count > 0`; clique abre o e-mail do contato.
- **U04** [iris] **Selo no ícone de e-mail** de `ContactActionButtons.tsx` (depende do C03 e do C02 integrados, que editam o mesmo arquivo).
- **U05** [workertestes] Testes de acessibilidade (nome acessível com a contagem, leitor de tela) e de tempo real (chega e-mail → número sobe; lê → some).
- **U06** [vera] Documentação.

## 5. Verificações finais (Claude, na pré-visualização `localhost:5500`)
- **U07** Chega um e-mail → o selo do Email na sidebar sobe; ler → desce.
- **U08** E-mail de um contato → abrir o chat dele mostra o chip e o selo no ícone com o número certo; clicar abre a conversa.
- **U09** Contato sem e-mail novo → nada aparece (sem chip, sem selo).
- **U10** `99+`, várias contas, e-mail em conversa sem `contact_id`.
- **U11** Celular (390 px), contraste do selo, tsc, lint, testes, contratos e bundle ≤ 343 KB.
- **U12** Fechamento e registro do estado.

## 6. Fora de escopo
Notificação sonora ou do navegador de e-mail novo; marcar como lido pelo selo; ligar conversas antigas ao contato (alteração de dados); migration ou nova RPC.

## 7. Estado de execução
_A preencher._
