import { create } from 'zustand';

export const useSettingsStore = create((set) => ({
  theme: 'light',      // 'light' | 'dark'
  chartType: 'area',    // 'bar' | 'line' | 'area'

  setTheme: (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    set({ theme });
  },
  setChartType: (chartType) => set({ chartType }),
}));
