# Execucao das recomendacoes da triagem de paridade

Data: 22/09/2026. Base inicial `c25e290e`, atualizada sem sobrescrita para
`c54550ce`. Destino canonico: `tnnnlkbymytvtqngbbqh`.

## 1. Escopo e resultado honesto

Esta rodada executa as oito recomendacoes da
[triagem anterior](./TRIAGEM_CONTEUDO_LOCAL_DESTINO_GITHUB_BANCO_2026-09-22.md).
Nao e uma declaracao de conclusao de todos os requisitos historicos de UI,
produto ou planos de 50/100 etapas. “10/10” nao substitui criterios de aceite.

Nenhuma migration, grant, segredo ou linha de negocio foi alterada. Nao houve
novo deployment de producao pelo executor. Merges efetuados por outro ator
nao sao apresentados como acao desta sessao.

**Atualizacao externa, 15:32 UTC:** o [DB Live Guard 35748033864](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35748033864)
falhou com 447 registros remotos versus 446 arquivos na main c54550ce.
O registro adicional e `20260922130000_fix_talkx_campaign_metrics_view_and_link_clicks_rls`,
cujo arquivo esta na [PR #495](https://github.com/adm01-debug/Zapp_Web_V2/pull/495), de outra frente.
Portanto, a paridade viva anteriormente observada deixou de valer para esse novo
snapshot. Esta rodada nao aplicou nem reaplicara esse SQL e nao assume a integracao
da PR concorrente. Depois dela, conferir tambem catalogo, manifesto, tipos e grants.

## 2. Matriz de execucao

| Frente | Implementado nesta rodada | Aceite / limite |
| --- | --- | --- |
| 1. Documentacao | Quatro entregaveis sanitizados, commit 79891796, [PR #494](https://github.com/adm01-debug/Zapp_Web_V2/pull/494) | MERGED na main pelo fluxo remoto, c54550ce; snapshots historicos preservados |
| 2. Coordenacao Git | Worktrees e branches independentes para docs, hardening e Deno | Checkout do outro agente preservado em 7d3682c8; sua atualizacao requer coordenacao, nao reset |
| 3. Preservacao | Bundle de refs + pack de 612 objetos recuperaveis, indices e hashes verificados | Copia privada chmod 700/600 fora do repo; nao e backup externo nem autorizacao para limpeza |
| 4. Guard triplo | Sumario PARCIAL sem DB; --require-live no guard vivo; duplicatas/nomes invalidos rejeitados; erros sanitizados | Regressao reproduzida antes; 16 cenarios locais passam; ativacao na main depende de merge |
| 5. Proveniencia Edge | Inventario antes/depois, minimo 60 s, tres amostras estaveis, versoes avancadas, ACTIVE, SHA-256, timestamp, escopo e rollback | 16 simulacoes deterministicas; nao equivale a reproduzir bundle remoto nem a E2E de negocio |
| 6. Deno | Runtime 2.9.5, config e lock de CI isolados, frozen | [PR #496](https://github.com/adm01-debug/Zapp_Web_V2/pull/496); 22 testes executaveis passam; nao migra dependencias produtivas |
| 7. Ledger | Inventario testado das 15 limitacoes, 11 classificadas + 4 avisos, com hashes dos arquivos locais | Nao fabrica historia nem altera a allowlist; nomes brutos dos quatro alvos serao capturados pela coleta viva |
| 8. Runtime DB | SQL READ ONLY com timeouts; verifica quatro tabelas/autovacuum; agrega Cron/Storage; inventaria Realtime; metadados dos quatro alvos do ledger | Testado em PostgreSQL 17 descartavel e fixtures Node; verificacao no banco canonico ainda depende de merge/run confiavel |

## 3. Simulacoes antes de promover

### Guard de paridade

Sete de quatorze testes falharam contra a implementacao anterior. Reproduziram
sucesso global sem banco, flag obrigatoria ignorada, typo aceito, stderr com
credencial, manifesto duplicado e SQL local duplicado/malformado. Depois foram
incluidos mais dois cenarios: stdout sensivel e URL fora do argv do psql.

O modo offline preserva exit 0 quando sua parte local passa, mas imprime PARCIAL.
O modo --require-live falha sem DESTINO_URL. A CI de banco exige esse modo.
Isso evita quebrar usos offline sem permitir falsa certificacao de producao.

### Deployment e rollback

As simulacoes cobrem inventario antigo, alteracao tardia de digest, versao que nao
avanca, status FAILED, identidade/timestamp ausentes, JWT divergente, mudanca fora
do escopo, ordem das linhas, erro transitorio e projeto incorreto. O coletor usado
no rollback vem do GITHUB_SHA confiavel que dispara o workflow; o manifesto de
fontes continua apontando ao DEPLOYED_GIT_SHA historico escolhido.

Digest local e digest remoto sao coisas diferentes. O atestado declara
source_to_bundle_equivalence_proven=false. Uma janela estavel nao impede alteracoes
futuras e nao identifica retrospectivamente o autor das seis mudancas antigas.

Falha de coleta posterior nao desfaz deployment que ja ocorreu. Nao repetir o
deploy cegamente: primeiro conferir o estado remoto.

### Banco

O teste cria seu proprio container, sem portas/rede externa, e o remove ao terminar.
Nao usa os containers dos outros projetos. Exercita ausencia/presenca de Cron,
Storage/ledger e alteracao de reloptions de autovacuum. Comando sentinela colocado
na fixture de cron nao aparece no resultado. A consulta usa BEGIN READ ONLY,
statement_timeout 10 s, lock_timeout 2 s e ROLLBACK.

Autovacuum exige 0.05 para vacuum/analyze nas tabelas messages, contacts,
email_messages e email_threads, conforme migration ja publicada. Nenhum ALTER
TABLE e executado em producao pelo coletor.

## 4. Validacoes locais

- 317 testes Node de CI, Edge e DB: PASS, zero skips.
- Suite da aplicacao: 238 arquivos, **3.148 testes PASS e 35 TODO preexistentes**;
  TODO nao e teste implementado nem validacao concluida.
- Suite de contratos: 167 testes PASS em quatro arquivos.
- 22 contratos Deno: PASS na geracao e na repeticao com --frozen.
- Lock Deno adulterado em fixture isolada: rejeitado por falha de integridade.
- 88 testes Node da branch Deno: PASS.
- Integracao real PostgreSQL 17: PASS, com estados ausente/presente/drift.
- Manifesto Edge: 67 funcoes / 91 arquivos, fingerprint de fontes inalterado.
- 446 migrations locais validas; nenhum SQL novo para aplicar.
- Pins de Actions e fronteira de secrets em PR: PASS.
- Supabase usage guard: zero novas violacoes.
- Typecheck: exit 0; lint-ratchet: zero novas dividas (1104 ocorrencias historicas).
- Build: exit 0; budget aprovado, JS inicial 325.5 KB gzip de 340 KB.
- CI funcional da PR #497 no commit cdfd7b30: lint/typecheck, unitarios, build,
  seguranca, CodeQL e DB offline aprovados. Commits posteriores desta rodada
  alteram apenas documentacao/evidencias, nao o codigo validado.

Testes mockados de API provam o comportamento do coletor, nao equivalem a nova
coleta remota autenticada. Testes de contador e metadados nao homologam negocios.

Tambem houve replay offline dos dois atestados reais 35737945858/35742846771:
o coletor rejeita as amostras antigas e aceita apenas a serie estabilizada. A
comparacao detecta 7 digests alterados, 67 versoes diferentes e timestamps antes
nulos. Como o primeiro artefato nao e o pre-deploy real do segundo, esse replay
nao serve para atribuir autoria/escopo das alteracoes: exercita a compatibilidade
do parser e evidencia por que snapshots novos antes/depois sao necessarios.

## 5. Pendencias externas explicitas

1. Integrar as PRs funcionais somente com checks/revisao aprovados; nao forcar main.
   Coordenar a PR #495 e seu drift vivo antes de afirmar paridade total.
2. Executar o DB Live Guard na main para obter runtime-config.json do banco oficial.
3. No proximo deployment autorizado, conferir o novo atestado estabilizado. Nao
   disparar 67 funcoes apenas para produzir um artefato novo.
4. Definir e revisar os baselines desejados de jobs Cron, publicacoes Realtime e
   privacidade Storage: os inventarios iniciais nao presumem que qualquer estado
   observado seja o correto.
5. Restauracao de backup exige ambiente isolado, politica de dados, custo e janela
   aprovados. Nenhuma restauracao produtiva ou copia de clientes foi realizada.
6. Coordenar com o outro agente a atualizacao do checkout original. A branch dele
   nao foi movida; caches/configuracao local e objetos antigos nao foram apagados.

## 6. Reproducao

```bash
node --test scripts/ci/*.unit.mjs scripts/edge-deploy/*.unit.mjs scripts/db-audit/*.test.mjs
bash scripts/db-audit/runtime-config.test.sh
node scripts/edge-deploy/generate-manifest.mjs --check
node scripts/db-audit/check-triple-parity.mjs
# Apenas no ambiente confiavel com credencial canonica ja provisionada:
node scripts/db-audit/check-triple-parity.mjs --require-live
node scripts/db-audit/check-runtime-config.mjs /tmp/runtime-config.json
```

O arquivo de saida runtime e criado com modo 600 e sem sobrescrever evidencia
existente. Nao colocar credenciais nos comandos, documentos ou migrations.
