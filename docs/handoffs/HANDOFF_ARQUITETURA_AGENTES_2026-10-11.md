# Handoff: arquitetura de agentes (Hermes) e a operação da paridade V3 → V2

> Escrito em 11/10/2026 ~09:40 pelo Claude, para o próximo chat continuar sem perguntar nada ao Joaquim sobre o que já foi decidido.
> Tudo aqui foi verificado no código, no banco do quadro ou na execução, salvo onde estiver escrito "não verificado".
> **Nenhuma chave de API está neste documento.** As chaves ficam nos `.env` dos perfis (ver seção 9).

## 0. Leia primeiro (5 linhas)

1. O Joaquim (dev sênior, fala PT-BR) quer **decisão e execução**, não rascunho: "aqui já criamos e delegamos". Nunca oferecer menu A/B quando uma opção recomendada resolve; perguntar só o que é decisão dele (produto, dinheiro, segurança).
2. O trabalho é feito por **agentes Hermes** (perfis especializados) que pegam **cartões** de um quadro Kanban. O Claude **planeja, cria os cartões, delega, acompanha e valida**; não implementa o código de produto.
3. Neste momento há **32 cartões em andamento** (seção 6) da frente "paridade V3 → V2". Falta acompanhá-los e **validar o resultado no final**.
4. Há **riscos operacionais abertos** (seção 8): fila do integrador grande, chave que expira em 10/11, `gh` ausente no Windows.
5. Para ver a situação agora: `python3 ~/arquitetura-v2/paridade-v3/status.py`.

## 1. Quem é quem

| Papel | Quem | O que faz |
|---|---|---|
| Dono | Joaquim Ataides (`ti@promobrindes.com.br`) | decide produto/prioridade; é o único que publica PR/push (regra da fábrica) |
| Planejador e validador | Claude (este chat) | analisa, escreve plano, cria cartões, acompanha, valida |
| Executores | agentes Hermes (14 perfis + `default`) | implementam cartões em worktrees locais |
| Integrador | `~/arquitetura-v2/integrador/integrar.sh` (timer) | junta entregas aprovadas na branch do dia, verifica e faz bissecção |

Memória persistente do Claude: `~/.claude/projects/-mnt-c-Users-Joaquim-Ataides/memory/` (índice `MEMORY.md`). **Leia o índice antes de agir**; ele tem as regras permanentes (as 4 regras, roteamento, "DeepSeek Pro proibido", "ESTOP só o Joaquim retoma", etc.).

## 2. Onde as coisas moram

| O quê | Caminho |
|---|---|
| Hermes (Windows) | `C:\Users\Joaquim Ataides\AppData\Local\hermes` = no WSL `/mnt/c/Users/Joaquim Ataides/AppData/Local/hermes` |
| Código do Hermes | `…/hermes/hermes-agent/` (v0.21.5, fixado em 2026.9.24; não atualizar) |
| Quadro da V2 | `…/hermes/kanban/boards/zapp-web-v2/` (`kanban.db`, `logs/`, `workspaces/`) |
| Perfis | `…/hermes/profiles/<perfil>/` (`.env`, `config.yaml`, `auth.json`) |
| Binário | `…/hermes/bin/hermes.exe`; no WSL o atalho `hermes` (`~/.local/bin/hermes`) chama o `.exe` |
| Arquitetura V2 (scripts da fábrica) | `~/arquitetura-v2/` |
| Repositório de referência (somente leitura, desatualizado: 05/10) | `~/projetos/Zapp_Web_V2` |
| **Branch viva da fábrica** (`dia/AAAA-MM-DD`, só local) | worktree `~/hermes-workspaces/Zapp_Web_V2/.integrador` |
| Worktrees dos agentes | `~/hermes-workspaces/Zapp_Web_V2/<slug>-<id>` |
| Fila do integrador | `~/hermes-workspaces/.v2-fila/*.json` |
| GitHub | `adm01-debug/Zapp_Web_V2` (`main`); V3 aposentada: `adm01-debug/Zapp_Web_V3` (cópia em `~/projetos/Zapp_Web_V3`) |
| Banco de produção | Supabase `tnnnlkbymytvtqngbbqh` (`CLAUDE.md` §1 do repo); agentes usam banco local |

