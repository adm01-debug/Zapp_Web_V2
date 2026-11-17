import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { TalkXHelpCenter } from '../TalkXHelpCenter';
import type { TalkXHelpRoute } from '../talkxHelpRoute';

// Defeito: no Esc com a busca escrita, a Ajuda limpava o campo e voltava sem
// devolver o foco. Quem estava num resultado da lista ficava sem cursor (o
// resultado focado sai do DOM junto com a lista) e precisava de mouse ou Tab
// para voltar a digitar.

const BUSCA_PLACEHOLDER = 'O que você precisa de ajuda hoje?';

function Ajuda() {
  const [route, setRoute] = useState<TalkXHelpRoute>({});
  return <TalkXHelpCenter route={route} onRouteChange={setRoute} onClose={() => {}} />;
}

describe('Ajuda do Talk X — foco depois do Esc que limpa a busca', () => {
  afterEach(() => cleanup());

  it('Esc a partir de um resultado limpa a busca e devolve o foco ao campo', async () => {
    render(<Ajuda />);
    const campo = await screen.findByPlaceholderText(BUSCA_PLACEHOLDER);

    fireEvent.change(campo, { target: { value: 'campanha' } });
    const resultados = await screen.findByRole('listbox', { name: 'Resultados da busca da Ajuda' });
    const primeiro = within(resultados).getAllByRole('button')[0];

    primeiro.focus();
    expect(campo).not.toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(campo).toHaveValue(''));
    expect(campo).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Ajuda do Talk X' })).toBeTruthy();
  });
});
