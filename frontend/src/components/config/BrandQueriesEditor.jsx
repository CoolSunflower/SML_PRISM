import { useState, useMemo } from 'react';

/**
 * Editor for Brand Queries (BrandQueries.csv)
 * Displays as a searchable/filterable table with add/edit/delete functionality
 */
export function BrandQueriesEditor({ queries, onChange }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    topic: '',
    subTopic: '',
    queryName: '',
    internalId: '',
    query: '',
  });

  // Get unique topics for filter dropdown
  const uniqueTopics = useMemo(() => {
    const topics = new Set(queries.map(q => q.topic));
    return [...topics].sort();
  }, [queries]);

  // Filtered queries
  const filteredQueries = useMemo(() => {
    return queries.filter(q => {
      const matchesSearch = !searchTerm ||
        Object.values(q).some(val =>
          String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
      const matchesTopic = !filterTopic || q.topic === filterTopic;
      return matchesSearch && matchesTopic;
    });
  }, [queries, searchTerm, filterTopic]);

  const handleAdd = () => {
    if (addForm.topic && addForm.query) {
      const newQuery = { ...addForm, _tid: 'new_' + Math.random().toString(36).substring(2) };
      onChange([...queries, newQuery]);
      setAddForm({
        topic: '',
        subTopic: '',
        queryName: '',
        internalId: '',
        query: '',
      });
      setShowAddForm(false);
    }
  };

  const handleStartEdit = (index, query) => {
    setEditingIndex(index);
    setEditForm({ ...query });
  };

  const handleSaveEdit = () => {
    const updated = [...queries];
    updated[editingIndex] = editForm;
    onChange(updated);
    setEditingIndex(null);
    setEditForm({});
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditForm({});
  };

  const handleDelete = (index) => {
    if (confirm('Are you sure you want to delete this query?')) {
      onChange(queries.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and filter controls */}
      <div className="flex gap-2">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search queries..."
          className="flex-1 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <select
          value={filterTopic}
          onChange={(e) => setFilterTopic(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Topics</option>
          {uniqueTopics.map(topic => (
            <option key={topic} value={topic}>{topic}</option>
          ))}
        </select>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          {showAddForm ? 'Cancel' : 'Add Query'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg space-y-3">
          <h4 className="font-semibold text-gray-900 dark:text-white">Add New Query</h4>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={addForm.topic}
              onChange={(e) => setAddForm({ ...addForm, topic: e.target.value })}
              placeholder="Topic*"
              className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="text"
              value={addForm.subTopic}
              onChange={(e) => setAddForm({ ...addForm, subTopic: e.target.value })}
              placeholder="Sub-topic"
              className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="text"
              value={addForm.queryName}
              onChange={(e) => setAddForm({ ...addForm, queryName: e.target.value })}
              placeholder="Query Name"
              className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="text"
              value={addForm.internalId}
              onChange={(e) => setAddForm({ ...addForm, internalId: e.target.value })}
              placeholder="Internal ID"
              className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <input
            type="text"
            value={addForm.query}
            onChange={(e) => setAddForm({ ...addForm, query: e.target.value })}
            placeholder="Query*"
            className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleAdd}
            disabled={!addForm.topic || !addForm.query}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add Query
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-600 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-600">
            <tr>
              <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Topic</th>
              <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Sub-topic</th>
              <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Query Name</th>
              <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Internal ID</th>
              <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Query</th>
              <th className="px-4 py-2 text-center text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredQueries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No queries found
                </td>
              </tr>
            ) : (
              filteredQueries.map((query, displayIndex) => {
                const actualIndex = queries.indexOf(query);
                const isEditing = editingIndex === actualIndex;

                return (
                  <tr key={actualIndex} className="border-b border-slate-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-gray-800">
                    {isEditing ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.topic}
                            onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })}
                            className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.subTopic}
                            onChange={(e) => setEditForm({ ...editForm, subTopic: e.target.value })}
                            className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.queryName}
                            onChange={(e) => setEditForm({ ...editForm, queryName: e.target.value })}
                            className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.internalId}
                            onChange={(e) => setEditForm({ ...editForm, internalId: e.target.value })}
                            className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.query}
                            onChange={(e) => setEditForm({ ...editForm, query: e.target.value })}
                            className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={handleSaveEdit}
                              className="text-green-500 hover:text-green-700"
                              title="Save"
                            >
                              <span className="material-symbols-outlined text-xl">check</span>
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="text-gray-500 hover:text-gray-700"
                              title="Cancel"
                            >
                              <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2">{query.topic}</td>
                        <td className="px-4 py-2">{query.subTopic}</td>
                        <td className="px-4 py-2">{query.queryName}</td>
                        <td className="px-4 py-2 font-mono text-xs">{query.internalId}</td>
                        <td className="px-4 py-2 max-w-md truncate" title={query.query}>
                          {query.query}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleStartEdit(actualIndex, query)}
                              className="text-blue-500 hover:text-blue-700"
                              title="Edit"
                            >
                              <span className="material-symbols-outlined text-xl">edit</span>
                            </button>
                            <button
                              onClick={() => handleDelete(actualIndex)}
                              className="text-red-500 hover:text-red-700"
                              title="Delete"
                            >
                              <span className="material-symbols-outlined text-xl">delete</span>
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-slate-500 dark:text-slate-400">
        Showing {filteredQueries.length} of {queries.length} queries
      </div>
    </div>
  );
}
