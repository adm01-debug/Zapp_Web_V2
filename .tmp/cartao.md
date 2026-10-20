Task t_93e47d30: feat(audio): catálogo e favoritos de memes atualizam ao vivo
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_93e47d30
  max-retries: 2 (default)
  created:   2026-10-13 08:53 by claude
  started:   2026-10-15 20:26
  parents:   t_08ddffae

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
A V3 assina `audio_memes` e `audio_meme_favorites` e mostra erro de sincronização; a V2 só busca ao abrir o picker (`fetchMemes`).

O QUE FAZER
1. Um canal único com nome único e cleanup (padrão do RT2), refetch ao evento, aviso de erro de sincronização; testes.

ARQUIVOS QUE PODE TOCAR
- src/hooks/communication/useAudioMemes.ts
- testes

CRITÉRIO DE PRONTO
1. Meme novo aparece sem reabrir o picker.
2. `zapp-verify . --rapido` verde.


Comments (1):
  [2026-10-15 20:34] hugo: Achado fora do escopo (hooks ✓ / tela ✗): `src/components/inbox/AudioMemePicker.tsx` não consome o `syncError` novo que `useAudioMemes` passou a expor (falha de assinatura do canal realtime). Hoje o aviso existe no hook + `log.error`, mas não é desenhado na tela. Item para o worker (telas): renderizar `syncError` no picker (aviso pt-BR inline, sem selo). Não toquei no componente — não está nos ARQUIVOS QUE PODE TOCAR deste cartão.

Events (45):
  [2026-10-15 20:46] [run 18708] heartbeat
  [2026-10-15 20:47] [run 18708] heartbeat
  [2026-10-15 20:48] [run 18708] heartbeat
  [2026-10-15 20:49] [run 18708] heartbeat
  [2026-10-15 20:50] [run 18708] heartbeat
  [2026-10-15 20:51] [run 18708] heartbeat
  [2026-10-15 20:52] [run 18708] heartbeat
  [2026-10-15 20:53] [run 18708] heartbeat
  [2026-10-15 20:54] [run 18708] heartbeat
  [2026-10-15 20:55] [run 18708] heartbeat
  [2026-10-15 20:56] [run 18708] heartbeat
  [2026-10-15 20:57] [run 18708] heartbeat
  [2026-10-15 20:58] [run 18708] heartbeat
  [2026-10-15 20:59] [run 18708] heartbeat
  [2026-10-15 21:00] [run 18708] heartbeat
  [2026-10-15 21:01] [run 18708] heartbeat
  [2026-10-15 21:02] [run 18708] heartbeat
  [2026-10-15 21:03] [run 18708] heartbeat
  [2026-10-15 21:04] [run 18708] heartbeat
  [2026-10-15 21:05] [run 18708] heartbeat

Runs (1):
  #18708 running      @hugo  active  2026-10-15 20:26
