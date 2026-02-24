import type { RGBA } from './types';

/**
 * CSS Named Colors (CSS Level 4 — 148 colors)
 * 값은 Figma 호환 0-1 범위
 */
const NAMED_COLORS: Record<string, RGBA> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  aliceblue: { r: 0.941, g: 0.973, b: 1, a: 1 },
  antiquewhite: { r: 0.980, g: 0.922, b: 0.843, a: 1 },
  aqua: { r: 0, g: 1, b: 1, a: 1 },
  aquamarine: { r: 0.498, g: 1, b: 0.831, a: 1 },
  azure: { r: 0.941, g: 1, b: 1, a: 1 },
  beige: { r: 0.961, g: 0.961, b: 0.863, a: 1 },
  bisque: { r: 1, g: 0.894, b: 0.769, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  blanchedalmond: { r: 1, g: 0.922, b: 0.804, a: 1 },
  blue: { r: 0, g: 0, b: 1, a: 1 },
  blueviolet: { r: 0.541, g: 0.169, b: 0.886, a: 1 },
  brown: { r: 0.647, g: 0.165, b: 0.165, a: 1 },
  burlywood: { r: 0.871, g: 0.722, b: 0.529, a: 1 },
  cadetblue: { r: 0.373, g: 0.620, b: 0.627, a: 1 },
  chartreuse: { r: 0.498, g: 1, b: 0, a: 1 },
  chocolate: { r: 0.824, g: 0.412, b: 0.118, a: 1 },
  coral: { r: 1, g: 0.498, b: 0.314, a: 1 },
  cornflowerblue: { r: 0.392, g: 0.584, b: 0.929, a: 1 },
  cornsilk: { r: 1, g: 0.973, b: 0.863, a: 1 },
  crimson: { r: 0.863, g: 0.078, b: 0.235, a: 1 },
  cyan: { r: 0, g: 1, b: 1, a: 1 },
  darkblue: { r: 0, g: 0, b: 0.545, a: 1 },
  darkcyan: { r: 0, g: 0.545, b: 0.545, a: 1 },
  darkgoldenrod: { r: 0.722, g: 0.525, b: 0.043, a: 1 },
  darkgray: { r: 0.663, g: 0.663, b: 0.663, a: 1 },
  darkgreen: { r: 0, g: 0.392, b: 0, a: 1 },
  darkgrey: { r: 0.663, g: 0.663, b: 0.663, a: 1 },
  darkkhaki: { r: 0.741, g: 0.718, b: 0.420, a: 1 },
  darkmagenta: { r: 0.545, g: 0, b: 0.545, a: 1 },
  darkolivegreen: { r: 0.333, g: 0.420, b: 0.184, a: 1 },
  darkorange: { r: 1, g: 0.549, b: 0, a: 1 },
  darkorchid: { r: 0.600, g: 0.196, b: 0.800, a: 1 },
  darkred: { r: 0.545, g: 0, b: 0, a: 1 },
  darksalmon: { r: 0.914, g: 0.588, b: 0.478, a: 1 },
  darkseagreen: { r: 0.561, g: 0.737, b: 0.561, a: 1 },
  darkslateblue: { r: 0.282, g: 0.239, b: 0.545, a: 1 },
  darkslategray: { r: 0.184, g: 0.310, b: 0.310, a: 1 },
  darkslategrey: { r: 0.184, g: 0.310, b: 0.310, a: 1 },
  darkturquoise: { r: 0, g: 0.808, b: 0.820, a: 1 },
  darkviolet: { r: 0.580, g: 0, b: 0.827, a: 1 },
  deeppink: { r: 1, g: 0.078, b: 0.576, a: 1 },
  deepskyblue: { r: 0, g: 0.749, b: 1, a: 1 },
  dimgray: { r: 0.412, g: 0.412, b: 0.412, a: 1 },
  dimgrey: { r: 0.412, g: 0.412, b: 0.412, a: 1 },
  dodgerblue: { r: 0.118, g: 0.565, b: 1, a: 1 },
  firebrick: { r: 0.698, g: 0.133, b: 0.133, a: 1 },
  floralwhite: { r: 1, g: 0.980, b: 0.941, a: 1 },
  forestgreen: { r: 0.133, g: 0.545, b: 0.133, a: 1 },
  fuchsia: { r: 1, g: 0, b: 1, a: 1 },
  gainsboro: { r: 0.863, g: 0.863, b: 0.863, a: 1 },
  ghostwhite: { r: 0.973, g: 0.973, b: 1, a: 1 },
  gold: { r: 1, g: 0.843, b: 0, a: 1 },
  goldenrod: { r: 0.855, g: 0.647, b: 0.125, a: 1 },
  gray: { r: 0.502, g: 0.502, b: 0.502, a: 1 },
  green: { r: 0, g: 0.502, b: 0, a: 1 },
  greenyellow: { r: 0.678, g: 1, b: 0.184, a: 1 },
  grey: { r: 0.502, g: 0.502, b: 0.502, a: 1 },
  honeydew: { r: 0.941, g: 1, b: 0.941, a: 1 },
  hotpink: { r: 1, g: 0.412, b: 0.706, a: 1 },
  indianred: { r: 0.804, g: 0.361, b: 0.361, a: 1 },
  indigo: { r: 0.294, g: 0, b: 0.510, a: 1 },
  ivory: { r: 1, g: 1, b: 0.941, a: 1 },
  khaki: { r: 0.941, g: 0.902, b: 0.549, a: 1 },
  lavender: { r: 0.902, g: 0.902, b: 0.980, a: 1 },
  lavenderblush: { r: 1, g: 0.941, b: 0.961, a: 1 },
  lawngreen: { r: 0.486, g: 0.988, b: 0, a: 1 },
  lemonchiffon: { r: 1, g: 0.980, b: 0.804, a: 1 },
  lightblue: { r: 0.678, g: 0.847, b: 0.902, a: 1 },
  lightcoral: { r: 0.941, g: 0.502, b: 0.502, a: 1 },
  lightcyan: { r: 0.878, g: 1, b: 1, a: 1 },
  lightgoldenrodyellow: { r: 0.980, g: 0.980, b: 0.824, a: 1 },
  lightgray: { r: 0.827, g: 0.827, b: 0.827, a: 1 },
  lightgreen: { r: 0.565, g: 0.933, b: 0.565, a: 1 },
  lightgrey: { r: 0.827, g: 0.827, b: 0.827, a: 1 },
  lightpink: { r: 1, g: 0.714, b: 0.757, a: 1 },
  lightsalmon: { r: 1, g: 0.627, b: 0.478, a: 1 },
  lightseagreen: { r: 0.125, g: 0.698, b: 0.667, a: 1 },
  lightskyblue: { r: 0.529, g: 0.808, b: 0.980, a: 1 },
  lightslategray: { r: 0.467, g: 0.533, b: 0.600, a: 1 },
  lightslategrey: { r: 0.467, g: 0.533, b: 0.600, a: 1 },
  lightsteelblue: { r: 0.690, g: 0.769, b: 0.871, a: 1 },
  lightyellow: { r: 1, g: 1, b: 0.878, a: 1 },
  lime: { r: 0, g: 1, b: 0, a: 1 },
  limegreen: { r: 0.196, g: 0.804, b: 0.196, a: 1 },
  linen: { r: 0.980, g: 0.941, b: 0.902, a: 1 },
  magenta: { r: 1, g: 0, b: 1, a: 1 },
  maroon: { r: 0.502, g: 0, b: 0, a: 1 },
  mediumaquamarine: { r: 0.400, g: 0.804, b: 0.667, a: 1 },
  mediumblue: { r: 0, g: 0, b: 0.804, a: 1 },
  mediumorchid: { r: 0.729, g: 0.333, b: 0.827, a: 1 },
  mediumpurple: { r: 0.576, g: 0.439, b: 0.859, a: 1 },
  mediumseagreen: { r: 0.235, g: 0.702, b: 0.443, a: 1 },
  mediumslateblue: { r: 0.482, g: 0.408, b: 0.933, a: 1 },
  mediumspringgreen: { r: 0, g: 0.980, b: 0.604, a: 1 },
  mediumturquoise: { r: 0.282, g: 0.820, b: 0.800, a: 1 },
  mediumvioletred: { r: 0.780, g: 0.082, b: 0.522, a: 1 },
  midnightblue: { r: 0.098, g: 0.098, b: 0.439, a: 1 },
  mintcream: { r: 0.961, g: 1, b: 0.980, a: 1 },
  mistyrose: { r: 1, g: 0.894, b: 0.882, a: 1 },
  moccasin: { r: 1, g: 0.894, b: 0.710, a: 1 },
  navajowhite: { r: 1, g: 0.871, b: 0.678, a: 1 },
  navy: { r: 0, g: 0, b: 0.502, a: 1 },
  oldlace: { r: 0.992, g: 0.961, b: 0.902, a: 1 },
  olive: { r: 0.502, g: 0.502, b: 0, a: 1 },
  olivedrab: { r: 0.420, g: 0.557, b: 0.137, a: 1 },
  orange: { r: 1, g: 0.647, b: 0, a: 1 },
  orangered: { r: 1, g: 0.271, b: 0, a: 1 },
  orchid: { r: 0.855, g: 0.439, b: 0.839, a: 1 },
  palegoldenrod: { r: 0.933, g: 0.910, b: 0.667, a: 1 },
  palegreen: { r: 0.596, g: 0.984, b: 0.596, a: 1 },
  paleturquoise: { r: 0.686, g: 0.933, b: 0.933, a: 1 },
  palevioletred: { r: 0.859, g: 0.439, b: 0.576, a: 1 },
  papayawhip: { r: 1, g: 0.937, b: 0.835, a: 1 },
  peachpuff: { r: 1, g: 0.855, b: 0.725, a: 1 },
  peru: { r: 0.804, g: 0.522, b: 0.247, a: 1 },
  pink: { r: 1, g: 0.753, b: 0.796, a: 1 },
  plum: { r: 0.867, g: 0.627, b: 0.867, a: 1 },
  powderblue: { r: 0.690, g: 0.878, b: 0.902, a: 1 },
  purple: { r: 0.502, g: 0, b: 0.502, a: 1 },
  rebeccapurple: { r: 0.400, g: 0.200, b: 0.600, a: 1 },
  red: { r: 1, g: 0, b: 0, a: 1 },
  rosybrown: { r: 0.737, g: 0.561, b: 0.561, a: 1 },
  royalblue: { r: 0.255, g: 0.412, b: 0.882, a: 1 },
  saddlebrown: { r: 0.545, g: 0.271, b: 0.075, a: 1 },
  salmon: { r: 0.980, g: 0.502, b: 0.447, a: 1 },
  sandybrown: { r: 0.957, g: 0.643, b: 0.376, a: 1 },
  seagreen: { r: 0.180, g: 0.545, b: 0.341, a: 1 },
  seashell: { r: 1, g: 0.961, b: 0.933, a: 1 },
  sienna: { r: 0.627, g: 0.322, b: 0.176, a: 1 },
  silver: { r: 0.753, g: 0.753, b: 0.753, a: 1 },
  skyblue: { r: 0.529, g: 0.808, b: 0.922, a: 1 },
  slateblue: { r: 0.416, g: 0.353, b: 0.804, a: 1 },
  slategray: { r: 0.439, g: 0.502, b: 0.565, a: 1 },
  slategrey: { r: 0.439, g: 0.502, b: 0.565, a: 1 },
  snow: { r: 1, g: 0.980, b: 0.980, a: 1 },
  springgreen: { r: 0, g: 1, b: 0.498, a: 1 },
  steelblue: { r: 0.275, g: 0.510, b: 0.706, a: 1 },
  tan: { r: 0.824, g: 0.706, b: 0.549, a: 1 },
  teal: { r: 0, g: 0.502, b: 0.502, a: 1 },
  thistle: { r: 0.847, g: 0.749, b: 0.847, a: 1 },
  tomato: { r: 1, g: 0.388, b: 0.278, a: 1 },
  turquoise: { r: 0.251, g: 0.878, b: 0.816, a: 1 },
  violet: { r: 0.933, g: 0.510, b: 0.933, a: 1 },
  wheat: { r: 0.961, g: 0.871, b: 0.702, a: 1 },
  white: { r: 1, g: 1, b: 1, a: 1 },
  whitesmoke: { r: 0.961, g: 0.961, b: 0.961, a: 1 },
  yellow: { r: 1, g: 1, b: 0, a: 1 },
  yellowgreen: { r: 0.604, g: 0.804, b: 0.196, a: 1 },
};