Atenção: a `main` do GitHub e a branch `dia/*` local **divergem**. Para auditar código "como os agentes veem", use o worktree `.integrador`. Para o que já está no GitHub, use `gh api`. A cópia `~/projetos/Zapp_Web_V2` está parada em 05/10.

## 3. Como o Hermes organiza os cartões (arquitetura)

- **Um SQLite por quadro.** Código: `hermes_cli/kanban_db.py` (esquema/operações), `kanban_db_dispatch.py` (`dispatch_once`, a cada 10 s), `tools/kanban_tools.py` (o que o agente chama), `gateway/kanban_watchers*.py`.
- **Tabelas:** `tasks`, `task_runs` (uma por tentativa), `task_events` (log), `task_links` (pai→filho), `task_comments`, `task_attachments`, `kanban_notify_subs`.
- **Status:** `triage → todo → scheduled → ready → running → blocked/review → done → archived`. Um cartão com pai não terminado fica `todo`; ao fechar o pai, promove sozinho.
- **Limites** (`config.yaml`): `max_in_progress 8`, `max_in_progress_per_profile 6`, `failure_limit 2`. Quem exceder espera em `ready`.
- **Guardas:** cooldown de 5 min após `rate_limited`; cartão bloqueia sozinho após erro de credencial (exit 78).
- **Gateway:** um único processo (`hermes gateway`) atende os 14 perfis. `hermes gateway status | list | stop | start`. Hoje está **rodando**.
- **Retenção:** Hermes já poda eventos de cartões encerrados com 30 dias (`gc_events`).
- **`completion_contract`:** o Hermes sabe exigir PR + checks do GitHub para fechar um cartão. **NÃO usar** `OWNER/REPO` ou URL de PR: no modo V2 o agente não publica PR e o `gh` não existe no Windows (piloto `t_a90db181`, arquivado). Todos os cartões usam `local-only`.

## 4. Perfis e roteamento

Perfis: `worker`, `complexo`, `coordenador`, `senior`, `designer`, e os especialistas `iris` (telas e componentes), `hugo` (hooks, estado e dados no front), `edgar` (Edge Functions), `vera`, `workersql` (banco/migrations/RLS), `workerauth`, `workeria`, `workermensageria`, `workertestes`.

Roteamento oficial: `~/arquitetura-v2/skills/rotear.py` (`area_do_cartao`, `especialista`) com a tabela `skills/especialistas.json`. Regra prática:
- `src/components|pages|features/**` → **iris**; `src/hooks|services|lib/**` → **hugo**;
- `supabase/functions/**` → **edgar**; `supabase/migrations/**` e RLS → **workersql**;
- `scripts|e2e|tests|.github` → **workertestes**; docs sem especialista → **worker**.
Cartão que atravessa camadas **não cabe em um cartão** (vários bloqueios em 08/10 e 09/10 foram por isso): **divida por camada e encadeie com dependência** (pai→filho).

Modelos: `worker` e o padrão usam `deepseek/deepseek-v4.1-flash` via OpenRouter (os demais perfis de trabalho foram clonados do `worker`; não conferi um a um); `coordenador` usa `muse-spark` (Meta). **DeepSeek Pro é proibido** (só Flash).

## 5. Modo de trabalho V2 (como uma entrega vira código)

1. O agente trabalha **local**, num worktree, e fecha com `zapp-verify . --rapido` (verde obrigatório).
2. Escreve a entrega na **fila do integrador** (`.v2-fila/<id>.json`, estados: `pronto`, `integrado`, `rejeitado`, `falhou`, `conflito`, `humano`, `vazio`, `superado`).
3. O **integrador** (timer `v2-integrador`) junta as entregas na branch do dia e roda a verificação completa; se ficar vermelha faz **bissecção** e o **limpador** (`~/arquitetura-v2/limpador`) retira quem quebra o build.
4. A promoção do lote para a `main` é por **squash** e ação do Joaquim (método na memória "Lote para a main").
5. **Push e PR são reservados ao Joaquim.** Agente que precisa disso bloqueia pedindo autorização.

