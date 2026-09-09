import { describe, it, expect } from 'vitest';
import {
  snapToSpacing,
  pxToUtility,
  closestColor,
  colorToUtility,
  snapBorderRadius,
  snapFontSize,
  snapFontWeight,
  snapShadow,
  snapTransition,
  quantizeDeclaration,
} from '../src/engine/tailwind-quantizer';

describe('snapToSpacing', () => {
  it('snaps exact values to their scale key', () => {
    expect(snapToSpacing(0)).toBe('0');
    expect(snapToSpacing(4)).toBe('1');
    expect(snapToSpacing(16)).toBe('4');
    expect(snapToSpacing(384)).toBe('96');
  });

  it('snaps sub-pixel values within tolerance', () => {
    // 5.5px is 0.5px from the 6px (key 1.5) step.
    expect(snapToSpacing(5.5)).toBe('1.5');
    // 15.2px is 0.8px from the 16px (key 4) step.
    expect(snapToSpacing(15.2)).toBe('4');
  });

  it('returns "" for values outside tolerance', () => {
    // 18px is 2px from both 16px (key 4) and 20px (key 5), beyond 1.5px tolerance.
    expect(snapToSpacing(18)).toBe('');
  });

  it('rejects negative and non-finite values', () => {
    expect(snapToSpacing(-4)).toBe('');
    expect(snapToSpacing(Number.NaN)).toBe('');
    expect(snapToSpacing(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('pxToUtility', () => {
  it('maps margin/padding/gap to their utilities', () => {
    expect(pxToUtility('marginLeft', 16)).toBe('ml-4');
    expect(pxToUtility('padding', 8)).toBe('p-2');
    expect(pxToUtility('gap', 12)).toBe('gap-3');
    expect(pxToUtility('paddingLeft', 24)).toBe('pl-6');
    expect(pxToUtility('marginX', 16)).toBe('mx-4');
  });

  it('maps width/height', () => {
    expect(pxToUtility('width', 384)).toBe('w-96');
    expect(pxToUtility('height', 96)).toBe('h-24');
    expect(pxToUtility('minWidth', 8)).toBe('min-w-2');
  });

  it('maps border widths', () => {
    expect(pxToUtility('borderWidth', 0)).toBe('border-0');
    expect(pxToUtility('borderWidth', 1)).toBe('border');
    expect(pxToUtility('borderWidth', 2)).toBe('border-2');
    expect(pxToUtility('borderWidth', 4)).toBe('border-4');
    expect(pxToUtility('borderTopWidth', 2)).toBe('border-t-2');
  });

  it('routes border-radius through snapBorderRadius', () => {
    expect(pxToUtility('borderRadius', 8)).toBe('rounded-lg');
    expect(pxToUtility('borderRadius', 4)).toBe('rounded');
  });

  it('returns null for unsnappable lengths', () => {
    expect(pxToUtility('width', 18)).toBeNull();
    expect(pxToUtility('marginTop', 18)).toBeNull();
  });
});

describe('closestColor', () => {
  it('finds exact palette matches', () => {
    const blue600 = closestColor([37, 99, 235]); // #2563eb
    expect(blue600.name).toBe('blue-600');
    expect(blue600.distance).toBe(0);

    const gray500 = closestColor([107, 114, 128]); // #6b7280
    expect(gray500.name).toBe('gray-500');
    expect(gray500.distance).toBe(0);
  });

  it('returns the nearest token for near colors', () => {
    const nearBlue = closestColor([36, 99, 235]);
    expect(nearBlue.name).toBe('blue-600');
  });
});

describe('colorToUtility', () => {
  it('maps rgb to bg/text/border utilities', () => {
    expect(colorToUtility('bg', [37, 99, 235])).toBe('bg-blue-600');
    expect(colorToUtility('text', [24, 24, 27])).toBe('text-zinc-900');
    expect(colorToUtility('border', [220, 38, 38])).toBe('border-red-600');
  });

  it('maps transparency to transparent utility', () => {
    expect(colorToUtility('bg', [0, 0, 0], 0)).toBe('bg-transparent');
    expect(colorToUtility('text', [0, 0, 0], 0)).toBe('text-transparent');
  });
});

describe('snapBorderRadius', () => {
  it('snaps to known radius steps', () => {
    expect(snapBorderRadius(0)).toBe('rounded-none');
    expect(snapBorderRadius(2)).toBe('rounded-sm');
    expect(snapBorderRadius(4)).toBe('rounded');
    expect(snapBorderRadius(6)).toBe('rounded-md');
    expect(snapBorderRadius(8)).toBe('rounded-lg');
    expect(snapBorderRadius(12)).toBe('rounded-xl');
    expect(snapBorderRadius(16)).toBe('rounded-2xl');
    expect(snapBorderRadius(24)).toBe('rounded-3xl');
  });

  it('returns rounded-full for pill radii', () => {
    expect(snapBorderRadius(10000)).toBe('rounded-full');
  });

  it('returns "" for unsnappable radii', () => {
    expect(snapBorderRadius(30)).toBe('');
  });
});

describe('snapFontSize', () => {
  it('snaps to known size steps', () => {
    expect(snapFontSize(12)).toBe('text-xs');
    expect(snapFontSize(14)).toBe('text-sm');
    expect(snapFontSize(16)).toBe('text-base');
    expect(snapFontSize(18)).toBe('text-lg');
    expect(snapFontSize(20)).toBe('text-xl');
    expect(snapFontSize(24)).toBe('text-2xl');
    expect(snapFontSize(128)).toBe('text-9xl');
  });

  it('returns "" for unsnappable sizes', () => {
    expect(snapFontSize(200)).toBe('');
  });
});

describe('snapFontWeight', () => {
  it('snaps to known weight steps', () => {
    expect(snapFontWeight(100)).toBe('font-thin');
    expect(snapFontWeight(300)).toBe('font-light');
    expect(snapFontWeight(400)).toBe('font-normal');
    expect(snapFontWeight(500)).toBe('font-medium');
    expect(snapFontWeight(700)).toBe('font-bold');
    expect(snapFontWeight(900)).toBe('font-black');
  });

  it('snaps within tolerance', () => {
    expect(snapFontWeight(650)).toBe('font-semibold');
  });
});

describe('snapShadow', () => {
  it('matches standard shadow layers', () => {
    expect(snapShadow('rgba(0,0,0,0.05) 0px 1px 2px 0px')).toBe('shadow-sm');
    expect(snapShadow('rgba(0,0,0,0.1) 0px 1px 3px 0px')).toBe('shadow');
    expect(snapShadow('rgba(0,0,0,0.1) 0px 4px 6px -1px')).toBe('shadow-md');
    expect(snapShadow('rgba(0,0,0,0.1) 0px 10px 15px -3px')).toBe('shadow-lg');
    expect(snapShadow('rgba(0,0,0,0.1) 0px 20px 25px -5px')).toBe('shadow-xl');
    expect(snapShadow('rgba(0,0,0,0.25) 0px 25px 50px -12px')).toBe(
      'shadow-2xl',
    );
  });

  it('returns null for none/inset/complex/multi-layer shadows', () => {
    expect(snapShadow('none')).toBeNull();
    expect(snapShadow('inset 0 1px 2px 0 #000')).toBeNull();
    expect(snapShadow('3px 5px 7px 0 #000')).toBeNull();
    expect(snapShadow('')).toBeNull();
    expect(
      snapShadow(
        'rgba(0,0,0,0.1) 0px 1px 3px 0px, rgba(0,0,0,0.1) 0px 1px 2px 0px',
      ),
    ).toBeNull();
  });
});

describe('snapTransition', () => {
  it('builds a transition-* string', () => {
    expect(snapTransition('all', '0.3s', 'ease-in-out', '0s')).toBe(
      'transition-all duration-300 ease-in-out',
    );
  });

  it('distinguishes color transitions', () => {
    expect(snapTransition('color', '0.15s', 'ease-in', '0s')).toBe(
      'transition-colors duration-150 ease-in',
    );
  });

  it('returns null for none/zero durations', () => {
    expect(snapTransition('none', '0s', 'ease', '0s')).toBeNull();
    expect(snapTransition('all', '0s', 'ease', '0s')).toBeNull();
    expect(snapTransition('', '0.3s', 'ease', '0s')).toBeNull();
  });
});

describe('quantizeDeclaration', () => {
  it('quantizes lengths', () => {
    const q = quantizeDeclaration('paddingLeft', '16px');
    expect(q.className).toBe('pl-4');
    expect(q.confidence).toBe('snapped');
  });

  it('quantizes colors', () => {
    const q = quantizeDeclaration('backgroundColor', 'rgb(37, 99, 235)');
    expect(q.className).toBe('bg-blue-600');
    expect(q.confidence).toBe('snapped');
  });

  it('maps transparency', () => {
    const q = quantizeDeclaration('color', 'transparent');
    expect(q.className).toBe('text-transparent');
    expect(q.confidence).toBe('exact');
  });

  it('skips unsnappable lengths', () => {
    const q = quantizeDeclaration('width', '18px');
    expect(q.className).toBe('');
    expect(q.confidence).toBe('skipped');
    expect(q.skipReason).toBeDefined();
  });

  it('skips background-image gradients', () => {
    const q = quantizeDeclaration(
      'backgroundImage',
      'linear-gradient(to right, #000, #fff)',
    );
    expect(q.confidence).toBe('skipped');
    expect(q.skipReason).toContain('background-image');
  });

  it('maps display and box-sizing exactly', () => {
    expect(quantizeDeclaration('display', 'flex').className).toBe('flex');
    expect(quantizeDeclaration('display', 'flex').confidence).toBe('exact');
    expect(quantizeDeclaration('boxSizing', 'border-box').className).toBe(
      'box-border',
    );
  });

  it('maps 50% radius to rounded-full', () => {
    const q = quantizeDeclaration('borderRadius', '50%');
    expect(q.className).toBe('rounded-full');
    expect(q.confidence).toBe('exact');
  });

  it('drops unmapped properties', () => {
    const q = quantizeDeclaration('zIndex', '999');
    expect(q.confidence).toBe('skipped');
  });
});
