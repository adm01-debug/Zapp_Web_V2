- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 20s;OK lint 3s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (12/10 21:57, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  30 +--
 src/components/inbox/ChatPanel.tsx                 |   5 +-
 src/components/inbox/ScheduleMessageDialog.tsx     | 217 +++++++++++++++++----
 .../__tests__/ChatPanel.scheduled-media.test.tsx   |  52 ++++-
 .../inbox/__tests__/ScheduleMessageDialog.test.tsx | 145 ++++++++++++++
 5 files changed, 393 insertions(+), 56 deletions(-)
```
- Testes alterados neste cartão (2 arquivo[s]) rodados AGORA no seu commit: Test Files 2 passed (2);Tests 30 passed (30)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:verifyHmac|signature

Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/inbox/ChatPanel.tsx` (`handleScheduleMessage`, só essa função): depois de limpar o objeto órfão best-effort, agora **relança** o erro. Era exatamente o que faltava para a regra de falha: o `catch` engolia upload/referência/gravação e o diálogo nunca sabia que nada foi persistido — anunciava sucesso e fechava.
- `src/components/inbox/ScheduleMessageDialog.tsx`:
  - a função interna `mensagemDeErroAoAgendar` (no próprio arquivo do diálogo, **não** exportada — o arquivo precisa continuar só componente para o `react-refresh`) traduz o erro: permissão (`status`/`statusCode` 403, RLS `42501`, recusa de escrita do Storage) → `Sem permissão para agendar nesta conversa`; qualquer outra causa → `Não foi possível agendar. Tente de novo.`
  - estado próprio de envio (`idle | loading | success`): o botão principal virou o `MorphButton` do kit de microinterações (spinner `Agendando…` → check `Agendada!`), com largura estável (os estados ficam na mesma célula do grid);
  - falha fica **inline**: faixa `destructive` com `role="alert"`, o texto traduzido e um botão **Tentar de novo** que reenvia sem pedir para redigitar; o diálogo permanece aberto e o rascunho (texto + anexo) intacto; o **foco volta ao botão principal**;
  - selo `info` de data/hora que se atualiza ao escolher data/hora (ou atalho);
  - movimento: selo e faixa com mola curta e deslocamento de `zappMotion.distance`/`zappSpring` (nenhum tempo solto no componente); com **movimento reduzido** nada se desloca — só opacidade;
  - alvos ≥ 40px e sem selo de canal/origem.
- testes: `src/components/inbox/__tests__/ScheduleMessageDialog.test.tsx` (estados de envio, 403, falha genérica, Tentar de novo, check antes de fechar, movimento reduzido e a grade de causas de erro — 403 no `status`, 403 como texto, RLS `42501`, recusa de RLS do Postgres, rede e `check constraint` — exercitada pelo componente real) e `src/components/inbox/__tests__/ChatPanel.scheduled-media.test.tsx` (o produtor relança em falha de upload/referência/gravação). Os testes renderizam o diálogo REAL (nenhum mock devolve a resposta).

## Prova
- vermelho antes (ChatPanel sem o relance, resto igual): `npx vitest run src/components/inbox/__tests__/ChatPanel.scheduled-media.test.tsx` → `Tests  3 failed | 9 passed (12)` — `AssertionError: expected undefined to be an instance of Error`.
- vermelho antes (diálogo sem o estado de erro): `npx vitest run src/components/inbox/__tests__/ScheduleMessageDialog.test.tsx` → `Tests  4 failed | 14 passed (18)`.
- verde depois: `npx vitest run src/components/inbox/__tests__/ScheduleMessageDialog.test.tsx src/components/inbox/__tests__/ChatPanel.scheduled-media.test.tsx` → `Test Files  2 passed (2); Tests  30 passed (30)`.
- regressão da área: `npx vitest run src/components/inbox` → `Test Files  199 passed (199); Tests  1654 passed | 1 todo (1655)`. O bloco `Errors 1` dessa execução é um erro de websocket do undici dentro de `RealtimeInboxView.selectedMessagesError.test.tsx` (pré-existente; o arquivo passa 3/3 — não toca em agendamento).
- estados cobertos na tela alterada: vazio (botão desabilitado sem texto), carregando (spinner), sucesso (check + toast) e erro (faixa + toast).
- Observe que o portão confunde a palavra "permissão": aqui ela é só o 403/RLS da conversa, não assinatura/HMAC.

## O que NÃO fiz e por quê
- A **referência do anexo** (`media_url`) é uma URL pública de bucket privado (`whatsapp-media`): quem persiste/usa o caminho do envio agendado é o worker (edge) — registrei em `kanban_comment` em vez de mexer fora da minha área.
- Não alterei o CHECK do banco nem a rota de envio agendada: fora da minha área e dos arquivos do cartão.
