import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatSearch } from '../chat/useChatSearch';
import { Message } from '@/types/chat';

const makeMockMessage = (overrides: Partial<Message> = {}): Message => ({
  id: crypto.randomUUID(),
  conversationId: 'conv-1',
  content: 'mensagem padrão',
  sender: 'contact' as const,
  senderName: 'João',
  timestamp: new Date('2026-04-08T10:00:00'),
  type: 'text',
  status: 'delivered',
  is_deleted: false,
  ...overrides,
} as Message);

const buildMessages = (): Message[] => [
  makeMockMessage({ id: 'm1', content: 'Olá, tudo bem?', type: 'text' }),
  makeMockMessage({ id: 'm2', content: 'Segue a foto da bolsa', type: 'image', mediaUrl: 'https://example.com/bolsa.jpg' }),
  makeMockMessage({ id: 'm3', content: 'Veja o vídeo do produto', type: 'video' }),
  makeMockMessage({ id: 'm4', content: 'Áudio explicativo', type: 'audio', transcription: 'bolsa de couro marrom' }),
  makeMockMessage({ id: 'm5', content: 'Contrato em PDF', type: 'document' }),
  makeMockMessage({ id: 'm6', content: 'Acesse https://loja.com/bolsas para ver mais', type: 'text' }),
  makeMockMessage({ id: 'm7', content: 'Mensagem deletada', type: 'text', is_deleted: true }),
  makeMockMessage({ id: 'm8', content: 'Café com açúcar', type: 'text' }),
];

