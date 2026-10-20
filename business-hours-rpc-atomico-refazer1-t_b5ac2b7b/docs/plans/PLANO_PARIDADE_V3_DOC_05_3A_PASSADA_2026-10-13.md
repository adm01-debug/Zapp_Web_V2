# Plano: paridade V3 → V2 do módulo admin (doc 05), 3ª passada — 13/10/2026

> Origem: pedido do Joaquim de auditar `docs/estado/05-features-admin.md` da V3 e achar tudo que falta ou está pior na V2. O doc já tinha duas passadas (PD, 12/10; PF/PG, 13/10); esta cobre o que elas deixaram passar.

## 1. Método
- 3 leitores em paralelo (A monitoramento/DLQ, B segurança/pausas/telemetria, C pessoas/IA/gamificação) leram a V3 em `git show origin/main:` (a cópia local da V3 está 99 commits atrás) e a V2 na branch viva `.integrador`.
- Os achados graves foram reconferidos no código da V2 antes de virar cartão (lição do PE-66: confirmar por grep antes de afirmar).
- Cada cartão traz evidência com arquivo:linha, camada, arquivos permitidos e critério de pronto verificável. Dono definido pelo roteador (`skills/rotear.py`).

## 2. Fora de escopo (decisões do dono) e V2 melhor (não mexer)
- Fora: tags, exportar/importar/baixar/copiar/imprimir, edição em massa, SLA de Resolução, webhook externo, Evolution fallback, Retry config por tela, API pública, Sicoob, STS, route_permissions dinâmico, `inbox_custom_scopes`, `AgentVersionsPanel`.
- V2 melhor: XP atômico com `FOR UPDATE` e cap, RLS fechada em `agent_stats`/`agent_achievements`, presença no servidor, `claim_outbound_message` com lease, ausência de reprocesso automático, `computeUptime` nulo sem amostra, `ForceLogoutButton` com revogação real.

## 3. Decisões adotadas (vetáveis pelo dono)
- XP: +20 ao encerrar conversa, +10 na 1ª resposta dentro do SLA (PJ-40). Diagnóstico sem trecho de mensagem nem nome de contato (PJ-11). Supervisor vê alertas de rate limit (PJ-04). Só admin limpa telemetria (PJ-14). Pausa de instância por lista, com motivo (PJ-44).

## 4. Cartões (44)

### Segurança operacional, limites, pausas, telemetria

| Cartão | Id | Dono | Prio | Onda | Depende de | Título |
|---|---|---|---|---|---|---|
| PJ-01 | `t_6a08446c` | edgar | P1 | 1 | — | feat(seguranca): gravar rate_limit_logs quando uma requisição é negada ou limitada |
| PJ-02 | `t_b4e78290` | workersql | P1 | 2 | RA1, PJ-01 | feat(db): faixas de alerta de rate limit por IP e por endpoint, calculadas no banco |
| PJ-03 | `t_cdd10955` | hugo | P1 | 3 | PJ-02 | fix(seguranca): notificação de alerta de rate limit com deduplicação, teto de 5 e push que realmente dispara |
| PJ-04 | `t_1b11ffdb` | iris | P1 | 1 | — | fix(seguranca): alertas de rate limit em tempo real com dispensar confiável, teclado e leitor de tela |
| PJ-05 | `t_499a66ad` | edgar | P1 | 1 | — | fix(seguranca): send-rate-limit-alert sem duplicar alerta nem notificar admins a cada chamada |
| PJ-06 | `t_5f5b2ce6` | workersql | P1 | 1 | PD-09 | fix(seguranca): lista de IPs liberados e bloqueados passa a entender faixa CIDR e IPv6 |
| PJ-07 | `t_91e5805f` | iris | P1 | 1 | — | fix(seguranca): validar IP/CIDR na tela, aparar espaços e avisar antes de bloquear o próprio IP |
| PJ-08 | `t_8b123f2f` | workersql | P1 | 1 | IP1 | feat(db): eventos de falha de autenticação do webhook por instância, com séries de 24 h e 7 d |
| PJ-09 | `t_e5f7d60c` | edgar | P1 | 2 | PJ-08, IP2 | feat(seguranca): webhook grava a falha de autenticação e auto-pausa a instância com contagem no banco |
| PJ-10 | `t_b006da05` | iris | P2 | 2 | PJ-08, PD-29 | feat(admin): diálogo de diagnóstico da instância a partir do alerta de autenticação |
| PJ-11 | `t_c3524cf5` | hugo | P1 | 1 | PF-10 | fix(admin): abrir o Diagnóstico não dispara o verificador de saúde que grava no banco |
| PJ-12 | `t_1c6fdff9` | edgar | P0 | 1 | — | fix(seguranca): migrate-media-storage valida o host da mídia, limita tamanho e uso, e só admin roda |
| PJ-13 | `t_420d83f3` | iris | P2 | 2 | PJ-12, PE-43 | fix(admin): ferramenta de migração de mídia com progresso verdadeiro, confirmação e erro útil |
| PJ-14 | `t_2f61bbd8` | workersql | P2 | 1 | PD-13 | fix(db): limpar telemetria só por admin, com auditoria e retenção automática |
| PJ-15 | `t_81041110` | iris | P2 | 2 | PJ-14 | fix(admin): telemetria com confirmação ao limpar e aviso quando os dados passam de 500 linhas |

