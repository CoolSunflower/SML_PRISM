import { Header } from './components/layout/Header';
import { FilterBar } from './components/layout/FilterBar';
import { AnalyticsSection } from './components/analytics/AnalyticsSection';
import { FeedList } from './components/feed/FeedList';
import { FilterDrawer } from './components/filters/FilterDrawer';
import { useFilterStore } from './store/filterStore';
import { useAnalytics } from './hooks/useAnalytics';
import { useFeed } from './hooks/useFeed';

export default function App() {
  const { processing } = useFilterStore();
  const { data: analyticsData, loading: analyticsLoading } = useAnalytics();
  const { items, pagination, loading: feedLoading } = useFeed();
  const isProcessed = processing === 'processed';

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark transition-colors">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-6">
        <FilterBar />
        {isProcessed && <FilterDrawer />}
        <AnalyticsSection data={analyticsData} loading={analyticsLoading} pagination={pagination} />
        <FeedList items={items} pagination={pagination} loading={feedLoading} />
      </main>
    </div>
  );
}
