/**
 * Controles da chamada em curso — SL-018: espera (hold), transferência (cega e
 * assistida) e conferência.
 *
 * ## Onde cada parte mora
 *
 * - **Transporte** (`src/lib/calls/adapters/`): fala SIP de verdade —
 *   `setHold` manda o re-INVITE com `a=sendonly` e `refer` manda o REFER.
 * - **Operação** (este arquivo): as regras que não são SIP — quando cada
 *   controle vale, o que devolver quando não vale e o que a tela mostra. Mesmo
 *   padrão de `capabilities.ts`: id estável + rótulo operacional em pt-BR.
 *
 * Módulo headless, como o resto de `src/lib/calls`: nenhum import de React,
 * Supabase ou UI. `sip.js` entra só como **tipo** (`Session`), pelo mesmo motivo
 * declarado em `adapters/CallAdapter.ts:10-13` (não arrastar a lib para o
 * bundle inicial).
 *
 * ## Conferência: recusada de propósito, com motivo
 *
 * `conferenciar()` NÃO finge: devolve `conferencia_sem_ponte`. Medido em
 * 08/10/2026, no código e nas dependências:
 * - o `sip.js` 0.21.2 não tem mixer nem API de conferência — o único controle
 *   de mídia da sessão é `sessionDescriptionHandlerOptions.hold`
 *   (`node_modules/sip.js/lib/platform/web/session-description-handler/session-description-handler-options.d.ts:33`);
 * - `Session.refer(URI | Session)` (`node_modules/sip.js/lib/api/session.d.ts:221`)
 *   entrega a perna a um **terceiro** e tira quem transfere da conversa: é
 *   transferência assistida, não 3-vias;
 * - a central desta linha é o SIP Connector do Bitrix24 (`get-sip-password`:
 *   host `*.bitrixphone.com`, porta WSS 8089, Asterisk) e o repo não tem ponte
 *   de conferência nem *feature code* para ela.
 *
 * Uma 3-vias de verdade exige mixer (no servidor, ou misturando as tracks no
 * navegador) — é cartão próprio. Aqui a recusa é explícita **com motivo** para
 * a tela poder dizer por quê, em vez de um no-op silencioso.
 */

import type { Session } from 'sip.js';

import { normalizeE164BR } from './phone';

/**
 * Porta de transporte exigida por este módulo — subconjunto do `CallAdapter`,
 * implementada pelo `SipCallAdapter`. Injetada (não importada) para as regras
 * serem testáveis sem `sip.js`.
 */
export interface PortaDeControle {
  /** re-INVITE com `hold`: `true` põe em espera, `false` retoma. */
  setHold(session: Session, emEspera: boolean): Promise<boolean>;
  /** REFER: `string` = transferência cega; `Session` = assistida (com Replaces). */
  refer(session: Session, destino: Session | string): Promise<boolean>;
}

/** Motivo (id estável) de um controle não ter sido aplicado. */
export type MotivoDeControle =
  | 'sem_chamada'
  | 'chamada_nao_atendida'
  | 'ja_em_espera'
  | 'nao_esta_em_espera'
  | 'transferencia_em_curso'
  | 'alvo_invalido'
  | 'mesma_perna'
  | 'falha_no_transporte'
  | 'conferencia_sem_ponte';

/** Rótulo operacional (pt-BR) de cada motivo — nada de jargão SIP na tela. */
export const MOTIVO_DE_CONTROLE: Record<MotivoDeControle, string> = {
  sem_chamada: 'Nenhuma chamada em andamento',
  chamada_nao_atendida: 'A chamada ainda não foi atendida',
  ja_em_espera: 'A chamada já está em espera',
  nao_esta_em_espera: 'A chamada não está em espera',
  transferencia_em_curso: 'Já existe uma transferência em andamento',
  alvo_invalido: 'Número de destino inválido',
  mesma_perna: 'O destino é a própria chamada',
  falha_no_transporte: 'A central não aceitou o controle',
  conferencia_sem_ponte: 'Conferência precisa de ponte na central — indisponível nesta linha',
};

/** Resultado de um controle: aplicado, ou recusado com o motivo que a tela mostra. */
export type ResultadoDeControle =
  | { ok: true; emEspera: boolean }
  | { ok: false; motivo: MotivoDeControle; mensagem: string };

/** Estado dos controles da chamada corrente. */
export interface EstadoDoControle {
  emEspera: boolean;
  transferindo: boolean;
}

/** Só sessão estabelecida aceita controle de mídia (re-INVITE/REFER). */
function estabelecida(session: Session): boolean {
  return session.state === 'Established';
}

