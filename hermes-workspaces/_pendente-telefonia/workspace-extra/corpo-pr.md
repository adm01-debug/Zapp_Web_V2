## Descrição

Fase 1 do plano de finalização da Telefonia — o motor sai do hook e vira código testável, defeitos reais de chamada são corrigidos, e uma **auditoria adversarial com 5 agentes independentes** (ordem explícita de *derrubar* as afirmações, não confirmá-las) encontrou defeitos meus. Nesta rodada, **3 das 5 lacunas declaradas foram fechadas com prova** (T07, 4 mutantes sobreviventes, TLS do snapshot) e uma afirmação que eu havia publicado — um "drift real" — foi **verificada e refutada**.

O `useSipClient.ts` concentrava SIP, mídia, cronômetro e registro em 268 linhas; agora o hook só liga o React ao motor e o motor roda sem React. Na mesma passada: o **botão de mudo estava invertido** (`track.enabled = isMuted` mantinha o microfone aberto com o botão aceso), o **casamento de telefone** aceitava sufixo de 8 dígitos podendo vincular o contato errado — e a correção do telefone, por sua vez, **introduziu uma regressão**, encontrada pela auditoria e corrigida aqui.

## Tipo de Mudança

- [x] 🐛 Bug fix (correção de bug)
- [ ] ✨ Nova feature (funcionalidade nova)
- [ ] 💥 Breaking change (mudança que quebra compatibilidade)
- [x] 📚 Documentação
- [ ] 🎨 Estilo/UI
- [x] ♻️ Refatoração
- [ ] ⚡ Performance
- [x] ✅ Testes
- [ ] 🔧 DevOps/CI
- [x] 🔒 Segurança

## Plano

- Plano do Claude: `docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md` — Fase 1 (T09–T22)
- Passos executados:
  - **T09** — `CallAdapter`/`SipCallAdapter` (transporte SIP) + `CallEngine` (controlador sem React); `useSipClient.ts` de 268 → **113** linhas
  - **T14** — `phonesMatchExact` em E.164 completo; `phoneQueryVariants` + `pickUniquePhoneMatch` (exige **um único** casamento); fallback `ilike '%8 dígitos'` removido
  - **T18** — mute pelas tracks (`setMuted` devolve o estado **lido**) e DTMF só com a chamada estabelecida
  - **T07** — `calls-access.test.ts` com asserções reais (era 5 `it.todo`, arquivo *skipped*)
  - **Auditoria adversarial (5 agentes)** — correções abaixo
- Divergências do plano: **T09 nomeia 2 arquivos, foram criados 3.** Mover só os pontos de `sip.js` deixava o hook em 238 linhas e o aceite exige `< 120`; o próprio item manda mover `:122-239` (a orquestração). Daí o `CallEngine`, que é o que torna o motor testável sem React. **T18 é parcial:** falta `data-keypad-scope` (teclado físico), que depende da extração do `Keypad` no T58 — declarado no ledger como parcial, **não** marcado como concluído.

## Correções da auditoria adversarial (defeitos meus)

1. **T14 — regressão funcional introduzida [corrigida].** `phoneQueryVariants` não gerava a grafia `0`+DDD+**sem** o nono dígito. Com o banco guardando `01199992048`, uma chamada de `01199992048` — grafia **idêntica** — devolvia `null` no código novo e resolvia no antigo. A correção foi depois **ampliada com o dado real**: medido no banco canônico, **1367 de 3104 contatos (44%)** guardam `55`+DDD+**sem** o nono dígito — a classe que mais morde e que a primeira passada não cobria. **Não resolvido** (etapa de dado, não de código): linhas gravadas antes do trigger `contacts.trg_normalize_contact_phone`, que não faz backfill, podem manter máscara; e a mesma linha em duas grafias do nono dígito em dois contatos → `pickUniquePhoneMatch` devolve `null` (ambíguo — medido: **1** caso na base).
2. **T09 — comportamento perdido na extração [corrigido em parte].** A refatoração derrubou o `try/catch` do `hangUp`, que engolia erro síncrono de `bye()`/`cancel()` — sem ele o erro subia pelo clique do botão "desligar". Restaurado com `logger?.error('Hangup error:', error)`. **Pendente:** os logs `Accept error:` / `Call error:` — o `CallEngine` ainda não tem logger; restaurar exige passar um logger ao motor (muda o construtor).
3. **T07 — aceite cumprido de forma vazia [FECHADO].** `calls-access.test.ts` eram **5 `it.todo`, 0 asserções**: o vitest marcava o arquivo como *skipped* e o gate saía 0 — eu troquei um arquivo de teste morto por outro. Agora tem **5 asserções reais** que travam invariantes do módulo: nenhum arquivo da telefonia carrega a chave `service_role`; o hook de SIP não importa `sip.js` (fronteira do adapter — invariante do T09); motor e adapter não importam React (T09); o casamento de telefone nunca volta ao `ilike` por sufixo (T14); e um caso que **falha se a superfície de telefonia sumir**, para o arquivo não passar por vacuidade. A premissa do plano também estava errada — o `voip-security-gaps.test.ts` apagado **já era 6 `it.todo`** (não tinha o `expect(true).toBe(true)` citado).
4. **4 mutações SOBREVIVEM no motor [FECHADO — 4 mortos].** Cada teste novo foi validado por mutação (reintroduzir o defeito → exigir falha na asserção → reverter):
   - `toggleMute` ignorando o valor lido da track → `expected ... called with [false]`
   - `onTerminated` não notificando o sink → `called 1 times, but got 0`
   - `dispose()` sem descartar o áudio remoto → `expected <audio …> to be null`
   - cronômetro não parando em estado terminal (no hook) → `expected 8 to be 3`
   Depois de reverter: 12/12 e 28/28 verdes, árvore limpa.
