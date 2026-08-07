import {
  getWs, getChunkBuffer, setChunkBuffer, deleteChunkBuffer,
  log,
} from './ui-state';
import { sendToPlugin } from './bridge-server';

// 서버 메시지 타입 (handleServerMessage에서 전달하는 msg)
interface ChunkMsg {
  type: string;
  commandId?: string;
  totalChunks?: number;
  format?: 'json' | 'html';
  name?: string;
  position?: { x: number; y: number };
  pageId?: string;
  operation?: string;
  nodeId?: string;
  index?: number;
  data?: unknown;
  layoutMode?: 'auto' | 'absolute';
}

// CHUNK_START 처리
export function handleChunkStart(msg: ChunkMsg) {
  log(
    `청크 전송 시작: ${msg.totalChunks}개 청크 예정 (${msg.format !== undefined ? msg.format : 'json'})${msg.pageId ? ` [page: ${msg.pageId}]` : ''}`,
    'info'
  );
  const startCommandId = msg.commandId !== undefined ? msg.commandId : '';
  setChunkBuffer(startCommandId, {
    commandId: startCommandId,
    totalChunks: msg.totalChunks !== undefined ? msg.totalChunks : 0,
    receivedChunks: new Map(),
    format: msg.format !== undefined ? msg.format : 'json',
    name: msg.name,
    position: msg.position,
    pageId: msg.pageId,
    operation: (msg.operation !== undefined ? msg.operation : 'create') as 'create' | 'update',
    nodeId: msg.nodeId,
    layoutMode: msg.layoutMode,
  });
}

// CHUNK 처리
export function handleChunk(msg: ChunkMsg) {
  const chunkBuffer = getChunkBuffer(msg.commandId !== undefined ? msg.commandId : '');
  if (!chunkBuffer) {
    log(`청크 버퍼 불일치: ${msg.commandId}`, 'warn');
    return;
  }
  chunkBuffer.receivedChunks.set(msg.index || 0, msg.data as string);
  // 진행 상황 로그 (10개마다 또는 마지막)
  const received = chunkBuffer.receivedChunks.size;
  const total = chunkBuffer.totalChunks;
  if (received % 10 === 0 || received === total) {
    log(`청크 수신 중: ${received}/${total}`, 'info');
  }
}

// CHUNK_END 처리
export function handleChunkEnd(msg: ChunkMsg) {
  const endCommandId = msg.commandId !== undefined ? msg.commandId : '';
  const chunkBuffer = getChunkBuffer(endCommandId);
  const ws = getWs();

  if (!chunkBuffer) {
    log(`청크 종료 불일치: ${msg.commandId}`, 'warn');
    return;
  }

  // 모든 청크가 도착했는지 확인
  if (chunkBuffer.receivedChunks.size !== chunkBuffer.totalChunks) {
    log(`청크 누락: ${chunkBuffer.receivedChunks.size}/${chunkBuffer.totalChunks}`, 'error');
    if (ws) ws.send(JSON.stringify({
      type: 'RESULT',
      commandId: msg.commandId,
      success: false,
      error: `Missing chunks: received ${chunkBuffer.receivedChunks.size}/${chunkBuffer.totalChunks}`,
    }));
    deleteChunkBuffer(endCommandId);
    return;
  }

  // 청크 조립
  log('청크 조립 중...', 'info');
  let assembledData = '';
  for (let i = 0; i < chunkBuffer.totalChunks; i++) {
    assembledData += chunkBuffer.receivedChunks.get(i) !== undefined ? chunkBuffer.receivedChunks.get(i) : '';
  }

  try {
    if (chunkBuffer.operation === 'update') {
      // UPDATE_FRAME via chunks
      const updateData = chunkBuffer.format === 'html'
        ? assembledData
        : JSON.parse(assembledData);

      log(`프레임 업데이트 요청 (청크/${chunkBuffer.format}): ${chunkBuffer.nodeId}`, 'info');

      parent.postMessage({
        pluginMessage: {
          type: 'update-frame',
          nodeId: chunkBuffer.nodeId,
          format: chunkBuffer.format,
          data: updateData,
          name: chunkBuffer.name,
          pageId: chunkBuffer.pageId,
          commandId: msg.commandId,
        },
      }, '*');
      // update-result를 code.ts에서 기다림 (commandId를 실어 보냈으므로 응답에 echo됨)
    } else {
      // CREATE_FRAME via chunks
      const chunkForceAbsolute = chunkBuffer.layoutMode === 'absolute';
      if (chunkBuffer.format === 'html') {
        log(
          `프레임 생성 요청 (청크/HTML): ${chunkBuffer.name !== undefined ? chunkBuffer.name : 'Unnamed'}${chunkForceAbsolute ? ' [absolute]' : ''}${chunkBuffer.pageId ? ` [page: ${chunkBuffer.pageId}]` : ''}`,
          'info'
        );
        parent.postMessage({
          pluginMessage: {
            type: 'create-from-html',
            data: assembledData,
            name: chunkBuffer.name,
            position: chunkBuffer.position,
            pageId: chunkBuffer.pageId,
            forceAbsolute: chunkForceAbsolute,
            commandId: msg.commandId,
          },
        }, '*');
      } else {
        const data = JSON.parse(assembledData);
        log(
          `프레임 생성 요청 (청크/JSON): ${chunkBuffer.name !== undefined ? chunkBuffer.name : 'Unnamed'}${chunkForceAbsolute ? ' [absolute]' : ''}${chunkBuffer.pageId ? ` [page: ${chunkBuffer.pageId}]` : ''}`,
          'info'
        );
        parent.postMessage({
          pluginMessage: {
            type: 'create-from-json',
            data,
            name: chunkBuffer.name,
            position: chunkBuffer.position,
            pageId: chunkBuffer.pageId,
            forceAbsolute: chunkForceAbsolute,
            commandId: msg.commandId,
          },
        }, '*');
      }

      // 여기서도 ack 를 쏘지 않는다 — create-frame-result 를 code.ts 에서 기다린다
      // (위 update-frame 분기와 같은 방식). 1MB 초과 페이로드가 이 경로로 오므로
      // base64 이미지를 담은 스펙 생성이 조용히 실패하던 자리다.
    }
  } catch (err) {
    log(`청크 파싱 오류: ${err}`, 'error');
    if (ws) ws.send(JSON.stringify({
      type: 'RESULT',
      commandId: msg.commandId,
      success: false,
      error: `Parse error: ${err}`,
    }));
  }

  deleteChunkBuffer(endCommandId);
}
