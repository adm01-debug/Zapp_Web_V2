# Handoff — sessão do Claude no Windows → Claude Code no WSL (04/10/2026)

Quem escreve: a sessão do Claude Code que rodava no **Windows** (Opus 5.5) e chamava o WSL com `wsl -e bash -lc`.
Para quem: o Claude Code que roda **dentro do WSL** (Ubuntu-24.04, usuário `joaquim_ataides`, iniciado em `~`).
Por quê: o Joaquim decidiu em 04/10 que "o certo é trabalharmos no wsl". A partir de agora o trabalho é seu; a sessão do Windows fica só de apoio.

Leia junto, nesta ordem:
1. A memória (já copiada para `~/.claude/projects/-home-joaquim-ataides/memory/`, 23 arquivos, idêntica à do Windows).
2. O caderno: `/mnt/c/Users/Joaquim Ataides/Desktop/ARQUITETURA_V2_DESCOBERTAS.md` (seções 0–12).
3. O mapa: `/mnt/c/Users/Joaquim Ataides/Desktop/MAPA_ZAPP_V2/README.md` e os arquivos que ele indexa.

---

## 1. Quem é o Joaquim e como trabalhar com ele

- TI da Promo Brindes, **não é desenvolvedor**. Orquestra nuvem e agentes de IA. Responder em português simples, explicar termos técnicos, ir direto ao ponto.
- Quer que eu **execute** os comandos, não que passe tarefas de terminal para ele (memória `executar-em-vez-de-delegar`).
- Cansa de ferramental montado sem necessidade: só instalar o que tiver uso claro.
- Pediu repetidamente: **"VAI ANOTANDO TUDO, ANTES DE IMPLEMENTARMOS, NÃO PERCA NENHUMA DESCOBERTA"** → toda descoberta vai para o caderno (`ARQUITETURA_V2_DESCOBERTAS.md`) e, se for durável, para a memória.
- Gosta de "exaustivo e real": medir com ferramenta, não estimar. Quando estimar, dizer que é estimativa.

## 2. Regras em vigor (não quebrar)

**Escopo**
- **Fase M aprovada, só Zapp Web V2.** "foque exclusivamente no zapp web v2 - não faça nada em qlq outro repositório". Repo `adm01-debug/Zapp_Web_V2`, banco canônico Supabase `tnnnlkbymytvtqngbbqh`.
- **Mapear antes de corrigir.** "PRIMEIRO PRECISAMOS MAPEAR TUDO QUE TEMOS, PARA DEPOIS INICIAR QLQ CORREÇÃO". Nenhuma correção antes do mapa fechar, salvo ordem explícita. O Joaquim **recusou** a exceção para o buraco anon (M-DB-02): "Não, só depois do mapa".
- **V2 é a versão oficial; V3 foi abandonado** (04/10).

**Segurança e credenciais**
- Nunca imprimir senhas ou tokens (nem em log, nem na tela). Mostrar só mascarado.
- Não caçar credenciais em `~/.secrets` nem em arquivos de config de outros serviços.
- Não contornar bloqueios do classificador de permissões, nem "lavar" a ação via chats do Hermes ou subagentes. Se bloquear: parar, explicar ao Joaquim, deixar ele decidir (rodar com `!` ou criar regra em `/permissions`).
- Agentes do Hermes não podem editar guardas, `.hermes-tarefa` nem `~/projetos`.
- **Nunca escrever no banco externo do PromoGifts.**
- Editar `CLAUDE.md` exige aprovação do Joaquim.
- Rotação de credenciais e segredos é tarefa do Joaquim.
- **Nenhuma mensagem real de WhatsApp.**
- **Nunca usar o conector "MCP - SUPABASE LOVABLE CLOUD - ZAPP WEB V2"**: aponta para um projeto antigo (ledger de junho, 10 migrations). Banco do Zapp só via `~/projetos/mcp-clone-bwwbey/zapp_db.py` (SQL pelo stdin; saída corta em ~4000 bytes → paginar).

