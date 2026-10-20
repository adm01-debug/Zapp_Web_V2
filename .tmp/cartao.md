Task t_546cff3f: feat(chat): atalho M silencia o áudio que está tocando e o botão de áudio mostra o estado
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_546cff3f
  max-retries: 2 (default)
  created:   2026-10-13 08:18 by claude
  started:   2026-10-13 16:36

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/06-features-inbox-hooks.md` (inbox: serviços, hooks e utils). Plano e relatórios: `~/arquitetura-v2/paridade-06/achados_*.md` (cópia para agentes em `~/hermes-workspaces/.assets/paridade-06/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026 (leitores + conferência do Claude em migrations e código); o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

COORDENAÇÃO: PH-22 (áudios um por vez) toca o mesmo barramento; leia-o.

PROBLEMA (evidência conferida)
A V3 tem `audioPlaybackBus.toggleMuteActive` ligado a um atalho (M) para silenciar o áudio ativo; a V2 não tem. PH-22 (hooks06) cobre 'um áudio por vez'.

O QUE FAZER
1. Registre o atalho M no registro de atalhos global (respeitando campos de texto e modificadores), chamando o mute do player ativo.
2. O botão do player reflete mudo/ativo com `aria-pressed` e rótulo pt-BR.
3. Testes do atalho e do estado.

ARQUIVOS QUE PODE TOCAR
- src/hooks/ (audio, registro de atalhos)
- componente do player de áudio
- testes

CRITÉRIO DE PRONTO
1. M silencia e restaura o áudio ativo.
2. Atalho ignora campos de texto.
3. `zapp-verify . --rapido` verde.


Latest summary:
Fábrica travada por guarda: o marcador ~/.local/libexec/hermes-guard/MODO_V2 sumiu (por volta de 10:45 de 14/10) e, sem ele, hermes-tarefa-iniciar e hermes-tarefa-fechar respondem CONGELADO (exit 75) — não consigo abrir workspace nem fechar, e o último workspace em .por-cartao é de 10:39. Recriar o MODO_V2 é escrita em ~/.local (negada a agente) e mexer na guarda é decisão do Joaquim: não contornei (sem HERMES_AGENT=0). Decisão registrada: 20261014-111347-498f-sem-tarefa. Nenhum arquivo do projeto foi tocado; o cartão roda do zero quando o marcador voltar.

Comments (3):
  [2026-10-14 11:14] hugo: BLOQUEIO DE AMBIENTE (Hugo, 14/10/2026 ~11:15). Não é falha do cartão e não tentei contornar.

Sintoma: `hermes-tarefa-iniciar Zapp_Web_V2 atalho-m-mute-audio` (workdir `~/projetos/Zapp_Web_V2`) responde
`CONGELADO: o modo V1 ... está suspenso pela Arquitetura V2` e sai 75. Sem workspace, `hermes-tarefa-fechar` e `zapp-verify` também não liberam.

Causa medida: o marcador `~/.local/libexec/hermes-guard/MODO_V2` NÃO existe mais. Os dois scripts
(`~/.local/bin/hermes-tarefa-iniciar` linhas 5-10 e `~/.local/bin/hermes-tarefa-fechar` linhas 4-9) recusam
quando `CONGELADO` existe E `MODO_V2` falta. Confirmado: `ls -a` do diretório da guarda não mostra `MODO_V2`
(diretorio com mtime 14/10 10:45); `CONGELADO` é de 04/10 e continua lá.

Efeito na fábrica: último workspace criado em `~/hermes-workspaces/.por-cartao/` é de 10:39 de hoje; nenhum
depois disso. Ou seja, o ciclo V2 parou por volta de 10:45 — coerente com o marcador ter sumido nessa hora.
Nada no meu lado (o cartão é `worker (hooks)`, arquivos em `src/hooks/**`) explica isso.

O que NÃO fiz: recriar `MODO_V2` (escrever em `~/.local/**` é negado para agente e mexer na guarda é decisão do
Joaquim), nem rodar com `HERMES_AGENT=0` para pular a checagem (contorno proibido).

Pedido de decisão registrado: `hermes-pedir-decisao` → id `20261014-111347-498f-sem-tarefa` (o arquivo da
decisão fica em `~/hermes-workspaces/.decisoes/`). Responder com `hermes-decisoes 20261014-111347-498f-sem-tarefa`.

Assim que o `MODO_V2` voltar, este cartão roda do zero sem perda: nenhum arquivo do projeto foi tocado por mim
nesta sessão. Cartão pronto na minha mão: atalho M chamando o mute do player ativo (respeitando campos de texto
e modificadores), `aria-pressed` + rótulo pt-BR no botão, com teste do atalho e do estado.
  [2026-10-15 14:14] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao
  [2026-10-15 16:20] hugo: Fora da lista "ARQUIVOS QUE PODE TOCAR" por necessidade, uma linha cada (o juiz barato apontou no fechar):

- `src/components/ui/VolumeTriggerButton.tsx`: +1 atributo `data-volume-control` (constante `VOLUME_CONTROL_ATTRIBUTE` de `src/hooks/ui/useVolumeRocker.ts`). Este é o gatilho de volume que o player de áudio (`AudioMessagePlayer` → `MediaVolumeControl`) e o controle de ALERTAS (`SoundVolumeControl`) renderizam. Sem a marca seria REGRESSÃO: o registry global captura o `keydown` na janela e faz `stopPropagation`, então o `M` novo tornaria inalcançável o `M` local do `useVolumeRocker` (E16) — e no gatilho dos alertas esse `M` muda o mudo dos ALERTAS, não o das mídias (o atalho novo passaria a mudar o mudo errado). Provado em `src/hooks/__tests__/useGlobalKeyboardShortcuts.audioMute.test.tsx` (caso "o M global cede o toque ao controle"): sem a cedência, `expected "vi.fn()" to be called with arguments: [ { soundEnabled: false } ] / Number of calls: 0`.
- O barramento saiu de `src/lib/` para `src/hooks/communication/audioPlaybackBus.ts` (e o teste para `src/hooks/communication/__tests__/`), dentro de "src/hooks/ (audio)".

