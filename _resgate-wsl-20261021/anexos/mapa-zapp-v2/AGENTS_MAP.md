# Mapa de agentes e ferramentas — Arquitetura V2 (04/10/2026)

Inventário verificado nesta data (não declarado). Segredos: só o nome e onde ficam; nunca o valor. Detalhes e histórico no caderno `ARQUITETURA_V2_DESCOBERTAS.md` (seções 10, 3-bis, 13–15).

## 1. Quem faz o quê na V2
| Papel | Ferramenta | Estado hoje |
|---|---|---|
| Planejar, portões irreversíveis, push sob pedido | **Claude Code** 2.1.289 (WSL; Opus 5.5/Fable 5.1) — interativo e `claude -p` | pronto |
| Orquestrar cartões | **Hermes Kanban** (Hermes v0.21.5+2485, app nativo no Windows) | **não configurado**: gateway parado, quadro vazio, só perfil `default`; Hermes **pausado** (ESTOP) |
| Worker barato 24 h | Hermes perfil `worker` com DeepSeek V4 Flash | perfil a criar; DeepSeek logado |
| Coordenador e designer | Hermes perfis com `openai-codex` (GPT-5.6 Sol, assinatura ChatGPT) e `codex exec` | ChatGPT logado no Hermes (credencial "chatgpt-assinatura-v2") e no Codex CLI 0.160.0; perfis a criar; plano Plus/Pro não informado |
| Código difícil | `claude -p` e **Devin** (plano Max; CLI 3000.11.3 local) | Devin: chaves ok, CLI ok; integração ao sensor a fazer; sem sandbox (conflita com o guard) |
| Portões de entrada/saída | **Jev** (TypeSafe, `jev-1.13.0`) | chave ok; bateria 30/31; scripts em `~/arquitetura-v2/jev/` |
| Vigia 24 h | **Sensor** (script, 60 s) | **não existe** (Fase 1) |
| Mapa do código | **Graphify** 0.9.68 (`[sql,anthropic]`, backend DeepSeek) | grafo em `~/projetos/Zapp_Web_V2/graphify-out/` (sessão `joaquim-ataides-37` mantém) |

## 2. Hermes (detalhe)
- Pasta `%LOCALAPPDATA%\hermes`; modelo principal `deepseek-v4-pro`, subagentes `deepseek-v4-flash` (máx. 5 — reduzir para 1–2 com 10 agentes); fallback `nous / deepseek-v4-flash`.
- Credenciais no `auth.json`/`.env` do Hermes (nomes): nous (OAuth), deepseek, openai-codex (OAuth), zai/GLM, alibaba-coding-plan (**403 Unpurchased — morto**), omniroute (`localhost:20128`), `SUDO_PASSWORD` (**remover**: o sudo do WSL nem pede senha).
- Guardas: hook `agent-hooks\hermes-guard.py` (fail-closed) + wrappers git/gh no WSL via chave SSH `hermes_wsl`; 1.945 bloqueios registrados. Trava `CONGELADO` nos scripts do ciclo V1.
- Skills: 21 categorias; `claude-code` (builtin), `typesafe-ai` (oficial, instalada 04/10), `typesafe-jev` (local, anterior), `promo/executar-plano` (V1).
- `hermes update --check` falha (erro do git `pack-objects`).

## 3. Devin
- Conta org `org-9cb4…`, plano Max (cota semanal). Chaves: `~/.config/devin/sensor-v2.env` (service user Member — **lê tudo como admin**), `~/.config/devin/admin.env` (PAT "CLAUDE LOCAL" + chaves v1 `apk_` que **ainda funcionam** — rotacionar/revogar: foram coladas no chat).
- CLI no WSL com 3 subagentes (auditor Opus 5.5, executor SWE-2 high, planejador Fable 5.1), 17 rules (algumas são AGENTS.md velhos de `/tmp` — limpar), ~30 skills (symlinks para o Hermes), 6 MCPs; **importa a config do Claude Code** (CLAUDE.md, skills, hooks).
- API: consumo sempre 0,0 ACU (não serve para controlar gasto); sessões não terminam sozinhas.

## 4. Claude Code (WSL)
- Plugins: typesafe 0.5.7, feature-dev, pr-review-toolkit, typescript-lsp, engineering (sincronizado); skill graphify.
- Regras de permissão liberadas pelo Joaquim: `Bash(npm run *)`, `Bash(zapp-db-ler:*)`, `Bash(hermes-tarefa-limpar:*)`. O classificador bloqueia: leitura de produção sem o wrapper, destruição local irreversível, instalar plugin, editar as próprias permissões.
- Conectores do claude.ai: dezenas (Supabase/Lovable por projeto, GitHub, Vercel, n8n, Portainer, Jina, Bright Data…). **Proibido**: "MCP LOVABLE CLOUD ZAPP WEB V2" (responde de projeto antigo). Falharam ao conectar em 04/10: CLOUDFLARE - MCP - WORK (410), mcp-lovable-supabase-zapp-web-v3 (404), SUPABASE SELF HOSTED (404), VS CODE - MCP - VPS (404 ×2), Asana, Definite.

## 5. Máquina e serviços locais
- Windows i9-14900K / 64 GB; WSL Ubuntu 24.04 com 32 GB / 24 núcleos (`.wslconfig`; plano: 48 GB para 10 agentes). Tarefa "WSL Watchdog" no Windows.
- Docker 29.7.2; Supabase CLI 2.115.0 (+ 2.119.0 em `~/.local/opt/supabase-2.119`, `supabase stack` com `SUPABASE_EXPERIMENTAL_STACK=1`); bubblewrap 0.9.0 e socat 1.8.0.
- Timers do usuário: `zapp-ref-sync`, `zapp-graph-check`, `zapp-graph-ia` (5 min; IA em modo "simular"), `omniroute-backup` (diário).
- Banco do Zapp: produção só por `zapp-db-ler` (leitura) e `zapp_db.py` (`~/projetos/mcp-clone-bwwbey`); escrita só pelo fluxo de migrations — hoje congelado.

## 6. Chaves e onde ficam (só nomes)
| Chave | Arquivo | Situação |
|---|---|---|
| `JEV_API_KEY` | `~/.config/jev/jev.env` (600) | ok; colada no chat → gerar nova depois |
| `DEVIN_API_KEY` (sensor-v2) | `~/.config/devin/sensor-v2.env` (600) | ok |
| `DEVIN_PAT`, `DEVIN_APK_USER`, `DEVIN_APK_ORG` | `~/.config/devin/admin.env` (600) | coladas no chat → rotacionar PAT e revogar `apk_` |
| `DEEPSEEK_API_KEY` | `~/.config/graphify/deepseek.env` (600, carregado pelo `.bashrc`) e `.env` do Hermes | ok |
| ChatGPT (OAuth) | Hermes `auth.json` + `~/.codex` | ok |
| Chave de IA do próprio Zapp (DeepSeek) | segredo do Supabase de produção | **401 desde 02/10** (fila do Joaquim) |