Timers `v2-*` (systemd de usuário): gatilhos, revisor, supervisor, especialistas, balanceador, sensor, telemetria, resumo, auditor, integrador, portão, entre outros. `systemctl --user list-timers | grep v2-`.

## 6. A frente atual: paridade V3 → V2 (32 cartões)

**Origem:** o Joaquim pediu para comparar a V2 com o documento `docs/estado/08-features-inbox-components-chat-1.md` da V3 (aposentada). Relatório completo (leia): `docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1_2026-10-11.md`. Conclusões principais: 23 dos 50 itens da V3 não existem na V2; V2 tem código pronto e **morto** (Histórico de envio, `MessageContextMenu`, `ChatHeader.tsx`); modelo de dados é diferente (V2 usa `public.messages`; V3 usava `evo.evolution_messages`), então **nada se copia, tudo se reescreve**. O plano antigo `docs/plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md` já listava estes itens (etapas 029, 061, 062, 070, 077) e nunca foram feitos.

**Decisões do Joaquim (11/10) — não perguntar de novo:**
- Tabela `message_attempts` com erro do provedor por tentativa; RPC de re-fila (`requeue_failed_outbound_message`); RPCs assumir/devolver à fila **sem** roteador sticky; sugestões de automação ligadas à base de conhecimento (`knowledge_base_articles`) com Edge própria; painel de métricas **admin e supervisor**; detalhe técnico/payload **só admin**; favoritar, fixar, adiar e reportar mensagem **todos**; "Arquivos da Equipe" reaproveitando o chat de equipe (bucket `team-chat-files`).
- **Design:** "criativo, moderno e interativo, nas cores do sistema". Está embutido em todo cartão de tela (tokens de `src/styles/tokens.css`, `framer-motion` com `src/lib/motion.ts`, `useReducedMotion`, nada de cor literal, sem dependência nova).

**Cartões** (ids em `~/arquitetura-v2/paridade-v3/ids_todos.json`; pai → filho entre parênteses):

| Grupo | Cartões |
|---|---|
| A/B (8) | C1 `t_f5dee1c9` histórico no menu · C2 `t_88c7bb75` barra de entrega e aviso de falha · C4 `t_971a42f6` remove código morto · C5 `t_15632e12` busca sem resultado · C6 `t_af83b921` estado vazio e "rolar ao final" · C7 `t_17f4ab87` respostas rápidas/edição · C8a `t_40f43ad4` (hugo) tipo `unsupported` → C8b `t_e179c397` balão não suportado |
| Design | D0 `t_24fd984a` (designer) kit de microinterações · D1 `t_54ec0a4d` revisão visual (depende de C2, C5, C6, C7, C8b, D0) |
| Tentativas | M1 `t_3403a565` tabela → M1b `t_804f9898` RPC métricas → M2 `t_4ba1e853` Edge grava tentativa · M3 `t_efe1df3a` hooks → M4 `t_7d439b56` histórico por tentativa → M5 `t_7996d20d` detalhes (admin) · M6 `t_b565a126` painel de métricas |
| Reenvio | R1 `t_be0e6647` RPC → R2 `t_2de573e6` botão "Tentar agora" |
| Ticket | T1 `t_4e49a6dc` RPCs → T2 `t_a8569ebe` hook → T3 `t_d4c64af1` barra no cabeçalho |
| Automação | A1 `t_921e4aea` Edge → A2 `t_bb34f070` hook → A3 `t_8145d5a7` barra de sugestões |
| Ações por mensagem | F1 `t_3f7a2b9b` tabelas → F2 `t_f025e4be` lembrete → F3 `t_1847bb77` hooks → F4a `t_a3842ab6` menu → F4b `t_00434a6d` estrela/fixadas/filtro |
| Arquivos | TF1 `t_53b9e4e7` hook → TF2 `t_20e4f4c4` painel |

