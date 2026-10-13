Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/contacts/ContactNotes.tsx (a FICHA do contato: ContactDetailPanel → ContactNotes, citado em docs/design/MODULO_CONTATOS_CRM360_SALESVIEW.md:480): o `select` da lista passou a trazer `is_pinned` e a lista é ordenada com as fixadas primeiro (`orderNotes`, fixadas → `created_at` desc); a nota própria ganhou editar em linha (Textarea com `autoFocus`, Esc cancela, Ctrl/Cmd+Enter salva) e botão fixar/desafixar com `aria-pressed` + destaque (`data-pinned`, borda/fundo primário e selo "Fixada"); editar/fixar/excluir só aparecem quando `author_id === profile.id` (a mesma regra da policy de UPDATE/DELETE do banco). "Descartar as alterações não salvas?" só aparece quando o rascunho difere do texto salvo. O UPDATE pede a linha de volta (`update(...).eq(...).select('id')`) e, se voltar vazia (RLS não alcançou a nota), não mexe na tela e avisa.
- src/components/contacts/__tests__/ContactNotes.editarFixar.test.tsx (novo): prova a tela real com o cliente Supabase mockado — própria nota tem editar/fixar, nota do colega e usuário sem perfil não têm; Ctrl+Enter grava; Esc sem alteração fecha direto; Esc com alteração pede confirmação (Continuar editando × Descartar); fixar grava `is_pinned:true`, sobe ao topo, destaca e vira `aria-pressed=true`; desafixar grava `false` e some o destaque; UPDATE com zero linhas (nota de outro autor) mantém o texto e mostra erro.
- src/components/contacts/__tests__/ContactNotes.excluirNota.test.tsx (ajuste): a nota própria agora tem 3 botões (editar + fixar + excluir) em vez de 1; a asserção passou a conferir os 3 e a buscar o botão por `name: 'Excluir nota'` (o teste de segurança — nota do colega não tem botão nenhum — segue igual).

Contexto: a FAIXA do pai (t_4092de45) foi trazida por cherry-pick para esta branch antes do trabalho (migration `is_pinned`, hook `useContactNotes` com `editNote`/`togglePin`, `contact.service.ts`), como o cartão pede.

## Prova
- vermelho antes: `npx vitest run src/components/contacts/__tests__/ContactNotes.editarFixar.test.tsx` com o ContactNotes da base (sem a minha mudança) → `Test Files 1 failed (1); Tests 7 failed | 1 passed (8)` (nenhum `Editar nota`/`Fixar nota` existia).
- verde depois: `npx vitest run src/components/contacts/__tests__/ContactNotes.editarFixar.test.tsx src/components/contacts/__tests__/ContactNotes.excluirNota.test.tsx` → `Test Files 2 passed (2); Tests 13 passed (13)`.
- regressão da área: `npx vitest run src/components/contacts src/hooks/crm/useContactNotes.pinned.test.tsx src/hooks/__tests__/useContactNotes.test.tsx src/hooks/crm/useContactNotes.error-pagination.test.tsx` → `Test Files 40 passed (40); Tests 292 passed (292)`.
- `npx eslint` nos arquivos tocados: `0 errors` (o warning `@/integrations/supabase/client` já existia no arquivo — import pré-existente, não adicionei ocorrência nova).

Estados da tela: carregando (esqueleto), vazio ("Nenhuma nota ainda"), salvando (spinner no botão Salvar / fixar) e erro (toast com "A nota é de outro autor ou já não existe", sem mexer na lista) — todos conferidos nos testes acima. Movimento: os spinners novos usam `motion-safe:animate-spin` (respeita reduzir movimento).

## O que NÃO fiz e por quê
- NotesTab.tsx (aba Notas do inbox): o cartão o cita como lugar sem editar/fixar, mas o título é "na ficha do contato" e a ficha é o ContactNotes.tsx. O NotesTab é outra superfície (notas por categoria: privadas/fatos/objeções/promessas) e o mecanismo de editar em linha + fixar dentro de cada categoria com uma ordem própria seria outra entrega; o hook já expõe `editNote`/`togglePin`, então a aba pode receber isso num cartão próprio.
- Nenhum SQL/policy: `is_pinned`, índice parcial e as policies UPDATE/DELETE vieram da faixa do pai (worker sql / hugo); a tela só consome.
- Sem exportar/importar/edição em massa, sem cor nova (tokens existentes: `primary`, `muted`, `border`, `foreground`).
