Especialista: worker (docs)

## O que mudou e por quê

- `docs/design/EMAIL_NAO_LIDO_ALERTAS.md` (NOVO, único arquivo do diff): descreve o estado
  real do alerta de e-mail não lido, lido arquivo por arquivo no código de hoje.
  - §1–2: onde aparece — selo no item "Email" da sidebar (`Sidebar.tsx`/`SidebarNavItem.tsx`),
    chip na barra de abas do chat (`ConversationTabs.tsx`/`EmailUnreadChip.tsx`, fora do
    `role="tablist"`, só com count > 0) e selo no ícone de e-mail de "Detalhes do Contato"
    (`ContactActionButtons.tsx`). Os três abrem o módulo de E-mail pela mesma ligação
    `navigateToView('email-chat', { emailContact, emailTo })`.
  - §3: como é contado — duas definições diferentes, como o cartão pede: a sidebar conta
    **conversas** não lidas (`email_threads.is_unread = true`, todas as contas, RLS) e o
    contato conta **e-mails recebidos** não lidos (`email_messages.is_read = false` e
    `direction = 'inbound'` das conversas com `contact_id` do contato); as duas com
    `count: 'exact', head: true`, debounce de 500 ms e tempo real em `email_threads`.
  - §4: limites — D06 (conversa sem `contact_id` não entra na contagem do contato), erro
    vira count 0 (nenhum alerta falso), a resposta atrasada de outro contato é descartada,
    não marca como lido, não notifica, sem DDL/RPC e sem cor nova.
  - §5–6: arquivos e os testes que provam cada ponto.

## Prova

- vermelho antes: `git cat-file -e HEAD:docs/design/EMAIL_NAO_LIDO_ALERTAS.md` →
  `fatal: path ... exists on disk, but not in 'HEAD'` (o documento é novo do cartão; sem
  comportamento novo de produto a prova é o documento em si).
- caminhos citados: `node .tmp/verifica-caminhos.mjs` →
  `OK: 17 caminhos citados (todos existem) e 17 referências de linha dentro do arquivo.`
  (toda referência do documento resolve no repositório).
- testes citados, rodados agora: `npx vitest run` nos seis arquivos da §6 →
  `Test Files 6 passed (6); Tests 60 passed (60)`.
- diff: `docs/design/EMAIL_NAO_LIDO_ALERTAS.md | 166 +++` — só o arquivo que o cartão permite
  ("ARQUIVOS (SÓ estes)").

## O que NÃO fiz e por quê

- Não criei guarda/teste novo em `scripts/ci` nem em `src/**`: o cartão lista **um único
  arquivo** e diz que qualquer outro no diff é recusa por "diff maior que o título".
- Não alterei os cartões U01–U04 nem o plano: só documentei o que eles deixaram integrado.
