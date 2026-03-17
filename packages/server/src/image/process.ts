import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { toHostPath } from '../storage/index.js';

// === Constants ===

/** 1px당 추정 토큰 비율 (실측 ~34.3, 안전 마진 적용) */
const TOKEN_RATIO = 30;

/** auto/thumbnail 모드 토큰 예산 */
const AUTO_TOKEN_BUDGET = 22_000;

/** 자동 축소 시 최소 허용 차원 (px) */
const MIN_DIMENSION = 200;

/** 반복 축소 비율 */
const SHRINK_FACTOR = 0.7;

/** 타일당 토큰 예산 */
const TILE_TOKEN_BUDGET = 20_000;

const SCREENSHOTS_DIR = join(homedir(), '.sigma', 'screenshots');

// === Types ===

export interface CropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TileSize {
  width: number;
  height: number;
}

/**
 * mode: 토큰 제한 해결 전략 (배타적)
 *
 * - "auto"      : 토큰 예산 내로 자동 축소 (기본값)
 * - "thumbnail" : 플러그인에서 scale 절반 + 자동 축소 (빠른 전체 파악)
 * - "tile"      : 축소 없이 그리드 분할 (원본 화질 유지)
 * - "manual"    : 명시적 비율/크기 지정 (자동 축소 없음). manualResize 필수
 * - "none"      : 아무 처리 안 함 (crop 영역 원본 그대로)
 */
export type ScreenshotMode = 'auto' | 'thumbnail' | 'tile' | 'manual' | 'none';

export interface ProcessOptions {
  /** 관심 영역 선택 (mode와 독립적으로 항상 먼저 적용) */
  crop?: CropOptions;
  /** 토큰 제한 해결 전략 */
  mode: ScreenshotMode;
  /** mode: "manual"일 때 리사이즈 값. 예: "70%", "800px" */
  manualResize?: string;
  /** mode: "tile"일 때 명시적 타일 크기. 미지정이면 자동 계산 */
  tileSize?: TileSize;
  /** thumbnail 50% 축소가 플러그인 scale로 이미 적용되었는지 여부 */
  thumbnailPreScaled?: boolean;
}

export interface SingleImageResult {
  type: 'single';
  buffer: Buffer;
  original: { width: number; height: number };
  cropped?: { width: number; height: number };
  final: { width: number; height: number };
  mode: ScreenshotMode;
  resizeApplied: boolean;
  /** original 대비 최종 크기 비율. 예: 0.5 = 50% 축소. crop은 미반영 */
  resizeScale: number;
  resizeIterations?: number;
  estimatedTokens: number;
  withinTokenLimit: boolean;
}

export interface TileInfo {
  buffer: Buffer;
  row: number;
  col: number;
  width: number;
  height: number;
  estimatedTokens: number;
}

export interface TiledImageResult {
  type: 'tiled';
  original: { width: number; height: number };
  cropped?: { width: number; height: number };
  final: { width: number; height: number };
  mode: ScreenshotMode;
  resizeApplied: boolean;
  resizeScale: number;
  tileSize: { width: number; height: number };
  grid: { rows: number; cols: number };
  tiles: TileInfo[];
}

export type ProcessResult = SingleImageResult | TiledImageResult;

// === Helpers ===

function estimateTokens(width: number, height: number): number {
  return Math.ceil((width * height) / TOKEN_RATIO);
}

function parseManualResize(value: string): { type: 'percent'; value: number } | { type: 'pixel'; value: number } | null {
  const percentMatch = value.match(/^(\d+(?:\.\d+)?)%$/);
  if (percentMatch) {
    return { type: 'percent', value: parseFloat(percentMatch[1]) / 100 };
  }

  const pixelMatch = value.match(/^(\d+)px$/);
  if (pixelMatch) {
    return { type: 'pixel', value: parseInt(pixelMatch[1], 10) };
  }

  return null;
}

function computeAutoTileSize(): { width: number; height: number } {
  const targetArea = TILE_TOKEN_BUDGET * TOKEN_RATIO;
  const side = Math.floor(Math.sqrt(targetArea));
  return { width: side, height: side };
}

// === Pipeline ===

