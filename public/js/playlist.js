/**
 * playlist.js - 播放列表管理模块
 */
const Playlist = {
  songs: [],
  currentIndex: -1,
  onUpdate: null,    // callback when playlist changes
  onChange: null,     // callback when current song changes

  init(savedSongs, savedIndex) {
    this.songs = savedSongs || [];
    this.currentIndex = (savedIndex >= 0 && savedIndex < this.songs.length) ? savedIndex : -1;
    this.render();
  },

  async addSong(input) {
    let songData;
    
    // If input is already an object (from app.js), use it directly
    if (typeof input === 'object' && input.bvid) {
      songData = input;
    } else {
      const bvid = this.extractBvid(input);
      if (!bvid) throw new Error('无法识别 BV 号，请输入正确的链接或 BV 号');

      // Fetch info from backend
      const res = await fetch(`/api/song-info?url=${encodeURIComponent(bvid)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '获取视频信息失败');
      }
      songData = await res.json();
    }

    if (!songData || !songData.bvid) throw new Error('获取视频信息失败');
    
    // Check duplicate
    if (this.songs.some(s => s.bvid === songData.bvid)) throw new Error('这首歌已经在列表中了');
    
    this.songs.push(songData);
    this.save();
    this.render();
    if (this.onUpdate) this.onUpdate();
  },

  removeSong(index) {
    if (index < 0 || index >= this.songs.length) return;
    const wasPlaying = index === this.currentIndex;
    this.songs.splice(index, 1);

    if (wasPlaying) {
      if (this.songs.length === 0) { this.currentIndex = -1; }
      else if (this.currentIndex >= this.songs.length) { this.currentIndex = 0; }
      if (this.onChange) this.onChange(this.currentIndex);
    } else if (index < this.currentIndex) {
      this.currentIndex--;
    }
    this.save();
    this.render();
  },

  playSong(index) {
    if (index < 0 || index >= this.songs.length) return;
    this.currentIndex = index;
    this.save();
    this.render();
    if (this.onChange) this.onChange(index);
  },

  getCurrentSong() {
    return this.currentIndex >= 0 ? this.songs[this.currentIndex] : null;
  },

  nextSong(mode) {
    if (this.songs.length === 0) return -1;
    if (mode === 'shuffle') {
      if (this.songs.length === 1) return 0;
      let next;
      do { next = Math.floor(Math.random() * this.songs.length); } while (next === this.currentIndex);
      return next;
    }
    if (mode === 'repeat-one') return this.currentIndex;
    return (this.currentIndex + 1) % this.songs.length;
  },

  prevSong() {
    if (this.songs.length === 0) return -1;
    return (this.currentIndex - 1 + this.songs.length) % this.songs.length;
  },

  extractBvid(input) {
    if (!input) return null;
    input = input.trim();
    const match = input.match(/(BV[a-zA-Z0-9]+)/i);
    return match ? match[1] : null;
  },

  formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  save() {
    Storage.savePlaylist(this.songs);
    Storage.savePlayerState({ ...Storage.loadPlayerState(), currentIndex: this.currentIndex });
  },

  render() {
    const listEl = document.getElementById('playlistList');
    const emptyEl = document.getElementById('emptyState');
    const countEl = document.getElementById('playlistCount');

    if (countEl) countEl.textContent = `${this.songs.length} 首`;

    if (!listEl) return;

    if (this.songs.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      listEl.innerHTML = '';
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    listEl.innerHTML = this.songs.map((song, i) => {
      const isActive = i === this.currentIndex;
      const coverUrl = song.cover ? `/api/cover-proxy?url=${encodeURIComponent(song.cover)}` : 'assets/hero-bg.png';
      return `
        <div class="playlist-item group flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${isActive ? 'bg-primary/5 border border-primary/10' : 'hover:bg-surface-variant/20'}" data-index="${i}">
          <div class="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 relative">
            <img class="w-full h-full object-cover ${!isActive ? 'opacity-80 group-hover:opacity-100' : ''}" src="${coverUrl}" alt="" loading="lazy">
            ${isActive ? `
              <div class="absolute inset-0 bg-primary/40 flex items-center justify-center">
                <span class="material-symbols-outlined text-white text-[18px]">play_arrow</span>
              </div>
            ` : ''}
          </div>
          <div class="flex-grow min-w-0">
            <p class="text-[13px] font-bold ${isActive ? 'text-on-surface' : 'text-on-surface/80 group-hover:text-on-surface'} truncate">${this.escapeHtml(song.title)}</p>
            <p class="text-[10px] ${isActive ? 'text-on-surface-variant/70' : 'text-on-surface-variant/50'} truncate">${this.escapeHtml(song.artist)}</p>
          </div>
          <div class="flex items-center gap-2">
            ${isActive ? `<span class="text-[10px] text-primary font-bold">播放中</span>` : `<span class="text-[10px] text-on-surface-variant/40">${this.formatDuration(song.duration)}</span>`}
            <button class="playlist-item-remove p-1 text-on-surface-variant/20 hover:text-red-500 transition-colors" data-remove="${i}" title="移除">
              <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bind events
    listEl.querySelectorAll('.playlist-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.playlist-item-remove')) return;
        this.playSong(parseInt(item.dataset.index));
      });
    });
    listEl.querySelectorAll('.playlist-item-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeSong(parseInt(btn.dataset.remove));
      });
    });

    // Initialize Sortable
    if (typeof Sortable !== 'undefined') {
      if (this._sortable) this._sortable.destroy();
      this._sortable = new Sortable(listEl, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
          const { oldIndex, newIndex } = evt;
          if (oldIndex === newIndex) return;

          // Reorder array
          const movedSong = this.songs.splice(oldIndex, 1)[0];
          this.songs.splice(newIndex, 0, movedSong);

          // Update currentIndex
          if (this.currentIndex === oldIndex) {
            this.currentIndex = newIndex;
          } else {
            if (oldIndex < this.currentIndex && newIndex >= this.currentIndex) {
              this.currentIndex--;
            } else if (oldIndex > this.currentIndex && newIndex <= this.currentIndex) {
              this.currentIndex++;
            }
          }

          this.save();
          this.render(); // Re-render to update data-index attributes
        }
      });
    }

    if (this.onUpdate) this.onUpdate();
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
