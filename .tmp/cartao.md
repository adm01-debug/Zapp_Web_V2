Task t_e2be6c16: fix(audio): player de áudio com botões nomeados, barra de posição operável por teclado e status anunciado
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_e2be6c16
  max-retries: 2 (default)
  created:   2026-10-13 08:59 by claude
  started:   2026-10-14 11:51

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 do doc `docs/estado/10-features-inbox-components-raiz-a-m.md` (58 componentes da raiz de `src/features/inbox/components/`, A-M). Já existiam cartões do chat (partes 1-5), PE (docs 10-40) e outros; estes são os ACHADOS QUE ELES DEIXARAM PASSAR (3 leitores, com os mais graves reconferidos no código da branch viva em 13/10/2026). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia sempre `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`: a árvore de trabalho está 99 commits atrás); a V2 costuma estar melhor e NÃO tem `src/features/inbox` (os equivalentes estão em `src/components/inbox`, `src/hooks`, `src/pages`): NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas, exportar/importar/baixar/copiar/imprimir/CSV (nenhuma informação sai do sistema), edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador, /note e /tag em botão interativo, API pública. Antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`components/inbox/AudioMessagePlayer.tsx`: o botão play/pausa/recarregar só tem ícone (sem `aria-label`, ~L137); o seek da waveform é `div onClick` sem `role="slider"`, `aria-valuenow` nem teclado (~L143); o selo 'Falhou - Tentar novamente' é `motion.div onClick`, não `button` (~L102); o botão de transcrição só tem `title`; o status (Transcrevendo/Falhou) não está em `aria-live`; 30 barras com animação infinita por bolha. O PE-56 cobre só o estado verdadeiro da transcrição e o PH-22 uma reprodução por vez.

O QUE FAZER
1. `aria-label` nos botões; seek com `role="slider"`, `aria-valuemin/max/now` e setas; selo de falha como `button`; `role="status"` na transcrição; animação das barras só na bolha tocando; respeitar `prefers-reduced-motion`.

ARQUIVOS QUE PODE TOCAR
- src/components/inbox/AudioMessagePlayer.tsx
- src/components/inbox/__tests__/AudioMessagePlayer.a11y.test.tsx (novo)

CRITÉRIO DE PRONTO
1. Teste a11y no padrão `*.a11y.test.tsx` passa.
2. Seek por seta funciona.
3. `zapp-verify . --rapido` verde.


Latest summary:
Abertura de workspace congelada (estado da guarda, fora do meu alcance). `hermes-tarefa-iniciar Zapp_Web_V2 audio-player-a11y` devolve CONGELADO/exit 75 porque `~/.local/libexec/hermes-guard/CONGELADO` existe e o marcador `MODO_V2` está AUSENTE (medido 14/10 11:56; pasta hermes-guard mudou às 10:45). Sem workspace não há onde editar/commitar. Não contornei a guarda (não recriei o marcador). Mesmo bloqueio em t_38e58f50 e t_3d996237; decisão registrada em 20261014-115750-bc5b-sem-tarefa. Falta o dono da guarda restaurar o MODO_V2 ou confirmar a pausa; o cartão reabre sozinho quando o marcador voltar.

Comments (2):
  [2026-10-14 11:57] iris: **Bloqueio de ambiente (não é do cartão): abertura de workspace congelada — paro no passo 2 do fluxo.**

Passo 2 do FLUXO, com workdir `/home/joaquim_ataides/projetos/Zapp_Web_V2`:

```
hermes-tarefa-iniciar Zapp_Web_V2 audio-player-a11y
CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2.
Não tente contornar. Estacione: deixe o trabalho no workspace, registre o estado com hermes-pedir-decisao e pare.
exit_code 75
```

Diagnóstico medido (14/10 11:56, hora local):
- `hermes-tarefa-iniciar` congela quando existe `~/.local/libexec/hermes-guard/CONGELADO` **e falta** `~/.local/libexec/hermes-guard/MODO_V2` (linhas 4-10 do script).
- `CONGELADO` existe (04/10 11:22). O marcador `MODO_V2` está **ausente** (`ls` direto no caminho e glob `*V2*`: "No such file or directory").
- Só a ABERTURA de workspace novo está travada; workspaces antigos seguem ativos (último mtime 11:52 e a fila do integrador ainda recebia arquivos às 11:31). Nada novo aberto após ~10:45 (mtime da pasta `hermes-guard`).
- Não contornei a guarda: não recriei o marcador nem abri worktree à mão.

Cartões irmãos na MESMA parede: `t_38e58f50` (hugo, ~11:15, blocked capability) e `t_3d996237` (hugo, ~11:35). O mesmo estado já foi registrado em `~/.hermes/tmp/t_38e58f50-congelado.md` e `~/.hermes/tmp/t_3d996237-congelado.md`, e há decisões pendentes em `hermes-workspaces/.decisoes` pedindo a restauração do marcador.

Sem workspace não há onde editar/commitar: o cartão não anda. O dono da guarda (`MODO_V2` é estado da guarda, só o dono escreve) precisa decidir entre restaurar o marcador ou confirmar a pausa. O cartão reabre sozinho quando o marcador voltar.
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao

Events (35):
  [2026-10-15 21:08] reprioritized {'priority': 9}
  [2026-10-15 21:09] [run 18723] claimed {'lock': 'Joaquim:38172', 'expires': 1792110244, 'run_id': 18723}
  [2026-10-15 21:09] [run 18723] spawned {'pid': 28196, 'started_at': '|179210934491'}
  [2026-10-15 21:09] [run 18723] heartbeat
  [2026-10-15 21:10] [run 18723] heartbeat
  [2026-10-15 21:11] [run 18723] heartbeat
  [2026-10-15 21:12] [run 18723] heartbeat
  [2026-10-15 21:13] [run 18723] heartbeat
  [2026-10-15 21:14] [run 18723] heartbeat
  [2026-10-15 21:15] [run 18723] heartbeat
  [2026-10-15 21:16] [run 18723] heartbeat
  [2026-10-15 21:17] [run 18723] heartbeat
  [2026-10-15 21:18] [run 18723] heartbeat
  [2026-10-15 21:19] [run 18723] heartbeat
  [2026-10-15 21:20] [run 18723] heartbeat
  [2026-10-15 21:21] [run 18723] heartbeat
  [2026-10-15 21:22] [run 18723] heartbeat
  [2026-10-15 21:23] [run 18723] heartbeat
  [2026-10-15 21:24] [run 18723] heartbeat
  [2026-10-15 21:26] [run 18723] heartbeat

Runs (2):
  #16706 blocked      @iris  410s  2026-10-14 11:51
        → Abertura de workspace congelada (estado da guarda, fora do meu alcance). `hermes-tarefa-iniciar Zapp_Web_V2 audio-player-a11y` devolve CONGELADO/exit 75 porque 
  #18723 running      @iris  active  2026-10-15 21:09
