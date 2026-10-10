Especialista: complexo (verificacao independente; o alvo e a guarda/CI e nao ha skill de area propria — consultei autorrevisao-antes-de-fechar e analisar-prova-dos-testes)

Cartao t_670ea2ee — VERIFICACAO POSITIVA das 9 residuais no `zapp-verify`. Nao ha codigo de produto
neste cartao: o entregavel e a prova. Nao editei nada e nao toquei `~/.local/bin` (alvo segue
`70c0b223...`; o artefato ajustado e `c95e371a...`, cabeca 1-64 identica, `drift_canonico()` novo).

O que fiz: extrai VERBATIM o explicador embutido dos dois scripts; montei ambiente limpo do zero a
partir das entradas cruas da tarefa 0 (retrato da copia, migrations da copia, check real de 18:55 de
128 linhas, ledger-fixture com a pendente DERIVADA); rodei as 3 frentes — explicador cru, o portao
REAL ponta a ponta com colaboradores stubados (exit code do proprio script) e a classificacao linha a
linha; e isolei cada prova num fixture sintetico.

Prova (medida agora, nao deduzida):
- 9 residuais: HOJE 2/9 debitadas -> NOVO **0/9** (as 2 viram drift); as outras 7 nunca foram
  debitadas (falso-positivo pre-existente de `explicada()`, nao criado por este ajuste).
- Exit code do portao REAL no cenario das 9: HOJE **1 / VERMELHO** -> NOVO **0 / VERDE (AVISO)**;
  a mensagem do NOVO nomeia "2 diferenca(s) NAO debitada(s) ao cartao".
- Bordas pedidas: so-no-retrato -> drift; so-nas-ja-aplicadas -> drift; nos dois -> drift.
- Nao mascara: "em nenhum lugar" e "filho novo de tabela do cartao" seguem DEBITADAS; no A-128
  sobram 8 debitadas, e com LEDGER bloqueado (rc=77/R1) o ajuste e INERTE (exit 1 igual).

Limites honestos (reconferidos por mim, nao herdados do relato do pai): (1) o veredito do cartao real
nao melhora — 8 linhas sem prova seguem vermelhas; (2) a prova "ledger" e indireta: o ledger serve
para derivar as pendentes e a prova e a ocorrencia do NOME do objeto no texto das migrations
nao-pendentes (no A-128: 67 linhas por essa via, 9 pelo retrato); (3) o cenario e o check GRAVADO de
18:55 com `zapp-db-local` stubado (o conjunto saiu do ar e R1 proibe ler producao).

Evidencia: `.tmp/t_670ea2ee/EVIDENCIA.md` (+ `saida/E2E.txt`, `saida/VERIFICACAO.txt`,
`linha-a-linha-*.out`, `bordas.out`, `atribuicao-drift-A.txt`, `e2e-01..10-*`), anexada ao cartao.
