import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { StrictMode } from 'react';
import { RealtimeClient } from '@supabase/realtime-js';

type Msg = { topic: string; event: string; payload: unknown; ref: string; join_ref?: string };
const sent: Msg[] = [];
let holdLeaves = true;
const heldLeaves: Msg[] = [];
let ws: FakeWS | null = null;
class FakeWS {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = 0; binaryType = 'arraybuffer';
  onopen: ((e: unknown) => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null;
  constructor(public url: string) { ws = this; setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 0); }
  send(data: string) {
    const m = JSON.parse(data) as Msg; sent.push(m);
    if (m.event === 'phx_join') this.reply(m, 'ok', { postgres_changes: undefined });
    else if (m.event === 'phx_leave') { if (holdLeaves) heldLeaves.push(m); else this.reply(m, 'ok', {}); }
    else if (m.event === 'heartbeat' || m.event === 'presence' || m.event === 'access_token') this.reply(m, 'ok', {});
  }
  reply(m: Msg, status: string, response: unknown) {
    setTimeout(() => this.onmessage?.({ data: JSON.stringify({ topic: m.topic, event: 'phx_reply', payload: { status, response }, ref: m.ref, join_ref: m.join_ref }) }), 5);
  }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
}
const rt = new RealtimeClient('ws://fake/realtime/v1', { transport: FakeWS as never, vsn: '1.0.0', params: { apikey: 'x' } });
const warn = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (t: string, o: never) => rt.channel(t, o),
    removeChannel: (c: never) => rt.removeChannel(c),
    getChannels: () => rt.getChannels(),
  },
}));
vi.mock('@/lib/logger', () => ({ log: { debug: vi.fn(), info: vi.fn(), warn: (...a: unknown[]) => warn(...a), error: vi.fn() } }));
import { useTypingPresence } from '@/hooks/chat/useTypingPresence';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const joined = (topic: string) => rt.getChannels().filter((c) => c.topic === `realtime:typing:${topic}`).map((c) => c.state);

describe('real realtime-js', () => {
  it('A -> B -> A rapid with leave ack held: A reopens and joins', async () => {
    const { rerender, unmount } = renderHook(({ id }) => useTypingPresence({ conversationId: id, currentUserId: 'u1' }), { initialProps: { id: 'A' } });
    await act(async () => { await wait(50); });
    expect(joined('A')).toEqual(['joined']);
    rerender({ id: 'B' });
    expect(joined('A')).toEqual(['leaving']);
    rerender({ id: 'A' });
    await act(async () => { await wait(50); });
    console.log('states A', joined('A'), 'B', joined('B'), 'leaves sent', sent.filter((m) => m.event === 'phx_leave').map((m) => m.topic));
    expect(joined('A')).toEqual(['joined']);
    expect(warn).not.toHaveBeenCalled();
    // typing works on the new channel
    const before = sent.length;
    unmount();
    holdLeaves = false;
    // release held
    heldLeaves.splice(0).forEach((m) => ws!.reply(m, 'ok', {}));
    await act(async () => { await wait(50); });
    console.log('after unmount', rt.getChannels().map((c) => [c.topic, c.state]), sent.slice(before).map((m) => m.event));
  });
  it('StrictMode double mount yields one joined channel and track works', async () => {
    holdLeaves = true;
    const wrapper = ({ children }: { children: React.ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result, unmount } = renderHook(() => useTypingPresence({ conversationId: 'S', currentUserId: 'u2' }), { wrapper });
    await act(async () => { await wait(60); });
    console.log('strict states', joined('S'));
    expect(joined('S')).toEqual(['joined']);
    const n = sent.length;
    await act(async () => { result.current.handleTypingStart(); await wait(20); });
    console.log('after typing', sent.slice(n).map((m) => [m.event, JSON.stringify(m.payload).slice(0, 80)]));
    expect(sent.slice(n).some((m) => m.event === 'presence')).toBe(true);
    unmount();
    await act(async () => { await wait(20); });
  });
  it('unmount while waiting old channel: opens nothing', async () => {
    holdLeaves = true;
    const a = renderHook(() => useTypingPresence({ conversationId: 'W', currentUserId: 'u3' }));
    await act(async () => { await wait(50); });
    a.unmount();
    expect(joined('W')).toEqual(['leaving']);
    const b = renderHook(() => useTypingPresence({ conversationId: 'W', currentUserId: 'u3' }));
    b.unmount();
    await act(async () => { await wait(50); });
    console.log('W states', joined('W'));
    expect(joined('W').filter((s) => s === 'joined' || s === 'joining')).toEqual([]);
  });
});
