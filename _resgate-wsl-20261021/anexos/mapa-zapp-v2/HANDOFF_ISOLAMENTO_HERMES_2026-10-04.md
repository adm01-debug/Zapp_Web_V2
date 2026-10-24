# Handoff — como os vários chats do Hermes foram isolados (04/10/2026)

Quem escreve: a sessão do Claude Code no Windows, que desenhou, construiu e auditou este isolamento entre 25/09 e 01/10/2026.
Para quem: o Claude Code no WSL, que passa a manter isso.
Fonte detalhada: memória `hermes-executor-arquitetura.md` (longa, com o histórico de cada correção), `hermes-enviar-canal.md`, `coordenador-sem-chat-parado.md`, `joaquim-autonomia-coordenacao.md`, `multiplix-plano-coordenacao.md`. Este documento organiza tudo e traz o estado conferido no disco em 04/10 ~11:00.

---

## 1. O problema que isto resolve

O Joaquim roda **vários chats do Hermes ao mesmo tempo no mesmo repositório** (no auge, 8–12 chats no Zapp Web V2: MULTIPLIXE, VOLUMES, TAREFAS, CONTATOS, MAPA, TELEFONIA1, TALK X, CATÁLOGO…). Sem isolamento, eles:
- editavam a mesma pasta e se atropelavam (um desfazia o trabalho do outro);
- trocavam de branch na pasta compartilhada;
- faziam push/merge/force por conta própria;
- aplicavam migrations no banco sem ordem, com versões repetidas;
- mexiam nas próprias regras (skill, SOUL, scripts de guarda) quando uma regra os atrapalhava.

**Objetivo:** cada chat trabalha numa caixa própria. Só sai dela por um caminho controlado, que termina num PR, num merge com checks verdes e numa migration registrada no ledger. E nenhum chat consegue desligar a caixa.

## 2. Visão geral

```
Hermes (app nativo no Windows, %LOCALAPPDATA%\hermes, modelo deepseek-v4-pro)
 │
 ├── CAMADA 1 — hook do Windows  agent-hooks\hermes-guard.py
 │     roda ANTES de toda ferramenta do agente (fail_closed): amarra chat ↔ workspace,
 │     bloqueia comandos proibidos, protege skill/SOUL/guardas, controla subagentes
 │
 └── terminal = SSH para o WSL (localhost:2222, chave ~/.ssh/hermes_wsl)
        │
        ├── CAMADA 2 — guarda do WSL  ~/.local/libexec/hermes-guard/
        │     a chave SSH força ssh-entry → HERMES_AGENT=1 + wrappers git/gh na frente do PATH
        │
        └── CAMADA 3 — ciclo de vida da tarefa  ~/.local/bin/hermes-*
              iniciar → (trabalho no worktree) → fechar → mergear → limpar
              + hermes-db-migrar (único caminho para o banco)
              + travas/filas/caixa de decisões para coordenar tarefas entre si
```

São **duas camadas independentes** de propósito. Se o agente achar um furo numa delas (e já achou), a outra ainda segura. Cada regra importante está nas duas.

## 3. A unidade de trabalho: um chat = uma tarefa = um workspace = um branch = um PR

### 3.1 `hermes-tarefa-iniciar <Projeto> <slug> [--adotar <branch>]`
- Cria um **git worktree** a partir da cópia de referência: `~/hermes-workspaces/<Projeto>/<slug>-<id>`.
- Branch próprio: `hermes/<slug>-<id>`, partindo de `main`.
- Grava o **marcador** `.hermes-tarefa` na raiz do workspace. Exemplo real:
  ```
  PROJETO=Zapp_Web_V2
  SLUG=telefonia-fase8-motion-a11y-responsivo
  ID=2610031530007c
  BRANCH=hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c
  BASE=main
  ADOTADO=
  WORKSPACE=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/<slug>-<id>
  DB_REF=tnnnlkbymytvtqngbbqh          ← identidade do banco canônico
  INICIO=2026-10-03T15:30:15-03:00
  TMPDIR=<workspace>/.tmp             ← temporário por tarefa (fora do git)
  ```
  Ao longo da tarefa o marcador ganha `PR_NUMERO=`, `APLICADA_DB=`/`PENDENTE_POS_MERGE=` (migrations), `SHA256_MIG=` e confirmações de DDL destrutivo.
