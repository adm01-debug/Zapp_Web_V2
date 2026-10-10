/**
 * X049 — modal único do kit: casca com barra de título e "✕", tom aplicado,
 * espera da ação e os presets do mock 17. Cobre o aceite da etapa
 * (`docs/talkx/v4/etapas/F05-kit-estados-modais-e-navegacao.md`).
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { TalkXConfirmDialog, TalkXDialogShell } from '../dialogs';
import { DIALOG_PRESETS, PRESETS_DO_MOCK, type TalkXDialogPresetKey } from '../dialogPresets';

// Radix mede o conteúdo com ResizeObserver, API ausente no jsdom.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// CT-70 (mesma convenção do catálogo): com "reduzir movimento" ligado, a
// entrada `talkxScaleIn` é desligada. O DOM continua o de produção.
const reduceMotion = vi.hoisted(() => ({ valor: false }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.valor };
});

type ConfirmProps = React.ComponentProps<typeof TalkXConfirmDialog>;

/** Abre o `TalkXConfirmDialog` com o preset, como um chamador real faria. */
function renderConfirm(presetKey: TalkXDialogPresetKey, extra: Partial<ConfirmProps> = {}) {
  const preset = DIALOG_PRESETS[presetKey];
  const onConfirm = extra.onConfirm ?? vi.fn();
  const onClose = extra.onClose ?? vi.fn();
  const props: ConfirmProps = {
    open: true,
    title: preset.title,
    subtitle: preset.subtitle,
    description: preset.description,
    consequence: preset.consequence,
    tone: preset.tone,
    icon: preset.icon,
    iconColor: preset.iconColor,
    confirmLabel: preset.confirmLabel,
    cancelLabel: preset.cancelLabel,
    reasonField: preset.reasonField,
    // o nome só entra na frase dos presets que o pedem (`{nome}`)
    entityName: preset.description.includes('{nome}') ? 'Promoção Setembro' : undefined,
    ...extra,
    onConfirm,
    onClose,
  };
  render(<TalkXConfirmDialog {...props} />);
  return { onConfirm, onClose };
}

const NOME = '"Promoção Setembro"';

/** Texto do mock 17 (`A_telas_01_17.md`, T17-030…T17-052). */
const CASOS_DO_MOCK: {
  preset: keyof typeof PRESETS_DO_MOCK; titulo: string; pergunta: string;
  consequencia?: string; confirmar: string; cancelar: string; nomeEmNegrito: boolean;
}[] = [
  {
    preset: 'excluirCampanha', titulo: 'Excluir Campanha',
    pergunta: `Tem certeza que deseja excluir a campanha ${NOME}?`,
    consequencia: 'Esta ação não pode ser desfeita.',
    confirmar: 'Excluir', cancelar: 'Cancelar', nomeEmNegrito: true,
  },
  {
    preset: 'duplicarCampanha', titulo: 'Duplicar Campanha',
    pergunta: `Deseja criar uma cópia da campanha ${NOME}?`,
    consequencia: 'Uma nova campanha será criada com todas as configurações desta.',
    confirmar: 'Duplicar', cancelar: 'Cancelar', nomeEmNegrito: true,
  },
  {
    preset: 'removerSupressao', titulo: 'Remover da Supressão',
    pergunta: 'Deseja remover este contato da lista de supressão?',
    consequencia: 'O contato poderá receber mensagens nas próximas campanhas.',
    confirmar: 'Remover', cancelar: 'Cancelar', nomeEmNegrito: false,
  },
  {
    preset: 'cancelarCampanha', titulo: 'Cancelar Campanha',
    pergunta: `Tem certeza que deseja cancelar a campanha ${NOME}?`,
    consequencia: 'O envio será interrompido imediatamente e os contatos pendentes não receberão as mensagens.',
    confirmar: 'Cancelar', cancelar: 'Voltar', nomeEmNegrito: true,
  },
  {
    preset: 'confirmarDisparo', titulo: 'Confirmar Disparo',
    pergunta: `Deseja iniciar o envio da campanha ${NOME}?`,
    confirmar: 'Confirmar envio', cancelar: 'Cancelar', nomeEmNegrito: true,
  },
];

const perguntaNaTela = (texto: string) =>
  screen.getByText((_conteudo, elemento) => elemento?.tagName === 'P' && elemento.textContent === texto);

