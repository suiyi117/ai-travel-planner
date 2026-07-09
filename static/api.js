(function () {
  async function fetchJson(url, options) {
    let targetUrl = url;
    if (url.startsWith('/api') && (window.location.protocol === 'file:' || window.location.port !== '8000')) {
      targetUrl = `http://localhost:8000${url}`;
    }

    const response = await fetch(targetUrl, options);
    if (!response.ok) {
      let message = '请求失败';
      try {
        const err = await response.json();
        message = err.detail || err.message || message;
      } catch (_) {}
      throw new Error(message);
    }
    return response.json();
  }

  window.AeroTravelApi = Object.freeze({ fetchJson });
})();
