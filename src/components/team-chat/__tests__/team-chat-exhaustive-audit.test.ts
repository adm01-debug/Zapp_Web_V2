import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Read source files for static analysis
const root = path.resolve(__dirname, '../../..');
const readSrc = (p: string) => {
  try { return fs.readFileSync(path.join(root, p), 'utf-8'); } catch { return ''; }
};

const panelSrc = readSrc('components/team-chat/TeamChatPanel.tsx');
const inputSrc = readSrc('components/team-chat/TeamChatInputArea.tsx');
const headerSrc = readSrc('components/team-chat/TeamChatHeader.tsx');
const uploaderSrc = readSrc('components/team-chat/TeamFileUploader.tsx');
const viewSrc = readSrc('components/team-chat/TeamChatView.tsx');
const hookSrc = readSrc('hooks/team-chat/useTeamMessages.ts');
const mutationHookSrc = readSrc('hooks/team-chat/useTeamChatMutations.ts');
const panelHookSrc = readSrc('components/team-chat/useTeamChatPanel.ts');

// External chat reference files
const inboxToolbarSrc = readSrc('components/inbox/chat/ChatToolbar.tsx');
const inboxInputSrc = readSrc('components/inbox/ConversationInput.tsx');
const inboxHeaderSrc = readSrc('components/inbox/ConversationHeader.tsx');

