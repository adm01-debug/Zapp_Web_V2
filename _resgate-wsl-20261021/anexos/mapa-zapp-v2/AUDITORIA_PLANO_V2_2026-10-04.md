# Matriz de lacunas — Arquitetura V2 (plano × máquina)

Auditoria somente leitura, 04/10/2026 ~14:20–14:35 BRT, com o piloto rodando (2 cartões P0 no perfil `complexo`).
Fonte do plano: `Desktop/ARQUITETURA_V2_DESCOBERTAS.md` (seções 0–18), `MAPA_ZAPP_V2/README.md`, `BACKLOG_VERIFICADO.md` (acréscimos), `AGENTS_MAP.md`, `~/arquitetura-v2/LOTE_PENDENTE.md`.
Estados: **IMPL** = implementado e conferido · **PARCIAL** · **NÃO** = não implementado · **SUPERADO** = trocado por decisão posterior · **JOAQUIM** = depende só do Joaquim · **OUTRA** = da outra sessão (joaquim-ataides-37).
Impacto se ficar como está: A = alto, M = médio, B = baixo.

Comandos usados como evidência (todos só leitura): `hermes.exe kanban --board zapp-web-v2 list/show/runs`, `hermes.exe status`, `systemctl --user list-timers/cat`, `journalctl --user -u v2-sensor`, `git branch/log/ls-remote`, `gh api repos/adm01-debug/Zapp_Web_V2[...]`, `zapp-db-ler`, `hermes-tarefa-status --todos`, `devin rules list`, `docker ps`, `test_sensor.py` (12/12 ok), `testar_perguntas.py` (20/20, US$ 0,00042).

## 1. Decisões fechadas (seção 1)

| ID | Prometido | Estado | Evidência | Falta para fechar | Imp. |
|---|---|---|---|---|---|
| D1a | Trabalho 100 % local; branch `dia/AAAA-MM-DD`; 1 commit por cartão | IMPL | `git branch`: `dia/2026-10-04` @45850bdfa sem upstream; `git ls-remote --heads origin 'dia/*' 'v2/*' 'teste/*' 'local/*'` → 0; integrador faz squash por cartão (`integrar.log`) | — | — |
| D1b | Push 1×/dia às 18 h | SUPERADO | 13.7: push só quando o Joaquim pedir; nenhum timer de push existe | — | — |
| D1c | CI 1×; vermelho = `git revert` do commit culpado | NÃO | não há rotina nem script de revert; só existirá no dia do push | escrever o passo "revert do cartão culpado" no checklist do lote (`LOTE_PENDENTE.md`) | M |
| D2 | Hermes Kanban como espinha dorsal | IMPL | quadro `zapp-web-v2` ativo; `hermes status`: Gateway running, "Serves: complexo, coordenador, designer, worker" | — | — |
| D3 | 3–4 workers | SUPERADO | 13.4: 10 em degraus 6→8→10 | — | — |
| D4 | Supabase local, nunca produção; `db_guard` | IMPL | `~/.local/bin/zapp-db-guard` (código 97); `zapp-verify` passo `db_guard`; `hermes-db-migrar` V2 aplica no local (QA1); `docker ps`: stacks `supabase-v2-26100414188fce-*` e `-26100414190f4a-*` | ver linha 13.6-E (3 arquivos E2E ainda fixam o ref de produção) | — |
| D5 | Um Supabase por worktree (`supabase stack`) | IMPL | `zapp-db-local` l.22–23/83: `SUPABASE_EXPERIMENTAL_STACK=1`, CLI 2.119, `stack start --eager`; 1 stack completo por tarefa no `docker ps` | ver contradição C4 (13.4 decidiu "1 Supabase compartilhado + 1 banco clonado por agente") | — |
| D6a | Ronda camada 1: sensor por script, 60 s, sem modelo | IMPL | `v2-sensor.timer` ativo; journal: ~48 ciclos/h | — | — |
| D6b | Camada 2: coordenador (GPT-5.6 Sol) acordado só por evento | PARCIAL | `acoes.py` cria cartão `[sensor] …` para o coordenador; os 3 criados (t_0c80f460, t_5f3b0ac9, t_4a2597fd) **morreram no defeito `hermes_cli`** e estão `blocked` desde 14:15 (sticky); `.decisoes/` sem arquivo novo desde 03/10 (134 pedidos × 120 respostas) | desbloquear/arquivar os 3 e provar 1 ciclo completo do coordenador (acordar → decidir → gravar em `.decisoes/` → concluir) | A |
| D6c | Camada 3: Claude Code (`claude -p`) para irreversíveis/checkpoints, **disparado pelo sensor** | NÃO | nenhum código chama `claude -p` fora do comando fixo do cartão; cartão retido pelo portão fica em `revisao` até alguém abrir o Claude e rodar `integrar.sh --aprovar` | timer/ação que chame `claude -p` para revisar os retidos e os eventos de risco alto | A |
| D7 | Jev é portão nas duas pontas, chamado por script | IMPL | entrada: `acoes.py` (ExecStartPost do `v2-sensor.service`); saída: `integrar.sh` l.108 → `jev/portao_saida.py` | (o "loop" do vigia não está ligado: ver J4) | — |
| D8 | Jev não interpreta mensagens do Joaquim; coordenador sim | PARCIAL | não há canal de mensagem: `hermes status` → Telegram/WhatsApp/Slack/E-mail… "not configured"; o Joaquim só fala pelo app | definir o canal Joaquim↔coordenador (mesmo que seja o app) e o Jev como 2ª opinião | M |
| D9 | Código difícil: `claude -p` 1º, Devin 3ª linha após 2 falhas | SUPERADO | 10.5/13.4 empatam os dois; **na prática `acoes.py::comando_fixo` manda Devin PRIMEIRO** sempre que não há evento `devin_cota` (cartões P0 com `devin -p --permission-mode dangerous`) | registrar a regra real no caderno (ver C1) | M |
| D10a | Codex/GPT-5.6 Sol pelo provedor `openai-codex` (assinatura) | IMPL | `profiles/designer|coordenador/config.yaml`: `default: gpt-5.6-sol`, `provider: openai-codex`; `hermes status`: OpenAI Codex logged in | — | — |
| D10b | Comparar designer (Hermes) × `codex exec` no piloto | NÃO | piloto só tem os 2 P0 de migration | incluir 1 tela no piloto | B |
| D11 | Roteamento por regra fixa primeiro; Jev desempata (`design`→designer; `complexo`/2 falhas/N módulos→complexo) | PARCIAL | `acoes.py`: o Jev decide a rota direto; regra fixa só no pré-filtro de ação externa; "2 falhas → complexo" e rótulo `design` não existem | regras fixas antes do Jev; mover cartão com 2 falhas para `complexo` | M |
| D12 | Faixas ≥0,90 auto / 0,60–0,90 coordenador / <0,60 humano; falha fecha | IMPL | `perguntas.py::decidir`; `portao_saida.py` l.55/77 ("falha fecha"); entrada sem resposta fica sem marca (não atribui) | — | — |
| D13 | Limites por tarefa: 3 implementações, 3 reparos, 2 revisões, 2 replanejamentos, 60 min | PARCIAL | só `kanban.failure_limit: 2` em `config.yaml` l.135; 60 min e contagens estão só no texto do SOUL V2; o timeout real do Kanban é o padrão (4 h sem heartbeat) | trava determinística de 60 min (sensor ou Kanban) | M |
| D14 | Teto diário em US$ lido pelo sensor; acima dele **pausa o dispatcher** | PARCIAL | `sensor.py` l.38 `gasto_dia_usd: 15.0` só para DeepSeek (queda de saldo); evento `teto_gasto` **não está** em `EVENTOS_QUE_ACORDAM` (`acoes.py` l.29) e nada pausa o Hermes; Jev/Devin/ChatGPT fora da conta | ação real: `hermes pause`/ESTOP ou `max_in_progress 0` ao estourar; somar Jev e Devin | A |
| D15 | Só do Joaquim: segredos, CLAUDE.md, WhatsApp real, GitHub, rotação, migration destrutiva | IMPL | `prefiltro_entrada` + perguntas `ACAO_EXTERNA`/`DADOS_ENVIO`; `hermes-db-migrar` exige `-- Rollback:` e recusa destrutiva para agente; guarda fail-closed | — | — |
| D16 | Só do Claude: push, merge com risco alto, arquitetura | IMPL | `mergear`/`edge-deploy`/`integrar.sh` recusam `HERMES_AGENT=1` (exit 75); aprovação só em `~/.local/libexec/hermes-guard/v2-aprovacoes/<id>` (há 1: 2610041351ec59, teste) | — | — |
| D17 | Rejeitados: Conductor, claude-mem, Headroom, jev-model-router | IMPL | nada instalado (`find ~/.claude … claude-mem/headroom` vazio) | — | — |
| D18a | Cartographer adiado | SUPERADO | README Fase M: "Cartographer dispensado por ora" | — | — |
| D18b | Devin adiado para a Fase 3 | SUPERADO | Devin já é o executor dos 2 P0 (heartbeat t_fcd3c9c8 14:20: "devin em execução") | — | — |
| D19 | grill-me antes de cada funcionalidade nova | NÃO | `find ~/.claude ~/.agents ~/.config/devin/skills …/hermes/skills -iname '*grill*'` → nada | instalar `mattpocock/skills/grill-me` (o Claude é bloqueado pelo classificador → `!` do Joaquim) e pôr no SOUL do coordenador | B |

