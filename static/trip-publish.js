(function initAeroTravelTripPublish(root) {
  'use strict';

  const PREVIEW_KEY = 'aerotravel:trip-share-preview';

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function downloadBlob(filename, blob) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`无法读取 ${url}`);
    return response.text();
  }

  function safeJsonForScript(data) {
    return JSON.stringify(data)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  function buildSelfContainedHtml(pkg, assets) {
    const title = (pkg && pkg.title) || '专属行程';
    const css = assets.css || '';
    const scripts = assets.scripts || {};
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="referrer" content="no-referrer">
  <title>${root.AeroTravelTripShareRender.escapeHtml(title)} · AeroTravel</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""><!-- pragma: allowlist secret -->
  <style>
${css}
  </style>
</head>
<body class="trip-share-body">
  <script>window.__TRIP_PACKAGE__ = ${safeJsonForScript(pkg)};</script>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script><!-- pragma: allowlist secret -->
  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
  <script>
${scripts.nav || ''}
  </script>
  <script>
${scripts.render || ''}
  </script>
  <script>
${scripts.boot || ''}
  </script>
</body>
</html>`;
  }

  async function loadPublishAssets(baseUrl) {
    const base = baseUrl || '';
    const [css, nav, render, boot] = await Promise.all([
      fetchText(`${base}trip-share.css`),
      fetchText(`${base}trip-nav.js`),
      fetchText(`${base}trip-share-render.js`),
      fetchText(`${base}trip-share-boot.js`)
    ]);
    return {
      css,
      scripts: { nav, render, boot }
    };
  }

  function savePreviewPackage(pkg) {
    const text = JSON.stringify(pkg);
    sessionStorage.setItem(PREVIEW_KEY, text);
    try {
      localStorage.setItem(PREVIEW_KEY, text);
    } catch (_err) {
      /* ignore quota */
    }
  }

  function openPreview(pkg) {
    savePreviewPackage(pkg);
    const url = new URL('trip-share.html', window.location.href);
    url.searchParams.set('preview', '1');
    window.open(url.toString(), '_blank', 'noopener');
  }

  async function publishTripPackage(pkg, options) {
    const opts = options || {};
    const token = pkg.id || root.AeroTravelTripPackage.generateShareToken(20);
    const enriched = {
      ...pkg,
      id: token,
      path: `/t/${token}`,
      share_url: opts.shareUrl || pkg.share_url || '',
      valid_until: opts.validUntil || pkg.valid_until || '',
      updated_at: pkg.updated_at || new Date().toISOString()
    };

    const assets = opts.assets || await loadPublishAssets(opts.assetBase || '');
    const html = buildSelfContainedHtml(enriched, assets);
    const htmlName = `${token}.html`;
    const jsonName = `${token}.json`;

    if (opts.downloadHtml !== false) {
      downloadText(htmlName, html, 'text/html;charset=utf-8');
    }
    if (opts.downloadJson) {
      downloadText(jsonName, JSON.stringify(enriched, null, 2), 'application/json;charset=utf-8');
    }
    if (opts.openPreview) {
      openPreview(enriched);
    }

    return {
      package: enriched,
      html,
      filename: htmlName,
      instructions: [
        `下载文件名为 ${htmlName}。请上传到静态托管的 /t/ 目录，使最终访问路径为 /t/${token}.html（与二维码链接一致）。`,
        '若托管不支持 .html 扩展名，请配置 /t/{token} → 该文件的重写，并重新发布填写实际 URL。',
        '页面已设置 noindex，且使用高强度随机路径，勿放入证件号等敏感信息',
        '同时向客户发送可复制文字与 PDF 备份',
        enriched.share_url
          ? `访问链接：${enriched.share_url}（已写入二维码；若实际上传路径不同请改后重新发布）`
          : '上传后把最终 URL 回填给客户，或重新发布并填写访问链接以生成二维码',
        enriched.valid_until ? `建议保留至：${enriched.valid_until}（仅展示，需人工删除过期页）` : ''
      ].filter(Boolean)
    };
  }

  root.AeroTravelTripPublish = Object.freeze({
    PREVIEW_KEY,
    downloadText,
    downloadBlob,
    buildSelfContainedHtml,
    loadPublishAssets,
    savePreviewPackage,
    openPreview,
    publishTripPackage
  });
})(typeof window !== 'undefined' ? window : globalThis);