**Autorizações dadas em 04/10**
- **Criar PRs e fazer merge no Zapp V2** ("eu autorizo vc a criar prs e mergear tb"). Usar `gh pr merge --auto --squash`, que respeita os 6 checks obrigatórios da main (🔍 Lint & TypeCheck, 🧪 Unit Tests, 🏗️ Build, 🔒 Security Audit, Contrato DB offline, 🎭 E2E Tests). Nunca furar check vermelho. Não usar `--no-verify`.
- **Tarefa automática a cada 15 min** (timer `zapp-ref-sync`) — autorizada explicitamente.
- **Enviar documentos, imagens e código do Zapp V2 para IA externa (DeepSeek)**, exceto a imagem `docs/catalogo/screens/D-selecionar-contato.jpg`. O classificador só liberou depois que o Joaquim criou a regra de permissão; **no WSL as permissões são separadas** — ele precisa adicionar `Bash(graphify extract*)` via `/permissions` na sua sessão.

## 3. Onde as coisas moram

| O quê | Onde |
|---|---|
| Cópia de referência do Zapp V2 (main, só leitura para agentes) | `~/projetos/Zapp_Web_V2` |
| Cópias de trabalho dos agentes do Hermes | `~/hermes-workspaces/Zapp_Web_V2/<tarefa>` (worktrees da referência) |
| Cópia de rascunho usada no mapa | `~/mapa-zapp-v2` (remotes: `origin` = referência local, `github` = GitHub) |
| Mapa da Fase M | `/mnt/c/Users/Joaquim Ataides/Desktop/MAPA_ZAPP_V2/` |
| Caderno da arquitetura | `/mnt/c/Users/Joaquim Ataides/Desktop/ARQUITETURA_V2_DESCOBERTAS.md` |
| Scripts/tokens da sessão Windows (scratchpad) | `/mnt/c/Users/JOAQUI~1/AppData/Local/Temp/claude/C--Users-Joaquim-Ataides/780989d0-7832-400c-9f14-0a987b5197c7/scratchpad/` — inclui `zpage.mjs` (paginador do zapp_db.py), `.sb_token` (Supabase Management API), `.devin_*`, `.jev_key`, `.devin_service_user_key`. Não imprimir o conteúdo. |
| Chave Gemini (não usar mais) | `~/.config/graphify/gemini.env` (600) |
| Chave DeepSeek (em uso) | `~/.config/graphify/deepseek.env` (600), variável `DEEPSEEK_API_KEY` |
| Provedor customizado do Graphify | `~/.graphify/providers.json` → `deepseek-vision` |
| Logs | `~/.local/state/zapp-ref-sync.log`, `~/.local/state/graphify-extract-*.log` |
| Backup do grafo só-AST (antes da IA) | `~/.local/state/graph-ast-backup.json` |

## 4. O que a sessão do Windows fez em 04/10 (cronológico)

### 4.1 Antes de hoje à tarde (resumo; detalhes no caderno e no mapa)
- Arquitetura V2 discutida e anotada (caderno seções 0–9): Claude coordena; Hermes Kanban + sensor por script; coordenador GPT-5.6 Sol só por evento; **Jev** como portão das entradas de máquina; workers DeepSeek; Codex/GPT para design; **Devin (plano MAX)** e `claude -p` para código complexo; push diário.
- **Jev (TypeSafe)** testado: 44 chamadas, ~US$0,002 (caderno seção 3; memória `jev-typesafe-testado`).
- **Devin** testado e documentado (seção 10; memória `devin-conta-e-uso`): API v3, MCP, CLI 3000.11.3 no WSL (`--sandbox` precisa de bwrap+socat, instalados), plano MAX por cota. Criado usuário de serviço `sensor-v2`.
- **Reauditoria R3 do GPT** verificada contra o banco vivo (seção 11). Achado: **motor Talk X parado** desde 04/10 03:07 (memória `zapp-talkx-tick-parado`).
- **Fase M (mapa)** executada. Arquivos em `MAPA_ZAPP_V2/`: `README.md` (índice e achados), `MAPA_BANCO.md`, `CRUZAMENTO_ACHADOS.md` (104 do GPT: 93 de pé, 11 a reverificar), `CRUZAMENTO_R2.md` (372 registros), `MAPA_EDGE_FUNCTIONS.md` (75 vivas = 73 do repo + 2 órfãs), `MAPA_INFRA.md`, `MAPA_CODIGO.md`, `dados/` (JSON brutos).
- **Sua sessão (WSL) já fez o re-pino** `2b4dac2d → bf266d2f` às 10:41 (`REPINO_bf266d2f.md`): sem drift, ledger 785 = 785 arquivos, nenhum PR aberto.

