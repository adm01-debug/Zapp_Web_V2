Task t_56635c76: [refazer 1] fix(db): upload de memes de áudio e do trocador de voz permitido ao atendente, com expurgo e realtime
  status:    running
  assignee:  semisenior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_56635c76
  max-retries: 2 (default)
  created:   2026-10-15 20:35 by user
  started:   2026-10-16 03:28

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: A migration é aditiva, tem Rollback real, função SECURITY DEFINER com search_path e EXECUTE só para service_role, e não destrói dados reais. Mas o critério 1 (atendente sobe meme na própria pasta do audio-memes) não é provado com papel real, e o relato cita um 'vermelho' que não bate com o teste do diff.

O QUE CORRIGIR: 1) Em supabase/tests/audio_memes_storage_paths.sql, a Parte 2 exercita só o bucket voice-changer-tmp; para o audio-memes a Parte 1 apenas procura o texto 'is_admin_or_supervisor' nas policies. Acrescente, com SET LOCAL ROLE authenticated e request.jwt.claims, no bucket audio-memes: INSERT na própria pasta <uid>/ permitido, INSERT em pasta alheia negado (42501), e DELETE por admin/supervisor em objeto de outro autor permitido (é o defeito corrigido na policy de DELETE). 2) O item '2.3' do teste é só um comentário sem asserção ('admin/supervisor livre... permitido'). Faça o teste real com um usuário admin/supervisor ou remova o comentário enganoso, e remova o v_uid/perform v_uid sem uso na Parte 1. 3) SÓ NO RELATO: a linha 'vermelho antes' cita a mensagem 'audio_memes_storage_paths: estado final incompleto -> ...' e 'sem limite', que é o texto da blindagem da migration e não do teste (o teste lança 'PK-16 PARTE 1 FALHOU -> ...' e 'ausente'). Refaça o vermelho rodando o teste final sem a migration e cole a saída real. Corrija também '19 sentenças' do rollback (o bloco do diff tem 15) e o nome do gatilho (a migration diz storage.protect_objects_delete, o relato diz storage.protect_delete()). 4) Deixe explícito no relato que o front (PK-17) ainda precisa passar a gravar o trocador de voz em voice-changer-tmp para o critério 2 'voz temporária expira' valer na prática.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/audio-memes-storage-realtime-2610151908f83c` (commit 0fa8fa6df) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
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

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Latest summary:
SSH para o WSL (localhost:2222) fora do ar: terminal e leitura de arquivos falham com timeout. Sem acesso ao workspace nao ha como trazer o cherry-pick nem corrigir o teste. Tentar de novo quando o WSL/sshd voltar.

Comments (1):
  [2026-10-15 20:41] default: [jev-entrada] rota=complexo (conf 0.97 → automatico, p_humano=0.01), faixa=migrations, injeção=0.27, ação externa=0.08 — REFAZER: complexo → semisenior

Events (37):
  [2026-10-16 14:59] [run 19802] heartbeat
  [2026-10-16 15:00] [run 19802] heartbeat
  [2026-10-16 15:01] [run 19802] heartbeat
  [2026-10-16 15:02] [run 19802] heartbeat
  [2026-10-16 15:03] [run 19802] heartbeat
  [2026-10-16 15:04] [run 19802] heartbeat
  [2026-10-16 15:05] [run 19802] heartbeat
  [2026-10-16 15:06] [run 19802] heartbeat
  [2026-10-16 15:07] [run 19802] heartbeat
  [2026-10-16 15:08] [run 19802] heartbeat
  [2026-10-16 15:09] [run 19802] heartbeat
  [2026-10-16 15:10] [run 19802] heartbeat
  [2026-10-16 15:11] [run 19802] heartbeat
  [2026-10-16 15:12] [run 19802] heartbeat
  [2026-10-16 15:13] [run 19802] heartbeat
  [2026-10-16 15:14] [run 19802] heartbeat
  [2026-10-16 15:15] [run 19802] heartbeat
  [2026-10-16 15:16] [run 19802] heartbeat
  [2026-10-16 15:17] [run 19802] heartbeat
  [2026-10-16 15:18] [run 19802] heartbeat

Runs (2):
  #19506 blocked      @semisenior  99s  2026-10-16 03:28
        → SSH para o WSL (localhost:2222) fora do ar: terminal e leitura de arquivos falham com timeout. Sem acesso ao workspace nao ha como trazer o cherry-pick nem corr
  #19802 running      @semisenior  active  2026-10-16 14:54