/** Call-ID de uma sessão, para comparar duas referências da MESMA chamada. */
function callIdDe(session: Session): string | undefined {
  const id = (session as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

/**
 * Alvo de transferência em forma **discável**, ou `null` quando não dá:
 * - ramal de 3 a 6 dígitos (a central disca ramal sem DDD/país);
 * - senão o E.164 brasileiro de `phone.ts`, em dígitos (`55DDD9XXXXXXXX`) —
 *   forma canônica, sem máscara, que vai no usuário da URI do REFER.
 * Qualquer outra coisa é recusada aqui: mandar lixo no REFER derruba a perna.
 */
export function alvoDiscavel(bruto: string | null | undefined): string | null {
  if (typeof bruto !== 'string') return null;
  const digitos = bruto.replace(/\D/g, '');
  if (digitos.length >= 3 && digitos.length <= 6) return digitos;
  const e164 = normalizeE164BR(bruto);
  return e164 === null ? null : e164.slice(1);
}

function recusa(motivo: MotivoDeControle): ResultadoDeControle {
  return { ok: false, motivo, mensagem: MOTIVO_DE_CONTROLE[motivo] };
}

/**
 * Operações de controle da chamada em curso. Uma instância por chamada: o
 * estado (em espera / transferindo) é da sessão corrente, e `reiniciar()` o
 * zera quando a chamada acaba ou outra começa — chamada nova não herda estado
 * velho.
 */
export class ControleDeChamada {
  private emEspera = false;
  private transferindo = false;

  constructor(private readonly porta: PortaDeControle) {}

  /** Estado corrente (leitura) — a tela usa para acender os botões. */
  get estado(): EstadoDoControle {
    return { emEspera: this.emEspera, transferindo: this.transferindo };
  }

  /** Chamada nova (ou encerrada): zera espera e transferência em curso. */
  reiniciar(): void {
    this.emEspera = false;
    this.transferindo = false;
  }

  /** Põe a chamada em espera. Repetir não dispara um segundo re-INVITE. */
  async esperar(session: Session | null): Promise<ResultadoDeControle> {
    const impedimento = this.impedimentoDeSessao(session);
    if (impedimento) return impedimento;
    if (this.emEspera) return recusa('ja_em_espera');
    return this.aplicarEspera(session as Session, true);
  }

  /** Retoma a chamada que está em espera. Sem espera ativa, não toca a central. */
  async retomar(session: Session | null): Promise<ResultadoDeControle> {
    const impedimento = this.impedimentoDeSessao(session);
    if (impedimento) return impedimento;
    if (!this.emEspera) return recusa('nao_esta_em_espera');
    return this.aplicarEspera(session as Session, false);
  }

  /**
   * Transferência **cega**: a central disca o alvo e passa a chamada; esta
   * ponta sai da conversa quando o alvo atende (o `Terminated` da perna chega
   * pelo caminho de sempre e o consumidor chama `reiniciar()`).
   */
  async transferir(session: Session | null, numeroBruto: string): Promise<ResultadoDeControle> {
    const impedimento = this.impedimentoDeTransferencia(session);
    if (impedimento) return impedimento;
    const alvo = alvoDiscavel(numeroBruto);
    if (alvo === null) return recusa('alvo_invalido');
    return this.executarRefer(session as Session, alvo);
  }

  /**
   * Transferência **assistida**: a perna em consulta (a segunda chamada, já
   * atendida) assume a vaga da atual — no SIP é o REFER com `Replaces`
   * (`SipCallAdapter.refer` com uma `Session`).
   */
  async transferirAssistida(
    session: Session | null,
    pernaEmConsulta: Session | null,
  ): Promise<ResultadoDeControle> {
    const impedimento = this.impedimentoDeTransferencia(session);
    if (impedimento) return impedimento;
    if (!pernaEmConsulta || !estabelecida(pernaEmConsulta)) return recusa('chamada_nao_atendida');
    // Duas referências à MESMA chamada (objetos diferentes, mesmo Call-ID) não
    // são uma transferência: seriam a chamada substituindo a si mesma.
    const idAtual = callIdDe(session as Session);
    const idPerna = callIdDe(pernaEmConsulta);
    if (pernaEmConsulta === session || (idAtual !== undefined && idAtual === idPerna)) {
      return recusa('mesma_perna');
    }
    return this.executarRefer(session as Session, pernaEmConsulta);
  }

  /**
   * Conferência (3-vias). **Recusa de propósito** — ver o topo do arquivo: o
   * transporte desta linha não tem ponte de conferência. Devolve o motivo em
   * vez de não fazer nada, para a tela poder explicar ao agente.
   */
  conferenciar(): ResultadoDeControle {
    return recusa('conferencia_sem_ponte');
  }

  private impedimentoDeSessao(session: Session | null): ResultadoDeControle | null {
    if (!session) return recusa('sem_chamada');
    if (!estabelecida(session)) return recusa('chamada_nao_atendida');
    return null;
  }

  private impedimentoDeTransferencia(session: Session | null): ResultadoDeControle | null {
    const impedimento = this.impedimentoDeSessao(session);
    if (impedimento) return impedimento;
    if (this.transferindo) return recusa('transferencia_em_curso');
    return null;
  }

  private async aplicarEspera(session: Session, emEspera: boolean): Promise<ResultadoDeControle> {
    let aceitou = false;
    try {
      aceitou = await this.porta.setHold(session, emEspera);
    } catch {
      // A porta devolve `false` quando falha, mas um transporte que LANÇA não
      // pode deixar o botão preso: cai no mesmo motivo e o estado não muda.
      aceitou = false;
    }
    if (!aceitou) return recusa('falha_no_transporte');
    this.emEspera = emEspera;
    return { ok: true, emEspera: this.emEspera };
  }

  private async executarRefer(session: Session, destino: Session | string): Promise<ResultadoDeControle> {
    this.transferindo = true;
    let aceitou = false;
    try {
      aceitou = await this.porta.refer(session, destino);
    } catch {
      aceitou = false;
    } finally {
      // A trava vale só para a resposta pendente: sem o `finally` um REFER que
      // rejeita deixaria a transferência travada para sempre.
      this.transferindo = false;
    }
    if (!aceitou) return recusa('falha_no_transporte');
    return { ok: true, emEspera: this.emEspera };
  }
}
