Especialista: hugo

## O que mudou e por quê
- src/hooks/chat/useNewConversation.ts:
  - Normalizo o telefone digitado com `normalizeE164BR` e RECUSO número inválido com toast "Número de telefone inválido" (antes ia direto para o insert) — item "valida o número" do cartão.
  - A busca de contato existente deixou de ser `.eq('phone', <digitos>)` e passou a consultar TODAS as grafias da mesma linha via `phoneQueryVariants(e164)` num `.or('phone.eq....')` com `.order('id').limit(20)` + `pickUniquePhoneMatch`. Assim um contato já salvo sem o nono dígito (ou com prefixo 55) não gera duplicata — item "aceita as variantes" do cartão.
  - A chamada `batch-fetch-avatars` deixou de ser aguardada: virou `refreshAvatarsInBackground()` (segundo plano, erro ignorado de propósito, melhor esforço). O envio e o fechamento do modal não esperam avatar — item "não aguarde avatar" do cartão.
  - Falha do envio depois de criar o contato: em vez do "Erro ao enviar mensagem" genérico, o aviso diz `Contato "<nome>" criado, mas a mensagem não foi enviada.` — o contato criado não fica órfão em silêncio.
  - O telefone gravado continua em dígitos locais (DDD + assinante), a mesma forma que o código já usava (`e164.slice(3)`), preservando os chamadores que procuram por essa forma (ex.: `useWhatsAppStatus`, que cai em `normalizeDigits`).
- src/hooks/chat/__tests__/useNewConversation.test.tsx: 3 cenários novos (variante sem o nono dígito já existente ⇒ sem insert; número inválido ⇒ sem insert; falha do envio ⇒ aviso do contato criado) e o mock passou a registrar o filtro `.or(...)` da busca por variantes.

## Prova
- vermelho antes (`git checkout dia/2026-10-13 -- src/hooks/chat/useNewConversation.ts`): `npx vitest run src/hooks/chat/__tests__/useNewConversation.test.tsx` → `Test Files 1 failed (1); Tests 5 failed (5)` (ex.: `expect(mocks.insertPayloads).toHaveLength(1)` recebeu 0).
- verde depois (hook novo restaurado com `git checkout HEAD -- ...`): mesmo comando → `Test Files 1 passed (1); Tests 5 passed (5)`.

## Verificação executada (neste refazer, sem mexer no código)
- `npx vitest run src/hooks/chat/__tests__/useNewConversation.test.tsx` → `Test Files 1 passed (1); Tests 5 passed (5)` (Duration 1.91s).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (13s)` (db_guard OK, tipos OK, lint OK, migrations OK; banco_local NÃO VERIFICADO — sem nome de conjunto, esperado para cartão sem migration).
- Arquivos de teste deste cartão:
  - src/hooks/chat/__tests__/useNewConversation.test.tsx

## Pontos da recusa ([refazer 1])
- Ponto 1: primeira linha agora é exatamente `Especialista: hugo` (antes: `Especialista: Hugo (area-front-hooks)`).
- Ponto 2: seção "Verificação executada" acima, com comando, linha de resultado e lista explícita dos arquivos de teste; nenhum arquivo de código foi alterado neste refazer.

## Conclusão
- Concluí os 3 itens do CRITÉRIO DE PRONTO (variações do 9º dígito, envio sem esperar avatar, teste que prova), com o teste rodado nos dois estados.

## Fora do escopo deste cartão (registrado no cartão)
- O item "teste de agente comum vendo o contato recém-criado" depende de banco local com papel `agent` e de RLS/atribuição (migration) — não é da área de front nem destes arquivos. Registrei o achado em `kanban_comment` neste cartão (arquivo + linha do gatilho e da policy) para virar cartão do worker (sql).