describe('useChatSearch', () => {
  const onHighlightChange = vi.fn();
  const onNavigateToMessage = vi.fn();
  const onSearchQueryChange = vi.fn();

  const defaultOpts = {
    messages: buildMessages(),
    isOpen: true,
    onHighlightChange,
    onNavigateToMessage,
    onSearchQueryChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('returns empty results initially', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));
    expect(result.current.results).toEqual([]);
    expect(result.current.query).toBe('');
    expect(result.current.filter).toBe('all');
  });

  it('searches text content after debounce', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));

    act(() => result.current.setQuery('bolsa'));
    act(() => vi.advanceTimersByTime(250));

    expect(result.current.results.length).toBeGreaterThanOrEqual(2);
    const ids = result.current.results.map(r => r.id);
    expect(ids).toContain('m2');
    expect(ids).toContain('m4');
  });

  it('excludes deleted messages', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));

    act(() => result.current.setQuery('deletada'));
    act(() => vi.advanceTimersByTime(250));

    expect(result.current.results).toHaveLength(0);
  });

  it('performs accent-insensitive search', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));

    act(() => result.current.setQuery('acucar'));
    act(() => vi.advanceTimersByTime(250));

    expect(result.current.results.length).toBe(1);
    expect(result.current.results[0].id).toBe('m8');
  });

  it('filters by type: image', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));

    act(() => result.current.setFilter('image'));

    expect(result.current.results.length).toBe(1);
    expect(result.current.results[0].id).toBe('m2');
  });

  it('filters by type: video', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));
    act(() => result.current.setFilter('video'));
    expect(result.current.results.length).toBe(1);
    expect(result.current.results[0].id).toBe('m3');
  });

  it('filters by type: audio', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));
    act(() => result.current.setFilter('audio'));
    expect(result.current.results.length).toBe(1);
    expect(result.current.results[0].id).toBe('m4');
  });

  it('filters by type: document', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));
    act(() => result.current.setFilter('document'));
    expect(result.current.results.length).toBe(1);
    expect(result.current.results[0].id).toBe('m5');
  });

  it('filters by type: link', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));
    act(() => result.current.setFilter('link'));
    expect(result.current.results.length).toBe(1);
    expect(result.current.results[0].id).toBe('m6');
  });

  it('combines text search + filter', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));

    act(() => {
      result.current.setQuery('bolsa');
      result.current.setFilter('image');
    });
    act(() => vi.advanceTimersByTime(250));

    expect(result.current.results.length).toBe(1);
    expect(result.current.results[0].id).toBe('m2');
  });

  it('navigateDown cycles through results', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));

    act(() => result.current.setQuery('bolsa'));
    act(() => vi.advanceTimersByTime(250));

    const total = result.current.results.length;
    expect(result.current.activeIndex).toBe(0);

    act(() => result.current.navigateDown());
    expect(result.current.activeIndex).toBe(1);

    // Wrap around
    for (let i = 1; i < total; i++) {
      act(() => result.current.navigateDown());
    }
    expect(result.current.activeIndex).toBe(0);
  });

  it('navigateUp wraps to last result from first', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));

    act(() => result.current.setQuery('bolsa'));
    act(() => vi.advanceTimersByTime(250));

    const total = result.current.results.length;
    expect(result.current.activeIndex).toBe(0);

    act(() => result.current.navigateUp());
    expect(result.current.activeIndex).toBe(total - 1);
  });

  it('resets state on close', () => {
    const { result, rerender } = renderHook(
      (props) => useChatSearch(props),
      { initialProps: defaultOpts }
    );

    act(() => result.current.setQuery('bolsa'));
    act(() => vi.advanceTimersByTime(250));
    expect(result.current.results.length).toBeGreaterThan(0);

    rerender({ ...defaultOpts, isOpen: false });

    expect(result.current.query).toBe('');
    expect(result.current.filter).toBe('all');
    expect(result.current.activeIndex).toBe(0);
  });

  it('computes correct filterCounts', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));

    act(() => result.current.setQuery('bolsa'));
    act(() => vi.advanceTimersByTime(250));

    const counts = result.current.filterCounts;
    expect(counts.all).toBeGreaterThanOrEqual(2);
    expect(counts.image).toBeGreaterThanOrEqual(1);
    expect(counts.audio).toBeGreaterThanOrEqual(1);
  });

  it('calls onHighlightChange with matched IDs', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));

    act(() => result.current.setQuery('bolsa'));
    act(() => vi.advanceTimersByTime(250));

    expect(onHighlightChange).toHaveBeenCalled();
    const lastCall = onHighlightChange.mock.calls[onHighlightChange.mock.calls.length - 1];
    const highlightedSet: Set<string> = lastCall[0];
    expect(highlightedSet.has('m2')).toBe(true);
  });

  it('calls onNavigateToMessage on active index change', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));

    act(() => result.current.setQuery('bolsa'));
    act(() => vi.advanceTimersByTime(250));

    act(() => result.current.navigateDown());

    expect(onNavigateToMessage).toHaveBeenCalled();
  });

  it('resets activeIndex when query changes', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));

    act(() => result.current.setQuery('bolsa'));
    act(() => vi.advanceTimersByTime(250));
    act(() => result.current.navigateDown());

    expect(result.current.activeIndex).toBe(1);

    act(() => result.current.setQuery('foto'));
    act(() => vi.advanceTimersByTime(250));

    expect(result.current.activeIndex).toBe(0);
  });

  it('searches through transcription field', () => {
    const { result } = renderHook(() => useChatSearch(defaultOpts));

    act(() => result.current.setQuery('couro marrom'));
    act(() => vi.advanceTimersByTime(250));

    expect(result.current.results.length).toBe(1);
    expect(result.current.results[0].id).toBe('m4');
  });

  it('handles empty messages array', () => {
    const { result } = renderHook(() => useChatSearch({ ...defaultOpts, messages: [] }));

    act(() => result.current.setQuery('teste'));
    act(() => vi.advanceTimersByTime(250));

    expect(result.current.results).toEqual([]);
    expect(result.current.filterCounts.all).toBe(0);
  });

  it('navigateDown does nothing with no results', () => {
    const { result } = renderHook(() => useChatSearch({ ...defaultOpts, messages: [] }));
    act(() => result.current.navigateDown());
    expect(result.current.activeIndex).toBe(0);
  });
});
