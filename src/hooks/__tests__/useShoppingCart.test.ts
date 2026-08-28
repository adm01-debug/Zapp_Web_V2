import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
  log: { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { useShoppingCart } from '@/hooks/business/useShoppingCart';

const mockProduct = (overrides = {}) => ({
  id: 'p1',
  name: 'Widget',
  price: 29.99,
  currency: 'BRL',
  stock_quantity: 10,
  is_active: true,
  sku: 'SKU-001',
  image_url: null,
  description: null,
  category: null,
  ...overrides,
});

describe('useShoppingCart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with empty cart', () => {
    const { result } = renderHook(() => useShoppingCart());
    expect(result.current.items).toEqual([]);
    expect(result.current.totalItems).toBe(0);
    expect(result.current.totalPrice).toBe(0);
  });

  it('addItem adds product to cart', () => {
    const { result } = renderHook(() => useShoppingCart());

    act(() => {
      result.current.addItem(mockProduct());
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(1);
    expect(result.current.totalItems).toBe(1);
    expect(result.current.totalPrice).toBeCloseTo(29.99);
  });

  it('addItem increments quantity for existing product', () => {
    const { result } = renderHook(() => useShoppingCart());
    const product = mockProduct();

    act(() => {
      result.current.addItem(product);
    });
    act(() => {
      result.current.addItem(product);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(2);
    expect(result.current.totalItems).toBe(2);
    expect(result.current.totalPrice).toBeCloseTo(59.98);
  });

  it('addItem respects stock_quantity limit', () => {
    const { result } = renderHook(() => useShoppingCart());
    const product = mockProduct({ stock_quantity: 2 });

    act(() => { result.current.addItem(product); });
    act(() => { result.current.addItem(product); });
    act(() => { result.current.addItem(product); }); // exceeds stock

    expect(result.current.items[0].quantity).toBe(2);
  });

  it('addItem handles multiple different products', () => {
    const { result } = renderHook(() => useShoppingCart());

    act(() => {
      result.current.addItem(mockProduct({ id: 'p1', price: 10 }));
      result.current.addItem(mockProduct({ id: 'p2', price: 20 }));
      result.current.addItem(mockProduct({ id: 'p3', price: 30 }));
    });

    expect(result.current.items).toHaveLength(3);
    expect(result.current.totalItems).toBe(3);
    expect(result.current.totalPrice).toBeCloseTo(60);
  });

  it('updateQuantity changes item quantity', () => {
    const { result } = renderHook(() => useShoppingCart());

    act(() => { result.current.addItem(mockProduct()); });
    act(() => { result.current.updateQuantity('p1', 5); });

    expect(result.current.items[0].quantity).toBe(5);
    expect(result.current.totalItems).toBe(5);
  });

  it('removeItem removes product from cart', () => {
    const { result } = renderHook(() => useShoppingCart());

    act(() => {
      result.current.addItem(mockProduct({ id: 'p1' }));
      result.current.addItem(mockProduct({ id: 'p2' }));
    });
    act(() => {
      result.current.removeItem('p1');
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].product.id).toBe('p2');
  });

  it('removeItem on non-existent product does nothing', () => {
    const { result } = renderHook(() => useShoppingCart());

    act(() => { result.current.addItem(mockProduct()); });
    act(() => { result.current.removeItem('nonexistent'); });

    expect(result.current.items).toHaveLength(1);
  });

  it('clearCart empties the cart', () => {
    const { result } = renderHook(() => useShoppingCart());

    act(() => {
      result.current.addItem(mockProduct({ id: 'p1' }));
      result.current.addItem(mockProduct({ id: 'p2' }));
    });
    act(() => {
      result.current.clearCart();
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.totalItems).toBe(0);
    expect(result.current.totalPrice).toBe(0);
  });

  it('totalPrice computes correctly with mixed quantities', () => {
    const { result } = renderHook(() => useShoppingCart());

    act(() => {
      result.current.addItem(mockProduct({ id: 'p1', price: 10 }));
      result.current.addItem(mockProduct({ id: 'p2', price: 25.50 }));
    });
    act(() => {
      result.current.updateQuantity('p1', 3);
    });

    expect(result.current.totalPrice).toBeCloseTo(55.50);
    expect(result.current.totalItems).toBe(4);
  });

  it('handles zero-price products', () => {
    const { result } = renderHook(() => useShoppingCart());

    act(() => {
      result.current.addItem(mockProduct({ price: 0 }));
    });

    expect(result.current.totalPrice).toBe(0);
    expect(result.current.totalItems).toBe(1);
  });
});
