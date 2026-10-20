Task t_08ddffae: fix(db): upload de memes de áudio e do trocador de voz permitido ao atendente, com expurgo e realtime
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_08ddffae
  max-retries: 2 (default)
  created:   2026-10-13 08:53 by claude
  started:   2026-10-13 16:37
  children:  t_93e47d30, t_9d9c1504

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
A migration `20260511233306_0e3f3b66-...sql:32-34` deixa o INSERT em `storage.objects` do bucket `audio-memes` só para admin/supervisor ou `(storage.foldername(name))[1] = auth.uid()` (DELETE `:66` e UPDATE `:115` idem; existem políticas sobrepostas de `20260319…`, `20260401…`, `20260402…`). Os caminhos reais de upload da V2 NÃO têm pasta de usuário: `meme_<ts>_<uuid>.ext`, `voice-changer/<ts>_<uuid>.mp3` (aberto a todos os atendentes), `ai_gen_...`, `bulk_...`. Se valem no banco, o atendente comum recebe 'Erro ao enviar arquivo' no picker e no trocador de voz. O trocador de voz também grava um mp3 por envio num bucket público e nunca apaga. O QS3 fez o mesmo ajuste só para figurinhas. Confira no banco local as políticas efetivas (o Claude confere as reais com `pg_policies`). Também: `audio_memes` e `audio_meme_favorites` precisam estar na publicação do realtime (PK-18).

O QUE FAZER
1. Migration aditiva: política de INSERT/UPDATE/DELETE do bucket `audio-memes` que exige pasta `<auth.uid()>/` para atendente (admin/supervisor seguem livres); bucket/pasta TEMPORÁRIO para o trocador de voz com expurgo por TTL (função + job no molde do PE-102); adicionar `audio_memes` e `audio_meme_favorites` à publicação `supabase_realtime` se faltarem; prova no banco local com papel de atendente e `-- Rollback:`.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_audio_memes_storage_paths.sql (novo)
- supabase/tests/

CRITÉRIO DE PRONTO
1. Atendente comum sobe meme na própria pasta.
2. Voz temporária expira.
3. Realtime habilitado.
4. `zapp-verify . --rapido` verde.


Latest summary:
Fábrica parada desde ~10:45: o marcador /home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2 sumiu (o CONGELADO existe), então `hermes-tarefa-iniciar` recusa com exit 75 e eu não consigo abrir workspace para t_08ddffae. O supervisor registra o mesmo em t_cca276de/t_4128d906/t_a6049cc7. Não contornei a guarda. Restaurar o arquivo MODO_V2 (mesmo conteúdo/forma de antes) destrava a fábrica; o cartão está dentro do escopo do workersql e eu sigo de imediato.

Comments (3):
  [2026-10-14 11:40] workersql: **BLOQUEIO DE AMBIENTE — não consegui abrir workspace (fábrica inteira parada desde ~10:45).**

O fluxo obrigatório manda criar o workspace com `hermes-tarefa-iniciar Zapp_Web_V2 <slug>` (nunca criar pasta à mão). Ele falha:

```
$ hermes-tarefa-iniciar Zapp_Web_V2 audio-memes-storage-realtime
CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2.
Não tente contornar. Estacione: deixe o trabalho no workspace, registre o estado com hermes-pedir-decisao e pare.
exit 75
```

Causa medida (WSL, agora):
- `/home/joaquim_ataides/.local/libexec/hermes-guard/CONGELADO` existe (04/10), mas **`/home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2` NÃO existe** — `test -e .../MODO_V2` → NAO. O `hermes-tarefa-iniciar` (linhas 5–10) só sai de CONGELADO quando MODO_V2 existe.
- O diretório do guard tem mtime **2026-10-14 10:45** (um registro foi removido nele hoje); o último workspace do Zapp_Web_V2 criado foi 10:39 (`ia-janela-limitada-422-periodo-2610141039aa5e`). Nenhum novo workspace nasceu depois disso.
- Não é exclusivo meu: o próprio supervisor registra o mesmo (`supervisor.log`: 11:08 `t_cca276de` "bloqueado pela guarda do fechamento (MODO_V2 ausente)"; 11:18 `t_4128d906` "parou corretamente no bloqueio CONGELADO/MODO_V2"; 11:29 `t_a6049cc7` "travou em hermes-tarefa-iniciar (exit 75)").

Não contornei a guarda (criar o MODO_V2 à mão ou rodar o iniciar sem `HERMES_AGENT=1` cairia em modo V1/PR — proibido). O cartão em si é da minha área (banco/RLS/storage) e está inteiramente dentro do escopo do workersql; assim que o marcador `MODO_V2` voltar, é só reexecutar e eu sigo.
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao
  [2026-10-15 20:03] workersql: Handoff (fora da minha área): o contrato do banco agora exige a pasta `<auth.uid()>/` no bucket `audio-memes` (INSERT/UPDATE/DELETE) e o bucket privado temporário é `voice-changer-tmp` (também `<auth.uid()>/`). O caminho de upload do meme (`meme_<ts>_<uuid>.ext`, sem pasta) e o destino da voz do trocador precisam passar a gravar em `<auth.uid()>/<arquivo>` — é o PK-17 (hugo, front/Edge). Enquanto isso não muda, o upload do atendente é negado pela policy.

