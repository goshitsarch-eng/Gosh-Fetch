import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { TorrentInfo, TorrentFile } from '../../lib/types/download';
import { formatBytes } from '../../lib/utils/format';
import './TorrentFilePicker.css';

interface Props {
  torrentInfo: TorrentInfo;
  savePath: string;
  onConfirm: (selectedIndices: number[]) => void;
  onCancel: () => void;
}

interface TreeFolder {
  type: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
  totalSize: number;
}

interface TreeFile {
  type: 'file';
  name: string;
  index: number;
  length: number;
}

type TreeNode = TreeFolder | TreeFile;

function buildTree(files: TorrentFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // Leaf file
        current.push({ type: 'file', name: part, index: file.index, length: file.length });
      } else {
        // Folder
        const folderPath = parts.slice(0, i + 1).join('/');
        let folder = current.find(
          (n): n is TreeFolder => n.type === 'folder' && n.name === part
        );
        if (!folder) {
          folder = { type: 'folder', name: part, path: folderPath, children: [], totalSize: 0 };
          current.push(folder);
        }
        folder.totalSize += file.length;
        current = folder.children;
      }
    }
  }

  return root;
}

function getFileIcon(name: string): { icon: string; colorClass: string } {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'mkv': case 'mp4': case 'avi': case 'mov': case 'wmv': case 'flv': case 'webm':
      return { icon: 'movie', colorClass: 'icon-purple' };
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'bmp': case 'svg': case 'webp': case 'ico':
      return { icon: 'image', colorClass: 'icon-orange' };
    case 'txt': case 'md': case 'nfo': case 'pdf': case 'doc': case 'docx': case 'rtf': case 'log':
      return { icon: 'description', colorClass: 'icon-blue' };
    case 'iso': case 'img': case 'bin': case 'cue':
      return { icon: 'album', colorClass: 'icon-gray' };
    case 'zip': case 'rar': case 'tar': case 'gz': case '7z': case 'xz': case 'bz2':
      return { icon: 'folder_zip', colorClass: 'icon-yellow' };
    case 'mp3': case 'flac': case 'wav': case 'ogg': case 'aac': case 'm4a':
      return { icon: 'music_note', colorClass: 'icon-green' };
    case 'exe': case 'msi': case 'sh': case 'bat': case 'deb': case 'rpm': case 'appimage':
      return { icon: 'terminal', colorClass: 'icon-blue' };
    case 'gpg': case 'sig': case 'asc': case 'key':
      return { icon: 'key', colorClass: 'icon-blue' };
    default:
      return { icon: 'insert_drive_file', colorClass: 'icon-slate' };
  }
}

function getAllFileIndicesInFolder(folder: TreeFolder): number[] {
  const indices: number[] = [];
  for (const child of folder.children) {
    if (child.type === 'file') {
      indices.push(child.index);
    } else {
      indices.push(...getAllFileIndicesInFolder(child));
    }
  }
  return indices;
}

