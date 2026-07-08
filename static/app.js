const state = {
      cities: [
        { name: '北京', transport: 'auto', days: 2 },
        { name: '西安', transport: 'train', days: 1 }
      ],
      totalDays: 3,
      pace: '适中均衡',
      globalTransport: 'auto',
      interests: '',
      currentDay: 1,
      currentFilter: 'all',
      activeItemId: null,
      itinerary: null,
      cityCenters: {},
      selectedOptions: {}
    };

    const fallbackCenters = {
      北京: { lat: 39.9042, lng: 116.4074 },
      西安: { lat: 34.3416, lng: 108.9398 },
      上海: { lat: 31.2304, lng: 121.4737 },
      成都: { lat: 30.5728, lng: 104.0668 },
      杭州: { lat: 30.2741, lng: 120.1551 },
      广州: { lat: 23.1291, lng: 113.2644 },
      深圳: { lat: 22.5431, lng: 114.0579 },
      重庆: { lat: 29.563, lng: 106.5516 },
      长沙: { lat: 28.2282, lng: 112.9388 },
      南京: { lat: 32.0603, lng: 118.7969 }
    };

    const el = {
      routeMeta: document.getElementById('routeMeta'),
      cityInput: document.getElementById('cityInput'),
      cityList: document.getElementById('cityList'),
      addCityBtn: document.getElementById('addCityBtn'),
      daysRange: document.getElementById('daysRange'),
      daysValue: document.getElementById('daysValue'),
      departureDate: document.getElementById('departureDate'),
      interestsInput: document.getElementById('interestsInput'),
      paceGroup: document.getElementById('paceGroup'),
      transportGroup: document.getElementById('transportGroup'),
      generateBtn: document.getElementById('generateBtn'),
      generateBtnTop: document.getElementById('generateBtnTop'),
      statusNote: document.getElementById('statusNote'),
      planTitle: document.getElementById('planTitle'),
      planSummary: document.getElementById('planSummary'),
      metricDays: document.getElementById('metricDays'),
      metricCities: document.getElementById('metricCities'),
      metricStops: document.getElementById('metricStops'),
      dayTabs: document.getElementById('dayTabs'),
      filterTabs: document.getElementById('filterTabs'),
      timelineList: document.getElementById('timelineList'),
      transportList: document.getElementById('transportList'),
      budgetList: document.getElementById('budgetList'),
      tipsList: document.getElementById('tipsList'),
      mapTitle: document.getElementById('mapTitle'),
      mapEmpty: document.getElementById('mapEmpty'),
      placeDetail: document.getElementById('placeDetail'),
      fitMapBtn: document.getElementById('fitMapBtn'),
      refreshTransportBtn: document.getElementById('refreshTransportBtn'),
      copyPlanBtn: document.getElementById('copyPlanBtn'),
      workspaceTabs: document.getElementById('workspaceTabs'),
      plannerPane: document.querySelector('.planner-pane'),
      plannerBody: document.querySelector('.planner-pane .pane-body'),
      resultsPane: document.querySelector('.results-pane'),
      resultsBody: document.querySelector('.results-pane .pane-body')
    };

    let map = null;
    let routeLine = null;
    let markers = [];
    let draggedCityIndex = null;

    function todayPlus(days) {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date.toISOString().slice(0, 10);
    }

    function getCenter(city) {
      return state.cityCenters[city] || fallbackCenters[city] || { lat: 34.2, lng: 108.9 };
    }

    function getActive(group) {
      return group.querySelector('.is-active')?.dataset.value || '';
    }

    function setStatus(message, tone = 'neutral') {
      el.statusNote.textContent = message;
      el.statusNote.dataset.tone = tone;
    }

    function showToast(message, type = 'success') {
      const existing = document.getElementById('app-toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = `toast toast-${type}`;
      toast.innerHTML = `
        <div class="toast-content">
          ${type === 'success' ? `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--success);"><polyline points="20 6 9 17 4 12"/></svg>
          ` : `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--danger);"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
          `}
          <span>${message}</span>
        </div>
      `;
      document.body.appendChild(toast);

      setTimeout(() => toast.classList.add('is-visible'), 10);

      setTimeout(() => {
        toast.classList.remove('is-visible');
        setTimeout(() => toast.remove(), 300);
      }, 2500);
    }

    function normalizeType(type) {
      if (type === 'food') return '美食';
      if (type === 'hotel') return '住宿';
      if (type === 'transport') return '交通';
      return '景点';
    }

    function cleanMetaValue(value) {
      if (Array.isArray(value)) return value.filter(Boolean).join('、');
      if (value === null || value === undefined) return '';
      return String(value).trim();
    }

    function copyPoiMeta(source = {}) {
      return {
        rating: cleanMetaValue(source.rating),
        address: cleanMetaValue(source.address),
        tel: cleanMetaValue(source.tel),
        opentime: cleanMetaValue(source.opentime)
      };
    }

    function mergePoiMeta(source = {}, fallback = {}) {
      return {
        rating: cleanMetaValue(source.rating) || cleanMetaValue(fallback.rating),
        address: cleanMetaValue(source.address) || cleanMetaValue(fallback.address),
        tel: cleanMetaValue(source.tel) || cleanMetaValue(fallback.tel),
        opentime: cleanMetaValue(source.opentime) || cleanMetaValue(fallback.opentime)
      };
    }

    function escapeHtml(value) {
      return cleanMetaValue(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    }

    function renderRatingBadge(item) {
      return item.rating ? `<span class="badge badge-accent">评分 ${escapeHtml(item.rating)}</span>` : '';
    }

    function renderPoiAddressLine(item) {
      return item.address ? `<p class="poi-meta-line">地址：${escapeHtml(item.address)}</p>` : '';
    }

    function renderPoiMetaList(item) {
      const rows = [
        ['评分', item.rating],
        ['地址', item.address],
        ['电话', item.tel],
        ['营业时间', item.opentime]
      ].filter(([, value]) => cleanMetaValue(value));
      if (!rows.length) return '';
      return `<dl class="poi-meta-list">${rows.map(([label, value]) => `
        <div>
          <dt>${label}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `).join('')}</dl>`;
    }

    function renderPopupMeta(item) {
      const rows = [
        item.rating ? `评分 ${escapeHtml(item.rating)}` : '',
        item.address ? `地址：${escapeHtml(item.address)}` : ''
      ].filter(Boolean);
      return rows.length ? `<div class="poi-popup-meta">${rows.join('<br>')}</div>` : '';
    }

    function cityDayMap() {
      const days = [];
      state.cities.forEach(city => {
        for (let i = 0; i < city.days; i += 1) days.push(city.name);
      });
      return days;
    }

    function computeTotalDays() {
      return state.cities.reduce((sum, city) => sum + city.days, 0);
    }

    function renderCities() {
      el.cityList.innerHTML = '';
      state.cities.forEach((city, index) => {
        const card = document.createElement('article');
        card.className = 'city-card';
        card.draggable = true;
        card.dataset.index = String(index);
        card.setAttribute('aria-grabbed', 'false');
        card.setAttribute('title', '拖拽调整城市顺序');
        card.innerHTML = `
          <div class="city-index">${String(index + 1).padStart(2, '0')}</div>
          <div class="stack-tight">
            <div>
              <div class="city-name">${city.name}</div>
              <div class="city-meta">${index === 0 ? '起点城市' : '从上一站到达'}</div>
            </div>
            <div class="city-controls">
              <label class="city-days-label">
                <span>停留</span>
                <select class="select city-days" data-index="${index}" aria-label="${city.name} 游玩天数">
                  ${[1,2,3,4,5,6,7].map(d => `<option value="${d}" ${city.days === d ? 'selected' : ''}>${d} 天</option>`).join('')}
                </select>
              </label>
              ${index > 0 ? `
                <select class="select city-transport" data-index="${index}" aria-label="${city.name} 到达方式">
                  <option value="auto">智能推荐</option>
                  <option value="train">高铁优先</option>
                  <option value="plane">飞机优先</option>
                  <option value="driving">自驾优先</option>
                </select>
              ` : ''}
            </div>
          </div>
          <div class="city-actions">
            <span class="city-drag-handle" aria-hidden="true">↕</span>
            <button class="btn btn-icon" type="button" data-action="up" data-index="${index}" aria-label="上移 ${city.name}">↑</button>
            <button class="btn btn-icon" type="button" data-action="down" data-index="${index}" aria-label="下移 ${city.name}">↓</button>
            <button class="btn btn-icon" type="button" data-action="remove" data-index="${index}" aria-label="移除 ${city.name}">×</button>
          </div>
        `;
        el.cityList.appendChild(card);
        const select = card.querySelector('.city-transport');
        if (select) select.value = city.transport || 'auto';
      });
      updateHeaderMeta();
    }

    function clearCityDragState() {
      el.cityList.querySelectorAll('.city-card').forEach(card => {
        card.classList.remove('is-dragging', 'is-drag-over');
        card.setAttribute('aria-grabbed', 'false');
      });
      draggedCityIndex = null;
    }

    function reorderCities(fromIndex, toIndex) {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || toIndex < 0) return;
      if (fromIndex >= state.cities.length || toIndex >= state.cities.length) return;
      const [movedCity] = state.cities.splice(fromIndex, 1);
      state.cities.splice(toIndex, 0, movedCity);
      renderCities();
    }

    function updateHeaderMeta() {
      const route = state.cities.map(c => c.name).join(' → ');
      state.totalDays = computeTotalDays();
      el.routeMeta.textContent = `${route} · ${state.totalDays} 天 · ${state.pace}`;
      el.daysValue.textContent = `${state.totalDays} 天`;
      el.daysRange.value = Math.min(state.totalDays, 15);
      el.metricDays.textContent = state.totalDays;
      el.metricCities.textContent = state.cities.length;
    }

    function syncPaneBriefState(pane, body) {
      if (!pane || !body) return;
      pane.classList.toggle('is-brief-collapsed', body.scrollTop > 24);
    }

    function syncBriefStates() {
      syncPaneBriefState(el.plannerPane, el.plannerBody);
      syncPaneBriefState(el.resultsPane, el.resultsBody);
    }

    function initMap() {
      if (!window.L) {
        el.mapEmpty.style.display = 'grid';
        return;
      }
      map = L.map('map', { zoomControl: false }).setView([39.9042, 116.4074], 12);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        subdomains: '1234',
        attribution: '高德地图'
      }).addTo(map);
    }

    async function fetchJson(url, options) {
      let targetUrl = url;
      // 当通过 file:/// 协议直接打开，或当前网页端口不为 8000（如使用 Live Server 或在其他容器中运行）时，
      // 自动将 /api 请求路由到本地后端服务端口 (http://localhost:8000)
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

    async function fetchCityData(city) {
      const centerPromise = fetchJson(`/api/city_center?city=${encodeURIComponent(city)}`).catch(() => fallbackCenters[city] || { lat: 34.2, lng: 108.9 });
      const poiPromise = fetchJson(`/api/search_pois?city=${encodeURIComponent(city)}&keywords=${encodeURIComponent('景点')}&count=28`)
        .then(data => data.pois || [])
        .catch(() => []);
      const [center, pois] = await Promise.all([centerPromise, poiPromise]);
      state.cityCenters[city] = center;
      return { city, center, pois };
    }

    function fallbackPois(city) {
      const center = getCenter(city);
      const names = city === '北京'
        ? ['故宫博物院', '景山公园', '天坛公园', '前门大街']
        : city === '西安'
          ? ['陕西历史博物馆', '西安城墙', '大雁塔', '回民街']
          : [`${city}城市博物馆`, `${city}老街区`, `${city}公园`, `${city}夜市`];
      return names.map((name, index) => ({
        name,
        desc: `${name}适合作为${city}行程中的核心停留点，建议预留足够步行和拍照时间。`,
        lat: center.lat + (index - 1.5) * 0.018,
        lng: center.lng + (index % 2 ? 0.018 : -0.018),
        type: '景点'
      }));
    }

    function buildFallbackItinerary(cityData) {
      const mapDays = cityDayMap();
      const days = mapDays.map((cityName, index) => {
        const dayNum = index + 1;
        const data = cityData.find(item => item.city === cityName) || { pois: [] };
        const pois = (data.pois && data.pois.length ? data.pois : fallbackPois(cityName)).slice(0, 4);
        const prevCity = mapDays[index - 1];
        const morning = [];
        const afternoon = [];
        if (prevCity && prevCity !== cityName) {
          afternoon.push({
            name: pois[0]?.name || `${cityName}城市漫步`,
            desc: `抵达后选择交通方便的核心景点，避免第一天排得太满。`,
            tips: '2 小时',
            lat: pois[0]?.lat,
            lng: pois[0]?.lng,
            ...copyPoiMeta(pois[0])
          });
        } else {
          morning.push({
            name: pois[0]?.name || `${cityName}城市博物馆`,
            desc: pois[0]?.desc || `从${cityName}最有代表性的地点开始今日路线。`,
            tips: '2.5 小时',
            lat: pois[0]?.lat,
            lng: pois[0]?.lng,
            ...copyPoiMeta(pois[0])
          });
          afternoon.push({
            name: pois[1]?.name || `${cityName}老街区`,
            desc: pois[1]?.desc || `下午安排一个节奏更舒缓的街区或公园。`,
            tips: '2 小时',
            lat: pois[1]?.lat,
            lng: pois[1]?.lng,
            ...copyPoiMeta(pois[1])
          });
        }
        return {
          day: dayNum,
          city: cityName,
          title: `Day ${dayNum} · ${cityName}`,
          route: prevCity && prevCity !== cityName ? `上午从${prevCity}前往${cityName}，下午开始城市核心游览。` : `${cityName}核心景点与街区串联。`,
          morning,
          afternoon,
          evening: `晚上安排${cityName}本地小吃与轻量散步。`,
          food: cityName === '西安' ? ['肉夹馍', '羊肉泡馍'] : cityName === '北京' ? ['炸酱面', '铜锅涮肉'] : ['本地小吃', '特色餐馆'],
          stay: `${cityName}交通便利的核心商圈或地铁站附近`
        };
      });

      return {
        title: `${state.cities[0].name}到${state.cities.at(-1).name}的 ${state.totalDays} 天旅行规划`,
        summary: '以松弛的城市节奏串联景点、交通、美食和住宿，避免把跨城日排得过满。',
        days,
        transport_guide: buildFallbackTransport(mapDays),
        budget: {
          transport: `约 ${state.cities.length > 1 ? '800-1500' : '100-300'} 元`,
          hotel: `约 ${Math.max(1, state.totalDays - 1) * 500}-${Math.max(1, state.totalDays - 1) * 800} 元`,
          food: `约 ${state.totalDays * 150}-${state.totalDays * 260} 元`,
          tickets: `约 ${state.totalDays * 120}-${state.totalDays * 220} 元`,
          total: '按舒适型预算动态估算'
        },
        tips: [
          '跨城当天不要安排太多景点，把交通延误和酒店入住时间留出来。',
          '热门博物馆和核心景点建议提前预约，节假日尤其需要确认放票时间。',
          '每天保留一个可删减节点，天气或体力变化时不会影响主线体验。'
        ]
      };
    }

    function buildFallbackTransport(dayCities) {
      const segments = [];
      for (let i = 1; i < dayCities.length; i += 1) {
        const from = dayCities[i - 1];
        const to = dayCities[i];
        if (from === to) continue;
        const citySetting = state.cities.find(c => c.name === to);
        const tool = citySetting?.transport === 'plane' ? 'plane' : 'train';
        segments.push({
          segment: `${from} → ${to}`,
          tool,
          source_label: tool === 'plane' ? '航班参考' : '12306 参考',
          advice: `建议选择上午出发、午后抵达的${tool === 'plane' ? '航班' : '高铁'}，给下午入住和轻量游览留出缓冲。`,
          options: [
            { id: tool === 'plane' ? 'CA1201' : 'G651', time: '09:30 - 13:54', duration: '4小时24分钟', price: tool === 'plane' ? '¥720' : '¥515', desc: `${tool === 'plane' ? '航班' : '高铁'} · ${from} → ${to}` },
            { id: tool === 'plane' ? 'MU2107' : 'G321', time: '10:42 - 15:08', duration: '4小时26分钟', price: tool === 'plane' ? '¥680' : '¥515', desc: `${tool === 'plane' ? '航班' : '高铁'} · ${from} → ${to}` }
          ]
        });
      }
      return segments;
    }

    function mapPlanToItems(plan) {
      const poisByName = new Map((plan.pois || []).filter(poi => poi.name).map(poi => [poi.name, poi]));
      return (plan.days || []).map(day => {
        const items = [];
        const previous = plan.days[day.day - 2]?.city;
        if (previous && previous !== day.city) {
          const center = getCenter(day.city);
          items.push({
            id: `day-${day.day}-transport`,
            type: 'transport',
            time: '上午',
            title: `城际转场：${previous} → ${day.city}`,
            desc: day.route || `从${previous}前往${day.city}，抵达后降低当日景点密度。`,
            duration: '跨城交通',
            lat: center.lat,
            lng: center.lng,
            city: day.city
          });
        }
        (day.morning || []).forEach((spot, index) => items.push(toItem(day, spot, index, 'morning', poisByName)));
        if (day.food && day.food.length) {
          const center = getCenter(day.city);
          items.push({
            id: `day-${day.day}-food`,
            type: 'food',
            time: '12:30',
            title: `风味美食：${day.food.join('、')}`,
            desc: day.evening || `安排${day.city}本地特色餐食。`,
            duration: '1.5 小时',
            lat: center.lat + 0.012,
            lng: center.lng - 0.012,
            city: day.city
          });
        }
        (day.afternoon || []).forEach((spot, index) => items.push(toItem(day, spot, index, 'afternoon', poisByName)));
        if (day.stay) {
          const center = getCenter(day.city);
          items.push({
            id: `day-${day.day}-hotel`,
            type: 'hotel',
            time: '20:00',
            title: `住宿区域：${day.stay}`,
            desc: `优先选择地铁、火车站或次日路线方便的位置。`,
            duration: '过夜',
            lat: center.lat - 0.012,
            lng: center.lng + 0.012,
            city: day.city
          });
        }
        return { ...day, items };
      });
    }

    function toItem(day, spot, index, slot, poisByName = new Map()) {
      const center = getCenter(day.city);
      const poi = poisByName.get(spot.name) || {};
      return {
        id: `day-${day.day}-${slot}-${index}`,
        type: 'experience',
        time: spot.time || (slot === 'morning' ? (index ? '11:00' : '09:30') : (index ? '16:00' : '14:00')),
        title: spot.name,
        desc: spot.desc || '根据地理位置和节奏安排的核心游览点。',
        duration: spot.tips || '2 小时',
        lat: Number(spot.lat) || Number(poi.lat) || center.lat + (index - 0.5) * 0.015,
        lng: Number(spot.lng) || Number(poi.lng) || center.lng + (index ? 0.018 : -0.018),
        city: day.city,
        ...mergePoiMeta(spot, poi)
      };
    }

    async function generatePlan() {
      if (!state.cities.length) {
        setStatus('请至少添加一个目的地城市。', 'error');
        return;
      }

      setLoading(true);
      state.totalDays = computeTotalDays();
      state.pace = getActive(el.paceGroup);
      state.globalTransport = getActive(el.transportGroup);
      state.interests = el.interestsInput.value.trim();
      setStatus('正在获取城市 POI 和中心坐标...');

      let cityData = [];
      try {
        cityData = await Promise.all(state.cities.map(city => fetchCityData(city.name)));
        // 将每个城市的天数合并到 cityData 中
        cityData = cityData.map((data, i) => ({ ...data, days: state.cities[i].days }));
      } catch (_) {
        cityData = state.cities.map(city => ({ city: city.name, center: getCenter(city.name), pois: [], days: city.days }));
      }

      try {
        setStatus('正在连接后端生成 AI 行程...');
        const plan = await fetchJson('/api/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destinations: state.cities.map(city => ({ name: city.name, days: city.days, transport: city.transport })),
            days: state.totalDays,
            departure: '',
            pace: state.pace,
            budget: '舒适型',
            interests: state.interests,
            city_data: cityData,
            global_transport: state.globalTransport,
            start_date: el.departureDate.value
          })
        });
        applyPlan(plan, '已生成 AI 行程，并同步交通、预算与地图。');
      } catch (error) {
        const plan = buildFallbackItinerary(cityData);
        applyPlan(plan, `后端暂不可用，已切换为本地演示规划：${error.message}`);
      } finally {
        setLoading(false);
      }
    }

    function applyPlan(plan, message) {
      const mappedDays = mapPlanToItems(plan);
      state.itinerary = { ...plan, days: mappedDays };
      state.currentDay = 1;
      state.currentFilter = 'all';
      state.activeItemId = mappedDays[0]?.items[0]?.id || null;
      setStatus(message);
      if (message.includes('演示规划') || message.includes('暂不可用')) {
        showToast(message, 'error');
      } else {
        showToast(message, 'success');
      }
      renderAll();
      switchMobileView('results');
    }

    function setLoading(isLoading) {
      [el.generateBtn, el.generateBtnTop].forEach(button => {
        button.disabled = isLoading;
        button.textContent = isLoading ? '生成中...' : (button === el.generateBtn ? '生成 AI 旅行规划' : '生成规划');
      });
    }

    function renderAll() {
      renderCities();
      renderPlan();
      renderMap();
    }

    function renderPlan() {
      const plan = state.itinerary;
      if (!plan) return;
      const days = plan.days || [];
      const current = days.find(day => day.day === state.currentDay) || days[0];
      if (!current) return;

      el.planTitle.textContent = plan.title || `${state.cities[0].name} 到 ${state.cities.at(-1).name}的旅行规划`;
      el.planSummary.textContent = plan.summary || '日程、交通、预算和地图已形成一个可评审的完整流程。';
      el.metricStops.textContent = days.reduce((sum, day) => sum + day.items.length, 0);
      updateHeaderMeta();

      el.dayTabs.innerHTML = days.map(day => `
        <button class="day-tab ${day.day === state.currentDay ? 'is-active' : ''}" type="button" data-day="${day.day}">
          Day ${day.day}<small>${day.city}</small>
        </button>
      `).join('');

      el.filterTabs.querySelectorAll('button').forEach(button => {
        button.classList.toggle('is-active', button.dataset.filter === state.currentFilter);
      });

      const visibleItems = current.items.filter(item => state.currentFilter === 'all' || item.type === state.currentFilter);
      el.timelineList.innerHTML = visibleItems.length ? visibleItems.map(item => `
        <article class="timeline-item ${item.id === state.activeItemId ? 'is-active' : ''}">
          <button class="itinerary-card ${item.id === state.activeItemId ? 'is-active' : ''}" type="button" data-item="${item.id}">
            <div class="card-top">
              <div>
                <div class="item-time">${item.time}</div>
                <h3 class="item-title">${item.title}</h3>
              </div>
              <span class="badge ${item.type === 'transport' ? 'badge-accent' : ''}">${normalizeType(item.type)}</span>
            </div>
            <p class="item-desc">${item.desc}</p>
            ${renderPoiAddressLine(item)}
            <div class="badge-row">
              <span class="badge">${item.duration}</span>
              <span class="badge">${item.city}</span>
              ${renderRatingBadge(item)}
            </div>
          </button>
        </article>
      `).join('') : '<div class="empty-state">当前筛选下没有日程节点。</div>';

      renderTransport(plan.transport_guide || []);
      renderBudget(plan.budget || {});
      renderTips(plan.tips || []);
      renderPlaceDetail();
      el.mapTitle.textContent = `Day ${current.day} · ${current.city}`;
    }

    function renderTransport(guide) {
      if (!guide.length) {
        el.transportList.innerHTML = '<div class="empty-state">这条路线暂时没有跨城交通段。</div>';
        return;
      }
      el.transportList.innerHTML = guide.map((segment, segmentIndex) => {
        const selected = state.selectedOptions[segment.segment] ?? 0;
        const options = (segment.options || []).slice(0, 4);
        return `
          <article class="transport-card">
            <div class="transport-head">
              <div>
                <h3 class="transport-title">${segment.segment}</h3>
                <p class="transport-advice">${segment.advice || '建议优先选择上午出发、午后抵达的班次。'}</p>
              </div>
              <span class="badge badge-accent">${segment.source_label || (segment.tool === 'plane' ? '航班' : '高铁')}</span>
            </div>
            <div class="option-list">
              ${options.map((option, optionIndex) => `
                <button class="option-row ${selected === optionIndex ? 'is-selected' : ''}" type="button" data-segment="${segmentIndex}" data-option="${optionIndex}">
                  <div>
                    <div class="option-code">${option.id || option.flight_no || option.train_no || '待定'}</div>
                    <div class="option-meta">${option.time || `${option.depart_time || ''} - ${option.arrive_time || ''}`} · ${option.duration || option.duration_text || '时长待定'}</div>
                  </div>
                  <div class="option-price">${option.price || '¥待定'}</div>
                  <div class="option-desc">${option.desc || option.train_type || option.airline || '推荐班次'}</div>
                </button>
              `).join('')}
            </div>
          </article>
        `;
      }).join('');
    }

    function renderBudget(budget) {
      const rows = [
        ['交通出行', budget.transport || '暂无估算'],
        ['住宿', budget.hotel || '暂无估算'],
        ['美食', budget.food || '暂无估算'],
        ['景点门票', budget.tickets || '暂无估算'],
        ['合计', budget.total || '等待生成']
      ];
      el.budgetList.innerHTML = rows.map(([label, value]) => `<div class="budget-row"><span>${label}</span><strong>${value}</strong></div>`).join('');
    }

    function renderTips(tips) {
      const safeTips = tips.length ? tips : ['生成后会在这里展示跨城衔接、预约和当地交通建议。'];
      el.tipsList.innerHTML = safeTips.map(tip => `<li>${tip}</li>`).join('');
    }

    function activeItems() {
      const day = state.itinerary?.days.find(item => item.day === state.currentDay);
      return day?.items || [];
    }

    function activeItem() {
      return activeItems().find(item => item.id === state.activeItemId) || activeItems()[0];
    }

    function renderPlaceDetail() {
      const item = activeItem();
      if (!item) {
        el.placeDetail.innerHTML = '<h3>等待生成路线</h3><p>生成后点击任一日程卡片，地图会同步定位到对应地点。</p>';
        return;
      }
      el.placeDetail.innerHTML = `
        <h3>${item.title}</h3>
        <p>${item.time} · ${normalizeType(item.type)} · ${item.duration}</p>
        <p>${item.desc}</p>
        ${renderPoiMetaList(item)}
      `;
    }

    function renderMap() {
      renderPlan();
      if (!map) return;
      markers.forEach(marker => marker.remove());
      markers = [];
      if (routeLine) {
        routeLine.remove();
        routeLine = null;
      }

      const items = activeItems().filter(item => Number(item.lat) && Number(item.lng));
      if (!items.length) return;

      const points = [];
      items.forEach((item, index) => {
        const point = [Number(item.lat), Number(item.lng)];
        points.push(point);
        const icon = L.divIcon({
          className: '',
          html: `<div class="marker-pin">${index + 1}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        const marker = L.marker(point, { icon }).addTo(map);
        marker.bindPopup(`<strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(item.time)} · ${normalizeType(item.type)}${renderPopupMeta(item)}`);
        marker.on('click', () => focusItem(item.id, false));
        markers.push(marker);
      });

      if (points.length > 1) {
        routeLine = L.polyline(points, {
          color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
          weight: 3,
          opacity: 0.8,
          dashArray: '6 8'
        }).addTo(map);
        map.fitBounds(L.latLngBounds(points), { padding: [34, 34] });
      } else {
        map.setView(points[0], 13);
      }
    }

    function focusItem(itemId, updateMap = true) {
      state.activeItemId = itemId;
      renderPlan();
      const item = activeItem();
      if (updateMap && map && item && Number(item.lat) && Number(item.lng)) {
        map.flyTo([Number(item.lat), Number(item.lng)], 14, { duration: 0.8 });
        const index = activeItems().filter(i => Number(i.lat) && Number(i.lng)).findIndex(i => i.id === item.id);
        if (markers[index]) markers[index].openPopup();
      }
    }

    async function refreshTransport() {
      const plan = state.itinerary;
      if (!plan || !plan.transport_guide?.length) return;
      setStatus('正在刷新真实交通班次...');
      const date = el.departureDate.value || todayPlus(1);
      for (const segment of plan.transport_guide) {
        const [from, to] = String(segment.segment).split('→').map(part => part.trim());
        if (!from || !to) continue;
        const endpoint = segment.tool === 'plane' ? '/api/transport/flights' : '/api/transport/trains';
        try {
          const data = await fetchJson(`${endpoint}?from_city=${encodeURIComponent(from)}&to_city=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}`);
          const list = segment.tool === 'plane' ? data.flights : data.trains;
          if (list?.length) {
            segment.options = list.slice(0, 6).map(item => ({
              id: item.flight_no || item.train_no || item.id,
              time: item.time || `${item.depart_time || item.departure_time || ''} - ${item.arrive_time || item.arrival_time || ''}`,
              duration: item.duration || item.duration_text || '',
              price: item.price || item.price_text || '¥待定',
              desc: item.airline || item.train_type || item.desc || ''
            }));
            segment.source_label = segment.tool === 'plane' ? '实时航班' : '12306 实时';
          }
        } catch (_) {}
      }
      setStatus('交通班次已刷新。');
      renderPlan();
    }

    function switchMobileView(view) {
      document.body.dataset.mobileView = view;
      document.querySelectorAll('.mobile-nav button').forEach(button => {
        button.classList.toggle('is-active', button.dataset.view === view);
      });
      document.querySelectorAll('.w-tab').forEach(button => {
        button.classList.toggle('is-active', button.dataset.view === view);
      });
      if (view === 'map' && map) setTimeout(() => map.invalidateSize(), 50);
    }

    function copyTextToClipboard(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise((resolve, reject) => {
        try {
          const textArea = document.createElement('textarea');
          textArea.value = text;
          textArea.style.position = 'fixed';
          textArea.style.left = '-9999px';
          textArea.style.top = '0';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          if (successful) {
            resolve();
          } else {
            reject(new Error('execCommand failed'));
          }
        } catch (err) {
          reject(err);
        }
      });
    }

    function copyPlan() {
      const plan = state.itinerary;
      if (!plan) {
        showToast('暂无行程可供复制，请先生成规划。', 'error');
        return;
      }
      const text = [
        plan.title,
        plan.summary,
        ...(plan.days || []).map(day => `${day.title || `Day ${day.day}`}：${(day.items || []).map(item => item.title).join(' / ')}`)
      ].join('\n');
      
      copyTextToClipboard(text)
        .then(() => showToast('行程摘要已复制！', 'success'))
        .catch(() => showToast('复制失败，您的浏览器不支持直接复制，请手动选择文本。', 'error'));
    }

    function bindEvents() {
      el.addCityBtn.addEventListener('click', () => {
        const name = el.cityInput.value.trim();
        if (!name) return;
        if (!state.cities.some(city => city.name === name)) state.cities.push({ name, transport: 'auto', days: 1 });
        el.cityInput.value = '';
        renderCities();
      });

      el.cityInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') el.addCityBtn.click();
      });

      el.cityList.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const index = Number(button.dataset.index);
        const action = button.dataset.action;
        if (action === 'remove' && state.cities.length > 1) state.cities.splice(index, 1);
        if (action === 'up' && index > 0) [state.cities[index - 1], state.cities[index]] = [state.cities[index], state.cities[index - 1]];
        if (action === 'down' && index < state.cities.length - 1) [state.cities[index + 1], state.cities[index]] = [state.cities[index], state.cities[index + 1]];
        renderCities();
      });

      el.cityList.addEventListener('change', event => {
        const select = event.target.closest('.city-transport');
        const daysSelect = event.target.closest('.city-days');
        if (select) {
          state.cities[Number(select.dataset.index)].transport = select.value;
        }
        if (daysSelect) {
          state.cities[Number(daysSelect.dataset.index)].days = Number(daysSelect.value);
          updateHeaderMeta();
        }
      });

      el.cityList.addEventListener('dragstart', event => {
        const card = event.target.closest('.city-card');
        if (!card || event.target.closest('button, select, input, textarea')) {
          event.preventDefault();
          return;
        }
        draggedCityIndex = Number(card.dataset.index);
        card.classList.add('is-dragging');
        card.setAttribute('aria-grabbed', 'true');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(draggedCityIndex));
        }
      });

      el.cityList.addEventListener('dragover', event => {
        const card = event.target.closest('.city-card');
        if (!card || draggedCityIndex === null) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        el.cityList.querySelectorAll('.city-card.is-drag-over').forEach(item => {
          if (item !== card) item.classList.remove('is-drag-over');
        });
        if (Number(card.dataset.index) !== draggedCityIndex) card.classList.add('is-drag-over');
      });

      el.cityList.addEventListener('dragleave', event => {
        const card = event.target.closest('.city-card');
        if (card && !card.contains(event.relatedTarget)) card.classList.remove('is-drag-over');
      });

      el.cityList.addEventListener('drop', event => {
        const card = event.target.closest('.city-card');
        if (!card || draggedCityIndex === null) return;
        event.preventDefault();
        reorderCities(draggedCityIndex, Number(card.dataset.index));
        clearCityDragState();
      });

      el.cityList.addEventListener('dragend', clearCityDragState);

      // 天数滑块现为只读展示，由各城市天数自动求和
      el.daysRange.addEventListener('input', () => {
        updateHeaderMeta();
      });

      [el.paceGroup, el.transportGroup].forEach(group => {
        group.addEventListener('click', event => {
          const button = event.target.closest('button[data-value]');
          if (!button) return;
          group.querySelectorAll('button').forEach(item => item.classList.remove('is-active'));
          button.classList.add('is-active');
          state.pace = getActive(el.paceGroup);
          state.globalTransport = getActive(el.transportGroup);
          updateHeaderMeta();
        });
      });

      el.generateBtn.addEventListener('click', generatePlan);
      el.generateBtnTop.addEventListener('click', generatePlan);
      el.copyPlanBtn.addEventListener('click', copyPlan);
      el.refreshTransportBtn.addEventListener('click', refreshTransport);
      el.fitMapBtn.addEventListener('click', renderMap);
      if (el.plannerBody) el.plannerBody.addEventListener('scroll', () => syncPaneBriefState(el.plannerPane, el.plannerBody), { passive: true });
      if (el.resultsBody) el.resultsBody.addEventListener('scroll', () => syncPaneBriefState(el.resultsPane, el.resultsBody), { passive: true });

      el.dayTabs.addEventListener('click', event => {
        const button = event.target.closest('[data-day]');
        if (!button) return;
        state.currentDay = Number(button.dataset.day);
        state.currentFilter = 'all';
        state.activeItemId = activeItems()[0]?.id || null;
        renderMap();
      });

      el.filterTabs.addEventListener('click', event => {
        const button = event.target.closest('[data-filter]');
        if (!button) return;
        state.currentFilter = button.dataset.filter;
        renderPlan();
      });

      el.timelineList.addEventListener('click', event => {
        const card = event.target.closest('[data-item]');
        if (!card) return;
        focusItem(card.dataset.item);
      });

      el.transportList.addEventListener('click', event => {
        const option = event.target.closest('[data-segment][data-option]');
        if (!option || !state.itinerary) return;
        const segment = state.itinerary.transport_guide[Number(option.dataset.segment)];
        state.selectedOptions[segment.segment] = Number(option.dataset.option);
        renderPlan();
      });

      document.querySelector('.mobile-nav').addEventListener('click', event => {
        const button = event.target.closest('[data-view]');
        if (button) switchMobileView(button.dataset.view);
      });

      if (el.workspaceTabs) {
        el.workspaceTabs.addEventListener('click', event => {
          const button = event.target.closest('[data-view]');
          if (button) switchMobileView(button.dataset.view);
        });
      }

      window.addEventListener('resize', () => {
        if (map) setTimeout(() => map.invalidateSize(), 50);
      });
    }

    function boot() {
      el.departureDate.value = todayPlus(1);
      renderCities();
      initMap();
      const fallback = buildFallbackItinerary(state.cities.map(city => ({ city: city.name, center: getCenter(city.name), pois: fallbackPois(city.name) })));
      applyPlan(fallback, '已载入可交互示例。修改路线后点击生成即可连接后端规划。');
      bindEvents();
      syncBriefStates();
    }

    document.addEventListener('DOMContentLoaded', boot);