/**
 * HSL → RGB 변환
 * h: 0-360, s: 0-100, l: 0-100 → r,g,b: 0-1
 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return { r: f(0), g: f(8), b: f(4) };
}

/**
 * CSS 색상 문자열을 RGBA로 변환 (0-1 범위)
 */
export function parseColor(colorStr: string): RGBA | null {
  if (!colorStr || colorStr === 'none' || colorStr === 'initial' || colorStr === 'inherit') {
    return null;
  }

  const trimmed = colorStr.trim().toLowerCase();

  // Named colors
  if (NAMED_COLORS[trimmed]) {
    return { ...NAMED_COLORS[trimmed] };
  }

  // HEX: #fff, #ffffff, #ffffffff
  if (trimmed.startsWith('#')) {
    return parseHex(trimmed);
  }

  // RGBA: rgba(255, 128, 0, 0.5) or rgb(255, 128, 0)
  const rgbaMatch = trimmed.match(
    /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/
  );
  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]) / 255,
      g: parseFloat(rgbaMatch[2]) / 255,
      b: parseFloat(rgbaMatch[3]) / 255,
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
  }

  // HSLA: hsla(120, 50%, 50%, 0.8) or hsl(120, 50%, 50%)
  const hslMatch = trimmed.match(
    /hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*(?:,\s*([\d.]+))?\s*\)/
  );
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]);
    const s = parseFloat(hslMatch[2]);
    const l = parseFloat(hslMatch[3]);
    const a = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;
    const { r, g, b } = hslToRgb(h, s, l);
    return { r, g, b, a };
  }

  return null;
}

