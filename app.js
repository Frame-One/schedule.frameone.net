const EVENTS = [
  { label: "Frosty Faustings XVII", file: "data/frosty-faustings-xvii/frosty-faustings-xvii.json" },
  { label: "Template", file: "data/template/template.json" },
];

const ADDITIONAL_TIMEZONES = [
  { name: "US Pacific (CA)", iana: "America/Los_Angeles" },
  { name: "US Central (TX)", iana: "America/Chicago" },
  { name: "US Eastern (NY)", iana: "America/New_York" },
  { name: "BRT/ART", iana: "America/Sao_Paulo" },
  { name: "UTC (UK/IRL/POR)", iana: "UTC" },
  { name: "CET (ESP/FRA/GER/ITA)", iana: "Europe/Paris" },
  { name: "Japan/Korea", iana: "Asia/Tokyo" },
  { name: "AUS East. (Syd./Melb.)", iana: "Australia/Sydney" },
  { name: "New Zealand", iana: "Pacific/Auckland" },
];

let currentEventData = null;
let currentDayIndex = 0;
let playheadInterval = null;

// ── Formatting helpers ──────────────────────────────────────────────

function formatDate(isoDate) {
  // isoDate is "YYYY-MM-DD" – parse as local date
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(isoString, timeZone) {
  try {
    const dt = new Date(isoString);
    if (isNaN(dt.getTime())) return isoString;
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    });
    let formatted = formatter.format(dt).toLowerCase();
    // Strip ":00" for on-the-hour times → "10:00 AM" → "10am"
    formatted = formatted.replace(":00", "").replace(/\s/g, "");
    return formatted;
  } catch (e) {
    console.error("formatTime error:", e, isoString, timeZone);
    return isoString;
  }
}

function formatUtcOffset(isoString, timeZone) {
  try {
    const dt = new Date(isoString);
    if (isNaN(dt.getTime())) return "";
    // Try shortOffset first (modern browsers), fall back to manual calculation
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "shortOffset",
      }).formatToParts(dt);
      const tzPart = parts.find((p) => p.type === "timeZoneName");
      if (tzPart) {
        return tzPart.value.replace("GMT", "UTC ").replace("UTC  ", "UTC ").trim();
      }
    } catch (_) {
      // shortOffset not supported – compute manually
      const utcStr = dt.toLocaleString("en-US", { timeZone: "UTC" });
      const tzStr = dt.toLocaleString("en-US", { timeZone });
      const diffMs = new Date(tzStr) - new Date(utcStr);
      const diffHrs = Math.round(diffMs / 3600000);
      if (diffHrs === 0) return "UTC";
      return `UTC ${diffHrs > 0 ? "+" : ""}${diffHrs}`;
    }
    return "";
  } catch (e) {
    console.error("formatUtcOffset error:", e);
    return "";
  }
}

function shortDayAbbrev(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ["SUN.", "MON.", "TUE.", "WED.", "THU.", "FRI.", "SAT."];
  return days[dt.getDay()];
}

function tzDisplayName(iana) {
  // "America/Chicago" → "US Central", etc. – use lookup first, fall back to IANA
  const match = ADDITIONAL_TIMEZONES.find((tz) => tz.iana === iana);
  return match ? match.name : iana;
}