Nota de escopo: o `M` pergunta ao store de reprodução exclusiva (A01/PH-22) se há áudio tocando e delega o mudo ao `mediaVolumeStore` (controle global, D2/E4) — a V2 não tem mudo por player, e criar um faria o botão do balão mostrar coisa diferente do som.

Events (272):
  [2026-10-15 16:20] commented {'author': 'hugo', 'len': 1396}
  [2026-10-15 16:21] [run 18564] heartbeat
  [2026-10-15 16:22] [run 18564] heartbeat
  [2026-10-15 16:23] [run 18564] heartbeat
  [2026-10-15 16:24] [run 18564] heartbeat
  [2026-10-15 16:25] [run 18564] heartbeat
  [2026-10-15 16:26] [run 18564] heartbeat
  [2026-10-15 16:27] [run 18564] heartbeat
  [2026-10-15 16:28] [run 18564] heartbeat
  [2026-10-15 16:29] [run 18564] heartbeat
  [2026-10-15 16:30] [run 18564] heartbeat
  [2026-10-15 16:31] [run 18564] heartbeat
  [2026-10-15 16:32] [run 18564] heartbeat
  [2026-10-15 16:33] [run 18564] heartbeat
  [2026-10-15 16:34] [run 18564] heartbeat
  [2026-10-15 16:35] [run 18564] heartbeat
  [2026-10-15 16:37] [run 18564] heartbeat
  [2026-10-15 16:38] [run 18564] heartbeat
  [2026-10-15 16:39] [run 18564] heartbeat
  [2026-10-15 16:40] [run 18564] heartbeat

Runs (21):
  #12749 rate_limited @hugo  44s  2026-10-13 16:36
        ! pid 34528 exited rate-limited (quota wall) — requeued without counting a failure
  #12924 rate_limited @hugo  34s  2026-10-13 16:43
        ! pid 33812 exited rate-limited (quota wall) — requeued without counting a failure
  #13093 rate_limited @hugo  33s  2026-10-13 16:48
        ! pid 26832 exited rate-limited (quota wall) — requeued without counting a failure
  #13292 rate_limited @hugo  36s  2026-10-13 16:55
        ! pid 42572 exited rate-limited (quota wall) — requeued without counting a failure
  #13520 rate_limited @hugo  67s  2026-10-13 17:02
        ! pid 40468 exited rate-limited (quota wall) — requeued without counting a failure
  #13702 rate_limited @hugo  49s  2026-10-13 17:09
        ! pid 37216 exited rate-limited (quota wall) — requeued without counting a failure
  #13886 rate_limited @hugo  25s  2026-10-13 17:15
        ! pid 36992 exited rate-limited (quota wall) — requeued without counting a failure
  #14057 rate_limited @hugo  37s  2026-10-13 17:21
        ! pid 21056 exited rate-limited (quota wall) — requeued without counting a failure
  #14235 rate_limited @hugo  35s  2026-10-13 17:27
        ! pid 29464 exited rate-limited (quota wall) — requeued without counting a failure
  #14415 rate_limited @hugo  24s  2026-10-13 17:33
        ! pid 33348 exited rate-limited (quota wall) — requeued without counting a failure
  #14605 rate_limited @hugo  35s  2026-10-13 17:39
        ! pid 7704 exited rate-limited (quota wall) — requeued without counting a failure
  #14797 rate_limited @hugo  35s  2026-10-13 17:46
        ! pid 20936 exited rate-limited (quota wall) — requeued without counting a failure
  #14978 rate_limited @hugo  33s  2026-10-13 17:51
        ! pid 39896 exited rate-limited (quota wall) — requeued without counting a failure
  #15149 rate_limited @hugo  23s  2026-10-13 17:57
        ! pid 33408 exited rate-limited (quota wall) — requeued without counting a failure
  #15327 rate_limited @hugo  34s  2026-10-13 18:03
        ! pid 39476 exited rate-limited (quota wall) — requeued without counting a failure
  #15523 rate_limited @hugo  36s  2026-10-13 18:10
        ! pid 39356 exited rate-limited (quota wall) — requeued without counting a failure
  #15700 rate_limited @hugo  35s  2026-10-13 18:16
        ! pid 26292 exited rate-limited (quota wall) — requeued without counting a failure
  #15881 rate_limited @hugo  69s  2026-10-13 18:22
        ! pid 28244 exited rate-limited (quota wall) — requeued without counting a failure
  #16074 rate_limited @hugo  37s  2026-10-13 18:28
        ! pid 16088 exited rate-limited (quota wall) — requeued without counting a failure
  #16552 blocked      @hugo  253s  2026-10-14 11:10
        → Fábrica travada por guarda: o marcador ~/.local/libexec/hermes-guard/MODO_V2 sumiu (por volta de 10:45 de 14/10) e, sem ele, hermes-tarefa-iniciar e hermes-tare
  #18564 running      @hugo  active  2026-10-15 15:59
