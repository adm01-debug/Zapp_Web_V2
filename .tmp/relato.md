Especialista: Hugo (area-front-hooks)

# Menções de nota interna: colega ativo encontrável, selo com o nome completo

## O que mudou e por quê
- `src/hooks/inbox/useMentionableProfiles.ts` (novo): a lista de mencionáveis agora
  busca no servidor (`ilike` no `name`), ordenada (`name`, desempate `id`), limitada a
  20 linhas por consulta e com debounce de 250 ms — era `select(...).limit(20)` sem
  ordem e sem filtro, com o termo aplicado no cliente, então do 21º colega ativo para
  cima ninguém aparecia para ser marcado (a linha nem chegava ao navegador). Traz
  também `useMentionableProfileNames`, que lê TODOS os nomes ativos de forma paginada
  por `id` (nunca uma amostra), para o selo das notas.
- `src/components/inbox/collaboration/mentionText.ts` (novo): `splitMentionText` separa o texto da nota marcando
  como selo a menção a um nome conhecido. Antes o selo saía de `/(@\w+)/g`, que não
  cobre espaço: `@Ana Maria` virava selo só de `@Ana`. O reconhecimento é ancorado na
  lista de nomes ativos (com o nome mais longo vencendo e fronteira de palavra), então
  cobre nome composto e partícula minúscula (`@Ana da Silva`).
- `src/components/inbox/collaboration/MentionInput.tsx`: passa a usar
  `useMentionableProfiles` (fim do `useQuery` local) e deixa de filtrar no cliente — o
  filtro é do servidor. A menção gravada continua no formato do sistema: `@` + nome do
  perfil + espaço (`onChange(value.slice(0, lastAtIndex) + `@${agent.name} `)`).
- `src/components/inbox/collaboration/InternalNotesPanel.tsx`: o selo de cada nota
  passa a ser montado com `splitMentionText` + os nomes ativos, em vez da regex.

## Prova
- defeito (selo), antes, com a regex antiga: `node -e "'@Ana Maria veja'.split(/(@\w+)/g)"` → `["","@Ana"," Maria veja"]` (só `@Ana` viraria selo).
- vermelho antes (módulos ainda inexistentes, testes presentes): `npx vitest run src/hooks/inbox/__tests__/useMentionableProfiles.test.tsx` → `Failed to resolve import "../useMentionableProfiles" ... Test Files 2 failed (2)`.
- verde depois: `npx vitest run src/components/inbox/collaboration/__tests__/mentionText.test.ts src/hooks/inbox/__tests__/useMentionableProfiles.test.tsx` → `Test Files 2 passed (2); Tests 15 passed (15)`.
- sem regressão no consumidor: `npx vitest run src/components/inbox/collaboration/__tests__/MentionInput.a11y.test.tsx` → `Test Files 1 passed (1); Tests 2 passed (2)`.
- os três juntos após mover o parser para junto do compositor: `Test Files 3 passed (3); Tests 17 passed (17)`.
- tipos: `npx tsc -p tsconfig.app.json --noEmit` → nenhum erro nos arquivos tocados.

## Arquivos: onde cada peça ficou (dentro do que o cartão lista)
Todos os arquivos tocados estão em `src/hooks/` (mencionáveis) e `src/components/inbox/collaboration/`
(MentionInput, InternalNotesPanel, o parser puro `mentionText.ts` e os testes). O parser puro
nasceu em `src/lib/` e foi movido para junto do compositor: ele é detalhe do selo da nota, não
utilidade geral, e assim o diff fica só no par componente+hook da menção.

## Item 3 do cartão (aviso ao marcado): canal inexistente — registrado e proposto, como o cartão manda
- O cartão diz: "se não houver canal, registre e proponha em uma linha no relato, sem
  criar tabela". Não há canal no cliente: a tabela `notifications` tem a policy
  `Block authenticated notification inserts` (`WITH CHECK (false)`,
  `supabase/migrations/20260404174629_...sql`) — insert autenticado é proibido, só
  escrita server-side — e não há trigger em `contact_notes` que gere notificação de
  menção. Então registrei aqui e proponho: tratar numa trilha de banco (função/trigger
  em `contact_notes`), que é do worker (sql), em cartão próprio. Sem tabela nova, sem
  Edge.

## O que NÃO fiz e por quê
- Não toquei no compositor do chat (`components/inbox/chat/MentionAutocomplete.tsx`) nem
  em `get_team_profiles` — são o PO1/PD-86, cartões que mexem no mesmo assunto em outro
  componente (o chat), fora do meu diff.
- Não mexi em quem pode ser mencionado (o próprio usuário continua aparecendo, como
  antes): não está no critério do cartão.
- Não criei notificação de menção (item 3, acima).
