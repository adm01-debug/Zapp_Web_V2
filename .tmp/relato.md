Especialista: worker (testes) (area-testes-do-produto)

# [retomar] test(e2e): garante zoom 200 no reflow email navy

## O que mudou e por quê
- Nenhum commit de código: o defeito do pedido JA ESTA CORRIGIDO na base `dia/2026-10-12`.
  `git log -S "document.documentElement.style.fontSize)).toBe('200%')" -- e2e/email-navy-visual.spec.ts`
  aponta o commit `8147bebe1 test(e2e): zoom garantido no reflow 200% do email-navy`, que traz exatamente
  o conteudo do trabalho anterior (`2ef976f99`, branch `v2/corrigir-reflow-200-email-navy-2610090910409f`):
  zoom aplicado DEPOIS do boot (`abrirEmail`) e a guarda `expect(documentElement.style.fontSize).toBe('200%')`
  antes de medir o overflow. Trazer o antigo por cherry-pick seria duplicar a garantia e entrar em conflito
  de novo; o cartao manda fechar sem commit quando o pedido ja esta resolvido. Fecho sem commit de codigo.
- `src/components/email/*` nao foi tocado: nenhuma causa de reflow/visibilidade em aberto no codigo atual
  (a medicao `scrollWidth - clientWidth <= 2` passa com o zoom em 200%).

## Prova
- Criterio 1 (reproduzir a falha ou registrar que nao reproduz): NAO REPRODUZIU no ambiente local limpo.
  - isolada: `bunx playwright test e2e/email-navy-visual.spec.ts --project=chromium-email-navy -g "reflow equivalente"`
    -> `1 passed (16.3s)` (teste do reflow em 13.8s).
  - bateria completa (rodada A): `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5199 bunx playwright test e2e/email-navy-visual.spec.ts --project=chromium-email-navy --workers=2 --reporter=list`
    -> `29 passed`, `2 failed`; o reflow passou; as 2 falhas foram de BOOT (linha 112 e linha 142,
    `abrirEmail` estourando 60s esperando a primeira conversa), com carga do host ~21.
  - bateria completa (rodada B, log em `.tmp/e2e-full-run2.log`):
    `✓ 16 [chromium-email-navy] › e2e/email-navy-visual.spec.ts:416:1 › reflow equivalente a zoom de 200% mantém ações essenciais acessíveis (6.8s)`
    e `31 passed (2.4m)` -> suite VERDE, sem failed, sem skipped.
  - Os 2 testes que falharam na rodada A passam isolados:
    `2 passed (20.2s)` (`não introduz violações axe` 16.7s; `rota real renderiza lista...` 17.9s) -> instabilidade
    de boot sob carga (armadilha 6), nao o reflow; registrado em comentario no cartao, sem afrouxar timeout.
- Criterio 2 (causa do reflow, sem afrouxar a assercao de overflow): a assercao principal segue intacta —
  `expect(overflow).toBeLessThanOrEqual(2)` na linha 432, com a guarda de zoom na 430. Prova de que a guarda
  que ja esta na base e a que sustenta a medicao: mutei o cenario (zoom para `100%`, como se um reload
  repusesse o app) -> `1 failed`, `Expected: "200%" / Received: "100%"` (`.tmp/mutacao-vermelho.log`);
  restaurei a linha do zoom -> verde. Sem a guarda, o overflow mediria uma tela SEM 200% e passaria em falso.
- Criterio 3 (PNG): a execucao regrava os PNGs de referencia (`page.screenshot` nas linhas 119, 126, 139,
  235, 283, 548); a bateria verde deixou 16 PNGs em `e2e/email-navy-visual/` com bytes diferentes.
  Restaurei com `git restore --source=HEAD -- e2e/email-navy-visual` e o `git status --short` final esta VAZIO
  -> nenhum PNG modificado entra na entrega.
- Criterio 5 (escopo): `git diff -- e2e/email-navy-visual.spec.ts src/components/email/EmailChatInbox.tsx
  src/components/email/EmailChatThread.tsx src/components/email/EmailContactPanel.tsx` -> vazio;
  `git diff --stat dia/2026-10-12` -> vazio (branch identica a ponta do dia).

## O que NAO fiz e por quê
- Nao commitei codigo: o pedido ja esta resolvido na base e o cartao manda fechar sem commit nesse caso.
- Nao implementei "estabilizacao" de boot nem mexi em `browser.newContext`/timeouts de assercao: as 2 falhas
  da rodada A sao de boot sob carga, passam isoladas e ficam registradas como achado (fora da causa do reflow).
- Nao trouxe codigo de outro cartao (`git log --oneline dia/2026-10-12..HEAD` sem commits meus).
