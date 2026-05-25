import { useState } from 'react';
import { Badge } from '../ui/Badge';
import { PlatformIcon } from '../ui/PlatformIcon';
import { timeAgo } from '../../utils/formatters';
import { RemediationModal } from '../remediation/RemediationModal';

const sentimentVariant = {
  positive: 'positive',
  neutral: 'neutral',
  negative: 'negative',
  // Google Alerts uses capitalized sentiment
  Positive: 'positive',
  Neutral: 'neutral',
  Negative: 'negative',
};

export function GoogleAlertsCard({ item, isProcessed, onRemediate, onDelete, onShowToast }) {
  const [showModal, setShowModal] = useState(false);
  const [remediating, setRemediating] = useState(false);

  const dateField = isProcessed ? item.classifiedAt : item.scrapedAt;
  const content = item.content || '';
  const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;
  const sourceUrl = item.extractedUrl || item.googleLink || item.url;

  // Use new remediationStatus field (null/undefined = not remediated)
  const remediationStatus = item.remediationStatus || null;

  // Normalize sentiment display (Google Alerts uses capitalized)
  const sentimentDisplay = item.sentiment || '';
  const sentimentLower = sentimentDisplay.toLowerCase();

  // Handle rejection (no modal needed)
  async function handleReject() {
    setRemediating(true);
    try {
      await onRemediate(item.id, 'rejected', null, {});
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
      await onRemediate(item.id, 'undo', null, {});
      onShowToast?.({ message: 'Remediation undone', type: 'success' });
    } catch (err) {
      onShowToast?.({ message: err.message || 'Failed to undo', type: 'error' });
    } finally {
      setRemediating(false);
    }
  }

  // Handle acceptance with optional field edits from modal
  async function handleAcceptConfirm(editedFields) {
    await onRemediate(item.id, 'accepted', null, editedFields);
    onShowToast?.({ message: 'Post marked as relevant', type: 'success' });
    setShowModal(false);
  }

  return (
    <>
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
              {sentimentDisplay && (
                <Badge variant={sentimentVariant[sentimentDisplay] || 'neutral'}>
                  {sentimentLower}
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
            {/* Translated Content if present */}
            {item.translatedContent && item.translatedContent !== content && (
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line mt-2 italic">
                <b>Translation:</b> {item.translatedContent}
              </p>
            )}

            {/* Footer row */}
            <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
              <div className="flex items-center gap-3">
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
                {onDelete && (
                  <button
                    onClick={() => onDelete(item.id, 'google-alerts')}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                    title="Delete Post"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    Delete
                  </button>
                )}
              </div>

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
          dataSource="google-alerts"
          onConfirm={handleAcceptConfirm}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  );
}
