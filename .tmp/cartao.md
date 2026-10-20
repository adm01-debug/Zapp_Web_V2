Task t_a65f9f8f: fix(db): bucket audio-memes — admin apaga qualquer meme e o limite de tamanho e tipo passa a valer no servidor
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a65f9f8f
  max-retries: 2 (default)
  created:   2026-10-13 08:59 by claude
  started:   2026-10-13 16:46

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 do doc `docs/estado/10-features-inbox-components-raiz-a-m.md` (58 componentes da raiz de `src/features/inbox/components/`, A-M). Já existiam cartões do chat (partes 1-5), PE (docs 10-40) e outros; estes são os ACHADOS QUE ELES DEIXARAM PASSAR (3 leitores, com os mais graves reconferidos no código da branch viva em 13/10/2026). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia sempre `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`: a árvore de trabalho está 99 commits atrás); a V2 costuma estar melhor e NÃO tem `src/features/inbox` (os equivalentes estão em `src/components/inbox`, `src/hooks`, `src/pages`): NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas, exportar/importar/baixar/copiar/imprimir/CSV (nenhuma informação sai do sistema), edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador, /note e /tag em botão interativo, API pública. Antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
Conferido em `20260511233306_0e3f3b66-5585-4762-af6b-549c050f6275.sql`: a política 'Users can delete own audio memes' só vale para `foldername[1] = auth.uid()`, sem cláusula de admin (o `useAudioMemes.ts:345-353` cai no toast 'arquivo ficou órfão'); o bucket `audio-memes` é `public = true` (`:4`) sem `file_size_limit` nem `allowed_mime_types` (grep em todas as migrations não acha): o limite de 5 MB e `audio/*` só existem no navegador. O PK-26 cobre só `whatsapp-media` e `audio-messages`.

O QUE FAZER
1. Migration ADITIVA com `-- Rollback:`: política de DELETE que também aceita `is_admin_or_supervisor` (inclusive objetos antigos na raiz do bucket), e `file_size_limit` = 5 MB e `allowed_mime_types` = `audio/*` em `storage.buckets` para `audio-memes`.
2. Mantenha o bucket PÚBLICO para leitura (a URL é gravada em `audio_memes.audio_url`); a decisão de migrar para URL assinada fica registrada no relato como pendência do dono.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_audio_memes_bucket_limits_admin_delete.sql (novo)
- supabase/tests/

CRITÉRIO DE PRONTO
1. Prova no banco local: admin apaga objeto de outro usuário; agente comum só apaga o seu.
2. Upload acima de 5 MB ou fora de `audio/*` é negado.
3. Leitura pública inalterada.
4. `zapp-verify . --rapido` verde.


