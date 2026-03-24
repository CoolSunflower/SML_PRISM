import { useState } from 'react';
import { Badge } from '../ui/Badge';
import { PlatformIcon } from '../ui/PlatformIcon';
import { timeAgo } from '../../utils/formatters';
import { RemediationModal } from '../remediation/RemediationModal';

const platformLabels = {
  twitter: 'Twitter/X',
  reddit: 'Reddit',
  facebook: 'Facebook',
  youtube: 'YouTube',
};

const sentimentVariant = {
  positive: 'positive',
  neutral: 'neutral',
  negative: 'negative',
};

export function KWatchCard({ item, isProcessed, onRemediate, onShowToast }) {
  const [showModal, setShowModal] = useState(false);
  const [remediating, setRemediating] = useState(false);

  const platform = (item.platform || '').toLowerCase();
  const label = platformLabels[platform] || 'Web';
  const dateField = isProcessed ? item.datetime : item.receivedAt;
  const content = item.content || item.text || '';
  const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;

  // Use new remediationStatus field (null/undefined = not remediated)
  const remediationStatus = item.remediationStatus || null;

  // Handle rejection (no modal needed)
  async function handleReject() {
    setRemediating(true);
    try {
      await onRemediate(item.id, 'rejected', item.platform, {});
      onShowToast?.({ message: 'Post marked as irrelevant', type: 'success' });
    } catch (err) {
      onShowToast?.({ message: err.message || 'Failed to reject', type: 'error' });
    } finally {
      setRemediating(false);
    }
  }

  // Handle undo action
  async function handleUndo() {
    setRemediating(true);
    try {
      await onRemediate(item.id, 'undo', item.platform, {});
      onShowToast?.({ message: 'Remediation undone', type: 'success' });
    } catch (err) {
      onShowToast?.({ message: err.message || 'Failed to undo', type: 'error' });
    } finally {
      setRemediating(false);
    }
  }

  // Handle acceptance with optional field edits from modal
  async function handleAcceptConfirm(editedFields) {
    await onRemediate(item.id, 'accepted', item.platform, editedFields);
    onShowToast?.({ message: 'Post marked as relevant', type: 'success' });
    setShowModal(false);
  }

  return (
    <>
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
              {(item.link || item.url) && (
                <a
                  href={item.link || item.url}
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
                  {remediationStatus === 'accepted' && (
                    <>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        Accepted
                      </span>
                      <button
                        onClick={handleUndo}
                        disabled={remediating}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Undo"
                      >
                        <span className="material-symbols-outlined text-sm">undo</span>
                      </button>
                    </>
                  )}
                  {remediationStatus === 'rejected' && (
                    <>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                        <span className="material-symbols-outlined text-sm">cancel</span>
                        Rejected
                      </span>
                      <button
                        onClick={handleUndo}
                        disabled={remediating}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Undo"
                      >
                        <span className="material-symbols-outlined text-sm">undo</span>
                      </button>
                    </>
                  )}
                  {remediationStatus === null && (
                    <>
                      <button
                        onClick={handleReject}
                        disabled={remediating}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="material-symbols-outlined text-sm">cancel</span>
                        Irrelevant
                      </button>
                      <button
                        onClick={() => setShowModal(true)}
                        disabled={remediating}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        Relevant
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Remediation Modal */}
      {showModal && (
        <RemediationModal
          item={item}
          dataSource="kwatch"
          onConfirm={handleAcceptConfirm}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  );
}