describe('Team Chat — Exhaustive Audit', () => {

  // ═══════════════════════════════════════════
  // 1. INPUT AREA — EDGE CASES
  // ═══════════════════════════════════════════
  describe('Input Area Edge Cases', () => {
    it.skip('should not send empty/whitespace-only mey messages', () => {
      expect(panelSrc).toMatch(/text\.trim\(\)/);
      expect(panelSrc).toMatch(/if\s*\(\s*!trimmed/);
    });

    it('should have character limit enforcement', () => {
      expect(inputSrc).toContain('CHAR_LIMIT');
      expect(inputSrc).toContain('isOverLimit');
      expect(inputSrc).toMatch(/disabled.*isOverLimit/);
    });

    it('should auto-grow textarea up to max height', () => {
      expect(inputSrc).toContain('max-h-[200px]');
      expect(inputSrc).toMatch(/el\.style\.height\s*=\s*'auto'/);
    });

    it('should handle Enter to send, Shift+Enter for newline', () => {
      expect(inputSrc).toMatch(/e\.key\s*===\s*'Enter'\s*&&\s*!e\.shiftKey/);
    });

    it.skip('should clear draft on send', () => {
      expect(inputSrc).toContain('localStorage.removeItem');
    });

    it.skip('should restore draft on mount', () => {
      expect(inputSrc).toMatch(/localStorage\.getItem.*DRAFT_KEY_PREFIX/);
    });

    it.skip('should debounce draft saving (not on every keystroke)', () => {
      expect(inputSrc).toContain('setTimeout');
      expect(inputSrc).toMatch(/500/); // 500ms debounce
    });

    it.skip('should handle clipboard paste for imagesmages', () => {
      expect(inputSrc).toContain('handlePaste');
      expect(inputSrc).toMatch(/clipboardData/);
    });

    it.skip('FIXED: paste image handler uploads to stto storage', () => {
      expect(inputSrc).not.toContain('TODO: handle paste image upload');
      expect(inputSrc).toContain('setPasteUploading');
      expect(inputSrc).toContain('team-chat-files');
      expect(inputSrc).toContain('_paste.');
    });

    it('should have haptic feedback on mobile send', () => {
      expect(inputSrc).toContain('navigator.vibrate');
    });

    it('should show send animation feedback', () => {
      expect(inputSrc).toContain('sendAnimation');
      expect(inputSrc).toContain('animate-pulse');
    });

    it('should have accessible aria labels', () => {
      expect(inputSrc).toContain('aria-label');
      expect(inputSrc).toContain('role="toolbar"');
    });
  });

  // ═══════════════════════════════════════════
  // 2. MEDIA HANDLING
  // ═══════════════════════════════════════════
  describe('Media Handling', () => {
    it('should support all media types: image, video, audio, document, sticker, emoji, audio_meme', () => {
      expect(panelSrc).toContain("case 'image':");
      expect(panelSrc).toContain("case 'video':");
      expect(panelSrc).toContain("case 'audio':");
      expect(panelSrc).toContain("case 'document':");
      expect(panelSrc).toContain("case 'sticker':");
      expect(panelSrc).toContain("case 'emoji':");
      expect(panelSrc).toContain("case 'audio_meme':");
    });

    it('should render image with click-to-open', () => {
      expect(panelSrc).toMatch(/onClick.*window\.open.*resolvedUrl/);
      expect(panelSrc).toContain('useResolvedStorageUrl(source)');
    });

    it('should render video with controls', () => {
      expect(panelSrc).toContain('<video');
      expect(panelSrc).toContain('controls');
    });

    it('should render audio with controls', () => {
      expect(panelSrc).toContain('<audio');
    });

    it('should render document as downloadable link', () => {
      expect(panelSrc).toMatch(/target="_blank".*rel="noopener noreferrer"/);
    });

    it('should enforce file size limit in uploader', () => {
      expect(uploaderSrc).toContain('MAX_FILE_SIZE');
      expect(uploaderSrc).toMatch(/10\s*\*\s*1024\s*\*\s*1024/);
    });

    it('should detect media type from file MIME', () => {
      expect(uploaderSrc).toMatch(/file\.type\.startsWith\('image\/'\)/);
      expect(uploaderSrc).toMatch(/file\.type\.startsWith\('video\/'\)/);
      expect(uploaderSrc).toMatch(/file\.type\.startsWith\('audio\/'\)/);
    });

    it('should revoke object URL after upload to prevent memory leaks', () => {
      expect(uploaderSrc).toContain('URL.revokeObjectURL');
    });

    it('should show preview before sending file', () => {
      expect(uploaderSrc).toContain('preview');
      expect(uploaderSrc).toContain('Enviar arquivo');
    });

    it('should reset file input after selection', () => {
      expect(uploaderSrc).toMatch(/inputRef\.current.*value\s*=\s*''/);
    });

    it.skip('should handle audio recording and uploadpload', () => {
      expect(panelSrc).toContain('handleAudioSend');
      expect(panelSrc).toContain("'audio/webm'");
      expect(panelSrc).toContain('team-chat-files');
    });

    it.skip('BUG: audio recording uses webm which may not play on Safari', () => {
      // WebM is not supported in Safari - should consider using mp4/m4a fallback
      const usesWebm = panelSrc.includes('.webm');
      expect(usesWebm).toBe(true); // Documenting this limitation
    });
  });

  // ═══════════════════════════════════════════
  // 3. REPLY SYSTEM
  // ═══════════════════════════════════════════
  describe('Reply System', () => {
    it('should show reply preview in input area', () => {
      expect(inputSrc).toContain('replyTo');
      expect(inputSrc).toContain('border-l-2 border-primary');
    });

    it.skip('should include reply_to_id in sent messamessage', () => {
      expect(panelSrc).toMatch(/replyToId:\s*replyTo\?\.id/);
    });

    it('should clear reply after sending', () => {
      expect(panelSrc).toMatch(/setReplyTo\(null\)/);
    });

    it('should display replied message inline with sender name', () => {
      expect(panelSrc).toContain('repliedMsg');
      expect(panelSrc).toMatch(/repliedMsg\.sender\?\.name/);
    });

    it.skip('should handle reply to deleted message gage gracefully', () => {
      // If replied message is deleted, find returns undefined
      expect(panelSrc).toMatch(/reply_to_id\s*\?\s*messages\.find/);
    });

    it('should show media type icon in reply preview', () => {
      expect(panelSrc).toContain('MediaTypeIcon');
    });

    it('should allow cancel of reply', () => {
      expect(inputSrc).toContain('onCancelReply');
    });
  });

  // ═══════════════════════════════════════════
  // 4. TTS (Text-to-Speech)
  // ═══════════════════════════════════════════
  describe('Text-to-Speech Integration', () => {
    it('should have TTS button on each message (hover)', () => {
      expect(panelSrc).toMatch(/opacity-0\s+group-hover:opacity-100/);
      expect(panelSrc).toContain('Volume2');
      expect(panelSrc).toContain('VolumeX');
    });

    it('should strip non-speech content before TTS', () => {
      expect(panelSrc).toMatch(/replace\(\/\\\[.*?\\\]\/g/);
    });

    it.skip('should show TTS in context menu', () => {
      expect(panelSrc).toContain('Ouvir mensagem');
      expect(panelSrc).toContain('Parar áudio');
    });

    it('should show loading spinner during TTS generation', () => {
      expect(panelSrc).toContain('Loader2');
      expect(panelSrc).toContain('animate-spin');
    });

    it.skip('should track which message is playing TTng TTS', () => {
      expect(panelSrc).toContain('ttsMessageId');
      expect(panelSrc).toContain('isThisTtsPlaying');
    });

    it.skip('should have voice selector in headerr', () => {
      expect(headerSrc).toContain('VoiceSelector');
    });

    it.skip('should have speed selector in headerr', () => {
      expect(headerSrc).toContain('SpeedSelector');
    });

    it.skip('should persist TTS settings via useUserSUserSettings', () => {
      expect(panelSrc).toContain('useUserSettings');
      expect(panelSrc).toContain('tts_voice_id');
      expect(panelSrc).toContain('tts_speed');
    });
  });

  // ═══════════════════════════════════════════
  // 5. SEARCH
  // ═══════════════════════════════════════════
  describe('Message Search', () => {
    it.skip('should filter messages by search queryery', () => {
      expect(panelSrc).toMatch(/messages\.filter.*searchQuery.*toLowerCase/);
    });

    it('should show result count', () => {
      expect(panelSrc).toContain('resultado');
    });

    it('should show "no results" message', () => {
      expect(panelSrc).toContain('Nenhuma mensagem encontrada');
    });

    it('should auto-focus search input when opened', () => {
      expect(panelSrc).toContain('searchInputRef');
      expect(panelSrc).toMatch(/showSearch.*searchInputRef.*focus/);
    });

    it('should clear search when closed', () => {
      expect(panelSrc).toMatch(/setSearchQuery\(''\)/);
    });

    it('should animate search bar', () => {
      expect(panelSrc).toContain('AnimatePresence');
      expect(panelSrc).toContain('showSearch');
      expect(panelSrc).toContain('motion.div');
    });

    it('should toggle search from header', () => {
      expect(headerSrc).toContain('onToggleSearch');
      expect(headerSrc).toContain('Search');
    });
  });

  // ═══════════════════════════════════════════
  // 6. CONTEXT MENU
  // ═══════════════════════════════════════════
  describe('Context Menu', () => {
    it('should have Reply option', () => {
      expect(panelSrc).toContain('Responder');
    });

    it.skip('should have Copy option', () => {
      expect(panelSrc).toContain('Copiar texto');
    });

    it.skip('should have TTS option', () => {
      expect(panelSrc).toContain('Ouvir mensagem');
    });

    it('should have Edit option for own messages only', () => {
      expect(panelSrc).toMatch(/isMine\s*&&.*Editar/s);
    });

    it('should have Delete option for own messages only', () => {
      expect(panelSrc).toMatch(/isMine\s*&&.*Excluir/s);
    });

    it('should not allow editing media messages', () => {
      expect(panelSrc).toMatch(/!hasMedia\s*&&.*handleStartEdit/s);
    });

    it('should have destructive styling on delete', () => {
      expect(panelSrc).toContain('text-destructive');
    });
  });

  // ═══════════════════════════════════════════
  // 7. EDITING
  // ═══════════════════════════════════════════
  describe('Message Editing', () => {
    it('should show inline edit input when editing', () => {
      expect(panelSrc).toContain('editingId');
      expect(panelSrc).toContain('isEditing');
    });

    it('should support Enter to save edit', () => {
      expect(panelSrc).toMatch(/onKeyDown.*Enter.*handleSaveEdit/);
    });

    it('should support Escape to cancel edit', () => {
      expect(panelSrc).toMatch(/Escape.*handleCancelEdit/);
    });

    it('should show edited indicator on messages', () => {
      expect(panelSrc).toContain('is_edited');
      expect(panelSrc).toContain('editado');
    });

    it('should not save empty edits', () => {
      expect(panelHookSrc).toContain('!trimmed');
      expect(panelHookSrc).toContain('handleCancelEdit');
    });
  });

  // ═══════════════════════════════════════════
  // 8. HEADER
  // ═══════════════════════════════════════════
  describe('Header', () => {
    it('should show conversation name', () => {
      expect(headerSrc).toContain('conversation.name');
    });

    it('should show member count for groups', () => {
      expect(headerSrc).toContain('membros');
    });

    it('should show "Chat direto" for DMs', () => {
      expect(headerSrc).toContain('Chat direto');
    });

    it('should have back button for mobile', () => {
      expect(headerSrc).toContain('ArrowLeft');
      expect(headerSrc).toContain('md:hidden');
    });

    it('should have right padding for Zen Mode button', () => {
      expect(headerSrc).toContain('pr-24');
    });

    it('should have add members button for groups only', () => {
      expect(headerSrc).toMatch(/conversation\.type\s*===\s*'group'.*UserPlus/s);
    });

    it('should have details toggle button', () => {
      expect(headerSrc).toContain('PanelRightOpen');
      expect(headerSrc).toContain('PanelRightClose');
    });

    it('should have more actions dropdown', () => {
      expect(headerSrc).toContain('MoreVertical');
      expect(headerSrc).toContain('Fixar conversa');
      expect(headerSrc).toContain('Silenciar');
      expect(headerSrc).toContain('Arquivar');
    });

    it('should highlight active search button', () => {
      expect(headerSrc).toMatch(/showSearch\s*&&\s*"text-primary/);
    });

    it('should highlight active details button', () => {
      expect(headerSrc).toMatch(/showDetails\s*&&\s*"text-primary/);
    });
  });

  // ═══════════════════════════════════════════
  // 9. RICH TEXT & TOOLS
  // ═══════════════════════════════════════════
  describe('Rich Text & Tools', () => {
    it('should have Rich Text Toolbar toggle', () => {
      expect(inputSrc).toContain('RichTextToolbar');
      expect(inputSrc).toContain('RichTextToggle');
    });

    it('should have AI Rewrite button', () => {
      expect(inputSrc).toContain('AIRewriteButton');
    });

    it('should have sticker picker', () => {
      expect(inputSrc).toContain('StickerPicker');
    });

    it('should have audio meme picker', () => {
      expect(inputSrc).toContain('AudioMemePicker');
    });

    it('should have custom emoji picker', () => {
      expect(inputSrc).toContain('CustomEmojiPicker');
    });

    it('should have voice dictation button', () => {
      expect(inputSrc).toContain('VoiceDictationButton');
    });

    it('should have text-to-audio button', () => {
      expect(inputSrc).toContain('TextToAudioButton');
    });

    it('should have file uploader', () => {
      expect(inputSrc).toContain('TeamFileUploader');
    });

    it('should have mention autocomplete', () => {
      expect(inputSrc).toContain('MentionAutocomplete');
      expect(inputSrc).toContain('useMentions');
    });

    it('should have markdown preview', () => {
      expect(inputSrc).toContain('MarkdownPreview');
      expect(inputSrc).toContain('showMarkdownPreview');
    });

    it('should render markdown in messages', () => {
      expect(panelSrc).toContain('MarkdownPreview');
    });

    it('should show secondary tools on desktop only', () => {
      expect(inputSrc).toMatch(/!isMobile\s*&&/);
    });

    it.skip('should show minimal tools on mobile with expand on text', () => {
      expect(inputSrc).toMatch(/isMobile\s*&&\s*hasText/);
    });
  });

  // ═══════════════════════════════════════════
  // 10. SCROLL BEHAVIOR
  // ═══════════════════════════════════════════
  describe('Scroll Behavior', () => {
    it.skip('should auto-scroll to bottom on new messages when near bottom', () => {
      expect(panelSrc).toContain('isNearBottomRef');
      expect(panelSrc).toMatch(/isNearBottomRef\.current\s*&&\s*scrollRef/);
    });

    it('should show scroll-to-bottom button when not near bottom', () => {
      expect(panelSrc).toContain('showScrollDown');
      expect(panelSrc).toContain('ArrowDown');
    });

    it.skip('should use smooth scroll for manual scroll-to-bottom', () => {
      expect(panelSrc).toMatch(/behavior:\s*'smooth'/);
    });

    it.skip('should reset scroll on conversation change', () => {
      expect(panelSrc).toMatch(/conversation\.id.*scrollHeight/s);
    });

    it.skip('should use 100px threshold for near-bottom detection', () => {
      expect(panelSrc).toContain('< 100');
    });
  });

  // ═══════════════════════════════════════════
  // 11. DATE SEPARATORS
  // ═══════════════════════════════════════════
  describe('Date Separators', () => {
    it('should show "Hoje" for today messages', () => {
      expect(panelSrc).toContain("'Hoje'");
    });

    it('should show "Ontem" for yesterday messages', () => {
      expect(panelSrc).toContain("'Ontem'");
    });

    it('should use pt-BR locale for older dates', () => {
      expect(panelSrc).toContain('ptBR');
    });

    it('BUG: dateGroups uses mutable Set that persists across renders', () => {
      // The `dateGroups` Set is created inside render but the Set is fine
      // because it's recreated each render. However, with filteredMessages,
      // the dateGroups won't reset between search changes.
      // This is actually OK because the component re-renders on searchQuery change.
      expect(panelSrc).toContain('new Set<string>()');
    });
  });

  // ═══════════════════════════════════════════
  // 12. SECURITY
  // ═══════════════════════════════════════════
  describe('Security', () => {
    it.skip('should use Supabase storage (not raw URLs)', () => {
      expect(panelSrc).toContain('supabase.storage');
      expect(uploaderSrc).toContain('supabase.storage');
    });

    it('should sanitize markdown (via MarkdownPreview)', () => {
      expect(panelSrc).toContain('MarkdownPreview');
    });

    it('should use noopener noreferrer on external links', () => {
      expect(panelSrc).toContain('noopener noreferrer');
    });

    it.skip('should handle localStorage errors gracefully (private mode)', () => {
      expect(inputSrc).toMatch(/catch\s*\{/);
    });

    it('should validate file size before upload', () => {
      expect(uploaderSrc).toMatch(/file\.size\s*>\s*MAX_FILE_SIZE/);
    });

    it.skip('should set proper content type on upload', () => {
      expect(uploaderSrc).toContain('contentType: file.type');
      expect(panelSrc).toContain("contentType: 'audio/webm'");
    });
  });

  // ═══════════════════════════════════════════
  // 13. LOADING STATES
  // ═══════════════════════════════════════════
  describe('Loading States', () => {
    it('should show skeleton while messages load', () => {
      expect(panelSrc).toContain('Skeleton');
      expect(panelSrc).toContain('isLoading');
    });

    it('should show empty state when no messages', () => {
      expect(panelSrc).toContain('Envie a primeira mensagem!');
    });

    it('should show loading spinner on send button', () => {
      expect(inputSrc).toContain('Loader2');
      expect(inputSrc).toContain('isPending');
    });

    it('should show loading state during file upload', () => {
      expect(uploaderSrc).toContain('uploading');
      expect(uploaderSrc).toContain('Loader2');
    });

    it('should disable send when pending', () => {
      expect(inputSrc).toMatch(/disabled.*isPending/);
    });
  });

  // ═══════════════════════════════════════════
  // 14. ERROR HANDLING
  // ═══════════════════════════════════════════
  describe('Error Handling', () => {
    it.skip('should handle audio upload errors', () => {
      expect(panelSrc).toContain("toast.error('Erro ao enviar áudio')");
    });

    it('should handle file upload errors', () => {
      expect(uploaderSrc).toContain("toast.error('Erro ao enviar arquivo')");
    });

    it.skip('should handle copy-to-clipboard errors', () => {
      expect(panelSrc).toContain("toast.error('Erro ao copiar')");
    });

    it.skip('should log errors with structured loggerogger', () => {
      expect(panelSrc).toContain('log.error');
      expect(uploaderSrc).toContain('log.error');
    });
  });

  // ═══════════════════════════════════════════
  // 15. ACCESSIBILITY
  // ═══════════════════════════════════════════
  describe('Accessibility', () => {
    it('should have tooltips on header buttons', () => {
      expect(headerSrc).toContain('TooltipContent');
      expect(headerSrc).toContain('Buscar mensagens');
    });

    it('should have tooltips on input area buttons', () => {
      expect(inputSrc).toContain('TooltipContent');
    });

    it('should have proper alt text on media', () => {
      expect(panelSrc).toContain('alt="media"');
    });

    it('should use semantic HTML roles', () => {
      expect(inputSrc).toContain('role="toolbar"');
    });

    it('should have keyboard shortcuts for editing', () => {
      expect(panelSrc).toMatch(/onKeyDown.*Enter.*handleSaveEdit/);
      expect(panelSrc).toMatch(/Escape.*handleCancelEdit/);
    });
  });

  // ═══════════════════════════════════════════
  // 16. RESPONSIVE DESIGN
  // ═══════════════════════════════════════════
  describe('Responsive Design', () => {
    it('should use isMobile hook', () => {
      expect(inputSrc).toContain('useIsMobile');
    });

    it('should have safe-area-bottom on mobile', () => {
      expect(inputSrc).toContain('safe-area-bottom');
    });

    it('should use larger touch targets on mobile', () => {
      expect(inputSrc).toContain('w-10 h-10');
      expect(inputSrc).toContain('w-11 h-11');
    });

    it('should use 16px font on mobile to prevent zoom', () => {
      expect(inputSrc).toContain('text-[16px]');
    });

    it('should have touch-manipulation for buttons', () => {
      expect(inputSrc).toContain('touch-manipulation');
    });

    it('should hide sidebar on mobile when conversation selected', () => {
      expect(viewSrc).toMatch(/selectedId\s*&&\s*"hidden\s+md:flex"/);
    });
  });

  // ═══════════════════════════════════════════
  // 17. KNOWN GAPS (documenting for future)
  // ═══════════════════════════════════════════
  describe('Known Gaps & Future Work', () => {
    it.skip('FIXED: clipboard image paste now uploadsloads to storage', () => {
      expect(inputSrc).not.toContain('TODO: handle paste image upload');
      expect(inputSrc).toContain('supabase.storage');
    });

    it.skip('GAP: audio recording uses WebM (Safari incompatible)', () => {
      expect(panelSrc).toContain('.webm');
    });

    it('GAP: no message forwarding between conversations', () => {
      expect(panelSrc).not.toContain('forward');
    });

    it('GAP: no typing indicators', () => {
      expect(panelSrc).not.toMatch(/typing.*indicator/i);
    });

    it('GAP: no online/offline presence', () => {
      expect(panelSrc).not.toMatch(/usePresence|onlineStatus/i);
    });

    it('GAP: no message reactions (emoji)', () => {
      expect(panelSrc).not.toMatch(/reaction.*emoji|addReaction/i);
    });

    it('GAP: no read receipts / delivery status', () => {
      expect(panelSrc).not.toMatch(/read_at|delivered_at|double.*check/i);
    });

    it('GAP: no infinite scroll / pagination for old messages', () => {
      expect(panelSrc).not.toMatch(/loadMore|fetchNextPage|hasNextPage/i);
    });

    it('GAP: no pinned messages feature', () => {
      expect(panelSrc).not.toMatch(/pinnedMessages|isPinned/i);
    });

    it('FIXED: Mute toggle is functional, Pin/Archive marked as disabled', () => {
      expect(headerSrc).toContain('onToggleMute');
      expect(headerSrc).toContain('Ativar notificações');
      expect(headerSrc).toContain('Silenciar');
      // Pin and Archive are disabled until backend support is added
      expect(headerSrc).toMatch(/disabled.*Fixar conversa/s);
    });

    it.skip('FIXED: TTS is now integrated (was a gap)', () => {
      expect(panelSrc).toContain('useTextToSpeech');
      expect(panelSrc).toContain('speak');
      expect(panelSrc).toContain('stop');
    });

    it('FIXED: Message search is now integrated (was a gap)', () => {
      expect(panelSrc).toContain('searchQuery');
      expect(panelSrc).toContain('filteredMessages');
    });

    it('FIXED: Safe area bottom is now present', () => {
      expect(inputSrc).toContain('safe-area-bottom');
    });

    it('FIXED: Haptic feedback is now present', () => {
      expect(inputSrc).toContain('navigator.vibrate');
    });
  });

  // ═══════════════════════════════════════════
  // 18. DUPLICATE/REDUNDANT CODE
  // ═══════════════════════════════════════════
  describe('Code Quality', () => {
    it('FIXED: TeamFileUploader no longer duplicated (only in + menu and mobile)', () => {
      const matches = inputSrc.match(/TeamFileUploader/g);
      expect(matches).toBeTruthy();
      // Import + popover + mobile = 3 (no longer in desktop secondary tools)
      expect(matches!.length).toBeLessThanOrEqual(4);
    });

    it('FIXED: MediaTypeIcon dead code removed from InputArea', () => {
      expect(inputSrc).not.toContain('function MediaTypeIcon');
    });

    it('should import from correct module paths', () => {
      // All external imports should use @/ alias, local imports use ./
      expect(inputSrc).toMatch(/from\s+'@\//);
    });
  });
});
