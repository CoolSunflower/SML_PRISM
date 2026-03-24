import { useState } from 'react';

/**
 * Editor for RSS feeds (key-value pairs: feed name => URL)
 */
export function RSSFeedsEditor({ feeds, onChange }) {
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const feedEntries = Object.entries(feeds);

  const handleAdd = () => {
    if (newName.trim() && newUrl.trim()) {
      onChange({
        ...feeds,
        [newName.trim()]: newUrl.trim(),
      });
      setNewName('');
      setNewUrl('');
    }
  };

  const handleRemove = (key) => {
    const updated = { ...feeds };
    delete updated[key];
    onChange(updated);
  };

  const handleStartEdit = (key, url) => {
    setEditingKey(key);
    setEditName(key);
    setEditUrl(url);
  };

  const handleSaveEdit = () => {
    if (editName.trim() && editUrl.trim()) {
      const updated = { ...feeds };

      // Remove old key if name changed
      if (editingKey !== editName.trim()) {
        delete updated[editingKey];
      }

      updated[editName.trim()] = editUrl.trim();
      onChange(updated);
      setEditingKey(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditName('');
    setEditUrl('');
  };

  return (
    <div className="space-y-4">
      {/* Add new feed */}
      <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg">
        <h4 className="font-semibold text-sm text-gray-900 dark:text-white">Add New Feed</h4>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Feed name..."
            className="flex-1 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="Feed URL..."
            className="flex-[2] px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || !newUrl.trim()}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Feeds list */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {feedEntries.length === 0 ? (
          <p className="text-center text-slate-500 dark:text-slate-400 py-8">No feeds configured</p>
        ) : (
          feedEntries.map(([name, url]) => (
            <div
              key={name}
              className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
            >
              {editingKey === name ? (
                // Edit mode
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <input
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate text-gray-900 dark:text-white">{name}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 truncate">{url}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStartEdit(name, url)}
                      className="text-blue-500 hover:text-blue-700"
                      title="Edit"
                    >
                      <span className="material-symbols-outlined text-xl">edit</span>
                    </button>
                    <button
                      onClick={() => handleRemove(name)}
                      className="text-red-500 hover:text-red-700"
                      title="Delete"
                    >
                      <span className="material-symbols-outlined text-xl">delete</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="text-sm text-slate-500 dark:text-slate-400">
        Total: {feedEntries.length} feeds
      </div>
    </div>
  );
}
