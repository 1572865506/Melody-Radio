/**
 * storage.js - localStorage 持久化模块
 */
const Storage = {
  KEYS: { PLAYLIST: 'biliradio_playlist', STATE: 'biliradio_state' },

  savePlaylist(songs) {
    try { localStorage.setItem(this.KEYS.PLAYLIST, JSON.stringify(songs)); } catch (e) { console.error('Save playlist failed:', e); }
  },

  loadPlaylist() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.PLAYLIST)) || []; } catch (e) { return []; }
  },

  savePlayerState(state) {
    try { localStorage.setItem(this.KEYS.STATE, JSON.stringify(state)); } catch (e) { console.error('Save state failed:', e); }
  },

  loadPlayerState() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.STATE)) || {}; } catch (e) { return {}; }
  },

  async exportData(songs) {
    try {
      const playlist = songs || this.loadPlaylist();
      if (!playlist || playlist.length === 0) {
        alert('播放列表为空，无法导出');
        return;
      }

      const data = { 
        type: 'BiliRadio_Playlist',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        playlist: playlist 
      };

      const now = new Date();
      const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
      const fileName = `biliradio_playlist_${dateStr}.json`;

      // 1. 优先尝试使用现代浏览器的 File System Access API
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'JSON 歌单文件',
              accept: { 'application/json': ['.json'] }
            }]
          });
          const writable = await handle.createWritable();
          await writable.write(JSON.stringify(data, null, 2));
          await writable.close();
          console.log('File system export successful');
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.warn('FilePicker failed, falling back to blob method:', err);
        }
      }

      // 2. 兜底方案：使用传统的 Blob 下载方式
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      console.log('Blob download export successful');
    } catch (err) {
      console.error('Export failed:', err);
      alert('导出失败: ' + err.message);
    }
  },

  importData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          // 兼容两种格式：{ playlist: [...] } 和 [...]
          if (data.playlist && Array.isArray(data.playlist)) {
            resolve(data.playlist);
          } else if (Array.isArray(data)) {
            resolve(data);
          } else {
            reject(new Error('无效的歌单文件格式'));
          }
        } catch (err) {
          reject(new Error('文件解析失败，请确保是正确的 JSON 文件'));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }
};
