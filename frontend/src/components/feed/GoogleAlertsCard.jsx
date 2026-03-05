import { useState } from 'react';
import { Badge } from '../ui/Badge';
import { PlatformIcon } from '../ui/PlatformIcon';
import { timeAgo } from '../../utils/formatters';

export function GoogleAlertsCard({ item, isProcessed, onRemediate }) {
  const [remediating, setRemediating] = useState(false);
  const [remediateError, setRemediateError] = useState(null);

  const dateField = isProcessed ? item.classifiedAt : item.scrapedAt;
  const content = item.content || '';
  const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;
  const sourceUrl = item.extractedUrl || item.googleLink || item.url;

  const isDoneRemediation = item.doneRemediation === true;

  const sentimentVariant = {
    positive: 'positive',
    neutral: 'neutral',
    negative: 'negative',
  };

  async function handleRemediate(action) {
    setRemediating(true);
    setRemediateError(null);
    try {
      await onRemediate(item.id, action);
    } catch (err) {
      setRemediateError(err.message || 'Failed to remediate');
    } finally {
      setRemediating(false);
    }
  }

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

          {/* Footer row */}
          <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-primary/80 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">open_in_new</span>
                View Source
              </a>
            )}

            {/* Remediation controls (processed mode only) */}
            {isProcessed && (
              <div className="flex items-center gap-2 ml-auto">
                {isDoneRemediation ? (
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    item.remediationAction === 'accepted'
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}>
                    <span className="material-symbols-outlined text-sm">
                      {item.remediationAction === 'accepted' ? 'check_circle' : 'cancel'}
                    </span>
                    {item.remediationAction === 'accepted' ? 'Accepted' : 'Rejected'}
                  </span>
                ) : (
                  <>
                    {remediateError && (
                      <span className="text-xs text-red-500 dark:text-red-400">{remediateError}</span>
                    )}
                    <button
                      onClick={() => handleRemediate('rejected')}
                      disabled={remediating}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-sm">cancel</span>
                      Reject
                    </button>
                    <button
                      onClick={() => handleRemediate('accepted')}
                      disabled={remediating}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      Accept
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