**Estado no momento do handoff (09:40; depois disso o C2 foi recusado pelo revisor e virou o refazer `t_10f10613`, e os corpos dos cartões de tela receberam o escopo de design e as regras de interação):** 2 `done` (C1, C2), 6 `running`, 5 `ready`, 19 `todo` (esperando pai, de propósito), 0 falhas. Repita `status.py` para o estado real.

## 6b. Segunda passada da auditoria (11/10, tarde) e cartões extras

Relatório: `docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE2_COMPORTAMENTO_2026-10-11.md` (leia: bugs ativos da V2 e decisões).
Geradores-modelo: `~/arquitetura-v2/paridade-v3/faixa_d.py` (14 cartões de bug e lacuna sem decisão) e `faixa_e.py` (21 cartões das decisões do Joaquim). Ids em `ids_todos.json` (72 no total, contando os refazer). Reiniciar o vigia: `~/arquitetura-v2/paridade-v3/reiniciar_vigia.sh` (não use `pkill -f` com o nome do script na linha de comando: ele mata o próprio shell).

**Achado crítico:** nada envia as mensagens de `scheduled_messages` (nenhuma Edge, função ou job do pg_cron; tabela vazia no banco vivo). Cartão `AG2` cria o enviador; `AG1` corrige o falso "Mensagem agendada!".

**Decisões do Joaquim (11/10, 2ª rodada), não perguntar de novo:** sussurro no compositor (Alt+W); transferir endurecido (RPC atômica, compare-and-set, auditoria, diálogo só fecha no sucesso); separar Resolver, Encerrar e Arquivar; nome do remetente em grupo ponta a ponta; alerta de atraso de entrega com tela de configuração; escopo da inbox Meus, Departamento e Todos com auditoria; botão interativo responde ao cliente (**/note e /tag NÃO**); vocabulário de status com "Visualizada" e estados novos no banco.

| Grupo | Cartões |
|---|---|
| Bugs e lacunas | AG1 `t_6b297314`, AG2 `t_f23e9286`, SN1 `t_659cc180`, PH1 `t_d81a2f09`, RB1 `t_a6f1b5ef`, GR1 `t_0b1c8f85`, DL1 `t_f89b8a0f`, DL2 `t_b99c01ba`, IN1 `t_22db2fb7`, IN2 `t_7d6bd303`, SL1 `t_717216ae`, SL2 `t_f73eb99b`, PO1 `t_32b9a4d7`, PO2 `t_462fab43` |
| Sussurro e botão interativo | WH1 `t_d00bb4e8` → WH2 `t_1c0eb818`; IB1 `t_c6abd763` |
| Transferir e Resolver | TR1 `t_ae4cb0eb` → TR2 `t_6e081e3d` → TR3 `t_9ef7a3bc`; RS1 `t_0fa3ec4d` |
| Grupos | GP1 `t_35d5aa82` → GP2 `t_5c2921a9` → GP3 `t_8fb8fa53` → GP4 `t_f8c52e09` |
| Atraso de entrega | SD1 `t_5db4faa7` → SD2 `t_a139d0cb`; SD3 `t_6f4e24f4`; SD4 `t_5e5c720a` |
| Escopo da inbox | ES1 `t_7b157a81` → ES2 `t_75cdcfa6` → ES3 `t_17290d6f` |
| Vocabulário | VC1 `t_b0bfb9af`, VC2 `t_d20ed6dd` → VC3 `t_b5b33b6c` |

Arquivos disputados são encadeados por dependência (ChatPanel.tsx, ChatMessagesArea.tsx, ChatPanelHeader.tsx, useChatPanelHandlers.ts). O religador (`religar.py`) desbloqueia sozinho os filhos cujo pai foi `integrado`.

