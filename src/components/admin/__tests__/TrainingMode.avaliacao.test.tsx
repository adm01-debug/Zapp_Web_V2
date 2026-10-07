import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TrainingMode } from '../TrainingMode';

// R2-AUTH-037 (#261) — Modo Treinamento.
// Antes: ao terminar o cenário o componente sorteava a nota
// (`60 + Math.round(secureRandomFloat() * 40)`, antes `Math.random()`) e gravava esse
// número em `training_sessions.score`, com um feedback que falava em "boa empatia e
// resolução" — como se fosse avaliação de desempenho do atendente. O mesmo texto podia
// tirar 60 ou 100. A nota tem de sair do que o atendente escreveu.

const estado = vi.hoisted(() => ({
  insercoes: 0,
  atualizacoes: [] as Record<string, unknown>[],
  sessoesAnteriores: [] as unknown[],
}));

vi.mock('@/integrations/supabase/client', () => {
  type Resultado = { data: unknown; error: null };
  function criarChain(tabela: string) {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.insert = () => {
      estado.insercoes += 1;
      return chain;
    };
    chain.update = (payload: Record<string, unknown>) => {
      estado.atualizacoes.push(payload);
      return chain;
    };
    chain.single = () =>
      Promise.resolve(
        tabela === 'profiles' ? { data: { id: 'perfil-1' }, error: null } : { data: { id: 'sessao-1' }, error: null },
      );
    chain.then = (onOk: (r: Resultado) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve<Resultado>(
        tabela === 'profiles'
          ? { data: { id: 'perfil-1' }, error: null }
          : { data: estado.sessoesAnteriores, error: null },
      ).then(onOk, onErr);
    return chain;
  }
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'usuario-1' } }, error: null }) },
      from: (tabela: string) => criarChain(tabela),
    },
  };
});

const SESSAO_ANTERIOR = {
  id: 'anterior-1',
  scenario_name: 'Sessão anterior de teste',
  status: 'completed',
  score: 90,
};

// Respostas que cobrem os três critérios (detalhe + próximo passo + empatia).
const COMPLETA = 'Entendo a sua situação, desculpe pela demora. Vou verificar agora o rastreio do pedido e retorno com o prazo.';

// Respostas longas (>= 60 caracteres) que NÃO declaram próximo passo nem reconhecem a
// situação do cliente: só o critério "detalhe" é atendido.
const SO_DETALHE = [
  'Certo, registrei aqui o seu caso sobre o pedido que ainda não chegou e o prazo que o senhor combinou.',
  'Anotei o relato do senhor aqui no sistema e o histórico do pedido já está aberto nesta tela.',
  'Segue o resumo do atendimento com os dados do pedido que o senhor informou nesta conversa de hoje.',
];

const VAZIA = 'ok';

async function abrirCenario(nome: string) {
  // A lista de sessões anteriores só aparece depois que o perfil carregou — é o
  // sinal de que `startScenario` já tem `profileId`.
  await screen.findByText(SESSAO_ANTERIOR.scenario_name);
  const insercoesAntes = estado.insercoes;
  fireEvent.click(screen.getByText(nome));
  await waitFor(() => expect(estado.insercoes).toBe(insercoesAntes + 1));
  // A sessão só fica utilizável quando o insert volta com o id (`setActiveSession`).
  await act(async () => {
    await Promise.resolve();
  });
}

function responder(respostas: string[]) {
  for (const texto of respostas) {
    const campo = screen.getByPlaceholderText('Responda como atendente...');
    fireEvent.change(campo, { target: { value: texto } });
    fireEvent.keyDown(campo, { key: 'Enter' });
  }
}

function notaPersistida() {
  const conclusao = [...estado.atualizacoes].reverse().find(u => u.score !== undefined);
  expect(conclusao, 'a conclusão da sessão tem de gravar a nota em training_sessions').toBeDefined();
  return conclusao as { score: number; feedback: string; status: string };
}

const CENARIO = 'Reclamação sobre entrega';

beforeEach(() => {
  estado.insercoes = 0;
  estado.atualizacoes = [];
  estado.sessoesAnteriores = [SESSAO_ANTERIOR];
});

describe('TrainingMode — a nota do treinamento vem das respostas do atendente (R2-AUTH-037)', () => {
  it('respostas completas (detalhe + próximo passo + empatia) concluem com 100/100', async () => {
    render(<TrainingMode />);
    await abrirCenario(CENARIO);

    responder([COMPLETA, COMPLETA, COMPLETA]);

    expect(await screen.findByText('100/100')).toBeInTheDocument();
    expect(screen.getByText(/Excelente/i)).toBeInTheDocument();

    const conclusao = notaPersistida();
    expect(conclusao.score).toBe(100);
    expect(conclusao.status).toBe('completed');
    expect(conclusao.feedback).toMatch(/Excelente/i);
  });

  it('respostas sem conteúdo concluem com a nota mínima (40/100), não com um sorteio', async () => {
    render(<TrainingMode />);
    await abrirCenario(CENARIO);

    responder([VAZIA, VAZIA, VAZIA]);

    expect(await screen.findByText('40/100')).toBeInTheDocument();
    expect(screen.getByText(/Precisa melhorar/i)).toBeInTheDocument();

    const conclusao = notaPersistida();
    expect(conclusao.score).toBe(40);
    expect(conclusao.feedback).toMatch(/detalhar mais a resposta/i);
    expect(conclusao.feedback).toMatch(/reconhecer a situação do cliente/i);
  });

  it('respostas detalhadas, mas sem próximo passo nem empatia, ficam na faixa intermediária (60/100)', async () => {
    render(<TrainingMode />);
    await abrirCenario(CENARIO);

    responder(SO_DETALHE);

    expect(await screen.findByText('60/100')).toBeInTheDocument();
    const feedback = screen.getByText(/^Bom, mas faltou/i);
    expect(feedback).toHaveTextContent(/declarar o próximo passo/i);
    expect(feedback).toHaveTextContent(/reconhecer a situação do cliente/i);

    expect(notaPersistida().score).toBe(60);
  });

  it('a mesma conversa produz sempre a mesma nota (não é sorteio)', async () => {
    const primeiro = render(<TrainingMode />);
    await abrirCenario(CENARIO);
    responder([VAZIA, VAZIA, VAZIA]);
    await screen.findByText('40/100');
    const notaDaPrimeiraConversa = notaPersistida().score;
    primeiro.unmount();

    render(<TrainingMode />);
    await abrirCenario(CENARIO);
    responder([VAZIA, VAZIA, VAZIA]);
    await waitFor(() => expect(estado.atualizacoes.filter(u => u.score !== undefined)).toHaveLength(2));

    expect(notaPersistida().score).toBe(notaDaPrimeiraConversa);
  });

  it('nada do que a tela mostrava antes sumiu: sessões anteriores continuam listadas com a nota', async () => {
    render(<TrainingMode />);
    await abrirCenario(CENARIO);
    responder([COMPLETA, COMPLETA, COMPLETA]);
    await screen.findByText('100/100');

    fireEvent.click(screen.getByRole('button', { name: /novo cenário/i }));

    expect(await screen.findByText(SESSAO_ANTERIOR.scenario_name)).toBeInTheDocument();
    expect(screen.getByText('90/100')).toBeInTheDocument();
    expect(screen.getByText(CENARIO)).toBeInTheDocument();
  });
});
