import { describe, expect, it } from 'vitest';

import { loadTalkXHelpDocs } from '../talkxHelpIndex';
import {
  foldHelpText,
  helpSearchTokens,
  highlightHelpText,
  searchHelpDocs,
} from '../useTalkXHelpSearch';

describe('busca da Ajuda (X189)', () => {
  it('dobra acento e caixa', () => {
    expect(foldHelpText('Supressão')).toBe('supressao');
    expect(helpSearchTokens('LGPD e lista de supressão')).toEqual(['lgpd', 'lista', 'supressao']);
  });

  it('destaca o trecho que casou, sem montar HTML', () => {
    const parts = highlightHelpText('Supressão e LGPD', 'supressao');

    expect(parts).toEqual([
      { text: 'Supressão', match: true },
      { text: ' e LGPD', match: false },
    ]);
    expect(highlightHelpText('Sem casamento', 'supressao')).toEqual([
      { text: 'Sem casamento', match: false },
    ]);
  });

  it('"supressao" acha "Supressão" no conteúdo real da Ajuda', async () => {
    const docs = await loadTalkXHelpDocs();

    const semAcento = searchHelpDocs(docs, 'supressao');
    const comAcento = searchHelpDocs(docs, 'Supressão');

    expect(semAcento.length).toBeGreaterThan(0);
    expect(semAcento[0].doc.id).toBe('segmentacao-crm-360/segmentos');
    expect(semAcento[0].excerpt.toLowerCase()).toContain('supress');
    expect(comAcento.map((hit) => hit.doc.id)).toEqual(semAcento.map((hit) => hit.doc.id));
  });

  it('busca casando vários termos e devolve vazio quando não há casamento', async () => {
    const docs = await loadTalkXHelpDocs();

    expect(searchHelpDocs(docs, 'lista de supressão').length).toBeGreaterThan(0);
    expect(searchHelpDocs(docs, 'assunto que não existe')).toEqual([]);
    expect(searchHelpDocs(docs, '   ')).toEqual([]);
  });
});
