import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ChatSearchBar } from '../ChatSearchBar';
import { Message } from '@/types/chat';

// Helper to create test messages
function makeMsg(overrides: Partial<Message> & { id: string }): Message {
  return {
    sender: 'contact',
    content: '',
    timestamp: new Date('2026-04-08T10:00:00Z'),
    status: 'delivered',
    type: 'text',
    ...overrides,
  } as Message;
}

const MESSAGES: Message[] = [
  makeMsg({ id: '1', content: 'Olá, bom dia!', type: 'text' }),
  makeMsg({ id: '2', content: 'Segue o documento solicitado', type: 'document', mediaUrl: 'https://example.com/doc.pdf' }),
  makeMsg({ id: '3', content: '', type: 'image', mediaUrl: 'https://example.com/photo.jpg' }),
  makeMsg({ id: '4', content: 'Confira este link: https://google.com/search?q=test', type: 'text' }),
  makeMsg({ id: '5', content: '', type: 'audio', mediaUrl: 'https://example.com/audio.ogg', transcription: 'Transcrição do áudio com palavra especial' }),
  makeMsg({ id: '6', content: 'Vídeo da reunião', type: 'video', mediaUrl: 'https://example.com/video.mp4' }),
  makeMsg({ id: '7', content: 'Mensagem com MAIÚSCULAS e acentuação café', type: 'text' }),
  makeMsg({ id: '8', content: '', type: 'text' }), // empty text message
  makeMsg({ id: '9', content: 'Olá novamente!', type: 'text' }),
  makeMsg({ id: '10', content: 'https://whatsapp.com/invite/abc123', type: 'text' }),
];

