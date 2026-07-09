(function () {
  function icsEscape(text) {
    return String(text == null ? '' : text)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\n|\r/g, '\\n');
  }

  function icsDateStamp() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  }

  function buildIcsCalendar(plan, options) {
    const days = plan?.days || [];
    const dtstamp = icsDateStamp();
    const events = [];
    const pad = n => String(n).padStart(2, '0');
    const toTime = mins => `${pad(Math.floor(mins / 60) % 24)}${pad(mins % 60)}00`;
    let seq = 0;

    days.forEach(day => {
      seq += 1;
      const startDateRaw = options.addDays(options.departureDate, day.day - 1);
      const endDateRaw = options.addDays(options.departureDate, day.day);
      const startDate = startDateRaw ? startDateRaw.replace(/-/g, '') : '';
      const endDate = endDateRaw ? endDateRaw.replace(/-/g, '') : '';
      const summary = icsEscape(day.title || `Day ${day.day} · ${day.city}`);
      const description = icsEscape((day.items || []).map(item => item.title).join(' / '));
      const uid = `${Date.now()}-${seq}@aerotravel.local`;
      if (startDate && endDate) {
        events.push([
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;VALUE=DATE:${startDate}`,
          `DTEND;VALUE=DATE:${endDate}`,
          `SUMMARY:${summary}`,
          `DESCRIPTION:${description}`,
          'END:VEVENT'
        ].join('\r\n'));
      }

      (day.items || []).forEach(item => {
        if (item.type !== 'transport') return;
        seq += 1;
        const transportUid = `${Date.now()}-${seq}@aerotravel.local`;
        const segment = options.findSegment(item.fromCity, item.city);
        const option = options.selectedOption(segment);
        const timeStr = option?.time || item.time;
        const range = options.parseTimeRange(timeStr);
        const transportSummary = icsEscape(`${option?.id || '城际交通'} ${item.fromCity}→${item.city}`);
        if (range && startDate) {
          const endDateBase = range[1] >= 1440 ? endDate : startDate;
          events.push([
            'BEGIN:VEVENT',
            `UID:${transportUid}`,
            `DTSTAMP:${dtstamp}`,
            `DTSTART:${startDate}T${toTime(range[0])}`,
            `DTEND:${endDateBase}T${toTime(range[1])}`,
            `SUMMARY:${transportSummary}`,
            'END:VEVENT'
          ].join('\r\n'));
        } else if (startDate && endDate) {
          events.push([
            'BEGIN:VEVENT',
            `UID:${transportUid}`,
            `DTSTAMP:${dtstamp}`,
            `DTSTART;VALUE=DATE:${startDate}`,
            `DTEND;VALUE=DATE:${endDate}`,
            `SUMMARY:${transportSummary}`,
            'END:VEVENT'
          ].join('\r\n'));
        }
      });
    });

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AeroTravel//CN',
      ...events,
      'END:VCALENDAR'
    ].join('\r\n');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  window.AeroTravelExport = Object.freeze({
    buildIcsCalendar,
    downloadBlob,
    icsEscape
  });
})();
