/**
 * GameplayMusic.classic.js
 * ------------------------------------------------------------
 * 游戏背景音乐：播放 audio/gameplay-bgm.webm 并无限循环。
 * 优先用 WebAudio 解码为 AudioBuffer 后用 loop 节点播放（采样级无缝循环，
 * 循环点没有爆音/停顿）；解码失败时回退到 <audio> 元素的 loop 属性。
 * 对外 API 保持不变：arm / start / stop / setEnabled / toggle / setVolume。
 */
(function () {
  'use strict';

  const STORAGE_ENABLED = 'xingtu.music.enabled';
  const STORAGE_VOLUME = 'xingtu.music.volume';
  const DEFAULT_VOLUME = 0.42;
  const MUSIC_URL = 'audio/gameplay-bgm.webm';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  class GameplayMusic {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.buffer = null;          // 解码后的 AudioBuffer（无缝循环用）
      this.source = null;          // 当前 AudioBufferSourceNode
      this.elementSource = null;   // 回退模式的 MediaElementSource
      this.audioEl = null;         // 回退模式的 <audio> 元素
      this._bufferPromise = null;
      this.isPlaying = false;
      this.offset = 0;             // 循环曲目的播放位置（秒），暂停后从断点继续
      this._startedAt = 0;         // source 启动时的 ctx.currentTime
      this.enabled = this._readBoolean(STORAGE_ENABLED, true);
      this.volume = this._readNumber(STORAGE_VOLUME, DEFAULT_VOLUME);
    }

    _readBoolean(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value !== 'false';
      } catch (_) {
        return fallback;
      }
    }

    _readNumber(key, fallback) {
      try {
        const storedValue = localStorage.getItem(key);
        if (storedValue === null) return fallback;
        const value = Number(storedValue);
        return Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
      } catch (_) {
        return fallback;
      }
    }

    _persist() {
      try {
        localStorage.setItem(STORAGE_ENABLED, String(this.enabled));
        localStorage.setItem(STORAGE_VOLUME, String(this.volume));
      } catch (_) {}
    }

    /** 在“开始航行”的用户手势中创建 AudioContext 并开始预解码，首页仍保持静音。 */
    arm() {
      this._init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this._loadBuffer();
    }

    _init() {
      if (this.ctx) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.connect(ctx.destination);
      this.masterGain = master;
    }

    /** 拉取并解码背景音乐；失败时走 <audio> 回退路径。 */
    _loadBuffer() {
      if (this._bufferPromise || !this.ctx || this.buffer) return;
      this._bufferPromise = fetch(MUSIC_URL)
        .then((response) => {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.arrayBuffer();
        })
        .then((data) => this.ctx.decodeAudioData(data))
        .then((buffer) => {
          this.buffer = buffer;
          // 若回退模式正在播放，切到无缝循环的 buffer 播放
          if (this.isPlaying && this.audioEl && !this.audioEl.paused) {
            this.offset = this.audioEl.currentTime % buffer.duration;
            this._stopElement();
            this._playBuffer();
          }
        })
        .catch((err) => {
          console.warn('[GameplayMusic] BGM 解码失败，回退到 <audio> 循环:', err);
        });
    }

    _playBuffer() {
      const ctx = this.ctx;
      const source = ctx.createBufferSource();
      source.buffer = this.buffer;
      source.loop = true; // 采样级无缝循环
      source.connect(this.masterGain);
      source.start(0, this.offset % this.buffer.duration);
      this.source = source;
      this._startedAt = ctx.currentTime;
    }

    _stopBuffer() {
      if (!this.source) return;
      // 记录播放位置，下次从断点继续循环
      this.offset = (this.offset + (this.ctx.currentTime - this._startedAt)) % this.buffer.duration;
      try { this.source.stop(); } catch (_) {}
      try { this.source.disconnect(); } catch (_) {}
      this.source = null;
    }

    /** 回退路径：<audio> 元素经 MediaElementSource 接入同一音量总线。 */
    _ensureElement() {
      if (this.audioEl) return;
      const audio = new Audio(MUSIC_URL);
      audio.loop = true; // 无限循环
      audio.preload = 'auto';
      try {
        this.elementSource = this.ctx.createMediaElementSource(audio);
        this.elementSource.connect(this.masterGain);
      } catch (err) {
        // 极少数环境不支持 MediaElementSource，直接用元素自身音量
        console.warn('[GameplayMusic] MediaElementSource 不可用:', err);
      }
      this.audioEl = audio;
    }

    _playElement() {
      this._ensureElement();
      this.audioEl.volume = 1; // 音量统一由 masterGain 控制
      const p = this.audioEl.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => console.warn('[GameplayMusic] BGM 播放失败:', err));
      }
    }

    _stopElement() {
      if (!this.audioEl) return;
      this.audioEl.pause();
    }

    async start() {
      this._init();
      this._loadBuffer();
      if (!this.ctx || this.isPlaying) return;
      if (this.ctx.state === 'suspended') {
        try { await this.ctx.resume(); } catch (_) { return; }
      }

      this.isPlaying = true;
      this._rampMaster(this.enabled ? this.volume : 0, 0.9);

      if (this.buffer) {
        this._playBuffer();
      } else {
        this._playElement();
        // 解码完成后无缝切换到 buffer 循环
        this._bufferPromise && this._bufferPromise.then(() => {
          if (this.isPlaying && this.buffer && this.audioEl && !this.audioEl.paused) {
            this.offset = this.audioEl.currentTime % this.buffer.duration;
            this._stopElement();
            this._playBuffer();
          }
        });
      }
    }

    /**
     * 暂停并淡出，记录断点；结局/首页使用 suspend=true，确保完全静音且节省资源。
     */
    stop(suspend = true) {
      this.isPlaying = false;
      if (!this.ctx || !this.masterGain) return;
      this._rampMaster(0, 0.28);
      if (this.source) this._stopBuffer();
      this._stopElement();
      if (suspend) {
        window.setTimeout(() => {
          if (!this.isPlaying && this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend().catch(() => {});
          }
        }, 360);
      }
    }

    setEnabled(enabled) {
      this.enabled = !!enabled;
      this._persist();
      if (this.isPlaying) this._rampMaster(this.enabled ? this.volume : 0, 0.22);
    }

    toggle() {
      this.setEnabled(!this.enabled);
      return this.enabled;
    }

    setVolume(volume) {
      this.volume = clamp(Number(volume) || 0, 0, 1);
      this._persist();
      if (this.isPlaying && this.enabled) this._rampMaster(this.volume, 0.08);
    }

    _rampMaster(value, timeConstant) {
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const gain = this.masterGain.gain;
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(clamp(value, 0, 1), now, Math.max(0.015, timeConstant / 4));
    }
  }

  XINGTU.GameplayMusic = GameplayMusic;
})();
