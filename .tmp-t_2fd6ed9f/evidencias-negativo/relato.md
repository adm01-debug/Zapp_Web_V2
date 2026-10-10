Especialista: complexo (verificacao independente; sem skill de area propria aqui — abri verificar-antes-de-declarar-pronto, analisar-prova-dos-testes e conferir-entrega-do-devin)

VEREDITO: CONFIRMADO — o ajuste do `zapp-verify` NAO afrouxou a regra para drift NOVO. Num fixture
sintetico onde a migration do cartao introduz diferenca que nao existe no retrato canonico nem em
versao ja aplicada, o script ajustado devolve o MESMO veredito do de hoje: FALHOU no passo
`banco_local`, exit 1, com a diferenca ATRIBUIDA ao cartao (nomeada na mensagem). O ajuste so muda o
veredito quando a diferenca e' pre-existente (ja no retrato) — e so nesse caso.

O que medi (4 cenarios x 2 scripts, `saida/RESUMO.txt` e `saida/CLASSIFICACAO.txt`):

| cenario | HOJE (instalado 70c0b223) | NOVO (artefato c95e371a) | debitadas HOJE -> NOVO |
|---|---|---|---|
| neg: so drift do cartao | rc=1 FALHOU | rc=1 FALHOU (mensagem IDENTICA) | 4/6 -> 4/6 |
| ctrl: so drift pre-existente | rc=1 FALHOU | rc=0 AVISO (`VERIFY: VERDE`, "2 diferenca(s) NAO debitada(s)") | 2/2 -> 0/2 |
| misto: drift novo + pre-existente | rc=1 FALHOU (cita 6) | rc=1 FALHOU (cita SO as 4 do cartao) | 6/8 -> 4/8 |
| neg-sem-pendente (caminho estrito) | rc=1 FALHOU | rc=1 FALHOU | passo direto, igual |

Mensagem do cenario `neg` (identica nos dois): `diferenca nao explicada por migration pendente:
columns|cartao_dinamico.coluna_gerada; indexes|cartao_novo.cartao_novo_pkey; rls|cartao_novo (+1)`.
No `misto`, o NOVO cita `columns|cartao_dinamico.coluna_gerada; indexes|cartao_novo.cartao_novo_pkey;
rls|cartao_novo (+1)` e NAO cita as 2 linhas canonicas -> a atribuicao e' exatamente do cartao.

Como o fixture sustenta isso (`saida/PROVA-FIXTURE.txt`, contagem de ocorrencias): `cartao_novo`,
`cartao_dinamico`, `coluna_gerada`, `cartao_novo_pkey`, `service_role` = 0 no retrato canonico e 0
nas migrations JA APLICADAS; `cartao_novo` = 5 na unica migration PENDENTE; os nomes montados em
runtime (`cartao_dinamico`/`coluna_gerada`) = 0 em todo texto de migration. Logo ha DOIS tipos de
drift novo cobertos: (i) objeto citado pela pendente pelo dono (index auto-nomeado `cartao_novo_pkey`,
`rls`, grant) e (ii) objeto que a pendente NAO cita (nome montado por `execute format`) — nenhum dos
dois recebe a prova de drift antigo, e os dois seguem debitados.

Controle (pedido no passo 4): o `ctrl` mostra que o mesmo arranjo SABE ficar verde — 1 linha
"diferentes" (`functions|f:fn_antiga()`) e 1 "so producao" (`columns|clientes.antiga`), ambas com
chave no retrato canonico, viram drift (NAO debitadas) e o script sai 0/AVISO. Ou seja: falha
legitima x ruido se distinguem pela presenca da chave no retrato, nao por sorte do fixture.

Escopo respeitado: nenhum byte do `zapp-verify` foi escrito (instalado segue 70c0b223..., mtime
2026-10-05 08:26:15, `cmp` identico a `ENTREGA/zapp-verify.original`; artefato segue c95e371a...);
nenhum arquivo de aplicacao tocado — so o que criei em `.tmp/evidencias-negativo/`. Sem docker, sem
banco, sem rede, sem producao; o comparador de estrutura e' o codigo REAL extraido do `zapp-db-local`
(sha256 77546fc4..., igual ao que a tarefa-irma t_debaf8a8 mediu).

Limites honestos: (1) os colaboradores externos do portao (`zapp-db-guard`, `node`, `bun`,
`zapp-db-ler`, `zapp-db-local`) sao dublês — o `check` chama o comparador real, mas nao ha conjunto no
ar; a versao com conjunto VIVO e' a da t_debaf8a8 (mesmo veredito: FALHOU nos dois). (2) O fixture e'
sintetico de proposito (pedido do cartao); nao substitui o caso real. (3) Achado cosmetico de fora do
escopo, registrado em comentario no cartao pai: no ramo de AVISO o `DRIFT_N` engole as linhas
`drift: ...` do `MOTIVO` e a mensagem sai quebrada em duas linhas (o rc nao muda). (4) `rls|cartao_novo`
so e' debitada porque `explicada()` nao tem ramo para `rls` (item aberto t_1e66e3ee); aqui isso produz
o resultado desejado, mas por omissao, nao por prova.

Prova: `.tmp/evidencias-negativo/` com `FLUXO.md` (como reproduzir), `fixture/` (retrato, 2 migrations,
3 manifestos locais, 2 ledgers, comparador real), `stubs/`, `confere-fixture.sh`, `rodar.sh`,
`conta-classes.py`, `home/` (HOME de ensaio por rodada) e `saida/` (RESUMO.txt, CLASSIFICACAO.txt,
PROVA-FIXTURE.txt, motor-*.out/.err/.rc, diferencas-*.txt, banco_local-*.log, explicador-HOJE.py,
explicador-NOVO.py). Anexado ao cartao.
