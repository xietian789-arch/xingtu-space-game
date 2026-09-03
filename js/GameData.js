/**
 * GameData.js —— 数据层模块
 * ------------------------------------------------------------
 * 职责：
 *  1. 加载 data/exhibits.json（代表物数据 + 全局 settings）
 *  2. 提供代表物的增 / 删 / 改 / 查接口（内存操作）
 *  3. 序列化导出 JSON（供编辑面板下载）
 *
 * 说明：浏览器 file:// 协议下 fetch 本地 JSON 会被 CORS 拦截，
 *       此时自动回退到 index.html 中以经典脚本引入的
 *       data/exhibits.js（window.EXHIBITS_DATA_FALLBACK 镜像）。
 */

const DATA_URL = 'data/exhibits.json';

class GameData {
  constructor() {
    /** @type {{exhibits: Array, settings: Object}} 内存中的完整数据 */
    this.data = { exhibits: [], settings: {} };
    /** 数据来源：'json' = 通过 http 正常加载；'fallback' = file:// 镜像 */
    this.source = null;
  }

  /**
   * 加载数据：优先 fetch JSON，失败则回退 window 镜像
   * @returns {Promise<{exhibits:Array, settings:Object}>}
   */
  async load() {
    try {
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      this._apply(json);
      this.source = 'json';
      console.info('[GameData] 已从 exhibits.json 加载数据');
    } catch (err) {
      console.warn('[GameData] fetch exhibits.json 失败（可能是 file:// 直开），尝试回退镜像…', err);
      if (window.EXHIBITS_DATA_FALLBACK) {
        this._apply(window.EXHIBITS_DATA_FALLBACK);
        this.source = 'fallback';
      } else {
        throw new Error('无法加载代表物数据：exhibits.json 不可用且缺少回退镜像');
      }
    }
    return this.data;
  }

  /** 深拷贝写入内存，保证与原始对象隔离 */
  _apply(raw) {
    this.data = JSON.parse(JSON.stringify(raw));
    // 按 timeline_order 排序，保证时间线顺序稳定
    this.data.exhibits.sort((a, b) => a.timeline_order - b.timeline_order);
  }

  /** 全局设置（移动速度 / 星空数量等） */
  getSettings() {
    return this.data.settings || {};
  }

  /** 按时间线排序的代表物数组 */
  getExhibits() {
    return this.data.exhibits;
  }

  /** 按 id 查找单个代表物 */
  getExhibit(id) {
    return this.data.exhibits.find((e) => e.id === id) || null;
  }

  /**
   * 更新代表物字段
   * @param {string} id
   * @param {Object} patch 要合并的字段
   */
  updateExhibit(id, patch) {
    const ex = this.getExhibit(id);
    if (!ex) return false;
    Object.assign(ex, patch);
    return true;
  }

  /**
   * 新增代表物（自动生成 id 与 timeline_order）
   * @param {Object} exhibit 可只传部分字段，其余用默认值补齐
   * @returns {Object} 新建的代表物对象
   */
  addExhibit(exhibit = {}) {
    const maxOrder = this.data.exhibits.reduce(
      (m, e) => Math.max(m, e.timeline_order || 0), 0
    );
    const last = this.data.exhibits[this.data.exhibits.length - 1];
    const defaults = {
      id: 'exhibit_' + Date.now().toString(36),
      name: '新代表物',
      tag: '待定',
      era: '20XX年',
      timeline_order: maxOrder + 1,
      position: last
        ? [last.position[0], last.position[1], last.position[2] - 60]
        : [0, 0, -60],
      description: '请输入描述…',
      significance: '请输入历史意义…',
      model_path: '',
      scale: 2.0,
      glow_color: '#4488FF',
      interaction_distance:
        this.data.settings.default_interaction_distance || 12.0,
    };
    const merged = Object.assign(defaults, exhibit);
    this.data.exhibits.push(merged);
    this.data.exhibits.sort((a, b) => a.timeline_order - b.timeline_order);
    return merged;
  }

  /** 删除代表物 */
  removeExhibit(id) {
    const idx = this.data.exhibits.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.data.exhibits.splice(idx, 1);
    return true;
  }

  /** 序列化为带缩进的 JSON 文本 */
  exportJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  /** 触发浏览器下载当前数据为 exhibits.json 文件 */
  downloadJSON() {
    const blob = new Blob([this.exportJSON()], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'exhibits.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** 重新从文件加载（丢弃内存中的修改） */
  async reload() {
    return this.load();
  }
}

export default GameData;