/**
 * HEX 색상 파싱
 */
function parseHex(hex: string): RGBA | null {
  const cleaned = hex.replace('#', '');

  let r: number, g: number, b: number, a = 1;

  if (cleaned.length === 3) {
    // #fff
    r = parseInt(cleaned[0] + cleaned[0], 16) / 255;
    g = parseInt(cleaned[1] + cleaned[1], 16) / 255;
    b = parseInt(cleaned[2] + cleaned[2], 16) / 255;
  } else if (cleaned.length === 4) {
    // #ffff (with alpha)
    r = parseInt(cleaned[0] + cleaned[0], 16) / 255;
    g = parseInt(cleaned[1] + cleaned[1], 16) / 255;
    b = parseInt(cleaned[2] + cleaned[2], 16) / 255;
    a = parseInt(cleaned[3] + cleaned[3], 16) / 255;
  } else if (cleaned.length === 6) {
    // #ffffff
    r = parseInt(cleaned.slice(0, 2), 16) / 255;
    g = parseInt(cleaned.slice(2, 4), 16) / 255;
    b = parseInt(cleaned.slice(4, 6), 16) / 255;
  } else if (cleaned.length === 8) {
    // #ffffffff (with alpha)
    r = parseInt(cleaned.slice(0, 2), 16) / 255;
    g = parseInt(cleaned.slice(2, 4), 16) / 255;
    b = parseInt(cleaned.slice(4, 6), 16) / 255;
    a = parseInt(cleaned.slice(6, 8), 16) / 255;
  } else {
    return null;
  }

  return { r, g, b, a };
}

/**
 * RGBA를 CSS 문자열로 변환
 */
export function rgbaToString(color: RGBA): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);

  if (color.a === 1) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${color.a})`;
}