### 4.2 Graphify aplicado ao Zapp V2 ("então ja aplique ele, de acordo com seu planejamento")
1. **Graphify atualizado** de 0.9.48 para **0.9.68** (versão fixada pelo repo). Instalação atual, com os três extras numa linha só:
   `uv tool install --force "graphifyy[sql,anthropic,gemini]==0.9.68"`
   - **Não rodar `scripts/graphify/setup.sh`**: ele faz `uv tool install --force "graphifyy[sql]==..."` e derruba os outros extras.
   - O extra `gemini` é o que traz o pacote `openai`, usado pelos backends Gemini e DeepSeek.
   - A skill do Codex ainda é 0.9.48 (`graphify install --platform codex` atualiza; não é urgente).
2. **PR #1887** — `docs/reconciliation/` adicionado ao `.graphifyignore` (os relatórios de auditoria do PR #1869 punham 4.671 nós de texto no grafo e dominavam as buscas). **Mergeado** (squash), main = `bf266d2f8`.
3. **Hooks do Graphify** instalados na referência (`graphify hook install`): `.husky/post-commit` e `.husky/post-checkout` (ignorados pelo git). Mais um **`.husky/post-merge` local** criado por mim e listado em `.git/info/exclude`. Os hooks **saem sem fazer nada em worktrees** (só rodam no checkout principal) — os agentes consultam o grafo da referência.
4. **Grafo inicial só-AST** (sem IA): 27.385 nós, 0 de auditoria; busca por `record_incoming_call_event` passou a trazer código (`useIncomingCallListener.ts`, `events.ts`).

### 4.3 Sincronização automática da referência (autorizada)
- Script `~/.local/bin/zapp-ref-sync` + `~/.config/systemd/user/zapp-ref-sync.{service,timer}` (a cada 15 min, `Persistent=true`).
- Faz: só se estiver na `main` e sem alterações → `git fetch origin main` → `git merge --ff-only` (com `GRAPHIFY_SKIP_HOOK=1`) → **`graphify update .` síncrono** → log.
- **Armadilha descoberta:** serviço systemd `oneshot` mata processos deixados em segundo plano quando termina. O hook `post-merge` em background morria; por isso o rebuild é feito dentro do script.
- Desligar: `systemctl --user disable --now zapp-ref-sync.timer`.
- **Pausar o timer durante extrações com IA** (`systemctl --user stop zapp-ref-sync.timer` … `start`).

### 4.4 IA semântica no grafo ("quero um exaustivo e real de tudo")
**Gemini — abandonado**
- Chave testada (HTTP 200). Rodado com `gemini-3.5-flash --mode deep`.
- Primeiro erro: faltava o pacote `openai` → resolvido com o extra `gemini`.
- Depois: **429** em 31/50 lotes. Diagnóstico: cota `generate_content_free_tier_requests`, **limite 20 pedidos/dia/modelo** → o projeto `754579698711` está no **plano gratuito**, embora o Joaquim tenha dito "plano pago".
- Já foram enviados nesse plano gratuito 19 lotes (~1,16M tokens, ~US$0,81) de documentos e código do Zapp. Joaquim foi avisado. **Não usar mais essa chave; sugerir que ele revogue.**

