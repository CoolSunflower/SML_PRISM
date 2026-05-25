import { useState, useEffect } from 'react';
import { BrandQueriesEditor } from './BrandQueriesEditor';
import { RSSFeedsEditor } from './RSSFeedsEditor';
import { ListEditor } from './ListEditor';
import {
  getBrandQueries,
  updateBrandQueries,
  patchBrandQueries,
  getRSSFeeds,
  updateRSSFeeds,
  getBlockedWebsites,
  updateBlockedWebsites,
  getBlockedWords,
  updateBlockedWords,
} from '../../api/config';
import { Toast } from '../ui/Toast';

const TABS = [
  { id: 'brand-queries', label: 'Brand Queries' },
  { id: 'rss-feeds', label: 'RSS Feeds' },
  { id: 'blocked-sites', label: 'Blocked Sites' },
  { id: 'blocked-words', label: 'Blocked Words' },
];

export function ConfigPage({ onClose }) {
  const [activeTab, setActiveTab] = useState('brand-queries');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Data state
  const [brandQueries, setBrandQueries] = useState([]);
  const [originalBrandQueries, setOriginalBrandQueries] = useState([]);
  const [rssFeeds, setRssFeeds] = useState({});
  const [blockedWebsites, setBlockedWebsites] = useState([]);
  const [blockedWords, setBlockedWords] = useState([]);

  // Track if data has been modified
  const [hasChanges, setHasChanges] = useState(false);

  // Block scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [queriesRes, feedsRes, websitesRes, wordsRes] = await Promise.all([
        getBrandQueries(),
        getRSSFeeds(),
        getBlockedWebsites(),
        getBlockedWords(),
      ]);

      const trackQueries = (queriesRes.queries || []).map(q => ({
        ...q,
        _tid: q.internalId + '_' + Math.random().toString(36).substring(2)
      }));

      setBrandQueries(trackQueries);
      setOriginalBrandQueries(JSON.parse(JSON.stringify(trackQueries)));
      setRssFeeds(feedsRes.feeds || {});
      setBlockedWebsites(websitesRes.websites || []);
      setBlockedWords(wordsRes.words || []);
    } catch (error) {
      console.error('[ConfigPage] Failed to load data:', error);
      setToast({ type: 'error', message: 'Failed to load configuration' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);

      // Save based on active tab
      switch (activeTab) {
        case 'brand-queries': {
          const currentMap = new Map(brandQueries.map(q => [q._tid, q]));
          const origMap = new Map((originalBrandQueries || []).map(q => [q._tid, q]));

          const updates = [];
          const deletions = [];
          const additions = [];

          for (const [tid, orig] of origMap.entries()) {
            if (!currentMap.has(tid)) {
              deletions.push(orig.internalId);
            } else {
              const curr = currentMap.get(tid);
              if (JSON.stringify(orig) !== JSON.stringify(curr)) {
                updates.push({ originalInternalId: orig.internalId, updatedData: curr });
              }
            }
          }

          for (const [tid, curr] of currentMap.entries()) {
            if (!origMap.has(tid)) {
              additions.push(curr);
            }
          }

          if (additions.length > 0 || updates.length > 0 || deletions.length > 0) {
            await patchBrandQueries({ additions, updates, deletions });
            setOriginalBrandQueries(JSON.parse(JSON.stringify(brandQueries)));
          }
          break;
        }
        case 'rss-feeds':
          await updateRSSFeeds(rssFeeds);
          break;
        case 'blocked-sites':
          await updateBlockedWebsites(blockedWebsites);
          break;
        case 'blocked-words':
          await updateBlockedWords(blockedWords);
          break;
      }

      setToast({ type: 'success', message: 'Configuration saved successfully' });
      setHasChanges(false);
    } catch (error) {
      console.error('[ConfigPage] Failed to save:', error);
      setToast({ type: 'error', message: 'Failed to save configuration' });
    } finally {
      setSaving(false);
    }
  }

  const handleBrandQueriesChange = (queries) => {
    setBrandQueries(queries);
    setHasChanges(true);
  };

  const handleRssFeedsChange = (feeds) => {
    setRssFeeds(feeds);
    setHasChanges(true);
  };

  const handleBlockedWebsitesChange = (websites) => {
    setBlockedWebsites(websites);
    setHasChanges(true);
  };

  const handleBlockedWordsChange = (words) => {
    setBlockedWords(words);
    setHasChanges(true);
  };

  const handleTabChange = (tabId) => {
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to switch tabs?')) {
        return;
      }
      setHasChanges(false);
    }
    setActiveTab(tabId);
  };

  const handleClose = () => {
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
        return;
      }
    }
    onClose();
  };

  return (
    <>
      {/* Full-screen overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
          {/* Header - shrink-0 ensures it stays visible */}
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Configuration</h2>
            <button
              onClick={handleClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              title="Close"
            >
              <span className="material-symbols-outlined text-3xl">close</span>
            </button>
          </div>

          {/* Tabs - shrink-0 ensures they stay visible */}
          <div className="shrink-0 flex border-b border-slate-200 dark:border-slate-700 px-6">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-slate-500 dark:text-slate-400">Loading configuration...</div>
              </div>
            ) : (
              <>
                {activeTab === 'brand-queries' && (
                  <BrandQueriesEditor
                    queries={brandQueries}
                    onChange={handleBrandQueriesChange}
                  />
                )}

                {activeTab === 'rss-feeds' && (
                  <RSSFeedsEditor
                    feeds={rssFeeds}
                    onChange={handleRssFeedsChange}
                  />
                )}

                {activeTab === 'blocked-sites' && (
                  <ListEditor
                    items={blockedWebsites}
                    onChange={handleBlockedWebsitesChange}
                    placeholder="Add blocked website..."
                  />
                )}

                {activeTab === 'blocked-words' && (
                  <ListEditor
                    items={blockedWords}
                    onChange={handleBlockedWordsChange}
                    placeholder="Add blocked word..."
                  />
                )}
              </>
            )}
          </div>

          {/* Footer - shrink-0 ensures it stays visible */}
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-900">
            <div>
              {hasChanges && (
                <span className="text-sm text-amber-500">
                  You have unsaved changes
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                Close
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
