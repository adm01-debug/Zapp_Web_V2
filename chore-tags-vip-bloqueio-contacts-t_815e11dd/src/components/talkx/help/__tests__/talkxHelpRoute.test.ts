import { describe, expect, it } from 'vitest';

import { HELP_ALL_TOPICS, HELP_GUIDES_SLUG } from '../talkxHelpIndex';
import { formatTalkXHelpRoute, parseTalkXHelpRoute } from '../talkxHelpRoute';

describe('rota da Ajuda (X189)', () => {
  it('lê a tela, o tópico e o artigo do endereço', () => {
    expect(parseTalkXHelpRoute('?view=talkx&screen=help')).toEqual({
      route: { topic: undefined, article: undefined },
      needsNormalization: false,
    });
    expect(parseTalkXHelpRoute('?view=talkx&screen=help&topic=primeira-campanha')).toEqual({
      route: { topic: 'primeira-campanha', article: undefined },
      needsNormalization: false,
    });
    expect(
      parseTalkXHelpRoute('?view=talkx&screen=help&topic=primeira-campanha&article=primeira-campanha/visao-geral'),
    ).toEqual({
      route: { topic: 'primeira-campanha', article: 'primeira-campanha/visao-geral' },
      needsNormalization: false,
    });
  });

  it('aceita as sentinelas da lista completa e dos guias', () => {
    expect(parseTalkXHelpRoute(`?view=talkx&screen=help&topic=${HELP_ALL_TOPICS}`).route?.topic).toBe(
      HELP_ALL_TOPICS,
    );
    expect(parseTalkXHelpRoute(`?view=talkx&screen=help&topic=${HELP_GUIDES_SLUG}`).route?.topic).toBe(
      HELP_GUIDES_SLUG,
    );
  });

  it('fora do Talk X ou com valor repetido não abre a Ajuda', () => {
    expect(parseTalkXHelpRoute('')).toEqual({ route: null, needsNormalization: false });
    expect(parseTalkXHelpRoute('?view=talkx&tab=overview')).toEqual({
      route: null,
      needsNormalization: false,
    });
    expect(parseTalkXHelpRoute('?screen=help').route).toBeNull();
    expect(parseTalkXHelpRoute('?view=talkx&screen=help&topic=um&topic=dois').needsNormalization).toBe(
      true,
    );
    expect(parseTalkXHelpRoute('?view=talkx&screen=help&topic=Primeira Campanha').needsNormalization).toBe(
      true,
    );
  });

  it('escreve o endereço preservando o resto da URL', () => {
    const source = new URL('https://zapp.example/?view=talkx&tab=overview#main-content');

    expect(formatTalkXHelpRoute(source, {})).toBe('/?view=talkx&tab=overview&screen=help#main-content');
    expect(formatTalkXHelpRoute(source, { topic: HELP_GUIDES_SLUG })).toBe(
      `/?view=talkx&tab=overview&screen=help&topic=${HELP_GUIDES_SLUG}#main-content`,
    );
    expect(formatTalkXHelpRoute(source, null)).toBe('/?view=talkx&tab=overview#main-content');
  });
});
