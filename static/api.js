(function () {
  const NETWORK_HINT =
    '无法连接后端。请用 http://localhost:8000 打开页面，并确认已运行 python server.py（不要直接双击打开 index.html）。';

  function resolveApiUrl(url, locationLike) {
    const loc = locationLike || (typeof window !== 'undefined' ? window.location : null);
    if (!url || !url.startsWith('/api') || !loc) return url;
    if (loc.protocol === 'file:' || String(loc.port || '') !== '8000') {
      return `http://localhost:8000${url}`;
    }
    return url;
  }

  function isNetworkFetchError(error) {
    if (!error) return false;
    if (error.kind === 'network') return true;
    if (error.name === 'AbortError') return false;
    const message = String(error.message || '');
    if (/Failed to fetch|NetworkError|Load failed|fetch failed|ECONNREFUSED|ERR_CONNECTION/i.test(message)) {
      return true;
    }
    // Browsers commonly surface CORS / offline failures as TypeError("Failed to fetch").
    // Treat bare TypeError with empty/generic message as network too.
    if (error.name === 'TypeError') {
      return !message || /fetch|network|load failed/i.test(message);
    }
    return false;
  }

  function classifyFetchError(error) {
    if (error && error.kind === 'http') {
      return {
        kind: 'http',
        status: error.status || null,
        message: error.message || '请求失败',
        technical: error.technical || error.message || ''
      };
    }
    if (error && error.name === 'AbortError') {
      return {
        kind: 'timeout',
        status: null,
        message: '请求已取消或超时，请稍后重试。',
        technical: error.message || 'AbortError'
      };
    }
    if (isNetworkFetchError(error)) {
      return {
        kind: 'network',
        status: null,
        message: NETWORK_HINT,
        technical: (error && error.message) || 'Failed to fetch'
      };
    }
    return {
      kind: 'unknown',
      status: (error && error.status) || null,
      message: (error && error.message) || '请求失败',
      technical: (error && error.message) || ''
    };
  }

  function formatPlanError(error) {
    const classified = classifyFetchError(error);
    if (classified.kind === 'network') {
      return `无法连接后端，已切换为本地演示规划。${NETWORK_HINT}`;
    }
    if (classified.kind === 'http') {
      const detail = classified.message || '请求失败';
      if (classified.status === 400 || /景点|高德|city_data|未收到|未获取/i.test(detail)) {
        return `${detail}；已切换为本地演示规划。`;
      }
      return `AI 规划失败：${detail}；已切换为本地演示规划。`;
    }
    if (classified.kind === 'timeout') {
      return `${classified.message}已切换为本地演示规划。`;
    }
    return `行程生成失败：${classified.message}；已切换为本地演示规划。`;
  }

  function createHttpError(status, message) {
    const err = new Error(message || '请求失败');
    err.kind = 'http';
    err.status = status;
    err.technical = message || '请求失败';
    return err;
  }

  function createNetworkError(cause) {
    const technical = (cause && cause.message) || 'Failed to fetch';
    const err = new Error(NETWORK_HINT);
    err.kind = 'network';
    err.status = null;
    err.technical = technical;
    err.cause = cause;
    return err;
  }

  async function fetchJson(url, options) {
    const targetUrl = resolveApiUrl(url);
    let response;
    try {
      response = await fetch(targetUrl, options);
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      throw createNetworkError(error);
    }

    if (!response.ok) {
      let message = '请求失败';
      try {
        const body = await response.json();
        message = body.detail || body.message || message;
        if (Array.isArray(message)) {
          message = message.map((item) => item.msg || JSON.stringify(item)).join('; ');
        }
      } catch (_) {}
      throw createHttpError(response.status, message);
    }
    return response.json();
  }

  window.AeroTravelApi = Object.freeze({
    fetchJson,
    resolveApiUrl,
    classifyFetchError,
    formatPlanError,
    isNetworkFetchError,
    NETWORK_HINT
  });
})();