### Monitoramento e fila de falhas

| Cartão | Id | Dono | Prio | Onda | Depende de | Título |
|---|---|---|---|---|---|---|
| PJ-16 | `t_6eeeeca9` | iris | P1 | 1 | — | fix(monitoramento): erros visíveis, refetch com debounce e pausa em aba oculta, sem estourar o AudioContext |
| PJ-17 | `t_106a978a` | workersql | P1 | 1 | PD-78 | feat(db): alerta automático de taxa de falha de envio por conexão e mensagens presas |
| PJ-18 | `t_2d60e0fa` | workertestes | P2 | 1 | FQ3 | test(e2e): fila de falhas com filtros combinados, lote parcial e acesso negado ao agente |

### Pessoas, desempenho, IA e treinamento

| Cartão | Id | Dono | Prio | Onda | Depende de | Título |
|---|---|---|---|---|---|---|
| PJ-19 | `t_ae337e6d` | workersql | P1 | 1 | — | fix(db): ranking por período conta resolvidas de verdade e mostra online só com presença fresca |
| PJ-20 | `t_4c184e30` | hugo | P2 | 1 | — | fix(gamificacao): total de conquistas real e lista completa, sem o corte de 20 |
| PJ-21 | `t_e1ee133f` | workertestes | P2 | 1 | — | test(gamificacao): fórmulas de nível, paridade com o SQL e prova de RLS e gatilhos |
| PJ-22 | `t_b663f124` | hugo | P1 | 1 | — | fix(agentes): lista de atendentes mostra erro de leitura, status só por presença real e ignora desativados |
| PJ-23 | `t_a3742b25` | iris | P1 | 2 | PJ-22 | fix(agentes): tela de atendentes com erro visível, status em texto, capacidade limitada e carregamento por partes |
| PJ-24 | `t_6aa27aee` | hugo | P2 | 1 | — | feat(presenca): passar a 'ausente' por inatividade de interação e voltar na primeira ação |
| PJ-25 | `t_31f0d04b` | workersql | P2 | 1 | — | feat(db): carga por atendente agregada no servidor (abertas, aguardando e último envio) |
| PJ-26 | `t_c2bf0fc6` | hugo | P2 | 2 | PJ-25, PJ-22 | perf(agentes): hooks de carga e último envio passam a usar a RPC agent_workload |
| PJ-27 | `t_5332e51c` | iris | P2 | 3 | PJ-23, PJ-25 | feat(agentes): faixa de conexões e últimos 5 envios do atendente na tela de atendentes |
| PJ-28 | `t_e3c75d53` | workersql | P1 | 1 | — | feat(db): resumo de sentimento da IA agregado no servidor, com período anterior |
| PJ-29 | `t_e5eda1f2` | hugo | P1 | 2 | PJ-28, PF-10 | fix(ia): hook de estatísticas de IA usa o resumo do servidor e nunca transforma erro em tendência |
| PJ-30 | `t_bf81316c` | iris | P1 | 3 | PJ-29 | fix(ia): widget de estatísticas de IA com estado de erro e 'sem dados suficientes' |
| PJ-31 | `t_a6400eda` | hugo | P2 | 1 | PG-08 | feat(playbooks): hook de playbooks ativos para o atendente e ativar/desativar no gerenciador |
| PJ-32 | `t_05ae3e3c` | iris | P2 | 2 | PJ-31 | feat(playbooks): interruptor 'ativo' no gerenciador e painel 'Guia de atendimento' dentro da conversa |
| PJ-33 | `t_48369edd` | workersql | P2 | 1 | — | fix(seguranca): nota do Modo Treinamento não pode ser gravada pelo próprio usuário |
| PJ-34 | `t_6653415c` | iris | P2 | 2 | PJ-33, PG-09 | fix(admin): Modo Treinamento conclui a sessão pela RPC e mostra a origem da nota |
| PJ-35 | `t_9a71cc20` | workertestes | P2 | 1 | — | test(seguranca): prova do que o papel special_agent enxerga em atendentes, fila e Sala de Crise |

### Refinamentos e itens antes em aberto

