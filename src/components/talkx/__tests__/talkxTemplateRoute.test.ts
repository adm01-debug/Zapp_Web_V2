import { describe, expect, it } from 'vitest';
import { formatTalkXTemplateRoute, parseTalkXTemplateRoute } from '@/components/talkx/talkxTemplateRoute';

/**
 * Contrato da rota da tela 05 (X094): o editor de template tem endereço próprio —
 * `?view=talkx&tab=templates&template=<id|new>&ttab=conteudo|ab|historico`.
 * Endereço inválido/ambíguo nunca abre template nenhum: cai na biblioteca.
 */
describe('Talk X rota do editor de template', () => {
  it('round-trips um template aberto sem derrubar o resto do endereço', () => {
    const source = new URL('https://zapp.example/?view=talkx&filter=mine#main-content');
    const path = formatTalkXTemplateRoute(source, { templateId: 'tpl_1', ttab: 'ab' });

    expect(path).toBe('/?view=talkx&filter=mine&tab=templates&template=tpl_1&ttab=ab#main-content');
    expect(parseTalkXTemplateRoute(new URL(path, source).search)).toEqual({
      route: { templateId: 'tpl_1', ttab: 'ab' },
      needsNormalization: false,
    });
  });

  it('abre o editor vazio com o endereço canônico de template=new', () => {
    const path = formatTalkXTemplateRoute(new URL('https://zapp.example/?view=talkx'), {
      templateId: 'new',
      ttab: 'conteudo',
    });

    expect(path).toBe('/?view=talkx&tab=templates&template=new&ttab=conteudo');
    expect(parseTalkXTemplateRoute(new URL(path, 'https://zapp.example').search)).toEqual({
      route: { templateId: 'new', ttab: 'conteudo' },
      needsNormalization: false,
    });
  });

  it('completa o endereço sem ttab e cai em Conteúdo quando a sub-aba não existe', () => {
    expect(parseTalkXTemplateRoute('?view=talkx&tab=templates&template=tpl_1')).toEqual({
      route: { templateId: 'tpl_1', ttab: 'conteudo' },
      needsNormalization: true,
    });
    expect(parseTalkXTemplateRoute('?view=talkx&tab=templates&template=tpl_1&ttab=relatorio')).toEqual({
      route: { templateId: 'tpl_1', ttab: 'conteudo' },
      needsNormalization: true,
    });
  });

  it('rejeita endereço duplicado, de outra tela e id malformado', () => {
    for (const search of [
      '?view=talkx&tab=templates&template=one&template=two&ttab=conteudo',
      '?view=talkx&tab=templates&template=tpl_1&ttab=ab&ttab=conteudo',
      '?view=talkx&tab=segments&template=tpl_1&ttab=conteudo',
      '?view=inbox&tab=templates&template=tpl_1&ttab=conteudo',
      '?view=talkx&tab=templates&template=not/a/template&ttab=conteudo',
      '?view=talkx&tab=templates&template=&ttab=conteudo',
      // Sub-aba sem template não tem o que abrir: o endereço volta para a biblioteca.
      '?view=talkx&tab=templates&ttab=ab',
    ]) {
      expect(parseTalkXTemplateRoute(search)).toEqual({ route: null, needsNormalization: true });
    }
  });

  it('sem os parâmetros do editor não normaliza nada (a biblioteca é a tela)', () => {
    expect(parseTalkXTemplateRoute('?view=talkx&tab=templates')).toEqual({
      route: null,
      needsNormalization: false,
    });
  });

  it('sai do editor sem apagar a aba nem os parâmetros das outras trilhas', () => {
    const source = new URL('https://zapp.example/?view=talkx&tab=templates&template=tpl_1&ttab=ab&sub=configuracoes');
    expect(formatTalkXTemplateRoute(source, null)).toBe('/?view=talkx&tab=templates&sub=configuracoes');
  });
});
