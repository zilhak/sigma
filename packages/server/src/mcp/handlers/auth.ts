import { tokenStore } from '../../auth/token.js';
import { jsonResponse, validateToken, type ToolContext, type ToolResult } from '../helpers.js';

/**
 * 인증 관련 핸들러 (sigma_login, sigma_logout, sigma_bind, sigma_status)
 */
export const authHandlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  async sigma_login() {
    const token = tokenStore.createToken();
    return jsonResponse({
      success: true,
      token,
      message: '토큰이 발급되었습니다. sigma_bind로 플러그인/페이지에 바인딩하세요.',
      expiresIn: '10분 (사용 시마다 갱신)',
    });
  },

  async sigma_logout(args) {
    const logoutToken = args.token as string;
    const logoutDeleted = tokenStore.deleteToken(logoutToken);
    return jsonResponse({
      success: logoutDeleted,
      message: logoutDeleted ? '로그아웃되었습니다' : '토큰을 찾을 수 없습니다',
    });
  },

  async sigma_bind(args, context) {
    const { wsServer } = context;
    const bindToken = args.token as string;
    const bindPluginId = args.pluginId as string;
    const bindPageId = args.pageId as string;

    // 토큰 검증
    const bindValidation = validateToken(bindToken);
    if (!bindValidation.valid) {
      return jsonResponse({ error: bindValidation.error });
    }

    // 플러그인 존재 확인
    const bindPlugin = wsServer.getPluginById(bindPluginId);
    if (!bindPlugin) {
      return jsonResponse({ error: `플러그인(${bindPluginId})이 연결되어 있지 않습니다` });
    }

    // 페이지 정보 조회
    const pageInfo = wsServer.getPluginPageInfo(bindPluginId, bindPageId);
    if (!pageInfo) {
      return jsonResponse({ error: `페이지(${bindPageId})를 찾을 수 없습니다` });
    }

    // 바인딩
    const bindSuccess = tokenStore.bindToken(
      bindToken,
      bindPluginId,
      bindPageId,
      pageInfo.fileName,
      pageInfo.pageName
    );

    if (!bindSuccess) {
      return jsonResponse({ error: '바인딩 실패 (토큰이 만료되었을 수 있음)' });
    }

    return jsonResponse({
      success: true,
      message: '바인딩 완료',
      binding: {
        pluginId: bindPluginId,
        pageId: bindPageId,
        fileName: pageInfo.fileName,
        pageName: pageInfo.pageName,
      },
    });
  },

  async sigma_status(args, context) {
    const { wsServer } = context;
    const statusToken = args.token as string;
    const statusValidation = validateToken(statusToken);

    if (!statusValidation.valid) {
      return jsonResponse({
        valid: false,
        error: statusValidation.error,
      });
    }

    const statusBinding = statusValidation.binding;
    let bindingInfo = null;
    let pluginConnected = false;

    if (statusBinding) {
      // 바인딩된 플러그인이 아직 연결되어 있는지 확인
      const boundPlugin = wsServer.getPluginById(statusBinding.pluginId);
      pluginConnected = boundPlugin !== undefined;

      bindingInfo = {
        pluginId: statusBinding.pluginId,
        pageId: statusBinding.pageId,
        fileName: statusBinding.fileName,
        pageName: statusBinding.pageName,
        pluginConnected,
      };
    }

    return jsonResponse({
      valid: true,
      bound: statusBinding !== null,
      binding: bindingInfo,
    });
  },

  // === Plugin/Page Info Tools (토큰 불필요) ===
  async sigma_list_plugins(_args, context) {
    const { wsServer } = context;
    const plugins = wsServer.getPluginsInfo();
    return jsonResponse({
      count: plugins.length,
      plugins: plugins.map((p) => ({
        pluginId: p.pluginId,
        fileKey: p.fileKey,
        fileName: p.fileName,
        currentPageId: p.currentPageId,
        currentPageName: p.currentPageName,
        pageCount: p.pages.length,
        connectedAt: p.connectedAt,
      })),
    });
  },

  async sigma_list_pages(args, context) {
    const { wsServer } = context;
    const listPagesPluginId = args.pluginId as string;
    const listPagesPlugin = wsServer.getPluginById(listPagesPluginId);

    if (!listPagesPlugin) {
      return jsonResponse({ error: `플러그인(${listPagesPluginId})이 연결되어 있지 않습니다` });
    }

    const pluginsInfo = wsServer.getPluginsInfo();
    const targetPluginInfo = pluginsInfo.find(p => p.pluginId === listPagesPluginId);

    if (!targetPluginInfo) {
      return jsonResponse({ error: '플러그인 정보를 찾을 수 없습니다' });
    }

    return jsonResponse({
      pluginId: listPagesPluginId,
      fileName: targetPluginInfo.fileName,
      currentPageId: targetPluginInfo.currentPageId,
      currentPageName: targetPluginInfo.currentPageName,
      pages: targetPluginInfo.pages.map(p => ({
        pageId: p.pageId,
        pageName: p.pageName,
        isCurrent: p.pageId === targetPluginInfo.currentPageId,
      })),
    });
  },
};