| Cartão | Id | Dono | Prio | Onda | Depende de | Título |
|---|---|---|---|---|---|---|
| PJ-36 | `t_20064b9a` | workersql | P1 | 1 | FQ1 | feat(db): resumo da fila de falhas com causa raiz pelo classificador da V2, facetas que não encolhem e falhas por atendente e conexão |
| PJ-37 | `t_81581e71` | hugo | P1 | 1 | FQ2 | fix(falhas): seleção em lote presa à visão atual, resultado por item e estado de pendência por linha |
| PJ-38 | `t_cb293d5f` | workersql | P2 | 1 | M1 | fix(db): trilha de tentativas de envio sobrevive à exclusão da mensagem ou do contato |
| PJ-39 | `t_65252f29` | iris | P2 | 1 | — | feat(admin): contador de dead letter do Multiplix no cartão 'Saúde da integração' |
| PJ-40 | `t_c09e53ad` | workersql | P2 | 1 | — | feat(gamificacao): livro de XP imutável e XP por evento real concedido no servidor |
| PJ-41 | `t_a47aa4c1` | workersql | P2 | 2 | PJ-40, PJ-19 | feat(db): XP e resolvidas do ranking por período lidos do livro de XP |
| PJ-42 | `t_b47befe6` | workersql | P2 | 1 | — | feat(db): métricas de Operações por canal e por fila agregadas no servidor (24 h, 7 d, 30 d) |
| PJ-43 | `t_46843b1f` | iris | P2 | 2 | PJ-42 | feat(admin): aba 'Métricas' em Operações com erro visível |
| PJ-44 | `t_dbb08748` | iris | P2 | 1 | IP3 | fix(admin): pausa de instância escolhida em lista, com confirmação e auditoria de pausar e retomar |

## 5. Ondas e ordem de execução
- Onda 1 (sem pai PJ): PJ-01, PJ-04, PJ-05, PJ-06, PJ-07, PJ-08, PJ-11, PJ-12, PJ-14, PJ-16, PJ-17, PJ-18, PJ-19, PJ-20, PJ-21, PJ-22, PJ-24, PJ-25, PJ-28, PJ-31, PJ-33, PJ-35, PJ-36, PJ-37, PJ-38, PJ-39, PJ-40, PJ-42, PJ-44.
- Onda 2: PJ-02, PJ-09, PJ-10, PJ-13, PJ-15, PJ-23, PJ-26, PJ-29, PJ-32, PJ-34, PJ-41, PJ-43.
- Onda 3: PJ-03, PJ-27, PJ-30.

Cadeias críticas: PJ-01→PJ-02→PJ-03 (rate limit); PJ-08→PJ-09/PJ-10 (autenticação do webhook); PJ-12→PJ-13 (mídia); PJ-22→PJ-23→PJ-27 e PJ-25→PJ-26 (atendentes); PJ-28→PJ-29→PJ-30 (IA); PJ-40→PJ-41 (XP). PJ-01 também é pai do RA2.

## 6. Acompanhamento
- `python3 ~/arquitetura-v2/paridade-v3/status.py` (série PJ no `ids_todos.json`); timer `v2-paridade` valida mecanicamente a cada 10 min; o religar desbloqueia filhos quando o pai é integrado.
- Linhagens sem saída: `linhagens.py`. 3ª recusa vai para a caixa de decisões: criar `[refazer N, final]` (senior) partindo do último sha.

## 7. Validação final (por cartão, feita pelo Claude)
1. Existe entrega `integrado` na fila do integrador com sha na branch `dia/*` (ou, se o integrador estiver parado, commit na fila com `pronto`).
2. O código está lá: conferir no worktree `.integrador` o arquivo:linha do achado e que o comportamento mudou (não só o relato).
3. Critério de pronto do cartão atendido com PROVA: teste verde citado, SQL no banco local com os papéis, captura claro/escuro para telas.
4. Nada da lista 'V2 melhor' regrediu; nenhum botão novo de exportar/copiar/imprimir; sem tags.
5. Cartão que falhar vira `[refazer N]` com o parecer; PJ-12 (P0) e PJ-01/03/06 (segurança) são validados primeiro.

## 8. Riscos
- Integrador parado por sobrecarga (swap 100%): as entregas ficam `pronto` sem entrar na branch; decisão de carga é do dono.
- Migrations só aditivas, nada em produção (quem aplica é o dono). Banco vivo não foi consultado nesta auditoria: toda afirmação de RLS vem das migrations.
- Cartões que dependem de integração anterior (PJ-02 ← RA1/PJ-01; PJ-36 ← FQ1; PJ-37 ← FQ2) usam a regra de cherry-pick da faixa quando o pai está done e não integrado.
