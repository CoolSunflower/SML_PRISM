import { Badge } from '../ui/Badge';
import { timeAgo } from '../../utils/formatters';

const platformConfig = {
  twitter: { icon: 'tag', color: 'bg-sky-100 text-sky-600', label: 'Twitter/X' },
  reddit: { icon: 'forum', color: 'bg-orange-100 text-orange-600', label: 'Reddit' },
  facebook: { icon: 'group', color: 'bg-blue-100 text-blue-600', label: 'Facebook' },
  instagram: { icon: 'photo_camera', color: 'bg-pink-100 text-pink-600', label: 'Instagram' },
  youtube: { icon: 'play_circle', color: 'bg-red-100 text-red-600', label: 'YouTube' },
  tiktok: { icon: 'music_note', color: 'bg-slate-100 text-slate-600', label: 'TikTok' },
  default: { icon: 'language', color: 'bg-slate-100 text-slate-600', label: 'Web' },
};

const sentimentVariant = {
  positive: 'positive',
  neutral: 'neutral',
  negative: 'negative',
};

export function KWatchCard({ item, isProcessed }) {
  const platform = (item.platform || '').toLowerCase();
  const config = platformConfig[platform] || platformConfig.default;
  const dateField = isProcessed ? item.classifiedAt : item.receivedAt;
  const content = item.content || item.text || '';
  const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {/* Platform icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${config.color}`}>
          <span className="material-symbols-outlined text-lg">{config.icon}</span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center flex-wrap gap-2 mb-1">
            {item.author && (
              <span className="text-sm font-bold text-slate-900">{item.author}</span>
            )}
            <Badge variant="info">{config.label}</Badge>
            {item.sentiment && (
              <Badge variant={sentimentVariant[item.sentiment] || 'neutral'}>
                {item.sentiment}
              </Badge>
            )}
            {item.isDuplicate && <Badge variant="amber">Duplicate</Badge>}
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
          {item.url && (
            <a
              href={item.url}
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