describe('ChatSearchBar', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onClose: any;
  let onNavigateToMessage: any;
  let onHighlightChange: any;

  beforeEach(() => {
    onClose = vi.fn();
    onNavigateToMessage = vi.fn();
    onHighlightChange = vi.fn();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderBar = (isOpen = true, msgs = MESSAGES) =>
    render(
      <ChatSearchBar
        messages={msgs}
        isOpen={isOpen}
        onClose={onClose}
        onNavigateToMessage={onNavigateToMessage}
        onHighlightChange={onHighlightChange}
      />
    );

  // ── Rendering ──

  it('renders nothing when closed', () => {
    renderBar(false);
    expect(screen.queryByPlaceholderText('Buscar na conversa...')).not.toBeInTheDocument();
  });

  it('renders input and filters when open', () => {
    renderBar(true);
    expect(screen.getByPlaceholderText('Buscar na conversa...')).toBeInTheDocument();
    expect(screen.getByText('Todos')).toBeInTheDocument();
    expect(screen.getByText('Textos')).toBeInTheDocument();
    expect(screen.getByText('Imagens')).toBeInTheDocument();
    expect(screen.getByText('Links')).toBeInTheDocument();
  });

  // ── Text search ──

  it('finds messages by text content', async () => {
    renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: 'Olá' } });
    
    await act(async () => { vi.advanceTimersByTime(250); });

    // Should have called onHighlightChange with ids 1 and 9
    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    const ids: Set<string> = lastCall[0];
    expect(ids.has('1')).toBe(true);
    expect(ids.has('9')).toBe(true);
    expect(ids.size).toBe(2);
  });

  it('search is case-insensitive', async () => {
    renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: 'maiúsculas' } });
    
    await act(async () => { vi.advanceTimersByTime(250); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    const ids: Set<string> = lastCall[0];
    expect(ids.has('7')).toBe(true);
  });

  it('searches in transcription field', async () => {
    renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: 'especial' } });
    
    await act(async () => { vi.advanceTimersByTime(250); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[0].has('5')).toBe(true);
  });

  it('returns no results for non-existent text', async () => {
    renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: 'xyznotfound123' } });
    
    await act(async () => { vi.advanceTimersByTime(250); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[0].size).toBe(0);
    expect(lastCall[1]).toBeNull();
  });

  // ── Filter by type ──

  it('filters by image type', async () => {
    renderBar();
    fireEvent.click(screen.getByText('Imagens'));
    
    await act(async () => { vi.advanceTimersByTime(250); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    const ids: Set<string> = lastCall[0];
    expect(ids.has('3')).toBe(true);
    expect(ids.size).toBe(1);
  });

  it('filters by document type', async () => {
    renderBar();
    fireEvent.click(screen.getByText('Documentos'));
    
    await act(async () => { vi.advanceTimersByTime(250); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[0].has('2')).toBe(true);
  });

  it('filters by link (URL in content)', async () => {
    renderBar();
    fireEvent.click(screen.getByText('Links'));
    
    await act(async () => { vi.advanceTimersByTime(250); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    const ids: Set<string> = lastCall[0];
    // Messages 4 and 10 have URLs in content
    expect(ids.has('4')).toBe(true);
    expect(ids.has('10')).toBe(true);
  });

  it('combines filter + text query', async () => {
    renderBar();
    fireEvent.click(screen.getByText('Textos'));
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: 'café' } });
    
    await act(async () => { vi.advanceTimersByTime(250); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[0].has('7')).toBe(true);
    expect(lastCall[0].size).toBe(1);
  });

  // ── Navigation ──

  it('navigates down through results', async () => {
    renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: 'Olá' } });
    await act(async () => { vi.advanceTimersByTime(250); });

    // Initial: activeIndex=0 → message '1'
    let lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe('1');

    // Press down arrow
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await act(async () => { vi.advanceTimersByTime(50); });

    lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe('9');
  });

  it('wraps around when navigating past last result', async () => {
    renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: 'Olá' } });
    await act(async () => { vi.advanceTimersByTime(250); });

    // Navigate down twice (2 results, should wrap to first)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await act(async () => { vi.advanceTimersByTime(50); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe('1');
  });

  it('wraps around when navigating up past first result', async () => {
    renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: 'Olá' } });
    await act(async () => { vi.advanceTimersByTime(250); });

    // Navigate up from index 0 should go to last
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    await act(async () => { vi.advanceTimersByTime(50); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe('9');
  });

  // ── Escape ──

  it('closes on Escape key', () => {
    renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // ── Edge cases ──

  it('handles empty messages array', async () => {
    renderBar(true, []);
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: 'test' } });
    await act(async () => { vi.advanceTimersByTime(250); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[0].size).toBe(0);
  });

  it('handles whitespace-only query', async () => {
    renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: '   ' } });
    await act(async () => { vi.advanceTimersByTime(250); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[0].size).toBe(0);
  });

  it('resets state when closed and reopened', async () => {
    const { rerender } = renderBar(true);
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: 'Olá' } });
    await act(async () => { vi.advanceTimersByTime(250); });

    // Close
    rerender(
      <ChatSearchBar messages={MESSAGES} isOpen={false} onClose={onClose} onNavigateToMessage={onNavigateToMessage} onHighlightChange={onHighlightChange} />
    );

    // Should have cleared highlights
    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[0].size).toBe(0);
    expect(lastCall[1]).toBeNull();
  });

  it('handles messages with null/undefined content gracefully', async () => {
    const msgs = [
      makeMsg({ id: 'n1', content: undefined as any, type: 'text' }),
      makeMsg({ id: 'n2', content: null as any, type: 'image' }),
      makeMsg({ id: 'n3', content: 'real content', type: 'text' }),
    ];
    renderBar(true, msgs);
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: 'real' } });
    await act(async () => { vi.advanceTimersByTime(250); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[0].has('n3')).toBe(true);
    expect(lastCall[0].size).toBe(1);
  });

  it('does not crash with special regex characters in query', async () => {
    renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: '(test).*+?' } });
    await act(async () => { vi.advanceTimersByTime(250); });
    // Should not throw - just find no results
    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[0].size).toBe(0);
  });

  it('debounces search - rapid typing only triggers final query', async () => {
    renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    
    // Type rapidly
    fireEvent.change(input, { target: { value: 'O' } });
    await act(async () => { vi.advanceTimersByTime(50); });
    fireEvent.change(input, { target: { value: 'Ol' } });
    await act(async () => { vi.advanceTimersByTime(50); });
    fireEvent.change(input, { target: { value: 'Olá novamente' } });
    
    // Wait for debounce
    await act(async () => { vi.advanceTimersByTime(250); });

    // Final result should match "Olá novamente" only
    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[0].has('9')).toBe(true);   // "Olá novamente!" matches
    expect(lastCall[0].has('1')).toBe(false);   // "Olá, bom dia!" doesn't match "Olá novamente"
  });

  it('audio filter shows only audio messages', async () => {
    renderBar();
    fireEvent.click(screen.getByText('Áudios'));
    await act(async () => { vi.advanceTimersByTime(250); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[0].has('5')).toBe(true);
    expect(lastCall[0].size).toBe(1);
  });

  it('video filter shows only video messages', async () => {
    renderBar();
    fireEvent.click(screen.getByText('Vídeos'));
    await act(async () => { vi.advanceTimersByTime(250); });

    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    expect(lastCall[0].has('6')).toBe(true);
    expect(lastCall[0].size).toBe(1);
  });

  it('switching filter resets activeIndex to 0', async () => {
    renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: 'Olá' } });
    await act(async () => { vi.advanceTimersByTime(250); });
    
    // Navigate to index 1
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await act(async () => { vi.advanceTimersByTime(50); });

    // Switch filter
    fireEvent.click(screen.getByText('Textos'));
    await act(async () => { vi.advanceTimersByTime(50); });

    // activeIndex should be reset to 0
    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    // The active ID should be the first result, not the second
    const activeId = lastCall[1];
    if (activeId) {
      const ids = Array.from(lastCall[0] as Set<string>);
      expect(activeId).toBe(ids[0] || null);
    }
  });
});
