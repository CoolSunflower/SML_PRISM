import { Badge } from '../ui/Badge';
import { PlatformIcon } from '../ui/PlatformIcon';
import { timeAgo } from '../../utils/formatters';

export function GoogleAlertsCard({ item, isProcessed }) {
  const dateField = isProcessed ? item.classifiedAt : item.scrapedAt;
  const content = item.content || '';
  const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;
  const sourceUrl = item.extractedUrl || item.googleLink || item.url;

  const sentimentVariant = {
    positive: 'positive',
    neutral: 'neutral',
    negative: 'negative',
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <PlatformIcon platform="google-alerts" />

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center flex-wrap gap-2 mb-1">
            {item.title && (
              <span className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-md">{item.title}</span>
            )}
            <Badge variant="info">Google Alerts</Badge>
            {item.keyword && <Badge variant="info">{item.keyword}</Badge>}
            {item.contentSource && (
              <Badge variant={item.contentSource === 'fullContent' ? 'success' : 'amber'}>
                {item.contentSource === 'fullContent' ? 'Full Content' : 'Snippet'}
              </Badge>
            )}
            {item.sentiment && (
              <Badge variant={sentimentVariant[item.sentiment] || 'neutral'}>
                {item.sentiment}
              </Badge>
            )}
            <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto shrink-0">{timeAgo(dateField)}</span>
          </div>

          {/* Classification box (processed only) */}
          {isProcessed && item.topic && (
            <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 rounded-lg">
              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-sm">sell</span>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {item.topic}
                {item.subTopic && ` / ${item.subTopic}`}
              </span>
              {item.topic === 'General-RelevancyClassification' && (
                <Badge variant="purple">ML</Badge>
              )}
            </div>
          )}

          {/* Content */}
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{truncated}</p>

          {/* Footer - View Source */}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-primary/80 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">open_in_new</span>
              View Source
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
