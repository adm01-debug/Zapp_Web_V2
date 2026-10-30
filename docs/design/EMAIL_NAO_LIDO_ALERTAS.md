# E-mail não lido — onde aparece o alerta, como é contado e os limites

> **Documento de estado real.** Descreve o que o **código de hoje** faz, lido arquivo por
> arquivo. Quando este texto e o código divergirem, o código manda — e a divergência é um
> defeito.
> Plano de origem: `docs/plans/PLANO_EMAIL_ALERTAS_NAO_LIDO_12_ETAPAS_2026-10-07.md`
> (etapas U01–U06). **Sem DDL, sem Edge Function, sem migration**: o recurso é só leitura
> (contagem por consulta) mais um link para o módulo de E-mail.

## 1. Onde o alerta aparece

São **três lugares**, com duas definições de contagem diferentes (§3). Nenhum deles indica
canal ou origem da mensagem.

| # | Lugar | O que mostra | Quando aparece |
|---|-------|--------------|----------------|
| 1 | **Item "Email" da sidebar principal** | selo com a contagem | sempre que o número de **conversas não lidas** for maior que 0 |
| 2 | **Chip "E-mail" na barra de abas do topo do chat** | chip com ícone de envelope + contagem | só quando o contato da conversa aberta tiver **e-mails recebidos não lidos** (maior que 0) |
| 3 | **Selo no ícone de e-mail de "Detalhes do Contato"** | selo com a contagem no canto do ícone | mesma condição do chip (maior que 0) |

Os três cliques levam ao **mesmo destino**: o módulo de E-mail aberto na conversa do contato
(`navigateToView('email-chat', { emailContact, emailTo })` — o link do cartão C03, que lê
`?view=email-chat&emailContact=<uuid>&emailTo=<email>`).

## 2. Os três pontos, um por um

### 2.1 Selo no item "Email" da sidebar (U01 — D01)

- A sidebar pergunta se o item Email está visível no menu e só então consulta
  (`src/components/layout/Sidebar.tsx:64-68`): `canSeeEmailItem = filteredPrimaryNav.some(item => item.id === 'email-chat')`
  e `emailUnread = useUnreadEmailCount(canSeeEmailItem)`. Sem acesso ao item, **não consulta
  e não assina nada**.
- O selo é ligado por item numa cadeia só (`Sidebar.tsx:146-151`):
  `item.id === 'inbox' ? inboxBadge : item.id === 'tasks' ? tasksBadgeInfo.count : item.id === 'email-chat' ? emailUnread.count : undefined`; a variante vem de `badgeVariant`
  (`Sidebar.tsx:152-154`): só o item Tarefas sem atraso usa `warning`; Chat e Email usam
  `destructive`.
- **Some em 0** (`SidebarNavItem.tsx:119`), vira **`99+`** acima de 99 (`SidebarNavItem.tsx:130`)
  e o número entra no nome acessível do botão: `Email (4 não lidas)`
  (`SidebarNavItem.tsx:40-41`) — leitor de tela escuta o valor exato, não o `99+`.

> Atenção ao vocabulário: aqui há **conversas** não lidas (`email_threads`), não mensagens. É o
> mesmo contador que o módulo de E-mail já usava (`useGmail`), sem depender dele.

### 2.2 Chip "E-mail" na barra de abas do chat (U03 — D03a/D04)

- A barra monta o chip **só com contagem maior que 0** (`src/components/inbox/chat/ConversationTabs.tsx:112-116`).
- O chip **não é uma aba**: o painel central não tem seção de e-mail, então ele é uma **ação** e
  fica **fora do `role="tablist"`** (mesmo princípio do `trailingAction`) — a barra continua com
  as 8 abas de sempre.
- `src/components/inbox/chat/EmailUnreadChip.tsx`: botão com `data-testid="email-unread-chip"`,
  ícone `Mail`, o texto "E-mail" só aparece acima de `2xl` (telas estreitas ficam só com o ícone
  e o número), `title="Abrir e-mail do contato"`, contagem no mesmo formato do badge de aba em
  **`bg-destructive`** (alerta; nenhuma cor nova) e a entrada é sutil, só com `motion-safe:`.