/**
 * 이미지 처리 파이프라인
 *
 * 순서: Crop → mode별 처리
 * - auto/thumbnail: 자동 축소
 * - tile: 그리드 분할
 * - manual: 명시적 리사이즈
 * - none: 패스스루
 */
export async function processImage(
  inputBuffer: Buffer,
  format: string,
  options: ProcessOptions,
): Promise<ProcessResult> {
  const { mode, crop } = options;

  // SVG/PDF는 이미지 처리 불가
  if (format === 'SVG' || format === 'PDF') {
    return {
      type: 'single',
      buffer: inputBuffer,
      original: { width: 0, height: 0 },
      final: { width: 0, height: 0 },
      mode,
      resizeApplied: false,
      resizeScale: 1,
      estimatedTokens: 0,
      withinTokenLimit: true,
    };
  }

  let image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;
  const original = { width: originalWidth, height: originalHeight };

  let currentWidth = originalWidth;
  let currentHeight = originalHeight;
  let cropped: { width: number; height: number } | undefined;

  // Step 1: Crop (항상 먼저, mode와 독립)
  if (crop) {
    const { x, y, width, height } = crop;

    if (x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new Error(`crop 영역이 유효하지 않습니다: x=${x}, y=${y}, width=${width}, height=${height}`);
    }
    if (x + width > currentWidth || y + height > currentHeight) {
      throw new Error(
        `crop 영역이 이미지 범위를 초과합니다. ` +
        `이미지: ${currentWidth}x${currentHeight}, ` +
        `crop: x=${x}, y=${y}, width=${width}, height=${height}`
      );
    }

    image = image.extract({
      left: Math.round(x),
      top: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    });
    currentWidth = Math.round(width);
    currentHeight = Math.round(height);
    cropped = { width: currentWidth, height: currentHeight };
  }

  // Step 2: mode별 처리
  let resizeApplied = false;
  let resizeIterations: number | undefined;
  const outputFormat = format === 'JPG' ? 'jpeg' : 'png';

  switch (mode) {
    case 'none':
      // 아무 처리 안 함
      break;

    case 'auto':
    case 'thumbnail': {
      // thumbnail 50% 축소: 플러그인에서 미리 적용된 경우 건너뜀
      if (mode === 'thumbnail' && !options.thumbnailPreScaled) {
        const newW = Math.round(currentWidth * 0.5);
        const newH = Math.round(currentHeight * 0.5);
        if (newW > 0 && newH > 0) {
          image = image.resize(newW, newH, { fit: 'fill' });
          currentWidth = newW;
          currentHeight = newH;
          resizeApplied = true;
        }
      }

      // 자동 축소 루프
      let iterations = 0;
      while (estimateTokens(currentWidth, currentHeight) > AUTO_TOKEN_BUDGET) {
        const newW = Math.round(currentWidth * SHRINK_FACTOR);
        const newH = Math.round(currentHeight * SHRINK_FACTOR);
        if (newW < MIN_DIMENSION || newH < MIN_DIMENSION) break;

        image = image.resize(newW, newH, { fit: 'fill' });
        currentWidth = newW;
        currentHeight = newH;
        resizeApplied = true;
        iterations++;
      }
      if (iterations > 0) resizeIterations = iterations;
      break;
    }

    case 'manual': {
      const parsed = options.manualResize ? parseManualResize(options.manualResize) : null;
      if (!parsed) {
        throw new Error(`mode "manual"에는 manualResize가 필요합니다 (예: "70%", "800px"). 받은 값: ${options.manualResize}`);
      }

      if (parsed.type === 'percent') {
        const newW = Math.round(currentWidth * parsed.value);
        const newH = Math.round(currentHeight * parsed.value);
        if (newW > 0 && newH > 0) {
          image = image.resize(newW, newH, { fit: 'fill' });
          currentWidth = newW;
          currentHeight = newH;
          resizeApplied = true;
        }
      } else {
        const maxDim = Math.max(currentWidth, currentHeight);
        if (maxDim > parsed.value) {
          image = image.resize(parsed.value, parsed.value, { fit: 'inside', withoutEnlargement: true });
          const ratio = parsed.value / maxDim;
          currentWidth = Math.round(currentWidth * ratio);
          currentHeight = Math.round(currentHeight * ratio);
          resizeApplied = true;
        }
      }
      break;
    }

    case 'tile': {
      // 축소 없이 그리드 분할
      const tileSize = options.tileSize || computeAutoTileSize();

      image = outputFormat === 'jpeg' ? image.jpeg({ quality: 90 }) : image.png();
      const outputBuffer = await image.toBuffer();
      const resizeScale = originalWidth > 0 ? currentWidth / originalWidth : 1;

      // 타일 크기가 이미지보다 크면 단일 이미지로 반환
      if (tileSize.width >= currentWidth && tileSize.height >= currentHeight) {
        return {
          type: 'single',
          buffer: outputBuffer,
          original,
          cropped,
          final: { width: currentWidth, height: currentHeight },
          mode,
          resizeApplied: false,
          resizeScale,
          estimatedTokens: estimateTokens(currentWidth, currentHeight),
          withinTokenLimit: estimateTokens(currentWidth, currentHeight) <= 25_000,
        };
      }

      const rows = Math.ceil(currentHeight / tileSize.height);
      const cols = Math.ceil(currentWidth / tileSize.width);
      const tiles: TileInfo[] = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const left = c * tileSize.width;
          const top = r * tileSize.height;
          const tileW = Math.min(tileSize.width, currentWidth - left);
          const tileH = Math.min(tileSize.height, currentHeight - top);

          const tileBuffer = await sharp(outputBuffer)
            .extract({ left, top, width: tileW, height: tileH })
            [outputFormat === 'jpeg' ? 'jpeg' : 'png']()
            .toBuffer();

          tiles.push({
            buffer: tileBuffer,
            row: r,
            col: c,
            width: tileW,
            height: tileH,
            estimatedTokens: estimateTokens(tileW, tileH),
          });
        }
      }

      return {
        type: 'tiled',
        original,
        cropped,
        final: { width: currentWidth, height: currentHeight },
        mode,
        resizeApplied: false,
        resizeScale,
        tileSize,
        grid: { rows, cols },
        tiles,
      };
    }
  }

  // auto/thumbnail/manual/none → 단일 이미지 반환
  image = outputFormat === 'jpeg' ? image.jpeg({ quality: 90 }) : image.png();
  const outputBuffer = await image.toBuffer();
  const resizeScale = originalWidth > 0 ? currentWidth / originalWidth : 1;

  return {
    type: 'single',
    buffer: outputBuffer,
    original,
    cropped,
    final: { width: currentWidth, height: currentHeight },
    mode,
    resizeApplied,
    resizeScale,
    resizeIterations,
    estimatedTokens: estimateTokens(currentWidth, currentHeight),
    withinTokenLimit: estimateTokens(currentWidth, currentHeight) <= 25_000,
  };
}

