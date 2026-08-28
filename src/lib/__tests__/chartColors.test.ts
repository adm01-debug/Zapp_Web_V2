import { describe, it, expect } from 'vitest';
import {
  CHART_COLORS,
  CHART_PALETTE,
  CHART_PALETTE_MINI,
  STATUS_PALETTE,
  SENTIMENT_PALETTE,
  CHART_GRADIENTS,
  CHART_STYLES,
  getChartColor,
  getChartColors,
  getChartColorWithOpacity,
  generateChartConfig,
  getGradientUrl,
} from '@/lib/chartColors';

describe('chartColors', () => {
  describe('CHART_COLORS', () => {
    it('has primary colors', () => {
      expect(CHART_COLORS.primary).toContain('hsl');
      expect(CHART_COLORS.secondary).toContain('hsl');
      expect(CHART_COLORS.tertiary).toContain('hsl');
    });

    it('has semantic colors', () => {
      expect(CHART_COLORS.success).toContain('hsl');
      expect(CHART_COLORS.warning).toContain('hsl');
      expect(CHART_COLORS.danger).toContain('hsl');
      expect(CHART_COLORS.info).toContain('hsl');
    });

    it('has status colors', () => {
      expect(CHART_COLORS.resolved).toBeTruthy();
      expect(CHART_COLORS.pending).toBeTruthy();
      expect(CHART_COLORS.waiting).toBeTruthy();
      expect(CHART_COLORS.open).toBeTruthy();
    });

    it('has sentiment colors', () => {
      expect(CHART_COLORS.positive).toBeTruthy();
      expect(CHART_COLORS.neutral).toBeTruthy();
      expect(CHART_COLORS.negative).toBeTruthy();
    });
  });

  describe('palettes', () => {
    it('CHART_PALETTE has 10 colors', () => {
      expect(CHART_PALETTE).toHaveLength(10);
    });

    it('CHART_PALETTE_MINI has 5 colors', () => {
      expect(CHART_PALETTE_MINI).toHaveLength(5);
    });

    it('STATUS_PALETTE has 4 colors', () => {
      expect(STATUS_PALETTE).toHaveLength(4);
    });

    it('SENTIMENT_PALETTE has 3 colors', () => {
      expect(SENTIMENT_PALETTE).toHaveLength(3);
    });

    it('all palette colors use hsl format', () => {
      CHART_PALETTE.forEach(c => expect(c).toContain('hsl'));
    });
  });

  describe('getChartColor', () => {
    it('returns first color for index 0', () => {
      expect(getChartColor(0)).toBe(CHART_PALETTE[0]);
    });

    it('wraps around for index > palette length', () => {
      expect(getChartColor(10)).toBe(CHART_PALETTE[0]);
      expect(getChartColor(11)).toBe(CHART_PALETTE[1]);
    });

    it('handles large indices', () => {
      expect(getChartColor(100)).toBe(CHART_PALETTE[0]);
    });
  });

  describe('getChartColors', () => {
    it('returns correct number of colors', () => {
      expect(getChartColors(3)).toHaveLength(3);
      expect(getChartColors(7)).toHaveLength(7);
    });

    it('wraps colors when count > palette', () => {
      const colors = getChartColors(12);
      expect(colors).toHaveLength(12);
      expect(colors[10]).toBe(colors[0]);
    });

    it('returns empty for 0', () => {
      expect(getChartColors(0)).toEqual([]);
    });
  });

  describe('getChartColorWithOpacity', () => {
    it('adds opacity to color string', () => {
      const result = getChartColorWithOpacity(0, 0.5);
      expect(result).toContain('0.5');
    });

    it('wraps index like getChartColor', () => {
      const a = getChartColorWithOpacity(0, 0.3);
      const b = getChartColorWithOpacity(10, 0.3);
      expect(a).toBe(b);
    });
  });

  describe('generateChartConfig', () => {
    it('creates config for given keys', () => {
      const config = generateChartConfig(['messages', 'contacts']);
      expect(config.messages).toBeDefined();
      expect(config.messages.label).toBe('messages');
      expect(config.messages.color).toBe(getChartColor(0));
      expect(config.contacts.color).toBe(getChartColor(1));
    });

    it('uses custom labels', () => {
      const config = generateChartConfig(['msg'], { msg: 'Mensagens' });
      expect(config.msg.label).toBe('Mensagens');
    });

    it('defaults label to key when no labels', () => {
      const config = generateChartConfig(['test']);
      expect(config.test.label).toBe('test');
    });
  });

  describe('CHART_GRADIENTS', () => {
    it('has gradient definitions', () => {
      expect(CHART_GRADIENTS.primary.id).toBe('chartGradientPrimary');
      expect(CHART_GRADIENTS.primary.colors).toHaveLength(2);
    });

    it('getGradientUrl returns url reference', () => {
      expect(getGradientUrl('primary')).toBe('url(#chartGradientPrimary)');
      expect(getGradientUrl('success')).toBe('url(#chartGradientSuccess)');
    });
  });

  describe('CHART_STYLES', () => {
    it('has axis config', () => {
      expect(CHART_STYLES.axis.tickLine).toBe(false);
      expect(CHART_STYLES.axis.axisLine).toBe(false);
      expect(CHART_STYLES.axis.fontSize).toBe(12);
    });

    it('has grid config', () => {
      expect(CHART_STYLES.grid.strokeDasharray).toBe('3 3');
      expect(CHART_STYLES.grid.vertical).toBe(false);
    });

    it('has tooltip config', () => {
      expect(CHART_STYLES.tooltip.contentStyle).toBeDefined();
    });

    it('has legend config', () => {
      expect(CHART_STYLES.legend.verticalAlign).toBe('bottom');
      expect(CHART_STYLES.legend.iconType).toBe('circle');
    });
  });
});
