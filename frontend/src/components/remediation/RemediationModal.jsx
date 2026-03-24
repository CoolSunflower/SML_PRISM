import { useState, useMemo, useEffect } from 'react';
import { useTopics } from '../../hooks/useTopics';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';

const SENTIMENT_OPTIONS = ['positive', 'neutral', 'negative'];

/**
 * Modal for accepting a post with optional field edits
 * @param {{
 *   item: object,
 *   dataSource: 'kwatch' | 'google-alerts',
 *   onConfirm: (editedFields: {sentiment?: string, topic?: string, subTopic?: string}) => Promise<void>,
 *   onCancel: () => void
 * }} props
 */
export function RemediationModal({ item, dataSource, onConfirm, onCancel }) {
  const { topics, loading: topicsLoading } = useTopics();

  // Block scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Normalize sentiment to lowercase for form state
  const initialSentiment = (item.sentiment || 'neutral').toLowerCase();
  const [sentiment, setSentiment] = useState(initialSentiment);
  const [topic, setTopic] = useState(item.topic || '');
  const [subTopic, setSubTopic] = useState(item.subTopic || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Get available sub-topics for selected topic
  const subTopics = useMemo(() => {
    const topicData = topics.find((t) => t.topic === topic);
    return topicData?.subTopics || [];
  }, [topics, topic]);

  // Reset subTopic when topic changes (unless it's still valid)
  const handleTopicChange = (newTopic) => {
    setTopic(newTopic);
    const topicData = topics.find((t) => t.topic === newTopic);
    if (!topicData?.subTopics?.includes(subTopic)) {
      setSubTopic('');
    }
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Only include fields that changed
      const editedFields = {};
      if (sentiment !== initialSentiment) editedFields.sentiment = sentiment;
      if (topic !== (item.topic || '')) editedFields.topic = topic;
      if (subTopic !== (item.subTopic || '')) editedFields.subTopic = subTopic;

      await onConfirm(editedFields);
    } catch (err) {
      setError(err.message || 'Failed to accept item');
      setSubmitting(false);
    }
  };

  const content = item.content || item.text || '';
  const title = item.title || '';
  const author = item.author || '';
  const platform = item.platform || '';
  const sourceUrl = item.link || item.url || item.extractedUrl || '';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Mark as Relevant</h2>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Post Preview */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {author && <span className="text-sm font-semibold text-slate-900 dark:text-white">{author}</span>}
              {platform && <Badge variant="info">{platform}</Badge>}
            </div>
            {title && <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">{title}</h3>}
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line max-h-48 overflow-y-auto">
              {content}
            </p>
            {sourceUrl && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                  View Source
                </a>
              </div>
            )}
          </div>

          {/* Edit Fields */}
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">
              Update Classification (Optional)
            </p>

            {/* Sentiment */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Sentiment
              </label>
              <div className="flex gap-2">
                {SENTIMENT_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSentiment(s)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      sentiment === s
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Brand (Topic)
              </label>
              {topicsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Spinner size="sm" /> Loading topics...
                </div>
              ) : (
                <select
                  value={topic}
                  onChange={(e) => handleTopicChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
                >
                  <option value="">-- Select Topic --</option>
                  {topics.map((t) => (
                    <option key={t.topic} value={t.topic}>
                      {t.topic}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Sub-Topic */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Sub-brand (Sub-topic)
              </label>
              <select
                value={subTopic}
                onChange={(e) => setSubTopic(e.target.value)}
                disabled={!topic || subTopics.length === 0}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">-- Select Sub-topic --</option>
                {subTopics.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <span className="material-symbols-outlined text-sm">error</span>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Spinner size="sm" /> Accepting...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Confirm as Relevant
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
