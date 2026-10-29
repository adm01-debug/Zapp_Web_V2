import { Info } from 'lucide-react';

/**
 * Aviso de honestidade dos fluxos visuais do chatbot.
 *
 * O editor de grafo (nós/arestas) salva o desenho em `chatbot_flows.nodes` e
 * `chatbot_flows.edges`, mas nenhum motor os lê: só a Edge Function `chatbot-l1`
 * toca a tabela, e ela responde por um fluxo `ai_l1` da própria conexão —
 * `execution_count` nunca é incrementado e `chatbot_executions` não tem
 * escritor. Marcar o fluxo como "Ativo" não faz nada responder.
 *
 * Enquanto o motor não existe, esta faixa impede que a tela prometa execução.
 */
export function ChatbotHonestNotice() {
  return (
    <div
      role="note"
      aria-label="Fluxos visuais ainda não respondem"
      className="rounded-lg border border-info/30 bg-info/10 p-4 flex items-start gap-3"
    >
      <Info className="w-5 h-5 text-info shrink-0 mt-0.5" aria-hidden="true" />
      <div className="text-sm space-y-1">
        <p className="font-medium text-foreground">Fluxos visuais ainda não respondem sozinhos</p>
        <p className="text-muted-foreground">
          Salvar guarda os nós e as conexões, mas nenhum motor os executa: o gatilho escolhido
          (palavra-chave, primeira mensagem, menu, webhook ou agendado) não dispara nada. Quem
          responde às mensagens é o Chatbot IA, ligado por conexão. Ativar um fluxo aqui só o
          destaca na lista, e as execuções ficam em zero até existir esse motor.
        </p>
      </div>
    </div>
  );
}