## 2. Fatos e regras derivadas (seções 2, 2-bis, 3, 3-bis, 4, 5)

| ID | Prometido | Estado | Evidência | Falta | Imp. |
|---|---|---|---|---|---|
| F1 | Issue #35829: comando fixo no cartão, nunca o modelo "lembrar" | IMPL | comentário `[jev-entrada] … COMANDO FIXO` nos 2 P0; heartbeat 14:21 "Iniciando o comando fixo (devin -p)" | — | — |
| F2 | Nunca ligar cartão bloqueado ao cartão que o desbloqueia (deadlock) | IMPL | cartões `[sensor]` criados com `parents: []` | — | — |
| F3 | Medir a cota semanal do ChatGPT desde o dia 1 | NÃO | sensor e resumo não leem nada do ChatGPT | ler `/usage` do Codex ou contar execuções | M |
| F4 | Pi Agent se o worker Hermes ficar < ~60 % | NÃO (condicional) | perfil `worker` ainda sem nenhum cartão | medir no piloto | B |
| F5 | Entrega de design passa por screenshot no checkpoint | NÃO | nenhum cartão de designer ainda | prova visual obrigatória no SOUL do designer + portão | B |
| F6 | Docker no WSL (1ª tarefa da Fase 0) | IMPL | Docker 29.7.2; `docker ps` com stacks | — | — |
| F7 | `supabase stack` existir | IMPL | CLI 2.119 em `~/.local/opt/supabase-2.119` (2.115 segue global) | — | — |
| F8 | Composio AO como plano B | NÃO (condicional) | não acionado | só se o Kanban falhar | B |
| J1 | Fixar a versão do Jev | IMPL | `perguntas.py` l.16 `MODELO = "jev-1.13.0"`; `jev.py` l.13 default igual | — | — |
| J2 | Perguntas em arquivo versionado com caso de teste | IMPL | `testar_perguntas.py` 20/20 hoje (US$ 0,00042) | — | — |
| J3 | Validar no nosso código: score de 1 nível / choice de 1 opção / estado vazio | NÃO | `jev.py` (1,4 KB) não valida | validação simples antes do `ask` | B |
| J4 | Jev "vigia de loop" por heartbeat | NÃO | `LOOP` definido (`perguntas.py` l.42) e testado, mas nenhum chamador em `sensor.py`/`acoes.py`; `sem_heartbeat` é só por tempo | ligar `LOOP` às notas de heartbeat dos cartões `running` | M |
| J5 | Jev como 2ª opinião sobre mensagens do Joaquim | NÃO | não há canal (ver D8) | — | B |
| J6 | Jev Observer (1 semana) → Advisory → Active | NÃO (pulado) | o portão bloqueia/atribui desde o 1º cartão (`t_fcd3c9c8` bloqueado por "Jev inseguro" e liberado à mão) | aceitar formalmente o "Active com falha que fecha" ou rodar em observação | M |
| J7 | Cortar o estado enviado ao Jev (~30k tokens) | IMPL | `acoes.py`: `texto[:20000]`; portão de saída: diff > 60k → revisar | — | — |
| J8 | Skill TypeSafe instalada (Claude, Hermes, Devin) | IMPL | `typesafe:typesafe-ai` disponível no Claude; `profiles/*/skills/software-development/typesafe-ai` nos 4 perfis; symlink no Devin | — | — |
| J9 | Chave do Jev só em variável/arquivo protegido | IMPL | `~/.config/jev/jev.env` (600, `JEV_API_KEY`) | rotação (chave colada no chat) → JOAQUIM | — |
| L1 | Limpeza automática de worktree ao concluir | PARCIAL | `hermes-tarefa-limpar` modo V2 existe mas é manual; `integrar.sh` não limpa; `~/hermes-workspaces` = 45 GB, 90 pastas; stacks sobem com `--eager` (não desligam sozinhos) | limpar + `zapp-db-local down` no integrador após `INTEGRADO` | M |
| L2 | Aprovações do Joaquim chegam sem ronda (needs_input → mensagem curta) | NÃO | resumo horário não lista "o que espera decisão"; nenhum envio | seção "espera o Joaquim" no `V2_RESUMO.md` | M |
| L3 | Um teste por detector do sensor | PARCIAL | `test_sensor.py` 12 testes; sem teste para `hermes_pausado`, `distancia_main`, `banco_travando` e para `acoes.py` | completar | B |
| L4 | Plano de reversão | PARCIAL | comandos espalhados (caderno 12-ter, `ligar-automacao.sh`); sem roteiro único | 1 arquivo "como desligar tudo" | B |

