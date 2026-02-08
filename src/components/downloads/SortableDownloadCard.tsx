import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DownloadCard from './DownloadCard';
import type { Download } from '../../lib/types/download';
import './SortableDownloadCard.css';

interface Props {
  download: Download;
  selected?: boolean;
  onSelect?: (gid: string, selected: boolean) => void;
}

export default function SortableDownloadCard({ download, selected, onSelect }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: download.gid });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sortable-card-wrapper${isDragging ? ' is-dragging' : ''}`}
    >
      <div className="drag-handle" {...attributes} {...listeners}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>drag_indicator</span>
      </div>
      <DownloadCard download={download} selected={selected} onSelect={onSelect} />
    </div>
  );
}