Achado de ambiente (para o worker de CI): o replay do banco local pulou a migration que cria `public.talkx_storage_purge_queue` (M-DB-01) — a tabela existe em produção (schema-manifest.json) mas não no banco local. Por isso a prova monta a fila como fixture na transação descartada.

Events (223):
  [2026-10-15 20:01] [run 18673] heartbeat
  [2026-10-15 20:02] [run 18673] heartbeat
  [2026-10-15 20:03] [run 18673] heartbeat
  [2026-10-15 20:03] commented {'author': 'workersql', 'len': 742}
  [2026-10-15 20:04] [run 18673] heartbeat
  [2026-10-15 20:05] [run 18673] heartbeat
  [2026-10-15 20:06] [run 18673] heartbeat
  [2026-10-15 20:07] [run 18673] heartbeat
  [2026-10-15 20:08] [run 18673] heartbeat
  [2026-10-15 20:09] [run 18673] heartbeat
  [2026-10-15 20:10] [run 18673] heartbeat
  [2026-10-15 20:11] [run 18673] heartbeat
  [2026-10-15 20:12] [run 18673] heartbeat
  [2026-10-15 20:13] [run 18673] heartbeat
  [2026-10-15 20:14] [run 18673] heartbeat
  [2026-10-15 20:15] [run 18673] heartbeat
  [2026-10-15 20:16] [run 18673] heartbeat
  [2026-10-15 20:17] [run 18673] heartbeat
  [2026-10-15 20:18] [run 18673] heartbeat
  [2026-10-15 20:19] [run 18673] heartbeat

Runs (19):
  #12769 rate_limited @workersql  34s  2026-10-13 16:37
        ! pid 28380 exited rate-limited (quota wall) — requeued without counting a failure
  #13013 rate_limited @workersql  36s  2026-10-13 16:45
        ! pid 36316 exited rate-limited (quota wall) — requeued without counting a failure
  #13189 rate_limited @workersql  70s  2026-10-13 16:51
        ! pid 42508 exited rate-limited (quota wall) — requeued without counting a failure
  #13390 rate_limited @workersql  47s  2026-10-13 16:58
        ! pid 41564 exited rate-limited (quota wall) — requeued without counting a failure
  #13563 rate_limited @workersql  33s  2026-10-13 17:04
        ! pid 44868 exited rate-limited (quota wall) — requeued without counting a failure
  #13750 rate_limited @workersql  35s  2026-10-13 17:11
        ! pid 25496 exited rate-limited (quota wall) — requeued without counting a failure
  #13927 rate_limited @workersql  36s  2026-10-13 17:16
        ! pid 29024 exited rate-limited (quota wall) — requeued without counting a failure
  #14175 rate_limited @workersql  25s  2026-10-13 17:25
        ! pid 25008 exited rate-limited (quota wall) — requeued without counting a failure
  #14353 rate_limited @workersql  68s  2026-10-13 17:30
        ! pid 44084 exited rate-limited (quota wall) — requeued without counting a failure
  #14575 rate_limited @workersql  45s  2026-10-13 17:38
        ! pid 29576 exited rate-limited (quota wall) — requeued without counting a failure
  #14754 rate_limited @workersql  33s  2026-10-13 17:44
        ! pid 40608 exited rate-limited (quota wall) — requeued without counting a failure
  #14986 rate_limited @workersql  34s  2026-10-13 17:51
        ! pid 23364 exited rate-limited (quota wall) — requeued without counting a failure
  #15216 rate_limited @workersql  51s  2026-10-13 17:59
        ! pid 38632 exited rate-limited (quota wall) — requeued without counting a failure
  #15403 rate_limited @workersql  42s  2026-10-13 18:06
        ! pid 43764 exited rate-limited (quota wall) — requeued without counting a failure
  #15649 rate_limited @workersql  34s  2026-10-13 18:14
        ! pid 39600 exited rate-limited (quota wall) — requeued without counting a failure
  #15832 rate_limited @workersql  23s  2026-10-13 18:20
        ! pid 21980 exited rate-limited (quota wall) — requeued without counting a failure
  #16063 rate_limited @workersql  52s  2026-10-13 18:28
        ! pid 26404 exited rate-limited (quota wall) — requeued without counting a failure
  #16646 blocked      @workersql  141s  2026-10-14 11:37
        → Fábrica parada desde ~10:45: o marcador /home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2 sumiu (o CONGELADO existe), então `hermes-tarefa-iniciar` recu
  #18673 running      @workersql  active  2026-10-15 19:07