function getDateInTz(isoString, timeZone) {
  const dt = new Date(isoString);
  const parts = dt.toLocaleDateString("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return parts; // returns YYYY-MM-DD, sortable and comparable
}

function generateTimeSlots(startTime, endTime) {
  // Parse the UTC offset from the startTime string (e.g., "-06:00")
  const offsetMatch = startTime.match(/([+-]\d{2}:\d{2})$/);
  const offsetStr = offsetMatch ? offsetMatch[1] : "Z";
  const offsetSign = offsetStr[0] === "-" ? -1 : 1;
  const offsetH = parseInt(offsetStr.slice(1, 3), 10);
  const offsetM = parseInt(offsetStr.slice(4, 6), 10);
  const offsetMs = offsetSign * (offsetH * 3600000 + offsetM * 60000);

  const slots = [];
  let current = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  while (current < end) {
    // Compute the local date/time components for this offset
    const local = new Date(current + offsetMs);
    const iso = local.toISOString().replace("Z", ""); // local time as ISO without Z
    slots.push(iso.slice(0, 19) + offsetStr);
    current += 1800000; // 30 minutes
  }
  return slots;
}

function getDayTimeSlots(day) {
  if (day.timeSlots) return day.timeSlots;
  return generateTimeSlots(day.startTime, day.endTime);
}

// ── Init & loading ──────────────────────────────────────────────────

async function init() {
  const eventSelect = document.getElementById("eventSelect");
  const daySelect = document.getElementById("scheduleSelect");

  // Fetch all event JSONs to get their first/last date for sorting & default selection
  const allEventMeta = await Promise.all(
    EVENTS.map(async (e) => {
      try {
        const res = await fetch(e.file);
        const data = await res.json();
        const firstDate = data.days && data.days[0] ? data.days[0].date : "9999-12-31";
        const lastDate = data.days && data.days.length ? data.days[data.days.length - 1].date : firstDate;
        const weight = data.weight || 0;
        const hidden = data.hidden === true;
        return { ...e, firstDate, lastDate, weight, hidden };
      } catch {
        return { ...e, firstDate: "9999-12-31", lastDate: "9999-12-31", weight: 0, hidden: false };
      }
    })
  );

  // Filter out hidden events, then sort by first date (earliest first)
  const eventMeta = allEventMeta.filter((e) => !e.hidden);
  eventMeta.sort((a, b) => a.firstDate.localeCompare(b.firstDate));

  eventMeta.forEach((e) => {
    const opt = document.createElement("option");
    opt.value = e.file;
    opt.textContent = e.label;
    eventSelect.appendChild(opt);
  });

  // Pick default event: closest to today (currently running or next upcoming)
  const today = new Date().toISOString().slice(0, 10);
  let defaultIdx = 0;

  // First, check if any event is currently running (today is between first and last date inclusive)
  // If multiple are running, pick the one with the highest weight
  const running = eventMeta
    .map((e, i) => ({ ...e, idx: i }))
    .filter((e) => e.firstDate <= today && today <= e.lastDate);
  if (running.length > 0) {
    running.sort((a, b) => b.weight - a.weight);
    defaultIdx = running[0].idx;
  } else {
    // Otherwise pick the next upcoming event (first date >= today)
    const upcomingIdx = eventMeta.findIndex((e) => e.firstDate >= today);
    if (upcomingIdx !== -1) {
      defaultIdx = upcomingIdx;
    } else {
      // All events are in the past — pick the most recent one (last in sorted list)
      defaultIdx = eventMeta.length - 1;
    }
  }

  eventSelect.value = eventMeta[defaultIdx].file;

  eventSelect.addEventListener("change", () => loadEvent(eventSelect.value));
  daySelect.addEventListener("change", () => {
    currentDayIndex = parseInt(daySelect.value, 10);
    renderDay(currentDayIndex);
  });

  await loadEvent(eventMeta[defaultIdx].file);
}

async function loadEvent(file) {
  try {
    const res = await fetch(file);
    currentEventData = await res.json();
    populateDaySelect(currentEventData.days);

    // Default to today's date if it matches a day in the event
    const today = new Date().toISOString().slice(0, 10);
    const todayIdx = currentEventData.days.findIndex((d) => d.date === today);
    currentDayIndex = todayIdx !== -1 ? todayIdx : 0;

    const daySelect = document.getElementById("scheduleSelect");
    daySelect.value = currentDayIndex;
    renderDay(currentDayIndex);
  } catch (err) {
    console.error("Failed to load schedule:", err);
    document.getElementById("gridWrapper").innerHTML =
      '<p style="padding:24px;text-align:center;color:#f66;">Failed to load schedule data.</p>';
  }
}

function populateDaySelect(days) {
  const daySelect = document.getElementById("scheduleSelect");
  daySelect.innerHTML = "";
  days.forEach((day, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = formatDate(day.date);
    daySelect.appendChild(opt);
  });
}

// ── Rendering ───────────────────────────────────────────────────────

function renderDay(dayIndex) {
  const day = currentEventData.days[dayIndex];
  const tz = currentEventData.timezone;

  document.getElementById("eventTitle").textContent =
    currentEventData.eventName || "Tournament Schedule";

  const logoEl = document.getElementById("eventLogo");
  if (currentEventData.logo) {
    logoEl.innerHTML = `<img src="${currentEventData.logo}" alt="">`;
  } else {
    logoEl.innerHTML = "";
  }

  document.getElementById("dayTitle").textContent = formatDate(day.date);
  document.getElementById("siteFooter").textContent =
    currentEventData.footerText || "";

  renderGrid(day, tz);
  renderTimezones(day, tz);
}

function renderGrid(data, eventTz) {
  const wrapper = document.getElementById("gridWrapper");
  wrapper.innerHTML = "";

  const timeSlots = getDayTimeSlots(data);
  const { streams } = data;
  const totalSlots = timeSlots.length;
  const labelWidth = "180px";
  const gridCols = `${labelWidth} repeat(${totalSlots}, 1fr)`;

  // Build the primary timezone label from the data
  const dayAbbrev = shortDayAbbrev(data.date);
  const tzName = tzDisplayName(eventTz);
  const utcOffset = formatUtcOffset(timeSlots[0], eventTz);

  // Time header row
  const headerRow = document.createElement("div");
  headerRow.className = "time-header-row";
  headerRow.style.gridTemplateColumns = gridCols;

  const labelCell = document.createElement("div");
  labelCell.className = "label-cell";
  labelCell.innerHTML = `
    <div>
      <div class="tz-primary">${dayAbbrev} (${tzName})</div>
      <div class="tz-secondary">${utcOffset}</div>
    </div>`;
  headerRow.appendChild(labelCell);

  for (let i = 0; i < timeSlots.length; i++) {
    const iso = timeSlots[i];
    const mins = new Date(iso).getMinutes();
    const cell = document.createElement("div");
    cell.className = "time-cell";
    if (mins === 0) {
      // On-the-hour: span 2 columns if a half-hour slot follows, otherwise 1
      const hasHalfHour = i + 1 < timeSlots.length && new Date(timeSlots[i + 1]).getMinutes() === 30;
      if (hasHalfHour) {
        cell.style.gridColumn = "span 2";
        i++; // skip the half-hour slot
      }
      cell.textContent = formatTime(iso, eventTz);
    } else {
      // Standalone half-hour slot (no preceding hour absorbed it)
      cell.textContent = formatTime(iso, eventTz);
    }
    headerRow.appendChild(cell);
  }
  wrapper.appendChild(headerRow);

  // Stream rows
  streams.forEach((stream) => {
    const row = document.createElement("div");
    row.className = "stream-row";
    row.style.gridTemplateColumns = `${labelWidth} 1fr`;

    const platform = (stream.platform || "").replace(/\/+$/, "");
    const streamUrl = platform && stream.name
      ? `https://${platform}/${stream.name}`
      : null;

    const label = document.createElement("div");
    label.className = "stream-label";
    label.innerHTML = `
      <div class="stream-icon">IMG</div>
      <div class="stream-info">
        ${streamUrl
          ? `<a class="stream-link" href="${streamUrl}" target="_blank" rel="noopener noreferrer">
              <span class="stream-platform">${platform}/</span>
              <span class="stream-name">${stream.name}</span>
            </a>`
          : `<span class="stream-platform">${platform || ""}</span>
             <span class="stream-name">${stream.name}</span>`
        }
      </div>`;
    row.appendChild(label);

    const track = document.createElement("div");
    track.className = "events-track";
    track.style.position = "relative";

    stream.events.forEach((evt) => {
      const block = createEventBlock(evt, timeSlots, eventTz);
      if (block) track.appendChild(block);
    });

    row.appendChild(track);
    wrapper.appendChild(row);
  });

  // Playhead — vertical line showing the current time
  updatePlayhead(wrapper, timeSlots, labelWidth);
  if (playheadInterval) clearInterval(playheadInterval);
  playheadInterval = setInterval(() => {
    updatePlayhead(wrapper, timeSlots, labelWidth);
  }, 60000);
}

function updatePlayhead(wrapper, timeSlots, labelWidth) {
  // Remove any existing playhead
  const existing = wrapper.querySelector(".playhead");
  if (existing) existing.remove();

  if (!timeSlots.length) return;

  const now = Date.now();
  const slotTimes = timeSlots.map((iso) => new Date(iso).getTime());
  const firstSlot = slotTimes[0];
  const lastSlot = slotTimes[slotTimes.length - 1];

  // Only show if "now" is within the grid's time range
  if (now < firstSlot || now > lastSlot) return;

  // Interpolate position between slots
  let interpIdx = 0;
  for (let i = 0; i < slotTimes.length - 1; i++) {
    if (now >= slotTimes[i] && now <= slotTimes[i + 1]) {
      const frac = (now - slotTimes[i]) / (slotTimes[i + 1] - slotTimes[i]);
      interpIdx = i + frac;
      break;
    }
  }

  const totalSlots = timeSlots.length;
  const pct = (interpIdx / totalSlots) * 100;

  const playhead = document.createElement("div");
  playhead.className = "playhead";
  // Position within the time-slots area (after the 180px label column)
  playhead.style.left = `calc(180px + (100% - 180px) * ${pct / 100})`;

  wrapper.appendChild(playhead);
}

function createEventBlock(evt, timeSlots, eventTz) {
  const startIdx = timeSlots.indexOf(evt.start);
  if (startIdx === -1) return null;

  const totalSlots = timeSlots.length;
  let endIdx = timeSlots.indexOf(evt.end);

  // If end time is beyond the last slot, extend to fill the grid
  if (endIdx === -1) {
    const endTime = new Date(evt.end).getTime();
    const lastSlotTime = new Date(timeSlots[totalSlots - 1]).getTime();
    if (endTime > lastSlotTime) {
      endIdx = totalSlots;
    } else {
      return null;
    }
  }

  if (endIdx <= startIdx) return null;

  const leftPct = (startIdx / totalSlots) * 100;
  const widthPct = ((endIdx - startIdx) / totalSlots) * 100;

  const block = document.createElement("div");
  block.className = "event-block";
  block.style.left = `${leftPct}%`;
  block.style.width = `${widthPct}%`;
  block.style.background = evt.color || "#888";

  const isNarrow = endIdx - startIdx <= 2;
  const startFmt = formatTime(evt.start, eventTz);
  const endFmt = formatTime(evt.end, eventTz);

  const iconHtml = evt.icon
    ? `<img class="event-game-icon" src="${evt.icon}" alt="">`
    : (!isNarrow ? '<div class="event-game-icon">GAME</div>' : "");

  block.innerHTML = `
    ${iconHtml}
    <div class="event-text">
      <div class="event-title-text">${evt.game}</div>
      <div class="event-phase">${evt.phase || ""}</div>
    </div>
    <div class="tooltip">
      <div class="tooltip-game">${evt.game}</div>
      <div class="tooltip-phase">${evt.phase || ""}</div>
      <div class="tooltip-time">${startFmt} - ${endFmt}</div>
    </div>`;

  return block;
}

// ── Timezone section (computed from ISO data) ───────────────────────

function getUserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (_) {
    return null;
  }
}

