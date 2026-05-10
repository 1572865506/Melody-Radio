/**
 * app.js - 主应用入口
 */
(function() {
  'use strict';

  let els = {};

  function init() {
    console.log('App initializing...');
    
    // 1. Initialize Elements
    els = {
      btnAddSong: document.getElementById('btnAddSong'),
      btnAddSongEmpty: document.getElementById('btnAddSongEmpty'),
      btnImport: document.getElementById('btnImport'),
      btnExport: document.getElementById('btnExport'),
      addSongModal: document.getElementById('addSongModal'),
      btnCloseModal: document.getElementById('btnCloseModal'),
      songInput: document.getElementById('songInput'),
      btnSubmitAdd: document.getElementById('btnSubmitAdd'),
      addSongHint: document.getElementById('addSongHint'),
      fileImport: document.getElementById('fileImport'),
      listenerCountEl: document.getElementById('listenerCount'),
      quickAddInput: document.getElementById('quickAddInput'),
      btnQuickAdd: document.getElementById('btnQuickAdd')
    };

    // 2. Initialize Magic Rings Effect (Before song loading)
    const ringContainer = document.getElementById('magicRingsContainer');
    const heroCoverGroup = document.querySelector('.hidden.lg\\:block.relative.group');
    
    if (ringContainer && typeof MagicRings !== 'undefined') {
      const rings = MagicRings.init(ringContainer, {
        color: "#5e39e0", 
        colorTwo: "#9f7aea", 
        ringCount: 4,
        speed: 0.8,
        attenuation: 8,
        lineThickness: 1.2,
        baseRadius: 0.2,
        radiusStep: 0.1,
        scaleRate: 0.05,
        opacity: 0.6,
        blur: 1.2,
        noiseAmount: 0.05,
        rotation: 0,
        ringGap: 1.5,
        fadeIn: 0.6,
        fadeOut: 0.8,
        followMouse: true,
        mouseInfluence: 0.1,
        hoverScale: 1.1,
        parallax: 0.04,
        clickBurst: true
      });

      if (rings && heroCoverGroup) {
        heroCoverGroup.addEventListener('mousemove', (e) => {
          rings.handleExternalMouseMove(e.clientX, e.clientY);
        });
        heroCoverGroup.addEventListener('click', () => {
          rings.handleExternalClick();
        });
        heroCoverGroup.addEventListener('mouseenter', () => rings.setHover(true));
        heroCoverGroup.addEventListener('mouseleave', () => rings.setHover(false));
      }
    }

    // 3. Initialize Player & Playlist
    Player.init();
    const savedSongs = Storage.loadPlaylist();
    const savedState = Storage.loadPlayerState();
    Playlist.init(savedSongs, savedState.currentIndex);

    Playlist.onChange = (index) => {
      const song = Playlist.getCurrentSong();
      if (song) {
        Player.loadSong(song);
      } else {
        Player.pause();
        document.title = 'BiliRadio - Bilibili 音乐电台';
      }
    };

    // 4. Restore state
    const currentSong = Playlist.getCurrentSong();
    if (currentSong) {
      const lastPos = parseFloat(localStorage.getItem('biliradio_last_pos')) || 0;
      const freshState = Storage.loadPlayerState();
      const seekTime = lastPos || freshState.currentTime || 0;
      Player.loadSong(currentSong, seekTime, true);
      
      // Force initial color sync
      const coverImg = document.getElementById('heroCoverImg');
      if (coverImg) {
        if (coverImg.complete) {
          Player.updateMagicRingsColor(coverImg);
        } else {
          coverImg.addEventListener('load', () => Player.updateMagicRingsColor(coverImg), { once: true });
        }
      }
    }

    animateListenerCount();
    bindEvents();
    console.log('App initialized.');
  }

  function animateListenerCount() {
    if (!els.listenerCountEl) return;
    const base = 800 + Math.floor(Math.random() * 600);
    els.listenerCountEl.textContent = base.toLocaleString();
    setInterval(() => {
      const delta = Math.floor(Math.random() * 20) - 8;
      const current = parseInt(els.listenerCountEl.textContent.replace(/,/g, '')) || base;
      const next = Math.max(500, current + delta);
      els.listenerCountEl.textContent = next.toLocaleString();
    }, 5000);
  }

  function bindEvents() {
    if (els.btnAddSong) {
      els.btnAddSong.addEventListener('click', () => {
        els.addSongModal.classList.remove('hidden');
        els.addSongModal.classList.add('flex');
        els.songInput.focus();
      });
    }
    if (els.btnAddSongEmpty) {
      els.btnAddSongEmpty.addEventListener('click', () => {
        els.addSongModal.classList.remove('hidden');
        els.addSongModal.classList.add('flex');
        els.songInput.focus();
      });
    }
    if (els.btnCloseModal) {
      els.btnCloseModal.addEventListener('click', () => {
        els.addSongModal.classList.add('hidden');
        els.addSongModal.classList.remove('flex');
      });
    }
    if (els.btnSubmitAdd) {
      els.btnSubmitAdd.addEventListener('click', () => {
        const val = els.songInput.value.trim();
        if (val) handleAddSong(val);
      });
    }
    if (els.songInput) {
      els.songInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = els.songInput.value.trim();
          if (val) handleAddSong(val);
        }
      });
    }
    if (els.btnImport) {
      els.btnImport.addEventListener('click', () => {
        els.fileImport.click();
      });
    }
    if (els.fileImport) {
      els.fileImport.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleImport(file);
      });
    }
    if (els.btnExport) {
      els.btnExport.addEventListener('click', handleExport);
    }
    if (els.btnQuickAdd) {
      els.btnQuickAdd.addEventListener('click', () => {
        const val = els.quickAddInput.value.trim();
        if (val) handleAddSong(val);
      });
    }
    if (els.quickAddInput) {
      els.quickAddInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = els.quickAddInput.value.trim();
          if (val) handleAddSong(val);
        }
      });
    }
  }

  async function handleAddSong(url) {
    els.btnSubmitAdd.disabled = true;
    els.btnSubmitAdd.textContent = '添加中...';
    els.addSongHint.textContent = '正在从 Bilibili 获取歌曲信息...';
    
    try {
      const response = await fetch(`/api/song-info?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);
      
      Playlist.addSong(data);
      Storage.savePlaylist(Playlist.songs);
      
      els.addSongModal.classList.add('hidden');
      els.addSongModal.classList.remove('flex');
      els.songInput.value = '';
      if (els.quickAddInput) els.quickAddInput.value = '';
    } catch (err) {
      alert('添加失败: ' + err.message);
    } finally {
      els.btnSubmitAdd.disabled = false;
      els.btnSubmitAdd.textContent = '确认添加';
      els.addSongHint.textContent = '支持 Bilibili 视频链接或 BV 号';
    }
  }

  async function handleImport(file) {
    try {
      const songs = await Storage.importData(file);
      Playlist.songs = songs;
      Playlist.currentIndex = -1; // 重置当前播放索引
      Playlist.render();
      Storage.savePlaylist(songs);
      alert('歌单导入成功！');
    } catch (err) {
      alert('导入失败: ' + err.message);
    }
  }

  function handleExport() {
    Storage.exportData(Playlist.songs);
  }

  // Start the app
  document.addEventListener('DOMContentLoaded', init);

})();
