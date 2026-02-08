import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import DownloadCard from '../components/downloads/DownloadCard';
import SortableDownloadCard from '../components/downloads/SortableDownloadCard';
import CompactDownloadRow from '../components/downloads/CompactDownloadRow';
import AddDownloadModal from '../components/downloads/AddDownloadModal';
import NotificationDropdown from '../components/layout/NotificationDropdown';
import {
  selectDownloads,
  selectActiveDownloads,
  selectPausedDownloads,
  selectErrorDownloads,
  selectCompletedDownloads,
  fetchDownloads,
  loadCompletedHistory,
  pauseDownload,
  resumeDownload,
  removeDownload,
  syncPriorities,
  selectIsLoading,
  selectError,
} from '../store/downloadSlice';
import { selectGidOrder, setOrder, setDragging } from '../store/orderSlice';
import { getFileExtension } from '../lib/utils/format';
import type { Download } from '../lib/types/download';
import type { AppDispatch } from '../store/store';
import './Downloads.css';

type FileCategory = 'all' | 'video' | 'audio' | 'documents' | 'software' | 'images';

const CATEGORIES: { label: string; value: FileCategory }[] = [
  { label: 'All Files', value: 'all' },
  { label: 'Video', value: 'video' },
  { label: 'Audio', value: 'audio' },
  { label: 'Documents', value: 'documents' },
  { label: 'Software', value: 'software' },
  { label: 'Images', value: 'images' },
];