describe('X049 — casca do modal do kit', () => {
  it('mostra a barra de título com o "✕", o corpo e o rodapé; o "✕" fecha', () => {
    const onClose = vi.fn();
    render(
      <TalkXDialogShell open onClose={onClose} title="Excluir Campanha" footer={<span>rodapé de ações</span>}>
        <p>corpo do modal</p>
      </TalkXDialogShell>,
    );

    expect(perguntaNaTela('corpo do modal')).toBeInTheDocument();
    expect(screen.getByText('Excluir Campanha')).toBeInTheDocument();
    expect(screen.getByText('rodapé de ações')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('com preferência por menos movimento, o conteúdo continua na tela', () => {
    reduceMotion.valor = true;
    try {
      renderConfirm('excluirCampanha');
      expect(perguntaNaTela(`Tem certeza que deseja excluir a campanha ${NOME}?`)).toBeInTheDocument();
    } finally {
      reduceMotion.valor = false;
    }
  });
});

describe('X049 — presets do mock 17', () => {
  for (const caso of CASOS_DO_MOCK) {
    it(`${caso.preset}: barra, frase e rótulos do mock`, () => {
      renderConfirm(caso.preset);

      expect(screen.getByText(caso.titulo)).toBeInTheDocument();
      const pergunta = perguntaNaTela(caso.pergunta);
      expect(pergunta).toBeInTheDocument();
      if (caso.consequencia) expect(screen.getByText(caso.consequencia)).toBeInTheDocument();

      if (caso.nomeEmNegrito) {
        // o nome vai entre aspas e em negrito dentro da frase (padrão do mock 17)
        const nome = pergunta.querySelector('.font-semibold');
        expect(nome?.textContent).toBe(NOME);
      } else {
        expect(pergunta.querySelector('.font-semibold')).toBeNull();
      }

      expect(screen.getByRole('button', { name: caso.confirmar })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: caso.cancelar })).toBeInTheDocument();
    });
  }

  it('confirmar disparo usa o verde e as linhas Segmento/Destinatários/Mensagens/Envio', () => {
    renderConfirm('confirmarDisparo', {
      details: [
        { label: 'Segmento', value: 'Novos Leads' },
        { label: 'Destinatários', value: '1.250 contatos' },
        { label: 'Mensagens', value: '2 variações' },
        { label: 'Envio', value: 'Imediato' },
      ],
    });

    expect(screen.getByRole('button', { name: 'Confirmar envio' }).className).toContain('bg-success');
    expect(PRESETS_DO_MOCK.confirmarDisparo.detailLabels).toEqual(['Segmento', 'Destinatários', 'Mensagens', 'Envio']);
    for (const rotulo of PRESETS_DO_MOCK.confirmarDisparo.detailLabels) {
      expect(screen.getByText(String(rotulo))).toBeInTheDocument();
    }
  });

  it('o preset violeta da supressão pinta o botão de violeta', () => {
    renderConfirm('removerSupressao');

    const botao = screen.getByRole('button', { name: 'Remover' });
    expect(botao.className).toContain('bg-violet-600');
    expect(botao.className).not.toContain('bg-primary');
  });
});

describe('X049 — espera da ação', () => {
  it('a ação pendente mantém o modal aberto e só fecha ao resolver', async () => {
    let resolver!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => { resolver = r; }));
    const onClose = vi.fn();
    renderConfirm('excluirCampanha', { onConfirm, onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeDisabled();

    await act(async () => { resolver(); });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a recusa do servidor aparece dentro do modal e ele continua aberto', async () => {
    const onConfirm = vi.fn(() => Promise.reject(new Error('Campanha em uso: não pode ser excluída.')));
    const onClose = vi.fn();
    renderConfirm('excluirCampanha', { onConfirm, onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Campanha em uso: não pode ser excluída.'),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeEnabled();
  });

  it('enquanto a ação pende, o botão fica desabilitado e um 2º clique não dispara outra chamada', async () => {
    const onConfirm = vi.fn(() => new Promise<void>(() => { /* fica pendente de propósito */ }));
    const onClose = vi.fn();
    renderConfirm('excluirCampanha', { onConfirm, onClose });

    const botao = screen.getByRole('button', { name: 'Excluir' });
    // dois cliques no mesmo turno: sem a trava por ref, ambos leem `pending`
    // ainda falso e a ação dispara duas vezes.
    await act(async () => {
      fireEvent.click(botao);
      fireEvent.click(botao);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeDisabled();
  });

  it('abre com o foco no "Cancelar" nos destrutivos', async () => {
    renderConfirm('excluirCampanha');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus());
  });

  it('onConfirm legado `() => void` (sem payload) segue compatível: o consumidor controla o fechamento', () => {
    const onConfirm = vi.fn(() => { /* assinatura antiga, ignora o payload */ });
    const onClose = vi.fn();
    // chamador legado: `() => void`, sem `reasonField` — o shell chama o
    // onConfirm com o payload e NÃO fecha por conta própria (quem fecha é o
    // consumidor, ex.: TalkXCampaignPaused só fecha depois do servidor).
    renderConfirm('duplicarCampanha', { onConfirm: onConfirm as () => void, onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ reason: '' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('com check pendente o botão não confirma; marcado, confirma', () => {
    const { onConfirm } = renderConfirm('excluirCampanha', {
      checks: [{ id: 'reconheco', label: 'Reconheço que a exclusão é permanente' }],
    });

    const botao = screen.getByRole('button', { name: 'Excluir' });
    expect(botao).toBeDisabled();
    fireEvent.click(botao);
    fireEvent.keyDown(botao, { key: 'Enter' });

    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('o motivo escrito no campo do preset chega ao onConfirm', () => {
    const onConfirm = vi.fn();
    renderConfirm('pausarCampanha', { onConfirm });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'aguardando aprovação do cliente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pausar agora' }));

    expect(onConfirm).toHaveBeenCalledWith({ reason: 'aguardando aprovação do cliente' });
  });
});
