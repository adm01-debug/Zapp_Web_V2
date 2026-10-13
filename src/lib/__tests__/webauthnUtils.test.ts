import { describe, it, expect } from 'vitest';
import {
  base64URLToBuffer,
  bufferToBase64URL,
} from '@/lib/webauthnUtils';

// ── helpers ────────────────────────────────────────────────────────────────────

function bytesFromString(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function buffersEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  if (ua.length !== ub.length) return false;
  for (let i = 0; i < ua.length; i++) {
    if (ua[i] !== ub[i]) return false;
  }
  return true;
}

// ── base64URLToBuffer ──────────────────────────────────────────────────────────

describe('base64URLToBuffer', () => {
  it('decodes a simple ASCII string encoded as base64url', () => {
    // "hello" in base64 is "aGVsbG8="  →  base64url is "aGVsbG8"
    const buf = base64URLToBuffer('aGVsbG8');
    const bytes = new Uint8Array(buf);
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe('hello');
  });

  it('returns an ArrayBuffer', () => {
    const result = base64URLToBuffer('aGVsbG8');
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it('handles standard base64url - replacement (- → +)', () => {
    // "foo" in base64 is "Zm9v"
    const buf = base64URLToBuffer('Zm9v');
    const decoded = new TextDecoder().decode(new Uint8Array(buf));
    expect(decoded).toBe('foo');
  });

  it('handles standard base64url _ replacement (_ → /)', () => {
    // base64url "dGVzdA" = "test"
    const buf = base64URLToBuffer('dGVzdA');
    const decoded = new TextDecoder().decode(new Uint8Array(buf));
    expect(decoded).toBe('test');
  });

  it('handles a payload whose base64url uses both - and _', () => {
    // 0xFB 0xFF → standard base64 "+/8=" → base64url "-_8"
    const buf = base64URLToBuffer('-_8');
    expect(Array.from(new Uint8Array(buf))).toEqual([0xfb, 0xff]);
  });

  it('handles padding correctly when length mod 4 = 2', () => {
    // "a" in base64 → "YQ==" → base64url without padding → "YQ"
    const buf = base64URLToBuffer('YQ');
    const decoded = new TextDecoder().decode(new Uint8Array(buf));
    expect(decoded).toBe('a');
  });

  it('handles padding correctly when length mod 4 = 3', () => {
    // "ab" → "YWI=" → base64url "YWI"
    const buf = base64URLToBuffer('YWI');
    const decoded = new TextDecoder().decode(new Uint8Array(buf));
    expect(decoded).toBe('ab');
  });

  it('decodes longer strings correctly', () => {
    const original = 'WebAuthn is a W3C standard for secure authentication';
    const b64url = btoa(original).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const buf = base64URLToBuffer(b64url);
    const decoded = new TextDecoder().decode(new Uint8Array(buf));
    expect(decoded).toBe(original);
  });
});

// ── bufferToBase64URL ──────────────────────────────────────────────────────────

describe('bufferToBase64URL', () => {
  it('encodes a buffer to a base64url string', () => {
    const buf = bytesFromString('hello').buffer as ArrayBuffer;
    expect(bufferToBase64URL(buf)).toBe('aGVsbG8');
  });

  it('returns a string', () => {
    const buf = bytesFromString('test').buffer as ArrayBuffer;
    expect(typeof bufferToBase64URL(buf)).toBe('string');
  });

  it('output contains no + characters (replaced with -)', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const result = bufferToBase64URL(bytes.buffer as ArrayBuffer);
    expect(result).not.toContain('+');
  });

  it('output contains no / characters (replaced with _)', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const result = bufferToBase64URL(bytes.buffer as ArrayBuffer);
    expect(result).not.toContain('/');
  });

  it('output contains no = padding characters', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const result = bufferToBase64URL(bytes.buffer as ArrayBuffer);
    expect(result).not.toContain('=');
  });

  it('encodes empty buffer to empty string', () => {
    const buf = new Uint8Array(0).buffer as ArrayBuffer;
    expect(bufferToBase64URL(buf)).toBe('');
  });
});

// ── round-trip ────────────────────────────────────────────────────────────────

describe('base64URLToBuffer / bufferToBase64URL — round-trip', () => {
  it('bufferToBase64URL(base64URLToBuffer(x)) === x for a known base64url string', () => {
    const original = 'aGVsbG8'; // "hello"
    expect(bufferToBase64URL(base64URLToBuffer(original))).toBe(original);
  });

  it('base64URLToBuffer(bufferToBase64URL(buf)) produces the same bytes', () => {
    const text = 'Round-trip test for WebAuthn utils';
    const originalBuf = bytesFromString(text).buffer as ArrayBuffer;
    const encoded = bufferToBase64URL(originalBuf);
    const decoded = base64URLToBuffer(encoded);
    expect(buffersEqual(originalBuf as ArrayBuffer, decoded)).toBe(true);
  });

  it('round-trips a 32-byte random-like buffer', () => {
    const bytes = new Uint8Array([
      0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
      0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
      0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
      0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00,
    ]);
    const encoded = bufferToBase64URL(bytes.buffer as ArrayBuffer);
    const decoded = base64URLToBuffer(encoded);
    expect(buffersEqual(bytes.buffer as ArrayBuffer, decoded)).toBe(true);
  });

  it('round-trips all 256 byte values', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const encoded = bufferToBase64URL(bytes.buffer as ArrayBuffer);
    const decoded = base64URLToBuffer(encoded);
    expect(buffersEqual(bytes.buffer as ArrayBuffer, decoded)).toBe(true);
  });
});