function getFileCategory(download: Download): FileCategory {
  const ext = getFileExtension(download.name);
  if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'flac', 'wav', 'aac', 'ogg', 'wma', 'm4a', 'opus'].includes(ext)) return 'audio';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'odt', 'epub'].includes(ext)) return 'documents';
  if (['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'snap', 'flatpak', 'apk', 'iso'].includes(ext)) return 'software';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'psd', 'raw'].includes(ext)) return 'images';
  if (['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'zst'].includes(ext)) return 'software';
  if (download.downloadType === 'torrent' || download.downloadType === 'magnet') return 'software';
  return 'all';
}

export default function Downloads() {
  const dispatch = useDispatch<AppDispatch>();
  const [searchParams] = useSearchParams();
  const filter = (searchParams.get('filter') || 'all') as 'all' | 'active' | 'paused' | 'completed';
  const allDownloads = useSelector(selectDownloads);
  const activeDownloads = useSelector(selectActiveDownloads);
  const pausedDownloads = useSelector(selectPausedDownloads);
  const errorDownloads = useSelector(selectErrorDownloads);
  const completedDownloads = useSelector(selectCompletedDownloads);
  const isLoading = useSelector(selectIsLoading);
  const error = useSelector(selectError);
  const gidOrder = useSelector(selectGidOrder);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<FileCategory>('all');
  const [selectedGids, setSelectedGids] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    dispatch(loadCompletedHistory());
    dispatch(fetchDownloads());
    const interval = setInterval(() => dispatch(fetchDownloads()), 5000);

    const onOpenModal = () => setShowAddModal(true);
    const onFocusSearch = () => searchInputRef.current?.focus();
    window.addEventListener('gosh-fetch:open-add-modal', onOpenModal);
    window.addEventListener('gosh-fetch:focus-search', onFocusSearch);

    return () => {
      clearInterval(interval);
      window.removeEventListener('gosh-fetch:open-add-modal', onOpenModal);
      window.removeEventListener('gosh-fetch:focus-search', onFocusSearch);
    };
  }, [dispatch]);

  // Filter by status (from sidebar)
  const statusFiltered = useMemo(() => {
    switch (filter) {
      case 'active': return activeDownloads;
      case 'paused': return [...pausedDownloads, ...errorDownloads];
      case 'completed': return completedDownloads;
      default: return [...allDownloads.filter(d => d.status !== 'complete'), ...completedDownloads];
    }
  }, [filter, allDownloads, activeDownloads, pausedDownloads, errorDownloads, completedDownloads]);

  // Filter by search query
  const searchFiltered = useMemo(() => {
    if (!searchQuery.trim()) return statusFiltered;
    const q = searchQuery.toLowerCase();
    return statusFiltered.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.url && d.url.toLowerCase().includes(q))
    );
  }, [statusFiltered, searchQuery]);

  // Filter by file category
  const categoryFiltered = useMemo(() => {
    if (category === 'all') return searchFiltered;
    return searchFiltered.filter(d => getFileCategory(d) === category);
  }, [searchFiltered, category]);

  // Split into active and paused/completed sections
  const activeItems = useMemo(() =>
    categoryFiltered.filter(d => d.status === 'active' || d.status === 'waiting'),
    [categoryFiltered]
  );

  const pausedCompletedItems = useMemo(() =>
    categoryFiltered.filter(d => d.status !== 'active' && d.status !== 'waiting'),
    [categoryFiltered]
  );

  // Sort active items by gidOrder
  const sortedActiveItems = useMemo(() => {
    const orderMap = new Map(gidOrder.map((gid, i) => [gid, i]));
    return [...activeItems].sort((a, b) => {
      const ai = orderMap.get(a.gid) ?? Infinity;
      const bi = orderMap.get(b.gid) ?? Infinity;
      return ai - bi;
    });
  }, [activeItems, gidOrder]);

  const activeDownload = activeId ? allDownloads.find(d => d.gid === activeId) : null;

  const allItems = [...sortedActiveItems, ...pausedCompletedItems];
  const hasSelection = selectedGids.size > 0;
  const allSelected = allItems.length > 0 && allItems.every(d => selectedGids.has(d.gid));

  function handleSelect(gid: string, selected: boolean) {
    setSelectedGids(prev => {
      const next = new Set(prev);
      if (selected) next.add(gid);
      else next.delete(gid);
      return next;
    });
  }

  function handleSelectAll() {
    if (allSelected) {
      setSelectedGids(new Set());
    } else {
      setSelectedGids(new Set(allItems.map(d => d.gid)));
    }
  }

  async function handleBatchPause() {
    for (const gid of selectedGids) {
      try { await dispatch(pauseDownload(gid)); } catch { /* ignore */ }
    }
    setSelectedGids(new Set());
  }

  async function handleBatchResume() {
    for (const gid of selectedGids) {
      try { await dispatch(resumeDownload(gid)); } catch { /* ignore */ }
    }
    setSelectedGids(new Set());
  }

  async function handleBatchRemove() {
    for (const gid of selectedGids) {
      try { await dispatch(removeDownload({ gid, deleteFiles: false })); } catch { /* ignore */ }
    }
    setSelectedGids(new Set());
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
    dispatch(setDragging(true));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    dispatch(setDragging(false));

    if (over && active.id !== over.id) {
      const oldIndex = gidOrder.indexOf(active.id as string);
      const newIndex = gidOrder.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(gidOrder, oldIndex, newIndex);
        dispatch(setOrder(newOrder));
        dispatch(syncPriorities(newOrder));
      }
    }
  }

  function handleDragCancel() {
    setActiveId(null);
    dispatch(setDragging(false));
  }

  const totalItems = categoryFiltered.length;
  const showEmptyState = !isLoading && totalItems === 0 && !searchQuery && category === 'all';
  const showNoResults = !isLoading && totalItems === 0 && (searchQuery || category !== 'all');

  return (
    <div className="page">
      <header className="toolbar-header">
        <div className="search-bar">
          <span className="material-symbols-outlined">search</span>
          <input
            ref={searchInputRef}
            className="search-input"
            type="text"
            placeholder="Search by filename or paste URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <kbd className="search-shortcut">Ctrl K</kbd>
        </div>
        <div className="toolbar-actions">
          <NotificationDropdown />
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
            Add Download
          </button>
        </div>
      </header>

      {hasSelection && (
        <div className="batch-action-bar">
          <label className="select-all-checkbox">
            <input type="checkbox" checked={allSelected} onChange={handleSelectAll} aria-label="Select all downloads" />
          </label>
          <span className="batch-count">{selectedGids.size} selected</span>
          <button className="btn btn-secondary btn-sm" onClick={handleBatchPause}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>pause</span> Pause
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleBatchResume}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>play_arrow</span> Resume
          </button>
          <button className="btn btn-destructive btn-sm" onClick={handleBatchRemove}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span> Remove
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedGids(new Set())}>Clear</button>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => dispatch(fetchDownloads())}>Retry</button>
        </div>
      )}

      <div className="content-scroll">
        {/* Category pills */}
        <div className="category-pills">
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              className={`category-pill${category === cat.value ? ' active' : ''}`}
              onClick={() => setCategory(cat.value)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {isLoading && totalItems === 0 && !searchQuery ? (
            <div className="empty-state">
              <span className="material-symbols-outlined spin" style={{ fontSize: 32 }}>progress_activity</span>
              <p>Loading downloads...</p>
            </div>
          ) : showEmptyState ? (
            <div className="empty-state">
              <div className="empty-icon">
                <span className="material-symbols-outlined" style={{ fontSize: 48 }}>inbox</span>
              </div>
              <h3>No downloads</h3>
              <p>Click &quot;Add Download&quot; or press Ctrl+N to get started</p>
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ marginTop: 'var(--space-md)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Add Download
              </button>
            </div>
          ) : showNoResults ? (
            <div className="empty-state">
              <div className="empty-icon">
                <span className="material-symbols-outlined" style={{ fontSize: 48 }}>search_off</span>
              </div>
              <h3>No results</h3>
              <p>Try a different search term or category</p>
            </div>
          ) : (
            <>
              {/* Active Downloads Section */}
              {sortedActiveItems.length > 0 && (
                <div className="download-section">
                  <div className="dl-section-header">
                    <span className="section-dot green" />
                    <span className="section-label">Active Downloads</span>
                  </div>
                  <div className="downloads-list">
                    <SortableContext items={sortedActiveItems.map(d => d.gid)} strategy={verticalListSortingStrategy}>
                      {sortedActiveItems.map(download => (
                        <SortableDownloadCard
                          key={download.gid}
                          download={download}
                          selected={selectedGids.has(download.gid)}
                          onSelect={handleSelect}
                        />
                      ))}
                    </SortableContext>
                    <div className="add-more-zone" onClick={() => setShowAddModal(true)}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                      <span>Ready for more</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Paused & Recent Section */}
              {pausedCompletedItems.length > 0 && (
                <div className="download-section">
                  <div className="dl-section-header">
                    <span className="section-dot yellow" />
                    <span className="section-label">Paused &amp; Recent</span>
                  </div>
                  <div className="compact-list">
                    {pausedCompletedItems.map(download => (
                      <CompactDownloadRow
                        key={download.gid}
                        download={download}
                        selected={selectedGids.has(download.gid)}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* If only active but no paused, still show add zone */}
              {sortedActiveItems.length === 0 && pausedCompletedItems.length > 0 && (
                <div className="add-more-zone" onClick={() => setShowAddModal(true)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                  <span>Ready for more</span>
                </div>
              )}
            </>
          )}

          <DragOverlay>
            {activeDownload ? (
              <div className="drag-overlay-card">
                <div className="sortable-card-wrapper">
                  <div className="drag-handle">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>drag_indicator</span>
                  </div>
                  <DownloadCard download={activeDownload} />
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {showAddModal && <AddDownloadModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
