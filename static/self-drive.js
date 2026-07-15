(function (root) {
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function orderedNodes(draft) {
    const byId = new Map((draft.nodes || []).map(node => [node.id, node]));
    const fallback = (draft.days || [])
      .flatMap(day => day.node_ids || [])
      .filter(id => byId.get(id)?.source !== 'system');
    const order = (draft.route && draft.route.ordered_node_ids) || fallback;
    return order.map(id => byId.get(id)).filter(node => node && node.status !== 'removed');
  }

  function clearRouteMetrics(route) {
    const {
      segments: _segments,
      totals: _totals,
      polyline: _polyline,
      fetched_at: _fetchedAt,
      day_segments: _daySegments,
      status: _status,
      source: _source,
      total_km: _totalKm,
      total_driving_minutes: _totalMinutes,
      toll_yuan: _tollYuan,
      warnings: _warnings,
      ...routeInput
    } = route || {};
    return routeInput;
  }

  function initializeSelfDriveRoute(draft, centers, idFactory) {
    const result = clone(draft);
    result.mode = 'self_drive';
    result.route_shape = result.route_shape || 'one_way';
    result.strategy = result.strategy || 'balanced';
    const routeIds = [];
    for (const city of result.city_stops || []) {
      let node = (result.nodes || []).find(item => item.source === 'city_stop' && item.city_id === city.id);
      if (!node) {
        const center = (centers && centers[city.name]) || {};
        node = {
          id: idFactory(),
          source: 'city_stop',
          provider_id: null,
          name: city.name,
          city_id: city.id,
          city: city.name,
          location: {
            lat: Number(center.lat) || 0,
            lng: Number(center.lng) || 0,
            status: center.lat && center.lng ? 'resolved' : 'unresolved'
          },
          status: 'scheduled',
          duration_minutes: 0,
          schedule: { day_id: null, time_window: null },
          constraints: {
            required: true,
            fixed_day: false,
            fixed_time: false,
            fixed_order: !!city.fixed_order
          },
          manual_rank: routeIds.length,
          metadata: { route_node: true }
        };
        result.nodes.push(node);
      }
      routeIds.push(node.id);
      const cityExperiences = (result.days || [])
        .flatMap(day => day.node_ids || [])
        .map(id => result.nodes.find(item => item.id === id))
        .filter(item => item && item.city_id === city.id && item.source !== 'system' && item.source !== 'city_stop');
      routeIds.push(...cityExperiences.map(item => item.id));
    }
    // Round-trip: lock first city_stop as both ends of the ordered route.
    if (result.route_shape === 'round_trip' && result.city_stops?.length) {
      const originStop = result.city_stops[0];
      const originNode = (result.nodes || []).find(
        item => item.source === 'city_stop' && item.city_id === originStop.id
      );
      if (originNode) {
        originNode.constraints = {
          ...(originNode.constraints || {}),
          fixed_order: true,
          required: true
        };
        if (routeIds[0] !== originNode.id) {
          routeIds.unshift(originNode.id);
        }
      }
    }
    result.route = {
      ...(result.route || {}),
      ordered_node_ids: [...new Set(routeIds)]
    };
    result.revision = Number(result.revision || 0) + 1;
    return result;
  }

  function buildRouteRequest(draft) {
    return {
      route_shape: draft.route_shape || 'one_way',
      nodes: orderedNodes(draft).filter(node => node.location && node.location.status === 'resolved')
    };
  }

  function reorderRoute(draft, fromIndex, toIndex) {
    const result = clone(draft);
    const order = [...((result.route && result.route.ordered_node_ids) || [])];
    if (fromIndex < 0 || fromIndex >= order.length || toIndex < 0 || toIndex >= order.length) {
      return result;
    }
    const nodeByIdBefore = new Map(result.nodes.map(node => [node.id, node]));
    const fixedAt = new Map(
      order.flatMap((id, index) =>
        nodeByIdBefore.get(id)?.constraints?.fixed_order || nodeByIdBefore.get(id)?.constraints?.fixed_time
          ? [[index, id]]
          : []
      )
    );
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    if ([...fixedAt].some(([index, id]) => order[index] !== id)) {
      return clone(draft);
    }
    result.route = { ...clearRouteMetrics(result.route), ordered_node_ids: order };
    const nodeById = new Map(result.nodes.map(node => [node.id, node]));
    const cityRank = new Map(
      order
        .map(id => nodeById.get(id))
        .filter(node => node && node.source === 'city_stop')
        .map((node, index) => [node.city_id, index])
    );
    result.city_stops.sort(
      (a, b) => (cityRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (cityRank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
    result.revision = Number(result.revision || 0) + 1;
    return result;
  }

  function updateRouteSettings(draft, patch) {
    const result = clone(draft);
    if (patch.route_shape) result.route_shape = patch.route_shape;
    if (patch.strategy) result.strategy = patch.strategy;
    result.route = clearRouteMetrics(result.route);
    result.revision = Number(result.revision || 0) + 1;
    return result;
  }

  function formatRouteSummary(route) {
    if (!route) return '等待道路重算';
    const totals = route.totals || {};
    const distanceMeters = Number.isFinite(totals.distance_meters)
      ? totals.distance_meters
      : (Number.isFinite(route.total_km) ? route.total_km * 1000 : null);
    const durationSeconds = Number.isFinite(totals.duration_seconds)
      ? totals.duration_seconds
      : (Number.isFinite(route.total_driving_minutes) ? route.total_driving_minutes * 60 : null);
    const tolls = Number.isFinite(totals.tolls_yuan)
      ? totals.tolls_yuan
      : (Number.isFinite(route.toll_yuan) ? route.toll_yuan : null);
    const distance = Number.isFinite(distanceMeters) ? `${Math.round(distanceMeters / 1000)} km` : '里程不可用';
    const duration = Number.isFinite(durationSeconds)
      ? `${Math.floor(durationSeconds / 3600)} 小时 ${Math.round((durationSeconds % 3600) / 60)} 分`
      : '车程不可用';
    const tollText = Number.isFinite(tolls) ? `约 ${tolls} 元` : '过路费待确认';
    const source = route.status === 'provider'
      ? '高德道路数据'
      : route.status === 'estimate'
        ? '估算'
        : route.status === 'unavailable'
          ? '部分路段不可用'
          : '等待道路重算';
    return `${distance} · ${duration} · ${tollText} · ${source}`;
  }

  function renderRouteSummary(route, mode, shape, strategy, escapeHtml) {
    const summary = formatRouteSummary(route);
    const shapeLabel = shape === 'round_trip' ? '环线' : '单程';
    const strategyLabel = strategy === 'efficient' ? '少开车' : strategy === 'experience' ? '多体验' : '均衡';
    return '' +
      '<div class="route-summary">' +
        `<div class="route-metrics">` +
          `<div class="route-metric"><span class="metric-value">${escapeHtml(shapeLabel + ' · ' + strategyLabel)}</span><span class="metric-label">路线类型</span></div>` +
          `<div class="route-metric"><span class="metric-value">${escapeHtml(summary)}</span><span class="metric-label">道路摘要</span></div>` +
        '</div>' +
      '</div>';
  }

  function renderRouteNodes(draft, escapeHtml) {
    const nodes = orderedNodes(draft);
    if (!nodes.length) {
      return '<div class="self-drive-empty">尚未规划自驾路线</div>';
    }
    return nodes.map((node, index) => {
      const locked = !!(node.constraints && (node.constraints.fixed_order || node.constraints.fixed_time));
      return `
        <article class="route-node-item" draggable="${!locked}" data-node-id="${escapeHtml(node.id)}" data-route-index="${index}">
          <span class="route-index">${index + 1}</span>
          <div class="route-node-info">
            <strong>${escapeHtml(node.name)}</strong>
            <small>${escapeHtml(node.city || '')}${node.location && node.location.status !== 'resolved' ? ' · 待定位' : ''}</small>
          </div>
          <div class="route-node-actions">
            <button class="btn btn-icon" type="button" data-action="route-up" data-index="${index}" ${index === 0 || locked ? 'disabled' : ''} aria-label="上移 ${escapeHtml(node.name)}">↑</button>
            <button class="btn btn-icon" type="button" data-action="route-down" data-index="${index}" ${index === nodes.length - 1 || locked ? 'disabled' : ''} aria-label="下移 ${escapeHtml(node.name)}">↓</button>
            <button class="btn btn-icon" type="button" data-action="constraints" data-node-id="${escapeHtml(node.id)}" aria-label="设置 ${escapeHtml(node.name)} 的约束">锁</button>
            <button class="btn btn-icon" type="button" data-action="edit-node" data-node-id="${escapeHtml(node.id)}" aria-label="编辑 ${escapeHtml(node.name)}">✎</button>
            <button class="btn btn-icon" type="button" data-action="remove-node" data-node-id="${escapeHtml(node.id)}" aria-label="删除 ${escapeHtml(node.name)}">×</button>
          </div>
        </article>`;
    }).join('');
  }

  root.AeroTravelSelfDrive = Object.freeze({
    orderedNodes,
    initializeSelfDriveRoute,
    reorderRoute,
    buildRouteRequest,
    formatRouteSummary,
    updateRouteSettings,
    renderRouteSummary,
    renderRouteNodes
  });
})(typeof window !== 'undefined' ? window : globalThis);
