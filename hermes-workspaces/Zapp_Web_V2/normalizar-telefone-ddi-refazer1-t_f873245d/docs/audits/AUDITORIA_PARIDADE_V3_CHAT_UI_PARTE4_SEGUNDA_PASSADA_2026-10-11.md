# Paridade V3 → V2: segunda passada do documento 08-chat-1 (11/10/2026, tarde)

Documento auditado: `Zapp_Web_V3/docs/estado/08-features-inbox-components-chat-1.md` (origin/main 3af583f0e).
Código V2 comparado: branch viva em `~/hermes-workspaces/Zapp_Web_V2/.integrador` (ponta ed0e51088, 11/10 11:40).
Antecedentes: partes 1 a 3 e a reconciliação (`RECONCILIACAO_CARTOES_PARIDADE_V3_2026-10-11.md`).

## Método

1. Matriz de presença dos arquivos da pasta `chat/` da V3 na V2: 28 existem nas duas versões e 29 só na V3. Os 29 só da V3 já tinham cartão ou descarte.
2. Os 28 arquivos em comum foram lidos inteiros nos dois lados, em três frentes paralelas: compositor, mensagens e bolhas, cabeçalho/busca/overlays. Também os hooks que esses arquivos usam.
3. Os 13 achados do documento (A1–A13), os fluxos e a camada de dados: edge `ai-enhance-message`, RPC `get_team_profiles`, flags, exports e testes.
4. Cada achado novo foi conferido no código e procurado nos corpos dos 122 cartões existentes (`buscar_corpo.py`) antes de virar cartão.

## Achados novos (sem cartão até agora), com cartão criado

| Cartão | Especialista | Achado | Gravidade |
|---|---|---|---|
| LK1 | iris | O balão renderiza o texto puro: o link não é clicável e mensagem recebida não tem prévia. `TextWithLinks` existe na V2 e ninguém o usa. | alta |
| QR1 | iris | Atalho "/" das respostas rápidas quebrado: digitar "/" fecha o popover, `/quick` abre vazio (limpa o campo antes de filtrar) e `/template` só mostra um aviso. | alta |
| EM1 | iris | Emoji nativo sai na hora como mensagem separada, em vez de entrar no texto na posição do cursor. | média |
| MR1, MR2 | edgar, iris | Mídia com URL do CDN do WhatsApp vencida nunca é recuperada quando a persistência no webhook falhou. | média |
| CL1 | iris | Nenhum carregamento visível ao abrir ou trocar de conversa: parece vazia. | média |
| SM1 | iris | `scrollToMessage` só acha pelo id interno; busca global (Ctrl+K) não leva até a mensagem. | média |
| EB1 | iris | Erro num painel, overlay ou diálogo derruba o chat inteiro (sem proteção de erro por seção). | média |
| BL1 | iris | "Copiar" em mídia sem legenda grava vazio e mostra "Copiado!"; mensagem apagada sem horário e ainda com reações. | baixa/média |
| NB1 | hugo | Sugestão "Escalar para supervisor" ignora o estouro do prazo de resolução. | baixa/média |
| SE1 | iris | Sentimento só como cor de fundo, sem texto nem rótulo acessível; botão Voltar com 32px. | baixa/média |
| SL3 | iris | Preferência "Mostrar texto de status nas mensagens" (`useInboxStatusPref` + `StatusLabelToggle`) ausente. | baixa |
| AU1 | iris | Sem som de início e fim de gravação de áudio. | baixa |
| TL1 | workertestes | `ChatPanel.ligar.test.tsx` prova um botão falso; a prop `onStartCall` está morta. | baixa |
| FM1 | iris | Ctrl+B/I/E anunciados na barra de formatação e não implementados; Tooltip+Popover aninhados no "Reescrever". | baixa |

Todos foram criados em 11/10 e delegados com os pais encadeados por arquivo. Os IDs estão em `~/arquitetura-v2/paridade-v3/ids_k.json`.

## Já cobertos (a primeira passada tinha posto em cartões existentes)

Selo da fila e Enviar vazio abrindo anexo (PL1), contador de sussurros (WH2), vazio e teclado das respostas rápidas (C7), toque no celular revelando ações (BA1), templates com variáveis (TM1), trilha de transferência (TR1).

## Descartes com motivo

- **Banner "Criptografia de Ponta a Ponta" (A12):** a afirmação é falsa num CRM que guarda as mensagens, com IA e supervisores lendo.
- **Barra de ferramentas visível no cabeçalho:** o redesign carvão #301 a trocou pelo menu "Mais ações" de propósito.
- **Histórico do atendimento dentro da conversa:** a V2 já tem, na aba Jornada (`useConversationHistoryTimeline`).
- **Botão "Atribuir automaticamente":** a V2 atribui por gatilho (`auto_assign_to_queue_agent`).
- **DOMPurify no MarkdownPreview:** a prévia não abre em nenhuma das versões. A sanitização foi para o LK1.
- **A8 e A10:** não procedem na V3 atual.
- **A6:** não existe na V2.

## Achado operacional (fora do produto, afeta a validação)

Nenhuma entrega desta frente foi integrada. Dos 42 cartões concluídos, 21 tiveram a entrega recusada pelo revisor (o refazer foi criado), 18 estão aprovados ou à espera na fila (`pronto`), 2 falharam e 1 veio vazio.

O `v2-integrador.timer` foi parado às 11:46 por um laço manual de "lote grande" de outra sessão. A branch do dia não anda desde as 11:40.

Por isso C1, C2 e C6 aparecem como concluídos, mas o código deles não está na branch.
