Especialista: iris

## O que mudou e por quê
- src/pages/SSOCallback.tsx (`getUrlError`): ordem de resolução vira traduzir
  `error_code`, depois `error`, depois `error_description`; sem tradução conhecida,
  cai na `error_description` (ou no `error`) sanitizada; só com um código
  desconhecido sozinho cai no texto genérico — código desconhecido nunca aparece
  cru. Motivo: ponto 1 da recusa (regressão visível com `unexpected_failure`).
- src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx: 4 testes novos
  renderizando a TELA real — `error_code=server_error` traduzido; código
  desconhecido + descrição mostra a descrição sanitizada; cenário da recusa
  (`error=server_error` + code desconhecido) mostra a tradução do `error`;
  código desconhecido sozinho mostra o genérico. Motivo: ponto 2 da recusa.

## Prova
- vermelho antes (só os testes novos, código sem a correção):
  `npx vitest run src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx`
  → `Test Files 1 failed (1); Tests 3 failed | 12 passed (15)`
- verde depois (com a correção):
  `npx vitest run src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx`
  → `Test Files 1 passed (1); Tests 15 passed (15)`

## Pontos do revisor
- Ponto 1: resolvido — src/pages/SSOCallback.tsx (`getUrlError`): tenta traduzir
  `error_code`, depois `error`, depois `error_description`; fallback é a descrição
  (ou o `error`) sanitizada e só então o GENERIC_ERROR; código desconhecido
  sozinho retorna o genérico em vez do código cru. Prova: os 3 testes novos do
  bloco `error_code desconhecido nunca aparece cru (t_0ffae93f)` falham sem a
  correção e passam com ela.
- Ponto 2: resolvido — testes novos em
  src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx: descrição sanitizada
  com code desconhecido, genérico sem descrição, `error_code=server_error`
  traduzido, mais o cenário exato da recusa. Prova: mesma execução acima.

## O que NÃO fiz e por quê
- Tradução, redirecionamento único, limpeza de timers e role/main da entrega
  anterior: mantidos sem tocar (a recusa diz que estão corretos e provados).
- Workspace: trabalhei na branch do cartão
  (`v2/sso-callback-ptbr-2610140725f4b9`, base 338a420d1e + commit f8f1945547
  deste cartão, sem commit alheio) porque o `hermes-tarefa-iniciar` está
  congelado e a guarda bloqueia `git worktree add`; nada foi trazido de outro
  cartão. Arquivos no diff contra a base: só os 3 listados abaixo.

## Arquivos (`git diff --name-only 338a420d1e...HEAD`)
- .tmp/relato.md
- src/pages/SSOCallback.tsx
- src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx
