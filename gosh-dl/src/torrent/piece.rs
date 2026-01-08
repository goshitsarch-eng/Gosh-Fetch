//! Piece Manager
//!
//! This module manages piece downloading, verification, and writing to disk.
//! It handles piece selection strategies (rarest first), block management,
//! and SHA-1 hash verification.

use std::collections::HashMap;
use std::io::SeekFrom;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use bitvec::prelude::*;
use parking_lot::RwLock;
use sha1::{Digest, Sha1};
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncSeekExt, AsyncWriteExt, AsyncReadExt};

use super::metainfo::{Metainfo, Sha1Hash};
use super::peer::BLOCK_SIZE;
use crate::error::{EngineError, ProtocolErrorKind, Result};

/// Piece manager for coordinating downloads
pub struct PieceManager {
    metainfo: Arc<Metainfo>,
    save_dir: PathBuf,

    /// Bitfield of pieces we have
    have: RwLock<BitVec<u8, Msb0>>,

    /// Pieces currently being downloaded
    pending: RwLock<HashMap<u32, PendingPiece>>,

    /// Pieces that have been verified
    verified_count: AtomicU64,

    /// Total bytes verified
    verified_bytes: AtomicU64,

    /// Piece rarity (how many peers have each piece)
    piece_availability: RwLock<Vec<u32>>,
}

/// A piece being downloaded
#[derive(Debug)]
pub struct PendingPiece {
    /// Piece index
    pub index: u32,
    /// Expected piece length
    pub length: u64,
    /// Blocks in this piece (None = not yet received)
    pub blocks: Vec<Option<Vec<u8>>>,
    /// Block size used
    pub block_size: u32,
    /// Number of blocks received
    pub blocks_received: usize,
    /// When we started downloading this piece
    pub started_at: Instant,
    /// Which blocks have been requested (block index -> peer that requested)
    pub requested_blocks: HashMap<u32, usize>,
}

impl PendingPiece {
    /// Create a new pending piece
    pub fn new(index: u32, piece_length: u64) -> Self {
        let block_size = BLOCK_SIZE as u64;
        let num_blocks = piece_length.div_ceil(block_size) as usize;

        Self {
            index,
            length: piece_length,
            blocks: vec![None; num_blocks],
            block_size: BLOCK_SIZE,
            blocks_received: 0,
            started_at: Instant::now(),
            requested_blocks: HashMap::new(),
        }
    }

    /// Add a received block
    pub fn add_block(&mut self, offset: u32, data: Vec<u8>) -> bool {
        let block_index = (offset / self.block_size) as usize;

        if block_index >= self.blocks.len() {
            return false;
        }

        // Validate offset is aligned to block size
        if !offset.is_multiple_of(self.block_size) {
            tracing::warn!(
                "Block offset {} is not aligned to block size {}",
                offset,
                self.block_size
            );
            return false;
        }

        // Validate block size is correct
        let expected_size = if block_index == self.blocks.len() - 1 {
            // Last block may be smaller
            let remaining = self.length - offset as u64;
            remaining.min(self.block_size as u64) as usize
        } else {
            self.block_size as usize
        };

        if data.len() != expected_size {
            tracing::warn!(
                "Block {} has wrong size: expected {}, got {}",
                block_index,
                expected_size,
                data.len()
            );
            return false;
        }

        // Don't count duplicates
        if self.blocks[block_index].is_none() {
            self.blocks_received += 1;
        }

        self.blocks[block_index] = Some(data);
        self.requested_blocks.remove(&(block_index as u32));

        true
    }

    /// Check if all blocks have been received
    pub fn is_complete(&self) -> bool {
        self.blocks_received == self.blocks.len()
    }

    /// Get the combined piece data
    pub fn data(&self) -> Option<Vec<u8>> {
        if !self.is_complete() {
            return None;
        }

        let mut data = Vec::with_capacity(self.length as usize);
        for block in &self.blocks {
            if let Some(b) = block {
                data.extend_from_slice(b);
            } else {
                return None;
            }
        }

        // Trim to actual piece length (last piece may have smaller final block)
        data.truncate(self.length as usize);

        Some(data)
    }

    /// Get blocks that haven't been requested yet
    pub fn unrequested_blocks(&self) -> Vec<(u32, u32)> {
        let mut blocks = Vec::new();
        let num_blocks = self.blocks.len();

        for i in 0..num_blocks {
            if self.blocks[i].is_none() && !self.requested_blocks.contains_key(&(i as u32)) {
                let offset = i as u32 * self.block_size;
                let length = if i == num_blocks - 1 {
                    // Last block may be smaller
                    let remaining = self.length - offset as u64;
                    remaining.min(self.block_size as u64) as u32
                } else {
                    self.block_size
                };
                blocks.push((offset, length));
            }
        }

        blocks
    }

    /// Mark a block as requested
    pub fn mark_requested(&mut self, block_index: u32, peer_id: usize) {
        self.requested_blocks.insert(block_index, peer_id);
    }
}

/// Block request
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct BlockRequest {
    /// Piece index
    pub piece: u32,
    /// Block offset within piece
    pub offset: u32,
    /// Block length
    pub length: u32,
}

impl PieceManager {
    /// Create a new piece manager
    pub fn new(metainfo: Arc<Metainfo>, save_dir: PathBuf) -> Self {
        let num_pieces = metainfo.info.pieces.len();

        Self {
            metainfo,
            save_dir,
            have: RwLock::new(bitvec![u8, Msb0; 0; num_pieces]),
            pending: RwLock::new(HashMap::new()),
            verified_count: AtomicU64::new(0),
            verified_bytes: AtomicU64::new(0),
            piece_availability: RwLock::new(vec![0; num_pieces]),
        }
    }

    /// Get the number of pieces
    pub fn num_pieces(&self) -> usize {
        self.metainfo.info.pieces.len()
    }

    /// Check if we have a piece
    pub fn have_piece(&self, index: usize) -> bool {
        self.have.read().get(index).map(|b| *b).unwrap_or(false)
    }

    /// Check if we need a piece
    pub fn need_piece(&self, index: u32) -> bool {
        let index = index as usize;
        if index >= self.num_pieces() {
            return false;
        }

        let have = self.have.read();
        let pending = self.pending.read();

        !have[index] && !pending.contains_key(&(index as u32))
    }

    /// Get our bitfield
    pub fn bitfield(&self) -> BitVec<u8, Msb0> {
        self.have.read().clone()
    }

    /// Update piece availability from a peer's bitfield
    pub fn update_availability(&self, peer_pieces: &BitVec<u8, Msb0>, add: bool) {
        let mut availability = self.piece_availability.write();

        for (i, has_piece) in peer_pieces.iter().enumerate() {
            if *has_piece {
                if add {
                    availability[i] = availability[i].saturating_add(1);
                } else {
                    availability[i] = availability[i].saturating_sub(1);
                }
            }
        }
    }

    /// Select the next piece to download using rarest-first strategy
    ///
    /// Returns the piece index if a suitable piece is found
    pub fn select_piece(&self, peer_has: &BitVec<u8, Msb0>) -> Option<u32> {
        let have = self.have.read();
        let pending = self.pending.read();
        let availability = self.piece_availability.read();

        // Find pieces we need that the peer has
        let mut candidates: Vec<(u32, u32)> = Vec::new();

        for i in 0..self.num_pieces() {
            // Skip pieces we have or are downloading
            if have[i] || pending.contains_key(&(i as u32)) {
                continue;
            }

            // Check if peer has this piece
            if !peer_has.get(i).map(|b| *b).unwrap_or(false) {
                continue;
            }

            candidates.push((i as u32, availability[i]));
        }

        if candidates.is_empty() {
            return None;
        }

        // Sort by availability (rarest first)
        candidates.sort_by_key(|&(_, count)| count);

        // Return the rarest piece (could add randomization among equally rare pieces)
        Some(candidates[0].0)
    }

    /// Start downloading a piece
    pub fn start_piece(&self, index: u32) -> Option<PendingPiece> {
        let piece_length = self.metainfo.piece_length(index as usize)?;

        let piece = PendingPiece::new(index, piece_length);

        let mut pending = self.pending.write();
        pending.insert(index, piece);

        pending.get(&index).cloned().map(|p| PendingPiece {
            index: p.index,
            length: p.length,
            blocks: vec![None; p.blocks.len()],
            block_size: p.block_size,
            blocks_received: 0,
            started_at: p.started_at,
            requested_blocks: HashMap::new(),
        })
    }

    /// Add a received block to a pending piece
    pub fn add_block(&self, index: u32, offset: u32, data: Vec<u8>) -> Result<bool> {
        let mut pending = self.pending.write();

        let piece = pending.get_mut(&index).ok_or_else(|| {
            EngineError::protocol(
                ProtocolErrorKind::PeerProtocol,
                format!("Received block for unknown piece {}", index),
            )
        })?;

        if !piece.add_block(offset, data) {
            return Err(EngineError::protocol(
                ProtocolErrorKind::PeerProtocol,
                format!("Invalid block offset {} for piece {}", offset, index),
            ));
        }

        Ok(piece.is_complete())
    }

    /// Verify and save a completed piece
    pub async fn verify_and_save(&self, index: u32) -> Result<bool> {
        // Get piece data
        let data = {
            let pending = self.pending.read();
            let piece = pending.get(&index).ok_or_else(|| {
                EngineError::protocol(
                    ProtocolErrorKind::PeerProtocol,
                    format!("Piece {} not found in pending", index),
                )
            })?;

            piece.data().ok_or_else(|| {
                EngineError::protocol(
                    ProtocolErrorKind::PeerProtocol,
                    format!("Piece {} is incomplete", index),
                )
            })?
        };

        // Verify hash
        let expected_hash = self.metainfo.piece_hash(index as usize).ok_or_else(|| {
            EngineError::protocol(
                ProtocolErrorKind::InvalidTorrent,
                format!("No hash for piece {}", index),
            )
        })?;

        let mut hasher = Sha1::new();
        hasher.update(&data);
        let actual_hash: Sha1Hash = hasher.finalize().into();

        if actual_hash != *expected_hash {
            // Hash mismatch - remove from pending and return false
            self.pending.write().remove(&index);
            return Ok(false);
        }

        // Write to disk
        self.write_piece(index, &data).await?;

        // Update state
        {
            let mut have = self.have.write();
            have.set(index as usize, true);
        }

        self.pending.write().remove(&index);

        self.verified_count.fetch_add(1, Ordering::Relaxed);
        self.verified_bytes
            .fetch_add(data.len() as u64, Ordering::Relaxed);

        Ok(true)
    }

    /// Validate a path component to prevent directory traversal attacks
    fn validate_path_component(component: &std::path::Component) -> Result<()> {
        use std::path::Component;
        match component {
            Component::ParentDir => {
                Err(EngineError::protocol(
                    ProtocolErrorKind::InvalidTorrent,
                    "Invalid torrent: file path contains parent directory reference (..)",
                ))
            }
            Component::RootDir | Component::Prefix(_) => {
                Err(EngineError::protocol(
                    ProtocolErrorKind::InvalidTorrent,
                    "Invalid torrent: file path contains absolute path",
                ))
            }
            _ => Ok(()),
        }
    }

    /// Write piece data to the appropriate files
    async fn write_piece(&self, index: u32, data: &[u8]) -> Result<()> {
        let files_for_piece = self.metainfo.files_for_piece(index as usize);

        let mut data_offset = 0usize;

        for (file_idx, file_offset, length) in files_for_piece {
            let file_info = &self.metainfo.info.files[file_idx];

            // Build full file path with security validation
            let file_path = if self.metainfo.info.is_single_file {
                // Validate single file name
                for component in std::path::Path::new(&self.metainfo.info.name).components() {
                    Self::validate_path_component(&component)?;
                }
                self.save_dir.join(&self.metainfo.info.name)
            } else {
                // Validate torrent name and file path components
                for component in std::path::Path::new(&self.metainfo.info.name).components() {
                    Self::validate_path_component(&component)?;
                }
                for component in std::path::Path::new(&file_info.path).components() {
                    Self::validate_path_component(&component)?;
                }
                self.save_dir
                    .join(&self.metainfo.info.name)
                    .join(&file_info.path)
            };

            // Create parent directories
            if let Some(parent) = file_path.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }

            // Open or create file (don't truncate - we write pieces at specific offsets)
            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(false)
                .open(&file_path)
                .await?;

            // Seek to the correct position
            file.seek(SeekFrom::Start(file_offset)).await?;

            // Write data
            let write_end = data_offset + length as usize;
            file.write_all(&data[data_offset..write_end]).await?;

            data_offset = write_end;
        }

        Ok(())
    }

    /// Cancel a pending piece (e.g., due to timeout)
    pub fn cancel_piece(&self, index: u32) {
        self.pending.write().remove(&index);
    }

    /// Get blocks to request for a piece
    pub fn get_block_requests(&self, index: u32) -> Vec<BlockRequest> {
        let pending = self.pending.read();

        let Some(piece) = pending.get(&index) else {
            return Vec::new();
        };

        piece
            .unrequested_blocks()
            .into_iter()
            .map(|(offset, length)| BlockRequest {
                piece: index,
                offset,
                length,
            })
            .collect()
    }

    /// Mark a block as requested
    pub fn mark_block_requested(&self, piece: u32, block_index: u32, peer_id: usize) {
        let mut pending = self.pending.write();
        if let Some(p) = pending.get_mut(&piece) {
            p.mark_requested(block_index, peer_id);
        }
    }

    /// Get progress information
    pub fn progress(&self) -> PieceProgress {
        let have = self.have.read();
        let have_count = have.count_ones();

        PieceProgress {
            total_pieces: self.num_pieces(),
            have_pieces: have_count,
            pending_pieces: self.pending.read().len(),
            verified_bytes: self.verified_bytes.load(Ordering::Relaxed),
            total_size: self.metainfo.info.total_size,
        }
    }

    /// Check if download is complete
    pub fn is_complete(&self) -> bool {
        let have = self.have.read();
        have.count_ones() == self.num_pieces()
    }

    /// Verify existing files and update bitfield
    ///
    /// Returns number of valid pieces found
    pub async fn verify_existing(&self) -> Result<usize> {
        let mut valid_count = 0;

        for index in 0..self.num_pieces() {
            if self.verify_piece_on_disk(index as u32).await? {
                let mut have = self.have.write();
                have.set(index, true);
                valid_count += 1;

                let piece_len = self.metainfo.piece_length(index).unwrap_or(0);
                self.verified_bytes.fetch_add(piece_len, Ordering::Relaxed);
            }
        }

        self.verified_count.store(valid_count as u64, Ordering::Relaxed);

        Ok(valid_count)
    }

    /// Verify a single piece from disk
    async fn verify_piece_on_disk(&self, index: u32) -> Result<bool> {
        let expected_hash = match self.metainfo.piece_hash(index as usize) {
            Some(h) => h,
            None => return Ok(false),
        };

        let piece_length = match self.metainfo.piece_length(index as usize) {
            Some(l) => l,
            None => return Ok(false),
        };

        let files_for_piece = self.metainfo.files_for_piece(index as usize);
        let mut piece_data = Vec::with_capacity(piece_length as usize);

        for (file_idx, file_offset, length) in files_for_piece {
            let file_info = &self.metainfo.info.files[file_idx];

            // Build and validate file path (security check)
            let file_path = if self.metainfo.info.is_single_file {
                for component in std::path::Path::new(&self.metainfo.info.name).components() {
                    Self::validate_path_component(&component)?;
                }
                self.save_dir.join(&self.metainfo.info.name)
            } else {
                for component in std::path::Path::new(&self.metainfo.info.name).components() {
                    Self::validate_path_component(&component)?;
                }
                for component in std::path::Path::new(&file_info.path).components() {
                    Self::validate_path_component(&component)?;
                }
                self.save_dir
                    .join(&self.metainfo.info.name)
                    .join(&file_info.path)
            };

            // Try to read from file
            let mut file = match File::open(&file_path).await {
                Ok(f) => f,
                Err(_) => return Ok(false),
            };

            file.seek(SeekFrom::Start(file_offset)).await?;

            let mut buf = vec![0u8; length as usize];
            match file.read_exact(&mut buf).await {
                Ok(_) => piece_data.extend_from_slice(&buf),
                Err(_) => return Ok(false),
            }
        }

        // Verify hash
        let mut hasher = Sha1::new();
        hasher.update(&piece_data);
        let actual_hash: Sha1Hash = hasher.finalize().into();

        Ok(actual_hash == *expected_hash)
    }

    /// Get pieces for endgame mode (when only a few pieces remain)
    pub fn endgame_pieces(&self) -> Vec<u32> {
        let have = self.have.read();
        let _pending = self.pending.read();

        let remaining: Vec<u32> = (0..self.num_pieces() as u32)
            .filter(|&i| !have[i as usize])
            .collect();

        // Enter endgame when 10 or fewer pieces remain
        if remaining.len() <= 10 {
            remaining
        } else {
            Vec::new()
        }
    }

    /// Get pending blocks that can be requested from multiple peers in endgame mode
    pub fn endgame_requests(&self) -> Vec<BlockRequest> {
        let pending = self.pending.read();
        let mut requests = Vec::new();

        for piece in pending.values() {
            for (i, block) in piece.blocks.iter().enumerate() {
                if block.is_none() {
                    let offset = i as u32 * piece.block_size;
                    let length = if i == piece.blocks.len() - 1 {
                        let remaining = piece.length - offset as u64;
                        remaining.min(piece.block_size as u64) as u32
                    } else {
                        piece.block_size
                    };

                    requests.push(BlockRequest {
                        piece: piece.index,
                        offset,
                        length,
                    });
                }
            }
        }

        requests
    }
}

