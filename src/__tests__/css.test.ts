import { convertDeclarations, parseDeclarations, toColor } from '../render/css';

const ctx = { parentFontSize: 16, baseFontSize: 14 };
const convert = (
  css: string,
  extra: Partial<typeof ctx> & {
    allowedFontFamilies?: string[];
    elementFontSize?: number;
  } = {}
) => convertDeclarations(parseDeclarations(css), { ...ctx, ...extra });

describe('parseDeclarations', () => {
  it('splits declarations, lowercases properties and strips !important', () => {
    expect([
      ...parseDeclarations('COLOR: Red ; font-weight:bold !important;;'),
    ]).toEqual([
      ['color', 'Red'],
      ['font-weight', 'bold'],
    ]);
  });

  it('ignores semicolons inside parentheses, quotes and comments', () => {
    const declarations = parseDeclarations(
      `background: url(data:image/png;base64,AA); font-family: "a;b", c; /* x: y; */ color: red`
    );
    expect(declarations.get('background')).toBe(
      'url(data:image/png;base64,AA)'
    );
    expect(declarations.get('font-family')).toBe('"a;b", c');
    expect(declarations.get('color')).toBe('red');
    expect(declarations.has('x')).toBe(false);
  });

  it('later declarations win', () => {
    expect(parseDeclarations('color: red; color: blue').get('color')).toBe(
      'blue'
    );
  });
});

describe('convertDeclarations', () => {
  it('converts colours and drops invalid ones', () => {
    expect(toColor('#AFE4FF')).toBe('#AFE4FF');
    expect(toColor('Green')).toBe('green');
    expect(toColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(toColor('notacolor')).toBeUndefined();
    expect(toColor('inherit')).toBeUndefined();
    expect(convert('color: nonsense; background-color: #fff').style).toEqual({
      backgroundColor: '#fff',
    });
  });

  it('prefers -webkit-text-fill-color over color, as browsers do', () => {
    expect(
      convert('color: #AFE4FF; -webkit-text-fill-color: #123456').style
    ).toEqual({
      color: '#123456',
    });
    expect(
      convert('-webkit-text-fill-color: #123456; color: #AFE4FF').style
    ).toEqual({
      color: '#123456',
    });
    expect(convert('color: red; -webkit-text-fill-color: bogus').style).toEqual(
      {
        color: 'red',
      }
    );
  });

  it('resolves font sizes', () => {
    expect(convert('font-size: 12px').style.fontSize).toBe(12);
    expect(convert('font-size: 12pt').style.fontSize).toBe(16);
    expect(convert('font-size: 1.5em').style.fontSize).toBe(24);
    expect(convert('font-size: 2rem').style.fontSize).toBe(28);
    expect(convert('font-size: 50%').style.fontSize).toBe(8);
    expect(convert('font-size: large').style.fontSize).toBeCloseTo(15.75);
    expect(convert('font-size: -2px').style.fontSize).toBeUndefined();
    expect(convert('font-size: 12').style.fontSize).toBeUndefined();
  });

  it('resolves em lengths against the element font size', () => {
    expect(convert('font-size: 10px; margin-top: 2em').style.marginTop).toBe(
      20
    );
    expect(convert('margin-top: 2em').style.marginTop).toBe(32);
    expect(
      convert('margin-top: 2em', { elementFontSize: 20 }).style.marginTop
    ).toBe(40);
  });

  it('converts font weight and style', () => {
    expect(
      convert('font-weight: 600; font-style: oblique 10deg').style
    ).toEqual({
      fontWeight: '600',
      fontStyle: 'italic',
    });
    expect(convert('font-weight: bolder').style.fontWeight).toBe('bold');
    expect(convert('font-weight: 1234').style.fontWeight).toBeUndefined();
  });

  it('only allows listed font families', () => {
    expect(
      convert('font-family: Arial, sans-serif').style.fontFamily
    ).toBeUndefined();
    expect(
      convert(`font-family: 'Unknown', "Poppins-Regular"`, {
        allowedFontFamilies: ['Poppins-Regular'],
      }).style.fontFamily
    ).toBe('Poppins-Regular');
  });

  it('converts box shorthands', () => {
    expect(convert('margin: 1px 2px 3px').style).toEqual({
      marginTop: 1,
      marginRight: 2,
      marginBottom: 3,
      marginLeft: 2,
    });
    expect(convert('padding: 4px -1px').style).toEqual({
      paddingTop: 4,
      paddingBottom: 4,
    });
    expect(convert('margin: auto 0').style).toEqual({
      marginRight: 0,
      marginLeft: 0,
    });
  });

  it('converts text properties', () => {
    expect(
      convert(
        'text-align: end; text-decoration: underline line-through red; text-transform: uppercase; letter-spacing: 1px; line-height: 1.5'
      ).style
    ).toEqual({
      textAlign: 'right',
      textDecorationLine: 'underline line-through',
      textTransform: 'uppercase',
      letterSpacing: 1,
      lineHeight: 24,
    });
    expect(convert('line-height: 20px').style.lineHeight).toBe(20);
    expect(convert('line-height: 150%').style.lineHeight).toBe(24);
  });

  it('reports display and list style', () => {
    expect(convert('display: NONE; list-style: square inside')).toMatchObject({
      display: 'none',
      listStyleType: 'square',
    });
  });

  it('ignores unsupported properties', () => {
    expect(
      convert('position: absolute; z-index: 9; float: left').style
    ).toEqual({});
  });
});
