# PLANO — LINK DO E-MAIL NO PAINEL DO CONTATO (CHAT PANEL) — 14 ETAPAS

> **Data:** 2026-10-07 · **Escopo:** front-end · **Sem DDL, sem Edge Function, sem migration, sem dependência nova.**
> **Pedido do dono (com prints):** no painel "Detalhes do Contato", ao clicar no ícone de e-mail, abrir **o módulo de E-mail já com o e-mail daquele contato aberto**.
> Este documento é plano; nenhuma linha de código de produto foi alterada ao escrevê-lo.

## 1. Estado verificado (dia/2026-10-07)
- `ContactActionButtons.tsx` (~152-157): `<Tile label="E-mail" disabled={!contact.email} onClick={() => navigateToView('email-chat')}>`. Abre o módulo **vazio**. Sem e-mail cadastrado o ícone fica cinza (é o que o print mostra).
- `navigateToView(view)` (`useNavigationHistory.ts:154`) **não aceita parâmetros**.
- `EmailChatInbox.tsx` só entende `?emailThread=<id>` (conversa existente), lido no estado inicial e no `popstate`. Já tem `showComposer`/`composerTo` e `<EmailComposer mode="new" defaultTo=…/>`, mas **nada fora do componente os aciona**.
- `email_threads` tem `contact_id` (nullable), `gmail_account_id`, `last_message_at`; `useGmail.ts` já consulta a tabela. Dá para achar a conversa mais recente de um contato por `contact_id`.
- Ninguém mais no código abre o e-mail de um contato (`git grep navigateToView('email-chat'` só acha este botão).

## 2. Decisões (o dono pode reverter)
- **D01.** Clique abre a **conversa mais recente do contato**; se ele não tiver conversa, abre a **nova mensagem** com o e-mail dele no destinatário.
- **D02.** O pedido viaja por parâmetros da URL (`emailContact`, `emailTo`), **saneados** (UUID e e-mail de até 254 caracteres; valor inválido é descartado) e **removidos depois de usados**, para não reabrir ao recarregar nem ao voltar.
- **D03.** `?emailThread` explícito **vence** `emailContact`.
- **D04.** Sem conta Gmail conectada: a tela de conectar aparece e o pedido fica **guardado** até haver conta. Com mais de uma conta, vale a ativa.
- **D05.** O ícone continua **desabilitado** sem e-mail (tooltip "Sem e-mail").
- **D06 (limite declarado).** Conversas de e-mail **sem `contact_id`** não são achadas; nesses casos abre a nova mensagem. Ligar conversas antigas ao contato seria uma **alteração de dados** e fica fora deste plano.

## 3. Onda 1 — implementação (um cartão atômico, porque os arquivos são acoplados)
- **E01–E05** [**complexo**, cartão **C03** `t_a85ae5d1`] (a) `navigateToView(view, params?)` com lista fixa de chaves e valores saneados, mesma entrada de histórico, sem mudar as chamadas atuais; (b) hook `useEmailThreadForContact` (`email_threads` por `contact_id`, `last_message_at desc limit 1`; estados `loading|found|none|error`); (c) `EmailChatInbox` consome os parâmetros e abre a conversa ou o compositor, e limpa a URL; (d) o ícone de e-mail passa o contato; (e) testes dos itens a–d, vermelho→verde.
  *Arquivos:* `useNavigationHistory.ts`, `useEmailThreadForContact.ts` (novo), `EmailChatInbox.tsx`, `ContactActionButtons.tsx` e os testes deles.

## 4. Onda 2 — criada **depois** que o C03 estiver integrado em `dia/`
Esses cartões importam código do C03 ou testam o comportamento dele; criados antes, falhariam na verificação.
- **E06** [workertestes] **Testes adversariais do saneamento** (arquivo novo): `javascript:`, URLs, texto com 5 mil caracteres, Unicode parecido com `@`, UUID com maiúsculas, parâmetros repetidos, valores com `<script>`.
- **E07** [workertestes] **Teste de acessibilidade do ícone**: foco por teclado, estado desabilitado com `aria-disabled`, tooltip falado, e a ordem de tabulação do painel.
- **E08** [workertestes] **E2E** (arquivo novo): contato com conversa → abre a conversa e limpa a URL; com e-mail e sem conversa → abre o compositor preenchido; sem e-mail → desabilitado; botão Voltar não reabre.
- **E09** [vera] **Documentação** do contrato dos parâmetros e do comportamento (arquivo novo em `docs/design/`).

## 5. Verificações finais (Claude, depois da integração, na pré-visualização `localhost:5500`)
- **E10** Contato com conversa de e-mail → abre a conversa mais recente, URL sem `emailContact`.
- **E11** Contato com e-mail e sem conversa → abre a nova mensagem com o destinatário preenchido.
- **E12** Contato sem e-mail → ícone cinza, sem ação.
- **E13** Parâmetros inválidos na URL (`?view=email-chat&emailTo=<script>`) → ignorados, sem erro; recarregar e Voltar não reabrem.
- **E14** Sem conta Gmail conectada; celular (390 px); tsc, lint, testes e contratos completos; bundle inicial ≤ 343 KB.

## 6. Fora de escopo
Ligar conversas antigas ao contato (alteração de dados); outros botões de e-mail (CRM360, lista de contatos); migration; Edge Function.

## 7. Estado de execução
_A preencher._ C03 em execução na fábrica em 07/10/2026.
