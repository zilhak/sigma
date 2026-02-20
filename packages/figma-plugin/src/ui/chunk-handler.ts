import {
  getWs, getChunkBuffer, setChunkBuffer, setPendingCommandId,
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
}

// CHUNK_START 처리
export function handleChunkStart(msg: ChunkMsg) {
  log(
    `청크 전송 시작: ${msg.totalChunks}개 청크 예정 (${msg.format !== undefined ? msg.format : 'json'})${msg.pageId ? ` [page: ${msg.pageId}]` : ''}`,
    'info'
  );
  setChunkBuffer({
    commandId: msg.commandId !== undefined ? msg.commandId : '',
    totalChunks: msg.totalChunks !== undefined ? msg.totalChunks : 0,
    receivedChunks: new Map(),
    format: msg.format !== undefined ? msg.format : 'json',
    name: msg.name,
    position: msg.position,
    pageId: msg.pageId,
    operation: (msg.operation !== undefined ? msg.operation : 'create') as 'create' | 'update',
    nodeId: msg.nodeId,
  });
}

// CHUNK 처리
export function handleChunk(msg: ChunkMsg) {
  const chunkBuffer = getChunkBuffer();
  if (!chunkBuffer || chunkBuffer.commandId !== msg.commandId) {
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
  const chunkBuffer = getChunkBuffer();
  const ws = getWs();

  if (!chunkBuffer || chunkBuffer.commandId !== msg.commandId) {
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
    setChunkBuffer(null);
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
        },
      }, '*');

      setPendingCommandId(msg.commandId !== undefined ? msg.commandId : null);
      // update-result를 code.ts에서 기다림
    } else {
      // CREATE_FRAME via chunks
      if (chunkBuffer.format === 'html') {
        log(
          `프레임 생성 요청 (청크/HTML): ${chunkBuffer.name !== undefined ? chunkBuffer.name : 'Unnamed'}${chunkBuffer.pageId ? ` [page: ${chunkBuffer.pageId}]` : ''}`,
          'info'
        );
        sendToPlugin('create-from-html', assembledData, chunkBuffer.name, chunkBuffer.position, undefined, undefined, chunkBuffer.pageId);
      } else {
        const data = JSON.parse(assembledData);
        log(
          `프레임 생성 요청 (청크/JSON): ${chunkBuffer.name !== undefined ? chunkBuffer.name : 'Unnamed'}${chunkBuffer.pageId ? ` [page: ${chunkBuffer.pageId}]` : ''}`,
          'info'
        );
        sendToPlugin('create-from-json', data, chunkBuffer.name, chunkBuffer.position, undefined, undefined, chunkBuffer.pageId);
      }

      if (ws) ws.send(JSON.stringify({
        type: 'RESULT',
        commandId: msg.commandId,
        success: true,
      }));
      log(`프레임 생성 완료 (청크): ${chunkBuffer.name !== undefined ? chunkBuffer.name : 'Unnamed'}`, 'success');
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

  setChunkBuffer(null);
}