Latest summary:
Sem workspace: `hermes-tarefa-iniciar` devolve exit 75 "CONGELADO" porque o marcador MODO_V2 está ausente em ~/.local/libexec/hermes-guard/ (o CONGELADO existe desde 04/10; pasta mexida hoje 10:45). Afeta a fábrica toda — o último workspace do Zapp_Web_V2 aberto é 10:39 (t_4128d906). Não posso escrever na pasta da guarda (proibido contornar). Decisão registrada: 20261014-114923-554c-sem-tarefa — recriar o marcador (arquivo vazio basta) ou confirmar pausa do modo V2. Nota: exit 75 está sendo contado pelo dispatcher como "rate-limited", por isso os 11 attempts anteriores deste cartão não avançaram. Cartão intacto: nenhum arquivo, commit ou banco tocado. Trabalho pendente: migration aditiva do bucket audio-memes (DELETE por admin/supervisor + file_size_limit 5 MB + allowed_mime_types audio/*) com prova no banco local.

Comments (3):
  [2026-10-14 11:49] workersql: Bloqueio de infraestrutura, não do cartão.

`hermes-tarefa-iniciar Zapp_Web_V2 ...` (passo 1 do meu fluxo) falha com **exit 75** e a mensagem "CONGELADO: o modo V1 ... está suspenso pela Arquitetura V2. Não tente contornar. Estacione ... e pare."

Causa (lida no próprio script, linhas 5–10): ele só recusa quando `HERMES_AGENT=1` **e** existe `~/.local/libexec/hermes-guard/CONGELADO` **e não existe** `~/.local/libexec/hermes-guard/MODO_V2`. O CONGELADO existe (04/10); o **marcador MODO_V2 está ausente**. Nada mais foi tocado por mim.

Consequências verificadas:
- Sem workspace não há implementação possível ( `~/projetos` é somente leitura e eu não posso criar pasta de trabalho).
- Diretório da guarda com mtime **14/10 10:45**; último workspace do Zapp_Web_V2 criado com sucesso é **10:39** (`t_4128d906`) e o índice `.por-cartao` não recebeu nada depois — a fábrica inteira parou de abrir workspace ~10:45.
- Os 11 attempts deste cartão (13/10 16:52–18:28) morreram com **exit_code 75**, que o dispatcher rotula como `rate-limited (quota wall)`: falha de guarda sendo contada como rate limit.

Registrei decisão: `20261014-114923-554c-sem-tarefa`. Pedido: recriar o marcador (arquivo vazio basta) ou confirmar pausa do modo V2. Quem faz: Joaquim/Claude (pasta da guarda).

O trabalho do cartão (bucket `audio-memes`: policy de DELETE com `is_admin_or_supervisor` + `file_size_limit` 5 MB + `allowed_mime_types audio/*`, prova no banco local com papel real) segue inteiro e é pequeno — fecho assim que houver workspace.
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao
  [2026-10-15 21:42] workersql: Achado fora do escopo (não corrigido neste cartão): o app grava os áudios na RAIZ do bucket — `src/hooks/communication/useAudioMemes.ts:167` monta `storagePath = \`meme_${Date.now()}_${crypto.randomUUID()}.${ext}\``, sem pasta do usuário. A policy "Users can delete own audio memes" compara `(storage.foldername(name))[1] = auth.uid()::text`, que para um objeto na raiz é NULL = id → falso. Consequência: **um agente comum não consegue apagar o próprio audio meme** (nem o admin, antes deste cartão). Este cartão resolve só o lado do admin (policy nova, `is_admin_or_supervisor`), como pedido. Correção do caso do dono exige policy por `owner` (ou mover o upload para `<auth.uid()>/...`): outro cartão, provavelmente do worker (hooks) + worker (sql).

Events (111):
  [2026-10-15 21:28] [run 18722] heartbeat
  [2026-10-15 21:29] [run 18722] heartbeat
  [2026-10-15 21:30] [run 18722] heartbeat
  [2026-10-15 21:31] [run 18722] heartbeat
  [2026-10-15 21:32] [run 18722] heartbeat
  [2026-10-15 21:33] [run 18722] heartbeat
  [2026-10-15 21:34] [run 18722] heartbeat
  [2026-10-15 21:35] [run 18722] heartbeat
  [2026-10-15 21:36] [run 18722] heartbeat
  [2026-10-15 21:37] [run 18722] heartbeat
  [2026-10-15 21:39] [run 18722] heartbeat
  [2026-10-15 21:40] [run 18722] heartbeat
  [2026-10-15 21:41] [run 18722] heartbeat
  [2026-10-15 21:42] [run 18722] heartbeat
  [2026-10-15 21:42] commented {'author': 'workersql', 'len': 750}
  [2026-10-15 21:43] [run 18722] heartbeat
  [2026-10-15 21:44] [run 18722] heartbeat
  [2026-10-15 21:45] [run 18722] heartbeat
  [2026-10-15 21:46] [run 18722] heartbeat
  [2026-10-15 21:47] [run 18722] heartbeat

Runs (13):
  #13031 rate_limited @workersql  64s  2026-10-13 16:46
        ! pid 41056 exited rate-limited (quota wall) — requeued without counting a failure
  #13226 rate_limited @workersql  31s  2026-10-13 16:52
        ! pid 22656 exited rate-limited (quota wall) — requeued without counting a failure
  #13684 rate_limited @workersql  42s  2026-10-13 17:08
        ! pid 15472 exited rate-limited (quota wall) — requeued without counting a failure
  #13863 rate_limited @workersql  38s  2026-10-13 17:14
        ! pid 29196 exited rate-limited (quota wall) — requeued without counting a failure
  #14189 rate_limited @workersql  39s  2026-10-13 17:25
        ! pid 34520 exited rate-limited (quota wall) — requeued without counting a failure
  #14531 rate_limited @workersql  56s  2026-10-13 17:36
        ! pid 29480 exited rate-limited (quota wall) — requeued without counting a failure
  #14864 rate_limited @workersql  54s  2026-10-13 17:48
        ! pid 24940 exited rate-limited (quota wall) — requeued without counting a failure
  #15240 rate_limited @workersql  40s  2026-10-13 18:00
        ! pid 27800 exited rate-limited (quota wall) — requeued without counting a failure
  #15708 rate_limited @workersql  22s  2026-10-13 18:16
        ! pid 39656 exited rate-limited (quota wall) — requeued without counting a failure
  #15884 rate_limited @workersql  22s  2026-10-13 18:22
        ! pid 11468 exited rate-limited (quota wall) — requeued without counting a failure
  #16088 rate_limited @workersql  36s  2026-10-13 18:28
        ! pid 23668 exited rate-limited (quota wall) — requeued without counting a failure
  #16681 blocked      @workersql  195s  2026-10-14 11:46
        → Sem workspace: `hermes-tarefa-iniciar` devolve exit 75 "CONGELADO" porque o marcador MODO_V2 está ausente em ~/.local/libexec/hermes-guard/ (o CONGELADO existe 
  #18722 running      @workersql  active  2026-10-15 21:08
