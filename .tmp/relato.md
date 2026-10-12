Especialista: worker (testes) (area-testes-do-produto)

## O que encontrei (nada a mudar no código)
- O defeito do pedido JÁ ESTÁ corrigido na ponta `dia/2026-10-12`. `e2e/navegacao-modulos.spec.ts` no HEAD é a versão nova, com as duas listas explícitas e curtas — `LACUNAS_DO_CONJUNTO_LOCAL` (linha 200) e `DEFEITOS_DE_PRODUTO` (linha 258) — e 5 `test.fixme` com o defeito reproduzido em contexto (`grep -c "test.fixme("` → 5).
- Zero curinga: `grep -c "caminho: '\*'"` → 0. Cada tolerância traz o caminho EXATO + status + assinatura de corpo medida; o que sai da assinatura reprova.
- O commit anterior do cartão (`21fd72295`, ramo `v2/t-e22be7df-2610080816ab2a`) é a versão ANTIGA do mesmo arquivo: o diff `21fd72295..HEAD` é -194 +57. Cherry-pickar aquele commit REGREDIRIA o arquivo (desfaz o login pelo usuário sintético do seed e a separação lacuna×defeito que já entraram na ponta em 3 commits posteriores). A resolução correta do conflito é ficar com a ponta.

## Prova (saída real, rodada agora)
- verde: `zapp-e2e-local "$PWD" amarra261012 e2e/navegacao-modulos.spec.ts --config=.tmp/pw.local.config.ts --grep "Guarda da varredura"` → `9 passed (3.1m)`, `RC=0`. O bloco de guarda é a prova da limpeza: endpoint fora da lista REPROVA mesmo com status conhecido; endpoint da lista com OUTRO status REPROVA; endpoint+status da lista e corpo FORA da assinatura REPROVA; trio medido vira lacuna do conjunto local; `>= 400` sem medida nenhuma REPROVA; `console.error` sem resposta justificada REPROVA; sombra de console da MESMA resposta medida e justificada é tolerada; par de tags aninhadas fora da lista REPROVA e o da lista vira defeito com `fixme`.
- NENHUM commit de código, como o cartão manda quando o defeito já foi corrigido: `git diff --stat` do arquivo do cartão → vazio. O único commit desta entrega é o do próprio relato (`docs(tarefas)`, em `.tmp/relato.md`, que é versionado neste repo e o `hermes-tarefa-fechar` exige árvore limpa).
- `git diff --stat 21fd72295 HEAD -- e2e/navegacao-modulos.spec.ts` → `1 file changed, 57 insertions(+), 194 deletions(-)` (a ponta é a versão mais nova e mais estreita).

## NÃO CONCLUÍ: a varredura completa (os 2 testes de navegação) não fechou nesta máquina
- Rodada 1 pelo projeto configurado: o `setup` morreu por corrida (a sessão até montou — sidebar no snapshot — mas o toast "Erro ao conectar ao servidor SIP" ganhou a corrida do locator) → `16 did not run`.
- Rodada 2 com config local do cartão (sem `setup`, login pela própria tela do spec): a limpeza EXECUTOU — `[AQUECIMENTO] 81 funções de ponta arrancaram sem BOOT_ERROR` e classificou `401 get-sip-password` e `500 gmail-oauth` como `[MEDIDA]` — mas o dev server foi morto por SIGTERM (`error: script "dev" exited with code 143`) sob load 33 com 7 processos do MESMO spec em cartões irmãos; o teste ficou preso no clique até o teto de 20 min e o segundo teste pegou `ERR_CONNECTION_REFUSED`.
- Isso é ambiente/contensão desta máquina, não defeito do arquivo: a limpeza (o objeto do cartão) rodou e foi medida; o que não fechou foi a varredura inteira de 40 módulos.
- hotspot: `e2e/navegacao-modulos.spec.ts` — vários cartões irmãos executam o mesmo spec em paralelo (load 33, 7 processos).

## O que NÃO fiz e por quê
- Não commitei nada (diff vazio) — o cartão manda fechar sem commit quando o defeito já está corrigido.
- Não toquei em `e2e/auth.setup.ts` nem em `playwright.config.ts` (fora dos ARQUIVOS QUE PODE TOCAR); a corrida do setup virou registro acima.
- `.tmp/pw.local.config.ts` e `.tmp/*.log` são temporários, fora do git.
