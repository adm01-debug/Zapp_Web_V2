Task t_1e581b6b: fix(team-chat): aniversários dos colegas aparecem (usa a RPC sem ano; Próximos Aniversários deixa de ficar sempre vazio)
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_1e581b6b
  max-retries: 2 (default)
  created:   2026-10-13 09:30 by claude
  started:   2026-10-16 07:41
  parents:   t_4593622c

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 do doc `docs/estado/26-hooks-raiz-4.md` (hooks raiz S-Z). Relatórios com a evidência completa de cada achado (leia a seção do id citado antes de editar): `docs/audits/AUDITORIA_PARIDADE_V3_DOC_26_2026-10-13_PARTE1..5` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-hooks26/achados_*.md`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que ela faz melhor, NÃO copie arquivos inteiros e NÃO porte bug da V3. FORA DE ESCOPO (decisões do dono): tags/etiquetas (função excluída), exportar/importar/baixar/copiar/imprimir dados novos, edição em massa de contatos, SLA de Resolução, webhook externo de alerta, enviar dados para fora do sistema. Os achados foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026, que NÃO contém cartões `done` ainda não integrados: antes de editar, procure cartões irmãos com `python3 ~/arquitetura-v2/paridade-hooks26/buscar_todos.py 'termo'` e na fila `~/hermes-workspaces/.v2-fila/*.json`; se algo já estiver feito, prove no relato em vez de refazer. O banco local `v2-integrador` pode estar defasado: confira o que o cartão mandar no banco local em dia (aplique as migrations da branch).
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos (nada para `anon` sem necessidade), e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; sem log de telefone, token ou texto de mensagem; cores só tokens do sistema; mexa SOMENTE nos arquivos listados (se precisar de outro, diga no relato por quê).

PROBLEMA (evidência conferida)
Consome a RPC do HZ-28. `useTeamMemberDetails` fixa `birthday: null`; `getBirthdayInfo` espera a data completa. Reaproveite `useTeamProfiles` (`hooks/crm/useTeamProfiles`) com chave única e `staleTime` de alguns minutos para não repetir a RPC (risco B do relatório). Relatório achados_3 HZ3-002.

O QUE FAZER
1. Hook busca `get_team_birthdays` e preenche dia/mês; ajuste `getBirthdayInfo` para trabalhar sem ano (próximo aniversário, 'hoje', dias restantes) sem exibir idade.
2. Teste de componente: grupo com 2 colegas com aniversário mostra os dois ordenados por dias restantes; sem aniversários mostra o estado vazio; nenhum ano/idade na tela.

ARQUIVOS QUE PODE TOCAR
- src/hooks/team-chat/useTeamMemberDetails.ts
- src/components/team-chat/TeamMemberProfileHeader.tsx e TeamMemberDetails.tsx
- src/lib/ (getBirthdayInfo)
- testes

CRITÉRIO DE PRONTO
1. Os dois testes verdes.
2. Nenhuma idade exibida.
3. `zapp-verify . --rapido` verde.


Events (89):
  [2026-10-16 08:46] [run 19565] heartbeat
  [2026-10-16 08:47] [run 19565] heartbeat
  [2026-10-16 08:48] [run 19565] heartbeat
  [2026-10-16 08:49] [run 19565] heartbeat
  [2026-10-16 08:50] [run 19565] heartbeat
  [2026-10-16 08:51] [run 19565] heartbeat
  [2026-10-16 08:52] [run 19565] heartbeat
  [2026-10-16 08:53] [run 19565] heartbeat
  [2026-10-16 08:54] [run 19565] heartbeat
  [2026-10-16 08:55] [run 19565] heartbeat
  [2026-10-16 08:56] [run 19565] heartbeat
  [2026-10-16 08:57] [run 19565] heartbeat
  [2026-10-16 08:58] [run 19565] heartbeat
  [2026-10-16 08:59] [run 19565] heartbeat
  [2026-10-16 09:00] [run 19565] heartbeat
  [2026-10-16 09:01] [run 19565] heartbeat
  [2026-10-16 09:02] [run 19565] heartbeat
  [2026-10-16 09:03] [run 19565] heartbeat
  [2026-10-16 09:04] [run 19565] heartbeat
  [2026-10-16 09:05] [run 19565] heartbeat

Runs (1):
  #19565 running      @hugo  active  2026-10-16 07:41
