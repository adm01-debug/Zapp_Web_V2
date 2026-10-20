# PROMPT LOVABLE — Integração do Painel de Inteligência Comercial

## CONTEXTO

Acabamos de adicionar 4 novos componentes ao zapp-web via GitHub:

1. **ContactIntelligencePanel** (`src/components/inbox/contact-details/ContactIntelligencePanel.tsx`)
   - Já integrado no ContactDetails como accordion "Inteligência Comercial"
   - Seções: Briefing, DISC Tips, Gatilhos Mentais, Rapport, Melhores Horários, Churn

2. **CRMAutoSync** (`src/components/inbox/CRMAutoSync.tsx`) — ATUALIZADO
   - Auto-sync quando conversa é resolvida
   - Detecção automática de sentimento (positive/neutral/negative)
   - Resume a conversa (duração, msgs agente/cliente, última mensagem)
   - CRMSyncButton manual no header do ContactDetails

3. **Briefing Tooltip no ChatHeader** (`src/components/inbox/chat/ChatHeader.tsx`)
   - Hover no nome do contato mostra: opening_tip, risk_alert, score, rapport
   - Nome sublinhado com dashed border quando briefing disponível

4. **useContactIntelligence** (`src/hooks/useContactIntelligence.ts`)
   - Hook que chama get_contact_intelligence_by_phone
   - Cache 15min via React Query

## TAREFAS

### TAREFA 1 — Polir o ContactIntelligencePanel

Revise `src/components/inbox/contact-details/ContactIntelligencePanel.tsx`:

1. Garanta que o accordion "Inteligência Comercial" abre corretamente e está visualmente consistente com as outras seções (CRM 360°, Tags, etc.)
2. A seção de **Gatilhos Mentais** mostra cards com nome, categoria (badge colorido), descrição e exemplo. Garanta que os cards não ficam muito longos — max 4 gatilhos visíveis, com scroll se necessário.
3. A seção **Rapport** mostra sugestões em cards verdes. Se não houver sugestões, a seção não aparece.
4. A seção **Melhores Horários** mostra chips com dia da semana e hora. Se sem dados, mostra sugestão padrão.
5. A seção **Churn** mostra um card de alerta vermelho/amarelo/verde conforme risk_level.
6. A seção **DISC** mostra o perfil com dicas de comunicação, palavras para usar (badges verdes) e evitar (badges vermelhos).

### TAREFA 2 — Melhorar o Briefing Tooltip

O tooltip no ChatHeader já funciona mas pode ser melhorado:

1. Adicione um **pequeno ícone de cérebro** (Brain) ao lado do nome quando intel está disponível
2. O tooltip deve ter **largura máxima de 320px** e não quebrar o layout
3. Se o contato tiver **risk_alert**, mostre uma borda vermelha no tooltip
4. Adicione **animação suave** ao aparecer (já tem motion no resto do ChatHeader)

### TAREFA 3 — Botão "Sync CRM" visual

O CRMSyncButton no header do ContactDetails funciona, mas:

1. Quando o sync é bem-sucedido, mostre um **toast com o novo score** do contato
2. Adicione um **badge de "último sync"** mostrando há quanto tempo foi o último sync
3. Se o contato não existir no CRM, o botão deve mostrar "Sem CRM" com ícone cinza

### TAREFA 4 — Indicador de Sentimento

O CRMAutoSync agora detecta sentimento automaticamente. Use isso:

1. Na **ConversationList**, adicione um pequeno emoji de sentimento ao lado do nome se disponível
2. No **ChatHeader**, o badge de status pode mudar de cor baseado no sentimento detectado
3. O sentimento deve atualizar em tempo real conforme novas mensagens chegam

## REFERÊNCIA TÉCNICA

### Hook useContactIntelligence
```typescript
// Retorna:
interface ContactIntelligenceData {
  found: boolean;
  contact_id: string;
  briefing: ContactBriefing;     // opening_tip, risk_alert, score, métricas
  triggers: MentalTrigger[];     // nome, categoria, descrição, exemplos, intensidade
  rapport: RapportData;          // sugestões, hobbies, interesses, nome_tratamento
  best_times: BestTime[];        // dia, hora, success_rate
  churn: ChurnData | null;       // probabilidade, nível, fatores, ações
  disc_tips: DISCTips | null;    // perfil, dicas comunicação, palavras usar/evitar
  last_interactions: [];
}
```

### Hook useSyncToCRM
```typescript
const { syncConversation, syncConversationAsync, isSyncing, lastResult, isConfigured } = useSyncToCRM();
// syncConversation({ phone, channel, direction, assunto, resumo, sentiment, messageCount, agentName, zappConversationId })
```

### CRMAutoSync sentiment detection
Detecta automaticamente: 'positive' (obrigado, perfeito, ótimo), 'negative' (reclamação, atraso, cancelar), ou 'neutral'.

## REGRAS

- NÃO modifique os hooks — só consuma nos componentes
- Use `isExternalConfigured` para condicionalmente mostrar/esconder
- Todos os textos em PT-BR
- Siga o design system (shadcn/ui, dark mode, motion animations)
