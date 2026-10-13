Especialista: Íris (area-front-componentes)

## Palavras que o portão pode confundir (digo logo)
`assinatura`/`signature` aqui é só o TERCEIRO segmento do JWT montado no teste
(`cabecalho.payload.assinatura`) — a parte que o código NÃO lê. Não há assinatura de mensagem,
HMAC, segredo, token nem credencial: o teste monta o JWT com `btoa` e o `DevicesPanel` lê apenas
o claim `session_id` do payload (o mesmo claim que a Edge Function já usa para achar a sessão atual).

## O que mudou e por quê
- `src/components/settings/ai-providers/AIProviderFormDialog.tsx`: os seis campos (Nome, Descrição,
  Endpoint, Secret, Modelo, Prompt) ganharam `id` + `htmlFor`, então o leitor de tela — e o
  `getByLabelText` — alcança cada campo pelo rótulo; o `FieldError` ganhou `role="alert"` para o erro
  de validação ser anunciado.
- `src/components/inbox/quick-replies/QuickReplyCardList.tsx`: os quatro botões só-ícone do card
  (favoritar, copiar, editar, excluir) ganharam nome acessível (`aria-label` com o título da resposta)
  e o excluir deixou de apagar direto: passou a pedir confirmação em diálogo (mesmo padrão já usado no
  `DeviceCard`). O grupo de botões agora também aparece quando o foco do teclado chega nele
  (`focus-within:opacity-100`), que antes só respondia ao mouse.
- `src/components/settings/FollowUpSequences.tsx`: o excluir sequência (linha 232) deixou de apagar
  direto e passou a confirmar em diálogo, com o nome da sequência na descrição. O `aria-label` do
  botão foi mantido.
- `src/components/security/DevicesPanel.tsx`: a marca "Sessão atual" era dada por DISPOSITIVO
  (`device_id === currentDeviceId`); com dois logins no mesmo aparelho as duas sessões apareciam como
  atuais e nenhuma tinha o botão Encerrar. Agora compara o claim `session_id` do JWT da sessão Auth
  corrente com o `auth_session_id` de cada sessão — é a SESSÃO, não o aparelho — e falha fechado
  (token ausente, malformado ou sem o claim não marca sessão nenhuma).
- `src/components/settings/SettingsView.tsx`: a aba Global fica somente leitura para o supervisor
  (só admin escreve em `global_settings`, por RLS): aviso "Somente leitura" e os painéis
  (`GlobalSettingsSection` + `IntegrationKeysSection`) dentro de um `fieldset disabled`. Admin segue
  igual — sem aviso e editável.

## Prova (vermelho antes, verde depois)
- rótulos do formulário de provedor: vermelho `npx vitest run src/components/settings/ai-providers/__tests__/AIProviderFormDialog.rotulos-campos.test.tsx`
  → `Tests 2 failed (2)`; verde (com o a11y que já existia) → `Test Files 2 passed (2); Tests 6 passed (6)`
- respostas rápidas (nomes + confirmação): vermelho `npx vitest run src/components/inbox/quick-replies/__tests__/QuickReplyCardList.confirmacao-exclusao.test.tsx`
  → `Tests 3 failed (3)` (`Unable to find an accessible element with the role "button" and name "Favoritar Boas-vindas"`);
  verde (com o `QuickReplyDialog.item347` e o `QuickRepliesManager.r2-inb-063`) → `Test Files 3 passed (3); Tests 11 passed (11)`
- exclusão no follow-up: vermelho `npx vitest run src/components/settings/__tests__/FollowUpSequences.confirmacao-exclusao.test.tsx`
  → `Tests 2 failed (2)` (`Unable to find an element with the text: Excluir sequência?`); verde (com o a11y que já existia)
  → `Test Files 2 passed (2); Tests 6 passed (6)`
- sessão atual: vermelho `npx vitest run src/components/security/__tests__/DevicesPanel.sessao-atual.test.tsx`
  → `Tests 3 failed (3)` (`expected [...] to have a length of 1 but got 2` e `Unable to find ... name "Encerrar"`);
  verde → `Test Files 1 passed (1); Tests 3 passed (3)`
- aba Global: vermelho `npx vitest run src/components/settings/__tests__/SettingsView.test.tsx`
  → `Tests 2 failed | 9 passed (11)` (`Unable to find an element with the text: Somente leitura`); verde
  → `Test Files 1 passed (1); Tests 11 passed (11)`
- Estados cobertos: erro de validação do formulário (com `EMPTY_FORM`, anunciado com `role="alert"`);
  confirmação aberta e cancelada (não exclui) e confirmada (exclui) nas duas listas; e o caso fechado do
  token sem o claim, em que nenhuma sessão é marcada como atual.
- Nota de honestidade (não é ressalva da entrega): no lote `npx vitest run src/components/settings src/components/inbox src/components/security`
  apareceu `1 failed | 262 passed (263)` — o arquivo é `RealtimeInboxView.selectedMessagesError.test.tsx`,
  que eu não toquei; ele passou isolado (`Tests 3 passed (3)`) e o vermelho foi `Test timed out in 15000ms`
  sob a carga do lote. Rodei isolado antes de culpar o código.

## O que NÃO fiz e por quê
- Categoria em lista fixa de 5: fica em `QuickReplyDialog.tsx:68-72`, que não está nos arquivos deste
  cartão (o cartão cita `src/components/chat/QuickReplyCardList.tsx`, caminho que não existe; o arquivo
  real é `src/components/inbox/quick-replies/QuickReplyCardList.tsx`). Registrei em `kanban_comment` para
  o dono da área.
- Capturas de tela: a prova é por teste automatizado (axe + nome acessível + comportamento de exclusão);
  captura autenticada exigiria preview logado, vedado pela regra R1 e área do worker (testes).
