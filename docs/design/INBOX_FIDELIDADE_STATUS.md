# Inbox — Fidelidade Carvão — STATUS
Branch: redesign/inbox-fidelidade-carvao · Base: 27c22f4d · Worktree: /workspace/repos/Zapp_Web_V2-inbox · Preview: http://localhost:4173

## CP0 Ambiente   [x] sha=ab5e59bb (branch), base=27c22f4d · baseline: tsc=0 erros · lint-ratchet=baseline 1189/atual 1160/novas 0 · implicit-any=0 (baseline 0) · vitest=233 passed (24 files) em src/components/inbox src/hooks/chat src/hooks/crm · classes de tile: `bg-kpi-{blue,green,purple,yellow}` + `text-kpi-{...}-fg` (tailwind.config.ts:95-103) · `bg-dash-tile-{blue,red,green,violet,amber}` (tailwind.config.ts:106-110)

### Leitura das 7 referências (Read JPEG) vs produção atual
**07-chat.jpg** (vs `/workspace/qa/out/prod2-inbox-chat.png`, pós-#288):
- Título "Conversas" 24/700 + "1.516 conversas" + botão azul "Nova conversa" — prod: sem header, 6 chips estourando a coluna (3º cortado), "Filtros" texto solto.
- Header do chat: avatar 48 + nome 18/700 + ⭐ + chips VIP/Alta prioridade + 4 botões 40×40 — prod: tela "Selecione uma conversa" (conta QA abre em Em atendimento vazio).
- Input: 6 chips de ação rápida + input 52 + enviar 44×44 azul — não visível no prod2 (lista vazia); será validado no CP1-CP3 com o fluxo corrigido do §ATUALIZAÇÃO item 3.

**01-crm360.jpg** (vs `prod-inbox-crm.jpg`, pré-#288):
- Referência: 4 KPIs coloridos (azul/verde/azul/verde), etapa no funil com 5 segmentos preenchidos, listas com thumb 40 + chip de status — prod: tiles `bg-primary/15` uniformes, "Sem empresa"/"Nenhuma negociação" (dado real vazio, mantém honesto).
- Referência: Ticket médio com delta "+28%" — prod: "—" (sem dado, correto manter vazio se não computável).
- Referência: Pipeline comercial com barra empilhada azul/amarelo/verde — prod: "Sem negociações" (empty state simples).

**02-arquivos.jpg**:
- Referência: header 20/700 + subtítulo, busca+filtro+select, chips com contagem, grid 3 col de cards compactos (thumb 16:9), painel de detalhe 260px — prod (#286): grid de 1 card 260px solto.
- Referência: 4 ícones de ação por card (Eye/Download/Share2/MoreHorizontal) — a verificar quais handlers já existem em `FileCard.tsx`.
- Referência: painel de detalhe com "Baixar arquivo" azul + Encaminhar/Copiar link/Salvar na galeria/Excluir vermelho.

**03-ia.jpg**:
- Referência: Sugestão de resposta com 4 chips de tom (Mais formal/casual/curta/detalhada) + "Usar resposta" no header — prod (#286): cards com botões grandes azuis, sem chips de tom.
- Referência: Objeções com badge vermelho de contagem + chip de severidade (Baixo/Médio) — a confirmar se hook expõe severidade.
- Referência: Próxima melhor ação em card destacado `bg-primary/10` + checklist de 3 itens — prod: card simples.

**04-notas.jpg**:
- Referência: grid 2 col, 6 cards com tile colorido por categoria (azul/amarelo/vermelho/verde) — prod: tile 28 azul único, título 14.
- Referência: "+ Adicionar" em pill azul h-28 — prod: provavelmente link de texto (a confirmar no código).
- Referência: rodapé "dd MMM yyyy · HH:mm · Por: nome · ⋮" em cada nota — a confirmar granularidade do dado no hook `useContactNotes`.

**05-tarefas.jpg**:
- Referência: 3 KPIs com tone vermelho/amarelo/verde + sublabel ("Requer atenção"/"Vencem hoje"/"Últimos 7 dias") — prod: 3 colunas com texto solto, sem tiles coloridos.
- Referência: 3 cards-coluna (Hoje/Próximas/Concluídas recentes) com subtítulo de data — a criar `TaskColumn.tsx`.
- Referência: card de tarefa com checkbox, chip de prioridade, linha de vencimento colorida, avatar do responsável — `TaskCard.tsx` será reescrito na Fase 4.

**06-historico.jpg**:
- Referência: 4 KPIs tone + selects "Período"/"Tipo de evento" com rótulo à esquerda — prod: KPIs ok mas timeline plana.
- Referência: timeline com coluna de hora (12px) + dot colorido por tipo + tile de ícone 32 colorido + badge à direita (WhatsApp verde/Transferência/Concluída/Pendente/Visualizada).
- event_types reais a mapear via grep no hook `useConversationHistoryTimeline` antes da etapa 43 (assign/unassign/transfer/queue_transfer/overload_reassign/absence_reassign/close/reopen + mensagens/notas/arquivos/tarefas).
## CP1 Lista      [ ] sha= · shot=fid-01-lista.png · coluna=_ item=_ avatar=_ busca=_ btn=_ chips=_ grupos=_ · o que ainda difere: _
## CP2 Header     [ ] sha= · shot=fid-02-header.png · header=_ avatar=_ btns=_ pill=_ banner=_ · tools antigos → novo lugar: (tabela)
## CP3 Input      [ ] sha= · shot=fid-03-input.png · chips=_ input=_ enviar=_ · ferramentas preservadas: N/N (lista)
## CP4 Primitivos [ ] sha= · testes: KpiStrip _ SectionCard _ TaskCard _
## CP5 Abas       [ ] sha= · shots=fid-05-{tasks,notes,ia,crm,files,history,chat}.png · por aba, o que ainda difere: _ · nomes inventados=0 · cores literais=0 · bundle Δ=_
## CP6 QA         [ ] geometria _/N · func _/20 · mobile _ · light _
## CP7 Entrega    [ ] PR=_ · CI=_ · gates: tsc=_ lint=_ implicit=_ vitest=_ build=_

## Divergências plano × código
-

## Iterações do loop visual (máx 3 por fase)
-

## Pendências / resíduos (honestos)
- Fotos de contato: avatar real ou iniciais (referência usa rostos gerados)
- Presença "Online": só se houver fonte real
- Chips de tom da IA: dependem do hook aceitar `tone`
- Spam: chip só se existir status/tag no modelo
-
