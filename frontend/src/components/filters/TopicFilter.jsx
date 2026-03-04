import { useFilterStore } from '../../store/filterStore';
import { useTopics } from '../../hooks/useTopics';

export function TopicFilter() {
  const { topic, subTopic, setTopic, setSubTopic } = useFilterStore();
  const { topics, loading } = useTopics();

  const selectedTopic = topics.find((t) => t.topic === topic);
  const subTopics = selectedTopic?.subTopics || [];

  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
        Topic / Sub-topic
      </label>
      <div className="space-y-2">
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={loading}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white disabled:opacity-50"
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
            value={subTopic}
            onChange={(e) => setSubTopic(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
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
