import { Badge } from '../ui/Badge';
import { PlatformIcon } from '../ui/PlatformIcon';
import { timeAgo } from '../../utils/formatters';

const platformLabels = {
  twitter: 'Twitter/X',
  reddit: 'Reddit',
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

const sentimentVariant = {
  positive: 'positive',
  neutral: 'neutral',
  negative: 'negative',
};

export function KWatchCard({ item, isProcessed }) {
  const platform = (item.platform || '').toLowerCase();
  const label = platformLabels[platform] || 'Web';
  const dateField = isProcessed ? item.classifiedAt : item.receivedAt;
  const content = item.content || item.text || '';
  const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <PlatformIcon platform={platform} />

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center flex-wrap gap-2 mb-1">
            {item.author && (
              <span className="text-sm font-bold text-slate-900 dark:text-white">{item.author}</span>
            )}
            <Badge variant="info">{label}</Badge>
            {item.sentiment && (
              <Badge variant={sentimentVariant[item.sentiment] || 'neutral'}>
                {item.sentiment}
              </Badge>
            )}
            {item.isDuplicate && <Badge variant="amber">Duplicate</Badge>}
            <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto shrink-0">{timeAgo(dateField)}</span>
          </div>

          {/* Classification box (processed only) */}
          {isProcessed && item.topic && (
            <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 rounded-lg">
              <span className="material-symbols-outlined text-emerald-600 text-sm">sell</span>
              <span className="text-xs font-semibold text-emerald-700">
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
          {(item.link || item.url) && (
            <a
              href={item.link || item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
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
