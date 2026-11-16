# Handoff — sessão de 16/11/2026, 09:40–12:20 UTC

**Leia este arquivo antes do `RELATORIO-SESSAO-261115-261116.md`.** O relatório foi escrito às
10:30 e **corrigido às 11:35**; este handoff cobre o que aconteceu depois dele e aponta os
pontos em que o relatório ainda está desatualizado.

Estado da `main` quando este arquivo foi escrito: **`4bc94cb75`**.

---

## 1. Em uma tela: o que mudou desde o relatório

| | |
|---|---|
| `main` | `4bc94cb75` — deploy de produção `READY` (`dpl_8rdaxUS65QSMWzmAJpKLka7x7L55`) |
| PR #3162 | **mergeada por squash**, depois de 4 respostas de erro — ver §3 |
| PR #3163 | criada e **fechada sem merge** — era um plano B que se tornou desnecessário |
| PRs abertas | **#3158** e **#3160** (ambas regra 8, esperando o dono) e **#3164** (Dependabot, não é minha) |
| Branches no `origin` | **288** às 12:16Z (289 às 12:25Z — o Dependabot abre branches sozinho) |
| Arquivos do resgate na `main` | **1.970** sob `analise-prs/resgate-261115/` |
| Relatórios | corrigidos: **14 afirmações** derrubadas por verificação adversarial |

---

## 2. A verificação adversarial do próprio relatório — o que ela mudou

Antes de entregar o relatório à próxima conta, rodei 5 antagonistas somente-leitura contra os
fatos que eu mesmo havia escrito, cada erro alegado julgado por um segundo agente com o ônus da
prova invertido (`procede=false` como padrão). **24 agentes, 461 chamadas de ferramenta, 52 min.**

**19 erros alegados → 14 procederam, 5 caíram.**

O script está em
`/root/.claude/projects/.../workflows/scripts/verificar-relatorio-sessao-wf_b4f24514-c29.js`
(no contêiner, que não sobrevive) — mas **o método está descrito no §5 do relatório** e as
ferramentas equivalentes em `auditoria/ferramentas/`.

### As 14 alegações que procederam (já corrigidas na `main`)

A tabela tem **16 linhas** para 14 alegações: a do §13 tocou três lugares (cabeçalho, 1ª linha da
tabela e a linha de uso de IA) e a das "25 PRs" tocou dois documentos.

