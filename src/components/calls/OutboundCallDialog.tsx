import { CallDialog } from './CallDialog';
import { useCallSessionOptional } from '@/providers/CallSessionProvider';

/**
 * C02 — diálogo GLOBAL da chamada de SAÍDA pedida no inbox.
 *
 * O "Ligar" do painel do contato (`ContactActionButtons`) e do cabeçalho do
 * chat (`ChatPanel`) emite `zapp:start-call` com `source:'inbox'`; o
 * `CallSessionProvider` registra o pedido em `chamadaSaida` e ESTE componente —
 * montado uma única vez no `App` (ao lado do `IncomingCallAlert`) — abre o
 * `CallDialog`, que disca na hora via `dial(phone, { abrirDiscador: false })`.
 * Sem sair do chat e sem navegar para a Telefonia: é o cartão do contato que
 * existia até 29/09, agora sobre a máquina de sessão.
 *
 * Por que um componente próprio (e não dentro do `IncomingCallAlert`): o alerta
 * é o fluxo de chamada RECEBIDA — o `if (!incomingCall) return null` dele
 * esconderia o diálogo de saída sempre que não há chamada chegando. Ao lado,
 * cada um cuida do seu fluxo.
 *
 * Fechar o cartão (Esc/X/clique fora) só limpa o pedido — é o que o padrão
 * antigo fazia (`onOpenChange={setShowCallDialog}`): a chamada em curso segue
 * controlável pela `ActiveCallBar`, que aparece assim que o motor marca a
 * linha como ocupada.
 *
 * Lê o contexto pelo `useCallSessionOptional` (tolerante): este overlay é
 * montado no `App` dentro de `DeferredProviders` e, se lançasse, o
 * `ErrorBoundary fallback={null}` daquele bloco derrubaria TODOS os outros
 * overlays irmãos (`IncomingCallAlert`, listener do Team Chat, EasterEggs...).
 * Sem `CallSessionProvider` não existe pedido de saída a mostrar — renderiza
 * `null`. Com provider, o comportamento é exatamente o mesmo de antes.
 */
export function OutboundCallDialog() {
  const sessao = useCallSessionOptional();

  if (!sessao?.chamadaSaida) return null;

  const { chamadaSaida, limparChamadaSaida } = sessao;

  return (
    <CallDialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) limparChamadaSaida();
      }}
      contact={{
        id: chamadaSaida.contactId,
        name: chamadaSaida.name || chamadaSaida.phone,
        phone: chamadaSaida.phone,
        avatar: chamadaSaida.avatar,
      }}
      direction="outbound"
      onEnd={limparChamadaSaida}
    />
  );
}
