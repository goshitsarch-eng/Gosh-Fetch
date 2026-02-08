import React, { useEffect, useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Pause, Play, Plus, Trash2, ArrowDown, ArrowUp, Inbox, GripVertical, Loader, AlertCircle } from 'lucide-react';
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
import AddDownloadModal from '../components/downloads/AddDownloadModal';
import {
  selectDownloads,
  selectActiveDownloads,
  selectPausedDownloads,
  selectErrorDownloads,
  selectCompletedDownloads,
  fetchDownloads,
  loadCompletedHistory,
  restoreIncomplete,
  pauseAll,
  resumeAll,
  pauseDownload,
  resumeDownload,
  removeDownload,
  syncPriorities,
  selectIsLoading,
  selectError,
} from '../store/downloadSlice';
import { selectGidOrder, setOrder, setDragging } from '../store/orderSlice';
import { selectStats } from '../store/statsSlice';
import { formatSpeed } from '../lib/utils/format';
import type { AppDispatch } from '../store/store';
import './Downloads.css';

export default function Downloads() {
  const dispatch = useDispatch<AppDispatch>();
  const allDownloads = useSelector(selectDownloads);
  const activeDownloads = useSelector(selectActiveDownloads);
  const pausedDownloads = useSelector(selectPausedDownloads);
  const errorDownloads = useSelector(selectErrorDownloads);
  const completedDownloads = useSelector(selectCompletedDownloads);
  const stats = useSelector(selectStats);
  const isLoading = useSelector(selectIsLoading);
  const error = useSelector(selectError);
  const gidOrder = useSelector(selectGidOrder);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'error' | 'completed'>('all');
  const [selectedGids, setSelectedGids] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    dispatch(loadCompletedHistory());
    dispatch(restoreIncomplete());
    dispatch(fetchDownloads());
    const interval = setInterval(() => dispatch(fetchDownloads()), 1000);

    const onOpenModal = () => setShowAddModal(true);
    window.addEventListener('gosh-fetch:open-add-modal', onOpenModal);

    return () => {
      clearInterval(interval);
      window.removeEventListener('gosh-fetch:open-add-modal', onOpenModal);
    };
  }, [dispatch]);

  const filteredDownloads = filter === 'completed'
    ? completedDownloads
    : allDownloads.filter(d => d.status !== 'complete').filter(d => {
        switch (filter) {
          case 'active': return d.status === 'active' || d.status === 'waiting';
          case 'paused': return d.status === 'paused';
          case 'error': return d.status === 'error';
          default: return true;
        }
      });

  // Sort filtered downloads by gidOrder index
  const sortedFilteredDownloads = useMemo(() => {
    const orderMap = new Map(gidOrder.map((gid, i) => [gid, i]));
    return [...filteredDownloads].sort((a, b) => {
      const ai = orderMap.get(a.gid) ?? Infinity;
      const bi = orderMap.get(b.gid) ?? Infinity;
      return ai - bi;
    });
  }, [filteredDownloads, gidOrder]);

  const activeDownload = activeId ? allDownloads.find(d => d.gid === activeId) : null;

  const hasSelection = selectedGids.size > 0;
  const allSelected = sortedFilteredDownloads.length > 0 && sortedFilteredDownloads.every(d => selectedGids.has(d.gid));

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
      setSelectedGids(new Set(sortedFilteredDownloads.map(d => d.gid)));
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

  return (
    <div className="page">
      <header className="page-header">
        <div className="header-left">
          <h1>Downloads</h1>
          <div className="header-stats">
            <span className="stat"><ArrowDown size={12} className="stat-icon" /> {formatSpeed(stats.downloadSpeed)}</span>
            <span className="stat"><ArrowUp size={12} className="stat-icon" /> {formatSpeed(stats.uploadSpeed)}</span>
            <span className="stat-divider">|</span>
            <span className="stat">{stats.numActive} active</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => dispatch(pauseAll())}><Pause size={14} /> Pause All</button>
          <button className="btn btn-secondary btn-sm" onClick={() => dispatch(resumeAll())}><Play size={14} /> Resume All</button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}><Plus size={14} /> Add Download</button>
        </div>
      </header>

      <div className="filter-bar" role="tablist" aria-label="Download filters">
        <label className="select-all-checkbox">
          <input type="checkbox" checked={allSelected} onChange={handleSelectAll} disabled={sortedFilteredDownloads.length === 0} aria-label="Select all downloads" />
        </label>
        <button className={`filter-btn${filter === 'all' ? ' active' : ''}`} role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>All</button>
        <button className={`filter-btn${filter === 'active' ? ' active' : ''}`} role="tab" aria-selected={filter === 'active'} onClick={() => setFilter('active')}>Active ({activeDownloads.length})</button>
        <button className={`filter-btn${filter === 'paused' ? ' active' : ''}`} role="tab" aria-selected={filter === 'paused'} onClick={() => setFilter('paused')}>Paused ({pausedDownloads.length})</button>
        <button className={`filter-btn${filter === 'error' ? ' active' : ''}`} role="tab" aria-selected={filter === 'error'} onClick={() => setFilter('error')}>Errors ({errorDownloads.length})</button>
        <button className={`filter-btn${filter === 'completed' ? ' active' : ''}`} role="tab" aria-selected={filter === 'completed'} onClick={() => setFilter('completed')}>Completed ({completedDownloads.length})</button>
      </div>

      {hasSelection && (
        <div className="batch-action-bar">
          <span className="batch-count">{selectedGids.size} selected</span>
          <button className="btn btn-secondary btn-sm" onClick={handleBatchPause}><Pause size={14} /> Pause</button>
          <button className="btn btn-secondary btn-sm" onClick={handleBatchResume}><Play size={14} /> Resume</button>
          <button className="btn btn-destructive btn-sm" onClick={handleBatchRemove}><Trash2 size={14} /> Remove</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedGids(new Set())}>Clear</button>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => dispatch(fetchDownloads())}>Retry</button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="downloads-list">
          {isLoading && sortedFilteredDownloads.length === 0 ? (
            <div className="empty-state">
              <Loader size={32} className="spin" />
              <p>Loading downloads...</p>
            </div>
          ) : sortedFilteredDownloads.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Inbox size={48} /></div>
              <h3>No downloads</h3>
              <p>Click &quot;Add Download&quot; or press Ctrl+N to get started</p>
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ marginTop: 'var(--space-md)' }}>
                <Plus size={14} /> Add Download
              </button>
            </div>
          ) : (
            <SortableContext items={sortedFilteredDownloads.map(d => d.gid)} strategy={verticalListSortingStrategy}>
              {sortedFilteredDownloads.map(download => (
                <SortableDownloadCard
                  key={download.gid}
                  download={download}
                  selected={selectedGids.has(download.gid)}
                  onSelect={handleSelect}
                />
              ))}
            </SortableContext>
          )}
        </div>

        <DragOverlay>
          {activeDownload ? (
            <div className="drag-overlay-card">
              <div className="sortable-card-wrapper">
                <div className="drag-handle"><GripVertical size={16} /></div>
                <DownloadCard download={activeDownload} />
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {showAddModal && <AddDownloadModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
