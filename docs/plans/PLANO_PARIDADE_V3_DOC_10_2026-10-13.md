# Plano: paridade V3 → V2 do doc 10 (inbox, componentes da raiz A–M) — 13/10/2026

> Origem: pedido do Joaquim de auditar `docs/estado/10-features-inbox-components-raiz-a-m.md` da V3 (58 componentes) e achar tudo que falta ou está pior na V2. Já havia cartões do chat (partes 1–5), PE (docs 10–40) e outros; esta passada cobre o que escapou.

## 1. Método
- Mapa mecânico: 38 dos 58 componentes eram citados em algum cartão; 20 não. A V2 usa outros nomes e outra árvore (sem `src/features/inbox`), então a comparação foi por função.
- 3 leitores em paralelo (A IA/áudio/mídia, B chat/conversa/mensagens, C contato/filtros/busca) leram a V3 em `git show origin/main:` e a V2 na branch viva; os achados graves foram reconferidos no código antes de virar cartão.
- Dos 20 achados A1–A20 da própria V3, vários já estão resolvidos na V2 (ex.: `Math.random` no gravador, dupla invocação do `AISuggestions`, `DocumentPreview` morto, `EditContactDialog` com dados fixos, `profileId` nulo em tarefas, `Promise.all` sem rollback no encerramento); eles NÃO viraram cartão.

## 2. Fora de escopo e V2 melhor (não mexer)
- Fora: tags/etiquetas, exportar/baixar/copiar/imprimir, edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, `/note` e `/tag` em botão, `DeliveryStatsPanel` por participante (a V3 conta remetentes, não recibos), `MessageBatcherIndicator`, `InboxKpiBar` da V3 (nunca montada), excluir conversa.
- V2 melhor: encerramento por `close_conversation_atomic` (idempotente, transação única), `useAudioMemes` (rollback de upload, RPC de favoritos, MP3), `get-mapbox-token` e `LocationMessage`/`LocationPicker`, `FilesTab` (substitui a galeria), `MediaVolumeControl`, `classify-audio-meme`, Edges de IA com `requireAuth` e schema, `CRMAutoSync` por `contactId` + fila idempotente, `GlobalSearch` (navegação por `navigateToView`, histórico por usuário), `ForwardMessageDialog`, aba Tarefas (mini-quadro, desfazer), menu avançado pela fila de saída canônica.

## 3. Decisões adotadas (vetáveis pelo dono)
- Medir busca global sem guardar o texto digitado (PL-24/25). Faixa de espera no topo da lista calculada no servidor (PL-26/27). Tarefas de um contato visíveis a quem vê o contato, editáveis só pelo dono ou staff (PL-37). Bucket `audio-memes` continua público para leitura (a URL assinada fica como pendência do dono). Pontuação de lead/risco: sem cálculo automático, só 'Sem score' (PL-17/18).

## 4. Cartões (39)

### Áudio meme, mídia e IA do chat

| Cartão | Id | Dono | Prio | Onda | Depende de | Título |
|---|---|---|---|---|---|---|
| PL-01 | `t_a65f9f8f` | workersql | P1 | 1 | — | fix(db): bucket audio-memes — admin apaga qualquer meme e o limite de tamanho e tipo passa a valer no servidor |
| PL-02 | `t_b3a1696d` | iris | P1 | 2 | PL-01 | fix(audio-meme): subir em <uid>/, travar duplo-clique, validar o nome e mostrar erro de leitura e de tocar |
| PL-03 | `t_8c3a4500` | iris | P1 | 3 | PL-02 | fix(audio-meme): seletor operável por teclado e por toque, com nomes acessíveis e confirmação ao excluir |
| PL-04 | `t_e2be6c16` | iris | P1 | 1 | — | fix(audio): player de áudio com botões nomeados, barra de posição operável por teclado e status anunciado |
| PL-05 | `t_c01da591` | iris | P2 | 1 | — | fix(midia): lightbox de imagem como diálogo de verdade, com foco e Escape corretos |
| PL-06 | `t_00fa8899` | iris | P2 | 1 | — | fix(ia): última análise da IA expõe erro em vez de 'sem análise' |
| PL-07 | `t_724c45fd` | iris | P2 | 2 | PL-06 | feat(contato): urgência e departamento da análise de IA no painel do contato (liga o AnalysisBadges órfão) |
| PL-08 | `t_355e25c5` | iris | P2 | 1 | — | chore(inbox): remover componentes mortos da V2 (AIToolsPopover, MessagePreview, KeyboardShortcutsHelp, MessageContextActions) |
| PL-09 | `t_7eda834a` | edgar | P2 | 1 | — | fix(seguranca): prévia de link serve a imagem pelo servidor, sem vazar o IP do atendente |
| PL-10 | `t_f03b51fb` | iris | P2 | 2 | PL-09 | fix(chat): prévia de link e localização sem imagem remota direta e sem 'Invalid Date' |