## 6c. Plano de 30 etapas, portões de integração e validação

- Plano: `docs/plans/PLANO_PARIDADE_V3_30_ETAPAS_2026-10-11.md` (ondas 0 a 5, aceite por etapa, riscos, decisões e portões do Joaquim).
- Cartões extras do plano (`faixa_f.py`, 12): flags com rollout `FL1`..`FL4`, e2e `E2E1`..`E2E3`, acessibilidade `A11Y1`, simulação integrada `RG1`, segurança `SEC1` (perfil senior), documentação `DOC1`, roteiro de promoção `PR1`. Total acompanhado: 84 (`ids_todos.json`).
- **Portão de integração** (`portao.py`): cada pai com filhos esperando ganha um cartão-portão sem agente (`[portão] <chave> integrado antes dos dependentes`, em `scheduled`); o filho depende do portão. O vigia abre o portão (`unblock` + `complete --force`) quando o pai OU o refazer dele foi `integrado` na fila. Motivo: filho liberado com o pai só `done` improvisava `cherry-pick` do pai e era recusado (M2, T2). Comandos: `portao.py instalar` (cria os que faltam; LENTO, a CLI do Hermes leva ~10 s por chamada com a máquina carregada), `portao.py abrir`, `portao.py estado`. Rode `instalar` de novo quando criar cartões novos.
- **Validador mecânico** (`validar_entregas.py`): para cada entrega integrada acha o commit na branch do dia (pelo título) e confere arquivos fora da lista, cor literal, listener global de teclado, componente novo sem teste, `eslint-disable`/`console.log`/TODO e, em SQL, RLS, `search_path`, REVOKE e `USING (true)`. O vigia o roda a cada ~10 min. Resultado em `validacao.json`. A validação semântica (ramo de tela realmente renderizado, teste cobre o caso, relato bate com o diff) continua sendo minha.
- Padrões de recusa do revisor (11/10): (1) cherry-pick de pai não integrado; (2) contrato literal do cartão não seguido (ex.: `conteudo_improprio` em vez de `improprio`, `search_path`); (3) regressão funcional (SN1 apagava só uma linha antiga); (4) bug de cache no hook (A2). Cartão novo deve repetir o contrato literal e pedir teste que falhe sem a regra.

## 6d. Terceira passada (documento 08-chat-2) e estado final do plano

- Relatório: `docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE3_HOOKS_E_TESTES_2026-10-11.md`. Achados de segurança confirmados no banco vivo: qualquer agente reescreve o conteúdo de mensagem (política de UPDATE sem `WITH CHECK`); `scheduled_messages` sem checagem de visibilidade (risco para o enviador `AG2`); `whisper_messages` sem visibilidade na escrita.
- Geradores: `faixa_f.py` (plano), `faixa_g.py` (lacunas do plano), `faixa_h.py` (20 cartões da parte 3), `faixa_i.py` (10 cartões das decisões). Total acompanhado: **120** em `ids_todos.json`.
- Decisões do dono (3ª rodada): agendamento sem limite de antecedência, envia até 15 min de atraso e depois expira com aviso, com assinatura; prioridade manual separada da IA; encaminhar para grupos; marca "Encaminhada". `/note` e `/tag` continuam de fora.
- O refazer do `AG2` (`t_f26645dd`, perfil senior) recebeu as decisões no corpo.
- Mapeamento dos cartões novos nas 30 etapas: seção 8 do plano.

## 6e. Revisão exaustiva do plano (11/10, fim do dia)

