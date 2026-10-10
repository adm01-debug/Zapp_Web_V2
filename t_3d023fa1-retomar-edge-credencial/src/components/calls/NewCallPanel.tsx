import { useCallback, useEffect, useMemo, useState } from 'react';
import { Phone, PhoneOff, Delete, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Keypad } from './Keypad';
import { ContactPicker, type ContatoEscolhido } from './ContactPicker';
import { formatPhoneBR, normalizeE164BR } from '@/lib/calls/phone';
import { describeReason } from '@/lib/calls/capabilities';
import { useCallChannels } from '@/hooks/calls/useCallChannels';
import { useCallSession } from '@/providers/CallSessionProvider';
import { dispatchStartCall } from '@/lib/calls/events';

export type CanalDeSaida = 'voip' | 'whatsapp';

const CHAVE_CANAL = 'tel:new-call-channel';

/** Canal lembrado entre visitas (T56) - a escolha do agente nao se perde ao navegar. */
function canalInicial(): CanalDeSaida {
  try {
    const guardado = window.localStorage.getItem(CHAVE_CANAL);
    if (guardado === 'voip' || guardado === 'whatsapp') return guardado;
  } catch {
    // localStorage bloqueado: cai no padrao sem quebrar a tela.
  }
  return 'voip';
}

/**
 * Painel lateral de nova ligacao (T56/T59/T60).
 *
 * O canal daqui e INDEPENDENTE das abas do historico (T44): a aba filtra o que ja
 * aconteceu, o segmentado escolhe por onde a proxima ligacao sai. Misturar os dois faria
 * filtrar o historico mudar o canal da discagem - e vice-versa.
 */