**DeepSeek — em uso**
- Conta paga, saldo ~US$12,16 antes da extração.
- Modelos da conta: **`deepseek-flash`** (ENXERGA imagens — testado com `src/assets/emojis/emoji_check.png`, descreveu certo) e `deepseek-v4-pro` (não enxerga). O padrão do Graphify, `deepseek-v4-flash`, **não existe** nesta conta → sempre `--model deepseek-flash`.
- O backend `deepseek` do Graphify não tem `vision: true` → criado o provedor **`deepseek-vision`** em `~/.graphify/providers.json` (base `https://api.deepseek.com`, modelo `deepseek-flash`, `env_key DEEPSEEK_API_KEY`, `vision: true`, preço 0,44/1,32 por 1M).
- **Extração concluída** (documentos + código, `--mode deep`): **32/32 lotes ok; 28.754 nós, 62.241 arestas, 2.626 comunidades; 1,76M tokens in / 0,88M out; ~US$1,94.**
  - 2 arquivos voltaram vazios: `audit_report.pdf` e `PLANO_TEAM_CHAT_V3_PARITY_100_ETAPAS_2026-09-27.md` (uma nova passada retenta só eles).
  - Avisos de nós com o mesmo ID vindos de documentos diferentes (ex.: `talkx_blacklist`, `db_contacts`): o Graphify ficou com um e descartou o outro. Não é erro.

**Antes do envio: varredura local** dos 416 `.md/.txt` e OCR (tesseract) das 115 imagens.
- Nenhuma chave real (o único alerta era "disk-baseline").
- Nenhum CPF.
- Telefones e JIDs de WhatsApp todos de teste (98765…, 99999…, finais 55/66/77/88/99).
- E-mails: `@promobrindes.com.br` (equipe) e domínios de exemplo.
- Exceção: `docs/catalogo/screens/D-selecionar-contato.jpg` (possíveis números reais) → excluída via `.git/info/exclude` da referência.

## 5. Estado atual (04/10 ~11:00)

| Item | Estado |
|---|---|
| main do Zapp V2 | `bf266d2f8`, nenhum PR aberto (seu re-pino confirmou) |
| Referência `~/projetos/Zapp_Web_V2` | na main, limpa (só arquivos ignorados) |
| Grafo | `graphify-out/graph.json` com IA (DeepSeek, docs+código): 28.754 nós |
| Timer `zapp-ref-sync` | ativo; última atualização registrada 09:58 → `bf266d2f8` |
| Mapa Fase M | camadas todas "feito", re-pinado em `bf266d2f`; faltam Evolution e Cloudflare |
| Achados abertos (não corrigir antes do mapa fechar) | M-DB-01 Talk X parado (P0), M-DB-02 `record_incoming_call_event` anon (P0 segurança), TC-004 coluna `role` (P1), M-DB-04 99 tabelas vazias, M-DB-05 13 funções SECURITY DEFINER P3, M-INF-01 redeploy em massa, M-INF-02 dois projetos Vercel em produção, M-INF-03 domínios oficiais servindo V3 |

## 6. Próximos passos para você (em ordem)

1. **Pedir ao Joaquim a regra de permissão** na sua sessão: `/permissions` → Allow → `Bash(graphify extract*)` → User settings. Sem ela, o classificador bloqueia o envio para o DeepSeek ("Data Exfiltration").
2. **Passada das imagens:**
   ```bash
   cd ~/projetos/Zapp_Web_V2
   systemctl --user stop zapp-ref-sync.timer
   cp -a graphify-out/graph.json ~/.local/state/graph-before-images.json
   set -a; . ~/.config/graphify/deepseek.env; set +a
   PYTHONHASHSEED=0 graphify extract . --backend deepseek-vision --model deepseek-flash --mode deep > ~/.local/state/graphify-extract-images.log 2>&1
   systemctl --user start zapp-ref-sync.timer
   ```
   - Conferir que a imagem excluída não foi enviada.
   - Conferir se os 2 arquivos que vieram vazios foram retentados.
   - Conferir quanto custou (linha `tokens:` no log).