- `revisar_plano.py` (estrutura: existência, responsável válido, corpo, dependências, portões, cartões presos, duplicatas) e `reconciliar.py` (cada achado das partes 1 a 3 e do plano ligado a cartão existente ou a descarte com motivo; gera `docs/audits/RECONCILIACAO_CARTOES_PARIDADE_V3_2026-10-11.md`). Resultado: 90 itens, 75 com cartão, 15 descartes explícitos, 0 cartões inexistentes. Total acompanhado: **122** (+ `BA1` balão acessível e `PL1` polimento).
- Delegação conferida contra o roteador oficial (`skills/rotear.py`): refazer são roteados pelo sistema para `senior`/`designer`; testes por TEMA vão à `workertestes` (mesmo que a pasta sugira `vera`/`iris`); cartões que editam arquivos de `src/components/inbox/**` ficam com a `iris` mesmo sendo lógica de hook (regra da fábrica: a área é onde o arquivo mora). Seis cartões foram reatribuídos de `hugo` para `iris` por isso (`IN1`, `PO1`, `IB1`, `VC1`, `ED2`, `PH2`).
- Itens operacionais fora do plano de produto (meus): validar `C1` e `C2`; arquivar os portões ao final; renovar a chave do provedor antes de 10/11 (dono); `poda de eventos` e passar `gatilhos.py`/`pendencias.py` pelo `hermes-cartao-criar` continuam como melhorias opcionais.

## 7. Receita: criar, delegar, acompanhar, validar

**Criar (sempre pelo wrapper):**
```bash
hermes-cartao-criar --perfil <perfil> --titulo "<tipo>(<escopo>): <título>" \
  --corpo-arquivo corpo.md --prioridade 5 --chave-idempotencia <chave-unica> [--pai <id>]...
# --simular valida sem criar; --forcar-perfil ignora a conferência de área do roteador
```
- O wrapper (`~/.local/bin/hermes-cartao-criar`) recusa perfil inexistente, corpo curto, contrato inválido e **área errada** (usa `rotear.py`); não aceita `--project`/`--workspace`/`--branch`; manda o corpo por stdin; é idempotente pela chave.
- Para vários cartões encadeados use o gerador `~/arquitetura-v2/paridade-v3/faixa_c.py` como **modelo** (`--criar` cria; sem flag só simula; respeita a ordem dos pais). Vínculo extra depois: `hermes kanban link <pai> <filho>`.
- Formato do corpo que funciona (modelo: cartão `t_449b29e8`): `ESPECIALISTA DA ÁREA` · `PROBLEMA` (com fatos verificados no código atual) · `O QUE FAZER` (numerado) · `ARQUIVOS QUE PODE TOCAR` (lista **completa**; lista curta demais foi a causa de muitos bloqueios) · `CRITÉRIO DE PRONTO` (inclui `zapp-verify . --rapido verde`). Mande o agente **confirmar no código atual** antes de mexer.
- Comentário em cartão: `hermes kanban comment <id> "<texto>"` (o agente lê no início da execução).

**Acompanhar:** `python3 ~/arquitetura-v2/paridade-v3/status.py` (estado) e `python3 ~/arquitetura-v2/paridade-v3/vigia.py` em segundo plano (sai e te acorda quando algum cartão bloqueia/falha, quando todos terminam ou após 40 min; **o vigia do chat anterior morreu com a sessão: reinicie**). Detalhe de um cartão: `hermes kanban show <id>` (use `--json`); desbloquear: `hermes kanban unblock <id>`; arquivar: `hermes kanban archive <id>`.

**Quando bloqueia:** leia o motivo (`show`). Classes: `capability` (escopo/lista de arquivos não cabe → recrie dividido), `needs_input` (decisão do Joaquim), erro de credencial (seção 9), `gave_up` por workspace (ver armadilhas). Não destravar no automático sem entender a causa.

**Validar (é do Claude, ao fim de cada cartão):**
1. Ler o relato (`show` → comentários e `summary`) e conferir se bate com o critério de pronto.
2. Conferir a entrega no código da branch viva (`~/hermes-workspaces/Zapp_Web_V2/.integrador`), não só no relato: o arquivo existe, o ramo de UI está de fato **importado/renderizado** (a V2 já teve três artefatos prontos e sem uso), o teste cobre o caso, não há cor literal (`grep -nE "#[0-9a-fA-F]{3,6}|rgb\(|hsl\(" <arquivo>`).
3. Ver a fila: `.v2-fila/<id>.json` e o estado (`integrado` = entrou; `rejeitado/falhou/humano` = voltou).
4. Para cartões com banco: migration aditiva, RLS ligada com política explícita, funções com `SET search_path`, teste de permissão (com acesso, sem acesso, anônimo), tipos gerados atualizados.
5. Fechamento da frente: `D1` faz a revisão visual; depois o Claude confere a lista da seção 6 contra o relatório de auditoria e informa o Joaquim cartão a cartão (feito / fora do escopo / pendente).

