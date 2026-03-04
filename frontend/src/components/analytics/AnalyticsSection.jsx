import { useFilterStore } from '../../store/filterStore';
import { PostsChart } from './PostsChart';
import { SentimentCard } from './SentimentCard';
import { TopTopicsCard } from './TopTopicsCard';
import { MethodSplitCard } from './MethodSplitCard';

export function AnalyticsSection({ data, loading }) {
  const { processing, source } = useFilterStore();
  const isProcessed = processing === 'processed';

  if (loading || !data) return null;

  // Sentiment only for KWatch processed or "all" processed (GA has no sentiment)
  // update: GA now has sentiment
  const showSentiment = isProcessed && source !== 'google-alerts' && data.sentiment;
  const showTopTopics = isProcessed && data.topTopics?.length > 0;
  const showMethodSplit = isProcessed && data.classificationMethod;

  // Raw view: just the chart full width
  if (!isProcessed) {
    return (
      <div className="mb-6">
        <PostsChart data={data} />
      </div>
    );
  }

  // Processed view: grid layout
  return (
    <div className="space-y-4 mb-6">
      <div className={`grid gap-4 ${showSentiment ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
        <div className={showSentiment ? 'lg:col-span-2' : ''}>
          <PostsChart data={data} />
        </div>
        {showSentiment && <SentimentCard data={data} />}
      </div>
      {(showTopTopics || showMethodSplit) && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {showTopTopics && <TopTopicsCard data={data} />}
          {showMethodSplit && <MethodSplitCard data={data} />}
        </div>
      )}
    </div>
  );
}