### Contato, horário comercial, consentimento, filtros e busca

| Cartão | Id | Dono | Prio | Onda | Depende de | Título |
|---|---|---|---|---|---|---|
| PL-11 | `t_294c6a49` | iris | P2 | 1 | — | fix(horario): verificação de horário comercial lança erro e distingue 'sem horário configurado' |
| PL-12 | `t_86ae8a77` | iris | P1 | 2 | PL-11 | fix(chat): selo Aberto/Fechado do horário comercial volta ao cabeçalho vivo do chat |
| PL-13 | `t_d30b49e0` | workersql | P2 | 1 | — | fix(db): horário comercial entende janela que vira a noite e fecha exclusivo |
| PL-14 | `t_6660c0a3` | iris | P2 | 2 | PL-13 | fix(admin): diálogo de horário comercial recusa fechamento antes da abertura (ou explica a virada) |
| PL-15 | `t_692e47ab` | iris | P1 | 1 | — | fix(inbox): painel de filtros — 'Todos os tipos' não conta como filtro, botões com estado acessível e tipo Parceiro |
| PL-16 | `t_2d31d77a` | iris | P1 | 2 | PL-15 | fix(inbox): grupos do WhatsApp com JID moderno (120363…@g.us) entram em 'Grupos' e não em 'Individuais' |
| PL-17 | `t_c18cd308` | workersql | P1 | 1 | — | fix(db): pontuação de lead e risco deixa de nascer 0 e vira 'sem score' enquanto ninguém calcula |
| PL-18 | `t_9f9ea1e4` | iris | P1 | 2 | PL-17 | fix(contato): painel CRM e IA mostram 'Sem score' quando não há pontuação, nunca 'Baixo' nem 0 |
| PL-19 | `t_c9691b80` | workersql | P1 | 1 | — | fix(lgpd): consent_status só muda pela rotina de consentimento, com valores válidos e trilha |
| PL-20 | `t_40e30f93` | workersql | P1 | 2 | PL-19 | fix(lgpd): consentimento concedido ou revogado mantém contacts.consent_status, que o Talk X lê |
| PL-21 | `t_4d076e84` | iris | P1 | 1 | — | fix(crm): sincronização automática com o CRM não repete após erro e o botão explica quando o CRM está desligado |
| PL-22 | `t_a242ef97` | iris | P1 | 1 | — | fix(contato): compras e propostas com erro visível, total sem cancelados, data segura e sem duplo-clique |
| PL-23 | `t_7582aaee` | iris | P2 | 1 | — | feat(inbox): lembrar chip, fila e tipo do filtro da inbox por usuário |
| PL-24 | `t_a86eec01` | workersql | P2 | 1 | — | feat(db): eventos de busca global sem texto livre (cliques e buscas sem resultado) |
| PL-25 | `t_9c842624` | iris | P2 | 2 | PL-24 | feat(inbox): busca global registra cliques e buscas sem resultado, sem o texto digitado |
| PL-26 | `t_2575be51` | workersql | P2 | 1 | — | feat(db): métricas de espera da inbox por fila calculadas no servidor |
| PL-27 | `t_96433361` | iris | P2 | 2 | PL-26 | feat(inbox): faixa de indicadores de espera no topo da lista, com dados do servidor |

### Conversa, encerramento, mensagens e tarefas