## 8. Riscos e pendências abertas

| Item | Situação |
|---|---|
| **Fila do integrador** | em 11/10 ~09:00: ~439 entregas `pronto` (433 com mais de 6 h), 783 `rejeitado`, 135 `falhou`, 61 `humano`, 28 `conflito`. É o gargalo: cartão fechado ≠ código na `main`. |
| **Chave OpenRouter** | trocada em 11/10 08:52 (15 `.env`), **expira em 10/11/2026 11:50 UTC**; renovar antes. Sintoma de expiração: `HTTP 401: API key expired`, exit 78, cartões bloqueados após 1 tentativa. |
| **49 cartões bloqueados antigos** | maioria `capability`/`needs_input` de 08–09/10; 2 eram por 401. Não foram desbloqueados em lote. |
| **`gh` no Windows** | não existe; por isso `completion_contract` de repositório é inviável hoje. |
| **Doc do piloto** | commit `738a3c097` (25 linhas em `FLUXO-HERMES.md`) está na fila do integrador e **não avisa** das duas limitações acima. |
| **Cartões da frente que podem bloquear** | A1 (limites de custo de IA), TF1 (depende da RLS do chat de equipe; o cartão manda bloquear em vez de contornar), F2 (como lembretes são entregues). |
| **Sensor** | chaves em `~/.config/openrouter/{chave,chave-teste}` foram trocadas (200 OK); o `sensor.py` não foi executado manualmente. |
| **`MEMORY.md` mudou** | outro processo atualizou o índice durante o dia (ex.: "Limpador da fila do integrador"); leia o índice atual. |

## 9. Segurança e conduta (obrigatórias)

- **Nunca imprimir valor de chave/token/segredo.** Para conferir, comparar hash curto ou testar contra o endpoint do próprio provedor. O Joaquim colou uma chave no chat do dia 11/10; ela foi aplicada em `profiles/*/.env` e na raiz com backup `.env.bak-chave-20261011085204`. Sugerir rotação é razoável.
- **Ação destrutiva ou externa** (apagar, `--aplicar` em poda, push, PR, gateway stop, rotação de chave) só com pedido explícito. `hermes gateway stop` já foi ordem dele em 09/10; hoje está ligado.
- **Memória do WSL:** medições em paralelo já derrubaram a VM. Máximo 2 processos pesados; preferir leitura/`grep`. Ferramentas de varredura usam cópia do `kanban.db` em diretório temporário (somente leitura), nunca o arquivo vivo.
- **Arquivos baixados** (tarball da V2/V3): extrair em diretório novo e só ler.
- Pedidos de "parar tudo" ou `ESTOP`: só o Joaquim retoma.

## 10. Armadilhas já pagas (não repetir)

