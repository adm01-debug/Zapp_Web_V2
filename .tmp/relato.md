Especialista: Íris (area-front-componentes)

Concluí o cartão: o editor de templates com variáveis grava no banco e não herda mais o template editado antes.

## O que mudou e por quê
- `src/components/inbox/TemplatesWithVariables.tsx` — o componente agora usa `useMessageTemplates` de verdade: busca a lista em `message_templates` ao montar (quando há usuário), chama `addTemplate` no template novo e `updateTemplate` (com o id do template em edição) no template existente. O falso "Template criado!/atualizado!" do `sonner` saiu: quem confirma é o hook, que só mostra sucesso depois do retorno do banco. Se a gravação falhar, `handleSave` devolve `false` e o diálogo continua aberto com o erro do hook na tela. A lista por prop continua funcionando (`templates?` virou opcional; sem ela o componente usa a lista gravada), e entrou `onSaved?` para o pai recarregar a lista.
- `src/components/inbox/TemplatesWithVariables.tsx` — o `TemplateEditorDialog` recebe `key={editingTemplate?.id ?? 'novo'}`: ao abrir "Editar" de outro template o formulário remonta com os dados certos, em vez de manter o título/conteúdo/atalho do anterior. Os botões de ícone (Editar/Usar/Excluir) ganharam `aria-label` com o título do template, e a exclusão passou a existir no componente: pede confirmação em `AlertDialog` e só então chama `deleteTemplate`.
- `src/components/inbox/templates/TemplateEditorDialog.tsx` — o preview deixou de rotular como "Preview com dados do contato" um exemplo inventado: com `contactData` do contato real usa os dados dele, sem `contactData` mostra o exemplo de João Silva sob o rótulo "Exemplo com dados fictícios". O atalho já era sanitizado para letras/números e agora avisa "Atalho já usado por outro template" quando colide com outro template da lista (novo prop `takenShortcuts`). O `onSave` passou a devolver `boolean` para distinguir gravado de não gravado, e o `onClick` não deixa mais rejeição não tratada no console.
- `src/hooks/chat/useMessageTemplates.ts` — faltava algo para ligar a tela ao hook: `updateTemplate` exigia o `Template` inteiro. O parâmetro virou `TemplateUpdate` (só o `id` é obrigatório), sem mexer no corpo da consulta nem em quem já chamava com o template completo (`MessageTemplates.tsx` continua passando todos os campos).
- `src/components/inbox/__tests__/TemplatesWithVariables.grava.test.tsx` (NOVO) — 8 testes que renderizam o componente REAL e o hook REAL; só o cliente Supabase é mockado (`.from('message_templates')` guarda insert/update/delete). Cobrem: confirmação só depois da gravação voltar (insert pendente não mostra sucesso), update com o id certo, falha não confirma nem fecha o diálogo, editor não herda o template anterior, rótulo do preview com e sem contato real, aviso de atalho duplicado e exclusão só após confirmação.

## Prova
- vermelho antes: `npx vitest run src/components/inbox/__tests__/TemplatesWithVariables.grava.test.tsx` com os 3 arquivos de produção restaurados para a base (`git show HEAD:<arquivo>`) → `Test Files 1 failed (1); Tests 8 failed (8)`
- verde depois: `npx vitest run src/components/inbox/__tests__/TemplatesWithVariables.grava.test.tsx` → `Test Files 1 passed (1); Tests 8 passed (8)`
- `npx eslint` nos 4 arquivos → `0 errors` (1 warning `react-refresh/only-export-components` que já existe na base, na mesma linha de re-export)

## O que NÃO fiz e por quê
- Não montei o componente no chat nem criei o botão de acesso (overlay/menu): isso é o cartão TM1 `t_8615abd9`, que continua em `todo`. Esta entrega deixa a tela pronta para ser montada como está.
- Não mexi em RLS/migration: a persistência usa a tabela `message_templates` que já existe; qualquer regra de banco é trilha de worker (sql).