- **Nome acessível leva a contagem real**, não o `99+`: `1 e-mail não lido` no singular,
  `<n> e-mails não lidos` no plural (`EmailUnreadChip.tsx:35-37`); acima de 99 o número visível
  vira `99+` (`EmailUnreadChip.tsx:29-32`).
- A contagem vem de fora, do lado cliente: `RealtimeInboxView.tsx:155`
  (`useContactUnreadEmails(inbox.selectedContactId)`) e o clique em `RealtimeInboxView.tsx:156-160`.

### 2.3 Selo no ícone de e-mail do contato (U04 — D03b/D04)

- `src/components/inbox/contact-details/ContactActionButtons.tsx:137`
  (`useContactUnreadEmails(contact.email ? contact.id : null)`). **Contato sem e-mail não
  consulta** (o hook recebe `null` e fica ocioso) e a contagem é zerada em
  (`ContactActionButtons.tsx:139`): `const emailUnread = contact.email ? unreadEmails : 0` — sem selo.
- Com não lidos, o rótulo acessível do ícone passa a carregar a contagem:
  `E-mail, 3 não lidos`; sem não lidos, volta a ser `E-mail` — os dois ramos do ternário em
  (`ContactActionButtons.tsx:140`).
- O selo do ícone (`ContactActionButtons.tsx:97-105`) só renderiza com `{badgeCount != null && badgeCount > 0 && (...)}` — nulo ou zero = sem selo — e usa o token **`bg-primary`/`text-primary-foreground`** (sidebar e chip usam `bg-destructive`, §4); fica **`aria-hidden`**: o número já entra no nome acessível do botão, e
  repeti-lo faria o leitor de tela falar duas vezes. Acima de 99 vira `99+` (`ContactActionButtons.tsx:67-70`).
- Estado desabilitado (contato sem e-mail): `title="Sem e-mail"`, botão desabilitado, sem selo.

## 3. Como cada contagem é feita — duas definições diferentes

As duas contagens são **consultas de contagem** (`count: 'exact', head: true`, sem trazer
linha nenhuma), protegidas por RLS no cliente autenticado (nunca `service role`). As duas
recontam por **tempo real em `email_threads`** com **debounce de 500 ms** (uma rajada de eventos
de um sync de e-mail vira uma consulta só).

### 3.1 Sidebar — conversas não lidas (todas as contas)

`src/hooks/gmail/useUnreadEmailCount.ts`:

- Fonte: `email_threads` com `is_unread = true`, **de todas as contas** que o RLS deixa ver.
- Tempo real sem filtro (qualquer mudança em `email_threads` recontagem) — a barra cobre todas
  as contas.
- `enabled = false` (usuário sem o item Email) não consulta nem assina → `{ count: 0, status: 'ok' }`.
- Erro de consulta nunca lança: vira `{ count: 0, status: 'erro' }`, para a barra lateral não
  quebrar nem mostrar selo errado.

### 3.2 Chip e ícone do contato — e-mails recebidos não lidos (um contato)

`src/hooks/gmail/useContactUnreadEmails.ts`:

- Fonte: `email_messages` com **`is_read = false`** e **`direction = 'inbound'`**, das conversas
  (`email_threads`) **daquele contato**. A junção embutida usa `!inner` e o filtro da coluna
  embutida (`email_threads.contact_id = <id>`), então o servidor já devolve só as mensagens do
  contato e a contagem é exata.
- A junção existe no tipo gerado: `email_messages_thread_id_fkey` → `email_threads`
  (`src/integrations/supabase/types.ts`).
- Tempo real: canal em `email_threads` **filtrado por `contact_id`**; evento de outro contato (ou
  sem contato) não mexe na contagem.
- `contactId` vazio → `{ count: 0, status: 'idle' }`, sem consulta e sem canal.
- Erro de consulta → `{ count: 0, status: 'erro' }`; a função nunca lança. Zero linhas **sem
  `error`** é resposta legítima (RLS filtra sem avisar), não falha.