// Manual Clone implementation for PendingPiece
impl Clone for PendingPiece {
    fn clone(&self) -> Self {
        Self {
            index: self.index,
            length: self.length,
            blocks: self.blocks.clone(),
            block_size: self.block_size,
            blocks_received: self.blocks_received,
            started_at: self.started_at,
            requested_blocks: self.requested_blocks.clone(),
        }
    }
}

/// Progress information
#[derive(Debug, Clone)]
pub struct PieceProgress {
    /// Total number of pieces
    pub total_pieces: usize,
    /// Number of pieces we have
    pub have_pieces: usize,
    /// Number of pieces being downloaded
    pub pending_pieces: usize,
    /// Total verified bytes
    pub verified_bytes: u64,
    /// Total size of all files
    pub total_size: u64,
}

impl PieceProgress {
    /// Calculate percentage complete
    pub fn percentage(&self) -> f64 {
        if self.total_pieces == 0 {
            return 0.0;
        }
        (self.have_pieces as f64 / self.total_pieces as f64) * 100.0
    }

    /// Calculate bytes remaining
    pub fn bytes_remaining(&self) -> u64 {
        self.total_size.saturating_sub(self.verified_bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pending_piece() {
        let mut piece = PendingPiece::new(0, 32768); // 2 blocks of 16KB

        assert_eq!(piece.blocks.len(), 2);
        assert!(!piece.is_complete());

        // Add first block
        assert!(piece.add_block(0, vec![0; 16384]));
        assert!(!piece.is_complete());

        // Add second block
        assert!(piece.add_block(16384, vec![0; 16384]));
        assert!(piece.is_complete());

        // Get data
        let data = piece.data().unwrap();
        assert_eq!(data.len(), 32768);
    }

    #[test]
    fn test_unrequested_blocks() {
        let piece = PendingPiece::new(0, 32768);

        let blocks = piece.unrequested_blocks();
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0], (0, 16384));
        assert_eq!(blocks[1], (16384, 16384));
    }

    #[test]
    fn test_block_request() {
        let req = BlockRequest {
            piece: 5,
            offset: 16384,
            length: 16384,
        };

        assert_eq!(req.piece, 5);
        assert_eq!(req.offset, 16384);
        assert_eq!(req.length, 16384);
    }

    #[test]
    fn test_piece_progress() {
        let progress = PieceProgress {
            total_pieces: 100,
            have_pieces: 50,
            pending_pieces: 5,
            verified_bytes: 50 * 32768,
            total_size: 100 * 32768,
        };

        assert_eq!(progress.percentage(), 50.0);
        assert_eq!(progress.bytes_remaining(), 50 * 32768);
    }

    #[test]
    fn test_last_block_size() {
        // Piece with non-standard size (e.g., last piece)
        let piece = PendingPiece::new(0, 20000);

        let blocks = piece.unrequested_blocks();
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0], (0, 16384));
        assert_eq!(blocks[1], (16384, 3616)); // 20000 - 16384 = 3616
    }
}