function buildTzRow(tz, timeSlots, eventDayName, gridCols, isUserRow) {
  const row = document.createElement("div");
  row.className = "tz-row" + (isUserRow ? " user-tz-row" : "");
  row.style.gridTemplateColumns = gridCols;

  const utcOffset = formatUtcOffset(timeSlots[0], tz.iana);

  const label = document.createElement("div");
  label.className = "tz-label";
  label.innerHTML = `
    <span class="tz-label-name">${tz.name}</span>
    <span class="tz-label-offset">${utcOffset}</span>`;
  row.appendChild(label);

  // Find the first slot index that falls on the NEXT day (after the event day)
  let firstNextDayIdx = -1;
  timeSlots.forEach((iso, i) => {
    const cellDay = getDateInTz(iso, tz.iana);
    if (cellDay > eventDayName && firstNextDayIdx === -1) {
      firstNextDayIdx = i;
    }
  });

  // Apply a background gradient on the row if there's a next-day transition
  if (firstNextDayIdx > 0) {
    const totalSlots = timeSlots.length;
    const transitionSlot = firstNextDayIdx;
    const pctStart = ((transitionSlot - 0.5) / totalSlots) * 100;
    const pctEnd = ((transitionSlot + 0.5) / totalSlots) * 100;
    row.style.background = `linear-gradient(to right, transparent ${pctStart}%, rgba(91, 192, 235, 0.08) ${pctEnd}%)`;
    row.style.backgroundPosition = "180px 0";
    row.style.backgroundSize = "calc(100% - 180px) 100%";
    row.style.backgroundRepeat = "no-repeat";
  } else if (firstNextDayIdx === 0) {
    // All slots are next day
    row.style.background = `linear-gradient(to right, rgba(91, 192, 235, 0.08), rgba(91, 192, 235, 0.08))`;
    row.style.backgroundPosition = "180px 0";
    row.style.backgroundSize = "calc(100% - 180px) 100%";
    row.style.backgroundRepeat = "no-repeat";
  }

  for (let i = 0; i < timeSlots.length; i++) {
    const iso = timeSlots[i];
    const mins = new Date(iso).getMinutes();
    const cell = document.createElement("div");
    cell.className = "tz-time-cell";
    const cellDay = getDateInTz(iso, tz.iana);
    if (cellDay > eventDayName) {
      cell.classList.add("next-day-cell");
    }
    if (mins === 0) {
      const hasHalfHour = i + 1 < timeSlots.length && new Date(timeSlots[i + 1]).getMinutes() === 30;
      if (hasHalfHour) {
        cell.style.gridColumn = "span 2";
        i++;
      }
      cell.textContent = formatTime(iso, tz.iana);
    } else {
      cell.textContent = formatTime(iso, tz.iana);
    }
    row.appendChild(cell);
  }

  return row;
}

