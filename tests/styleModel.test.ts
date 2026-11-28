// @node: F12.12
import { describe, expect, it } from 'vitest';
import { mergeStyle, parseInlineStyle, serializeStyle } from '../src/edit/inlineStyle';
import { isSafeDeclaration, PROP_ORDER, SUGGESTION_DECLS } from '../src/edit/styleModel';

describe('style model (3B-1 recipe properties)', () => {
  it('the Edit pad properties and the suggestions are still safe', () => {
    for (const d of Object.values(SUGGESTION_DECLS)) expect(isSafeDeclaration(d)).toBe(true);
    expect(isSafeDeclaration({ prop: 'font-size', value: '14px' })).toBe(true);
    expect(isSafeDeclaration({ prop: 'color', value: '#112233' })).toBe(true);
    expect(isSafeDeclaration({ prop: 'width', value: 'url(x)' })).toBe(false);
    expect(isSafeDeclaration({ prop: 'position', value: 'fixed' })).toBe(false);
  });
  it('min-height and min-width accept the usual values; display accepts only inline-block', () => {
    expect(isSafeDeclaration({ prop: 'min-height', value: '44px' })).toBe(true);
    expect(isSafeDeclaration({ prop: 'min-width', value: '44px' })).toBe(true);
    expect(isSafeDeclaration({ prop: 'min-height', value: '44px; color: red' })).toBe(false);
    expect(isSafeDeclaration({ prop: 'display', value: 'inline-block' })).toBe(true);
    for (const v of ['none', 'block', 'flex', 'grid', 'inline', 'INLINE-BLOCK', 'inline-block ', '']) expect(isSafeDeclaration({ prop: 'display', value: v }), JSON.stringify(v)).toBe(false);
  });
  it('new properties are appended in the fixed order after the existing ones', () => {
    const merged = mergeStyle([{ prop: 'color', value: 'red' }], [{ prop: 'display', value: 'inline-block' }, { prop: 'min-height', value: '44px' }, { prop: 'min-width', value: '44px' }, { prop: 'width', value: '10px' }]);
    expect(serializeStyle(merged)).toBe('color: red; width: 10px; min-width: 44px; min-height: 44px; display: inline-block');
    expect(PROP_ORDER.indexOf('min-width')).toBeLessThan(PROP_ORDER.indexOf('min-height'));
    expect(parseInlineStyle(serializeStyle(merged))).toEqual(merged);
  });
});