| Cartão | Id | Dono | Prio | Onda | Depende de | Título |
|---|---|---|---|---|---|---|
| PL-28 | `t_88a40d25` | hugo | P2 | 1 | — | feat(jornada): transferência mostra 'De X para Y' e o encerramento mostra motivo, resultado e classificação |
| PL-29 | `t_a7091e7c` | iris | P2 | 1 | — | fix(contato): linha do tempo de atividades do contato com todos os tipos de evento, erro visível e sem resíduo de etiqueta |
| PL-30 | `t_ae6fdc7f` | iris | P2 | 1 | — | fix(chat): diálogo Encerrar Conversa só oferece ações válidas, traduz o erro de cada caso e tem rótulos acessíveis |
| PL-31 | `t_12ea589f` | iris | P2 | 2 | PL-30 | feat(chat): ao encerrar, avisar pendências (tarefas, agendadas, falhas) e seguir para a próxima conversa |
| PL-32 | `t_5a418ba3` | iris | P2 | 1 | — | fix(chat): nomes acessíveis em reações, barra de lote e menu avançado; animação de saída da barra de lote; tokens no placeholder de apagada |
| PL-33 | `t_9d931d37` | iris | P1 | 1 | — | fix(chat): menu avançado — Status/Story só para quem pode publicar, enquete, cartão de contato e figurinha validados |
| PL-34 | `t_dee1fefd` | iris | P2 | 1 | — | fix(chat): construtor de mensagem interativa — URL do botão validada, reordenar de verdade e clique em linha de lista definido |
| PL-35 | `t_1efd861a` | iris | P2 | 1 | — | fix(chat): resposta do cliente a botão ou lista aparece com o título escolhido |
| PL-36 | `t_15c578b9` | iris | P2 | 1 | — | fix(inbox): atalhos de teclado do inbox só agem com foco na lista, sem interceptar Ctrl+A em texto nem abrir sob diálogos |
| PL-37 | `t_2847f048` | workersql | P1 | 1 | — | fix(db): tarefas ligadas a um contato ficam visíveis a quem enxerga o contato (a aba Tarefas não esvazia na transferência) |
| PL-38 | `t_739e4cb3` | iris | P1 | 2 | PL-37 | fix(tarefas): aba Tarefas da conversa lista as tarefas do contato e trata erro da exclusão |
| PL-39 | `t_16e19364` | iris | P2 | 1 | — | feat(inbox): estado vazio do chat com 'Nova conversa' e contadores reais |

## 5. Ondas
- Onda 1: PL-01, PL-04, PL-05, PL-06, PL-08, PL-09, PL-11, PL-13, PL-15, PL-17, PL-19, PL-21, PL-22, PL-23, PL-24, PL-26, PL-28, PL-29, PL-30, PL-32, PL-33, PL-34, PL-35, PL-36, PL-37, PL-39.
- Onda 2: PL-02, PL-07, PL-10, PL-12, PL-14, PL-16, PL-18, PL-20, PL-25, PL-27, PL-31, PL-38.
- Onda 3: PL-03.

Cadeias: PL-01→PL-02→PL-03 (áudio meme); PL-06→PL-07; PL-09→PL-10; PL-11→PL-12 e PL-13→PL-14; PL-15→PL-16; PL-17→PL-18; PL-19→PL-20; PL-24→PL-25; PL-26→PL-27; PL-30→PL-31; PL-37→PL-38.

## 6. Acompanhamento e validação
- `python3 ~/arquitetura-v2/paridade-v3/status.py` (série PL no `ids_todos.json`); a rotina horária do Claude confere a fila do integrador e valida cada entrega.
- Validação por cartão: arquivo:linha do achado mudou no worktree `.integrador`; critério de pronto com prova (teste verde, SQL no banco local com papéis, captura claro/escuro); nada da lista 'V2 melhor' regrediu; nenhum botão novo de exportar/copiar/imprimir; sem tags. Prioridade: PL-19/20 (consentimento), PL-01/02 (upload de meme), PL-33 (Status/Story), PL-37 (tarefas), PL-15/16 (filtros).

## 7. Riscos
- A iris recebeu 29 dos 39 cartões e já tem mais de 140 em `todo`: a série pode levar dias; os de P1 vão primeiro pela prioridade. Se o dono quiser, redistribuir os de hook puro para o hugo quando o roteador permitir.
- Integrador parado por sobrecarga: as entregas ficam `pronto` sem entrar na branch.
- Migrations só aditivas, nada em produção; banco vivo não foi consultado nesta auditoria (RLS conferida pelas migrations).
- PL-28 pode já estar coberto pela série Journey: o cartão manda provar e fechar sem commit se estiver.
