## O que mudou e por quê

- `src/components/talkx/__tests__/RuleValueInput.test.tsx`: acrescenta um `afterEach(() => window.history.replaceState(null, '', '/'))` — motivo: o construtor de segmentos do Talk X vive no endereço (X111, `?view=talkx&tab=segments&mode=new`) e o `window.location` do jsdom é COMPARTILHADO por todos os testes do arquivo. O teste "número \"em breve\" (lead_score)" abre o construtor e não publica nem cancela; ele deixa `mode=new` no endereço. O `renderView()` do teste seguinte já monta DENTRO do construtor (a tela abre direto no editor: "Nome do segmento…", Cancelar, Publicar) e o botão "Novo segmento" nunca entra na DOM — o `findByRole` estoura o teto de 5 s (`asyncUtilTimeout` do `src/test/setup.ts`) com "Unable to find role=button name 'Novo segmento'". Limpar a rota em `afterEach` devolve a biblioteca como estado inicial. Mesmo idioma dos 4 irmãos do módulo (route/groups/builder/detailFresh), que já fazem isso e são os únicos a resetar; esta prova era a única sem o reset. Nenhuma asserção foi tocada: o que o teste prova (Lead score e Risco de churn visíveis, "(em breve)", desabilitados, `draggable="false"` e sem condição adicionada) continua igual.

## Por que NÃO é tempo (a causa que o cartão supunha)

O render é síncrono: o botão aparece junto com a montagem, não depois. O teste é instável por ORDEM, não por relógio:
- sozinho (`-t "ficam desabilitados no catálogo"`): passa;
- depois do teste de lead_score (`-t "em breve"`): falha sempre em ~5 s;
- arquivo inteiro: falha sempre.
Subir `findByRole(..., { timeout: 15000 })` não resolveria: o botão não existe na DOM por causa da rota suja, então esperar mais só atrasaria o vermelho.

## Prova

- vermelho antes (base 96dd72dc5, sem a mudança): `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` → `Test Files 1 failed (1); Tests 1 failed | 4 passed (5)` e `-t "em breve"` → `Unable to find role="button" and name "Novo segmento"` (o DOM colhido mostra o editor aberto).
- verde depois: `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` → `Test Files 1 passed (1); Tests 5 passed (5)`, 3 execuções seguidas; e a ordem que falhava `-t "em breve"` → `Tests 2 passed | 3 skipped`.

## Verificação completa

- `zapp-verify . --rapido` roda no `hermes-tarefa-fechar` (saída no log do fechar).

## Outros testes com o mesmo risco (item 4 do cartão)

Varri `src/components/talkx/__tests__/` atrás de prova que monta `TalkXSegments` e clica "Novo segmento":
`TalkXSegments.route.test.tsx`, `.groups.test.tsx`, `.builder.test.tsx`, `.detailFresh.test.tsx` — TODOS já resetam a rota em `afterEach` (`window.history.replaceState(null, '', '/')`, um por arquivo). `RuleValueInput.test.tsx` era o único sem o reset. Nada a corrigir nos irmãos (não é "1 linha nova", já existe).

## O que NÃO fiz e por quê

- Não aumentei timeout de `findByRole`/`it`: não corrige a causa (rota suja) e o cartão proíbe afrouxar; a asserção segue idêntica.
- Não toquei em `src/test/setup.ts` (teto global `asyncUtilTimeout`) nem em outro arquivo: fora do escopo do cartão.
- Não mudei o código de produção (`TalkXSegments.tsx`/`talkxSegmentsRoute.ts`): o comportamento é correto (o construtor abrir pela URL é a feature X111); o defeito era só a prova não isolar o estado.