export function NewCallPanel() {
  const { voip, whatsapp } = useCallChannels();
  const { numeroPendente, hangup, session, sipStatus } = useCallSession();

  const [canal, setCanal] = useState<CanalDeSaida>(canalInicial);
  const [numero, setNumero] = useState('');
  const [contato, setContato] = useState<ContatoEscolhido | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAVE_CANAL, canal);
    } catch {
      // sem localStorage: a escolha vale so nesta visita.
    }
  }, [canal]);

  // T29/T57: o clique-para-discar entrega o numero pronto; preenche e nao sobrescreve
  // o que o agente ja digitou. Ajuste durante a RENDERIZACAO (padrao do React para
  // "estado que muda quando a prop muda"): um efeito aqui causaria render em cascata, e
  // a guarda de react-hooks do repo reprova com razao. Guardamos o ultimo pedido ja
  // aplicado para reagir a um pedido NOVO, sem reaplicar o mesmo a cada render.
  const [pedidoAplicado, setPedidoAplicado] = useState<string | null>(null);
  if (numeroPendente && numeroPendente !== pedidoAplicado) {
    setPedidoAplicado(numeroPendente);
    setNumero((atual) => (atual ? atual : numeroPendente));
    setContato(null);
  }

  const capability = canal === 'voip' ? voip : whatsapp;
  const e164 = useMemo(() => normalizeE164BR(numero), [numero]);
  const formatado = useMemo(() => (e164 ? formatPhoneBR(e164) : ''), [e164]);

  const emChamada = session?.status === 'dialing' || session?.status === 'ringing_out' || session?.status === 'connecting' || session?.status === 'active';
  const reconectando = sipStatus === 'reconnecting';
  const numeroOk = Boolean(e164);
  const motivo = capability.reason ? describeReason(capability.reason) : null;

  const digitar = useCallback((d: string) => {
    setNumero((atual) => (atual + d).slice(0, 20));
  }, []);

  const apagar = useCallback(() => {
    setNumero((atual) => atual.slice(0, -1));
  }, []);

  const escolherContato = useCallback((c: ContatoEscolhido) => {
    setContato(c);
    const so = c.phone.replace(/[^0-9+]/g, '');
    setNumero(so);
  }, []);

  // A discagem passa pelo mesmo caminho do clique-para-discar (T29) e do "Ligar de
  // volta" (T52): um unico ponto de entrada para os dois canais, com `autoDial: true`
  // porque aqui o agente JA apertou o botao - o painel nao pode so preencher e esperar.
  const ligar = useCallback(() => {
    if (!e164) return;
    dispatchStartCall({
      channel: canal,
      phone: e164,
      source: 'other',
      autoDial: true,
      ...(contato ? { contactId: contato.id, name: contato.name } : {}),
    });
  }, [e164, canal, contato]);

  const rotulo = emChamada
    ? 'Cancelar'
    : reconectando
      ? 'Reconectando…'
      : canal === 'voip'
        ? 'Ligar via VoIP'
        : 'Ligar via WhatsApp';

  const bloqueado = !emChamada && (!capability.canDial || !numeroOk);

  return (
    <Card className="border-border bg-card" data-testid="tel-new-call-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nova ligação</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {/* Canal (T56) */}
        <div
          role="radiogroup"
          aria-label="Canal da ligação"
          className="grid w-full grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        >
          {(['voip', 'whatsapp'] as CanalDeSaida[]).map((opcao) => {
            const cap = opcao === 'voip' ? voip : whatsapp;
            const ativo = canal === opcao;
            const botao = (
              <button
                key={opcao}
                type="button"
                role="radio"
                aria-checked={ativo}
                disabled={!cap.canDial}
                onClick={() => setCanal(opcao)}
                data-testid={`tel-channel-option-${opcao}`}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  ativo ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {opcao === 'voip' ? 'VoIP' : 'WhatsApp'}
              </button>
            );
            if (cap.canDial || !cap.reason) return botao;
            return (
              <Tooltip key={opcao}>
                <TooltipTrigger asChild>
                  <span className="cursor-not-allowed">{botao}</span>
                </TooltipTrigger>
                <TooltipContent>{describeReason(cap.reason)}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Contato (T57) */}
        <ContactPicker selecionado={contato} onEscolher={escolherContato} onLimpar={() => setContato(null)} />

        {/* Numero (T59) */}
        <div className="w-full" data-testid="tel-number-display">
          <div className="relative">
            <div
              className="flex h-14 w-full items-center justify-center rounded-md border border-border bg-muted/50 pr-10 font-mono text-xl tracking-widest text-foreground"
              aria-live="polite"
            >
              {formatado || numero || <span className="text-muted-foreground">Digite o número</span>}
            </div>
            {numero && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                onClick={apagar}
                aria-label="Apagar dígito"
              >
                <Delete className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>
          {numero && !numeroOk && (
            <p className="mt-1 text-center text-xs text-destructive" data-testid="tel-number-incomplete">
              Número incompleto
            </p>
          )}
        </div>

        {/* Teclado (T58) */}
        <Keypad onKey={digitar} onBackspace={apagar} mode="edit" disabled={emChamada} />

        {/* CTA (T60) */}
        <div className="flex w-full flex-col items-center gap-2">
          <Button
            size="lg"
            data-testid="tel-dial-button"
            className={`h-14 w-full rounded-full ${emChamada ? 'bg-destructive hover:bg-destructive/90' : 'bg-success hover:bg-success/90'}`}
            onClick={() => (emChamada ? hangup() : ligar())}
            disabled={bloqueado}
            aria-label={rotulo}
          >
            {reconectando && !emChamada ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            {emChamada ? <PhoneOff className="mr-2 h-5 w-5" /> : <Phone className="mr-2 h-5 w-5" />}
            {rotulo}
          </Button>
          {!emChamada && motivo && (
            <p className="text-center text-xs text-muted-foreground" data-testid="tel-dial-reason">
              {motivo}
            </p>
          )}
          {!emChamada && capability.canDial && numeroOk && (
            <p className="text-center text-xs text-muted-foreground">Confira o número antes de ligar.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
