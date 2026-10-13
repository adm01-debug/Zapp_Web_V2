Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- `src/hooks/inbox/__tests__/useContactQuickActions.test.tsx` (único arquivo do meu commit): o arquivo deixou de
  citar `tags` de contato — a fixture `makeContact` não declara mais marcador/etiqueta e nenhuma asserção depende
  deles. O teste passou a provar três coisas que o cartão pede:
  (a) o hook expõe SÓ `block` (`Object.keys(result.current) === ['block']`, sem VIP e sem addTag/removeTag/markVip);
  (b) bloquear e o Desfazer vão para a Evolution de verdade (`update-block-status`, status `block`/`unblock`,
  instância resolvida pelo fluxo real contacts.whatsapp_connection_id → whatsapp_connections.instance_id) e NÃO
  gravam nada em `contacts` — o `update` do cliente é espionado e fica provado que nunca é chamado em caminho
  nenhum (sucesso, Desfazer, sem-conexão resolvível, erro da edge e dois cliques concorrentes);
  (c) nenhum texto de etiqueta/marcador (`VIP`, `Bloqueado`, `etiqueta`) sai nos avisos — o aviso é
  "Maria Silva bloqueado" com Desfazer.
- Nenhum teste foi removido, pulado nem teve timeout aumentado; a cobertura virou assertions mais fortes (de 6 para
  7 casos), não menos.

## GAP registrado (passo 4 do cartão)
O reconhecimento (card t_e71f3ba9) diz que `is_vip`/`blocked_at` NÃO existem no schema e este cartão proíbe
migration. Logo, a coluna dedicada do passo 2(a)/(b) não existe para ser testada: cobri a AUSÊNCIA da escrita em
etiquetas (`update` nunca chamado) e a ausência da ação de VIP. O selo VIP que ainda aparece no cabeçalho é legado
(derivado no `ContactHeaderSection`), tratado no cartão TG-A — fora daqui.

## FAIXA DO PAI
Esta branch foi cortada em cima da branch do cartão pai, que a `dia/2026-10-13` local ainda não tinha recebido:
- `ab6a87cacf` `refactor(inbox): useContactQuickActions não grava mais etiquetas de contato` — do cartão t_7aaefc5d
- `bf7bc41027` `docs(inbox): alinha comentários do useContactQuickActions ao código real` — do cartão t_7aaefc5d
- `87713e252d`, `23ca893998` `docs(inbox): relato ...` — relato do cartão t_7aaefc5d
NÃO são deste cartão. Este cartão contribui UM commit, só de teste.

## Prova
- vermelho antes (com o hook anterior, que ainda usava etiquetas de contato): `
  git show dia/2026-10-13:src/hooks/inbox/useContactQuickActions.ts > src/hooks/inbox/useContactQuickActions.ts`
  + `npx vitest run src/hooks/inbox/__tests__/useContactQuickActions.test.tsx` → `Tests  4 failed | 3 passed (7)`.
- verde depois (restaurado o hook do cartão pai): mesmo comando → `Test Files  1 passed (1) | Tests  7 passed (7)`.
- `git grep -n "tags" -- src/hooks/inbox/__tests__/useContactQuickActions.test.tsx` → sem resultado (exit 1): o
  arquivo não cita etiquetas de contato.