// === File Saving ===

export async function saveSingleScreenshot(
  result: SingleImageResult,
  filename: string,
): Promise<{ filePath: string; filename: string }> {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  const safeName = filename.replace(/[^a-zA-Z0-9가-힣._-]/g, '-');
  const filepath = join(SCREENSHOTS_DIR, safeName);
  await writeFile(filepath, result.buffer);
  return { filePath: toHostPath(filepath), filename: safeName };
}

export async function saveTiledScreenshots(
  result: TiledImageResult,
  baseFilename: string,
  format: string,
): Promise<Array<{ filePath: string; filename: string; row: number; col: number; width: number; height: number; estimatedTokens: number }>> {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  const ext = format.toLowerCase();
  const baseName = baseFilename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9가-힣._-]/g, '-');
  const saved: Array<{ filePath: string; filename: string; row: number; col: number; width: number; height: number; estimatedTokens: number }> = [];

  for (const tile of result.tiles) {
    const tileFilename = `${baseName}_r${tile.row}_c${tile.col}.${ext}`;
    const filepath = join(SCREENSHOTS_DIR, tileFilename);
    await writeFile(filepath, tile.buffer);

    saved.push({
      filePath: toHostPath(filepath),
      filename: tileFilename,
      row: tile.row,
      col: tile.col,
      width: tile.width,
      height: tile.height,
      estimatedTokens: tile.estimatedTokens,
    });
  }

  return saved;
}
