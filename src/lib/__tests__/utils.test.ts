import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn (classnames utility)', () => {
  it('merges simple classes', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('handles undefined and null', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end');
  });

  it('handles empty string', () => {
    expect(cn('')).toBe('');
  });

  it('merges tailwind classes correctly', () => {
    // tailwind-merge should deduplicate
    const result = cn('px-4 py-2', 'px-8');
    expect(result).toContain('px-8');
    expect(result).not.toContain('px-4');
  });

  it('handles arrays', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('handles objects with boolean values', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('handles complex tailwind conflicts', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
  });

  it('preserves non-conflicting classes', () => {
    const result = cn('font-bold text-sm', 'text-lg');
    expect(result).toContain('font-bold');
    expect(result).toContain('text-lg');
    expect(result).not.toContain('text-sm');
  });

  it('handles no arguments', () => {
    expect(cn()).toBe('');
  });
});
