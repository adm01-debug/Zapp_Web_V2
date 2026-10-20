# Validacao pos-merge: paridade e transporte PostgreSQL

## 1. Escopo e veredito

Snapshot principal: `102a500156ea830ab218bd87be5c31efa9f640d9`, em 22/09/2026.
Banco canonico: `tnnnlkbymytvtqngbbqh`. Trabalho isolado em
`audit/codex-post-libpq-20260922`.

**A regressao de transporte da PR #497 foi corrigida pela PR #509 e a
validacao viva voltou a passar.** Nao foi necessario reaplicar migrations,
alterar grants, configurar secrets nem redeployar todas as Edge Functions.

A PR #509 foi integrada pelo owner em `0933e01b`, as 18:28:38 UTC. O head
final `74b786b4` inclui um merge da main com mudancas concorrentes. O diff
dos scripts DB/CI da correcao contra o head testado `be160e7e` e vazio.
Esta sessao nao aprovou a propria PR nem usou bypass de protecao.

O fechamento e da correcao/paridade comprovada, **nao** dos planos historicos
inteiros de 50/100 etapas, da fidelidade visual de todas as telas ou de toda
configuracao operacional. Teste aprovado nao demonstra ausencia absoluta de bugs.

## 2. Evidencia viva, vinculada ao commit

| Coleta | SHA | Resultado |
| --- | --- | --- |
| [DB Live Guard 35767411179](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35767411179) | `0933e01b` | SUCCESS, incluindo paridade tripla e runtime |
| [DB Live Guard 35767806526](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35767806526) | `102a5001` | SUCCESS, incluindo paridade tripla e runtime |

As duas coletas passaram por verificacao do endpoint canonico, TLS verify-full
e CA pinada no workflow confiavel da main. Os artefatos registram PostgreSQL
major 17; esta coleta nao afirma uma versao minor que nao mediu.

O download foi comparado independentemente com os arquivos versionados:

- Catalogo: 144 tabelas, 8 views, 1.572 colunas, 92 nomes de funcoes e 93
  assinaturas; zero diferencas de conjuntos e cardinalidade.
- Manifesto estrutural: 16 secoes validadas, zero itens ausentes/adicionais
  ou hashes divergentes, incluindo RLS, policies, triggers e grants.
- `types.ts`, ACL de `mcp_exec` e ACL de falhas de webhook: etapas vivas aprovadas.
- Ledger: 447 versoes unicas, nomes coerentes e fingerprint da lista de
  versoes igual ao local. Nao confundir esse MD5 com hash do conteudo SQL.
- 432 entradas satisfazem as regras de evidencia do guard, 11 legadas
  continuam sem prova historica de conteudo e quatro avisos adicionais
  permanecem; detalhes no [inventario historico](./LEDGER_LIMITACOES_HISTORICAS_2026-09-22.md).
- Grants: fingerprint fresco igual ao baseline versionado.
- Edge local: 67 entradas no manifesto e 67 diretorios; isso sozinho nao
  compara os bundles implantados com as fontes.

A comparacao independente foi offline sobre artefatos de origem conhecida;
nao foi apresentada como nova conexao local ao banco. Invocar o CLI de
catalogo sem `DESTINO_URL` retornou exit 2, mesmo com conjuntos iguais:
fail-closed esperado. Nao se inseriu uma credencial ficticia para forcar PASS.

## 3. Runtime: confirmado e ainda nao comprovado

O artefato de `102a5001` foi coletado em `2026-09-22T18:33:28.268Z`.
Suas seis secoes sao identicas as da coleta anterior, de 18:29:19 UTC.
O avaliador foi reexecutado sobre as secoes e reproduziu o resultado original:
`status=PARTIAL`, `failures=[]`.