1. `hermes kanban create --project/--workspace` → worktree UNC → cartão cai 2× e é dado como perdido. Use o wrapper.
2. `--body-file` com caminho do WSL → `Errno 2` (o `.exe` é do Windows). O wrapper usa stdin; se precisar de arquivo, `C:/Users/...`.
3. Lista de arquivos curta demais ou cartão que atravessa camadas → bloqueio `capability`. Divida por camada.
4. Premissa falsa no cartão (ex.: dados que só existem no Singu): conferir a premissa no código **antes** de criar.
5. Chamar de "problema" o que já passou: antes de priorizar, medir o estado atual (as 3.800 execuções `rate_limited` de 09/10 eram saldo zerado de uma tarde, ~22 s cada, e não se repetiram).
6. Ler `rate_limited` ≠ credencial: exit 78 = credencial recusada; `rate_limited` = cota/saldo. `~/arquitetura-v2/saude/saldo_guarda.py` distingue (NORMAL / SALDO ESGOTADO / CREDENCIAL RECUSADA).
7. **Revisor automático rejeita o que não está no CORPO do cartão.** O `C2` foi recusado porque as interações de design (pílula clicável, Esc, contador com mola) estavam só em comentário, e o revisor as tratou como "fora do escopo"; o cartão de refazer (`t_10f10613`, perfil `senior`) mandava remover tudo. Regra: **todo requisito vai no corpo** (`hermes kanban edit <id> --body`), nunca só em comentário; e vale reler o cartão de refazer que o sistema cria, porque ele pode contradizer o pedido do Joaquim. Defeitos reais que o revisor achou e que viraram regra em todos os cartões de tela: não reutilizar estado de outro recurso, sem listener global de teclado, `AnimatePresence` com filho dentro, timers com cleanup, e nada de mock com nome `signature`/`hmac`/`token` (dispara o filtro do portão).
8. Cartão `done` ≠ código integrado: a entrega pode ficar `rejeitada` na fila do integrador e gerar `[refazer N]` (máx. 2 rodadas). Sempre cruzar com `.v2-fila/<id>.json`.
9. `ugrep` do ambiente reclama de `--include=*.ts` mas funciona; confira o resultado, não o aviso.

## 11. Ferramentas criadas neste chat

| Ferramenta | Para quê |
|---|---|
| `~/.local/bin/hermes-cartao-criar` | criação única de cartões (validação de área, contrato, `--pai`, idempotência) |
| `~/arquitetura-v2/saude/saldo_guarda.py` | veredito de saldo/cota/credencial do motor (só leitura; saída 0/1/2/3) |
| `~/arquitetura-v2/saude/podar_eventos.py` | poda de `heartbeat`/`respawn_guarded` de cartões encerrados (simula por padrão; **nunca aplicado no quadro vivo**) |
| `~/arquitetura-v2/paridade-v3/` | `status.py`, `vigia.py`, `faixa_c.py` (gerador-modelo), `ids_todos.json`, todos os corpos de cartão (`c*.md`, `fc_*.md`) |
| `docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1_2026-10-11.md` | relatório da auditoria |

Observações: o `hermes-cartao-criar` não aceita `--skill` nem `--max-retries`; os criadores antigos (`gatilhos.py`, `pendencias.py`) ainda chamam o Hermes direto.

## 12. Primeiros 10 minutos do próximo chat

1. `cat ~/.claude/projects/-mnt-c-Users-Joaquim-Ataides/memory/MEMORY.md` e abrir as notas citadas aqui.
2. `python3 ~/arquitetura-v2/paridade-v3/status.py` e `python3 ~/arquitetura-v2/saude/saldo_guarda.py --janela 30`.
3. `hermes gateway status`; `systemctl --user list-timers | grep v2-`.
4. Reiniciar o vigia: `python3 ~/arquitetura-v2/paridade-v3/vigia.py` em segundo plano.
5. Validar **C1** e **C2** (já `done`) seguindo a seção 7.
6. Só então abrir a nova tarefa do Joaquim; se ela criar cartões, usar o wrapper e o roteador, e **não** deixar decisão para depois: se algo for decisão dele, perguntar tudo de uma vez.

## 13. Trabalho que ainda não foi auditado (candidato a próxima frente)

Os outros documentos da V3 sobre inbox em `~/projetos/Zapp_Web_V3/docs/estado/`: `08-features-inbox-components-chat-2.md`, `09-…-contato-lista-ia.md`, `10-…-raiz-a-m.md`, `11-…-raiz-m-z.md`, `12-…-restantes.md` (e os de hooks/serviços `06`, `07`, `23`–`27`, `32`). A mesma auditoria (arquivos por nome, depois por conceito, dados necessários, código morto, cobertura no backlog) vale para eles.
