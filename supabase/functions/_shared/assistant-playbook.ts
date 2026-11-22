/**
 * Fase 4 do assistente pessoal: treino por perfil.
 *
 * O perfil já existia na Fase 1 (`assistant_profiles.atividade`) e chegava ao
 * motor só como rótulo. Aqui cada atuação ganha o seu conjunto de instruções,
 * os seus objetivos e as capacidades que devem ser acionadas primeiro quando o
 * pedido é vago ("como estou com esse cliente?").
 *
 * Módulo puro: nenhuma dependência de rede, banco ou relógio — o mesmo perfil
 * produz sempre o mesmo bloco de prompt, e é isso que os testes travam.
 */

/** Espelha o CHECK de `assistant_profiles.atividade`. */
export type AssistantAtuacao = 'venda' | 'compra' | 'atendimento' | 'supervisao';

export const ASSISTANT_ATUACOES: readonly AssistantAtuacao[] = [
  'venda',
  'compra',
  'atendimento',
  'supervisao',
];

export interface AssistantPlaybook {
  atuacao: AssistantAtuacao;
  /** O que esta pessoa está tentando conseguir. */
  objetivos: readonly string[];
  /** Instruções que entram no prompt do motor, em ordem. */
  instrucoes: readonly string[];
  /**
   * Capacidades acionadas primeiro quando o pedido não traz sinal explícito.
   * `agenda` não gasta modelo; as demais passam pela chave `ai.capability.*`.
   */
  prioritarias: readonly string[];
  /**
   * Catálogo base de objeções do perfil, usado como referência de tratamento.
   *
   * `copilot_objection_catalog` guarda objeção POR CONVERSA (`conversation_id` e
   * `submitted_by` são NOT NULL), então não serve de catálogo global — semear
   * ali exigiria DDL. O catálogo que o treino precisa vive aqui, versionado no
   * código e coberto por teste; a tabela segue sendo o histórico real.
   */
  objecoes?: readonly { tipo: string; tratamento: string }[];
}

const PLAYBOOKS: Record<AssistantAtuacao, AssistantPlaybook> = {
  venda: {
    atuacao: 'venda',
    objetivos: [
      'tratar objeção sem discutir com o cliente',
      'ancorar preço pelo valor percebido, não pelo desconto',
      'definir o próximo passo com data',
      'perceber risco de perder o pedido antes do cliente sumir',
      'responder prazo de entrega com segurança',
    ],
    instrucoes: [
      'Você assiste um vendedor: a resposta termina em ação comercial concreta.',
      'Em objeção de preço, nunca comece baixando o valor: primeiro reforce o que está incluído.',
      'Se houver sinal de compra junto à objeção, conduza ao fechamento em vez de pedir mais informação.',
      'Cite prazo apenas quando houver data ou condição verificável na conversa.',
    ],
    prioritarias: ['temperatura_lead', 'tratar_objecao', 'recomendar_produto', 'agenda'],
    objecoes: [
      { tipo: 'preco', tratamento: 'reforce o que está incluído antes de falar de desconto; compare com o custo de não fazer' },
      { tipo: 'prazo', tratamento: 'mostre a data de produção possível e o que muda se fechar hoje' },
      { tipo: 'concorrente', tratamento: 'pergunte o critério da comparação; ganhe no critério, não no preço' },
      { tipo: 'chefe', tratamento: 'ofereça material de uma página que o cliente possa levar para a aprovação' },
      { tipo: 'quantidade_minima', tratamento: 'proponha lote inicial menor com recompra programada' },
    ],
  },
  compra: {
    atuacao: 'compra',
    objetivos: [
      'comparar fornecedor com critério objetivo',
      'acompanhar histórico de preço da mesma demanda',
      'cobrar prazo prometido × prazo cumprido',
      'planejar recompra antes de o estoque acabar',
    ],
    instrucoes: [
      'Você assiste um comprador: a resposta compara opções e aponta o risco de cada uma.',
      'Diferencie o que foi prometido do que foi entregue; nunca trate promessa como fato.',
      'Preço só é conclusivo junto de prazo, quantidade mínima e frete.',
      'Ao sugerir fornecedor, diga o critério usado e o que ficou de fora.',
    ],
    prioritarias: ['calcular_prazo', 'recomendar_produto', 'resumo_conversa', 'agenda'],
    objecoes: [
      { tipo: 'prazo', tratamento: 'peça a data prometida por escrito e compare com o histórico do fornecedor' },
      { tipo: 'preco', tratamento: 'normalize por unidade e inclua frete e prazo antes de comparar' },
      { tipo: 'qualidade', tratamento: 'peça amostra ou laudo do lote anterior antes de aprovar' },
    ],
  },
  atendimento: {
    atuacao: 'atendimento',
    objetivos: [
      'responder rápido sem perder o tom combinado',
      'encaminhar para a pessoa certa quando não for resolvível aqui',
      'não inventar informação que não está na conversa',
    ],
    instrucoes: [
      'Você assiste alguém no atendimento: a resposta é curta, direta e pronta para enviar.',
      'Se a conversa não sustenta a resposta, diga o que falta perguntar ao cliente.',
      'Assunto fora do seu alcance vira encaminhamento explícito, não improviso.',
    ],
    prioritarias: ['sugerir_resposta', 'resumo_conversa', 'agenda'],
  },
  supervisao: {
    atuacao: 'supervisao',
    objetivos: [
      'ver onde o time está travando',
      'identificar conversas esfriando antes de virarem perda',
      'medir carga por pessoa',
    ],
    instrucoes: [
      'Você assiste um supervisor: a resposta aponta padrão e onde agir, não uma frase para o cliente.',
      'Fale do conjunto (conversas, pessoas, estágios) e evite recomendar resposta pontual.',
      'Sinalize conversa esfriando com o dado que sustenta a conclusão.',
    ],
    prioritarias: ['temperatura_lead', 'resumo_conversa', 'agenda'],
  },
};

/** Perfil ausente ou fora do CHECK cai em `atendimento` — o default do banco. */
export function playbookFor(atuacao?: string | null): AssistantPlaybook {
  if (atuacao && (ASSISTANT_ATUACOES as readonly string[]).includes(atuacao)) {
    return PLAYBOOKS[atuacao as AssistantAtuacao];
  }
  return PLAYBOOKS.atendimento;
}

/**
 * Bloco de prompt do perfil. Vazio quando não há instrução — nunca devolve
 * texto genérico que faria a resposta fingir personalização que não existe.
 */
export function playbookPromptBlock(playbook: AssistantPlaybook): string {
  if (playbook.instrucoes.length === 0) return '';
  const linhas = [
    `Treino do perfil (${playbook.atuacao}):`,
    ...playbook.instrucoes.map((i) => `- ${i}`),
    `Objetivos: ${playbook.objetivos.join('; ')}.`,
  ];
  if (playbook.objecoes && playbook.objecoes.length > 0) {
    linhas.push(
      'Objeções conhecidas e tratamento que já funcionou: ' +
        playbook.objecoes.map((o) => `${o.tipo} → ${o.tratamento}`).join('; ') + '.',
    );
  }
  return linhas.join('\n');
}