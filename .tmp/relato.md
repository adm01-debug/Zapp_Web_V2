Especialista: iris

## O que mudou e por quê

- `src/components/automations/automationConstants.ts`: saíram o gatilho `tag_added` de `TRIGGER_TYPES`, a ação `add_tag` de `ACTION_TYPES` e a chave `tag_id` de `ACTION_CONFIG_OWNERS` — o editor deixou de oferecer qualquer opção de tag. Entraram `OBSOLETE_AUTOMATION_LABEL` e `isObsoleteAutomation()`, que usam as MESMAS listas como fonte única do que a tela sabe oferecer: gatilho ou ação fora delas = registro antigo, reconhecido e marcado (nada é apagado).
- `src/components/automations/AutomationCard.tsx`: o item da lista passa a mostrar o rótulo `Obsoleta (tag removida)`, com estilo de inativo e o `Switch` `disabled` — não dá para reativar uma ação que não existe mais. O badge do gatilho/ação cai para o tipo cru quando não há rótulo, em vez de renderizar vazio. O registro continua na tela.
- `src/components/automations/AutomationsManager.tsx`: o filtro conta o registro obsoleto como inativo e o `handleToggle` sai ANTES de gravar (`if (isObsoleteAutomation(automation)) return;`) — a checagem vem antes da escrita, não depende do controle estar desabilitado.
- `src/components/automations/__tests__/AutomationEditorDialog.test.tsx`: os dois casos que usavam os tipos de tag foram reapontados para tipos vivos (`close_conversation`; e no #99 `send_message` → `assign_agent`, que ainda prova "chave dona do tipo antigo sai, chaves desconhecidas ficam"), com a MESMA força de asserção — nenhuma linha `expect` foi removida (só o título do `it` mudou).
- `src/components/automations/__tests__/automationConstants.test.ts` (novo): asserção sobre a LISTA EXATA de gatilhos e ações (não sobre "não contém X") + a detecção de registro obsoleto + o rótulo.
- `src/components/automations/__tests__/AutomationsManager.obsoleta.test.tsx` (novo): renderiza o `AutomationsManager` + `AutomationCard` REAIS, com a persistência do Supabase controlada pelo teste.

## Prova

- vermelho antes (com os 3 arquivos de origem na base `dia/2026-10-14`): `npx vitest run src/components/automations/__tests__` → `Test Files 2 failed | 2 passed (4); Tests 10 failed | 15 passed (25)` — `TypeError: isObsoleteAutomation is not a function` e `expected [ 'new_message', 'keyword', 'time_inactive', 'tag_added', 'business_hours' ] to equal [...]`.
- verde depois: `npx vitest run src/components/automations/__tests__ src/components/__tests__/CT70_reduzirMovimentoAutomacaoIa.test.tsx` → `Test Files 5 passed (5); Tests 39 passed (39)`.
- eslint nos 6 arquivos: sem saída (0 problemas).
- verificação do repositório: `zapp-verify . --rapido` → `OK db_guard`, `OK tipos` (134s), `OK lint`, `OK migrations`; `VERIFY: VERDE SEM BANCO (138s)`.
- busca do critério 3: `grep -rn -E "tag_added|add_tag|tag_id" src/components/automations` → rc=1 (nenhum acerto).

## Critério de pronto — item por item

1. Editor não oferece mais gatilho/ação de tag, e `tag_id` fora da constante: `automationConstants.ts:3-15` (listas) e `:20-24` (dono de chave); provado por `automationConstants.test.ts` (2 primeiros casos, lista exata).
2. Automações antigas aparecem marcadas e desativadas na lista, sem apagar o registro e sem quebrar a tela: `AutomationCard.tsx:33-34` (cálculo `obsolete`/`active`), `:52-53` (rótulo `Obsoleta (tag removida)`) e `:73-79` (Switch `disabled` + rótulo de acessibilidade); `AutomationsManager.tsx:26-30` (filtro) e `:35-38` (guarda antes de gravar); provado por `AutomationsManager.obsoleta.test.tsx` — registro obsoleto presente na lista com o rótulo, `aria-checked="false"` mesmo gravado como ativo, clique no switch não o liga, e `hoisted.deleteCalls` continua vazio (nenhum DELETE).
3. Testes verdes e nenhum teste existente afrouxado/pulado: `Test Files 5 passed (5); Tests 39 passed (39)`; o único `it(` removido do diff é o título do caso #99, substituído por um de igual força (nenhum `expect` saiu do diff).
4. `grep -rn -E "tag_added|add_tag|tag_id" src/components/automations` → rc=1, nenhum acerto.

## Decisões que o cartão não fixa (declaradas)

- Toquei `AutomationCard.tsx`, que não estava em "ARQUIVOS QUE PODE TOCAR": ele é o item da lista que desenha a automação, e sem ele o item 2 (marca + desabilitado) não existe. Tentei manter o resto fora.
- "Obsoleto" é derivado do tipo não constar das listas atuais (e não de uma lista de nomes removidos), para que o marcador não dependa de repetir os nomes retirados.
- `src/components/contacts/ContactActivityTimeline.tsx:17,35` também cita `tag_added`, mas ali é tipo de EVENTO de atividade de contato vindo do banco — outro assunto, fora deste cartão.

## O que NÃO fiz e por quê

- Nenhuma migration: a decisão não muda schema nem dado; os registros antigos ficam no banco como estão (nenhum DELETE/UPDATE em massa foi escrito no diff).
