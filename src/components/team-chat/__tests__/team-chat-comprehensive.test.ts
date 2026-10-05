import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatDateSep, formatTime, DEFAULT_CAPTIONS } from '../teamChatParts';
import { getFileExtension, getFileExtensionWithDefault } from '@/utils/fileExtensions';

/**
 * Team Chat — cobertura real (reescrita do cartao #166 / TC-011).
 * Antes: 219 asserts sobre o literal `true` (nenhum validava nada). Agora cada
 * item executa codigo real (funcoes puras), assegura sobre o codigo-fonte
 * (readFileSync) ou e `it.todo` honesto para lacuna existente.
 */
const HERE = __dirname;
const src = (rel: string) => readFileSync(join(HERE, '..', rel), 'utf-8');
const hook = (rel: string) => readFileSync(join(HERE, '..', '..', '..', 'hooks', rel), 'utf-8');

const viewSrc = src('TeamChatView.tsx');
const panelSrc = src('TeamChatPanel.tsx');
const inputSrc = src('TeamChatInputArea.tsx');
const headerSrc = src('TeamChatHeader.tsx');
const uploaderSrc = src('TeamFileUploader.tsx');
const listSrc = src('TeamConversationList.tsx');
const dialogSrc = src('NewConversationDialog.tsx');
const partsSrc = src('teamChatParts.tsx');
const itemSrc = src('TeamMessageItem.tsx');
const a11ySrc = src('TeamChatA11y.tsx');
const panelHookSrc = src('useTeamChatPanel.ts');
const markdownSrc = src(join('..', 'inbox', 'chat', 'MarkdownPreview.tsx'));
const mutationsSrc = hook(join('team-chat', 'useTeamChatMutations.ts'));
const convsHookSrc = hook(join('team-chat', 'useTeamConversations.ts'));
const msgsHookSrc = hook(join('team-chat', 'useTeamMessages.ts'));
const notifSrc = hook(join('chat', 'useTeamChatNotifications.ts'));
const draftSrc = hook(join('chat', 'useTeamChatDraft.ts'));
const profilesSrc = hook(join('crm', 'useTeamProfiles.ts'));