## 3. Blueprint e sensor (seções 6, 11.4, 13.5, 13.7, 13.9, 15-bis)

| ID | Prometido | Estado | Evidência | Falta | Imp. |
|---|---|---|---|---|---|
| S1 | Detector: cartão bloqueado | IMPL | `estado.json` eventos `bloqueado` | — | — |
| S2 | Detector: 2 falhas | IMPL | eventos `falhas_repetidas` 14:13 | — | — |
| S3 | Detector: sem heartbeat | IMPL | `LIMITES.heartbeat_min 20` + teste | — | — |
| S4 | Detector: conflito de arquivos entre worktrees | IMPL | `arquivos_alterados` compara com `BASE_DIA` (QA3) | — | — |
| S5 | Detector: **teste vermelho na branch do dia** | NÃO | nenhum código roda teste na `dia/*` | rodar `zapp-verify full` na ponta da branch do dia (turno da noite ou a cada N integrações) | A |
| S6 | Detector: **Supabase local fora** | NÃO | ausente em `sensor.py` | checar Docker + stacks das tarefas `running` | M |
| S7 | Detector: **agente ocioso** | NÃO | ausente (`cartao_sem_dono`/`fila_parada` medem outra coisa; issue #125239 "vaga ociosa ~1 h" não vigiada) | vagas livres × cartões `ready` há > N min | M |
| S8 | Detector: gasto > teto | PARCIAL | ver D14 | — | A |
| S9 | Detector: cron de produção com ≥ 5 falhas | IMPL | evento `cron_falhando talkx-scheduler-1min` (ativo) | — | — |
| S10 | Detector `out_of_quota` do Devin → pausar criação de sessões | PARCIAL | detecta (`avaliar_devin`); `comando_fixo` passa a sugerir `claude -p`; nada é pausado | — | M |
| S11 | Sensor detecta Hermes/gateway parado e **reinicia** | NÃO | sensor só olha o arquivo `ESTOP`; não testa o gateway | checar processo/`hermes status` e religar (ou alertar) | A |
| S12 | Distância da branch local para a `main` | PARCIAL | `ler_distancia_main` conta `origin/main..dia` (commits à frente); não mede quanto a `main` andou | medir também `dia..origin/main` | B |
| S13 | Detector `banco_travando` (M-DB-06) | IMPL | `sensor.py` (≥3 timeouts/10 min) | — | — |
| S14 | Sensor dá DELETE nas sessões de nuvem do Devin ao receber a saída | NÃO | sensor só observa | relevante só se voltar a usar a nuvem | B |
| S15 | Leitura do SQLite do Hermes robusta (QA3) | PARCIAL | retry existe, mas journal 14:27: `"kanban": "SQLite do Hermes indisponível: disk I/O error"` | copiar o .db para o WSL antes de ler, ou ler pela CLI | B |
| V1 | Cada cartão: `verify` com typecheck, lint, **unit, build**, db_guard | PARCIAL | `fechar` (l.66) e `integrar.sh` (l.138) chamam só `zapp-verify --rapido` → pula `testes` e `build` e o passo `banco_local` (`zapp-verify` l.30–34) | portão final com testes unitários + build (+ `banco_local` quando o diff toca `supabase/`) | A |
| V2 | `verify:db` no portão final quando o diff toca banco | NÃO | idem: nenhum portão passa o nome do banco | idem | A |
| V3 | Fila de typecheck: no máximo 4 simultâneos | NÃO | `zapp-verify` sem `flock`/semáforo | semáforo antes do passo `tipos` (pico 2,5 GB cada) | M |
| O1 | Sempre ligado: sensor (60 s) e integrador | IMPL | `v2-sensor.timer`, `v2-integrador.timer` (2 min), Linger=yes | — | — |
| O2 | **Turno da noite**: suíte completa, E2E local, re-pino do mapa, grafo | NÃO | nenhum timer noturno em `~/.config/systemd/user/` | timer 02:00 com `zapp-verify full` + `zapp-e2e-local` na branch do dia | A |
| O3 | **Reabastecimento**: fila de prontos < N → coordenador puxa do `BACKLOG_VERIFICADO.md` | NÃO | nenhum evento "fila baixa"; só 2 cartões existem para 499 itens | evento + cartão para o coordenador | A |
| O4 | Racionamento de cota (Devin semanal dividido por dia; pausar executor sem cota) | NÃO | — | contador de sessões Devin/dia | M |
| O5 | PC sem suspensão | IMPL | `powercfg`: STANDBYIDLE AC = 0 | — | — |
| O6 | Windows Update fora do horário | PARCIAL | ActiveHours 06–22 → reinícios automáticos caem na madrugada, justamente no horário 24 h | decidir janela de reinício (ex.: domingo) | M |
| O7 | Tarefa "WSL Watchdog" | IMPL | `schtasks`: a cada 10 min + no logon (`wsl-doctor.ps1 -Check`) | — | — |
| O8 | Hermes sobe com o Windows | PARCIAL | `Startup\Hermes_Gateway.vbs` → sobe no **login**, não no boot; `hermes status`: "Manager: manual process" | logon automático ou serviço | M |
| O9 | Fila do Joaquim que não trava o resto | PARCIAL | bloqueio `needs_input` só no cartão; não aparece no resumo | ver L2 | M |
| O10 | Salvaguardas (nada a número real, DDL destrutivo só no lote, segredo nunca lido) | PARCIAL | envio real e DDL: cobertos (pré-filtro, Jev, `db-migrar`); **leitura de segredo pelo Devin não é bloqueada**: deny `Read(**/.env*)` não cobre `~/.config/devin/admin.env`, `jev.env`, `sensor-v2.env`, `~/.config/graphify/deepseek.env` e o Devin roda `--permission-mode dangerous` como o usuário | negar `Read(~/.config/**)` e `Read(/mnt/c/**/hermes/.env*)` no `.devin/config.json` da tarefa, ou contêiner por worker (15) | A |
| R1 | Resumo horário sem IA em `Desktop\V2_RESUMO.md` + histórico | IMPL | `v2-resumo.timer` hourly; `resumos/2026-10-04.md` | — | — |
| R2 | Conteúdo do resumo: por agente, entrou/terminou/travou, cota Devin/ChatGPT/Claude, gasto DeepSeek e Jev na hora/dia, distância da main, decisões do Joaquim | PARCIAL | traz só contagem por status, saldo DeepSeek, nº de sessões Devin, alertas | completar os campos | M |

## 4. Fases (seções 6-bis, 7, 7-bis, 7-ter, 9)

| ID | Prometido | Estado | Evidência | Falta | Imp. |
|---|---|---|---|---|---|
| M1 | Fase M: mapa completo antes de corrigir | IMPL | `MAPA_ZAPP_V2/README.md` "Fase M fechada"; `BACKLOG_VERIFICADO.md` 499 linhas | — | — |
| M2 | Mapa dos outros 8 repositórios (7-ter d) | SUPERADO | README: "escopo exclusivo Zapp Web V2" | — | — |
| M3 | `AGENTS_MAP.md` fiel ao estado | PARCIAL | ainda diz "Hermes não configurado", "Sensor não existe", "WSL 32 GB" — feito antes da Fase 1 | atualizar | B |
| M4 | Evolution (401) e Cloudflare sem acesso no mapa | JOAQUIM | README "Limites conhecidos" | credenciais | B |
| P0 | Fase 0 (Docker, stack, verify, db_guard, revert) | OUTRA | ferramentas `zapp-db-local/guard/verify` e commits `640cb77d2…45850bdfa`; "revert por commit" não existe (D1c) | — | — |
| P1 | Fase 1 (sensor + 8 detectores, perguntas, perfis, teto, logins) | PARCIAL | sensor/perguntas/perfis/logins ok; faltam 3 detectores (S5–S7), teto com corte (D14) | ver linhas S/D14 | A |
| P2 | Fase 2 piloto: TEL-000 (worker), tela designer × `codex exec`, bug cruzado `claude -p`; medir custo, tempo, acerto, cota | PARCIAL | piloto = só 2 P0 de migration no `complexo` via Devin; nenhuma medição gravada | incluir worker e designer; planilha de medição | M |
| P3 | Fase 3: Jev Active, Devin 3ª linha, proteção do GitHub, Cartographer | SUPERADO/IMPL | Jev Active e Devin já em uso; GitHub: `strict=false`, 6 checks obrigatórios, `allow_auto_merge=false` | — | — |
| Q1 | Perguntas abertas da seção 9 (proporção do worker, designer × codex, cota ChatGPT, limiares calibrados, Pi Agent) | NÃO | nenhuma resposta medida | responder no piloto | M |
| Q2 | Plano do Devin | IMPL | 10.5-bis: Max | — | — |

## 5. Devin (seções 10.x, 15, 15-bis)

| ID | Prometido | Estado | Evidência | Falta | Imp. |
|---|---|---|---|---|---|
| DV1 | Devin e `claude -p` como executores de código difícil (10.5-1) | IMPL | P0s rodando com `devin -p` | — | — |
| DV2 | Outpost no WSL (10.5-2) | SUPERADO | 15/15-bis: Outpost não isola; executor = CLI local | — | — |
| DV3 | Um contêiner por worker do Devin, montando só a worktree, sem credencial de push (15) | NÃO | Devin roda direto no WSL como `joaquim_ataides` | contêiner `devin-cli:stable` por cartão — ou ao menos o deny de leitura de O10 | A |
| DV4 | Devin Review no PR do dia (10.5-3) | JOAQUIM | 11.4: decisão dele; 15: só no dia do push | decidir | B |
| DV5 | Automação "Fix CI Failures" (10.5-4) | JOAQUIM | 0 automações (10.1); conflita com 13.7 (a nuvem cria branch no GitHub) | decidir (recomendação: não, enquanto o push for sob pedido) | B |
| DV6 | Vincular ChatGPT ao Devin (10.5-5) | SUPERADO | 10.5-bis: não vincular | — | — |
| DV7 | Rotacionar PAT "CLAUDE LOCAL" (10.5-7, 11.4) | JOAQUIM | `~/.config/devin/admin.env` intocado desde 11:49 com o comentário "ROTACIONAR"; AGENTS_MAP: "ainda funcionam"; teste por HTTP **barrado pelo classificador** nesta auditoria | painel app.devin.ai → Devin API → PATs → Rotate; depois apagar `DEVIN_PAT` do `admin.env` | A |
| DV8 | Revogar as 2 chaves `apk_` legadas | JOAQUIM | idem (15-bis: "ainda funcionam") | painel → API Keys → revogar | A |
| DV9 | Service user `sensor-v2` no ambiente do sensor | IMPL | `~/.config/devin/sensor-v2.env` (600); arquivo do scratchpad não existe mais | tratar como chave sensível (Member lê tudo) | — |
| DV10 | Tirar `E2E_TEST_PASSWORD` (produção) dos testes do Devin; usuário de teste local | PARCIAL / JOAQUIM | usuário local `e2e.zapp@` existe no banco local (17.1); segredo na org do Devin não verificável sem credencial; workflows do repo ainda usam `E2E_TEST_PASSWORD` (`ci.yml` 1, `e2e-logado.yml` 5) | remover o segredo da org (painel) | M |
| DV11 | Padronizar prompts (sem `git commit --no-verify`) | PARCIAL | `AGENTS.md` do Devin l.95 proíbe `--no-verify`; prompts dos Dynamic Workflows não revistos | revisar os workflows salvos | B |
| DV12 | `AGENTS.md` global do Devin < 16 KiB | IMPL | `~/.config/devin/AGENTS.md` = 12.182 bytes | — | — |
| DV13 | `AGENTS.md` do Devin alinhado à V2 | NÃO | ainda V1: l.26 "PR pronto e mergeado pelo `hermes-tarefa-mergear`", l.87 "Só `hermes-tarefa-fechar` faz push e abre PR", l.111 banco = `tnnnlkbymytvtqngbbqh`, "aditiva → aplico na hora", até 5 subagentes | reescrever para o ciclo V2 (local, commit, fila, sem push) | M |
| DV14 | Sensor cria sessões pela API v3 (nunca um perfil "lembrando") | SUPERADO | executor é a CLI pelo comando fixo do cartão | — | — |
| DV15 | `bubblewrap`+`socat` e `devin --sandbox` em vez de bypass | PARCIAL | instalados; 15-bis: sandbox + hermes-guard incompatíveis → usa `dangerous` | ajustar o guard para o `GIT_SSH_COMMAND` do sandbox | M |
| DV16 | `read_config_from.claude=false` nas worktrees | IMPL | `.devin/config.json` das 2 tarefas do piloto | — | — |
| DV17 | Bloquear push do Devin (deny + guard) | IMPL | `.devin/config.json` nega `git push`, `gh`, `supabase`, `git remote/config`; guard bloqueou push (15-bis) | — | — |
| DV18 | Limpar `AGENTS.md` velhos de `/tmp` nas rules | IMPL | `devin rules list` → só CLAUDE, global_rules, AGENTS | — | — |
| DV19 | Recarga automática de créditos DESLIGADA | JOAQUIM | só no painel | conferir | M |
| DV20 | Perguntas ao suporte do Devin (limites de API, service user no Max, `deny` em bypass, Outpost) | NÃO | — | enviar | B |
| DV21 | Tarefas < 90 min com verificação | PARCIAL | SOUL fala em 60 min; sem trava (D13) | — | M |

## 6. Hermes, isolamento V1 e operação (seções 13.4, 13.6, 13.8, 13.10, 14, 18)

| ID | Prometido | Estado | Evidência | Falta | Imp. |
|---|---|---|---|---|---|
| H1 | Perfis `worker`(v4-flash), `designer`/`coordenador`(openai-codex), `complexo` | IMPL | `profiles/*/config.yaml` l.1–3 | — | — |
| H2 | Subagentes 5 → 1–2 | IMPL | 1/1/1/2 nos perfis V2 (`default` V1 segue 5, não usado no piloto) | — | — |
| H3 | `max_in_progress` 6, por perfil 4, `dispatch_interval 10`, `failure_limit 2` | IMPL | `config.yaml` l.130–135 | — | — |
| H4 | Escalonamento 6 → 8 → 10 só se cartões/h sobem e conflito < 20 % | PARCIAL | degrau 1 ligado; ninguém mede cartões/h nem taxa de conflito | métrica no resumo | M |
| H5 | Faixas por área; **migrations numa faixa única serial**; cartões relacionados no mesmo executor | NÃO | Jev classifica `faixa`, mas nada a aplica; os 2 P0 (ambos `migrations`) rodam em paralelo — caderno 16.4 admite | serializar a faixa `migrations` no portão de entrada | M |
| H6 | WSL 32 → 48 GB | IMPL | `.wslconfig` `memory=48GB`; `free -g` total 47 | — | — |
| H7 | Gateway instalado | IMPL | `hermes status`: running, PID 20476 | — | — |
| H8 | Correção `HERMES_BIN` (workers morriam com `No module named 'hermes_cli'`) | IMPL | `Hermes_Gateway.cmd` l.9 e `HKCU\Environment\HERMES_BIN`; runs 12/13 com heartbeat | conferir após reinstalar o gateway | — |
| H9 | SOUL V2 nos 4 perfis | IMPL | "Arquitetura V2" nos 4 `SOUL.md` | — | — |
| H10 | Skill V1 `promo/executar-plano` fora dos perfis V2 | NÃO | presente em `profiles/worker/skills/promo/executar-plano` (l.35 "Só `hermes-tarefa-fechar` faz push e abre PR") | remover/desativar nos 4 perfis | M |
| H11 | Remover `SUDO_PASSWORD` | PARCIAL | `.env` e `.env.bak-v2-20261004` só com a linha comentada (l.261); **`.env.bak.omniroute-20260906` l.515 ainda tem o valor** | apagar o valor desse backup | M |
| H12 | Limpar provedores mortos (Alibaba 403, omniroute, GLM) | NÃO | `ALIBABA_CODING_PLAN_API_KEY`, `HERMES_CUSTOM_OMNIROUTE_API_KEY`, `GLM_API_KEY` no `.env` e nos 4 perfis | remover | B |
| H13 | Consertar `hermes update --check`; conferir #117734 e #125239 | NÃO | sem registro de correção (não executado aqui: `update` escreve) | — | M |
| H14 | Modo V2 dos scripts (`iniciar/fechar/mergear/db-migrar/edge-deploy`) | IMPL | flag `MODO_V2`; `iniciar` l.110 grava `MODO=V2/BASE_DIA/DB_LOCAL` (conferido no `.hermes-tarefa` do piloto) | marcador ainda carrega `BASE=main` e `DB_REF=<produção>` herdados da V1 (cosmético, confunde) | B |
| H15 | Integrador com portão do Jev, CAS, quarentena, aprovação | IMPL | `integrar.log` (INTEGRADO/RETIDO/APROVADO 12:26–14:05); última verificação VERDE 99 s | — | — |
| H16 | `hermes-tarefa-status` entende tarefas V2 | NÃO | `--todos` compara com `origin/main` → acusa 8 "arquivos em conflito" falsos entre os 2 P0 (são os 4 commits da `dia/2026-10-04`) | usar `BASE_DIA` como o sensor (QA3) | B |
| H17 | `hermes-tarefa-limpar` no modo V2 | IMPL | 16.3 testado | — | — |
| I1 | 13.6-A `db-migrar` só no banco local | IMPL | QA1 corrigido | — | — |
| I2 | 13.6-B `fechar/mergear` sem push | IMPL | `mergear` recusa agente | — | — |
| I3 | 13.6-C workspace fora de `<repo>/.worktrees` | IMPL | `ls ~/projetos/Zapp_Web_V2/.worktrees` → não existe; tarefas em `~/hermes-workspaces/Zapp_Web_V2/` | — | — |
| I4 | 13.6-D testar se o worker do Kanban é registrado pela guarda | NÃO verificado | sem registro do teste | testar | B |
| I5 | 13.6-E E2E contra o banco local | PARCIAL / OUTRA | `git grep tnnnlkbymytvtqngbbqh dia/2026-10-04 -- e2e/` → `catalog.spec.ts`, `fixtures/mapa-mocks.ts`, `fixtures/talkx-demo.ts`; E2E local 50 ok / 33 falhas | adaptar os 3 e investigar as 33 | M |
| I6 | 13.6-F memória "não parar a ronda" obsoleta | NÃO | `~/.claude/projects/-home-joaquim-ataides/memory/joaquim-autonomia-coordenacao.md` ainda diz "criar PR, mergear, editar o banco" | marcar como superada pela 13.7 | M |
| I7 | `allow_auto_merge` desligado | IMPL | `gh api repos/adm01-debug/Zapp_Web_V2` → `false` | — | — |
| I8 | Congelamento V1 (CONGELADO + chats arquivados) | IMPL | `~/.local/libexec/hermes-guard/CONGELADO`; `MAPA_ZAPP_V2/chats_hermes_v1/` | — | — |
| I9 | ESTOP retirado só com a V2 pronta | IMPL | `ESTOP` não existe; retirado pelo Joaquim no piloto | — | — |
| I10 | "9 tarefas V1 estacionadas" voltam no modo V2 | PARCIAL / JOAQUIM | `hermes-tarefa-status --todos` mostra **18** workspaces V1 sem PR (inclui `talkx-vinculo-crm-lote` com `DDL_pendente=1`, `workspace-extra` PR 1193, 5 órfãos audit-a*/bloco-b, E37) | decidir caso a caso; conferir o DDL pendente | M |
| I11 | Caixa 🔒: 14 abertas | JOAQUIM | `.decisoes/`: 134 pedidos × 120 respostas | responder | M |
| I12 | Remover workspace órfão E37 | JOAQUIM | classificador barrou o Claude; `limpar` recusa | Joaquim ou regra de permissão | B |
| I13 | Cartões `[sensor]` órfãos no quadro | NÃO | t_0c80f460, t_5f3b0ac9, t_4a2597fd `blocked` (crash `hermes_cli`) | arquivar ou desbloquear | M |

## 7. Banco, Graphify, QA e piloto (seções 11, 12, 16, 17, 18)

| ID | Prometido | Estado | Evidência | Falta | Imp. |
|---|---|---|---|---|---|
| B1 | M-DB-01 tick do Talk X destravado | PARCIAL | cartão `t_5083facb` running (Devin); produção: último `talkx-scheduler-1min` = `failed` 17:25 UTC | integrar + lote do push | A |
| B2 | M-DB-02 `record_incoming_call_event` fechado | PARCIAL | cartão `t_fcd3c9c8` running; produção: overload 7 args `anon=True auth=True` | integrar + lote | A |
| B3 | QA5-01: `mcp_exec` do servidor executa qualquer texto como `postgres` (P0) | NÃO | só no `BACKLOG` (acréscimos QA); **nenhum cartão** no quadro | cartão P0 (complexo, revisão do Claude) | A |
| B4 | QA5-02: 112 SECURITY DEFINER com `authenticated` | NÃO | backlog | quebrar em cartões | M |
| B5 | QA5-03 `record_talkx_campaign_lifecycle_event` PUBLIC | NÃO | backlog (o cartão do M-DB-02 pede tratar na lista de exceção) | — | B |
| B6 | QA5-04 CI sem schema `storage` | NÃO | backlog; o cartão M-DB-01 exige a fixture | — | M |
| B7 | `zapp-db-ler` v2 (pglast) | IMPL | arquivo 13:43; leituras desta auditoria passaram | — | — |
| B8 | Regra de permissão para ler produção | IMPL | `settings.local.json`: `Bash(zapp-db-ler:*)` | — | — |
| B9 | Detector `cron.job_run_details` ≥ 5 falhas | IMPL | ver S9 | — | — |
| B10 | Conector "LOVABLE CLOUD ZAPP WEB V2" proibido em plano/sensor/skill | IMPL | nenhum uso nos scripts V2 | — | — |
| B11 | Remover esse conector do claude.ai | JOAQUIM | — | painel do claude.ai | M |
| B12 | Registrar a proibição no `CLAUDE.md` do Zapp | NÃO | `dia/2026-10-04:CLAUDE.md` l.76 ainda o descreve como utilizável ("src_query read-only… conferir sempre") | trocar por "PROIBIDO" (alteração de CLAUDE.md = aprovação do Joaquim) | M |
| B13 | IA do Zapp com DeepSeek 401 (trocar o segredo no Supabase) | JOAQUIM | 12-quinquies; caixa 4fe7 | trocar a chave | M |
| B14 | M-DB-06 timeouts do pg_cron (plano/instância) | JOAQUIM | backlog: "dono (plano/instância)" | métrica CPU/memória do Supabase | M |
| B15 | M-DB-04 99 tabelas vazias: decidir módulos | JOAQUIM | backlog A_DECIDIR | — | B |
| B16 | Migration de reconciliação `20261003272707` aplicada na produção no lote | JOAQUIM / OUTRA | `LOTE_PENDENTE.md`; sem ela o `db-live-guard` fica vermelho após o merge | no dia do push | M |
| B17 | Regra do banco no `CLAUDE.md` (seção 0) | OUTRA | commit `f4744ac07` na `dia/2026-10-04` (só local) | entra no push | — |
| B18 | App aceita banco local (F0-01) | OUTRA | commit `640cb77d2` | — | — |
| G1 | Grafo a cada 5 min (`zapp-ref-sync`, `zapp-graph-check`) | IMPL | `ESTADO_DO_GRAFO.txt` "EM DIA" 14:21; timers ativos | — | — |
| G2 | `graphify cluster-only` para refazer `GRAPH_REPORT.md` | IMPL | relatório 11:23 "cluster-only mode" | — | — |
| G3 | `.graphifyignore` com a imagem que tem telefones | IMPL | PR #1888; `.graphifyignore` l.20 | (o envio provável ao Gemini antes disso é irreversível) | — |
| G4 | Camada de IA do grafo `simular` → `real` após 1 dia | NÃO (agendado) | `~/.config/graphify/ia-modo` = `simular`; `~/.local/state/graphify-ia.log` **nunca foi criado** (ESTADO: "camada de IA ainda sem execução") | conferir se a simulação roda de fato antes de virar `real` | B |
| G5 | Alerta do grafo pelo canal do Hermes | NÃO | só o arquivo de estado | — | B |
| G6 | `audit_report.pdf` vazio no grafo | NÃO | 12-ter | — | B |
| G7 | PR #1869 (71 MB) fora do repositório de produto | JOAQUIM | foi mergeado; `du -sh docs/reconciliation` = 71 M; backlog DELTA-71MB A_DECIDIR | decidir (branch órfão) | B |
| G8 | Plugins/skills do Claude (limpeza, LSP, feature-dev, pr-review-toolkit) | IMPL | presentes na sessão | — | — |
| Z1 | Pré-visualização local `localhost:5500` | OUTRA (IMPL) | `curl` → 200; `zapp-preview-dev` ativo | — | — |
| Z2 | Piloto rodando (2 P0) | IMPL | runs 12 e 13 com heartbeat; Devin em execução | — | — |
| Z3 | Sessões de nuvem do Devin "2 ativas" no sensor | NÃO verificado | `estado.json` `devin_sessoes_ativas: 2`; origem desconhecida (a nuvem cria branch no GitHub — 13.7); remoto sem `devin/*` hoje | identificar quem abriu | B |

## 8. Pendências só do Joaquim (seção 8, 10.7, 11.4)

| ID | Pendência | Estado | Evidência | Imp. |
|---|---|---|---|---|
| J-1 | Rotacionar PAT "CLAUDE LOCAL" | JOAQUIM | DV7 | A |
| J-2 | Revogar `apk_user_…` e `apk_…` | JOAQUIM | DV8 | A |
| J-3 | Gerar chave nova do Jev (colada no chat) | JOAQUIM | `jev.env` de 11:47 | M |
| J-4 | Remover `E2E_TEST_PASSWORD` da org do Devin | JOAQUIM | DV10 | M |
| J-5 | Tirar o conector LOVABLE CLOUD do claude.ai | JOAQUIM | B11 | M |
| J-6 | Trocar a chave DeepSeek da IA do Zapp (401) | JOAQUIM | B13 | M |
| J-7 | V1: aprovar E95 no CLAUDE.md; PAT `administration:read` (settings-guard); alerta TALK X 02; segredos `TALKX_CONVERT_SECRET`/`TALKX_LINK_BASE_URL`; E15/E21/E29/E44, E61, E73, #1610, E86 | JOAQUIM | seção 8; caixa 2ff5/ccb5 | M |
| J-8 | 14 decisões da caixa 🔒 | JOAQUIM | I11 | M |
| J-9 | Decidir Devin Review e Fix CI | JOAQUIM | DV4/DV5 | B |
| J-10 | Decidir 71 MB do #1869, M-DB-04, M-DB-06 | JOAQUIM | G7/B14/B15 | B |
| J-11 | Pedir o push (lote: PR, 6 checks, merge, `db-migrate` com aprovação, deploy) | JOAQUIM | `LOTE_PENDENTE.md` | M |
| J-12 | Recarga automática do Devin desligada | JOAQUIM | DV19 | M |
| J-13 | Relaxar a proteção estrita do GitHub | IMPL | `strict=false` | — |
| J-14 | Instalar skill TypeSafe / logins ChatGPT, claude, Devin | IMPL | ver J8/D10a | — |

## 9. Contradições internas do plano

| # | Contradição | Onde | Situação real |
|---|---|---|---|
| C1 | Decisão 9 (claude -p 1º, Devin 3ª linha após 2 falhas, teto de ACU) × 10.5-1/13.4 (empate, Jev escolhe por cota) × código (`acoes.py`: **Devin sempre primeiro** se houver cota) | §1 d9, §10.5, §13.4 | 3 regras diferentes; o texto da decisão 9 nunca foi editado |
| C2 | Decisão 18 (Devin adiado à Fase 3) × Devin executando os P0 hoje | §1 d18, §18 | superada sem registro |
| C3 | Decisão 1 (push 18 h) × 13.7 (push só sob pedido); cabeçalho do caderno ainda diz "Nada aqui foi implementado ainda" | §1 d1, l.4, §13.7 | superada; cabeçalho velho |
| C4 | Decisão 5 (stack por worktree) × 13.4 ("1 Supabase compartilhado + 1 banco clonado por agente") × 13.9 ("Decisão 5 confirmada") | §1 d5, §13.4, §13.9 | implementado = stack por tarefa (13.4 abandonada sem registro) |
| C5 | Jev "Observer 1 semana → Active" (§4 item 7, §5, Fase 3) × portão já ativo no piloto | §4, §7 | pulado |
| C6 | Decisão 11 "regra fixa primeiro, Jev desempata" × implementação "Jev decide, regra só bloqueia" | §1 d11 | divergente |
| C7 | Blueprint: perfil `complexo` = "comando fixo `claude -p`" × perfil real = DeepSeek V4 Pro que executa `devin -p` | §6, §16.3 item 5 | divergente |
| C8 | 10.5-2 Outpost × §15 (Outpost não isola; contêiner por worker) × 15-bis (CLI local `dangerous` + guard) | §10.5, §15 | última vence, mas o contêiner do §15 ficou sem dono |
| C9 | 10.5-11 "`--sandbox` em vez de bypass" × 15-bis "`dangerous` (= bypass)" | §10.5, §15-bis | bypass em uso |
| C10 | 10.5-3/4 Devin Review e Fix CI × 13.7 (sem PR diário; nuvem cria branch) | §10.5, §13.7, §15 | pendente de decisão |
| C11 | Decisão 13 "3 implementações" × `failure_limit: 2` do Kanban | §1 d13, §16.3 | limite real = 2 |
| C12 | §2 "não há Docker no WSL" × §10.1/§2-bis (há Docker 29.7.2) | §2, §10.1 | corrigido no texto seguinte, não no original |
| C13 | 13.10 "SUDO_PASSWORD removida também do backup" × `.env.bak.omniroute-20260906` ainda com o valor | §13.10 | parcial |
| C14 | Numeração: duas seções "17"; 2-bis, 3-bis e 12-quater/quinquies fora de ordem; seção 16 é da outra sessão | todo o caderno | dificulta auditoria |
| C15 | `AGENTS_MAP.md` (Fase M) × estado de agora (Hermes configurado, sensor existe, WSL 48 GB) | MAPA_ZAPP_V2 | mapa desatualizado |
