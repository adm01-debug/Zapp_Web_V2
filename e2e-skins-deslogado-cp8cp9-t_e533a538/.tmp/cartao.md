Task t_8677da24: [retomar] test(e2e): cobre fidelidade das 19 skins e os 14 checks da tela de temas (CP8/CP9) — E81 no empilhamento
  status:    running
  assignee:  vera
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_8677da24
  max-retries: 2 (default)
  created:   2026-10-13 19:47 by claude
  started:   2026-10-13 20:01

Body:
RETOMAR (entrega parada na fila do integrador, resgatada em 13/10). Esta entrega NÃO entrou e o trabalho não pode se perder.

SITUAÇÃO: estado 'falhou', junta limpo hoje com dia/2026-10-13.
MOTIVO REGISTRADO: teste que o CI do GitHub roda passou a FALHAR com este cartão: guarda: scripts/ci/implicit-any-ratchet.mjs; — rode: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 <arquivo>

O QUE FAZER: a entrega anterior falhou na verificação: reproduza com `zapp-verify full .`, corrija e feche de novo. Antes de mexer, confira no código ATUAL se o defeito do pedido ainda existe; se já foi corrigido, escreva isso em .tmp/relato.md com a prova e feche sem commit de código.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/refazer-e2e-skins-espelho-ci-2610131513219a` (commit 32662794c) no repositório; no workspace novo traga os commits com `git cherry-pick` e ajuste só o necessário.

PEDIDO ORIGINAL:
· achado pelo limpador da fila (11/10) ·

PROBLEMA
A entrega de t_2fc9a065 (fid 261013044808d4, commit b04379e68) quebra o ESPELHO DO CI quando empilhada sobre dia/2026-10-13 junto com os outros cartões prontos. Foi o único culpado deste o ESPELHO DO CI na bissecção (posição 85 da pilha).
Arquivo de teste: node: E81: projeto deslogado nao declara retries nenhum
Erro:
  node: E81: projeto deslogado nao declara retries nenhum

O QUE FAZER
1. Partir do commit da entrega (b04379e68, branch da entrega) com git cherry-pick — não recomeçar.
2. Reproduzir sobre a ponta atual de dia/2026-10-13 (bash ~/arquitetura-v2/integrador/ci_espelho.sh . (item: node: E81: projeto deslogado nao declara retries nenhum)), corrigir a causa (código ou teste que a própria entrega deixou desalinhado) sem afrouxar nenhuma asserção.
3. Provar: o mesmo comando VERDE e `zapp-verify . --rapido` verde. Fechar citando o sha.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo como resolveu o motivo acima. REGRAS: nenhuma informação sai do sistema; só cores/tokens existentes; sem DDL/Edge/dependência nova salvo se o pedido original exigia.

Comments (4):
  [2026-10-13 19:49] default: [jev-entrada] rota=complexo (conf 0.35 → humano, p_humano=0.12), faixa=testes, injeção=0.33, ação externa=0.15 → RETIDO (decisão do dono; Jev inseguro)
  [2026-10-13 19:49] default: [revisor-entrada] [jev-entrada] claude liberou → worker: Trabalho restrito ao repositório local: corrigir um teste e2e de skins/temas que quebra o espelho do CI (E81, retries do projeto deslogado), sem tocar no ferramental da fábrica, sem segredos reais e sem ação externa.
  [2026-10-13 20:40] vera: worker (ci) — retomada do empilhamento das skins (E81).

Estado: cherry-pick da branch v2/refazer-e2e-skins-espelho-ci-2610131513219a feito no workspace novo (3 commits: 0611bf5ea4 spec skins, 9165c37704 adaptação aos recursos do dia, 8194eeaa8f fix E81) + 8194eeaa8f é o que tira o `retries: 1` do projeto deslogado `chromium-skins`.

Prova: `node --test scripts/ci/playwright-config-e81.unit.mjs` fica vermelho ("✖ E81: projeto deslogado nao declara retries nenhum") com o config pré-fix (9165c37704) e verde (6/6) com o HEAD.

Sobre o MOTIVO REGISTRADO (guarda implicit-any-ratchet): não é dívida deste cartão. O ratchet roda `tsc -p tsconfig.app.json`, cujo `include` é só `["src"]`, e o diff deste cartão toca apenas `e2e/skins-e2e.spec.ts` e `playwright.config.ts` (`git diff --stat <dia> HEAD -- src` = vazio). Hoje o tsc está sendo morto pelo supervisor de memória (`exit null` / `Killed` 137; 47Gi total, 43Gi usados, swap 8Gi/8Gi) — falha operacional da máquina saturada, não linha nova de implicit-any.

Convenção da primeira linha do relato deste cartão: EXATAMENTE Especialista: worker (ci).
  [2026-10-13 20:42] vera: Nota operacional (ferramenta da fábrica): `hermes-tarefa-fechar` (versão 19:07 de hoje) morre em silêncio na extração da 1ª linha do relato. Ele roda `grep -oE 'EXATAMENTE .Especialista: [a-z]+' .tmp/cartao.md` sob `set -euo pipefail`; o `.` (sem `*`) exige DOIS caracteres entre "EXATAMENTE" e "Especialista", então a frase natural "EXATAMENTE Especialista: worker" não casa, o grep sai 1 e o script termina com RC=1 sem mensagem. Reprodução: `printf 'EXATAMENTE Especialista: worker\n' | grep -oE 'EXATAMENTE .Especialista: [a-z]+'` → nada; com dois espaços → casa. O provável é que a intenção fosse `EXATAMENTE .*Especialista:`. Não mexi na ferramenta (fica em ~/.local/bin, do dono); contornei pondo a frase no formato que ela espera.

Formato que o fechar lê: EXATAMENTE  Especialista: worker (ci).

Events (50):
  [2026-10-13 20:24] [run 16162] heartbeat
  [2026-10-13 20:25] [run 16162] heartbeat
  [2026-10-13 20:26] [run 16162] heartbeat
  [2026-10-13 20:27] [run 16162] heartbeat
  [2026-10-13 20:28] [run 16162] heartbeat
  [2026-10-13 20:30] [run 16162] heartbeat
  [2026-10-13 20:31] [run 16162] heartbeat
  [2026-10-13 20:32] [run 16162] heartbeat
  [2026-10-13 20:33] [run 16162] heartbeat
  [2026-10-13 20:34] [run 16162] heartbeat
  [2026-10-13 20:35] [run 16162] heartbeat
  [2026-10-13 20:36] [run 16162] heartbeat
  [2026-10-13 20:37] [run 16162] heartbeat
  [2026-10-13 20:38] [run 16162] heartbeat
  [2026-10-13 20:39] [run 16162] heartbeat
  [2026-10-13 20:40] [run 16162] heartbeat
  [2026-10-13 20:40] commented {'author': 'vera', 'len': 1104}
  [2026-10-13 20:41] [run 16162] heartbeat
  [2026-10-13 20:42] [run 16162] heartbeat
  [2026-10-13 20:42] commented {'author': 'vera', 'len': 803}

Runs (1):
  #16162 running      @vera  active  2026-10-13 20:01