3. **Relatório do grafo:** `graphify cluster-only ~/projetos/Zapp_Web_V2` (dá nome às comunidades e refaz `GRAPH_REPORT.md`). Pode usar LLM para nomear: usar DeepSeek.
4. **Decidir com o Joaquim a passada diária com IA.** A parte de código já atualiza a cada 15 min sem IA. Proposta: 1× por dia, incremental, com DeepSeek (só reprocessa o que mudou). Isso é persistência + envio externo: **pedir autorização explícita** e criar como timer separado (não misturar com `zapp-ref-sync`).
5. **Registrar** os resultados no caderno (seção 12) e em `MAPA_ZAPP_V2/MAPA_CODIGO.md` (seção "Graphify aplicado").
6. **Fechar o mapa da Fase M:**
   - Evolution (conector deu 401) e Cloudflare (desconectado) dependem do Joaquim reconectar.
   - Depois disso, entregar a **lista de correções priorizada** (rascunho abaixo) e esperar o sinal verde.

### Rascunho da lista de correções (só depois do mapa fechar)
1. **M-DB-02:** fechar `record_incoming_call_event` (overload de 7 argumentos da migration T26 `20261002531230`, sem REVOKE) — REVOKE de anon/authenticated e checagem do chamador.
2. **M-INF-03 / M-INF-02:**
   - apontar `zapp.atomicabr.com.br`, `zappweb.app.br` e `www.zappweb.app.br` para o V2 (hoje servem a imagem V3 na stack `zapp-web-prod`, id 157, do Portainer);
   - consolidar a hospedagem: um projeto Vercel ou a VPS.
3. **M-DB-01, Talk X:**
   - isolar o purge num bloco EXCEPTION;
   - tirar o DELETE em `storage.objects`;
   - alinhar `outcome_unknown_24h`.
4. **TC-004:** `leave_team_group` e `remove_team_member` usam `role`; a tabela tem `member_role`.
5. Itens R3 e restantes do `CRUZAMENTO_*`.

## 7. Pendências do Joaquim (lembrar sem insistir)
- Adicionar `Bash(graphify extract*)` em `/permissions` no WSL.
- **Revogar a chave do Gemini** (projeto gratuito, já não serve).
- Revogar o token da Supabase Management API depois do mapa.
- Reconectar os conectores **Evolution** (401) e **Cloudflare**.
- Devin:
  - trocar o PAT "CLAUDE LOCAL";
  - revogar as chaves `apk_`;
  - mover a chave do `sensor-v2` para variável de ambiente.
- PAT do GitHub com `administration:read` para o Settings Guard.

## 8. Armadilhas já pagas hoje
- **PowerShell estraga** `$var` e aspas em `wsl -e bash -lc` (motivo da mudança para o WSL).
- **`pkill -f "graphify extract"`** mata o próprio shell, porque o padrão aparece na linha de comando. Usar `pgrep -f "graphify[ ]extract"` / `pkill -f "graphify[ ]extract"`.
- **systemd oneshot mata processos em background** ao terminar → trabalho síncrono no script.
- **`zapp_db.py` corta a saída em ~4000 bytes** → paginar com `{LIMIT}`/`{OFFSET}` (`zpage.mjs`).
- No PostgreSQL, repetição em regex é limitada a 255 (`{1,250}`).
- **`UNION` com `ORDER BY`/`LIMIT`** precisa de parênteses.
- **No R2, a prioridade vem em campos diferentes conforme a área:** usar `pri = /^P\d$/.test(priority) ? priority : severity`.
- **Bloqueios do classificador** que apareceram hoje e como foram resolvidos (todos legítimos):
  - auto-merge sem revisão → resolvido pela autorização do Joaquim;
  - timer persistente → resolvido por autorização explícita;
  - envio a IA externa → só passou com a regra em `/permissions`;
  - colar um texto meu de volta **não** conta como autorização.
- **Python não existe no Windows** (é um alias da Microsoft Store); no WSL há `python3`.

## 9. Custos de IA de hoje
- Gemini (gratuito, parcial): ~US$0,81 estimado pelo Graphify (sem cobrança real, por ser plano gratuito).
- DeepSeek: ~US$1,94 (docs+código). Saldo restante: aproximadamente US$10 (conferir com `curl -s -H "Authorization: Bearer $DEEPSEEK_API_KEY" https://api.deepseek.com/user/balance`).
- Jev: ~US$0,002.
