import { create } from 'zustand';

// Default values for all granular filters (draft + applied)
const DEFAULT_FILTERS = {
  startDate: '',
  endDate: '',
  topic: '',
  subTopic: '',
  platform: [],   // string[] of selected platform values
  sentiment: [],   // string[] e.g. ['positive','negative']
};

export const useFilterStore = create((set, get) => ({
  // ---- Core toggles (take effect immediately) ----
  source: 'all',           // 'all' | 'kwatch' | 'google-alerts'
  processing: 'processed', // 'raw' | 'processed'
  chartDays: 7,

  // ---- Draft state (UI selections, NOT yet sent to APIs) ----
  draft: { ...DEFAULT_FILTERS },

  // ---- Applied state (frozen snapshot sent to APIs) ----
  applied: { ...DEFAULT_FILTERS },

  // ---- Trigger counter (hooks depend on this to know when to fetch) ----
  fetchTrigger: 0,

  // ---- UI state ----
  filtersOpen: false,
  page: 1,
  limit: 25,

  // ---- Core toggle actions (immediate effect + auto-clear filters) ----
  setSource: (source) => set({
    source,
    page: 1,
    draft: { ...DEFAULT_FILTERS },
    applied: { ...DEFAULT_FILTERS },
    fetchTrigger: get().fetchTrigger + 1,
  }),

  setProcessing: (processing) => set({
    processing,
    page: 1,
    draft: { ...DEFAULT_FILTERS },
    applied: { ...DEFAULT_FILTERS },
    filtersOpen: false,
    fetchTrigger: get().fetchTrigger + 1,
  }),

  setChartDays: (chartDays) => set({ chartDays }),

  // ---- Draft mutations (UI only, no API calls) ----
  setDraftDateRange: (startDate, endDate) =>
    set((s) => ({ draft: { ...s.draft, startDate, endDate } })),
  setDraftTopic: (topic) =>
    set((s) => ({ draft: { ...s.draft, topic, subTopic: '' } })),
  setDraftSubTopic: (subTopic) =>
    set((s) => ({ draft: { ...s.draft, subTopic } })),
  setDraftPlatform: (platform) =>
    set((s) => ({ draft: { ...s.draft, platform } })),
  setDraftSentiment: (sentiment) =>
    set((s) => ({ draft: { ...s.draft, sentiment } })),

  // ---- Apply action: copy draft -> applied, bump trigger, reset page ----
  applyFilters: () => set((s) => ({
    applied: { ...s.draft },
    fetchTrigger: s.fetchTrigger + 1,
    page: 1,
  })),

  // ---- Clear action: reset both draft & applied to defaults ----
  clearFilters: () => set((s) => ({
    draft: { ...DEFAULT_FILTERS },
    applied: { ...DEFAULT_FILTERS },
    fetchTrigger: s.fetchTrigger + 1,
    page: 1,
  })),

  // ---- Pagination (triggers fetch immediately via page dependency in hook) ----
  setPage: (page) => set({ page }),

  // ---- Drawer toggle ----
  toggleFilters: () => set((s) => ({ filtersOpen: !s.filtersOpen })),
}));
