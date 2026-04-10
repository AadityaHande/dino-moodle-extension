(function () {
  if (document.getElementById("dino-guide")) return;

  function isDashboardPage() {
    return location.pathname === '/my/' || location.pathname === '/my';
  }

  function cleanupUI() {
    const dashboardHeader = document.querySelector('.page-context-header');
    if (!dashboardHeader) return;

    const container = dashboardHeader.closest('.d-flex.align-items-center');
    if (container) {
      container.remove();
      console.log('Old Dashboard header removed.');
    }
  }

  // Storage keys
  const STORAGE_KEY = "dino_course_prefs_v1";
  const SETTINGS_KEY = "dino_settings_v1";
  const OVERRIDES_KEY = "dino_overrides_v1";
  const MANUAL_COURSES_KEY = "dino_manual_courses_v1";
  const ONBOARDING_KEY = "dino_onboarding_completed_v1";
  const COLLAPSED_KEY = "dino_collapsed_state_v1";
  const TOTAL_SEMESTERS = 8;

  // App defaults and state
  const DEFAULT_SETTINGS = {
    currentSemester: 4,
    totalSemesters: TOTAL_SEMESTERS,
    admissionYear: new Date().getFullYear() - 2,
    orderMode: 'asc',
    showPast: false,
    showFuture: false,
    showCurrentOnly: true,
    advancedMode: false,
    showPreviousSemesters: true,
    showReferenceCourses: true,
    focusCurrentOnly: false,
    compactMode: false,
    rememberCollapsed: true,
    enableManualOverrides: true,
    enableEditButton: true,
    showCourseIds: false,
    autoExtractNames: true,
    showConfidenceBadge: false,
    userNotes: '',
    userNotesSlots: ['', '', '']
  };

  const AppState = {
    settings: { ...DEFAULT_SETTINGS },
    overrides: {},
    manualCourses: [],
    prefs: {},
    collapsed: {}
  };

  function loadAll(cb) {
    chrome.storage.local.get(
      [SETTINGS_KEY, OVERRIDES_KEY, MANUAL_COURSES_KEY, STORAGE_KEY, COLLAPSED_KEY],
      res => {
        AppState.settings = { ...DEFAULT_SETTINGS, ...(res[SETTINGS_KEY] || {}) };
        // Backward compatibility for users on older settings schema.
        if (typeof AppState.settings.showCurrentOnly !== 'boolean') {
          AppState.settings.showCurrentOnly = !!AppState.settings.focusCurrentOnly;
        }
        if (typeof AppState.settings.showPast !== 'boolean') {
          AppState.settings.showPast = !!AppState.settings.showPreviousSemesters;
        }
        if (typeof AppState.settings.showFuture !== 'boolean') {
          AppState.settings.showFuture = true;
        }
        if (!['asc', 'desc'].includes(AppState.settings.orderMode)) {
          AppState.settings.orderMode = 'asc';
        }
        if (typeof AppState.settings.advancedMode !== 'boolean') {
          AppState.settings.advancedMode = false;
        }
        // Backward compatibility: migrate single-note storage to 3-slot notes.
        if (!Array.isArray(AppState.settings.userNotesSlots)) {
          const legacy = typeof AppState.settings.userNotes === 'string' ? AppState.settings.userNotes : '';
          AppState.settings.userNotesSlots = [legacy, '', ''];
        } else {
          AppState.settings.userNotesSlots = [
            String(AppState.settings.userNotesSlots[0] ?? ''),
            String(AppState.settings.userNotesSlots[1] ?? ''),
            String(AppState.settings.userNotesSlots[2] ?? '')
          ];
        }
        AppState.settings.userNotes = AppState.settings.userNotesSlots[0] || '';
        AppState.settings.totalSemesters = TOTAL_SEMESTERS;
        AppState.overrides = res[OVERRIDES_KEY] || {};
        AppState.manualCourses = res[MANUAL_COURSES_KEY] || [];
        AppState.prefs = res[STORAGE_KEY] || {};
        AppState.collapsed = res[COLLAPSED_KEY] || {};
        if (typeof cb === 'function') cb();
      }
    );
  }

  function loadAllAsync() {
    return new Promise(resolve => loadAll(resolve));
  }

  function persistSettings(patch = {}) {
    AppState.settings = { ...AppState.settings, ...patch };
    chrome.storage.local.set({ [SETTINGS_KEY]: AppState.settings });
  }

  function persistOverrides() {
    chrome.storage.local.set({ [OVERRIDES_KEY]: AppState.overrides });
  }

  function persistPrefs() {
    chrome.storage.local.set({ [STORAGE_KEY]: AppState.prefs });
  }

  function persistManualCourses() {
    chrome.storage.local.set({ [MANUAL_COURSES_KEY]: AppState.manualCourses });
  }

  function getCoursePrefs(courseId) {
    const prefs = AppState.prefs[courseId] || {};
    return {
      pinned: !!prefs.pinned,
      order: prefs.order ?? 999999,
      openCount: prefs.openCount ?? 0,
      lastOpened: prefs.lastOpened ?? 0
    };
  }

  function smartSort(a, b) {
    return (
      (Number(!!b.pinned) - Number(!!a.pinned)) ||
      ((b.openCount || 0) - (a.openCount || 0)) ||
      ((b.lastOpened || 0) - (a.lastOpened || 0)) ||
      ((a.order ?? 999999) - (b.order ?? 999999)) ||
      String(a.displayName || a.name || '').localeCompare(String(b.displayName || b.name || ''))
    );
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(url = '') {
    try {
      const parsed = new URL(url, location.origin);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
      return '#';
    } catch {
      return '#';
    }
  }

  function bindGlobalHotkeys() {
    if (document.body.dataset.dinoHotkeysBound) return;
    document.addEventListener('click', e => {
      const chip = e.target.closest('.dino-chip');
      if (!chip || chip.closest('.sem-assign-modal') || chip.closest('#dino-search-modal')) return;
      if (e.target.closest('.pin') || e.target.closest('.edit-course') || e.target.closest('.course-note-icon')) return;

      const id = chip.getAttribute('data-id') || chip.getAttribute('data-course-id');
      if (!id) return;

      const prefs = getCoursePrefs(id);
      prefs.openCount += 1;
      prefs.lastOpened = Date.now();
      AppState.prefs[id] = prefs;
      persistPrefs();
    }, true);

    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearchModal();
      }
    });
    document.body.dataset.dinoHotkeysBound = '1';
  }

  const ICONS = {
    academic: `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 8l10-5 10 5-10 5-10-5z"/><path d="M6 10v4c0 1.8 2.7 3.2 6 3.2s6-1.4 6-3.2v-4"/></svg>`,
    visibility: `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
    display: `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 20h8"/></svg>`,
    manage: `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h10"/></svg>`,
    quick: `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h7l-1 8 10-12h-7z"/></svg>`,
    courses: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h13a3 3 0 0 1 3 3v11H7a3 3 0 0 0-3 3V6z"/><path d="M7 6v14"/></svg>`,
    notes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h10a2 2 0 0 1 2 2v14l-5-3-5 3V5a2 2 0 0 1 2-2z"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V22a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 3.37 17l.06-.06A1.65 1.65 0 0 0 3.76 15a1.65 1.65 0 0 0-1.51-1H2a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82L3.2 7.12A2 2 0 1 1 6.03 4.3l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 1 1 20.63 7l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H22a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    editor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
    add: `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`,
    hide: `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a21.77 21.77 0 0 1 5.06-6.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a21.86 21.86 0 0 1-3.17 4.36"/><path d="M1 1l22 22"/></svg>`,
    save: `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>`
  };

  // CourseEngine is intentionally DOM-free and easier to test.
  const CourseEngine = {

    extractSignals(text) {
      const yearMatch = text.match(/(?:\bAY\s*)?(?:20\d{2}|\d{2})[-–](?:20\d{2}|\d{2})/i);
      const semMatch = text.match(/\bsem(?:ester)?[-\s_]*(viii|vii|vi|iv|v|iii|ii|i|[1-8])\b/i);
      return {
        rawYear: yearMatch ? yearMatch[0] : null,
        rawSem: semMatch ? semMatch[1] : null
      };
    },

    normalizeSem(raw) {
      if (!raw) return null;
      const romanMap = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };
      const lower = raw.toLowerCase().trim();
      const fromRoman = romanMap[lower];
      if (fromRoman != null) return fromRoman;
      const parsed = parseInt(lower, 10);
      return isNaN(parsed) ? null : parsed;
    },

    parseYearStart(rawYear) {
      if (!rawYear) return null;
      const normalized = rawYear.replace(/\bAY\s*/i, '').trim();
      const start = normalized.split(/[-–]/)[0].trim();
      if (!start) return null;
      if (/^\d{4}$/.test(start)) return parseInt(start, 10);
      if (/^\d{2}$/.test(start)) return 2000 + parseInt(start, 10);
      return null;
    },

    getAbsoluteSemester(yearStart, semInYear, admissionYear) {
      const diff = yearStart - admissionYear;
      if (diff < 0 || diff > 4) return null;
      return (diff * 2) + semInYear;
    },

    toSemInYear(semNum) {
      // Odd semester = first term, even semester = second term.
      if (!semNum) return null;
      return semNum % 2 === 0 ? 2 : 1;
    },

    scoreConfidence(signals, source) {
      let score = 0;
      if (signals.rawYear) score += 0.45;
      if (signals.rawSem) score += 0.35;
      if (/\bsem[-\s]*(?:iv|iii|ii|viii|vii|vi|v|[1-8])\b/i.test(source)) score += 0.10;
      if (/\(AY\s*\d{4}/i.test(source)) score += 0.10;
      return Math.min(score, 1.0);
    },

    // Detection priority: year logic -> direct pattern -> text heuristic.
    detectSemester(course) {
      const text = course.originalName || course.name || '';
      const signals = this.extractSignals(text);
      const yearStart = this.parseYearStart(signals.rawYear);
      const semNum = this.normalizeSem(signals.rawSem);
      const admYear = AppState.settings.admissionYear;
      const baseConfidence = this.scoreConfidence(signals, text);

      if (yearStart && semNum && admYear) {
        const semInYear = this.toSemInYear(semNum);
        const abs = this.getAbsoluteSemester(yearStart, semInYear, admYear);
        if (abs && abs >= 1 && abs <= 8) {
          const semAgreementBonus = abs === semNum ? 0.15 : 0;
          const confidence = Math.min(baseConfidence + semAgreementBonus, 1);
          return { semNum: abs, confidence, method: 'year-logic' };
        }
      }

      if (semNum && semNum >= 1 && semNum <= 8) {
        return { semNum, confidence: Math.min(baseConfidence, 0.75), method: 'pattern' };
      }

      const lower = text.toLowerCase();
      const hasAny = (input, tokens) => tokens.some(token => input.includes(token));
      const heuristicMap = [
        { keys: ['fy', 'first year', 'sem 1', 'sem i', 'sem-1', 'sem 2', 'sem ii', 'sem-2', 'sem-ii', 'ay 23-24', 'ay 2023-24'], sem: 1 },
        { keys: ['sy', 'second year', 'sem 3', 'sem iii', 'sem-3', 'sem 4', 'sem iv', 'sem-4', 'sem-iv', 'ay 24-25', 'ay 2024-25'], sem: 3 },
        { keys: ['ty', 'third year', 'sem 5', 'sem v', 'sem-5', 'sem 6', 'sem vi', 'sem-6', 'sem-vi', 'ay 25-26', 'ay 2025-26'], sem: 5 },
        { keys: ['ly', 'final year', 'sem 7', 'sem vii', 'sem-7'], sem: 7 },
        { keys: ['sem 8', 'sem viii', 'sem-8', 'sem-viii'], sem: 8 },
      ];
      for (const { keys, sem } of heuristicMap) {
        if (keys.some(k => lower.includes(k))) {
          if (hasAny(lower, ['sem 2', 'sem ii', 'sem-2', 'sem-ii'])) return { semNum: 2, confidence: 0.5, method: 'heuristic' };
          if (hasAny(lower, ['sem 4', 'sem iv', 'sem-4', 'sem-iv'])) return { semNum: 4, confidence: 0.5, method: 'heuristic' };
          if (hasAny(lower, ['sem 6', 'sem vi', 'sem-6', 'sem-vi'])) return { semNum: 6, confidence: 0.5, method: 'heuristic' };
          return { semNum: sem, confidence: 0.5, method: 'heuristic' };
        }
      }

      return { semNum: null, confidence: 0, method: 'none' };
    },

    yearFromSem(semNum) {
      if (semNum <= 2) return 'FY';
      if (semNum <= 4) return 'SY';
      if (semNum <= 6) return 'TY';
      return 'LY';
    },

    classifyType(name, originalName = '') {
      const combined = `${name} ${originalName}`.toLowerCase();
      const labKw = ['lab', 'laboratory', 'practical', 'workshop', 'experiment', 'hands-on', 'studio', 'design lab', 'project lab'];
      const theoryKw = ['theory', 'lecture', 'study', 'analysis', 'principles', 'fundamentals', 'concepts', 'introduction to', 'mathematics', 'statistics'];
      if (labKw.some(k => combined.includes(k))) return 'lab';
      if (theoryKw.some(k => combined.includes(k))) return 'theory';
      if (combined.includes('design') || combined.includes('programming')) return 'lab';
      return 'theory';
    },

    cleanName(rawName, autoExtract) {
      if (!autoExtract) return rawName;
      let cleaned = rawName.trim();
      cleaned = cleaned.replace(/\(AY\s*\d{4}-\d{2}.*?\)/gi, '');
      cleaned = cleaned.replace(/SEM(?:ESTER)?[-\s_]*(?:viii|vii|vi|iv|v|iii|ii|i|[1-8])/gi, '');
      cleaned = cleaned.replace(/^[A-Z]{2,4}\d{3}[A-Z]?[-\s]*/i, '');
      cleaned = cleaned.replace(/^[A-Z]{3}\s*-\s*/i, '');
      cleaned = cleaned.replace(/_[A-Z0-9]{2,5}(?=\s|$)/g, '');
      cleaned = cleaned.replace(/\s+Div\s+-\s*[A-D]/gi, '');
      cleaned = cleaned.replace(/[\s\-_]+$/, '').replace(/^[\s\-_]+/, '').replace(/\s+/g, ' ');
      if (cleaned.length > 50) {
        const words = cleaned.split(' ');
        cleaned = words.slice(0, Math.max(3, Math.floor(words.length * 0.6))).join(' ');
        if (cleaned.length > 50) cleaned = cleaned.slice(0, 47) + '…';
      }
      return cleaned || rawName;
    },

    applyOverrides(course) {
      const ov = AppState.overrides[course.id] || {};
      return {
        ...course,
        displayName: ov.name || course.name,
        finalType: ov.type || course.type,
        finalSemester: ov.semester != null ? ov.semester : course.detectedSem,
        manualName: ov.name || null,
        manualType: ov.type || null,
        manualSemester: ov.semester != null ? ov.semester : null,
        manualNote: ov.note || null,
        note: ov.note || null,
        hidden: !!ov.hidden,
        hiddenName: ov.hiddenName || null,
        color: ov.color || null,
        inferredType: course.type,
        inferredSem: course.detectedSem,
        confidence: course.confidence,
        detectionMethod: course.detectionMethod,
        isOverridden: !!(ov.name || ov.type || ov.semester != null || ov.color)
      };
    },

    enrich(raw) {
      const { settings } = AppState;
      const name = this.cleanName(raw.originalName || raw.name, settings.autoExtractNames);
      const detection = this.detectSemester({ ...raw, name });
      const type = this.classifyType(name, raw.originalName || '');
      const pinInfo = getCoursePrefs(raw.id);
      return {
        ...raw,
        name,
        type,
        detectedSem: detection.semNum,
        confidence: detection.confidence,
        detectionMethod: detection.method,
        pinned: pinInfo.pinned,
        order: pinInfo.order,
        openCount: pinInfo.openCount,
        lastOpened: pinInfo.lastOpened
      };
    }
  };

  // Pull course links from Moodle dashboard HTML.
  async function extractCourses() {
    try {
      const response = await fetch(`${location.origin}/?redirect=0`);
      if (!response.ok) return [];
      const html = await response.text();
      const div = document.createElement('div');
      div.innerHTML = html;
      const anchors = Array.from(div.querySelectorAll('a[href*="course/view.php?id="]'));
      const unique = {};
      anchors.forEach(a => {
        const url = new URL(a.href, location.origin);
        const id = url.searchParams.get("id");
        const raw = a.innerText.trim();
        if (id && raw && !unique[id]) {
          unique[id] = { id, name: raw, originalName: raw, url: a.href };
        }
      });
      return Object.values(unique);
    } catch { return []; }
  }

  // Manual course helpers
  function normalizeCourseUrl(url) {
    const s = (url || '').trim();
    if (!s) return '';
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
  }

  function createManualCourse(name, url) {
    return {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      originalName: name.trim(),
      url: normalizeCourseUrl(url),
      isManual: true
    };
  }

  function deleteManualCourseById(courseId) {
    AppState.manualCourses = AppState.manualCourses.filter(c => c.id !== courseId);
    persistManualCourses();
    if (AppState.overrides[courseId]) {
      delete AppState.overrides[courseId];
      persistOverrides();
    }
    if (AppState.prefs[courseId]) {
      delete AppState.prefs[courseId];
      persistPrefs();
    }
  }

  // Collapsed state persistence
  function saveCollapsedState() {
    if (!AppState.settings.rememberCollapsed) return;
    const state = { yearGroups: {}, semesterGroups: {}, otherCourses: false };
    document.querySelectorAll('.year-group').forEach(g => {
      const label = g.querySelector('.year-label')?.textContent;
      if (label) state.yearGroups[label] = !g.open;
    });
    document.querySelectorAll('.semester-group').forEach(g => {
      const s = g.getAttribute('data-semester');
      if (s) state.semesterGroups[s] = !g.open;
    });
    const oc = document.querySelector('.other-courses');
    if (oc) state.otherCourses = !oc.open;
    AppState.collapsed = state;
    chrome.storage.local.set({ [COLLAPSED_KEY]: state });
  }

  function restoreCollapsedState() {
    if (!AppState.settings.rememberCollapsed) return;
    const { collapsed } = AppState;
    setTimeout(() => {
      Object.entries(collapsed.yearGroups || {}).forEach(([label, isCollapsed]) => {
        const g = Array.from(document.querySelectorAll('.year-group'))
          .find(el => el.querySelector('.year-label')?.textContent === label);
        if (g) g.open = !isCollapsed;
      });
      Object.entries(collapsed.semesterGroups || {}).forEach(([s, isCollapsed]) => {
        const g = document.querySelector(`.semester-group[data-semester="${s}"]`);
        if (g) g.open = !isCollapsed;
      });
      const oc = document.querySelector('.other-courses');
      if (oc && collapsed.otherCourses !== undefined) oc.open = !collapsed.otherCourses;
    }, 50);
  }

  // UI renderer
  const UIRenderer = {

    confidenceBadge(course) {
      if (!AppState.settings.showConfidenceBadge) return '';
      if (course.manualSemester != null) return '';
      const { confidence, detectionMethod } = course;
      if (detectionMethod === 'none' || confidence === 0) return '';
      const cls = confidence >= 0.8 ? 'conf-high' : confidence >= 0.5 ? 'conf-mid' : 'conf-low';
      const tip = `Detection: ${detectionMethod} (${Math.round(confidence * 100)}%)`;
      return `<span class="conf-badge ${cls}" title="${tip}"></span>`;
    },

    courseChip(course, editable = false) {
      const { settings } = AppState;
      const idSuffix = settings.showCourseIds ? ` [${escapeHtml(course.id)}]` : '';
      let displayName = (course.displayName || course.name).replace(/^([🧪📘]\s*)+/, '');
      if (settings.compactMode && displayName.length > 25) {
        displayName = displayName.slice(0, 25) + '…';
      }
      const safeDisplayName = escapeHtml(displayName);
      const safeOriginalName = escapeHtml(course.originalName || '');
      const safeHref = safeUrl(course.url);
      const typeIcon = course.finalType === 'lab'
        ? `<svg class="chip-icon" viewBox="0 0 20 20" width="16" height="16"><path fill="#2e7d32" d="M6 2v2l3 6v5a2 2 0 1 0 2 0v-5l3-6V2z"/></svg>`
        : `<svg class="chip-icon" viewBox="0 0 20 20" width="16" height="16"><rect x="3" y="4" width="14" height="12" rx="2" fill="#1565c0"/><rect x="6" y="7" width="8" height="2" fill="#fff"/><rect x="6" y="11" width="5" height="2" fill="#fff"/></svg>`;

      const pinIcon = `<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3H8l-1 6h10z M12 10v8"/></svg>`;
      const editIcon = `<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      const noteIcon = `<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="currentColor"><path d="M19 2H5c-1.1 0-2 .9-2 2v18l7-3 7 3V4c0-1.1-.9-2-2-2z"/></svg>`;

      const confBadge = this.confidenceBadge(course);

      if (!editable) {
        return `<a class="dino-chip ${course.finalType}${course.isOverridden ? ' overridden' : ''}" href="${safeHref}" data-id="${escapeHtml(course.id)}" title="${safeOriginalName}">
          ${typeIcon}${confBadge}
          <span class="chip-label">${safeDisplayName}${idSuffix}</span>
          ${course.pinned ? `<span class="pin active" data-id="${escapeHtml(course.id)}" title="Pinned">${pinIcon}</span>` : ''}
          ${course.note ? `<span class="course-note-icon" data-id="${escapeHtml(course.id)}" title="View note">${noteIcon}</span>` : ''}
        </a>`;
      }

      return `<div class="dino-chip ${course.finalType}${course.isOverridden ? ' overridden' : ''}${course.pinned ? ' pinned' : ''}" draggable="true" data-course-id="${escapeHtml(course.id)}" title="${safeOriginalName}">
        <a href="${safeHref}" onclick="event.stopPropagation()">
          ${typeIcon}${confBadge}
          <span class="chip-label">${safeDisplayName}${idSuffix}</span>
        </a>
        <div class="chip-controls">
          <span class="pin${course.pinned ? ' active' : ''}" data-id="${escapeHtml(course.id)}" title="Toggle Pin">${pinIcon}</span>
          ${course.note ? `<span class="course-note-icon" data-id="${escapeHtml(course.id)}" title="View note">${noteIcon}</span>` : ''}
          ${settings.enableEditButton ? `<span class="edit-course" data-id="${escapeHtml(course.id)}" title="Edit">${editIcon}</span>` : ''}
        </div>
      </div>`;
    },

    semesterGroup(semData, courses) {
      const { settings } = AppState;
      if (!courses.length && !settings.enableManualOverrides) return '';
      const isCurrent = semData.isCurrent;
      const compact = settings.compactMode ? ' compact' : '';
      const cursorIcon = isCurrent
        ? `<svg style="width:16px;height:16px;display:inline;margin-left:5px;vertical-align:middle" viewBox="0 0 24 24" fill="#1565c0"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" stroke="#fff" stroke-width="2" fill="none"/></svg>`
        : '';
      return `
        <details class="semester-group${isCurrent ? ' current-semester' : ''}${compact}" data-semester="${semData.sem}" ${isCurrent ? 'open' : ''}>
          <summary>
            <span class="sem-arrow"></span>
            ${semData.year} • Sem ${semData.sem}${cursorIcon}
            <span class="course-count">(${courses.length})</span>
          </summary>
          <div class="drop-zone semester-drop-zone" data-semester="${semData.sem}">
            <div class="dino-chips">
              ${courses.map(c => this.courseChip(c, settings.enableManualOverrides)).join('')}
              ${courses.length === 0 && settings.enableManualOverrides ? '<div class="drop-placeholder">Drop courses here</div>' : ''}
            </div>
          </div>
        </details>`;
    },

    settingsUI() {
      const { settings, overrides } = AppState;
      const hiddenCourses = Object.entries(overrides)
        .filter(([, ov]) => ov && ov.hidden)
        .map(([id, ov]) => ({ id, name: ov.hiddenName || ov.name || id }));

      const semOptions = Array.from({ length: TOTAL_SEMESTERS }, (_, i) => i + 1)
        .map(i => `<option value="${i}" ${i === settings.currentSemester ? 'selected' : ''}>Sem ${i}</option>`).join('');
      const orderOptions = ['asc', 'desc']
        .map(mode => `<option value="${mode}" ${mode === settings.orderMode ? 'selected' : ''}>${mode === 'asc' ? 'FY → LY' : 'LY → FY'}</option>`).join('');

      const currentYear = new Date().getFullYear();
      const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i)
        .map(y => `<option value="${y}" ${y === settings.admissionYear ? 'selected' : ''}>${y}</option>`).join('');

      return `
        <div class="settings-compact">
          <div class="settings-row">
            <div class="settings-group">
              <div class="group-title">${ICONS.academic} Academic</div>
              <div class="group-inline">
                <label class="inline-field"><span>Sem</span>
                  <select id="currentSemester">${semOptions}</select></label>
                <label class="inline-field"><span>Total</span>
                  <select id="totalSemesters" disabled><option value="${TOTAL_SEMESTERS}" selected>${TOTAL_SEMESTERS}</option></select></label>
              </div>
              <div class="group-inline" style="margin-top:6px">
                <label class="inline-field" style="width:100%">
                  <span>Admission Year <span class="badge-new">NEW</span></span>
                  <select id="admissionYear" title="Used for smart semester auto-detection">${yearOptions}</select>
                </label>
              </div>
              <div class="group-inline" style="margin-top:6px">
                <label class="inline-field" style="width:100%">
                  <span>Year Order</span>
                  <select id="orderMode" title="Choose FY→LY or LY→FY ordering">${orderOptions}</select>
                </label>
              </div>
            </div>
            <div class="settings-group">
              <div class="group-title">${ICONS.visibility} Visibility</div>
              <div class="toggle-group">
                <label class="toggle-item"><input type="checkbox" id="showCurrentOnly" ${settings.showCurrentOnly ? 'checked' : ''}><span>Current Only</span></label>
                <label class="toggle-item"><input type="checkbox" id="showPast" ${settings.showPast ? 'checked' : ''}><span>Past</span></label>
                <label class="toggle-item"><input type="checkbox" id="showFuture" ${settings.showFuture ? 'checked' : ''}><span>Future</span></label>
                <label class="toggle-item"><input type="checkbox" id="showReferenceCourses" ${settings.showReferenceCourses ? 'checked' : ''}><span>Reference</span></label>
              </div>
            </div>
            <div class="settings-group">
              <div class="group-title">${ICONS.display} Display</div>
              <div class="toggle-group">
                <label class="toggle-item"><input type="checkbox" id="compactMode" ${settings.compactMode ? 'checked' : ''}><span>Compact</span></label>
                <label class="toggle-item"><input type="checkbox" id="showCourseIds" ${settings.showCourseIds ? 'checked' : ''}><span>Show IDs</span></label>
                <label class="toggle-item"><input type="checkbox" id="advancedMode" ${settings.advancedMode ? 'checked' : ''}><span>Advanced Mode</span></label>
              </div>
            </div>
          </div>

          ${settings.advancedMode ? `<div class="settings-row">
            <div class="settings-group wide">
              <div class="group-title">${ICONS.manage} Course Management</div>
              <div class="course-mgmt-row">
                <div class="toggle-group flex-1">
                  <label class="toggle-item"><input type="checkbox" id="enableManualOverrides" ${settings.enableManualOverrides ? 'checked' : ''}><span>Manual Edit</span></label>
                  <label class="toggle-item"><input type="checkbox" id="enableEditButton" ${settings.enableEditButton ? 'checked' : ''}><span>Edit Button</span></label>
                  <label class="toggle-item"><input type="checkbox" id="autoExtractNames" ${settings.autoExtractNames ? 'checked' : ''}><span>Auto-clean Names</span></label>
                  <label class="toggle-item"><input type="checkbox" id="showConfidenceBadge" ${settings.showConfidenceBadge ? 'checked' : ''}><span>Confidence dots</span></label>
                </div>
                <div class="stats-inline">
                  <span class="stat-pill"><strong>${Object.keys(overrides).length}</strong> overridden</span>
                  <span class="stat-pill"><strong>${hiddenCourses.length}</strong> hidden</span>
                </div>
              </div>
              ${hiddenCourses.length ? `
                <div class="hidden-list">
                  ${hiddenCourses.map(c => `
                    <div class="hidden-item">
                      <span>${c.name}</span>
                      <button class="btn-unhide" data-id="${c.id}" type="button">Unhide</button>
                    </div>`).join('')}
                </div>` : ''}
            </div>
          </div>` : `
          <div class="settings-row">
            <div class="settings-group wide">
              <div class="group-title">${ICONS.quick} Simple Mode</div>
              <div class="course-mgmt-row">
                <div class="toggle-group flex-1">
                  <span class="stat-pill"><strong>Focus:</strong> Instant course access</span>
                  <span class="stat-pill"><strong>Tip:</strong> Enable Advanced Mode for editor, overrides, and confidence tools</span>
                </div>
              </div>
            </div>
          </div>`}

          <div class="settings-row actions-row">
            <div class="action-group primary">
              <button id="saveSettings" class="dino-btn dino-green">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>Save</button>
              <button id="resetSettings" class="dino-btn dino-gray">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/></svg>Reset</button>
              <button id="clearOverrides" class="dino-btn dino-red">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Clear</button>
            </div>
            <div class="action-group secondary">
              <button id="exportDino" class="dino-btn dino-blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Export</button>
              <button id="importDinoBtn" class="dino-btn dino-cyan">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>Import</button>
              <input type="file" id="importDino" accept=".json" style="display:none">
              <button id="restartTutorial" class="dino-btn dino-purple">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92c-.5.51-.86.97-1.04 1.69-.08.32-.13.68-.13 1.14h-2v-.5c0-.46.08-.9.22-1.31.2-.58.53-1.1.95-1.52l1.24-1.26c.46-.44.68-1.1.55-1.8-.13-.72-.69-1.33-1.39-1.53-1.11-.31-2.14.32-2.47 1.27-.12.37-.43.65-.82.65h-.3C8.4 9 8 8.44 8.16 7.88c.43-1.47 1.68-2.59 3.23-2.83 1.52-.24 2.97.55 3.87 1.8 1.18 1.63.83 3.38-.19 4.4z"/></svg>Tutorial</button>
            </div>
          </div>
        </div>`;
    },

    notesContent() {
      const slots = Array.isArray(AppState.settings.userNotesSlots)
        ? AppState.settings.userNotesSlots
        : [AppState.settings.userNotes || '', '', ''];
      return `
        <div class="notes-container">
          <div class="notes-slots">
            <label class="note-slot"><span class="note-slot-title">Note 1</span>
              <textarea id="quickNotes1" placeholder="Your quick notes and reminders..." rows="3">${escapeHtml(slots[0] || '')}</textarea>
            </label>
            <label class="note-slot"><span class="note-slot-title">Note 2</span>
              <textarea id="quickNotes2" placeholder="Add another note..." rows="3">${escapeHtml(slots[1] || '')}</textarea>
            </label>
            <label class="note-slot"><span class="note-slot-title">Note 3</span>
              <textarea id="quickNotes3" placeholder="Add one more note..." rows="3">${escapeHtml(slots[2] || '')}</textarea>
            </label>
          </div>
          <button type="button" id="saveQuickNotes" class="btn-save btn-small">${ICONS.save} Save Notes</button>
        </div>`;
    },

    quickAccess(quickCourses) {
      if (!quickCourses.length) return '';
      return `
        <div class="quick-access">
          <div class="quick-access-title">${ICONS.quick} Quick Access</div>
          <div class="quick-access-list">
            ${quickCourses.map(c => `
              <a class="quick-access-chip" href="${safeUrl(c.url)}" title="${escapeHtml(c.originalName || c.name || '')}">
                ${escapeHtml(c.displayName || c.name || 'Course')}
              </a>`).join('')}
          </div>
        </div>`;
    },

    semesterEditor(enrichedCourses) {
      const { settings } = AppState;
      const inferredMap = { FY: [1, 2], SY: [3, 4], TY: [5, 6], LY: [7, 8] };
      const courseCounts = {};
      let refCount = 0;
      enrichedCourses.forEach(c => {
        const ov = c.manualSemester;
        if (ov === 'reference') { refCount++; return; }
        const sem = ov != null ? parseInt(ov, 10)
          : (c.detectedSem || null);
        if (sem) courseCounts[sem] = (courseCounts[sem] || 0) + 1;
        else refCount++;
      });

      const bucketHtml = Array.from({ length: 8 }, (_, i) => i + 1).map(sem => {
        const isCurrent = sem === settings.currentSemester;
        return `
          <div class="sem-bucket" data-sem="${sem}" draggable="true">
            <div class="sem-bucket-label">
              <span>Sem ${sem}</span>
              ${isCurrent ? `<svg style="width:14px;height:14px;margin-left:4px" viewBox="0 0 24 24" fill="#1565c0"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" stroke="#fff" stroke-width="2" fill="none"/></svg>` : ''}
              <span class="sem-course-count">(${courseCounts[sem] || 0})</span>
            </div>
            <button class="sem-assign-btn" data-sem="${sem}" type="button">Assign Courses</button>
          </div>`;
      }).join('');

      return `
        <div class="sem-editor-header">
          <h2>${ICONS.editor} Semester Editor</h2>
          <div class="sem-editor-actions">
            <button class="btn-collapse-expand" id="collapseAllBtn" type="button" title="Collapse All">⌄</button>
            <button class="btn-hide-courses" id="hideCoursesBtn" type="button">${ICONS.hide} Hide</button>
            <button class="btn-add-course" id="addManualCourseBtn" type="button">${ICONS.add} Add</button>
          </div>
        </div>
        <div class="sem-editor-search">
          <input type="text" id="editorSearchInput" placeholder="Search courses..." class="editor-search-input">
        </div>
        <div class="sem-editor-buckets" id="editorBuckets">
          ${bucketHtml}
          <div class="sem-bucket sem-bucket-reference" data-sem="reference">
            <div class="sem-bucket-label"><span>Reference / Other</span><span class="sem-course-count">(${refCount})</span></div>
            <button class="sem-assign-btn" data-sem="reference" type="button">Assign Courses</button>
          </div>
        </div>`;
    },

    // Tiny summary bar above course groups.
    smartInsights(visibleCourses) {
      const total = visibleCourses.length;
      const labs = visibleCourses.filter(c => c.finalType === 'lab').length;
      const theory = total - labs;
      const lowConf = visibleCourses.filter(c => !c.manualSemester && c.confidence < 0.5 && c.confidence > 0).length;
      if (!total) return '';
      return `
        <div class="smart-insights">
          <span>Courses: ${total}</span>
          <span>Labs: ${labs}</span>
          <span>Theory: ${theory}</span>
          ${lowConf ? `<span class="insight-warn" title="Some courses have low-confidence auto-detection. Use the Editor tab to fix.">⚠️ ${lowConf} uncertain</span>` : ''}
        </div>`;
    },

    fullLayout(enrichedCourses, enableSemEditor, visibleCourses) {
      const { settings } = AppState;
      const yearMap = { FY: [], SY: [], TY: [], LY: [] };
      const otherCourses = [];

      visibleCourses.forEach(course => {
        let assigned = false;
        const manualSem = course.manualSemester;
        if (manualSem != null && manualSem !== 'reference') {
          const semNum = parseInt(manualSem, 10);
          const semData = structure.find(s => s.sem === semNum);
          if (semData && shouldShow(semData)) { semData.courses.push(course); assigned = true; }
        } else if (manualSem === 'reference') {
          otherCourses.push(course); assigned = true;
        } else {
          const det = course.detectedSem;
          if (det) {
            const semData = structure.find(s => s.sem === det);
            if (semData && shouldShow(semData)) { semData.courses.push(course); assigned = true; }
          }
        }
        if (!assigned) otherCourses.push(course);
      });

      structure.filter(shouldShow).forEach(s => {
        yearMap[s.year] = yearMap[s.year] || [];
        yearMap[s.year].push(s);
      });

      const currentSemesterCourses = structure.find(s => s.isCurrent)?.courses || [];
      const quickCourses = [...currentSemesterCourses].sort(smartSort).slice(0, 6);
      const orderedYears = settings.orderMode === 'desc'
        ? ['LY', 'TY', 'SY', 'FY']
        : ['FY', 'SY', 'TY', 'LY'];

      const yearLabels = { FY: 'First Year (FY)', SY: 'Second Year (SY)', TY: 'Third Year (TY)', LY: 'Final Year (LY)' };

      const coursesHtml = `
        ${this.quickAccess(quickCourses)}
        ${this.smartInsights(visibleCourses)}
        <div class="year-container">
          ${orderedYears.map(year => {
        const sems = yearMap[year] || [];
        if (!sems.length) return '';
        const hasCurrent = sems.some(s => s.isCurrent);
        return `
              <details class="year-group" ${hasCurrent ? 'open' : ''}>
                <summary><span class="year-label">${yearLabels[year]}</span></summary>
                <div class="semester-container">
                  ${sems.map(s => this.semesterGroup(s, s.courses)).join('')}
                </div>
              </details>`;
      }).join('')}
          ${otherCourses.length && settings.showReferenceCourses ? `
            <details class="other-courses" data-semester="reference">
              <summary>Reference & Other Courses <span class="course-count">(${otherCourses.length})</span></summary>
              <div class="drop-zone semester-drop-zone" data-semester="reference">
                <div class="dino-chips">
                  ${otherCourses.map(c => this.courseChip(c, settings.enableManualOverrides)).join('')}
                  ${otherCourses.length === 0 && settings.enableManualOverrides ? '<div class="drop-placeholder">Drop here</div>' : ''}
                </div>
              </div>
            </details>` : ''}
        </div>
        <div class="dino-footer">
          <div class="footer-content">
            <span class="footer-left">Dino v3.0 · Smart Moodle Guide</span>
            <span class="footer-right">Built by <a class="author-link" href="https://www.linkedin.com/in/aadityahande/" target="_blank" rel="noopener">Aaditya Hande</a></span>
          </div>
        </div>`;

      const advancedMode = !!settings.advancedMode;
      const editorEnabled = enableSemEditor && advancedMode;
      const editorTab = editorEnabled ? `<button class="sidebar-tab" data-tab="editor" title="Editor">${ICONS.editor}</button>` : '';
      const editorPane = editorEnabled
        ? `<div class="sidebar-pane" data-tab="editor">${this.semesterEditor(enrichedCourses)}</div>` : '';
      const notesTab = advancedMode ? `<button class="sidebar-tab" data-tab="notes" title="Notes">${ICONS.notes}</button>` : '';
      const notesPane = advancedMode ? `<div class="sidebar-pane" data-tab="notes">${this.notesContent()}</div>` : '';

      return `
        <div class="dino-sidebar-layout">
          <div class="dino-sidebar">
            <button class="sidebar-tab active" data-tab="courses" title="Courses">${ICONS.courses}</button>
            ${notesTab}
            ${editorTab}
            <button class="sidebar-tab" data-tab="settings" title="Settings">${ICONS.settings}</button>
          </div>
          <div class="dino-main-content">
            <div class="sidebar-pane active" data-tab="courses">${coursesHtml}</div>
            ${notesPane}
            ${editorPane}
            <div class="sidebar-pane" data-tab="settings">${this.settingsUI()}</div>
          </div>
        </div>`;
    }
  };

  // Semester buckets used by the renderer.
  let structure = [];
  function buildStructure() {
    const { settings } = AppState;
    structure = Array.from({ length: TOTAL_SEMESTERS }, (_, i) => ({
      sem: i + 1,
      year: CourseEngine.yearFromSem(i + 1),
      isCurrent: (i + 1) === settings.currentSemester,
      courses: []
    }));
  }

  function shouldShow(semData) {
    const { settings } = AppState;
    // Treat "current only" as an exclusive mode only when past/future are both off.
    if (settings.showCurrentOnly && !settings.showPast && !settings.showFuture) return semData.isCurrent;
    if (semData.isCurrent) return true;
    if (semData.sem < settings.currentSemester) return settings.showPast;
    if (semData.sem > settings.currentSemester) return settings.showFuture;
    return true;
  }

  // Modals
  function courseEditModal(course) {
    const isManual = !!course.isManual;
    const currentSemVal = course.manualSemester != null ? course.manualSemester : 'auto';
    const currentTypeVal = course.manualType || 'auto';
    const autoSemLabel = course.detectedSem
      ? `Auto-detect (Sem ${course.detectedSem}, ${Math.round((course.confidence || 0) * 100)}% confidence)`
      : 'Auto-detect (unknown)';

    const deleteBtn = isManual
      ? `<button class="btn-danger" id="modalDeleteBtn">Delete</button>` : '';
    const hideLabel = course.hidden ? 'Unhide' : 'Hide';

    const semOptions = Array.from({ length: TOTAL_SEMESTERS }, (_, i) => i + 1)
      .map(s => `<option value="${s}" ${parseInt(currentSemVal) === s ? 'selected' : ''}>Semester ${s}</option>`).join('');

    return `
      <div class="course-edit-modal" id="courseEditModal" role="dialog" aria-modal="true">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Edit Course</h3>
            <button class="close-modal">&times;</button>
          </div>
          <div class="modal-body">
            <label>Course Name
              <input type="text" id="editCourseName" value="${escapeHtml(course.displayName || course.name || '')}" placeholder="Name">
            </label>
            <label>Original Name <span class="original-name">${escapeHtml(course.originalName || '')}</span></label>
            <label>Semester
              <select id="editCourseSemester">
                <option value="auto" ${currentSemVal === 'auto' ? 'selected' : ''}>${autoSemLabel}</option>
                ${semOptions}
                <option value="reference" ${currentSemVal === 'reference' ? 'selected' : ''}>Reference / Other</option>
              </select>
            </label>
            <label>Type
              <select id="editCourseType">
                <option value="auto" ${currentTypeVal === 'auto' ? 'selected' : ''}>Auto-detect (${escapeHtml(course.inferredType || 'theory')})</option>
                <option value="theory" ${currentTypeVal === 'theory' ? 'selected' : ''}>Theory</option>
                <option value="lab"    ${currentTypeVal === 'lab' ? 'selected' : ''}>Lab</option>
              </select>
            </label>
            <label>Notes
              <textarea id="editCourseNote" rows="2" placeholder="Reminders…">${escapeHtml(course.manualNote || '')}</textarea>
            </label>
          </div>
          <div class="modal-actions">
            <button class="btn-save"   id="modalSaveBtn">Save</button>
            <button class="btn-reset"  id="modalResetBtn">↩ Reset to Auto</button>
            <button class="btn-hide"   id="modalHideBtn">${hideLabel}</button>
            ${deleteBtn}
            <button class="btn-cancel" id="modalCancelBtn">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  function openEditModal(course) {
    // Use the same enrichment path as the main renderer so modal auto-detect
    // values match grouped semester placement.
    const enriched = CourseEngine.applyOverrides(CourseEngine.enrich(course));
    const wrapper = document.createElement('div');
    wrapper.innerHTML = courseEditModal(enriched);
    const el = wrapper.firstElementChild;
    document.body.appendChild(el);

    const close = () => el.remove();

    el.querySelector('#modalSaveBtn').addEventListener('click', () => {
      let sem = el.querySelector('#editCourseSemester').value;
      if (sem !== 'auto' && sem !== 'reference') sem = parseInt(sem, 10);
      const type = el.querySelector('#editCourseType').value;
      const prev = AppState.overrides[course.id] || {};
      AppState.overrides[course.id] = {
        ...prev,
        name: el.querySelector('#editCourseName').value.trim() || null,
        semester: sem === 'auto' ? undefined : sem,
        type: type === 'auto' ? null : type,
        note: el.querySelector('#editCourseNote').value.trim() || null
      };
      Object.keys(AppState.overrides[course.id]).forEach(k => {
        if (AppState.overrides[course.id][k] == null) delete AppState.overrides[course.id][k];
      });
      persistOverrides();
      close(); inject();
    });

    el.querySelector('#modalResetBtn').addEventListener('click', () => {
      delete AppState.overrides[course.id];
      persistOverrides();
      close(); inject();
    });

    el.querySelector('#modalHideBtn').addEventListener('click', () => {
      const prev = AppState.overrides[course.id] || {};
      if (prev.hidden) {
        delete prev.hidden; delete prev.hiddenName;
        if (!Object.keys(prev).length) delete AppState.overrides[course.id];
        else AppState.overrides[course.id] = prev;
      } else {
        AppState.overrides[course.id] = { ...prev, hidden: true, hiddenName: course.displayName || course.name };
      }
      persistOverrides();
      close(); inject();
    });

    el.querySelector('#modalDeleteBtn')?.addEventListener('click', () => {
      if (confirm('Delete this course? This cannot be undone.')) {
        deleteManualCourseById(course.id);
        close(); inject();
      }
    });

    el.querySelector('#modalCancelBtn').addEventListener('click', close);
    el.querySelector('.close-modal').addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  }

  function showManualCourseModal() {
    const semOptions = Array.from({ length: TOTAL_SEMESTERS }, (_, i) => i + 1)
      .map(s => `<option value="${s}">Semester ${s}</option>`).join('');
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="course-edit-modal" id="manualCourseModal" role="dialog" aria-modal="true">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Add Course</h3>
            <button class="close-modal">&times;</button>
          </div>
          <div class="modal-body">
            <label>Course Name <input type="text" id="manualCourseName" placeholder="e.g. Advanced DSA"></label>
            <label>Course Link <input type="text" id="manualCourseUrl"  placeholder="https://"></label>
            <label>Semester
              <select id="manualCourseSemester">${semOptions}
                <option value="reference" selected>Reference / Other</option></select>
            </label>
            <div class="modal-error" id="manualCourseError" role="alert"></div>
          </div>
          <div class="modal-actions">
            <button class="btn-save" id="manualCourseSave">Add Course</button>
            <button class="btn-cancel" id="manualCourseCancel">Cancel</button>
          </div>
        </div>
      </div>`;
    const modal = el.firstElementChild;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    const nameInput = modal.querySelector('#manualCourseName');
    const urlInput = modal.querySelector('#manualCourseUrl');
    const errEl = modal.querySelector('#manualCourseError');

    modal.querySelector('#manualCourseSave').addEventListener('click', () => {
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      if (!name || !url) { errEl.textContent = 'Name and link required.'; return; }
      const mc = createManualCourse(name, url);
      AppState.manualCourses = [...AppState.manualCourses, mc];
      persistManualCourses();
      const semVal = modal.querySelector('#manualCourseSemester').value;
      AppState.overrides[mc.id] = { semester: semVal === 'reference' ? 'reference' : parseInt(semVal, 10) };
      persistOverrides();
      close(); inject();
    });
    modal.querySelector('#manualCourseCancel').addEventListener('click', close);
    modal.querySelector('.close-modal').addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    nameInput.focus();
  }

  function showBulkAssignModal(sem, enrichedCourses) {
    const isRef = sem === 'reference';
    const title = isRef ? 'Assign to Reference / Other' : `Assign to Semester ${sem}`;
    const el = document.createElement('div');
    el.id = 'sem-assign-modal';
    el.className = 'sem-assign-modal';
    el.innerHTML = `
      <div class="modal-content">
        <div class="modal-header"><h3>${title}</h3><button class="close-modal">&times;</button></div>
        <div class="modal-body">
          <input type="text" id="courseSearchInput" placeholder="Search…" class="search-input">
          <div class="modal-actions-top">
            <button id="selectAllCourses" class="btn-secondary">✓ All</button>
            <button id="deselectAllCourses" class="btn-secondary">None</button>
          </div>
          <div class="modal-list">
            ${enrichedCourses.map(c => {
      const curSem = c.manualSemester != null ? c.manualSemester : c.detectedSem;
      const isHere = curSem == sem;
      const label = curSem != null ? ` (in ${curSem === 'reference' ? 'Ref' : `Sem ${curSem}`})` : '';
      return `
                <label class="modal-course-item" data-course-name="${escapeHtml((c.displayName || c.name || '').toLowerCase())}">
                  <input type="checkbox" value="${escapeHtml(c.id)}" ${isHere ? 'checked' : ''}>
                  <span class="course-name">${escapeHtml(c.displayName || c.name || '')}</span>
                  <span class="course-current-sem">${escapeHtml(label)}</span>
                </label>`;
    }).join('')}
          </div>
        </div>
        <div class="modal-actions">
          <button id="sem-assign-confirm" class="btn-save">Assign</button>
          <button id="sem-assign-cancel"  class="btn-cancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();

    el.querySelector('#courseSearchInput').addEventListener('input', function () {
      const q = this.value.toLowerCase();
      el.querySelectorAll('.modal-course-item').forEach(item => {
        item.style.display = item.getAttribute('data-course-name').includes(q) ? 'flex' : 'none';
      });
    });
    el.querySelector('#selectAllCourses').onclick = () =>
      el.querySelectorAll('.modal-course-item:not([style*="none"]) input').forEach(cb => cb.checked = true);
    el.querySelector('#deselectAllCourses').onclick = () =>
      el.querySelectorAll('.modal-course-item:not([style*="none"]) input').forEach(cb => cb.checked = false);

    el.querySelector('#sem-assign-confirm').onclick = () => {
      const checked = [...el.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value);
      const semVal = isRef ? 'reference' : parseInt(sem, 10);
      enrichedCourses.forEach(c => {
        if (checked.includes(c.id)) {
          AppState.overrides[c.id] = { ...(AppState.overrides[c.id] || {}), semester: semVal };
        } else if ((AppState.overrides[c.id]?.semester) == semVal) {
          delete AppState.overrides[c.id].semester;
          if (!Object.keys(AppState.overrides[c.id]).length) delete AppState.overrides[c.id];
        }
      });
      persistOverrides(); close(); inject();
    };

    el.querySelector('#sem-assign-cancel').onclick = close;
    el.querySelector('.close-modal').onclick = close;
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    el.querySelector('#courseSearchInput').focus();
  }

  function showHideCoursesModal(allCourses) {
    const visible = allCourses.filter(c => !c.hidden);
    const el = document.createElement('div');
    el.className = 'sem-assign-modal';
    el.innerHTML = `
      <div class="modal-content">
        <div class="modal-header"><h3>Hide Courses</h3><button class="close-modal">&times;</button></div>
        <div class="modal-body">
          <input type="text" id="hideSearchInput" placeholder="Search…" class="search-input">
          <div class="modal-actions-top">
            <button id="selectAllHide"  class="btn-secondary">✓ All</button>
            <button id="deselectAllHide" class="btn-secondary">None</button>
          </div>
          <div class="modal-list">
            ${visible.map(c => `
              <label class="modal-course-item" data-course-name="${escapeHtml((c.displayName || c.name || '').toLowerCase())}">
                <input type="checkbox" value="${escapeHtml(c.id)}">
                <span class="course-name">${escapeHtml(c.displayName || c.name || '')}</span>
              </label>`).join('')}
          </div>
        </div>
        <div class="modal-actions">
          <button id="hideSelected"  class="btn-save">Hide Selected</button>
          <button id="hideCancelBtn" class="btn-cancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();

    el.querySelector('#hideSearchInput').addEventListener('input', function () {
      const q = this.value.toLowerCase();
      el.querySelectorAll('.modal-course-item').forEach(item => {
        item.style.display = item.getAttribute('data-course-name').includes(q) ? 'flex' : 'none';
      });
    });
    el.querySelector('#selectAllHide').onclick = () => el.querySelectorAll('.modal-course-item:not([style*="none"]) input').forEach(cb => cb.checked = true);
    el.querySelector('#deselectAllHide').onclick = () => el.querySelectorAll('.modal-course-item:not([style*="none"]) input').forEach(cb => cb.checked = false);

    el.querySelector('#hideSelected').onclick = () => {
      const checked = [...el.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value);
      checked.forEach(id => {
        AppState.overrides[id] = {
          ...(AppState.overrides[id] || {}),
          hidden: true,
          hiddenName: visible.find(c => c.id === id)?.displayName || id
        };
      });
      persistOverrides(); close(); inject();
    };
    el.querySelector('#hideCancelBtn').onclick = close;
    el.querySelector('.close-modal').onclick = close;
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    el.querySelector('#hideSearchInput').focus();
  }

  // Drag and drop
  let draggedCourseId = null;

  function setupDragDrop(container) {
    if (!AppState.settings.enableManualOverrides) return;

    container.querySelectorAll('.dino-chip[draggable="true"]').forEach(chip => {
      chip.addEventListener('dragstart', function (e) {
        draggedCourseId = this.dataset.courseId;
        this.style.opacity = '0.5';
      });
      chip.addEventListener('dragend', function () {
        this.style.opacity = '1';
        container.querySelectorAll('.semester-drop-zone').forEach(z => z.classList.remove('drag-over'));
        draggedCourseId = null;
      });
    });

    container.addEventListener('dragover', e => {
      e.preventDefault();
      e.target.closest('.semester-drop-zone')?.classList.add('drag-over');
    });
    container.addEventListener('dragleave', e => {
      const zone = e.target.closest('.semester-drop-zone');
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });
    container.addEventListener('drop', e => {
      e.preventDefault();
      const zone = e.target.closest('.semester-drop-zone');
      if (zone && draggedCourseId) {
        saveCollapsedState();
        let sem = zone.dataset.semester;
        if (sem !== 'reference') sem = parseInt(sem, 10);
        AppState.overrides[draggedCourseId] = { ...(AppState.overrides[draggedCourseId] || {}), semester: sem };
        persistOverrides();
        setTimeout(inject, 10);
      }
      container.querySelectorAll('.semester-drop-zone').forEach(z => z.classList.remove('drag-over'));
      draggedCourseId = null;
    });
  }

  // Event wiring
  function setupEvents(container, enrichedCourses) {
    const tabs = container.querySelectorAll('.sidebar-tab');
    const panes = container.querySelectorAll('.sidebar-pane');
    tabs.forEach(btn => btn.addEventListener('click', function () {
      tabs.forEach(b => b.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));
      this.classList.add('active');
      container.querySelector(`.sidebar-pane[data-tab="${this.dataset.tab}"]`)?.classList.add('active');
    }));

    container.querySelectorAll('details.year-group, details.semester-group, details.other-courses')
      .forEach(d => d.addEventListener('toggle', saveCollapsedState));

    // One click handler keeps per-render listeners low.
    container.addEventListener('click', e => {
      const unhideBtn = e.target.closest('.btn-unhide');
      if (unhideBtn) {
        const id = unhideBtn.dataset.id;
        const ov = AppState.overrides[id];
        if (ov) { delete ov.hidden; delete ov.hiddenName; if (!Object.keys(ov).length) delete AppState.overrides[id]; }
        persistOverrides(); inject(); return;
      }

      if (e.target.closest('.pin')) {
        e.preventDefault();
        const id = e.target.closest('.pin').dataset.id;
        if (!id) return;
        const cur = AppState.prefs[id] || {};
        AppState.prefs[id] = { pinned: !cur.pinned, order: cur.order ?? Date.now() };
        persistPrefs(); inject(); return;
      }

      const noteIcon = e.target.closest('.course-note-icon');
      if (noteIcon) {
        e.preventDefault();
        const note = AppState.overrides[noteIcon.dataset.id]?.note;
        if (note) {
          const nm = document.createElement('div');
          nm.className = 'course-edit-modal';
          nm.setAttribute('role', 'dialog');
          nm.innerHTML = `<div class="modal-content"><div class="modal-header"><h3>Note</h3><button class="close-modal" onclick="this.closest('.course-edit-modal').remove()">&times;</button></div><div class="modal-body"><div id="dino-note-view" style="white-space:pre-line"></div></div></div>`;
          nm.querySelector('#dino-note-view').textContent = note;
          document.body.appendChild(nm);
        }
        return;
      }

      const editBtn = e.target.closest('.edit-course');
      if (editBtn) {
        e.preventDefault();
        const id = editBtn.dataset.id;
        const mc = AppState.manualCourses.find(c => c.id === id);
        if (mc) { openEditModal(mc); return; }
        extractCourses().then(courses => {
          const c = courses.find(c => c.id === id);
          if (c) openEditModal(c);
        });
        return;
      }

      if (e.target.id === 'saveQuickNotes') {
        const notesSlots = [1, 2, 3].map(i => document.querySelector(`#quickNotes${i}`)?.value || '');
        persistSettings({
          userNotesSlots: notesSlots,
          userNotes: notesSlots[0] || ''
        });
        e.target.textContent = 'Saved';
        setTimeout(() => { e.target.innerHTML = `${ICONS.save} Save Notes`; }, 1500);
        return;
      }

      if (e.target.id === 'saveSettings') {
        const showPast = container.querySelector('#showPast').checked;
        const showFuture = container.querySelector('#showFuture').checked;
        const showCurrentOnlyInput = container.querySelector('#showCurrentOnly').checked;
        const notesInputSlots = [1, 2, 3].map(i => document.querySelector(`#quickNotes${i}`)?.value);
        const hasNotesInputs = notesInputSlots.some(v => v != null);
        const notesSlots = hasNotesInputs
          ? notesInputSlots.map(v => v ?? '')
          : (Array.isArray(AppState.settings.userNotesSlots)
            ? [
              String(AppState.settings.userNotesSlots[0] ?? ''),
              String(AppState.settings.userNotesSlots[1] ?? ''),
              String(AppState.settings.userNotesSlots[2] ?? '')
            ]
            : [String(AppState.settings.userNotes || ''), '', '']);
        // If past or future is enabled, current-only cannot stay exclusive.
        const showCurrentOnly = (showPast || showFuture) ? false : showCurrentOnlyInput;

        persistSettings({
          currentSemester: parseInt(container.querySelector('#currentSemester').value),
          totalSemesters: TOTAL_SEMESTERS,
          admissionYear: parseInt(container.querySelector('#admissionYear').value),
          orderMode: container.querySelector('#orderMode').value,
          showCurrentOnly: showCurrentOnly,
          showPast: showPast,
          showFuture: showFuture,
          showPreviousSemesters: showPast,
          showReferenceCourses: container.querySelector('#showReferenceCourses').checked,
          showConfidenceBadge: container.querySelector('#showConfidenceBadge')?.checked ?? AppState.settings.showConfidenceBadge,
          focusCurrentOnly: showCurrentOnly,
          compactMode: container.querySelector('#compactMode').checked,
          advancedMode: container.querySelector('#advancedMode').checked,
          enableManualOverrides: container.querySelector('#enableManualOverrides')?.checked ?? AppState.settings.enableManualOverrides,
          enableEditButton: container.querySelector('#enableEditButton')?.checked ?? AppState.settings.enableEditButton,
          showCourseIds: container.querySelector('#showCourseIds').checked,
          autoExtractNames: container.querySelector('#autoExtractNames')?.checked ?? AppState.settings.autoExtractNames,
          userNotesSlots: notesSlots,
          userNotes: notesSlots[0] || ''
        });
        inject(); return;
      }

      if (e.target.id === 'resetSettings') {
        if (confirm('Reset all settings to defaults?')) { persistSettings(DEFAULT_SETTINGS); inject(); }
        return;
      }

      if (e.target.id === 'clearOverrides') {
        if (confirm('Clear all overrides? Custom names and assignments will be reset.')) {
          AppState.overrides = {};
          persistOverrides(); inject();
        }
        return;
      }

      if (e.target.closest('#exportDino')) {
        chrome.storage.local.get(null, all => {
          const blob = new Blob([JSON.stringify({
            settings: all[SETTINGS_KEY] || {},
            overrides: all[OVERRIDES_KEY] || {},
            prefs: all[STORAGE_KEY] || {},
            manualCourses: all[MANUAL_COURSES_KEY] || []
          }, null, 2)], { type: 'application/json' });
          const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(blob),
            download: `dino-export-${new Date().toISOString().slice(0, 10)}.json`
          });
          document.body.appendChild(a); a.click();
          setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 200);
        });
        return;
      }

      if (e.target.closest('#importDinoBtn')) {
        container.querySelector('#importDino')?.click(); return;
      }

      if (e.target.id === 'restartTutorial' || e.target.closest('#restartTutorial')) {
        _prevStepIndex = -1;
        try { chrome.storage.local.set({ [ONBOARDING_KEY]: false }, startOnboarding); }
        catch { startOnboarding(); }
        return;
      }

      const editorPane = container.querySelector('.sidebar-pane[data-tab="editor"]');
      if (editorPane?.contains(e.target)) {
        if (e.target.closest('#collapseAllBtn')) {
          const buckets = editorPane.querySelectorAll('.sem-bucket');
          const hidden = [...buckets].some(b => b.style.display === 'none');
          buckets.forEach(b => b.style.display = hidden ? 'flex' : 'none');
          return;
        }
        if (e.target.closest('#hideCoursesBtn')) { showHideCoursesModal(enrichedCourses); return; }
        if (e.target.closest('#addManualCourseBtn')) { showManualCourseModal(); return; }
        const assignBtn = e.target.closest('.sem-assign-btn');
        if (assignBtn) { showBulkAssignModal(assignBtn.dataset.sem, enrichedCourses); return; }
      }
    });

    container.addEventListener('change', e => {
      if (e.target.id === 'importDino' && e.target.files.length) {
        const reader = new FileReader();
        reader.onload = evt => {
          try {
            const data = JSON.parse(evt.target.result);
            const ops = [];
            if (data.settings) ops.push([SETTINGS_KEY, data.settings]);
            if (data.overrides) ops.push([OVERRIDES_KEY, data.overrides]);
            if (data.prefs) ops.push([STORAGE_KEY, data.prefs]);
            if (data.manualCourses) ops.push([MANUAL_COURSES_KEY, data.manualCourses]);
            ops.forEach(([k, v]) => chrome.storage.local.set({ [k]: v }));
            alert('Import successful! Reloading…');
            setTimeout(() => location.reload(), 600);
          } catch { alert('Import failed: invalid file.'); }
        };
        reader.readAsText(e.target.files[0]);
      }
    });

    const editorSearch = container.querySelector('#editorSearchInput');
    if (editorSearch) {
      editorSearch.addEventListener('input', function () {
        const q = this.value.toLowerCase();
        container.querySelectorAll('.sem-bucket').forEach(b => {
          b.style.display = (!q || b.querySelector('.sem-bucket-label')?.textContent.toLowerCase().includes(q)) ? 'flex' : 'none';
        });
      });
    }

  }

  async function openSearchModal() {
    const existing = document.getElementById('dino-search-modal');
    if (existing) { existing.remove(); }

    let allCourses = AppState.__visibleCourses || [];
    if (!allCourses.length) {
      await loadAllAsync();
      const rawCourses = await extractCourses();
      const combined = [...rawCourses, ...AppState.manualCourses];
      allCourses = combined.map(c => CourseEngine.applyOverrides(CourseEngine.enrich(c))).filter(c => !c.hidden);
    }

    const currentSemester = AppState.settings.currentSemester;
    const getSemesterValue = course => {
      if (course.manualSemester != null && course.manualSemester !== 'reference') {
        return parseInt(course.manualSemester, 10);
      }
      if (course.finalSemester != null) {
        return parseInt(course.finalSemester, 10);
      }
      return course.detectedSem || null;
    };
    const isCurrentCourse = course => getSemesterValue(course) === currentSemester;

    const currentCourses = allCourses.filter(isCurrentCourse).sort(smartSort);
    const pinnedCourses = allCourses.filter(course => course.pinned && !isCurrentCourse(course)).sort(smartSort);
    const recentCourses = allCourses
      .filter(course => course.lastOpened && !isCurrentCourse(course) && !course.pinned)
      .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0) || smartSort(a, b));
    const excludedIds = new Set([...currentCourses, ...pinnedCourses, ...recentCourses].map(course => course.id));
    const otherCourses = allCourses.filter(course => !excludedIds.has(course.id)).sort(smartSort);

    const modal = document.createElement('div');
    modal.id = 'dino-search-modal';
    modal.className = 'dino-search-modal';
    modal.innerHTML = `
      <div class="dino-search-box" role="dialog" aria-modal="true" aria-label="Search courses">
        <div class="dino-search-header">
          <input id="dinoSearchInput" class="dino-search-input" type="text" placeholder="Search course..." autocomplete="off" spellcheck="false">
          <div class="dino-search-hint">Current / Pinned / Recent / All</div>
        </div>
        <div id="dinoSearchResults" class="dino-search-results"></div>
      </div>`;
    document.body.appendChild(modal);

    const input = modal.querySelector('#dinoSearchInput');
    const results = modal.querySelector('#dinoSearchResults');
    let activeIndex = -1;
    let currentRows = [];

    const close = () => modal.remove();

    const rows = () => currentRows;

    const setActiveByIndex = index => {
      const list = rows();
      list.forEach(r => r.classList.remove('active'));
      if (!list.length) { activeIndex = -1; return; }
      const next = Math.max(0, Math.min(index, list.length - 1));
      activeIndex = next;
      list[next].classList.add('active');
      list[next].scrollIntoView({ block: 'nearest' });
    };

    const renderSection = (title, courses, query, emptyMessage) => {
      const matches = courses.filter(course => {
        const label = (course.displayName || course.name || '').toLowerCase();
        const courseId = (course.id || '').toLowerCase();
        return !query || label.includes(query) || courseId.includes(query);
      });
      if (!matches.length) {
        return '';
      }

      const rows = matches.slice(0, 8).map(course => {
        const label = escapeHtml(course.displayName || course.name || 'Course');
        const meta = [];
        if (course.pinned) meta.push('Pinned');
        if (course.lastOpened) meta.push('Recent');
        if (isCurrentCourse(course)) meta.push(`Sem ${currentSemester}`);
        const metaHtml = meta.length ? `<span class="dino-search-meta">${escapeHtml(meta.join(' · '))}</span>` : '';
        return `
          <a class="dino-search-row" href="${safeUrl(course.url)}">
            <span class="dino-search-row-title">${label}</span>
            ${metaHtml}
          </a>`;
      }).join('');

      return `
        <section class="dino-search-section">
          <div class="dino-search-section-title">${escapeHtml(title)}</div>
          <div class="dino-search-section-list">${rows}</div>
        </section>`;
    };

    const renderResults = query => {
      const q = query.trim().toLowerCase();
      const sections = [
        renderSection('Current', currentCourses, q, 'No current courses'),
        renderSection('Pinned', pinnedCourses, q, 'No pinned courses'),
        renderSection('Recent', recentCourses, q, 'No recent courses'),
        renderSection('All', otherCourses, q, 'No matching courses')
      ].filter(Boolean);

      results.innerHTML = sections.join('');
      currentRows = Array.from(results.querySelectorAll('.dino-search-row'));
      if (!currentRows.length) {
        const empty = document.createElement('div');
        empty.className = 'dino-search-empty';
        empty.textContent = q ? 'No matching courses' : 'Type to search courses';
        results.appendChild(empty);
        activeIndex = -1;
        return;
      }
      activeIndex = 0;
      currentRows[0].classList.add('active');
    };

    input.addEventListener('input', () => renderResults(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveByIndex((activeIndex < 0 ? 0 : activeIndex + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveByIndex((activeIndex < 0 ? 0 : activeIndex - 1));
        return;
      }
      if (e.key === 'Enter') {
        const list = rows();
        const active = list[activeIndex] || results.querySelector('.dino-search-row');
        if (active) {
          location.href = active.href;
        }
      }
    });

    results.addEventListener('mousemove', e => {
      const row = e.target.closest('.dino-search-row');
      if (!row) return;
      const list = rows();
      const idx = list.indexOf(row);
      if (idx >= 0) setActiveByIndex(idx);
    });

    modal.addEventListener('click', e => {
      if (e.target === modal) close();
      const row = e.target.closest('.dino-search-row');
      if (row) close();
    });

    renderResults('');
    requestAnimationFrame(() => {
      input.focus();
      input.select?.();
    });
  }

  // Onboarding
  const TUTORIAL_STEPS = [
    {
      id: 'welcome', position: 'bottom', tab: 'courses', target: '.dino-header',
      title: 'Welcome to Dino v3',
      content: 'Your smart Moodle organiser - now powered by admission-year based semester detection. Take a quick tour?',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`
    },
    {
      id: 'smart-sem', position: 'bottom', tab: 'courses', target: '.smart-insights',
      title: 'Smart Semester Detection',
      content: 'Dino uses your admission year to accurately calculate which semester each course belongs to - even when Moodle names are inconsistent.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`
    },
    {
      id: 'tabs', position: 'right', tab: 'courses', target: '.dino-sidebar',
      title: 'Navigation Tabs',
      content: 'Switch between Courses, Notes, Editor, and Settings using the icon tabs on the left sidebar.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`
    },
    {
      id: 'conf-badge', position: 'bottom', tab: 'courses', target: '.semester-group .conf-badge', fallbackTargets: ['.conf-badge', '#showConfidenceBadge'],
      title: 'Confidence Dots',
      content: 'Coloured dots show how certain Dino is about placement. Blue = high, yellow = medium, red = needs your review.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>`
    },
    {
      id: 'drag', position: 'right', tab: 'courses', target: '.semester-group',
      title: 'Drag and Drop',
      content: 'Drag any course chip to a different semester section to reassign it instantly. No save button needed.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 9l-3 3 3 3"/><path d="M19 9l3 3-3 3"/><path d="M2 12h20"/><path d="M9 5l3-3 3 3"/><path d="M9 19l3 3 3-3"/></svg>`
    },
    {
      id: 'editor', position: 'right', tab: 'editor', target: '.sidebar-tab[data-tab="editor"]',
      title: 'Semester Editor',
      content: 'Use the Editor tab to bulk-assign courses to semesters, hide ones you don\'t need, or add custom courses.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`
    },
    {
      id: 'settings', position: 'top', tab: 'settings', target: '#currentSemester', fallbackTargets: ['#admissionYear'],
      title: 'Set Semester & Admission Year',
      content: 'In Settings, pick the correct current semester and admission year so Dino can place courses accurately.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`
    },
    {
      id: 'save-settings', position: 'top', tab: 'settings', target: '#saveSettings',
      title: 'Save Changes',
      content: 'After updating these values, click Save to apply them and refresh your dashboard view.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`
    },
    {
      id: 'done', position: 'center', target: null,
      title: 'You\'re all set!',
      content: 'Dino v3 is ready to go. Explore, customise, and enjoy a cleaner Moodle experience.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
    }
  ];

  let currentStep = 0;
  let _prevStepIndex = -1;

  function startOnboarding() { currentStep = 0; _prevStepIndex = -1; showOnboardingStep(0); }

  function _activateTutorialTab(tabName) {
    if (!tabName) return;
    const tabBtn = document.querySelector(`.sidebar-tab[data-tab="${tabName}"]`);
    if (tabBtn && !tabBtn.classList.contains('active')) {
      tabBtn.click();
    }
  }

  function _resolveTutorialTarget(step) {
    if (step?.id === 'conf-badge') {
      // Highlight the full chip that carries the confidence dot, not the tiny dot itself.
      const badge = document.querySelector('.semester-group .dino-chip .conf-badge')
        || document.querySelector('.dino-chip .conf-badge')
        || document.querySelector('.conf-badge');
      if (badge) {
        return badge.closest('.dino-chip') || badge;
      }
    }

    const selectors = [step.target, ...(step.fallbackTargets || [])].filter(Boolean);
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.getClientRects().length > 0) return el;
    }
    return null;
  }

  function _positionTooltip(tip, target, position) {
    const PAD = 16, ARROW = 12;
    const vw = window.innerWidth, vh = window.innerHeight;
    const tw = tip.offsetWidth, th = tip.offsetHeight;

    if (!target || position === 'center') {
      tip.style.top = `${(vh - th) / 2}px`;
      tip.style.left = `${(vw - tw) / 2}px`;
      tip.dataset.arrow = 'none';
      return;
    }

    const r = target.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let top, left, arrow = position;

    const fits = {
      bottom: r.bottom + ARROW + th + PAD < vh,
      top:    r.top - ARROW - th - PAD > 0,
      right:  r.right + ARROW + tw + PAD < vw,
      left:   r.left - ARROW - tw - PAD > 0
    };

    // honour requested position, fallback if no room
    const preferred = [position, 'bottom', 'top', 'right', 'left'].find(d => fits[d]) || 'bottom';
    arrow = preferred;

    if (preferred === 'bottom') {
      top  = r.bottom + ARROW;
      left = Math.max(PAD, Math.min(cx - tw / 2, vw - tw - PAD));
    } else if (preferred === 'top') {
      top  = r.top - ARROW - th;
      left = Math.max(PAD, Math.min(cx - tw / 2, vw - tw - PAD));
    } else if (preferred === 'right') {
      top  = Math.max(PAD, Math.min(cy - th / 2, vh - th - PAD));
      left = r.right + ARROW;
    } else {
      top  = Math.max(PAD, Math.min(cy - th / 2, vh - th - PAD));
      left = r.left - ARROW - tw;
    }

    tip.style.top  = `${top}px`;
    tip.style.left = `${left}px`;
    tip.dataset.arrow = arrow;
  }

  function showOnboardingStep(stepIndex) {
    const direction = stepIndex > _prevStepIndex ? 'forward' : 'backward';
    _prevStepIndex = stepIndex;

    document.getElementById('onboarding-overlay')?.remove();
    if (stepIndex >= TUTORIAL_STEPS.length) {
      try { chrome.storage.local.set({ [ONBOARDING_KEY]: true }); } catch { }
      return;
    }

    const step    = TUTORIAL_STEPS[stepIndex];
    _activateTutorialTab(step.tab);
    const target  = _resolveTutorialTarget(step);
    const isLast  = stepIndex === TUTORIAL_STEPS.length - 1;
    const total   = TUTORIAL_STEPS.length;

    const progressDots = TUTORIAL_STEPS.map((_, i) => {
      const cls = i === stepIndex ? 'active' : (i < stepIndex ? 'completed' : '');
      return `<div class="ob-dot ${cls}"></div>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.innerHTML = `
      <div class="ob-backdrop"></div>
      ${target ? `<div id="ob-spotlight" class="ob-spotlight"></div>` : ''}
      <div id="ob-tooltip" class="ob-tooltip ob-enter-${direction}" role="dialog" aria-modal="true" aria-label="${step.title}">
        <div class="ob-top">
          <div class="ob-icon-wrap ${isLast ? 'ob-icon-done' : ''}">${step.icon}</div>
          <div class="ob-meta">
            <span class="ob-counter">${stepIndex + 1} / ${total}</span>
            <h3 class="ob-title">${step.title}</h3>
          </div>
          <button class="ob-close" id="ob-close" aria-label="Close tutorial">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <p class="ob-body">${step.content}</p>
        <div class="ob-footer">
          <div class="ob-progress">${progressDots}</div>
          <div class="ob-actions">
            ${stepIndex > 0 ? `<button class="ob-btn ob-back" id="ob-prev">← Back</button>` : `<span></span>`}
            <button class="ob-btn ob-next ${isLast ? 'ob-finish' : ''}" id="ob-next">
              ${isLast ? '✓ Finish' : 'Next →'}
            </button>
          </div>
        </div>
        ${isLast ? '' : `<button class="ob-skip" id="ob-skip">Skip tutorial</button>`}
      </div>`;

    document.body.appendChild(overlay);

    const tip = document.getElementById('ob-tooltip');
    let rafId;

    const updateSpotlightAndPos = () => {
      const liveTarget = _resolveTutorialTarget(step);
      const sp = document.getElementById('ob-spotlight');
      if (sp && liveTarget && document.contains(liveTarget)) {
        const r = liveTarget.getBoundingClientRect();
        Object.assign(sp.style, {
          top:    `${r.top    - 10}px`,
          left:   `${r.left  - 10}px`,
          width:  `${r.width  + 20}px`,
          height: `${r.height + 20}px`,
          display: 'block'
        });
      } else if (sp) {
        sp.style.display = 'none';
      }

      _positionTooltip(tip, liveTarget, step.position);
    };

    const loop = () => { updateSpotlightAndPos(); rafId = requestAnimationFrame(loop); };

    // initial layout pass then start loop
    requestAnimationFrame(() => {
      updateSpotlightAndPos();
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        loop();
      }
    });

    const cleanup = () => {
      document.removeEventListener('keydown', onKey);
      if (rafId) cancelAnimationFrame(rafId);
    };
    const close = () => {
      cleanup(); overlay.remove();
      try { chrome.storage.local.set({ [ONBOARDING_KEY]: true }); } catch { }
    };
    const next = () => { cleanup(); currentStep++; showOnboardingStep(currentStep); };
    const prev = () => { cleanup(); currentStep--; showOnboardingStep(currentStep); };
    const onKey = e => {
      if (e.key === 'Escape')                          { close(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { next(); }
      else if (e.key === 'ArrowLeft' && stepIndex > 0) { prev(); }
    };

    overlay.querySelector('#ob-close').addEventListener('click', close);
    overlay.querySelector('#ob-next').addEventListener('click', next);
    overlay.querySelector('#ob-prev')?.addEventListener('click', prev);
    overlay.querySelector('#ob-skip')?.addEventListener('click', close);
    // backdrop click does NOT close - prevents accidental dismissal
    document.addEventListener('keydown', onKey);
  }

  // Main inject
  async function inject() {
    if (!isDashboardPage()) return;
    cleanupUI();
    const target = document.querySelector("#page-content") || document.querySelector("main");
    if (!target) return;

    const rawCourses = await extractCourses();

    loadAll(() => {
      const { settings, manualCourses, prefs } = AppState;

      const combined = [...rawCourses, ...manualCourses];
      const enriched = combined.map(c => CourseEngine.enrich(c));
      enriched.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned - a.pinned;
        return a.order - b.order;
      });
      const withOverrides = enriched.map(c => CourseEngine.applyOverrides(c));
      const visible = withOverrides.filter(c => !c.hidden);
      AppState.__visibleCourses = visible;

      if (!combined.length) return;

      buildStructure();

      const old = document.getElementById('dino-guide');
      if (old) { saveCollapsedState(); old.remove(); }

      const container = document.createElement('div');
      container.id = 'dino-guide';
      container.innerHTML = `
        <div class="dino-header">
          <div class="dino-title-row">
            <img src="${chrome.runtime.getURL('assets/branding/dino.png')}" class="dino-logo" alt="Dino">
            <div class="dino-title-text">
              <h2>Dino - Guide</h2>
              <p class="dino-subtitle">Smart course organiser • Semester planner • Drag &amp; drop Editor</p>
            </div>
          </div>
          <div class="header-info">
            Sem ${settings.currentSemester}/${settings.totalSemesters}
            • ${visible.length} courses
            • ${settings.admissionYear} batch
          </div>
        </div>
        ${UIRenderer.fullLayout(withOverrides, true, visible)}`;

      target.prepend(container);
      restoreCollapsedState();
      setupDragDrop(container);
      setupEvents(container, withOverrides);

      setTimeout(() => {
        try {
          chrome.storage.local.get([ONBOARDING_KEY], res => {
            if (!res[ONBOARDING_KEY]) setTimeout(startOnboarding, 500);
          });
        } catch { }
      }, 100);
    });
  }

  bindGlobalHotkeys();
  if (isDashboardPage()) setTimeout(inject, 800);
})();