### 3.3 Troca de contato não troca número

O snapshot guarda a que contato pertence e só é apresentado quando a chave bate com o contato
ativo (`useContactUnreadEmails.ts:152-157`): uma resposta atrasada do contato anterior é
**descartada** e o contato novo aparece como `{ count: 0, status: 'loading' }` até a resposta
DELE chegar — nunca a contagem do contato anterior.

## 4. Limites declarados (o que o recurso **não** faz)

- **D06 — conversa sem `contact_id` não entra na contagem do contato.** O alerta do contato é
  por `contact_id`; e-mail que chegou numa conversa sem contato ligado não aparece no chip nem no
  ícone. (Na sidebar ele continua contando, porque lá a unidade é a conversa.)
- **Erro nunca vira alerta falso.** Falha de consulta zera a contagem; nenhum selo/chip aparece e
  nenhuma barra quebra.
- **Não marca como lido.** O selo/chip é leitura; quem marca é o módulo de E-mail.
- **Não notifica** por som nem pelo navegador.
- **Não liga conversas antigas ao contato** (nada de alteração de dados) e **não** cria migration
  nem RPC.
- **Sem cor nova**: sidebar e chip em `bg-destructive`, selo do ícone em `bg-primary` — tokens que
  o sistema já usa. Sem selo de canal/origem.

## 5. Arquivos

| Papel | Arquivo |
|-------|---------|
| Selo do item Email na sidebar (ligação) | `src/components/layout/Sidebar.tsx` |
| Renderização do selo (0/`99+`/nome acessível) | `src/components/layout/SidebarNavItem.tsx` |
| Contagem de conversas não lidas (sidebar) | `src/hooks/gmail/useUnreadEmailCount.ts` |
| Chip na barra de abas (ligação) | `src/components/inbox/chat/ConversationTabs.tsx` |
| Chip (ícone, contagem, nome acessível) | `src/components/inbox/chat/EmailUnreadChip.tsx` |
| Contagem de e-mails do contato | `src/hooks/gmail/useContactUnreadEmails.ts` |
| Ligação do chip (chat) | `src/components/inbox/RealtimeInboxView.tsx` |
| Selo no ícone de e-mail do contato | `src/components/inbox/contact-details/ContactActionButtons.tsx` |

## 6. Testes que provam

- Selo da sidebar:
  `src/components/layout/__tests__/Sidebar.test.tsx`
  (bloco "Sidebar — selo do item Email (U01)": contagem, 0 sem selo, `99+`, falha não quebra).
- Contagem de conversas não lidas:
  `src/hooks/gmail/__tests__/useUnreadEmailCount.test.tsx`
  (uma consulta de contagem, falha zera, recontagem por tempo real com debounce, desabilitado,
  limpa o canal ao desmontar).
- Contagem de e-mails do contato:
  `src/hooks/gmail/__tests__/useContactUnreadEmails.test.tsx`
  (consulta exata, 0 com `ok`, resposta atrasada de outro contato é descartada, tempo real por
  `contact_id`, evento fora do escopo não reconta, erro → `count 0`, contato vazio → `idle`).
- Chip:
  `src/components/inbox/chat/__tests__/EmailUnreadChip.test.tsx`
  (contagem e rótulo, `99+` com número real no nome acessível, singular, clique, `motion-safe`)
  e `src/components/inbox/__tests__/RealtimeInboxView.emailChip.test.tsx`
  (chip com a contagem, clique abre o e-mail, sem não lidos não aparece, erro não mostra chip).
- Selo no ícone do contato:
  `src/components/inbox/contact-details/__tests__/ContactActionButtons.test.tsx`
  (bloco "U04": selo com o número, 0 sem selo, `99+` com número real no nome acessível)
  e `src/components/inbox/contact-details/__tests__/ContactActionButtons.email-a11y.test.tsx`
  (nome acessível e teclado do ícone de e-mail).

## 7. Fora de escopo

Notificação sonora ou do navegador de e-mail novo; marcar como lido pelo selo; ligar conversas
antigas ao contato (alteração de dados); migration ou nova RPC.
