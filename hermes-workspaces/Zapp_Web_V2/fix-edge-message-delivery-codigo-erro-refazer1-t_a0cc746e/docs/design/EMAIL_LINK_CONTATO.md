# Abrir o e-mail de um contato a partir do painel da conversa — contrato e comportamento

> **Escopo documentado:** o clique no ícone de **E-mail** do painel "Detalhes do Contato"
> até o módulo de E-mail abrir **já com aquele contato** — `ContactActionButtons.tsx`,
> o helper `navigateToView(view, params?)` de `useNavigationHistory.ts`, o hook novo
> `useEmailThreadForContact.ts` e o consumo dos parâmetros em `EmailChatInbox.tsx`.
> **Base do código:** árvore local `dia/2026-10-10` (agentes não acessam produção — regra R1).
> O item C03 (`t_a85ae5d1`, do plano `PLANO_EMAIL_LINK_CONTATO_14_ETAPAS_2026-10-07.md`)
> entrou na linha do dia de uma vez; este documento descreve o **que está no código** —
> não é status de execução.
> **Regras permanentes que valem aqui:** nenhuma informação sai do sistema (este documento
> não cria exportar/baixar/copiar tudo/imprimir/compartilhar); só as cores que o sistema já
> tem; **sem selo de canal ou de origem**. Sem DDL, sem Edge Function, sem migration, sem
> dependência nova. **NÃO VERIFICADO** marca o que o código não prova sozinho.

---

## 1. O que é e para quem

- **É:** ao clicar no ícone **E-mail** de um contato no painel da conversa, o módulo de
  E-mail abre com **aquele contato** — a **conversa mais recente** dele, se existir; senão,
  a **nova mensagem** com o e-mail dele no destinatário.
- **Para quem:** o atendente na linha de frente do Inbox/Chat. Não há permissão nova nem
  recorte por papel aqui.
- **Onde fica:** o ícone é um `Tile` do painel, `ContactActionButtons.tsx:152-156`; o módulo
  é a view `email-chat` (`EmailChatInbox`).

---

## 2. O pedido viaja em três parâmetros da URL

Não há estado compartilhado nem store: o pedido vai pela URL da view `email-chat`. São três
chaves, e duas delas têm papéis diferentes.

| Parâmetro | Papel | Quem escreve | Valor válido |
|---|---|---|---|
| `emailContact` | **intenção** — id do contato clicado | ícone de E-mail | UUID |
| `emailTo` | **intenção** — e-mail do contato (destinatário do compositor) | ícone de E-mail | e-mail, até 254 caracteres |
| `emailThread` | **conversa explícita** já aberta | deep link / navegação interna | id de conversa |

- O clique monta os dois primeiros de uma vez (`ContactActionButtons.tsx:156`):
  `navigateToView('email-chat', { emailContact: contact.id, emailTo: contact.email })`.
- O botão só age **com e-mail cadastrado**: sem `contact.email` ele fica **desabilitado**
  (tooltip "Sem e-mail") — `ContactActionButtons.tsx:154-155`.
- `emailThread` **não** é escrito por este clique: ele é o caminho da conversa explícita e,
  quando presente, **vence** a intenção (ver §5).

---

## 3. Saneamento na escrita — `navigateToView(view, params?)`

`navigateToView` (`useNavigationHistory.ts:217-234`) passa todo par chave→valor por uma
**lista fixa** de saneadores (`NAV_PARAM_SANITIZERS`, `:199-202`):

- chave **fora da lista** é ignorada;
- `emailContact`: aceito só se casar `UUID_PARAM_RE` (`:191`), senão é descartado;
- `emailTo`: aceito só se tiver **até 254 caracteres** (`EMAIL_TO_MAX_LENGTH`, `:193`) e
  casar `EMAIL_PARAM_RE` (`:192`), senão é descartado;
- saneador que devolve `null` **descarta o valor** — o par não entra na URL.

Dois efeitos de histórico ligados ao pedido:

- **Mesma entrada.** Os parâmetros são gravados na **mesma** entrada de histórico
  (`setViewParam`, `:166-190`); se a view `email-chat` já está ativa, usa `replaceState`
  (não empilha) — `:219`. O clique com o módulo já aberto não cria uma segunda entrada.
- **Limpa `emailThread` remanescente.** Quando a navegação carrega ao menos uma chave
  válida, `emailThread` é zerado (`extraParams.emailThread = null`, `:230`): a conversa de
  outro contexto não pode barrar o pedido novo. Um `?emailThread` explícito em deep link
  **não passa por aqui**, então continua valendo (comentário em `:212-215`).
- Por fim, `navigateToView` emite o evento `zapp:navigate` (`:233`) para o hook de navegação
  não interpretar isso como voltar/avançar.

---

## 4. Como o `EmailChatInbox` consome o pedido

Leitura e limpeza:

- `readEmailContactIntent()` (`EmailChatInbox.tsx:26-34`) lê `emailContact`/`emailTo` da URL
  e devolve a intenção; devolve `null` se não há nenhum dos dois **ou** se há `emailThread`
  explícito.
- `stripEmailContactParams()` (`:36-43`) remove `emailContact` **e** `emailTo` da entrada
  atual via `replaceState` — sem empilhar histórico, para não reabrir ao recarregar nem ao
  voltar.
- Quando a intenção ainda **não pode** ser consumida, os parâmetros ficam na URL.