| Frente | Resultado | Limite de aceite |
| --- | --- | --- |
| Autovacuum | VERIFIED; global ligado; `contacts`, `email_messages`, `email_threads`, `messages` com vacuum/analyze scale factor 0.05 e enabled=true | A configuracao esta comprovada; nao substitui 14 dias de observacao da E18 |
| Realtime | Publication presente, 20 tabelas inventariadas | INVENTORIED_NOT_BASELINED; nao e teste de entrega/eventos entre sessoes |
| Cron | 7 jobs, 7 ativos | COUNTS_ONLY; nao prova cadencia, credenciais ou sucesso dos jobs |
| Storage | 7 buckets, 4 publicos | COUNTS_ONLY; nao aprova privacidade, RLS ou acessibilidade dos objetos |
| Ledger historico | Nomes/cardinalidade dos quatro alvos coletados | METADATA_ONLY_NO_HISTORICAL_CONTENT_PROOF |
| Backup/PITR | Nao restaurado | NOT_VERIFIED_RESTORE_REQUIRED |

Nao publicar comandos de Cron, objetos do Storage, mensagens, clientes ou
secrets para ampliar essa evidencia. O coletor usa READ ONLY e timeouts.

## 4. Simulacoes e testes da versao integrada

- 339 testes Node dos guardas CI/DB/Edge: PASS, zero failures/skips/TODO.
- Cliente psql + PostgreSQL 17 real descartavel: reproduz falha da URI em
  PGDATABASE; aprova conexao SCRAM via pgpass; rejeita senha incorreta e TLS
  obrigatorio em servidor sem TLS; verifica escaping e limpeza do passfile.
- CLI triplo contra banco descartavel: igualdade aprovada, divergencia de
  ledger e de grants rejeitadas. Nenhuma fixture foi aplicada ao Supabase.
- SQL runtime real em container isolado: servicos opcionais ausentes/presentes,
  comando sentinela nao exposto e drift de autovacuum detectado.
- 24 contratos Deno: PASS, runtime pinado e lockfile congelado.
- 167 contratos da aplicacao: PASS.
- Typecheck: exit 0. Lint ratchet: 1.104 ocorrencias historicas, zero novas,
  baseline 1.107. Nao significa lint historico zerado.
- Build: exit 0; JS inicial 325.5/340 KB gzip, CSS 35.7/80, maior chunk
  486.0/550 e assets totais 3961.4/4000. O aviso de chunk grande permanece;
  o budget foi respeitado sem aumentar limites.
- Suite Vitest da main atualizada: 238 arquivos, **3.148 PASS / 35 TODO**.
  Os TODO permanecem fora da cobertura executada (32 Team Chat, 3 RLS/CI).
  O jsdom emitiu avisos conhecidos de Canvas nao implementado; isso nao foi
  confundido com validacao visual de um navegador real.
- Smoke remoto nao mutante: **67/67 PASS**, CORS e negativos de autenticacao/
  kill switch conforme a funcao. Nao executa campanhas ou mensagens reais,
  nem substitui E2E autenticado positivo de todos os fluxos de negocio.

O smoke referencia `0933e01b`; o diff de fontes Edge ate `102a5001` e vazio.
Manifesto atual: 67 funcoes / 91 arquivos,
`12eca5b7a2210b0ac0da702e9bab713e7b75160166b408c5dc15bd7c45c6e39d`.

## 5. GitHub, frontend e coordenacao

O checkout isolado incorporou por fast-forward as mudancas concorrentes
das PRs #510/#511 e depois #512/#513. Nenhuma delas foi sobrescrita ou
atribuida a esta sessao. O checkout original ficou preservado em `7d3682c8`.