- `--adotar <branch-do-PR>`: continua um PR já aberto. O branch existente vira o branch da tarefa (`ADOTADO=`). `fechar` só faz push e `mergear` mergeia o PR existente. Usar só quando o plano diz "continuar o PR #N".

### 3.2 `hermes-tarefa-fechar "<tipo>(<escopo>): <título>" corpo-pr.md`
- Exige Conventional Commits e corpo de PR completo pelo `PR-modelo.md`, com seções obrigatórias: "Achados fora do escopo", "## Rollback" quando há migration, e "Teste fora de produção:" com valor de verdade.
- Varre segredos no diff **e no histórico** (inclusive JWT), sem SIGPIPE.
- Rebase só antes do 1º push. Push **sem force**. `gh pr create` e garante PR **não-draft**.
- Recusa migration no diff que não passou pelo `hermes-db-migrar`, versão já usada na main e SQL editado depois de aplicado (compara SHA).

### 3.3 `hermes-tarefa-mergear [--detach] [--dry-run] [--destrutivo-confirmado <arquivo>]`
O agente **não** pode `gh pr merge`; só este script mergeia.
- Lê os checks obrigatórios da proteção da `main` e espera ficarem verdes.
- Mergeia **squash** e apaga o branch, só com `mergeStateStatus=CLEAN`. Com `BEHIND`, roda `gh pr update-branch`. `UNSTABLE` com os obrigatórios verdes é aceito.
- Redispara check caído por infraestrutura (`infra_retry.py`, até 3×, filtrando pelos obrigatórios).
- Espera o deployment Production do Vercel e os workflows de deploy do sha (até 15 min). Faz deploy de Edge Functions tocadas, uma por vez, por fila.
- Aplica as migrations `PENDENTE_POS_MERGE` com `hermes-db-migrar --pos-merge`.
- Aceita PR mergeado por fora: descobre migrations fora do ledger e aplica.
- `--detach`: roda solto, com `setsid`, log em `<gitdir>/hermes-mergear.log` (marcas `INICIO_`/`FIM_MERGEAR=<estado>`), PID em `<gitdir>/hermes-mergear.pid` e flock de instância única.
  - **Por que existe:** o Hermes confere processo remoto com ssh de 5 s; sob carga, marcava o processo como morto (exit -1, `backend_lost`) com ele vivo e relançava, criando 2 mergear no mesmo PR.
- Ao terminar, avisa o chat dono sozinho (`avisar_chat.py`, ver 6.4).

### 3.4 `hermes-tarefa-limpar`
- Remove o worktree. Aceita branch remoto apagado se o PR está MERGED.
- **Recusa** se houver migration pendente não aplicada, commit não enviado ou mergear ainda vivo.

### 3.5 `hermes-tarefa-status [--todos]`
Painel de todas as tarefas abertas: PR, DDL pendente, atraso em relação à main, mergear rodando, e **arquivos e versões de migration em conflito entre tarefas**.

### 3.6 Regras que valem para os scripts
- Usam `/usr/bin/git` e `/usr/bin/python3` absolutos, para não passarem pelos wrappers nem por PATH adulterado.
- **Instalação sempre por troca atômica:** arquivo novo + `os.replace`. Nunca reescrever no lugar: o bash lê o script aos poucos, e processos vivos quebram. Por isso há dezenas de `.bak-<data>` em `~/.local/bin` e `~/.local/libexec/hermes-guard` (histórico de versões; não apagar sem decisão).

## 4. Camada 2 — guarda do WSL

### 4.1 Como o agente entra "marcado"
- Em `~/.ssh/authorized_keys`, a chave `hermes_wsl` tem `command="/home/joaquim_ataides/.local/libexec/hermes-guard/ssh-entry"`. Todo comando do Hermes passa pelo `ssh-entry`, que exporta `HERMES_AGENT=1`, garante `TMPDIR` nunca vazio e põe `~/.local/libexec/hermes-guard` **na frente do PATH**.
- O `~/.profile` (linhas 46–49) repete isso para `bash -l`.
- **Fora de `HERMES_AGENT=1`, os wrappers deixam tudo passar.** O Joaquim, o timer `zapp-ref-sync` e você (Claude no WSL) **não** são afetados.

