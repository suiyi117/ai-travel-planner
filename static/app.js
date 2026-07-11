const {
      STORAGE_KEY,
      MAX_SAVED_TRIPS,
      fallbackCenters,
      createInitialState
    } = window.AeroTravelState;

    const state = createInitialState();
    const tripStorage = window.AeroTravelStorage.createTripStorage(STORAGE_KEY, MAX_SAVED_TRIPS);

    const Wizard = window.AeroTravelWizard;

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
      budgetGroup: document.getElementById('budgetGroup'),
      generateBtn: document.getElementById('generateBtn'),
      regenerateBtn: document.getElementById('regenerateBtn'),
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
      budgetLevelBadge: document.getElementById('budgetLevelBadge'),
      tipsList: document.getElementById('tipsList'),
      mapTitle: document.getElementById('mapTitle'),
      mapEmpty: document.getElementById('mapEmpty'),
      placeDetail: document.getElementById('placeDetail'),
      fitMapBtn: document.getElementById('fitMapBtn'),
      refreshTransportBtn: document.getElementById('refreshTransportBtn'),
      copyPlanBtn: document.getElementById('copyPlanBtn'),
      exportLongImageBtn: document.getElementById('exportLongImageBtn'),
      exportIcsBtn: document.getElementById('exportIcsBtn'),
      savedTripsBtn: document.getElementById('savedTripsBtn'),
      savedTripsPanel: document.getElementById('savedTripsPanel'),
      qualityPanel: document.getElementById('qualityPanel'),
      wizardSteps: document.getElementById('wizardSteps'),
      wizardSummaryRoute: document.getElementById('wizardSummaryRoute'),
      wizardSummaryMeta: document.getElementById('wizardSummaryMeta'),
      wizardCompactSummary: document.getElementById('wizardCompactSummary'),
      wizardNextBtn: document.getElementById('wizardNextBtn'),
      wizardBackBtn: document.getElementById('wizardBackBtn'),
      wizardEditPrefsBtn: document.getElementById('wizardEditPrefsBtn'),
      stepRouteNote: document.getElementById('stepRouteNote'),
      openMapDrawerBtn: document.getElementById('openMapDrawerBtn'),
      closeMapDrawerBtn: document.getElementById('closeMapDrawerBtn'),
      mapDrawer: document.getElementById('mapDrawer'),
      mapDrawerBackdrop: document.getElementById('mapDrawerBackdrop'),
      mobileMoreBtn: document.getElementById('mobileMoreBtn'),
      mobileMorePanel: document.getElementById('mobileMorePanel'),
      mobileMoreWrap: document.getElementById('mobileMoreWrap'),
      plannerPane: document.querySelector('.planner-pane'),
      plannerBody: document.querySelector('.planner-pane .pane-body'),
      resultsPane: document.querySelector('.results-pane'),
      resultsBody: document.querySelector('.results-pane .pane-body')
    };

    let map = null;
    let routeLine = null;
    let markers = [];
    let draggedCityIndex = null;

    const {
      todayPlus,
      addDays,
      normalizeType,
      cleanMetaValue,
      copyPoiMeta,
      mergePoiMeta,
      escapeHtml,
      parseTimeRange,
      parsePriceValue,
      normalizeSegKey,
      optionMatchesDirection
    } = window.AeroTravelUtils;

    function weatherForDay(day) {
      const casts = state.cityWeather[day.city];
      if (!casts || !casts.length) return null;
      const targetDate = addDays(el.departureDate.value, day.day - 1);
      if (!targetDate) return null;
      return casts.find(cast => cast.date === targetDate) || null;
    }

    function getCenter(city) {
      return state.cityCenters[city] || fallbackCenters[city] || { lat: 34.2, lng: 108.9 };
    }

    function getActive(group) {
      return group.querySelector('.is-active')?.dataset.value || '';
    }

    function setStatus(message, tone = 'neutral') {
      if (!el.statusNote) return;
      el.statusNote.textContent = message;
      el.statusNote.dataset.tone = tone;
    }

    function wizardFlags() {
      return {
        step1Done: Boolean(state.step1Done),
        hasPlan: Boolean(state.itinerary && (state.itinerary.days || []).length)
      };
    }

    function renderWizardChrome() {
      const flags = wizardFlags();
      document.body.dataset.wizardStep = String(state.wizardStep);
      document.querySelectorAll('[data-step-panel]').forEach(panel => {
        const step = Number(panel.getAttribute('data-step-panel'));
        panel.hidden = step !== state.wizardStep;
      });
      document.querySelectorAll('.wizard-step').forEach(btn => {
        const step = Number(btn.dataset.step);
        const allowed = Wizard.canEnterStep(step, flags);
        btn.classList.toggle('is-active', step === state.wizardStep);
        btn.classList.toggle('is-locked', !allowed);
        btn.disabled = !allowed;
      });
      const summary = Wizard.buildSummary(state);
      if (el.wizardSummaryRoute) el.wizardSummaryRoute.textContent = summary.route;
      if (el.wizardSummaryMeta) el.wizardSummaryMeta.textContent = summary.meta;
      if (el.wizardCompactSummary) el.wizardCompactSummary.textContent = `${summary.route} · ${summary.meta}`;
      updateHeaderMeta();
    }

    function setWizardStep(step) {
      const target = Number(step);
      if (!Wizard.canEnterStep(target, wizardFlags())) {
        showToast('请先完成前面的步骤。', 'error');
        return;
      }
      state.wizardStep = target;
      renderWizardChrome();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function goNextFromStep1() {
      const result = Wizard.validateStep1({ cities: state.cities });
      if (!result.ok) {
        if (el.stepRouteNote) {
          el.stepRouteNote.hidden = false;
          el.stepRouteNote.textContent = result.message;
        }
        showToast(result.message, 'error');
        return;
      }
      if (el.stepRouteNote) el.stepRouteNote.hidden = true;
      state.step1Done = true;
      setWizardStep(2);
    }

    function ensureMap() {
      if (map) return map;
      initMap();
      return map;
    }

    function openMapDrawer(itemId) {
      state.mapDrawerOpen = true;
      if (itemId) {
        state.activeItemId = itemId;
        state.mapFocusItemId = itemId;
      } else if (state.activeItemId) {
        state.mapFocusItemId = state.activeItemId;
      }
      if (el.mapDrawer) {
        el.mapDrawer.hidden = false;
        el.mapDrawer.setAttribute('aria-hidden', 'false');
      }
      document.body.classList.add('map-drawer-open');
      ensureMap();
      renderMap();
      setTimeout(() => {
        if (!map) return;
        map.invalidateSize();
        const focusId = state.mapFocusItemId || state.activeItemId;
        if (focusId) focusItem(focusId, true);
      }, 60);
    }

    function closeMapDrawer() {
      state.mapDrawerOpen = false;
      state.mapFocusItemId = null;
      if (el.mapDrawer) {
        el.mapDrawer.hidden = true;
        el.mapDrawer.setAttribute('aria-hidden', 'true');
      }
      document.body.classList.remove('map-drawer-open');
    }

    function showToast(message, type = 'success') {
      const existing = document.getElementById('app-toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = `toast toast-${type}`;
      const toastMessage = escapeHtml(message);
      toast.innerHTML = `
        <div class="toast-content">
          ${type === 'success' ? `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--success);"><polyline points="20 6 9 17 4 12"/></svg>
          ` : `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--danger);"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
          `}
          <span>${toastMessage}</span>
        </div>
      `;
      document.body.appendChild(toast);

      setTimeout(() => toast.classList.add('is-visible'), 10);

      setTimeout(() => {
        toast.classList.remove('is-visible');
        setTimeout(() => toast.remove(), 300);
      }, 2500);
    }

    function loadSavedTrips() {
      return tripStorage.load();
    }

    function saveTripSnapshot(rawPlan) {
      const entry = {
        id: Date.now(),
        savedAt: new Date().toISOString(),
        title: rawPlan.title || '未命名行程',
        cities: JSON.parse(JSON.stringify(state.cities)),
        pace: state.pace,
        budget: state.budget,
        globalTransport: state.globalTransport,
        interests: state.interests,
        departureDate: el.departureDate.value,
        selectedOptions: { ...state.selectedOptions },
        plan: rawPlan
      };
      tripStorage.save(entry);
      updateSavedTripsBadge();
    }

    function deleteTripSnapshot(id) {
      tripStorage.remove(id);
      updateSavedTripsBadge();
    }

    function updateSavedTripsBadge() {
      if (!el.savedTripsBtn) return;
      const savedCount = loadSavedTrips().length;
      el.savedTripsBtn.textContent = savedCount > 0 ? `我的行程（${savedCount}）` : '我的行程';
    }

    function setActiveByValue(group, value) {
      if (!group) return;
      group.querySelectorAll('button[data-value]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.value === value);
      });
    }

    function restoreTripSnapshot(id) {
      try {
        const entry = loadSavedTrips().find(item => item.id === id);
        if (!entry) return;
        state.cities = JSON.parse(JSON.stringify(entry.cities || []));
        state.pace = entry.pace || state.pace;
        state.budget = entry.budget || state.budget;
        state.globalTransport = entry.globalTransport || state.globalTransport;
        state.interests = entry.interests || '';
        const selectedOptionsSnapshot = { ...(entry.selectedOptions || {}) };

        el.interestsInput.value = state.interests;
        el.departureDate.value = entry.departureDate || el.departureDate.value;
        setActiveByValue(el.paceGroup, state.pace);
        setActiveByValue(el.transportGroup, state.globalTransport);
        setActiveByValue(el.budgetGroup, state.budget);

        applyPlan(entry.plan, '已恢复本地保存的行程，无需联网重新生成。', {
          selectedOptions: selectedOptionsSnapshot
        });
        renderCities();
      } catch (_) {
        // 恢复失败时静默跳过，不影响主流程
      }
    }

    function renderSavedTripsPanel() {
      if (!el.savedTripsPanel) return;
      const trips = loadSavedTrips();
      if (!trips.length) {
        el.savedTripsPanel.innerHTML = '<div class="snapshot-empty">生成行程后会自动保存在本机</div>';
        return;
      }
      el.savedTripsPanel.innerHTML = trips.map(entry => {
        const dateLabel = escapeHtml(String(entry.savedAt || '').slice(0, 10));
        const cityChain = escapeHtml((entry.cities || []).map(c => c.name).join('→'));
        const entryId = escapeHtml(String(entry.id));
        return `
          <div class="snapshot-item">
            <div class="snapshot-item-main">
              <div class="snapshot-item-title">${escapeHtml(entry.title)}</div>
              <div class="snapshot-item-meta">${dateLabel} · ${cityChain}</div>
            </div>
            <div class="snapshot-item-actions">
              <button class="btn btn-icon" type="button" data-restore-id="${entryId}" aria-label="恢复该行程">恢复</button>
              <button class="btn btn-icon" type="button" data-delete-id="${entryId}" aria-label="删除该行程">×</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function setSavedTripsPanelOpen(isOpen) {
      if (!el.savedTripsBtn || !el.savedTripsPanel) return;
      if (isOpen) renderSavedTripsPanel();
      el.savedTripsPanel.hidden = !isOpen;
      el.savedTripsBtn.setAttribute('aria-expanded', String(isOpen));
    }

    function findSegment(fromCity, toCity) {
      const guide = state.itinerary?.transport_guide || [];
      const key = normalizeSegKey(`${fromCity} → ${toCity}`);
      return guide.find(seg => normalizeSegKey(seg.segment) === key) || null;
    }

    function selectedOption(segment) {
      if (!segment) return null;
      const options = segment.options || [];
      const index = state.selectedOptions[segment.segment] ?? 0;
      return options[index] || null;
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
        const cityName = cleanMetaValue(city.name);
        const cityNameHtml = escapeHtml(cityName);
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
              <div class="city-name">${cityNameHtml}</div>
              <div class="city-meta">${index === 0 ? '起点城市' : '从上一站到达'}</div>
            </div>
            <div class="city-controls">
              <label class="city-days-label">
                <span>停留</span>
                <select class="select city-days" data-index="${index}" aria-label="${cityNameHtml} 游玩天数">
                  ${[1,2,3,4,5,6,7].map(d => `<option value="${d}" ${city.days === d ? 'selected' : ''}>${d} 天</option>`).join('')}
                </select>
              </label>
              ${index > 0 ? `
                <select class="select city-transport" data-index="${index}" aria-label="${cityNameHtml} 到达方式">
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
            <button class="btn btn-icon" type="button" data-action="up" data-index="${index}" aria-label="上移 ${cityNameHtml}">↑</button>
            <button class="btn btn-icon" type="button" data-action="down" data-index="${index}" aria-label="下移 ${cityNameHtml}">↓</button>
            <button class="btn btn-icon" type="button" data-action="remove" data-index="${index}" aria-label="移除 ${cityNameHtml}">×</button>
          </div>
        `;
        el.cityList.appendChild(card);
        const select = card.querySelector('.city-transport');
        if (select) select.value = city.transport || 'auto';
      });
      renderWizardChrome();
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
      if (el.routeMeta) el.routeMeta.textContent = `${route} · ${state.totalDays} 天 · ${state.pace}`;
      if (el.daysValue) el.daysValue.textContent = `${state.totalDays} 天`;
      if (el.daysRange) el.daysRange.value = Math.min(state.totalDays, 15);
      if (el.metricDays) el.metricDays.textContent = state.totalDays;
      if (el.metricCities) el.metricCities.textContent = state.cities.length;
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
      map = window.AeroTravelMap.createMap('map', [39.9042, 116.4074], 12);
    }

    async function fetchJson(url, options) {
      return window.AeroTravelApi.fetchJson(url, options);
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
          total: `按${state.budget}预算动态估算`
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
          data_source: 'ai_fallback',
          source_label: 'AI 预估，需确认',
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
            fromCity: previous,
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

    function transportDisplay(item) {
      const segment = findSegment(item.fromCity, item.city);
      const option = selectedOption(segment);
      if (!option) return { time: item.time, extra: '' };
      return {
        time: option.time || item.time,
        extra: option.id ? `已选 ${option.id}` : ''
      };
    }

    function checkDayConflicts(day) {
      const conflicted = new Set();
      const ranges = [];
      (day.items || []).forEach(item => {
        const timeStr = item.type === 'transport' ? transportDisplay(item).time : item.time;
        const range = parseTimeRange(timeStr);
        if (!range) return;
        ranges.push({ id: item.id, start: range[0], end: range[1] });
      });
      for (let i = 0; i < ranges.length; i += 1) {
        for (let j = i + 1; j < ranges.length; j += 1) {
          const a = ranges[i];
          const b = ranges[j];
          if (a.start < b.end && b.start < a.end) {
            conflicted.add(a.id);
            conflicted.add(b.id);
          }
        }
      }
      return conflicted;
    }

    function computeSelectedTransportTotal() {
      const guide = state.itinerary?.transport_guide || [];
      let total = 0;
      let missingCount = 0;
      guide.forEach(segment => {
        if (segment.tool === 'driving') return;
        const option = selectedOption(segment);
        const price = option ? parsePriceValue(option.price) : null;
        if (price === null || Number.isNaN(price)) {
          missingCount += 1;
        } else {
          total += price;
        }
      });
      return { total, missingCount };
    }

    function checkStatusFromItems(items) {
      const hasError = items.some(item => item.level === 'error');
      const hasWarn = items.some(item => item.level === 'warn');
      return {
        status: hasError ? 'error' : (hasWarn ? 'review' : 'pass'),
        summary: hasError ? '存在问题' : (hasWarn ? '需人工确认' : '通过')
      };
    }

    function normalizeQualityChecks(checks) {
      const rawItems = Array.isArray(checks?.items) ? checks.items : [];
      return rawItems
        .map(item => ({
          level: ['ok', 'warn', 'error'].includes(item.level) ? item.level : 'warn',
          message: cleanMetaValue(item.message)
        }))
        .filter(item => item.message);
    }

    function buildLocalQualityChecks(plan) {
      const items = [];
      const routeCities = new Set(state.cities.map(city => city.name));
      const guide = plan?.transport_guide || [];

      (plan?.days || []).forEach(day => {
        if (!routeCities.has(day.city)) {
          items.push({ level: 'error', message: `Day ${day.day}：城市不在当前路线中。` });
        }
        (day.items || []).forEach(item => {
          if (item.type !== 'transport' && item.city && item.city !== day.city) {
            items.push({ level: 'warn', message: `Day ${day.day}：${item.title} 的城市与当天不一致。` });
          }
          if (item.type === 'transport' && !findSegment(item.fromCity, item.city)) {
            items.push({ level: 'warn', message: `Day ${day.day}：${item.fromCity} → ${item.city} 未匹配到交通段。` });
          }
        });
      });

      guide.forEach(segment => {
        const options = segment.options || [];
        if (segment.tool !== 'driving' && !options.length) {
          items.push({ level: 'warn', message: `${segment.segment}：暂无可用班次，需要人工确认。` });
        }
        if (segment.data_source === 'ai_fallback') {
          items.push({ level: 'warn', message: `${segment.segment}：交通为 AI 预估，需人工核对。` });
        }
        if (segment.data_source === 'reference') {
          items.push({ level: 'warn', message: `${segment.segment}：典型参考数据不代表实时余票或票价。` });
        }
      });

      const { missingCount } = computeSelectedTransportTotal();
      if (missingCount) {
        items.push({ level: 'warn', message: `${missingCount} 段已选交通缺少明确价格。` });
      }

      return items;
    }

    function mergeQualityChecks(serverChecks, localItems) {
      const items = [...normalizeQualityChecks(serverChecks), ...localItems];
      const seen = new Set();
      const uniqueItems = items.filter(item => {
        const key = `${item.level}:${item.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (!uniqueItems.length) uniqueItems.push({ level: 'ok', message: '行程结构、交通方向和客户版信息检查通过。' });
      const status = checkStatusFromItems(uniqueItems);
      return { ...status, items: uniqueItems };
    }

    function refreshQualityChecks() {
      if (!state.itinerary) return;
      state.itinerary.quality_checks = mergeQualityChecks(
        state.itinerary._serverQualityChecks,
        buildLocalQualityChecks(state.itinerary)
      );
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
      state.budget = getActive(el.budgetGroup);
      state.interests = el.interestsInput.value.trim();
      setStatus('正在查询城市中心与景点数据...');

      let cityData = [];
      try {
        cityData = await Promise.all(state.cities.map(city => fetchCityData(city.name)));
        // 将每个城市的天数合并到 cityData 中
        cityData = cityData.map((data, i) => ({ ...data, days: state.cities[i].days }));
      } catch (_) {
        cityData = state.cities.map(city => ({ city: city.name, center: getCenter(city.name), pois: [], days: city.days }));
      }

      try {
        setStatus('正在生成 AI 行程...');
        const plan = await fetchJson('/api/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destinations: state.cities.map(city => ({ name: city.name, days: city.days, transport: city.transport })),
            days: state.totalDays,
            departure: '',
            pace: state.pace,
            budget: state.budget,
            interests: state.interests,
            city_data: cityData,
            global_transport: state.globalTransport,
            start_date: el.departureDate.value
          })
        });
        setStatus('正在校验交通方向并整理客户版行程...');
        applyPlan(plan, '已生成 AI 行程，内部检查和客户版行程已就绪。');
        saveTripSnapshot(plan);
      } catch (error) {
        const plan = buildFallbackItinerary(cityData);
        applyPlan(plan, `后端暂不可用，已切换为本地演示规划：${error.message}`);
      } finally {
        setLoading(false);
      }
    }

    function applyPlan(plan, message, options = {}) {
      const selectedOptionsSnapshot = options.selectedOptions || {};
      state.cityWeather = plan.city_weather || {};
      const mappedDays = mapPlanToItems(plan);
      const tips = (plan.tips || []).slice();
      const rainTips = buildRainWeatherTips(mappedDays);
      rainTips.reverse().forEach(tip => {
        if (!tips.includes(tip)) tips.unshift(tip);
      });
      state.itinerary = {
        ...plan,
        tips,
        days: mappedDays,
        _serverQualityChecks: plan.quality_checks || null
      };
      state.selectedOptions = { ...selectedOptionsSnapshot };
      refreshQualityChecks();
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

      const skipWizardJump = Boolean(options.skipWizardJump);
      if (!skipWizardJump) {
        state.step1Done = true;
        setWizardStep(3);
      } else {
        state.step1Done = false;
        state.wizardStep = 1;
        renderWizardChrome();
      }
    }

    function buildRainWeatherTips(days) {
      const tips = [];
      days.forEach(day => {
        const cast = weatherForDay(day);
        if (!cast) return;
        const weatherText = `${cast.dayweather || ''}${cast.nightweather || ''}`;
        if (!/雨|雪/.test(weatherText)) return;
        const label = cast.dayweather && /雨|雪/.test(cast.dayweather) ? cast.dayweather : cast.nightweather;
        const dateLabel = formatDateLabel(cast.date);
        tips.push(`${dateLabel}${day.city}有${label}，建议携带雨具并优先安排室内景点`);
      });
      return tips;
    }

    function formatDateLabel(dateStr) {
      const parts = String(dateStr || '').split('-');
      if (parts.length !== 3) return '';
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      if (!month || !day) return '';
      return `${month}月${day}日`;
    }

    function setLoading(isLoading) {
      [el.generateBtn, el.regenerateBtn].filter(Boolean).forEach(button => {
        button.disabled = isLoading;
        if (button === el.generateBtn) {
          button.textContent = isLoading ? '生成中...' : '生成 AI 旅行规划';
        } else if (button === el.regenerateBtn) {
          button.textContent = isLoading ? '生成中...' : '重新生成';
        }
      });
    }

    function renderAll() {
      renderCities();
      renderPlan();
      renderWizardChrome();
      if (state.mapDrawerOpen) {
        try { renderMap(); } catch (_) { /* map not ready */ }
      }
    }

    function renderPlan() {
      const plan = state.itinerary;
      if (!plan) return;
      refreshQualityChecks();
      const days = plan.days || [];
      const current = days.find(day => day.day === state.currentDay) || days[0];
      if (!current) return;

      el.planTitle.textContent = plan.title || `${state.cities[0].name} 到 ${state.cities.at(-1).name}的旅行规划`;
      el.planSummary.textContent = plan.summary || '日程、交通、预算和地图已形成一个可评审的完整流程。';
      el.metricStops.textContent = days.reduce((sum, day) => sum + day.items.length, 0);
      updateHeaderMeta();

      el.dayTabs.innerHTML = days.map(day => {
        const cast = weatherForDay(day);
        const weatherHtml = cast
          ? `<small class="day-weather">${escapeHtml(cast.dayweather)} ${escapeHtml(cast.nighttemp)}~${escapeHtml(cast.daytemp)}℃</small>`
          : '';
        return `
        <button class="day-tab ${day.day === state.currentDay ? 'is-active' : ''}" type="button" data-day="${day.day}">
          Day ${day.day}<small>${escapeHtml(day.city)}</small>${weatherHtml}
        </button>
      `;
      }).join('');

      el.filterTabs.querySelectorAll('button').forEach(button => {
        button.classList.toggle('is-active', button.dataset.filter === state.currentFilter);
      });

      const visibleItems = current.items.filter(item => state.currentFilter === 'all' || item.type === state.currentFilter);
      const conflicts = checkDayConflicts(current);
      el.timelineList.innerHTML = visibleItems.length ? visibleItems.map(item => {
        const display = item.type === 'transport' ? transportDisplay(item) : { time: item.time, extra: '' };
        return `
        <article class="timeline-item ${item.id === state.activeItemId ? 'is-active' : ''}">
          <button class="itinerary-card ${item.id === state.activeItemId ? 'is-active' : ''}" type="button" data-item="${item.id}">
            <div class="card-top">
              <div>
                <div class="item-time">${escapeHtml(display.time)}</div>
                <h3 class="item-title">${escapeHtml(item.title)}</h3>
              </div>
              <span class="badge ${item.type === 'transport' ? 'badge-accent' : ''}">${normalizeType(item.type)}</span>
            </div>
            <p class="item-desc">${escapeHtml(item.desc)}</p>
            ${renderPoiAddressLine(item)}
            <div class="badge-row">
              <span class="badge">${escapeHtml(item.duration)}</span>
              <span class="badge">${escapeHtml(item.city)}</span>
              ${renderRatingBadge(item)}
              ${display.extra ? `<span class="badge badge-accent">${escapeHtml(display.extra)}</span>` : ''}
              ${conflicts.has(item.id) ? '<span class="badge badge-warn">时间冲突</span>' : ''}
            </div>
          </button>
        </article>
      `;
      }).join('') : '<div class="empty-state">当前筛选下没有日程节点。</div>';

      renderTransport(plan.transport_guide || []);
      renderQualityChecks(plan.quality_checks);
      renderBudget(plan.budget || {});
      el.budgetLevelBadge.textContent = state.budget;
      renderTips(plan.tips || []);
      renderPlaceDetail();
      el.mapTitle.textContent = `Day ${current.day} · ${cleanMetaValue(current.city)}`;
    }

    function renderQualityChecks(checks) {
      if (!el.qualityPanel) return;
      const normalized = checks || { status: 'pass', summary: '通过', items: [] };
      const items = normalized.items || [];
      const visibleItems = items.slice(0, 6);
      el.qualityPanel.dataset.status = normalized.status || 'pass';
      el.qualityPanel.innerHTML = `
        <div class="quality-head">
          <div>
            <h3 class="section-label">内部检查</h3>
            <p>这些内容仅用于发布前复核，不会复制到客户版行程。</p>
          </div>
          <span class="quality-status">${escapeHtml(normalized.summary || '通过')}</span>
        </div>
        <ul class="quality-list">
          ${visibleItems.map(item => `
            <li data-level="${escapeHtml(item.level)}">${escapeHtml(item.message)}</li>
          `).join('')}
        </ul>
      `;
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
                <h3 class="transport-title">${escapeHtml(segment.segment)}</h3>
                <p class="transport-advice">${escapeHtml(segment.advice) || '建议优先选择上午出发、午后抵达的班次。'}</p>
              </div>
              <span class="badge badge-accent">${escapeHtml(segment.source_label) || (segment.tool === 'plane' ? '航班' : '高铁')}</span>
            </div>
            <div class="option-list">
              ${options.map((option, optionIndex) => `
                <button class="option-row ${selected === optionIndex ? 'is-selected' : ''}" type="button" data-segment="${segmentIndex}" data-option="${optionIndex}">
                  <div>
                    <div class="option-code">${escapeHtml(option.id || option.flight_no || option.train_no) || '待定'}</div>
                    <div class="option-meta">${escapeHtml(option.time || `${option.depart_time || ''} - ${option.arrive_time || ''}`)} · ${escapeHtml(option.duration || option.duration_text) || '时长待定'}</div>
                  </div>
                  <div class="option-price">${escapeHtml(option.price) || '¥待定'}</div>
                  <div class="option-desc">${escapeHtml(option.desc || option.train_type || option.airline) || '推荐班次'}</div>
                </button>
              `).join('')}
            </div>
            ${segment.refreshError ? `<div class="badge-row"><span class="badge badge-warn">刷新失败：${escapeHtml(segment.refreshError)}</span></div>` : ''}
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
      const guide = state.itinerary?.transport_guide || [];
      if (guide.length) {
        const { total, missingCount } = computeSelectedTransportTotal();
        const value = total > 0
          ? `约 ¥${Math.round(total)}${missingCount ? `（${missingCount} 段待确认）` : ''}`
          : '待选择班次';
        rows.push(['已选班次交通合计', value]);
      }
      el.budgetList.innerHTML = rows.map(([label, value]) => `<div class="budget-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
    }

    function renderTips(tips) {
      const safeTips = tips.length ? tips : ['生成后会在这里展示跨城衔接、预约和当地交通建议。'];
      el.tipsList.innerHTML = safeTips.map(tip => `<li>${escapeHtml(tip)}</li>`).join('');
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
      const display = item.type === 'transport' ? transportDisplay(item) : { time: item.time, extra: '' };
      el.placeDetail.innerHTML = `
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(display.time)} · ${normalizeType(item.type)} · ${escapeHtml(item.duration)}</p>
        <p>${escapeHtml(item.desc)}</p>
        ${display.extra ? `<p><span class="badge badge-accent">${escapeHtml(display.extra)}</span></p>` : ''}
        ${renderPoiMetaList(item)}
      `;
    }

    function renderMap() {
      renderPlan();
      // Skip marker work while the drawer is closed (map may not exist yet).
      if (!state.mapDrawerOpen || !map) return;
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
        const isFocused = item.id === (state.mapFocusItemId || state.activeItemId);
        const icon = L.divIcon({
          className: '',
          html: `<div class="marker-pin${isFocused ? ' is-focused' : ''}">${index + 1}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        const marker = L.marker(point, { icon }).addTo(map);
        marker.bindPopup(`<strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(item.time)} · ${normalizeType(item.type)}${renderPopupMeta(item)}`);
        marker.on('click', () => {
          state.mapFocusItemId = item.id;
          focusItem(item.id, false);
        });
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

    async function refreshOneSegment(segment, date) {
      const key = normalizeSegKey(segment.segment);
      const [from, to] = key.split(' → ').map(part => part.trim());
      if (!from || !to) {
        throw new Error('无法解析该段的出发/到达城市');
      }
      const endpoint = segment.tool === 'plane' ? '/api/transport/flights' : '/api/transport/trains';
      const budgetParam = segment.tool === 'plane' ? '' : `&budget=${encodeURIComponent(state.budget)}`;
      const data = await fetchJson(`${endpoint}?from_city=${encodeURIComponent(from)}&to_city=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}${budgetParam}`);
      const list = segment.tool === 'plane' ? data.flights : data.trains;
      if (list?.length) {
        const options = list.slice(0, 6).map(item => ({
          id: item.flight_no || item.id || item.train_no,
          time: item.time || `${item.depart_time || item.departure_time || ''} - ${item.arrive_time || item.arrival_time || ''}`,
          duration: item.duration || item.duration_text || '',
          price: item.price || item.price_text || '¥待定',
          desc: item.desc || item.airline || item.train_type || '',
          from_station: item.from_airport || item.from_station || '',
          to_station: item.to_airport || item.to_station || '',
          source: item.source || data.source || ''
        })).filter(option => optionMatchesDirection(option, from, to));
        if (!options.length) throw new Error('未找到同方向班次');
        segment.options = options;
        if (segment.tool === 'plane') {
          segment.data_source = data.source === 'builtin' ? 'reference' : 'real';
          segment.source_label = data.source === 'builtin' ? '典型参考数据' : '实时航班数据';
        } else {
          segment.data_source = 'real';
          segment.source_label = '12306 实时数据';
        }
      } else {
        throw new Error('暂无可用班次');
      }
      delete segment.refreshError;
    }

    async function refreshTransport() {
      const plan = state.itinerary;
      if (!plan || !plan.transport_guide?.length) return;
      setStatus('正在刷新真实交通班次...');
      const date = el.departureDate.value || todayPlus(1);
      const segments = plan.transport_guide.filter(segment => segment.tool !== 'driving');
      const results = await Promise.allSettled(segments.map(segment => refreshOneSegment(segment, date)));

      let successCount = 0;
      let failCount = 0;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount += 1;
        } else {
          failCount += 1;
          segments[index].refreshError = result.reason?.message || '刷新失败';
        }
      });

      if (!segments.length) {
        setStatus('当前路线均为自驾段，无需联网刷新。');
      } else if (failCount === 0) {
        setStatus(`已刷新 ${successCount} 段。`);
      } else if (successCount === 0) {
        setStatus(`全部 ${failCount} 段刷新失败。`, 'error');
      } else {
        setStatus(`已刷新 ${successCount} 段，${failCount} 段失败。`);
      }
      renderPlan();
    }

    function switchMobileView(view) {
      document.body.dataset.mobileView = view;
      if (view === 'results') {
        if (Wizard.canEnterStep(3, wizardFlags())) setWizardStep(3);
        return;
      }
      if (view === 'planner') {
        setWizardStep(1);
        return;
      }
      if (view === 'map') openMapDrawer();
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

    function formatDeliveryDate(day) {
      const date = addDays(el.departureDate.value, day.day - 1);
      return date ? `${date} · ` : '';
    }

    function budgetRows(budget = {}) {
      return [
        ['交通', budget.transport || '暂无估算'],
        ['住宿', budget.hotel || '暂无估算'],
        ['餐饮', budget.food || '暂无估算'],
        ['门票', budget.tickets || '暂无估算'],
        ['合计', budget.total || '暂无估算']
      ];
    }

    function transportOptionText(segment) {
      const option = selectedOption(segment);
      if (!option) return '暂无可用班次，需人工确认';
      const code = option.id ? `${option.id} ` : '';
      const price = option.price ? ` · ${option.price}` : '';
      const station = option.from_station || option.to_station
        ? ` · ${option.from_station || segment.from_city || ''} → ${option.to_station || segment.to_city || ''}`
        : '';
      return `${code}${option.time || '时间待定'} · ${option.duration || '时长待定'}${price}${station}`;
    }

    function buildDeliveryText(plan) {
      const lines = [];
      const route = state.cities.map(city => city.name).join(' → ');

      lines.push(plan.title || '旅行规划方案');
      if (plan.summary) lines.push(plan.summary);
      lines.push('');
      lines.push(`【行程概览】${route} · ${state.totalDays}天 · ${state.budget}`);
      lines.push('');

      (plan.days || []).forEach(day => {
        const cast = weatherForDay(day);
        const weather = cast ? ` · ${cast.dayweather} ${cast.nighttemp}~${cast.daytemp}℃` : '';
        lines.push(`【Day ${day.day}｜${formatDeliveryDate(day)}${day.city}${weather}】`);
        if (day.route) lines.push(day.route);
        (day.items || []).forEach(item => {
          const display = item.type === 'transport' ? transportDisplay(item) : { time: item.time, extra: '' };
          const meta = [display.time, normalizeType(item.type), item.duration].filter(Boolean).join(' · ');
          lines.push(`- ${meta}｜${item.title}`);
          if (item.desc) lines.push(`  ${item.desc}`);
          if (item.address) lines.push(`  地址：${item.address}`);
        });
        lines.push('');
      });

      const guide = plan.transport_guide || [];
      if (guide.length) {
        lines.push('【城际交通】');
        guide.forEach(segment => {
          lines.push(`- ${segment.segment}｜${segment.source_label || '需确认'}`);
          lines.push(`  ${transportOptionText(segment)}`);
          if (segment.advice) lines.push(`  建议：${segment.advice}`);
        });
        lines.push('');
      }

      lines.push('【费用估算】');
      budgetRows(plan.budget).forEach(([label, value]) => lines.push(`- ${label}：${value}`));
      const selectedTotal = computeSelectedTransportTotal();
      if (selectedTotal.total > 0) lines.push(`- 已选交通参考合计：约 ¥${Math.round(selectedTotal.total)}`);
      lines.push('');

      lines.push('【出行贴士】');
      (plan.tips || []).slice(0, 8).forEach(tip => lines.push(`- ${tip}`));
      lines.push('');

      lines.push('【温馨说明】');
      lines.push('- 景点地址、评分、开放时间等信息来自高德 POI 或本地参考数据。');
      lines.push('- 火车班次优先参考 12306；航班如无实时接口则显示典型参考数据。');
      lines.push('- 本方案为参考旅行规划，不含机票、酒店、门票代订；开放时间、票价、班次以官方实时信息为准。');

      return lines.join('\n');
    }

    function deliveryItemHtml(item) {
      const display = item.type === 'transport' ? transportDisplay(item) : { time: item.time, extra: '' };
      const desc = item.desc ? `<p>${escapeHtml(item.desc)}</p>` : '';
      const address = item.address ? `<p class="delivery-meta">地址：${escapeHtml(item.address)}</p>` : '';
      return `
        <div class="delivery-item">
          <div class="delivery-time">${escapeHtml(display.time)}</div>
          <div>
            <h4>${escapeHtml(item.title)}</h4>
            <div class="delivery-meta">${normalizeType(item.type)} · ${escapeHtml(item.duration)}</div>
            ${desc}
            ${address}
          </div>
        </div>
      `;
    }

    function buildDeliverySheetHtml(plan) {
      const route = state.cities.map(city => city.name).join(' → ');
      const daysHtml = (plan.days || []).map(day => {
        const cast = weatherForDay(day);
        const weather = cast ? `${escapeHtml(cast.dayweather)} ${escapeHtml(cast.nighttemp)}~${escapeHtml(cast.daytemp)}℃` : '';
        return `
          <section class="delivery-section">
            <div class="delivery-day-head">
              <span>Day ${day.day}</span>
              <strong>${escapeHtml(day.city)}</strong>
              ${weather ? `<em>${weather}</em>` : ''}
            </div>
            ${day.route ? `<p class="delivery-route">${escapeHtml(day.route)}</p>` : ''}
            ${(day.items || []).map(deliveryItemHtml).join('')}
          </section>
        `;
      }).join('');

      const transportHtml = (plan.transport_guide || []).map(segment => `
        <div class="delivery-mini-row">
          <strong>${escapeHtml(segment.segment)}</strong>
          <span>${escapeHtml(segment.source_label || '需确认')}</span>
          <p>${escapeHtml(transportOptionText(segment))}</p>
        </div>
      `).join('');

      return `
        <div class="delivery-sheet">
          <header class="delivery-cover">
            <div class="delivery-brand">AeroTravel</div>
            <h2>${escapeHtml(plan.title || '旅行规划方案')}</h2>
            <p>${escapeHtml(plan.summary || '')}</p>
            <div class="delivery-tags">
              <span>${escapeHtml(route)}</span>
              <span>${state.totalDays} 天</span>
              <span>${escapeHtml(state.budget)}</span>
            </div>
          </header>
          ${daysHtml}
          ${transportHtml ? `<section class="delivery-section"><h3>城际交通</h3>${transportHtml}</section>` : ''}
          <section class="delivery-section">
            <h3>费用估算</h3>
            ${budgetRows(plan.budget).map(([label, value]) => `
              <div class="delivery-budget"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
            `).join('')}
          </section>
          <section class="delivery-section">
            <h3>出行贴士</h3>
            <ul>${(plan.tips || []).slice(0, 8).map(tip => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>
          </section>
          <footer class="delivery-disclaimer">
            本方案为参考旅行规划，不含机票、酒店、门票代订；开放时间、票价、班次以官方实时信息为准。
          </footer>
        </div>
      `;
    }

    function downloadBlob(blob, filename) {
      window.AeroTravelExport.downloadBlob(blob, filename);
    }

    function copyPlan() {
      const plan = state.itinerary;
      if (!plan) {
        showToast('暂无行程可供复制，请先生成规划。', 'error');
        return;
      }
      refreshQualityChecks();
      const text = buildDeliveryText(plan);
      
      copyTextToClipboard(text)
        .then(() => showToast('客户版行程已复制。', 'success'))
        .catch(() => showToast('复制失败，您的浏览器不支持直接复制，请手动选择文本。', 'error'));
    }

    async function exportLongImage() {
      const plan = state.itinerary;
      if (!plan) {
        showToast('暂无行程可供导出，请先生成规划。', 'error');
        return;
      }
      if (!window.html2canvas) {
        showToast('长图组件加载失败，请先使用复制客户行程。', 'error');
        return;
      }

      refreshQualityChecks();
      const wrapper = document.createElement('div');
      wrapper.className = 'delivery-export-host';
      wrapper.innerHTML = buildDeliverySheetHtml(plan);
      document.body.appendChild(wrapper);
      try {
        const sheet = wrapper.querySelector('.delivery-sheet');
        const canvas = await window.html2canvas(sheet, {
          backgroundColor: '#faf9f5',
          scale: 2,
          useCORS: true,
          logging: false
        });
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
        if (!blob) throw new Error('图片生成失败');
        downloadBlob(blob, `${cleanMetaValue(plan.title) || '旅行规划'}.png`);
        showToast('客户版长图已导出。', 'success');
      } catch (error) {
        showToast(`长图导出失败：${error.message || '请改用复制文案'}`, 'error');
      } finally {
        wrapper.remove();
      }
    }

    function icsEscape(text) {
      return window.AeroTravelExport.icsEscape(text);
    }

    function icsDateStamp() {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    }

    function buildIcsCalendar(plan) {
      return window.AeroTravelExport.buildIcsCalendar(plan, {
        departureDate: el.departureDate.value,
        addDays,
        parseTimeRange,
        findSegment,
        selectedOption
      });
    }

    function exportItineraryToIcs() {
      const plan = state.itinerary;
      if (!plan) {
        showToast('暂无行程可供导出，请先生成规划。', 'error');
        return;
      }
      const text = buildIcsCalendar(plan);
      const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
      downloadBlob(blob, `${cleanMetaValue(plan.title) || '行程'}.ics`);
      showToast('日历文件已导出，可导入手机日历。', 'success');
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
          renderWizardChrome();
        }
        if (daysSelect) {
          state.cities[Number(daysSelect.dataset.index)].days = Number(daysSelect.value);
          renderWizardChrome();
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
      if (el.daysRange) {
        el.daysRange.addEventListener('input', () => {
          renderWizardChrome();
        });
      }

      [el.paceGroup, el.transportGroup, el.budgetGroup].filter(Boolean).forEach(group => {
        group.querySelectorAll('button[data-value]').forEach(button => {
          button.addEventListener('click', () => {
            group.querySelectorAll('button').forEach(item => item.classList.remove('is-active'));
            button.classList.add('is-active');
            state.pace = getActive(el.paceGroup);
            state.globalTransport = getActive(el.transportGroup);
            state.budget = getActive(el.budgetGroup);
            if (group === el.budgetGroup && state.itinerary) {
              renderPlan();
            }
            renderWizardChrome();
          });
        });
      });

      if (el.generateBtn) el.generateBtn.addEventListener('click', generatePlan);
      if (el.regenerateBtn) el.regenerateBtn.addEventListener('click', generatePlan);
      if (el.wizardNextBtn) el.wizardNextBtn.addEventListener('click', goNextFromStep1);
      if (el.wizardBackBtn) el.wizardBackBtn.addEventListener('click', () => setWizardStep(1));
      if (el.wizardEditPrefsBtn) el.wizardEditPrefsBtn.addEventListener('click', () => setWizardStep(2));
      if (el.wizardSteps) {
        el.wizardSteps.addEventListener('click', event => {
          const button = event.target.closest('[data-step]');
          if (!button) return;
          setWizardStep(button.dataset.step);
        });
      }
      if (el.openMapDrawerBtn) {
        el.openMapDrawerBtn.addEventListener('click', () => openMapDrawer(state.activeItemId));
      }
      if (el.closeMapDrawerBtn) el.closeMapDrawerBtn.addEventListener('click', closeMapDrawer);
      if (el.mapDrawerBackdrop) el.mapDrawerBackdrop.addEventListener('click', closeMapDrawer);
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && state.mapDrawerOpen) closeMapDrawer();
      });
      if (el.copyPlanBtn) el.copyPlanBtn.addEventListener('click', copyPlan);
      if (el.exportLongImageBtn) el.exportLongImageBtn.addEventListener('click', exportLongImage);
      if (el.exportIcsBtn) el.exportIcsBtn.addEventListener('click', exportItineraryToIcs);

      if (el.savedTripsBtn && el.savedTripsPanel) {
        el.savedTripsBtn.setAttribute('aria-haspopup', 'menu');
        el.savedTripsBtn.setAttribute('aria-expanded', 'false');

        el.savedTripsBtn.addEventListener('click', event => {
          event.stopPropagation();
          setSavedTripsPanelOpen(el.savedTripsPanel.hidden);
        });

        el.savedTripsPanel.addEventListener('click', event => {
          const restoreButton = event.target.closest('[data-restore-id]');
          const deleteButton = event.target.closest('[data-delete-id]');
          if (restoreButton) {
            const id = Number(restoreButton.dataset.restoreId);
            restoreTripSnapshot(id);
            setSavedTripsPanelOpen(false);
          } else if (deleteButton) {
            const id = Number(deleteButton.dataset.deleteId);
            deleteTripSnapshot(id);
            renderSavedTripsPanel();
          }
        });

        document.addEventListener('pointerdown', event => {
          if (el.savedTripsPanel.hidden) return;
          if (el.savedTripsPanel.contains(event.target) || event.target === el.savedTripsBtn) return;
          setSavedTripsPanelOpen(false);
        }, true);
      }

      if (el.mobileMoreBtn && el.mobileMorePanel) {
        el.mobileMoreBtn.addEventListener('click', event => {
          event.stopPropagation();
          el.mobileMorePanel.hidden = !el.mobileMorePanel.hidden;
        });
        el.mobileMorePanel.addEventListener('click', event => {
          const button = event.target.closest('[data-action]');
          if (!button) return;
          const action = button.dataset.action;
          el.mobileMorePanel.hidden = true;
          if (action === 'saved-trips' && el.savedTripsBtn) el.savedTripsBtn.click();
          else if (action === 'copy') copyPlan();
          else if (action === 'export-image') exportLongImage();
          else if (action === 'export-ics') exportItineraryToIcs();
        });
        document.addEventListener('pointerdown', event => {
          if (el.mobileMorePanel.hidden) return;
          if (el.mobileMoreWrap?.contains(event.target)) return;
          el.mobileMorePanel.hidden = true;
        }, true);
      }

      if (el.refreshTransportBtn) el.refreshTransportBtn.addEventListener('click', refreshTransport);
      if (el.fitMapBtn) el.fitMapBtn.addEventListener('click', renderMap);
      if (el.plannerBody) el.plannerBody.addEventListener('scroll', () => syncPaneBriefState(el.plannerPane, el.plannerBody), { passive: true });
      if (el.resultsBody) el.resultsBody.addEventListener('scroll', () => syncPaneBriefState(el.resultsPane, el.resultsBody), { passive: true });

      if (el.dayTabs) {
        el.dayTabs.addEventListener('click', event => {
          const button = event.target.closest('[data-day]');
          if (!button) return;
          state.currentDay = Number(button.dataset.day);
          state.currentFilter = 'all';
          state.activeItemId = activeItems()[0]?.id || null;
          state.mapFocusItemId = state.mapDrawerOpen ? state.activeItemId : state.mapFocusItemId;
          renderPlan();
          if (state.mapDrawerOpen) {
            try { renderMap(); } catch (_) { /* map not ready */ }
            setTimeout(() => { if (map) map.invalidateSize(); }, 60);
          }
        });
      }

      if (el.filterTabs) {
        el.filterTabs.addEventListener('click', event => {
          const button = event.target.closest('[data-filter]');
          if (!button) return;
          state.currentFilter = button.dataset.filter;
          renderPlan();
        });
      }

      if (el.timelineList) {
        el.timelineList.addEventListener('click', event => {
          const card = event.target.closest('[data-item]');
          if (!card) return;
          const itemId = card.dataset.item;
          const item = activeItems().find(entry => String(entry.id) === String(itemId));
          const hasCoords = item && Number(item.lat) && Number(item.lng);
          const isPlaceable = item && (hasCoords || item.type === 'experience' || item.type === 'food' || item.type === 'hotel');
          // Placeable POIs open the map drawer with focus; transport/other can open optionally.
          if (isPlaceable || (item && item.type === 'transport')) {
            openMapDrawer(itemId);
          } else {
            focusItem(itemId, false);
          }
        });
      }

      if (el.transportList) {
        el.transportList.addEventListener('click', event => {
          const option = event.target.closest('[data-segment][data-option]');
          if (!option || !state.itinerary) return;
          const segment = state.itinerary.transport_guide[Number(option.dataset.segment)];
          state.selectedOptions[segment.segment] = Number(option.dataset.option);
          renderPlan();
        });
      }

      const mobileNav = document.querySelector('.mobile-nav');
      if (mobileNav) {
        mobileNav.addEventListener('click', event => {
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
      // Lazy map init: #map lives in a hidden drawer; ensureMap() runs on first open.
      const fallback = buildFallbackItinerary(state.cities.map(city => ({ city: city.name, center: getCenter(city.name), pois: fallbackPois(city.name) })));
      applyPlan(fallback, '已载入可交互示例。修改路线后点击生成即可连接后端规划。', { skipWizardJump: true });
      bindEvents();
      syncBriefStates();
      updateSavedTripsBadge();
      renderWizardChrome();
    }

    document.addEventListener('DOMContentLoaded', boot);
