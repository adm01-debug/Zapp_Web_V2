# Correcao do transporte libpq — 22/09/2026

## Incidente confirmado, sem inferencia de drift do banco

As PRs [#496](https://github.com/adm01-debug/Zapp_Web_V2/pull/496) e
[#497](https://github.com/adm01-debug/Zapp_Web_V2/pull/497) foram integradas por
outra sessao, em `b59a9d45` e `23d0e295`, respectivamente. A verificacao posterior
detectou uma regressao introduzida pelo hardening do executor anterior.

No [DB Live Guard 35760416228](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35760416228),
identidade/TLS, migrations, ACLs, catalogo, manifesto e tipos passaram. As pernas
migrations/grants do novo guard triplo falharam com `psql exit 2`; a auditoria
runtime foi pulada. Nao havia evidencia para reaplicar SQL ou alterar ACLs.

O codigo colocava a URI completa em `PGDATABASE` para remove-la do argv. O
libpq nao expande o valor default dessa variavel como uma URI: a expansao do
parametro explicito dbname ocorre antes da leitura dos defaults de ambiente.
O cliente real tentou o socket local em vez do endpoint solicitado.

Referencias oficiais: [defaults de ambiente libpq](https://www.postgresql.org/docs/17/libpq-envars.html)
e [expansao de dbname e ordem dos parametros](https://www.postgresql.org/docs/17/libpq-connect.html).

## Por que os testes anteriores nao detectaram

- O psql fake verificava o argv, mas nao interpretava PGDATABASE como libpq.
- O harness SQL executava `docker exec psql -U postgres`, sem atravessar o
  transporte Node usado pelo workflow vivo.
- Dois novos testes dos CLIs falharam antes da correcao (26 PASS / 2 FAIL).
- Uma reproducao com cliente real confirmou tentativa do socket default.

## Correcao

`psql-environment.mjs` passa campos PGHOST, PGPORT, PGDATABASE e PGUSER
separadamente. Opcoes reconhecidas sao preservadas, inclusive TLS verify-full,
CA pinada e timeout. Parametros desconhecidos, duplicados ou que substituem
destino/usuario/banco via query sao recusados sem imprimir a URI.

A senha fica em arquivo temporario privado, modo 0600, dentro de diretorio
0700, apontado por PGPASSFILE. Dois-pontos e barras sao escapados; URI e senha
nao ficam no argv nem no ambiente do processo filho. Variaveis PG herdadas
(incluindo service/hostaddr) e DESTINO_URL sao removidas do ambiente filho.
O arquivo e removido em finally, tanto no sucesso quanto na falha. Nenhum
secret de Supabase/GitHub foi lido, copiado para documento ou alterado.

Ambos os coletores usam o mesmo helper: paridade tripla e runtime. A identidade
canonica e o endurecimento TLS continuam nos pontos confiaveis existentes;
o helper de transporte nao substitui verificacao da identidade.

## Simulacoes e testes

- 46 testes especificos: parsers, TLS, permissoes, limpeza, IPv6, caracteres
  escapados, overrides proibidos, segredo fora de erros e ambos os CLIs.
- PostgreSQL 17 real, descartavel, sem rede externa nem portas publicadas.
  Autenticacao TCP SCRAM obrigatoria (nao apenas trust de localhost).
- URI inteira em PGDATABASE: falha reproduzida.
- Senha correta com caracteres especiais em pgpass: conexao aprovada.
- Senha incorreta e TLS obrigatorio contra servidor sem TLS: rejeitados.
- SQL runtime real, passado pelo transporte corrigido: evidencia PARTIAL,
  autovacuum VERIFIED na fixture. Nao e prova do banco de producao.
- CLI completo de paridade tripla: PASS com ledger/grants identicos; FAIL
  depois de divergencia real no ledger ou no baseline de grants da fixture.
- CI offline passa a executar esse harness, alem do teste SQL anterior.
- Reexecucao geral Node depois da correcao: **339 PASS**, sem skips ou falhas;
  consultar checks da PR para resultado remoto no SHA final.

Antes da correcao de transporte, o checkout integrado `23d0e295` tambem passou
em 3.148 testes de aplicacao (35 TODO), 167 contratos, 22 contratos Deno,
typecheck, lint sem divida nova, build e smoke de seguranca 67/67 Edge Functions.
Esses resultados nao tornaram o guard vivo verde e nao foram usados para
encobrir a falha. Nenhuma funcao produtiva foi redeployada nesta rodada.

## Aceite de producao e limites

1. Integrar esta correcao com os checks/revisao exigidos pela main, sem bypass.
2. Executar DB Live Guard no commit resultante.
3. Exigir PASS das tres pernas e examinar runtime-config.json do banco canonico.
4. Confirmar quatro tabelas/autovacuum; nao promover inventarios de Cron,
   Storage e Realtime a baselines aprovados por simples observacao.

Enquanto o novo run nao terminar, a recuperacao produtiva permanece pendente.
Backup restaurado, E2E autenticado e equivalencia binaria fonte/bundle continuam
fora da evidencia coletada. Os 35 TODO se distribuem em 32 asserts historicos
de Team Chat e 3 verificacoes RLS/CI; nao representam automaticamente 35 bugs
nem devem ser removidos ou renomeados para fabricar cobertura.

Checkout do outro agente preservado. Trabalho em branch separada conforme as
convencoes do projeto; Graphify usado apenas para orientacao, sem substituir
leitura dos arquivos ou testes do cliente real.