### 4.2 Wrapper `git` (bloqueia quando `HERMES_AGENT=1`)
- Escrita em `~/projetos/*`, a cópia de referência, que é somente leitura.
- `push`/`pull`, `--force`, `--no-verify`, `--amend` depois de push.
- Criar ou trocar de branch, `checkout`/`restore` de branch alheio, merge de branch alheio, `fetch` com refspec, `FETCH_HEAD`, `@{u}`, `branch.*.merge`.
- `config` global e `config remote.*`.
- `-c` só com chave cosmética. Alias ou comando desconhecido é negado via `--list-cmds`.
  - **Furo antigo:** `git -c alias.p=push p` e `GIT_CONFIG_PARAMETERS`/`GIT_CONFIG_COUNT` faziam push real.
- `-c core.hooksPath`, `--git-dir`/`--work-tree`/`--exec-path` e `GIT_DIR` em escrita.
- `clean -x` e `stash -a`.
  - **Por quê:** apagavam o `.hermes-tarefa`.
- **Exceções autorizadas pelo Joaquim:**
  - HEAD destacado durante rebase do **próprio** branch da tarefa;
  - `origin/<branch próprio>~N`.

### 4.3 Wrapper `gh`
- Bloqueia `pr create/merge/close` (só os scripts fazem), `auth`, `secret`, `alias`, `extension`, `pr review`, `workflow run` de deploy, e `api` que não seja GET (POST, `-f` e mutation chegavam ao GitHub).
- `-R/--repo` antes do subcomando **burlava** o wrapper; fechado.
- Também bloqueados nas duas camadas: `supabase functions deploy` e `supabase db push`.

### 4.4 Pastas que o agente não pode escrever
`~/.local/bin`, `~/.local/libexec`, `~/.local/opt`, `~/.bun/bin`, `~/.local/deno` e `~/.secrets` (`/workspace/.secrets`).

**Por quê:** um chat escreveu um script novo em `~/.local/bin` para alterar a própria guarda e pediu ao Joaquim para rodar.

## 5. Camada 1 — hook do Windows (`%LOCALAPPDATA%\hermes\agent-hooks\hermes-guard.py`, ~41 KB)

### 5.1 Ligação no `config.yaml`
- `hooks:`
  - `pre_tool_call` com **`fail_closed: true`**: se o hook falhar, a ferramenta é bloqueada.
  - `post_tool_call`, `pre_llm_call` e `subagent_start`.
- `hooks_auto_accept: true`.
- Matcher: `terminal|execute_code|write_file|patch|delegate_task|skill_manage`.
- **O `config.yaml` é CRLF:** editar só por script que preserva o fim de linha. Nunca usar `hermes config unset`.

### 5.2 Registro de donos (`agent-hooks\state\workspaces.json`)
- `workspaces`: caminho do workspace → `{session, branch, projeto, criado, fechado}`. Em 04/10: **608 registrados, 10 abertos.**
- `parents`: sessão do subagente → sessão do chat pai. Hoje são **715**.
- `own_branches`: branches que o chat pode tocar, que é como a adoção de PR funciona.
- Regras:
  - **Um chat só usa o workspace dele.** Usar o de outro chat é bloqueado.
  - **Um chat só tem uma tarefa aberta.** Uma segunda é bloqueada.
  - Workspace órfão (sem dono) é adotado pelo primeiro chat que o usar.
  - A autocura só fecha um workspace se `test -d` devolver 1. O `wsl.exe` fica instável com cerca de 30 processos e devolve -1.
- Concorrência no Windows: o `_Lock` trata `PermissionError` como trava ocupada, e load/replace são retentados. Isso perdia cerca de 1 registro em 100; depois da correção, 0 em 240.

### 5.3 O que o hook bloqueia além do git/gh
- Os mesmos padrões de git/gh das camadas WSL, mais `sudo`, manipulação de PATH e escrita em `skills/` e `agent-hooks` pelo terminal.
- Escrever ou rodar scripts do repositório a partir de `~/projetos/<Projeto>`.
- O resultado do terminal chega como JSON com `\n` literal; ele é desembrulhado antes do regex.
- Exceção ou payload inválido = **bloqueio**.

