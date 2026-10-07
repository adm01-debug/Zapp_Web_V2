/**
 * Execução por canal e roteamento — item #237 (R2-API-065).
 *
 * Fonte única e versionada do que o repositório EXECUTA de verdade para cada
 * canal e para as regras de roteamento. Cadastro não é execução: hoje nenhum
 * consumidor versionado lê `channel_connections` nem `channel_routing_rules`
 * (nenhuma Edge Function as menciona; o CRUD das telas Omnichannel é o único
 * leitor), então a UI precisa dizer isso em vez de prometer que a mensagem
 * chega à fila escolhida.
 *
 * Módulo TS puro (sem React nem Supabase) para poder ser provado por teste de
 * unidade. Quando um executor entra ou sai, muda-se `EXECUCAO_VERSION` e o
 * registro abaixo; a UI acompanha sozinha, sem texto paralelo.
 */

/** Versão do registro de execução. Muda sempre que um executor entra ou sai. */
export const EXECUCAO_VERSION = '2026-10-06.1';

/** Tipos de canal que a tela de canais adicionais oferece. */
export type Canal = 'whatsapp' | 'instagram' | 'telegram' | 'messenger' | 'webchat' | 'email';

/** Referência a um executor versionado dentro do repositório. */
export interface ExecutorVersionado {
  /** Identificador estável (Edge Function / módulo). */
  id: string;
  /** Papel do executor, em uma linha. */
  papel: string;
}

export interface ExecucaoDeCanal {
  canal: Canal;
  /** Executor que consome o cadastro deste canal. `null` = só cadastro, sem execução. */
  executor: ExecutorVersionado | null;
  /** O que fazer hoje para ativar o canal, em linguagem operacional. */
  caminho: string;
}

/** Canais oferecidos no diálogo "Adicionar Canal" (o WhatsApp fica de fora). */
export const CANAIS_ADICIONAIS: Canal[] = ['instagram', 'telegram', 'messenger', 'webchat', 'email'];

export const EXECUCAO_POR_CANAL: Record<Canal, ExecucaoDeCanal> = {
  whatsapp: {
    canal: 'whatsapp',
    executor: {
      id: 'supabase/functions/whatsapp-webhook',
      papel: 'Recebe e entrega mensagens do WhatsApp.',
    },
    caminho: 'Canal ativo por conexão própria (Evolution); não passa por este cadastro.',
  },
  email: {
    canal: 'email',
    executor: {
      id: 'supabase/functions/gmail-webhook',
      papel: 'Recebe e envia e-mail pelo Gmail.',
    },
    caminho: 'Ative pelo fluxo OAuth do Gmail; cadastrar aqui não conecta a conta.',
  },
  instagram: {
    canal: 'instagram',
    executor: null,
    caminho: 'Só cadastro: nenhum executor versionado recebe mensagens deste canal ainda.',
  },
  telegram: {
    canal: 'telegram',
    executor: null,
    caminho: 'Só cadastro: nenhum executor versionado recebe mensagens deste canal ainda.',
  },
  messenger: {
    canal: 'messenger',
    executor: null,
    caminho: 'Só cadastro: nenhum executor versionado recebe mensagens deste canal ainda.',
  },
  webchat: {
    canal: 'webchat',
    executor: null,
    caminho: 'Só cadastro: nenhum executor versionado recebe mensagens deste canal ainda.',
  },
};

/** Regras de roteamento: nenhum leitor versionado além do próprio CRUD. */
export const EXECUTOR_DE_ROTAS: ExecutorVersionado | null = null;

export function isCanal(valor: string): valor is Canal {
  return Object.prototype.hasOwnProperty.call(EXECUCAO_POR_CANAL, valor);
}

/** Executor versionado que consome o cadastro do canal, ou `null` se só há cadastro. */
export function executorDoCanal(canal: string): ExecutorVersionado | null {
  if (!isCanal(canal)) return null;
  return EXECUCAO_POR_CANAL[canal].executor;
}

export function canalTemExecutorVersionado(canal: string): boolean {
  return executorDoCanal(canal) !== null;
}

export function rotasTemExecutorVersionado(): boolean {
  return EXECUTOR_DE_ROTAS !== null;
}

/** Texto operacional do que acontece ao cadastrar um canal adicional. */
export function descreverCadastroDeCanais(): string {
  return (
    `Cadastro sem executor: nenhum executor versionado consome estes canais ainda (registro v${EXECUCAO_VERSION}). ` +
    'Adicionar um canal só cria o registro pendente — não ativa recebimento nem envio. ' +
    'WhatsApp e Gmail seguem por fluxos próprios.'
  );
}

/** Texto operacional do que acontece ao criar uma regra de roteamento. */
export function descreverRegrasDeRoteamento(): string {
  return (
    `Regras registradas, ainda sem executor: nenhum consumidor versionado lê channel_routing_rules (registro v${EXECUCAO_VERSION}). ` +
    'A fila escolhida não recebe mensagens até um executor ser conectado.'
  );
}

/** Diagnóstico por canal, pronto para a linha de cada cartão de canal. */
export function descreverCaminhoDoCanal(canal: string): string {
  if (!isCanal(canal)) {
    return `Só cadastro: nenhum executor versionado recebe mensagens deste canal ainda (registro v${EXECUCAO_VERSION}).`;
  }
  return EXECUCAO_POR_CANAL[canal].caminho;
}