5. **`telefonia-snapshot.mjs` — TLS não endurecido [FECHADO].** O script validava a **identidade** do banco mas repassava `sslmode`/`sslrootcert` da URL direto ao libpq — e o próprio `psql-environment.mjs` documenta que validar TLS é dever do chamador. Prova antes/depois, com a identidade correta (sha256 do ref confere) e credencial falsa: **antes**, `?sslmode=disable` era aceito e o psql **ia à rede** ("psql falhou", ou seja, só parou na credencial); **depois**, recusa com "tenta reduzir sslmode" e "tenta substituir a CA Supabase pinada". Sem parâmetro TLS o script segue fixando `verify-full` e chega ao psql — **não há falso positivo**. O artefato `pos-fase-0.json` ficou intacto.

## Banco de dados

Nenhuma mudança nesta fase. A Fase 0 (PR #1181, merge `ecc47a88`) fez a única DML da telefonia. **Verificação independente (agente DBA):** as 20 linhas batem 100% com `started_at + interval '2 minutes'` (delta distinto = 120s) e `end_reason='timeout'` em todas; nenhuma tinha `ended_at` antes (o `coalesce` foi inerte, não sobrescreveu nada); os 20 ids batem 1:1 com os que hoje satisfazem a fórmula. `ringing=0`, presas >1h = 0, presas >1d = 0. O baseline `pos-fase-0.json` **reproduz byte a byte** no banco. Ressalva honesta: a contagem "um único statement" é **inauditável** pelo banco, porque a rota usada (`public.mcp_exec`, `SECURITY DEFINER`) roda via `EXECUTE` interno, não deixa trilha em `pg_stat_statements` — e, verificado agora, **também não há registro em `ops.hermes_change_log`** (6 linhas na tabela, nenhuma do T03). O efeito está provado, a contagem não.

## Testes Realizados

- [x] typecheck: `tsc -b --force` → exit 0
- [x] lint: `lint-ratchet` novas = 0; `typecheck-ratchet` novas = 0; `implicit-any` = 0
- [x] build: `vite build` → exit 0
- [x] testes unitários: `vitest run src/components/calls src/lib/calls src/hooks/communication src/hooks/sip src/providers src/hooks/__tests__/useSipClient.test.ts` → **325 passed | 5 todo** (13 arquivos, **0 skipped**). Os 27 testes originais de `useSipClient.test.ts` seguem **inalterados** (só houve adição) — nenhum teste foi afrouxado para a refatoração passar
- [x] db:guard / contrato de migrations: `check-migration-drift` exit 0 (estrutura local)
- [x] prova red-first / mutation do teste novo: **sim, em 5 frentes.** (a) Reintroduzi `track.enabled = muted` → 3 testes falharam na asserção, revertido → 9/9; (b) um agente independente injetou 7 mutações: 3 morreram e 4 sobreviveram — e os 4 sobreviventes agora **morrem** (item 4 acima, cada um com a saída do AssertionError); (c) o TLS do snapshot foi provado em confronto antes/depois contra a versão do `HEAD`.

## Checklist

- [x] Código segue o padrão do projeto (AGENTS.md / CLAUDE.md lidos)
- [x] Self-review realizado no diff completo (`git diff origin/main...HEAD`)
- [x] Sem console.log ou debug code
- [x] Sem secrets/credenciais hardcoded (a credencial de QA vive fora do repo, em `/workspace/.secrets/zapp-v2.env`; a prova de TLS usou credencial **falsa** e não gravou nada)
- [x] Tipos TypeScript corretos
- [ ] RLS policies consideradas (se DB) — não se aplica, sem DDL
- [x] Documentação atualizada (ledger: T02/T05/T06/T07/T09/T14/T18, decisões D3/T71, as seções "AUDITORIA ADVERSARIAL 29/09" e "Fechamento das lacunas da auditoria adversarial")
- [x] Hooks de pre-commit/pre-push passaram sem `--no-verify`

## Achados fora do escopo (NÃO corrigidos)

- **`POST /functions/v1/auth-login` e `/auth/v1/token?grant_type=password` não respondem** (timeout, 0 bytes) no projeto `tnnnlkbymytvtqngbbqh`. Provado em **33 tentativas de refutação**, em **duas redes independentes**, e **independente da credencial** (trava com e-mail/senha falsos e com corpo vazio). **Mas não é queda geral de produção**: o Postgres responde (`count(*) from calls` = 22 em 3,6s), o projeto está `ACTIVE_HEALTHY` e `POST /functions/v1/gmail-webhook` devolveu 200 em 0,93s. Trava em handlers específicos (`auth-login`, `csp-report`) e no **caminho autenticado** de GoTrue/PostgREST; rejeições de borda (401/404/405) respondem em 0,1–0,3s. Alheio a este diff (não há arquivo de `supabase/functions` aqui).
- ~~**Drift real:** a migração `20260929830000` não existe em nenhum ref do git.~~ **REFUTADO na verificação.** O arquivo **existe** em `origin/main`: `supabase/migrations/20260929830000_audio_alertas_integridade.sql` (22 linhas, `ALTER TABLE public.user_settings`), commit `72954af9`, **PR #1218**. O subagente que reportou mediu contra um `origin/main` **local 19 commits desatualizado** e confessou no próprio relatório não ter rodado `git fetch`. **Não há drift.** A afirmação havia sido publicada por mim sem verificação e foi corrigida no ledger — lição: achado de subagente que afirma *ausência* é o mais perigoso.
- **`public.mcp_exec` é superfície de SQL arbitrário:** `SECURITY DEFINER` owner `postgres`, corpo com `execute q` cru, sem guarda de tipo de statement, 5.959 chamadas. **Mitigação medida:** a ACL é `{postgres, service_role}` — `anon`/`authenticated` **não** executam, logo não é injeção exposta ao público, é rota privilegiada sem auditoria. Sem trilha em `pg_stat_statements` **e** sem registro em `ops.hermes_change_log`.
- **O Postgres reiniciou** durante a auditoria (`postmaster_start = 2026-09-29 20:26:34Z`), confirmado em duas medições independentes — e estável desde então (uptime 35s na hora, 47min depois). A contagem de logs que o agente associou ao evento (**102 LOG + 8 FATAL `08006`**) **não se reproduz**: `postgres_logs` não existe em schema nenhum acessível — aquele detalhe fica **não verificado**.
- **Dados legados incoerentes:** 2 linhas `ended` com `end_reason` NULL e `duration_seconds=0`; as 20 normalizadas ficaram com `duration_seconds`/`talk_seconds` NULL (o T03 escreveu só status/end_reason/ended_at); `answered_at` NULL nas 22.
- **`calls` não tem coluna `provider`** (a dimensão real é `channel`: 12 `voip`, 10 `whatsapp`).

## Notas para Reviewer

- **A fase 1 NÃO está completa** (T10–T17 e T19–T22 pendentes). O ledger diz isso na linha da Fase 1; mergear agora entregaria o motor pela metade.
- **T07, os 4 mutantes e o TLS do snapshot saíram do débito e passaram a ter prova** (itens 3, 4 e 5). Seguem **abertos**: os 2 logs perdidos no `CallEngine` (item 2), as lacunas de dado (máscara pré-trigger e ambiguidade do nono dígito no item 1) e o `T18` parcial (`data-keypad-scope` → T58).
- **T15 vai por caminho tolerante:** o front usa default quando o campo novo não vem, para o merge não quebrar o VoIP antes do deploy da Edge.
- **4 propostas de infra/dado ficaram registradas e deliberadamente NÃO aplicadas** (decisão do dono): guarda de tipo no `mcp_exec`, backfill de `duration_seconds`, reescrita das 2 linhas `ended`→`missed` e registro retroativo do T03 no `ops.hermes_change_log`. São infraestrutura compartilhada e decisão de dado — vão para tarefa separada.