Gatilhos de releitura (`syncEmailParamsFromUrl`, `:126-136`; listeners em `:138-150`):
`popstate` **e** o evento `zapp:navigate` da view `email-chat` (o clique na **mesma view**
usa `replaceState`, que **não** dispara `popstate` — por isso o evento próprio).

O consumo (`:169-197`) acontece **só com conta Gmail ativa**, e decide assim:

1. se ainda há `emailContact`/`emailTo` **e** um `emailThread` explícito na URL → os
   parâmetros de contato são **descartados** (`stripEmailContactParams()`);
2. se a intenção só tem `emailContact` e a consulta por contato está `loading` → **espera**
   (nada abre, os parâmetros continuam na URL);
3. **achou** conversa (`status === 'found'` e `threadId`) → abre essa conversa na mesma
   entrada (`navigateToThread(threadId, replace = true)`, `:152-160`, que grava
   `?emailThread` e retira a intenção);
4. **não achou** ou a **consulta falhou** (`none`/`error`) → abre o **compositor** de nova
   mensagem com o destinatário (`setComposerTo(intent.to)`, `setShowComposer(true)`) — a
   intenção **não se perde** no erro.

O `setState` é adiado para uma *microtask* (`queueMicrotask`, `:171`) com a trava `alive`
para não mexer no estado de um componente desmontado.

### Achar a conversa mais recente do contato

`useEmailThreadForContact(gmailAccountId, contactId)` (`useEmailThreadForContact.ts`)
consulta `email_threads` **por `contact_id`** na conta Gmail **ativa**, mais recente
primeiro (`order last_message_at desc`, desempate por `id desc`, `limit(1)`), e devolve
`status` em `loading | found | none | error`. Usa o cliente autenticado normal — **o RLS da
tabela já restringe ao usuário; não usa service role**.

---

## 5. Prioridades e limites (o que o código NÃO faz)

- **`?emailThread` explícito vence `emailContact`.** O leitor devolve `null` quando há thread
  (`:32`) e o consumo descarta os parâmetros de contato (`:174-177`).
- **Sem conta Gmail conectada, nada é consumido:** a tela de conectar aparece e os
  parâmetros **ficam preservados** até a conta existir (`:180`; teste "sem conta Gmail…
  preserva os parâmetros" e "espera a conta aparecer"). Com mais de uma conta, vale a
  **ativa**.
- **Conversa sem `contact_id` não é achada** (limite declarado D06 do plano). Como a busca é
  exatamente por `contact_id`, a conversa de um contato cujas threads antigas foram gravadas
  sem esse vínculo cai no caso "não achou" → **abre o compositor**. Ligar conversas antigas
  ao contato seria **alteração de dados** e está fora de escopo.
- **Só a mais recente.** O teto é 1 (`limit(1)`); não há lista de conversas do contato.
- **Ícone sem e-mail não faz nada** (desabilitado, tooltip "Sem e-mail").
- **Não é isto:** o contexto "quem é o contato desta conversa" (`useEmailContactContext`,
  `resolveEmailConversationPerson`, `EmailContactPanel`) é outra coisa — resolve a
  identidade a partir da thread. Aqui o caminho é o inverso: do contato para a thread.

---

## 6. Arquivos e testes

**Código (C03):**

- `src/components/inbox/contact-details/ContactActionButtons.tsx` — ícone de e-mail (152-156).
- `src/hooks/system/useNavigationHistory.ts` — `navigateToView` (217-234) e saneadores (191-202).
- `src/hooks/integrations/useEmailThreadForContact.ts` — consulta da conversa do contato.
- `src/components/email/EmailChatInbox.tsx` — leitura/consumo/limpeza (26-43, 126-197).

**Testes que provam o contrato:**

- `src/hooks/system/useNavigationHistory.navigateToViewParams.test.ts` — 7 testes:
  sem params nada muda; `emailContact`/`emailTo` na **mesma** entrada (um pushState); descarta
  `emailContact` não-UUID e chave fora da lista; descarta `emailTo` inválido e acima de 254;
  na view ativa usa `replaceState` e ainda aplica os params; **remove `emailThread`
  remanescente** ao carregar intenção; emite `zapp:navigate`.
- `src/components/email/__tests__/EmailChatInbox.contato.test.tsx` — 8 testes:
  achou conversa → abre `emailThread=<id>` e limpa a URL; sem conversa → compositor com o
  e-mail e limpa a URL; erro na consulta → compositor com o destinatário; `?emailThread`
  explícito vence `emailContact`; sem conta Gmail → tela de conectar e parâmetros preservados;
  espera a conta aparecer e consome depois; enquanto carrega, nada abre e os parâmetros ficam;
  `popstate` para uma entrada com `emailContact` consome a intenção.
- `src/components/inbox/contact-details/__tests__/ContactActionButtons.test.tsx` — teste do
  clique ("clicar no e-mail abre o módulo de E-mail levando o contato (id + e-mail)") e os de
  tooltip/estado desabilitado do ícone.

---

## 7. Fora de escopo / não verificado

- **Fora de escopo (plano §6):** ligar conversas antigas ao contato (alteração de dados);
  outros botões de e-mail (CRM360, lista de contatos); migration; Edge Function.
- **NÃO VERIFICADO:** a verificação visual na pré-visualização (`localhost:5500`, itens
  E10–E14 do plano) é do Claude, depois da integração. Os testes adversariais de saneamento
  (L06), a acessibilidade do ícone (L07) e o E2E (L08) são cartões de `workertestes`.
