/**
 * Registro central de bloqueios de recarga.
 *
 * Partes da aplicacao (edicao de mensagem, chamada ativa, sessao critica) declaram aqui que um
 * recarregamento da pagina interromperia trabalho em andamento. O monitor de atualizacao consulta
 * `haBloqueioRecarga()` para distinguir uma aba apenas oculta de uma aba que ainda tem trabalho
 * ativo e, por isso, nao pode ser recarregada em silencio.
 *
 * Contrato:
 * - Cada registro ganha um token proprio: dois bloqueios simultaneos nao se cancelam entre si.
 * - A funcao de limpeza devolvida por `registrarBloqueioRecarga` e idempotente.
 * - O observador so e avisado quando o estado AGREGADO troca entre livre e bloqueado; inscrever,
 *   somar um bloqueio ao que ja existia ou limpar um bloqueio em duplicidade nao gera aviso.
 *
 * Estado puramente em memoria: guarda apenas o motivo tecnico (texto curto e conhecido do codigo),
 * nunca conteudo do usuario.
 */

export type ObservadorBloqueiosRecarga = (bloqueado: boolean) => void;

/** Guarda o motivo dos bloqueios ativos (debug/inspecao); a chave do mapa e o token do registro. */
const bloqueios = new Map<symbol, string>();
const observadores = new Set<ObservadorBloqueiosRecarga>();
let estadoAgregadoBloqueado = false;

/** Ha algum bloqueio de recarga ativo? */
export function haBloqueioRecarga(): boolean {
  return bloqueios.size > 0;
}

/**
 * Declara que um recarregamento interromperia trabalho em andamento.
 *
 * @param motivo Rotulo tecnico e estavel do bloqueio (ex.: `'mensagem-em-edicao'`).
 * @returns Funcao de limpeza idempotente: chamadas extras nao tem efeito.
 */
export function registrarBloqueioRecarga(motivo: string): () => void {
  const token = Symbol(motivo);
  bloqueios.set(token, motivo);
  notificarTransicao();

  let ativo = true;
  return () => {
    if (!ativo) return;
    ativo = false;
    bloqueios.delete(token);
    notificarTransicao();
  };
}

/**
 * Observa as transicoes agregadas livre<->bloqueado. Nao dispara no ato da inscricao.
 *
 * @returns Funcao que cancela a inscricao; apos chama-la o observador nao recebe mais avisos.
 */
export function observarBloqueiosRecarga(observador: ObservadorBloqueiosRecarga): () => void {
  observadores.add(observador);
  return () => {
    observadores.delete(observador);
  };
}

function notificarTransicao(): void {
  const bloqueado = bloqueios.size > 0;
  if (bloqueado === estadoAgregadoBloqueado) return;
  estadoAgregadoBloqueado = bloqueado;
  for (const observador of [...observadores]) {
    try {
      observador(bloqueado);
    } catch {
      // Um observador com defeito nao interrompe o aviso dos demais.
    }
  }
}
