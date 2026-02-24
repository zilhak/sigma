/**
 * CSS 스타일 추출
 */
import type { ComputedStyles } from '../types';
import { parseColor } from '../colors';
import { parseSize, parseAutoSize, parseBorderSpacing } from './utils';

export function extractStyles(style: CSSStyleDeclaration): ComputedStyles {
  return {
    // 레이아웃
    display: style.display,
    position: style.position,
    flexDirection: style.flexDirection,
    justifyContent: style.justifyContent,
    alignItems: style.alignItems,
    alignSelf: style.alignSelf,
    flexWrap: style.flexWrap,
    gap: parseSize(style.gap),
    rowGap: parseSize(style.rowGap),
    columnGap: parseSize(style.columnGap),
    borderSpacingX: parseBorderSpacing(style.borderSpacing).x,
    borderSpacingY: parseBorderSpacing(style.borderSpacing).y,

    // Flex 아이템 속성
    flexGrow: parseFloat(style.flexGrow) || 0,
    flexShrink: parseFloat(style.flexShrink) || 1,
    flexBasis: parseAutoSize(style.flexBasis),

    // 크기
    width: parseAutoSize(style.width),
    height: parseAutoSize(style.height),
    minWidth: parseSize(style.minWidth),
    minHeight: parseSize(style.minHeight),
    maxWidth: parseSize(style.maxWidth),
    maxHeight: parseSize(style.maxHeight),

    // 패딩
    paddingTop: parseSize(style.paddingTop),
    paddingRight: parseSize(style.paddingRight),
    paddingBottom: parseSize(style.paddingBottom),
    paddingLeft: parseSize(style.paddingLeft),

    // 마진
    marginTop: parseSize(style.marginTop),
    marginRight: parseSize(style.marginRight),
    marginBottom: parseSize(style.marginBottom),
    marginLeft: parseSize(style.marginLeft),

    // 배경
    backgroundColor: parseColor(style.backgroundColor),
    backgroundImage: style.backgroundImage !== 'none' ? style.backgroundImage : null,

    // 테두리 두께
    borderTopWidth: parseSize(style.borderTopWidth),
    borderRightWidth: parseSize(style.borderRightWidth),
    borderBottomWidth: parseSize(style.borderBottomWidth),
    borderLeftWidth: parseSize(style.borderLeftWidth),

    // 테두리 색상 (width=0이면 색상 정보 불필요 — Figma 라운드트립 일관성)
    borderTopColor: parseSize(style.borderTopWidth) > 0 ? parseColor(style.borderTopColor) : { r: 0, g: 0, b: 0, a: 0 },
    borderRightColor: parseSize(style.borderRightWidth) > 0 ? parseColor(style.borderRightColor) : { r: 0, g: 0, b: 0, a: 0 },
    borderBottomColor: parseSize(style.borderBottomWidth) > 0 ? parseColor(style.borderBottomColor) : { r: 0, g: 0, b: 0, a: 0 },
    borderLeftColor: parseSize(style.borderLeftWidth) > 0 ? parseColor(style.borderLeftColor) : { r: 0, g: 0, b: 0, a: 0 },

    // 테두리 라운드
    borderTopLeftRadius: parseSize(style.borderTopLeftRadius),
    borderTopRightRadius: parseSize(style.borderTopRightRadius),
    borderBottomRightRadius: parseSize(style.borderBottomRightRadius),
    borderBottomLeftRadius: parseSize(style.borderBottomLeftRadius),

    // 텍스트
    color: parseColor(style.color),
    fontSize: parseSize(style.fontSize),
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textAlign: style.textAlign,
    textDecoration: style.textDecoration,
    lineHeight: parseSize(style.lineHeight),
    letterSpacing: parseSize(style.letterSpacing),
    whiteSpace: style.whiteSpace,
    textOverflow: style.textOverflow,
    verticalAlign: style.verticalAlign,

    // Grid
    gridTemplateColumns: style.gridTemplateColumns,
    gridTemplateRows: style.gridTemplateRows,
    gridAutoFlow: style.gridAutoFlow,
    gridColumnStart: style.gridColumnStart,
    gridColumnEnd: style.gridColumnEnd,
    gridRowStart: style.gridRowStart,
    gridRowEnd: style.gridRowEnd,

    // 기타
    opacity: parseFloat(style.opacity),
    overflow: style.overflow,
    boxShadow: style.boxShadow,
    transform: style.transform,
  };
}
