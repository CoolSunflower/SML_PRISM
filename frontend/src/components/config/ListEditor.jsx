import { useState } from 'react';

/**
 * Reusable list editor for simple string arrays
 * Used for blocked websites and blocked words
 */
export function ListEditor({ items, onChange, placeholder = 'Add item...' }) {
  const [newItem, setNewItem] = useState('');

  const handleAdd = () => {
    if (newItem.trim()) {
      onChange([...items, newItem.trim()]);
      setNewItem('');
    }
  };

  const handleRemove = (index) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-4">
      {/* Add new item */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={handleAdd}
          disabled={!newItem.trim()}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add
        </button>
      </div>

      {/* Items list */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-center text-slate-500 dark:text-slate-400 py-8">No items yet</p>
        ) : (
          items.map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
            >
              <span className="flex-1 text-gray-900 dark:text-white">{item}</span>
              <button
                onClick={() => handleRemove(index)}
                className="text-red-500 hover:text-red-700 ml-2"
                title="Remove"
              >
                <span className="material-symbols-outlined text-xl">delete</span>
              </button>
            </div>
          ))
        )}
      </div>

      <div className="text-sm text-slate-500 dark:text-slate-400">
        Total: {items.length} items
      </div>
    </div>
  );
}
