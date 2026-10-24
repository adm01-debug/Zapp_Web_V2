# Mapa do Zapp V2 — o que mudou depois do mapa base (04/10/2026, tarde)

Fecha a Fase M sobre o estado de **04/10 ~15:00 UTC**. Base anterior: re-pino em `bf266d2f8`. Leitura do banco via `zapp-db-ler` (só leitura). Nada foi corrigido.

## 1. Código (origin/main)
- `bf266d2f8` → **`7a1585279`** (14:01 UTC): 1 commit, #1888 (`.graphifyignore` com a captura que pode ter telefones reais).
- **PR #1869 (auditoria do GPT) mergeado às 12:15 UTC**: `docs/reconciliation/` tem **71 MB** dentro do repositório de produto. Todo clone e toda worktree carregam esse peso. Candidato a tirar do repositório (ou para branch órfão) — decisão do Joaquim.
- Mergeados hoje pela sessão `joaquim-ataides-37` (antes da regra "push só sob pedido"): #1882, #1621, #1636, #1439, #1654, #1863, #1888. Fechados como obsoletos: #1699, #1584, #1610, #1206, #1430.
- Mergeados hoje pelos chats do Hermes V1 (antes do congelamento): 12 PRs, #1874–#1885 (Talk X v4 x047b, catálogo, contraste, sonar, e24h).
- PRs abertos agora: **0**.

## 2. Banco de produção (`tnnnlkbymytvtqngbbqh`)
### 2.1 Cron — 13 jobs (o mapa base listou 10)
| Job | Agenda | Situação |
|---|---|---|
| `talkx-scheduler-1min` | todo minuto | **FALHANDO** desde 04/10 03:07 UTC (último sucesso 03:06). Erro: `Direct deletion from storage tables is not allowed` (M-DB-01, P0, motor do Talk X parado) |
| `ai-jobs-tick-1min`, `tasks-notify-due`, `multiplix-send-trigger`, `expire-stale-agent-presence`, `connection-health-check`, `gmail-incremental-sync`, `cleanup-edge-rate-limits`, `avatars-refresh` | 1–60 min | ok |
| `cleanup-link-preview-cache` (diário 03:12), `vacuum-contacts-daily` (diário 03:42), `searchbox-budget-alert` (diário 12:00, desde 03/10) | diário | ok — os dois últimos faltavam no mapa base |
| `vacuum-messages-post-expurgo` | `20 3 2 9 *` = **uma vez por ano (2/set)** | rodou com sucesso em 02/09; agenda anual parece resto de tarefa pontual — candidato a remover |

### 2.2 Novo achado: "job startup timeout" do pg_cron (M-DB-06)
| Dia (UTC) | Execuções | Timeouts |
|---|---|---|
| 27/09 | 4.620 | 24 |
| 28/09 | 5.018 | 422 |
| 29/09 | 5.014 | 260 |
| 30/09 | 5.014 | 52 |
| 01/10 | 5.008 | 196 |
| 02/10 | 5.829 | 1.040 |
| 03/10 | 6.422 | **2.006** |
| 04/10 | 4.027 | **0** |
Afetou quase todos os jobs (não só o Talk X). Coincide com as quedas/oscilações do banco relatadas na caixa 🔒 (01–03/10) e com o pico de atividade dos chats do Hermes. Sem ocorrência desde 03/10 12:56 UTC. Leitura: o pg_cron não conseguia abrir conexão (pool/CPU saturados). O sensor da V2 precisa de detector para isso.

### 2.3 IA do Zapp (caixa 🔒 4fe7)
- Provedor padrão `DeepSeek` (`deepseek-v4-flash`): **6/6 chamadas com HTTP 401 em 02/10**; o fallback OpenRouter (`google/gemini-3.8-flash`) respondeu (8 sucessos). Outros erros: HTTP 402 (gpt-4o em 01/10, deepseek em 30/09). **Nenhuma chamada de IA desde 02/10** (sem usuários), então segue não confirmado como corrigido. Correção = trocar a chave no segredo do Supabase (fila do Joaquim).
- Provedores ativos: DeepSeek (padrão), GLM AI (glm-5.3), OpenRouter (gemini-3.8-flash); Lovable AI inativo.

### 2.4 Escrita no banco feita hoje fora do Hermes
- Reserva de versão `20261003272707` (`reserve_migration_version`, holder `claude-wsl-reconcile-local-replay`) pela sessão `joaquim-ataides-37`. Não há migration no repositório para ela.

### 2.5 Banco local × produção (pela sessão joaquim-ataides-37; detalhe em `MAPA_BANCO_LOCAL.md`)
- Reconstrução local em 39 s / 105 MB; 764/785 migrations; 21 falhas (19 conhecidas + 2 fixtures do #1882 com FK para contato que só existe em produção).
- 119 diferenças reais; 64 somem com um arquivo de reconciliação gerado da produção, **que não está no repositório** (bloqueado pelo classificador; aguarda decisão do Joaquim).
- M-DB-02 reconfirmado: overload de 7 argumentos de `record_incoming_call_event` com EXECUTE para PUBLIC e authenticated.

## 3. Operação e agentes
- **Hermes V1 congelado** (ESTOP + trava `CONGELADO`), 14 chats exportados e arquivados, 35 pastas de resto movidas para `~/.cache/hermes-residuos-20261004/`. 9 tarefas abertas estacionadas com trabalho não commitado; 5 worktrees órfãos (audit-a1/a2/a4/a5, bloco-b) e o da E37 parados (o `hermes-tarefa-limpar` recusa por regra própria).
- `allow_auto_merge` do repositório **desligado**. Regra: push/PR/merge só quando o Joaquim pedir.
- Caixa 🔒: 123 → 14 abertas (`PENDENCIAS_CAIXA_DECISOES.md`).

## 4. O que ficou sem acesso (fora do mapa)
- **Evolution API** (WhatsApp): 401. **Cloudflare**: conector desconectado (410) nesta sessão. Precisam de credencial/reconexão do Joaquim.
