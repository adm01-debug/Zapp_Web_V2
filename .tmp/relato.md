Especialista: edgar

## Sensibilidade
- Padrões tocados: `service_role` (o `supabase` privilegiado usado por `resolveInstanceToken` para ler o token da conexão no Vault) e a credencial da instância no header `apikey`. Nada de rateLimit/requireRole/verifyHmac/DELETE.
- Nenhuma proteção afrouxada: a leitura da instância usa o token DA conexão (`resolveInstanceToken`), não a chave global; sem token a ação NEGA sem I/O no provedor (teste do caso negado: `GO: set-settings de OUTRA conexão sem token no Vault nega e não chega ao provedor` → `requests.length === 0`).
- Nenhuma referência ao banco/endpoint de produção: testes usam fake local em `127.0.0.1`; nada foi tocado fora do workspace.
- Para quem chama: o contrato das actions não muda (mesmos nomes/devolução no flavor v2). No flavor go, elas deixam de dar 404 e passam a ler/gravar de verdade.

## Contrato da GO (item 1 do cartão)
- `docs/migration/GO_GAPS.md` §Exclusivos GO lista `/instance/advanced-settings` como existente na GO (sem action no proxy até agora); §Auth diz que rota de instância usa o token da instância (`GetInstanceByToken`).
- O swagger PÚBLICO do GO (docs.evolutionfoundation.com.br, `evo-go-instance.yaml`) NÃO documenta a rota nem os campos dela — o contrato campo-a-campo é INDOCUMENTADO. Por isso não codifiquei um subconjunto de campos (seria adivinhação): a gravação passa os campos 1:1 e a leitura devolve só os campos que a GO mandar — os ausentes ficam ausentes (a tela PL-03/iris os marca como indisponíveis). Registrado em GO_GAPS.

## O que mudou e por quê
- Diff: 4 arquivos no diff, sendo 1 arquivo de teste, com 9 casos de teste novos.
- `supabase/functions/evolution-api/index.ts`: as actions `get-settings`/`set-settings` passam a ramificar por flavor. No `v2` seguem `GET /settings/find/{instance}` e `POST /settings/set/{instance}` (inalterado). No `go` chamam `/instance/advanced-settings` (GET/POST) com o token DA conexão. A LEITURA é fail-closed: 2xx sem nenhum campo conhecido, corpo não-JSON, ou não-2xx do provedor viram ERRO — nunca objeto vazio (que desligaria todos os interruptores na tela). Helper novo `settingsFromGoPayload` desembrulha `data` (a tela lê no topo).
- `supabase/functions/evolution-api/index.test.ts`: 9 casos novos (flavor go e v2, erro do provedor propagado, e o caso negado sem token).
- `docs/migration/GO_GAPS.md`: `/settings/set+find` saiu de "Sem equivalente"; `/instance/advanced-settings` anotado como mapeado para get-settings/set-settings, com a nota do contrato não documentado e da leitura fail-closed.

## Prova
- vermelho antes (fonte sem a mudança, via `git stash`): `deno test ... --filter settings` → `FAILED | 2 passed | 7 failed | 27 filtered out (3s)` (os 2 verdes são os testes de v2, que provam que o v2 não mudou).
- verde depois: `deno test --config scripts/ci/deno.json --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/evolution-api/index.test.ts` → `ok | 36 passed | 0 failed (144ms)`.

## Item 3 (HTTP 4xx/5xx) — resolvido, não contradição
O cartão pede "erro (HTTP 4xx/5xx…)". A convenção de erro de negócio desta edge é HTTP 200 + `{ error:true, status }` (o campo `status` carrega o 4xx/5xx: 403 sem token da conexão, 502 leitura sem os campos, 504 falha de rede, ou o status do provedor), e é o shape que `useEvolutionApiCore` lê: em não-2xx o `supabase.functions.invoke` descarta o corpo e o cliente perde a mensagem pt-BR (mostraria erro genérico). Usei a convenção com o `status` no corpo, espelhando R2-API-014 (update-privacy), que é o mesmo caso fail-closed de leitura já aceito neste arquivo. Resultado: erro, com mensagem curta em pt-BR, nunca objeto vazio — o objetivo do item.

## O que NÃO fiz e por quê
- Não mexi no diálogo da tela nem no front: o estado "erro/indisponível" na tela é do PL-03 (iris), citado no COORDENAÇÃO do cartão.
- Não editei o tradutor `_shared/evolution-go-routes.ts`: o cartão limita os arquivos a `index.ts` (+teste) e a rotação por flavor aqui segue o padrão já usado em `index.ts` para status/connect/disconnect (R2-API-015).
- Não alterei a rota/branch de produção.

## Conclusão
CONCLUÍDO. `zapp-verify . --rapido` roda no `hermes-tarefa-fechar`; todas as mudanças são dos arquivos que o cartão permite, com teste que prova (vermelho → verde).