O endpoint publico [version.json](https://zapp-web-v2.vercel.app/version.json)
passou a responder `buildId=102a500156ea830ab218bd87be5c31efa9f640d9`, coincidente
com a main auditada. O deployment Production `6597926629` consta como success.
Isso prova o identificador servido naquele instante, nao uma equivalencia
binaria completa nem o comportamento de uma sessao autenticada/aba antiga.

A CI/CD de `0933e01b` foi CANCELLED por concorrencia apos novas publicacoes;
nao foi contabilizada como aprovada. A [CI/CD de 102a5001](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35767806459)
terminou SUCCESS, assim como o [DB Guard offline](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35767806707)
e o [CodeQL](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35767806531).

### Lacuna funcional encontrada ao cruzar Realtime com consumidores

Uma varredura AST identificou 35 chamadas diretas a `postgres_changes`: 34
com tabela literal e uma dinamica no hook compartilhado (esta ultima nao
foi classificada como conforme por inferencia). Quatro chamadas literais
dependem de tabelas ausentes da publication observada:

| Consumidor | Tabela ausente | Alcancabilidade confirmada |
| --- | --- | --- |
| `useRealtimeSentimentAlerts.ts:83` | `audit_logs` | Provider lazy montado em `App.tsx` |
| `useRateLimitLogs.ts:85` | `rate_limit_logs` | Rota `/admin/rate-limit` |
| `ConnectionHealthPanel.tsx:68` | `connection_health_logs` | Aba de diagnosticos |
| `useIncomingCallListener.ts:27` | `calls` | `IncomingCallAlert` montado em `App.tsx` |

As subscriptions nao podem entregar eventos dessas tabelas pelo mecanismo
esperado no snapshot. Os dois paineis de logs possuem leitura inicial/manual,
mas nao fallback periodico. Sentimento/chamadas dependem da notificacao por
evento. Isso nao foi simulado com insercao real em producao.

As migrations `20260401001338` e `20260410111418` removem explicitamente essas
tabelas da publication. Portanto, **nao adicionar todas automaticamente**:
auditoria/seguranca podem exigir leitura autorizada periodica ou canal de
notificacoes dedicado; chamadas exigem tambem um contrato de latencia e ACL.
Esse achado funcional permanece aberto, apesar do guard estrutural verde.

## 6. Pendencias restantes, com criterio concreto

| Frente | Proxima acao | Criterio para fechar |
| --- | --- | --- |
| Consumidores Realtime acima | Corrigir o mecanismo de atualizacao preservando RLS e decisoes de privacidade | Testes sem eventos da tabela, cancelamento/concorrencia, falha/recuperacao e sessao autenticada autorizada |
| Proveniencia Edge | No proximo deployment funcional autorizado, inspecionar o novo atestado estabilizado | Inventario pre/pos, escopo, versoes, estado ACTIVE e digests, sem deploy em massa apenas para produzir prova |
| Baselines operacionais | Definir estado esperado de Cron, Realtime e Storage com o responsavel | Comparacao do esperado aprovado contra coleta canonica; divergencias tratadas sem autoaceitar o observado |
| Backup | Escolher ambiente descartavel, politica de dados, custo e janela | Restore real testado, RPO/RTO e descarte seguro documentados; nenhum restore em producao |
| Fluxos de negocio | Definir contas/dados de homologacao e efeitos externos permitidos | E2E positivo de envio, CRM e campanhas sem atingir clientes reais |
| E15/E18 do plano 50 | Aguardar as janelas previstas com medidas periodicas | Estatisticas reais dos periodos de 30/14 dias, nao apenas configuracao atual |
| Checkout do outro agente | Coordenar sua atualizacao quando deixar de estar em uso | Preservar branch/configuracoes; nao usar reset para igualar hashes |

Outras pendencias de produto e qualidade do plano de 50 etapas (por exemplo
E17, E24, E34–E39) nao se tornam concluidas pelo guard verde. A governanca
ainda informa uma aprovacao exigida e `enforce_admins=false`; o auto-delete
de branches esta ligado. Nao foram alteradas essas configuracoes.

## 7. Integridade e reproducao

Os hashes dos tres artefatos mais recentes e os identificadores de origem
estao na [evidencia resumida](./evidence/2026-09-22-post-libpq-validation.json).
Nao se adicionaram os arquivos brutos do banco ao repositorio publico.

```bash
node --test scripts/ci/*.unit.mjs scripts/edge-deploy/*.unit.mjs scripts/db-audit/*.test.mjs
bash scripts/db-audit/retry-disposable-postgres-test.sh node scripts/db-audit/psql-environment.integration.mjs
bash scripts/db-audit/runtime-config.test.sh
node scripts/edge-deploy/generate-manifest.mjs --check
bun run test
bun run test:contracts
```

As convencoes do projeto orientaram isolamento e validacao antes da publicacao.
Graphify foi usado para orientar a leitura, nao como prova de estado atual.
O criterio de encerramento continua baseado em evidencia, nao numa nota 10/10.

Validacoes da documentacao: sete links relativos resolvidos; tres hashes de
artefatos conferidos; soma das categorias do ledger igual a 447; `git diff
--check` sem erros. Logs locais ficam fora do Git em diretorio temporario
privado. A evidencia resumida nao contem credenciais nem dados de clientes.
