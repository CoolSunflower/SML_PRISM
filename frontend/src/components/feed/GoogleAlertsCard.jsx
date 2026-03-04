import { Badge } from '../ui/Badge';
import { timeAgo } from '../../utils/formatters';

export function GoogleAlertsCard({ item, isProcessed }) {
  const dateField = isProcessed ? item.classifiedAt : item.scrapedAt;
  const content = item.content || '';
  const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {/* Globe icon */}
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-slate-500 text-lg">public</span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center flex-wrap gap-2 mb-1">
            {item.title && (
              <span className="text-sm font-bold text-slate-900 truncate max-w-md">{item.title}</span>
            )}
            <Badge variant="info">Google Alerts</Badge>
            {item.keyword && <Badge variant="info">{item.keyword}</Badge>}
            {item.contentSource && (
              <Badge variant={item.contentSource === 'fullContent' ? 'success' : 'amber'}>
                {item.contentSource === 'fullContent' ? 'Full Content' : 'Snippet'}
              </Badge>
            )}
            <span className="text-xs text-slate-400 ml-auto shrink-0">{timeAgo(dateField)}</span>
          </div>

          {/* Classification box (processed only) */}
          {isProcessed && item.topic && (
            <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg">
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
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{truncated}</p>

          {/* Footer */}
          {(item.extractedUrl || item.url) && (
            <a
              href={item.extractedUrl || item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">open_in_new</span>
              View Original
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
