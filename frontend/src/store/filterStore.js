import { create } from 'zustand';

export const useFilterStore = create((set) => ({
  // Core toggles
  source: 'all',         // 'all' | 'kwatch' | 'google-alerts'
  processing: 'processed',     // 'raw' | 'processed'

  // Analytics chart range
  chartDays: 7,

  // Processed-view filters
  startDate: '',
  endDate: '',
  topic: '',
  subTopic: '',

  // Filter drawer open state
  filtersOpen: false,

  // Pagination
  page: 1,
  limit: 25,

  // Actions
  setSource: (source) => set({ source, page: 1 }),
  setProcessing: (processing) => set({ processing, page: 1 }),
  setChartDays: (chartDays) => set({ chartDays }),
  setDateRange: (startDate, endDate) => set({ startDate, endDate, page: 1 }),
  setTopic: (topic) => set({ topic, subTopic: '', page: 1 }),
  setSubTopic: (subTopic) => set({ subTopic, page: 1 }),
  setPage: (page) => set({ page }),
  toggleFilters: () => set((s) => ({ filtersOpen: !s.filtersOpen })),
  clearFilters: () => set({ startDate: '', endDate: '', topic: '', subTopic: '', page: 1 }),
}));
