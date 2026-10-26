const mockNativeParse = jest.fn();

jest.mock('../NativeHtmlLite', () => ({
  __esModule: true,
  get default() {
    return mockNative.module;
  },
}));

const mockNative: { module: { parse: jest.Mock } | null } = { module: null };

import { isNativeParserAvailable, parseHtml } from '../parser/parseHtml';

describe('parseHtml', () => {
  beforeEach(() => {
    mockNativeParse.mockReset();
    mockNative.module = null;
  });

  it('falls back to the JS parser when the native module is not linked', () => {
    expect(isNativeParserAvailable()).toBe(false);
    expect(parseHtml('<b>x</b>')).toEqual([
      {
        type: 'element',
        name: 'b',
        attributes: {},
        children: [{ type: 'text', data: 'x' }],
      },
    ]);
  });

  it("throws for parser: 'native' when the module is not linked", () => {
    expect(() => parseHtml('x', { parser: 'native' })).toThrow(/not linked/);
  });

  it('uses the native parser when it is linked', () => {
    mockNative.module = { parse: mockNativeParse };
    mockNativeParse.mockReturnValue([{ type: 'text', data: 'native' }]);
    expect(isNativeParserAvailable()).toBe(true);
    expect(parseHtml('x', { maxDepth: 5000 })).toEqual([
      { type: 'text', data: 'native' },
    ]);
    expect(mockNativeParse).toHaveBeenCalledWith('x', 1024);
  });

  it("uses the JS parser for parser: 'js' even when native is linked", () => {
    mockNative.module = { parse: mockNativeParse };
    expect(parseHtml('x', { parser: 'js' })).toEqual([
      { type: 'text', data: 'x' },
    ]);
    expect(mockNativeParse).not.toHaveBeenCalled();
  });

  it('returns an empty tree for empty input without calling native', () => {
    mockNative.module = { parse: mockNativeParse };
    expect(parseHtml('')).toEqual([]);
    expect(mockNativeParse).not.toHaveBeenCalled();
  });
});