### 5.4 Proteção da skill e do SOUL (o agente não reescreve as próprias regras)
- Skill `skills\promo\executar-plano\`: `SKILL.md` (~29 KB, v2.1 consolidada; é CRLF), `PLANO-modelo.md` e `PR-modelo.md`.
- `skill_manage` só aceita `patch` pontual dentro de "## Armadilhas já encontradas":
  - `old_string` único, sem cabeçalho novo, sem reescrita por `content`;
  - sem delete/edit/create, sem texto relativizando guardas e sem ensinar comando proibido;
  - até 2500 caracteres, com a seção limitada a `ARMADILHAS_MAX=12000`.
  - **Por quê:** um chat gravou como "armadilha" um diagnóstico **errado**.
- `SOUL.md` v3.0.0 (12 KB, 30/09): executor fiel, um chat = um plano, guardas, banco canônico e seção "Velocidade".
- **Regras, passos e ficha são só do Joaquim ou do Claude.** Quando um chat "aprende" algo, conferir antes de virar regra.

### 5.5 Subagentes
- O V4 Pro divide cada etapa e delega até **5 subagentes** `deepseek-v4-flash` (`delegation.max_concurrent_children: 5`).
- Subagente só investiga, edita e testa. O hook bloqueia nele: commit, `hermes-tarefa-*`, `hermes-db-migrar`, `gh pr`/`workflow run`/`run rerun`, DML via `zapp_db.py`, `delegate_task` e `skill_manage`.
- O subagente herda o workspace do pai pelo mapa `parents`.

### 5.6 Contexto injetado
O `pre_llm_call` lembra a cada turno o ciclo `iniciar → fechar → mergear → limpar`.

### 5.7 Log
`agent-hooks\state\guard.log` (~1 MB) registra **1.945 bloqueios** até 04/10. Os mais recentes são tentativas de escrever ou rodar scripts em `~/projetos` e de crescer a seção de armadilhas além do limite: a guarda está funcionando.

## 6. Banco e coordenação entre tarefas

### 6.1 `hermes-db-migrar <sql> [--dry-run] [--nova=<nome>] [--pos-merge] [--destrutivo-confirmado] [--ja-no-ledger] [--reserva-confirmada=<DECISAO_ID>]`
**Único caminho do agente para o banco.**
- Aplica o DDL e o INSERT no ledger numa **só transação**, via `~/projetos/mcp-clone-bwwbey/zapp_db.py`, que usa o gateway `mcp_exec` do Supabase `tnnnlkbymytvtqngbbqh`.
- Confere a identidade do banco (sha256 × `scripts/db-audit/database-identity.json`) e se a versão é maior que a última do ledger. Usa `pg_advisory_xact_lock`.
- **Classificação** por lexer (`sql_classe.py`):
  - **aditiva:** aplica na hora;
  - **contrato:** fica pendente até depois do merge;
  - **destrutiva:** exige `--destrutivo-confirmado` e também fica pendente.
  - Falsos positivos conhecidos de "destrutiva" (`REVOKE TRUNCATE`, `ALTER PUBLICATION DROP TABLE`, `DROP CONSTRAINT`) foram reclassificados como contrato. Afrouxar mais exige decisão do Joaquim.
- **Regras** (`mig_regras.py`):
  - R1 rollback no cabeçalho;
  - R2 RLS em tabela nova;
  - R3 destrutiva em arquivo separado;
  - R4 nome antigo fora do código.
- **Reserva de versão:** `--nova=<nome>` reserva via `reserve_migration_version` (holder `hermes-<SLUG>-<ID>`) e cria o arquivo. Bloqueia versão usada em outro workspace aberto ou reservada por outra tarefa. `--ja-no-ledger` compara versão **e nome**; exit 3 indica colisão.
  - **Por quê:** a V07 do Talk X ficou fora do banco porque duas tarefas usaram a mesma versão.
- **SHA da migration:** fica no marcador e também em `~/.local/share/hermes-guard/mig-sha/<arquivo>`, área protegida. `fechar` e `mergear` recusam SQL editado depois de aplicado.
- Log geral: `~/hermes-workspaces/.migracoes-aplicadas.log`.
- **Regra do repositório:** DDL não aditivo só depois do merge e do deploy (`db-migrate.yml`, environment `producao-ddl`).

### 6.2 Deploy de Edge Functions
- `hermes-edge-deploy <fn>` usa a trava global `~/hermes-workspaces/.locks/edge-deploy.lock` e a **fila FIFO por senha** `~/hermes-workspaces/.locks/edge-fila`.
- O workflow `deploy-functions.yml` guarda só 1 run pendente e cancela o anterior, por isso o deploy é um de cada vez.
- `_shared` alterado = todas as funções.
- Falha só na etapa "Capturar e validar manifesto remoto pos-deploy" conta como publicado (`OK_ATESTACAO`).
- Pendentes do Joaquim ficam em `.locks/edge-pendentes.log`.

### 6.3 Caixa de decisões (🔒)
- O chat que precisa de decisão humana roda `hermes-pedir-decisao`, que cria um arquivo em `~/hermes-workspaces/.decisoes/` com id único e SLUG saneado.
- `hermes-decisoes` lista o que está pendente.
- A resposta é `<id>.resposta.md`, gravada pelo Claude ou pelo Joaquim e protegida no hook contra o agente.
- Os chats anunciam decisões com 🔒; o Claude responde pela caixa ou pelo canal direto.

### 6.4 Avisos e canal direto
- `mergear --detach` exporta `HERMES_MERGEAR_AVISAR=1`. No fim, `avisar_chat.py` acha a sessão dona no `workspaces.json` e manda "[aviso automático do mergear] …" ao chat, retomando a sessão se ela não estiver viva. Registro em `~/.local/state/hermes-avisos.log`.
- **Canal direto** do Claude para os chats: `hermes-enviar.mjs` (no Windows, `C:\Users\Joaquim Ataides\.local\bin\`, roda com o node do Hermes). Ele acha a porta do `hermes serve` pelo processo e pelo netstat, pega o token que a página `/` do gateway entrega (sem ler arquivos de credencial) e usa JSON-RPC via WebSocket.
  - `--listar`;
  - `"<título ou chave>" "<mensagem>"`, que faz `prompt.submit` com o **id de runtime**, não a chave;
  - `--steer`;
  - `--retomar <id>`, `--interromper <chave>` e `--compactar <chave> [foco]`.
  - Só funciona com o app do Hermes aberto. Nunca imprimir o token.
  - **No WSL, esse script do Windows não roda direto.** Para usar a partir do WSL: `"/mnt/c/Users/Joaquim Ataides/AppData/Local/hermes/node/node.exe" "C:\\Users\\Joaquim Ataides\\.local\\bin\\hermes-enviar.mjs" --listar` (interop do WSL; testar antes, porque usa `powershell` e `netstat` do Windows).

### 6.5 Credencial de QA
- Usuário `qa.hermes@promobrindes.com.br` (admin), com senha no arquivo `/workspace/.secrets/zapp-v2.env` (modo 600, link `~/.secrets`). Os planos usam `ZAPP_QA_EMAIL` e `ZAPP_QA_PASSWORD`.
- O agente não escreve lá, e **você também não lê nem procura credenciais ali** (regra do Joaquim).

## 7. Furos que já foram achados e fechados (auditorias adversariais de 29–30/09)
Servem de checklist se você mexer em qualquer guarda:
- push disfarçado via alias, `-c`, `GIT_CONFIG_PARAMETERS`/`GIT_CONFIG_COUNT`;
- `gh api` mutante;
- `gh -R` antes do subcomando;
- `stash -a`/`clean -x` apagando o marcador;
- rebase de branch já publicado (decisão: integrar com merge de `origin/main`, nunca rebasear depois de publicar);
- script novo em pasta do PATH para alterar a guarda;
- skill editada pelo agente com diagnóstico falso;
- dois mergear no mesmo PR (`--detach` + flock);
- colisão de versão de migration (reserva + versão+nome);
- SQL editado após aplicado (SHA protegido);
- `mcp_exec` com heredoc expandindo `$$`;
- classificador SQL dizendo "aditiva" para DML/DDL depois de THEN/ELSE/LOOP em DO;
- lista de arquivos do PR cortada em 100 (`gh pr view`), agora paginada;
- perda de registro no hook sob concorrência.

**Incidente humano de 29/09:** o Joaquim ligou auto-merge pela interface do GitHub em 3 PRs, e 9 migrations entraram na main sem ir ao banco. Lição para ele: **nunca clicar em Merge, auto-merge ou Update branch na interface.** O chat mergeia pelo script. Depois disso, `allow_auto_merge=false` no repositório.
- **Atenção:** em 04/10 o Joaquim autorizou o Claude a fazer merge, e eu usei `gh pr merge --auto` no PR #1887 (sem migration, só `.graphifyignore`). Conferido em 04/10: `allow_auto_merge: true` no repositório, ligado de novo. Vale confirmar com o Joaquim se deve continuar assim, já que a regra de 29/09 era deixá-lo desligado.

## 8. Harnesses de teste (onde estão)
Copiados em 04/10 para **`~/hermes-guard-tests/`** (permanente). O original no scratchpad do Windows é temporário.

| Harness | Casos |
|---|---|
| `test-hook-v3.py` | 126, com HOME isolado e cópia da skill |
| `test-hook-evolucao.py` | evoluções posteriores (subagente, skill_manage, deploy) |
| auditor do ciclo (`audit-ciclo/h/`) | 140 do subagente |
| `audit-db/cases.py` | casos SQL; `sql_classe` com 91/91 e 80/80 |

O primeiro harness, `test-hook.py` (51 casos), já não existe; foi superado pelo v3.

Como testar o hook de verdade: mandar o payload JSON direto no script. O `hermes hooks test` sintético não passa `tool_input` como uma sessão real. Hook em Python precisa de `reconfigure(encoding="utf-8")` em stdin e stdout.

## 9. O que é seu e o que é do Joaquim

**Você (Claude no WSL) pode:**
- ler tudo isso;
- coordenar os chats (canal direto e caixa de decisões);
- responder 🔒 de decisões técnicas seguras;
- atribuir backlog a chat ocioso (memória `coordenador-sem-chat-parado`);
- corrigir bugs nos scripts com troca atômica e teste;
- mergear PRs com checks verdes (autorização de 04/10).

**Só o Joaquim decide:**
- afrouxar qualquer guarda;
- mexer em SOUL/skill/config do Hermes (o Claude Code já foi negado como "Self-Modification"/"Security Weaken"; o caminho é deixar um `patch-*.py` pronto em `agent-hooks\` para ele rodar);
- DDL destrutivo, deploy de produção com aprovação de environment e segredos/credenciais;
- custo e envio para número real.

**Em negação transitória do classificador** num comando somente-leitura já usado antes: relatar em 1 linha e seguir (memória `joaquim-autonomia-coordenacao`).

## 10. Estado em 04/10 e pendências

| Item | Valor |
|---|---|
| Workspaces registrados / abertos no hook | 608 / 10 |
| Worktrees de Zapp_Web_V2 no disco | 49 → **39 a mais que os abertos no hook**: candidatos a `hermes-tarefa-limpar` (conferir PR mergeado e sem pendência antes) |
| Bloqueios registrados | 1.945 |
| Outras pastas em `~/hermes-workspaces` | dezenas de pastas antigas (Sicoob, graphify-*, codex-*, chat-h*) de antes do sistema de worktrees; **não apagar sem o Joaquim** |
| Modelo do Hermes | `deepseek-v4-pro`, provider `deepseek`; delegação `deepseek-v4-flash` |

Pendências abertas herdadas:
- `mcp_exec` executa o statement 2× no fallback; `register-migration.mjs` quebra com `E''`; versões `20260927450000/510000` com nomes trocados entre repo e ledger; `fechar` aceita SQL editado após aplicado se o SHA da área protegida for apagado (M4, baixo).
- Achados de banco para planos: `mcp_exec` exposto ao `service_role`; `ALTER DEFAULT PRIVILEGES` global para funções; TRUNCATE/REFERENCES/TRIGGER concedidos a anon e authenticated.
- `gh` real em `~/.local/bin` contornável via PATH; deploy de Edge 1 a 1 é lento (20+ funções = horas); interação latente entre `update-branch` e `match-head` (strict=false); trava herdada por filhos órfãos.
- Atalho `Hermes (Painel)` da Área de Trabalho quebrado (chama `wsl -- hermes dashboard`).
- Confirmar com o Joaquim se `allow_auto_merge` (hoje `true`) deve voltar a `false` (seção 7).
- **Na Arquitetura V2** (caderno), o Hermes Kanban + sensor + Jev vão mudar a forma de distribuir tarefas. Este isolamento é a base que continua valendo: cada tarefa do Kanban deve continuar sendo uma tarefa `hermes-tarefa-*`.