| Onde | Dizia | Verdade |
|---|---|---|
| §13 (cabeçalho) | "Fatos de produção já levantados — **não consulte de novo**" | Virou "reconfira os voláteis". O cabeçalho congelava como permanente um dado que envelheceu em 18 minutos. |
| §13 (1ª linha) | `copilot_sessions`/`copilot_insights` = **0 linhas** | Já eram 2 e 12 **no instante em que o arquivo foi salvo** (10:30:12). O Copiloto entrou em uso às **10:12 de 16/11**; às 11:01 eram 6 sessões e 54 insights. |
| §13 (uso de IA) | "~8 chamadas em 7 dias — praticamente não é usado" | 26 chamadas de `copilot-live` em ~50 min a partir das 10:13. |
| §13 (reservas) | "reservadas por mim **no ledger**" | Estão em `supabase_migrations.version_reservations`. O ledger `schema_migrations` tem `max(version) = 20261115020000` e **não** mostra as reservas. |
| §12.2 | "squash-only" | É regra do `AGENTS.md`, **não** do GitHub: `allow_squash_merge`, `allow_merge_commit` e `allow_rebase_merge` todos `true`, nenhum ruleset. O que a `main` impõe é `required_linear_history`, que barra merge commit mas **permite rebase**. |
| §12.2 | `Supabase Preview` = projeto `mjdcproswwprjmbwpnbw` | O projeto de preview é **efêmero, um por PR**. Não use nenhum como identificador estável. |
| §12.3 e §7.11 | "136 tags dão contagem > 0" | **95** dão, 41 dão 0. E a contagem mede **branch apagada**, não conteúdo ausente: das 95, 94 têm a branch de origem apagada. |
| §7.6 e anexo C.2 | "a #3146 apagaria **7.945 linhas**" | **Número inventado.** O cálculo do GitHub é +417/−44 e a PR estava `CONFLICTING` (sem merge calculado). A divergência real é 8.408 inserções. |
| §3.2 | "**31** vereditos derrubados" | **22.** O 31 é a soma de `contagem.veredito_derrubado` nos 10 lotes que têm esse campo, e há sobreposição entre frentes: as **92** branches `OBSOLETA` foram auditadas **duas vezes** (uma frente de 92 + quatro de 23). Atenção: o 22 **não é reconstituível** a partir dos arquivos versionados — os lotes não dizem quais entradas repetem. Se precisar do número exato, recompute a partir de `bruto/triagens/` × `bruto/verificacoes/` × `bruto/vereditos-finais.json`. |
| §3.2.1 | "Parte B … lacunas item a item" | Só em **B.1** (62 entradas, 385 lacunas). As 267 de B.2 vêm só com resumo; 103 delas têm 373 lacunas que **só existem no `vereditos-finais.json`**. |
| anexo B.1 | "são estas que sustentam as 226 evidências" | Sustentam **178**. As outras **48 vêm de 22 branches de B.2** — a seção que dizia "não há o que resgatar". |
| §2, §3.2.1, anexo C | "**25** PRs mergeadas nesta sessão" | **17** (#3139–#3159). As 8 restantes são da sessão anterior e foram para a nova **Parte C.0** do anexo. |
| §4.2 | `copilot_help_requests` "**ninguém** consegue ler" | A policy é `seller_id = auth.uid()`: o vendedor lê o próprio pedido. Quem é cego é o **supervisor**, o destinatário. A conclusão de negócio (recurso morto) continua. |
| §3.3 | "13 arquivos de lote" | **12** (a PR #3153 versionou 14 arquivos: README + `itens-confirmados.json` + 12 lotes). |
| §16.8 | mapa apontava `bruto/RAIZ__p006_branch.json` | Está em **`bruto/diarios-sessao/RAIZ__p006_branch.json`**. Era o único caminho inexistente do mapa, e logo o do arquivo mais importante do resgate. |
| anexo C.1 (#3156) | "6 testes novos, **cada um** provado por mutação" | 3 mutações derrubam 5 testes (4 novos + 1 antigo). **Dois dos 6 novos não têm mutação registrada.** |

### As 5 que caíram (não mude nada nelas)

1. `user_roles` "11 papéis, 5 admin/supervisor" — os números batem com produção; a disputa era sobre a palavra "papéis".
2. "388 migrations usam `is_admin_or_supervisor`" — 388 no grep recursivo (384 na raiz + 4 em `_superseded`). Imprecisão defensável.
3. Parte A "com lacunas" — mostra a **contagem** de lacunas no `<sub>`; ler "lacunas" como "o número de lacunas" é defensável.
4. `TalkXAnalytics.tsx:321` → o antagonista propôs `:323`; **o confirmador mostrou que nenhum dos dois é o lugar certo** — ver §4 abaixo.
5. "25 PRs na janela" vs "26 pelo GraphQL" — existe recorte coerente que dá 25 (criadas **e** mergeadas de 15/11 em diante); a #3124 nasceu em 14/11.

---

## 3. A saga do merge da #3162 — leia antes de mergear qualquer PR grande

**O squash do GitHub não aguenta PRs muito grandes neste repositório.** A #3162 tinha 1.624
arquivos e 568.532 linhas.

| Tentativa | Método | Resultado |
|---|---|---|
| 1 | squash | HTTP 500 |
| 2 | squash | HTTP 502 |
| 3 | squash | 405 `Merge already in progress` |
| 4 | squash (após CI nova) | HTTP 502 |
| 5 | rebase | HTTP 502 na resposta |

Minutos depois, o webhook avisou `pull_request.closed outcome=merged`.

**O que entrou foi um squash, não o rebase.** Prova: a PR tinha 8 commits e a `main` ganhou **1**
(`git log b7c27b00b..4bc94cb75` devolve uma linha só, `parents=b7c27b00b`); a mensagem segue o
padrão de squash deste repo (título da PR + ` (#3162)`, corpo = corpo da PR); e
`compare/4bc94cb75...6d4b4e98c` dá `diverged` — nenhum commit da PR é ancestral da `main`. Um
rebase merge teria replicado os 8.

Ou seja: **o squash funcionou**. O que estava acontecendo era que a operação da tentativa 3 (a do
`405 Merge already in progress`) seguia em curso o tempo todo; as respostas 502 eram timeout do
HTTP, não recusa. As tentativas 4 e 5 não fizeram nada.

A PR estava `mergeable: true`, `rebaseable: true`, sem rascunho, com os 3 obrigatórios verdes e
Codex sem achados. **Nada do repositório impedia** — era só o tempo da operação.

### O erro que eu cometi aqui, e que vale mais que o fato

Depois da tentativa 5, consultei `/pulls/3162/merge` **8 vezes em 4 minutos**, recebi 404 em todas
e **declarei que o rebase havia falhado**. Ele estava em andamento e completou depois. Em cima
dessa conclusão apressada eu:

- anunciei ao dono que o merge era impossível,
- planejei um fatiamento em 4 lotes,
- criei a branch `claude/docs-trilha-l1-261116-1210`, montei 808 arquivos, varri segredos,
  commitei, empurrei e **abri a PR #3163**.

Tudo descartado minutos depois, quando o webhook avisou `pull_request.closed outcome=merged`.

**É o mesmo erro que os antagonistas acharam no relatório**: medir numa janela estreita e afirmar
a conclusão com firmeza maior do que a medição sustenta (igual às "136 tags" e às "7.945 linhas").
Para uma operação assíncrona grande, **espere minutos, não segundos, e diga "ainda não completou",
nunca "falhou"**.

### Receita para a próxima PR grande

1. Tente squash. Se devolver 500/502, **não conclua nada**: é timeout do HTTP, não recusa.
2. **Não repita a chamada.** Um `405 Merge already in progress` significa que há uma operação em
   curso — insistir não acelera e confunde o diagnóstico.
3. Espere **10+ minutos** consultando `GET /repos/{o}/{r}/pulls/{n}/merge` (204 = mergeada).
   Aqui o squash levou mais que os 4 minutos que eu dei a ele.
4. Só se continuar 404 depois disso, considere fatiar. Os lotes que eu havia medido, se precisar:
   `dossies-prs-antigas/` 199 arq/8k linhas · `items/` 381/132k · `diarios-sessao/` 236/386k.

Não tenho evidência de que **rebase** ajude nesse caso — na minha tentativa ele devolveu 502 e o
que completou foi o squash anterior. Trate o rebase como não testado.

---

## 4. Trabalho aberto, com os endereços **verificados hoje**

### 4.1 As duas migrations do Copiloto (regra 8 — não mergeie sozinho)

**[#3158](https://github.com/adm01-debug/Zapp_Web_V2/pull/3158)** — RLS de supervisor em
`copilot_help_requests`, `copilot_conversation_scores`, `copilot_learning_moments`.
`scripts/db-audit/copilot-rls-supervisor.test.sh` → **23/23** num Postgres real, com um "bloco A"
que reproduz as 3 falhas atuais **antes** da correção.

**[#3160](https://github.com/adm01-debug/Zapp_Web_V2/pull/3160)** — `commit_copilot_tick(uuid,
integer, jsonb, jsonb)`: hoje, se a segunda gravação do tick falha, o cursor já andou e a análise
que o provedor de IA **cobrou** se perde em silêncio.
`scripts/db-audit/commit-copilot-tick.test.sh` → **25/25**, com bloco A reproduzindo a perda.

> **MUDOU DESDE O RELATÓRIO:** as tabelas **não estão mais vazias**. O Copiloto entrou em uso às
> 10:12 de 16/11. Reconsulte o volume antes do apply — "tabela vazia" era premissa para backfill,
> lock e risco. As 3 tabelas da #3158 seguiam em 0; as 2 da #3160 (`copilot_sessions`,
> `copilot_insights`) **não**.

> **AS DUAS ESTÃO EM RASCUNHO.** `GET /pulls/3158` e `/pulls/3160` → `"draft": true`. Isso importa
> porque PR em rascunho faz `🏗️ Build` e `🧪 Unit Tests` saírem **`SKIPPED`**, o `✅ CI Gate` fica
> verde assim mesmo e a proteção de branch **recusa** o merge com *"3 of 3 required status checks
> have not succeeded"*. Os check runs do head da #3158 estão nesse estado agora. **Tire o rascunho
> primeiro e espere o pipeline completo** — e só então o dono decide o merge (regra 8).

Ordem obrigatória para a #3160: **apply primeiro, código depois**. A PR entrega só o DDL; trocar
as duas gravações de `supabase/functions/_shared/copilot-tick.ts:514,531` pela função **antes** do
apply quebra o tick.

### 4.2 O erro que não chega ao boundary no Talk X — endereço corrigido

**O relatório está errado neste ponto, e eu não consegui corrigi-lo antes de fechar.** Ele manda
consertar `TalkXAnalytics.tsx:321`. Verifiquei hoje na `main` `4bc94cb75`, linha a linha:

**Caso 1 — Analytics.** A causa está em `src/components/talkx/TalkXView.tsx:679`:

```tsx
<TalkXAnalytics campaigns={campaigns} isLoading={isLoading} isError={isError} />
```

Não passa `error`. O objeto existe: `TalkXView.tsx:86` desestrutura `error: campaignsError` do
`useTalkX()`, e **`TalkXView.tsx:644` já o repassa** para `TalkXOverview` (`error={campaignsError}`).
O padrão certo está no mesmo arquivo. Conserto: passar `error={campaignsError}` em `:679` e
repassá-lo ao `query={{ … }}` de `TalkXAnalytics.tsx:323`.

**Caso 2 — LiveMonitor.** `src/components/talkx/TalkXLiveMonitor.tsx:238` passa
`error: null` **explicitamente**. Não é desleixo: o hook não tem o que dar.
`TalkXLiveMonitor.tsx:127` desestrutura `useTalkXMonitor(…)` e recebe só
`isError: rateError`, **sem objeto de erro** (o hook, em
`src/hooks/integrations/useTalkXMonitor.ts:56-62`, devolve `recipients, isLoading, isError,
rateByMinute, refetch` e nada mais). Os outros três boundaries do mesmo arquivo passam o objeto
(`campaignErrorObj` em `:156`, `recipientsErrorObj` em `:284`, `eventsErrorObj` em `:317`).
Conserto: **expor `error` em `useTalkXMonitor`** e então passá-lo em `:238`.

**Caso 3 — há um terceiro, que eu só achei na verificação deste handoff.**
`src/components/talkx/tracking/TalkXSegmentProgressTable.tsx:157` também passa `error: null`.

### Quantos são, de verdade

Cuidado com a frase "2 das 22 telas" que circulou nas versões anteriores: ela é enganosa.
Medido na `main` `4bc94cb75`:

- `docs/talkx/ESTADOS.md` lista **22 telas**, mas **11 delas não têm estado de erro nenhum**
  (coluna "Erro de consulta" = `—`), incluindo a própria `TalkXView.tsx`.
- São **22 ocorrências de `query={{`** fora de testes; **3 sem objeto de erro real** (os três casos
  acima) e 19 com.

Ou seja: **3 boundaries defeituosos**, não 2 — e o denominador certo são os boundaries, não as
telas.

### 4.3 O resto da fila (do relatório, ainda válido)

- Ligar rótulo↔valor no cartão "Resumo da Campanha" — achado do Devin em
  `TalkXCampaignReport.test.tsx:244`, não corrigido.
- **58 evidências de CI/workflow** e **10 de migration em produção** ainda em
  `auditoria/itens-confirmados.json` (contagem pelo campo `bloqueio`: `ci_workflow` 58,
  `migration_producao` 10 — não confunda com `classe: "sql"`, que são 9).
- **Lado local:** 4.377 branches no PC do dono, medidas e **não tocadas**. Publicar como
  `refs/salvo/*`, **não** como branches.
- A sessão-ponte nunca devolveu a varredura de segredos do ZAPP (3 conjuntos) nem a tabela dos
  namespaces `refs/autosave` / `refs/arquivo`.

---

## 5. Dívida que eu deixei, declarada

1. **O comentário de fechamento da #3146** (`issuecomment-6903771601`) afirma publicamente as
   "7.945 linhas". O relatório já desmente; **o comentário não foi corrigido**. Comentar no GitHub
   não estava no pedido, então parei.
2. A branch **`claude/feat-copiloto-edges-261115-1555`** (da #3146) segue viva, sem PR. O conteúdo
   útil está na `main` via #3155. **Pode ser apagada** — já auditada.
3. **6 workflows desativados** por mim em 15/11 09:03, `disabled_manually`:
   `branch-hygiene-audit.yml`, `check-talkx-pr-body.yml`, `e2e-logado-isolado.yml`,
   `e2e-talkx.yml`, `inventario-estado-semanal.yml`, `talkx-status-regen.yml`. Autorizado pelo
   dono. Se algum precisar voltar, é `github_enable_workflow`.
4. O `scripts/ci/github-settings-baseline.json` diz `allow_merge_commit=false` e
   `allow_rebase_merge=false`; a API diz `true` para ambos. **O Settings Guard não detecta**: o
   token dele não lê `merge.*`, o item sai `NAO VERIFICAVEL` e o job fica verde (run 43824057102).

---

## 6. Armadilhas que custaram tempo (não redescubra)

- **`docs/talkx/ESTADOS.md` é gerado e guarda `arquivo:linha`.** Qualquer diff que mova linhas numa
  tela do Talk X quebra `Node CI Scripts` e `Contrato DB offline`. Rode
  `node scripts/talkx/gen-estados.mjs` **antes** de abrir a PR. Me pegou **duas** vezes (#3154, #3159).
- **`supabase/deployment-manifest.json` também é gerado.** Mudou o grafo de imports de uma edge?
  `node scripts/edge-deploy/generate-manifest.mjs`. Me pegou na #3151.
- **Run cancelado reporta `CI Gate` como `failure`.** Confira o `conclusion` do run
  (`cancelled` ≠ `failure`) antes de caçar defeito. Aconteceu 3 vezes — meus próprios pushes
  rápidos cancelando o run anterior.
- **`Devin Review` falha em 7–8 s** em PR com muitos arquivos de documentação, sem postar achado.
  Não é obrigatório. Quando ele **posta** achado, leia: acertou 3 vezes nesta sessão (inclusive me
  pegando uma afirmação errada sobre `Promise.all`).
- **O clone é raso.** `git rev-list --count X --not --remotes=origin` **não prova** ausência no
  GitHub. Use teste de blob (`git hash-object` contra `git ls-tree -r`).
- **Squash-merge quebra prova por ancestralidade.** Prove incorporação por **conteúdo**.
- **O proxy do contêiner bloqueia `deno.land`** — testes de edge não resolvem imports da stdlib.
  Shims em `auditoria/ferramentas/` (`serve-shim.ts`, `deno-shim.d.ts`, `deno-std-assert.d.ts`).
- **`send_later` não é confiável sozinho.** Meu próprio check-in disparou e falhou com
  `ACCESS_DENIED` sem nunca ser entregue.

---

## 7. Onde está tudo

Caminhos conferidos em `4bc94cb75` com `git cat-file -e`, **menos este próprio arquivo**, que
entra na `main` junto com a PR desta branch.

```
analise-prs/resgate-261115/
├── HANDOFF-SESSAO-2026-11-16.md        ← este arquivo, leia primeiro
├── HANDOFF-SESSAO-2026-11-15.md        ← o handoff da sessão anterior
├── RELATORIO-SESSAO-261115-261116.md   ← o relatório (corrigido)
├── RELATORIO-ANEXO-BRANCHES.md         ← todas as branches, uma a uma
├── dossies/                            ← 329 dossiês
├── vereditos.json
└── auditoria/
    ├── README.md                       ← comece aqui para entender a auditoria
    ├── itens-confirmados.json          ← as 226 evidências
    ├── bruto/                          ← os diários das 3 passadas
    │   ├── README.md
    │   ├── items/ triagens/ verificacoes/ reexames/ achados/ lotes/ metodo/
    │   ├── dossies-prs-antigas/
    │   ├── diarios-sessao/
    │   │   └── RAIZ__p006_branch.json  ← a leitura mais cética do ledger P006
    │   ├── perda-intermediaria.json
    │   └── vereditos-finais.json
    └── ferramentas/                    ← os scripts que RODARAM a auditoria
        └── README.md
```

E, antes de qualquer tarefa, o que o `AGENTS.md` manda:
`git fetch origin contexto && git show origin/contexto:docs/contexto/00-INDEX.md`.

---

## 8. Como eu trabalharia se fosse você

1. **Não refaça a auditoria.** 329 entradas, 3 passadas, 226 evidências, tudo versionado com a
   trilha e as ferramentas. O que falta é **executar** o que ela achou, não auditar de novo.
2. **As 226 são evidências, não tarefas.** Várias apontam o mesmo arquivo (24 delas um único
   arquivo de teste). Contar linhas ali não dá quantidade de trabalho.
3. **Antes de citar `arquivo:linha`, abra o arquivo.** Os dois erros de endereço desta sessão
   (`TalkXAnalytics:321`, o mapa do §16.8) teriam morrido com um `sed -n`.
4. **Antes de afirmar que algo falhou, meça por tempo suficiente.** Foi o erro mais caro do dia.
5. **Rode um antagonista contra o seu próprio resultado** antes de entregá-lo. 14 de 19 alegações
   procederam contra um texto que eu havia revisado e considerava pronto.
