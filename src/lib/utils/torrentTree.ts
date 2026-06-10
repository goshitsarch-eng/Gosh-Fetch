// Pure tree-building / selection helpers for the torrent file picker.
import type { TorrentFile } from '../types/download';

export interface TreeFolder {
  type: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
  totalSize: number;
}

export interface TreeFile {
  type: 'file';
  name: string;
  index: number;
  length: number;
}

export type TreeNode = TreeFolder | TreeFile;

export function buildTree(files: TorrentFile[]): TreeNode[] {
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

export function getFileIcon(name: string): { icon: string; colorClass: string } {
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

export function getAllFileIndicesInFolder(folder: TreeFolder): number[] {
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

export function getFolderCheckState(
  folder: TreeFolder,
  selected: ReadonlySet<number>
): 'all' | 'some' | 'none' {
  const indices = getAllFileIndicesInFolder(folder);
  const selectedCount = indices.filter((i) => selected.has(i)).length;
  if (selectedCount === 0) return 'none';
  if (selectedCount === indices.length) return 'all';
  return 'some';
}

export function folderHasMatch(folder: TreeFolder, filterLower: string): boolean {
  if (!filterLower) return true;
  return folder.children.some((child) => {
    if (child.type === 'file') return child.name.toLowerCase().includes(filterLower);
    return folderHasMatch(child, filterLower);
  });
}