function renderTimezones(data, eventTz) {
  const section = document.getElementById("timezoneSection");
  section.innerHTML = "";

  const timeSlots = getDayTimeSlots(data);
  if (!timeSlots || timeSlots.length === 0) return;

  const totalSlots = timeSlots.length;
  const labelWidth = "180px";
  const gridCols = `${labelWidth} repeat(${totalSlots}, 1fr)`;

  const eventDayName = getDateInTz(timeSlots[0], eventTz);

  // Detect user's system timezone
  const userTzIana = getUserTimezone();

  // Build the user's timezone entry (shown first, unless it matches the event tz)
  let userTzEntry = null;
  if (userTzIana && userTzIana !== eventTz) {
    // Check if the user's tz matches a known name, otherwise use the IANA id
    const knownMatch = ADDITIONAL_TIMEZONES.find((tz) => tz.iana === userTzIana);
    const displayName = knownMatch ? knownMatch.name : userTzIana.replace(/_/g, " ");
    userTzEntry = { name: "Your Time (" + displayName + ")", iana: userTzIana };
  }

  // Filter the static list: skip the event tz, and skip the user tz (it's shown first)
  const otherZones = ADDITIONAL_TIMEZONES.filter(
    (tz) => tz.iana !== eventTz && tz.iana !== userTzIana
  );

  if (!userTzEntry && otherZones.length === 0) return;

  const title = document.createElement("div");
  title.className = "tz-divider-title";
  title.textContent = "Additional Time Zones (Blue text means next day)";
  section.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "tz-grid";

  // User timezone row first
  if (userTzEntry) {
    grid.appendChild(buildTzRow(userTzEntry, timeSlots, eventDayName, gridCols, true));
  }

  // Remaining timezones
  otherZones.forEach((tz) => {
    grid.appendChild(buildTzRow(tz, timeSlots, eventDayName, gridCols, false));
  });

  section.appendChild(grid);
}

document.addEventListener("DOMContentLoaded", init);