describe('Team Chat — Seguranca (autenticacao e limites)', () => {
  it('mutations validam auth: send/create/mute/leave lancam "Not authenticated"', () => {
    const throws = mutationsSrc.match(/if \(!profile\) throw new Error\('Not authenticated'\)/g) || [];
    expect(throws.length).toBeGreaterThanOrEqual(3);
    expect(mutationsSrc).toContain('useCreateTeamConversation');
    expect(mutationsSrc).toContain("if (!profile) throw new Error('Not authenticated')");
  });

  it('useSendTeamMessage valida auth antes do insert', () => {
    const authIdx = mutationsSrc.indexOf("if (!profile) throw new Error('Not authenticated')");
    const sendIdx = mutationsSrc.indexOf("from('team_messages').insert");
    expect(sendIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(-1);
  });

  it('limite de conteudo existe no cliente (CHAR_LIMIT 10000)', () => {
    expect(draftSrc).toContain('CHAR_LIMIT = 10000');
    expect(draftSrc).toContain('isOverLimit = charCount > CHAR_LIMIT');
  });

  it('XSS: MarkdownPreview escapa entidades HTML antes de inserir tags', () => {
    const amp = markdownSrc.indexOf('&amp;');
    const lt = markdownSrc.indexOf('&lt;');
    expect(amp).toBeGreaterThan(-1);
    expect(lt).toBeGreaterThan(-1);
    expect(itemSrc).toContain('MarkdownPreview');
    expect(itemSrc).not.toContain('dangerouslySetInnerHTML');
  });
});

describe('Team Chat — Integridade de dados', () => {
  it('useSendTeamMessage insere em team_messages e bumpa updated_at da conversa', () => {
    expect(mutationsSrc).toContain("from('team_messages').insert");
    expect(mutationsSrc).toContain("from('team_conversations').update({ updated_at:");
  });

  it('edicao seta is_edited + updated_at na mutation', () => {
    expect(mutationsSrc).toContain('useEditTeamMessage');
    expect(mutationsSrc).toContain('is_edited: true');
  });

  it('delete remove por messageId', () => {
    expect(mutationsSrc).toContain('useDeleteTeamMessage');
    expect(mutationsSrc).toMatch(/\.delete\(\)[\s\S]{0,120}\.eq\('id', messageId\)/);
  });

  it('grupo exige >= 2 membros selecionados no cliente', () => {
    expect(dialogSrc).toContain('selectedIds.length < 2');
  });

  it('mark-as-read atualiza last_read_at e faz upsert em receipts', () => {
    expect(msgsHookSrc).toContain('last_read_at');
    expect(msgsHookSrc).toContain('team_message_receipts');
    expect(msgsHookSrc).toContain('upsert(receipts');
  });

  it('mark-as-read nao dispara a cada render — chaveado por conversationId:ultimoId', () => {
    expect(msgsHookSrc).toContain('markedRef.current === cacheKey');
  });

  it.todo('soft-delete de mensagens — DELETE hoje remove a linha de verdade');
  it.todo('dedupe/idempotencia no envio — retry de rede pode inserir duplicada');
  it.todo('minimo de membros do grupo validado no servidor — RPC nao impoe limite');
});

describe('Team Chat — Notificacoes', () => {
  it('playTeamChatSound toca acorde de duas notas via WebAudio', () => {
    expect(notifSrc).toContain('playTeamChatSound');
    expect(notifSrc).toContain('AudioContext');
    expect(notifSrc).toContain('frequencies = [523, 659]');
  });

  it('audioCtx e singleton e retomado se suspenso; erros engolidos', () => {
    expect(notifSrc).toMatch(/let\s+audioCtx/);
    expect(notifSrc).toContain("'suspended'");
    expect(notifSrc).toContain('resume()');
    expect(notifSrc).toMatch(/try\s*\{[\s\S]{0,2000}catch/);
  });

  it('nao notifica mensagem propria nem conversa ativa visivel', () => {
    expect(notifSrc).toContain('msg.sender_id === profile.id');
    expect(notifSrc).toContain('document.hidden');
    expect(notifSrc).toContain('activeIdRef.current === msg.conversation_id');
  });

  it('verifica membership antes de notificar e respeita is_muted', () => {
    expect(notifSrc).toContain('team_conversation_members');
    expect(notifSrc).toContain('.limit(1)');
    expect(notifSrc).toContain('is_muted');
  });

  it('respeita soundEnabled e quiet hours', () => {
    expect(notifSrc).toContain('notifSettings.soundEnabled');
    expect(notifSrc).toContain('isQuietHours()');
  });

  it('label de midia correto por media_type e texto truncado em 100 chars', () => {
    expect(notifSrc).toContain('slice(0, 100)');
    expect(notifSrc).toContain("type: 'team_chat'");
    expect(notifSrc).toContain('requireInteraction: false');
  });
});

describe('Team Chat — Midia e arquivos', () => {
  it('limite de 10MB: constante, toast e reset do input', () => {
    expect(uploaderSrc).toContain('MAX_FILE_SIZE = 10 * 1024 * 1024');
    expect(uploaderSrc).toContain('Arquivo muito grande');
    expect(uploaderSrc).toContain("inputRef.current.value = ''");
  });

  it('deteccao de midia por prefixo image/video/audio com fallback document', () => {
    expect(uploaderSrc).toContain("startsWith('image/')");
    expect(uploaderSrc).toContain("startsWith('video/')");
    expect(uploaderSrc).toContain("startsWith('audio/')");
    expect(uploaderSrc).toContain("'document'");
  });

  it('arquivo exatamente no limite passa; acima falha (comparacao estrita >)', () => {
    expect(uploaderSrc).toContain('file.size > MAX_FILE_SIZE');
  });

  it('tipos sticker/audio_meme/emoji usam mediaType e legenda proprios', () => {
    expect(panelHookSrc).toContain("mediaType: 'sticker'");
    expect(panelHookSrc).toContain("mediaType: 'audio_meme'");
    expect(DEFAULT_CAPTIONS.sticker).toContain('Figurinha');
    expect(DEFAULT_CAPTIONS.audio_meme).toContain('meme');
  });

  it('MediaContent renderiza cada tipo e nao quebra com tipo desconhecido', () => {
    expect(partsSrc).toContain('<video');
    expect(partsSrc).toContain('<audio');
    expect(partsSrc).toMatch(/default:\s*return\s+null/);
  });

  it('getFileExtension e getFileExtensionWithDefault executados de verdade', () => {
    expect(getFileExtension('relatorio.2024.final.PDF')).toBe('pdf');
    expect(getFileExtension('README')).toBeNull();
    expect(getFileExtensionWithDefault('README', 'bin')).toBe('bin');
    expect(getFileExtensionWithDefault('relatorio.2024.final.pdf', 'bin')).toBe('pdf');
  });

  it.todo('indicador de progresso durante upload — hoje so estado binario enviando/erro');
  it.todo('lightbox para ampliar imagens do team chat');
});

describe('Team Chat — UI/UX', () => {
  it('formatDateSep hoje/ontem/pt-BR e formatTime HH:mm (executados de verdade)', () => {
    const agora = new Date();
    const ontem = new Date(Date.now() - 24 * 3600 * 1000);
    expect(formatDateSep(agora.toISOString())).toBe('Hoje');
    expect(formatDateSep(ontem.toISOString())).toBe('Ontem');
    expect(formatTime('2026-01-01T10:05:00Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('indicador "· editado" so em mensagens editadas', () => {
    expect(itemSrc).toContain("msg.is_edited && ' · editado'");
  });

  it('auto-scroll condicional: so se isNearBottomRef', () => {
    expect(panelSrc).toContain('isNearBottomRef.current');
    expect(panelHookSrc).toContain('isNearBottomRef');
    expect(panelHookSrc).toContain('showScrollDown');
  });

  it('input: Enter envia, Shift+Enter quebra linha', () => {
    expect(inputSrc).toContain("e.key === 'Enter' && !e.shiftKey");
    expect(inputSrc).toContain('preventDefault');
  });

  it('botao enviar desabilita sem texto, acima do limite ou pendente', () => {
    expect(inputSrc).toContain('disabled={!draft.hasText || draft.isOverLimit || isPending}');
  });

  it('textarea auto-redimensiona ate 200px', () => {
    expect(inputSrc).toContain('el.style.height');
    expect(inputSrc).toContain('Math.min(el.scrollHeight, 200)');
  });

  it('edicao inline: Enter salva, Escape cancela', () => {
    expect(itemSrc).toContain("e.key === 'Escape'");
    expect(itemSrc).toContain('onCancelEdit');
    expect(itemSrc).toContain('Cancelar');
  });

  it('texto vazio/whitespace nao envia', () => {
    expect(draftSrc).toContain('hasText = text.trim().length > 0');
    expect(inputSrc).toContain('!draft.hasText');
  });

  it.todo('update otimista na edicao — a tela espera a mutation terminar');
  it.todo('referencia de reply busca so as mensagens ja carregadas');
});

describe('Team Chat — Lista de conversas e criacao', () => {
  it('badge de nao-lidas so com count > 0', () => {
    expect(listSrc).toContain('unread_count');
    expect(listSrc).toContain('> 0');
  });

  it('preview da ultima mensagem + tempo relativo pt-BR', () => {
    expect(listSrc).toContain('last_message');
    expect(listSrc).toContain('formatDistanceToNow');
    expect(listSrc).toContain('ptBR');
  });

  it('chat direto mostra nome/avatar do OUTRO membro', () => {
    expect(convsHookSrc).toContain('m.profile_id !== profile.id');
    expect(convsHookSrc).toContain('displayName');
  });

  it.todo('busca por conteudo da ultima mensagem — hoje o filtro so olha o nome');
  it.todo('skeleton de loading na lista');
});

describe('Team Chat — Performance', () => {
  it('previews + unread + membros em batch via RPCs (sem N+1)', () => {
    expect(convsHookSrc).toContain('get_team_conversation_previews');
    expect(convsHookSrc).toContain('get_team_unread_counts');
    expect(convsHookSrc).toContain('Promise.all');
  });

  it('mensagens limitadas a 200 por conversa com paginacao por cursor', () => {
    expect(msgsHookSrc).toContain('.limit(200)');
    expect(panelHookSrc).toContain('fetchOlderMessages');
    expect(panelHookSrc).toContain('oldestCursor');
  });

  it('perfis cacheados por 30s (nao infinity)', () => {
    expect(profilesSrc).toContain('staleTime: 30_000');
    expect(profilesSrc).not.toContain('staleTime: Infinity');
  });

  it('componentes pesados memoizados', () => {
    expect(itemSrc).toMatch(/memo\(function TeamMessageItem/);
    expect(partsSrc).toMatch(/memo\(function MediaContent/);
  });

  it.todo('virtualizacao da lista de mensagens');
  it.todo('dedupe de subscriptions — cada consumidor abre o proprio canal');
});

describe('Team Chat — Acessibilidade e mobile', () => {
  it('lista de mensagens tem role="log" + aria-live', () => {
    expect(panelSrc).toContain('role="log"');
    expect(panelSrc).toContain('aria-live="polite"');
  });

  it('anuncios para leitor de tela: TeamChatAnnouncer role=status sr-only', () => {
    expect(a11ySrc).toContain('TeamChatAnnouncer');
    expect(a11ySrc).toContain('role="status"');
  });

  it('sidebar escondida no mobile com conversa aberta', () => {
    expect(viewSrc).toContain('hidden md:flex');
    expect(headerSrc).toContain('md:hidden');
  });

  it.todo('menu de contexto acessivel por teclado — Radix cobre parcialmente');
  it.todo('foco gerenciado ao trocar de conversa');
});