export default function TorrentFilePicker({ torrentInfo, savePath, onConfirm, onCancel }: Props) {
  const allIndices = useMemo(() => torrentInfo.files.map(f => f.index), [torrentInfo]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(allIndices));
  const [priorities, setPriorities] = useState<Map<number, string>>(() => new Map());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const [diskSpace, setDiskSpace] = useState<{ total: number; free: number } | null>(null);
  const [showBulkDropdown, setShowBulkDropdown] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const bulkRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildTree(torrentInfo.files), [torrentInfo]);

  // Load disk space
  useEffect(() => {
    if (savePath && window.electronAPI?.getDiskSpace) {
      window.electronAPI.getDiskSpace(savePath).then(setDiskSpace).catch(() => {});
    }
  }, [savePath]);

  // Focus trap
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    function trapFocus(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    modal.addEventListener('keydown', trapFocus);
    return () => modal.removeEventListener('keydown', trapFocus);
  }, []);

  // Close bulk dropdown on outside click
  useEffect(() => {
    if (!showBulkDropdown) return;
    function handleClick(e: MouseEvent) {
      if (bulkRef.current && !bulkRef.current.contains(e.target as Node)) {
        setShowBulkDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showBulkDropdown]);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') onCancel();
  }

  const selectedSize = useMemo(() => {
    return torrentInfo.files
      .filter(f => selected.has(f.index))
      .reduce((sum, f) => sum + f.length, 0);
  }, [selected, torrentInfo]);

  const getPriority = useCallback((index: number) => {
    return priorities.get(index) || 'Normal';
  }, [priorities]);

  function toggleFile(index: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
        setPriorities(p => { const np = new Map(p); np.set(index, 'Skip'); return np; });
      } else {
        next.add(index);
        setPriorities(p => {
          const np = new Map(p);
          if (np.get(index) === 'Skip') np.delete(index);
          return np;
        });
      }
      return next;
    });
  }

  function toggleFolder(folder: TreeFolder) {
    const indices = getAllFileIndicesInFolder(folder);
    const allSelected = indices.every(i => selected.has(i));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        indices.forEach(i => next.delete(i));
        setPriorities(p => {
          const np = new Map(p);
          indices.forEach(i => np.set(i, 'Skip'));
          return np;
        });
      } else {
        indices.forEach(i => next.add(i));
        setPriorities(p => {
          const np = new Map(p);
          indices.forEach(i => { if (np.get(i) === 'Skip') np.delete(i); });
          return np;
        });
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(allIndices));
    setPriorities(p => {
      const np = new Map(p);
      allIndices.forEach(i => { if (np.get(i) === 'Skip') np.delete(i); });
      return np;
    });
  }

  function selectNone() {
    setSelected(new Set());
    setPriorities(p => {
      const np = new Map(p);
      allIndices.forEach(i => np.set(i, 'Skip'));
      return np;
    });
  }

  function setFilePriority(index: number, priority: string) {
    if (priority === 'Skip') {
      setSelected(prev => { const next = new Set(prev); next.delete(index); return next; });
    } else if (!selected.has(index)) {
      setSelected(prev => new Set(prev).add(index));
    }
    setPriorities(prev => { const np = new Map(prev); np.set(index, priority); return np; });
  }

  function setBulkPriority(priority: string) {
    setShowBulkDropdown(false);
    const selectedArr = Array.from(selected);
    if (priority === 'Skip') {
      setSelected(new Set());
      setPriorities(p => {
        const np = new Map(p);
        selectedArr.forEach(i => np.set(i, 'Skip'));
        return np;
      });
    } else {
      setPriorities(p => {
        const np = new Map(p);
        selectedArr.forEach(i => np.set(i, priority));
        return np;
      });
    }
  }

  function toggleExpand(folderPath: string) {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  }

  function handleConfirm() {
    onConfirm(Array.from(selected));
  }

  // Check "select all" checkbox state
  const allChecked = allIndices.length > 0 && allIndices.every(i => selected.has(i));
  const someChecked = !allChecked && allIndices.some(i => selected.has(i));

  // Filter matching logic
  const filterLower = searchFilter.toLowerCase();

  function matchesFilter(name: string): boolean {
    if (!filterLower) return true;
    return name.toLowerCase().includes(filterLower);
  }

  function folderHasMatch(folder: TreeFolder): boolean {
    if (!filterLower) return true;
    return folder.children.some(child => {
      if (child.type === 'file') return matchesFilter(child.name);
      return folderHasMatch(child);
    });
  }

  function getFolderCheckState(folder: TreeFolder): 'all' | 'some' | 'none' {
    const indices = getAllFileIndicesInFolder(folder);
    const selectedCount = indices.filter(i => selected.has(i)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === indices.length) return 'all';
    return 'some';
  }

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    if (node.type === 'file') {
      if (!matchesFilter(node.name)) return null;

      const isSelected = selected.has(node.index);
      const priority = getPriority(node.index);
      const isSkipped = !isSelected || priority === 'Skip';
      const { icon, colorClass } = getFileIcon(node.name);

      return (
        <div
          key={`file-${node.index}`}
          className={`file-row${isSkipped ? ' skipped' : ''}${depth > 0 ? ' nested-bg' : ''}`}
        >
          <div className={`file-row-name${depth > 0 ? ` indent-${Math.min(depth, 3)}` : ''}`} style={depth > 3 ? { paddingLeft: 36 + (depth - 1) * 20 } : undefined}>
            <div className="file-row-expand-spacer" />
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleFile(node.index)}
            />
            <span className={`file-row-icon ${colorClass}`}>
              <span className="material-symbols-outlined">{icon}</span>
            </span>
            <span className="file-row-label" title={node.name}>{node.name}</span>
          </div>
          <div className="file-row-size">{formatBytes(node.length)}</div>
          <div className="file-row-priority">
            <div className="priority-select-wrapper">
              <select
                className={`priority-select${priority === 'High' ? ' priority-high' : ''}${priority === 'Skip' ? ' priority-skip' : ''}`}
                value={priority}
                onChange={(e) => setFilePriority(node.index, e.target.value)}
              >
                <option value="High">High</option>
                <option value="Normal">Normal</option>
                <option value="Low">Low</option>
                <option value="Skip">Skip</option>
              </select>
              <div className="select-chevron">
                <span className="material-symbols-outlined">expand_more</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Folder
    if (!folderHasMatch(node)) return null;

    const isExpanded = expandedFolders.has(node.path);
    const checkState = getFolderCheckState(node);

    return (
      <React.Fragment key={`folder-${node.path}`}>
        <div className={`file-row folder-row${depth > 0 ? ' nested-bg' : ''}`}>
          <div className={`file-row-name${depth > 0 ? ` indent-${Math.min(depth, 3)}` : ''}`} style={depth > 3 ? { paddingLeft: 36 + (depth - 1) * 20 } : undefined}>
            <button className="file-row-expand" onClick={() => toggleExpand(node.path)}>
              <span className="material-symbols-outlined">
                {isExpanded ? 'expand_more' : 'chevron_right'}
              </span>
            </button>
            <input
              type="checkbox"
              checked={checkState === 'all'}
              ref={(el) => { if (el) el.indeterminate = checkState === 'some'; }}
              onChange={() => toggleFolder(node)}
            />
            <span className="file-row-icon icon-yellow">
              <span className="material-symbols-outlined">
                {isExpanded ? 'folder_open' : 'folder'}
              </span>
            </span>
            <span className="file-row-label" title={node.name}>{node.name}</span>
          </div>
          <div className="file-row-size">{formatBytes(node.totalSize)}</div>
          <div className="file-row-priority">
            <div className="priority-select-wrapper">
              <select
                className="priority-select"
                value="Normal"
                onChange={(e) => {
                  const indices = getAllFileIndicesInFolder(node);
                  indices.forEach(i => setFilePriority(i, e.target.value));
                }}
              >
                <option value="High">High</option>
                <option value="Normal">Normal</option>
                <option value="Low">Low</option>
                <option value="Skip">Skip</option>
              </select>
              <div className="select-chevron">
                <span className="material-symbols-outlined">expand_more</span>
              </div>
            </div>
          </div>
        </div>
        {isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onCancel} onKeyDown={handleKeyDown} role="dialog" aria-modal="true" aria-labelledby="file-picker-title">
      <div className="modal file-picker-modal" onClick={(e) => e.stopPropagation()} ref={modalRef}>
        {/* Header */}
        <div className="file-picker-header">
          <div className="file-picker-header-left">
            <div className="file-picker-icon">
              <span className="material-symbols-outlined">folder_zip</span>
            </div>
            <div className="file-picker-title-group">
              <div className="file-picker-title" id="file-picker-title" title={torrentInfo.name}>
                {torrentInfo.name}
              </div>
              <div className="file-picker-subtitle">
                <span className="material-symbols-outlined">database</span>
                <span>{formatBytes(torrentInfo.totalSize)} Total</span>
                <span>•</span>
                <span className="file-picker-selected-size">{formatBytes(selectedSize)} Selected</span>
              </div>
            </div>
          </div>
          <div className="file-picker-header-actions">
            <button onClick={onCancel} aria-label="Close">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="file-picker-toolbar">
          <div className="file-picker-search">
            <span className="material-symbols-outlined">search</span>
            <input
              type="text"
              placeholder="Filter files by name..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
          <div className="file-picker-toolbar-actions">
            <div className="file-picker-select-btns">
              <button onClick={selectAll}>Select All</button>
              <div className="separator" />
              <button onClick={selectNone}>Select None</button>
            </div>
            <div className="file-picker-bulk-priority" ref={bulkRef}>
              <button
                className="file-picker-bulk-priority-btn"
                onClick={() => setShowBulkDropdown(!showBulkDropdown)}
              >
                <span className="material-symbols-outlined">tune</span>
                Set Priority
                <span className="material-symbols-outlined">arrow_drop_down</span>
              </button>
              {showBulkDropdown && (
                <div className="file-picker-bulk-dropdown">
                  <button onClick={() => setBulkPriority('High')}>High</button>
                  <button onClick={() => setBulkPriority('Normal')}>Normal</button>
                  <button onClick={() => setBulkPriority('Low')}>Low</button>
                  <button className="priority-skip" onClick={() => setBulkPriority('Skip')}>Do Not Download</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Table Header */}
        <div className="file-picker-table-header">
          <div className="col-name">
            <input
              type="checkbox"
              checked={allChecked}
              ref={(el) => { if (el) el.indeterminate = someChecked; }}
              onChange={() => allChecked ? selectNone() : selectAll()}
            />
            <span>Name</span>
          </div>
          <div className="col-size">Size</div>
          <div className="col-priority">Priority</div>
        </div>

        {/* File Tree */}
        <div className="file-picker-tree">
          {tree.map(node => renderNode(node, 0))}
        </div>

        {/* Footer */}
        <div className="file-picker-footer">
          <div className="file-picker-footer-info">
            {diskSpace && (
              <>
                <span>Free space: {formatBytes(diskSpace.free)}</span>
                <span className="separator">•</span>
              </>
            )}
            {savePath && <span>Location: {savePath}</span>}
          </div>
          <div className="file-picker-footer-actions">
            <button className="cancel-btn" onClick={onCancel} type="button">
              Cancel
            </button>
            <button
              className="download-btn"
              onClick={handleConfirm}
              disabled={selected.size === 0}
              type="button"
            >
              <span className="material-symbols-outlined">download</span>
              Download Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
