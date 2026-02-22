import type { ComputedStyles, RGBA } from '@sigma/shared';

/**
 * Solid Paint 생성
 */
export function createSolidPaint(color: RGBA): SolidPaint {
  return {
    type: 'SOLID',
    color: { r: color.r, g: color.g, b: color.b },
    opacity: color.a,
  };
}

/**
 * 기본 스타일 생성
 */
export function createDefaultStyles(): ComputedStyles {
  return {
    // 레이아웃
    display: 'block',
    position: 'static',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    alignSelf: 'auto',
    flexWrap: 'nowrap',
    gap: 0,
    rowGap: 0,
    columnGap: 0,
    borderSpacingX: 0,
    borderSpacingY: 0,

    // Flex 아이템 속성
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',

    // 크기
    width: 'auto',
    height: 'auto',
    minWidth: 0,
    minHeight: 0,
    maxWidth: 0,
    maxHeight: 0,

    // 패딩
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,

    // 마진
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,

    // 배경
    backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
    backgroundImage: null,

    // 테두리 두께
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,

    // 테두리 색상
    borderTopColor: { r: 0, g: 0, b: 0, a: 0 },
    borderRightColor: { r: 0, g: 0, b: 0, a: 0 },
    borderBottomColor: { r: 0, g: 0, b: 0, a: 0 },
    borderLeftColor: { r: 0, g: 0, b: 0, a: 0 },

    // 테두리 라운드
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,

    // 텍스트
    color: { r: 0, g: 0, b: 0, a: 1 },
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'left',
    textDecoration: 'none',
    lineHeight: 0,
    letterSpacing: 0,
    whiteSpace: 'normal',
    textOverflow: 'clip',
    verticalAlign: 'baseline',

    // Grid 컨테이너 속성
    gridTemplateColumns: 'none',
    gridTemplateRows: 'none',
    gridAutoFlow: 'row',

    // Grid 아이템 속성
    gridColumnStart: 'auto',
    gridColumnEnd: 'auto',
    gridRowStart: 'auto',
    gridRowEnd: 'auto',

    // 기타
    opacity: 1,
    overflow: 'visible',
    boxShadow: 'none',
    transform: 'none',
  };
}
