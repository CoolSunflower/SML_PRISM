import { useFilterStore } from '../../store/filterStore';
import { useTopics } from '../../hooks/useTopics';

export function TopicFilter() {
  const draft = useFilterStore((s) => s.draft);
  const setDraftTopic = useFilterStore((s) => s.setDraftTopic);
  const setDraftSubTopic = useFilterStore((s) => s.setDraftSubTopic);
  const { topics, loading } = useTopics();

  const selectedTopic = topics.find((t) => t.topic === draft.topic);
  const subTopics = selectedTopic?.subTopics || [];

  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
        Topic / Sub-topic
      </label>
      <div className="space-y-2">
        <select
          value={draft.topic}
          onChange={(e) => setDraftTopic(e.target.value)}
          disabled={loading}
          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
        >
          <option value="">All Topics</option>
          {topics.map((t) => (
            <option key={t.topic} value={t.topic}>
              {t.isRelevancyFallback ? 'Relevancy Classified (ML)' : t.topic}
            </option>
          ))}
        </select>
        {subTopics.length > 0 && (
          <select
            value={draft.subTopic}
            onChange={(e) => setDraftSubTopic(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">All Sub-topics</option>
            {subTopics.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
