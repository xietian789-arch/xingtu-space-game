// GameData.js —— 经典脚本版本（适配 file:// 协议）
(function () {

const DATA_URL = 'data/exhibits.json';
const STORAGE_KEY = 'xingtu_exhibits';
const BUILTIN_MODEL_PATHS = {
  dongfanghong1: 'models/dongfanghong1.glb',
  shenzhou5: 'models/shenzhou5.glb',
  shenzhou7: 'models/shenzhou7.glb',
  tiangong1_shenzhou8: 'models/tiangong1_shenzhou8.glb',
  change3: 'models/change3.glb',
  zhurong_rover: 'models/zhurong.glb',
  tianwen1: 'models/tianwen1_only.glb',
  change5: 'models/change5.glb',
  tianhe: 'models/tianhe.glb',
  css_complete: 'models/css_complete.glb',
  change6: 'models/change6.glb',
};
const BUILTIN_COMPANION_PATHS = {
  tianwen1: 'models/zhurong.glb',
};

// v2 航线把十个节点按年代均匀放在虫洞内部，并把终点留在最后一个节点之后。
// 旧版编辑器曾把坐标保存在 localStorage；加载旧缓存时必须迁移，否则静态
// exhibits.json 修正后仍会被旧坐标覆盖。
const ROUTE_LAYOUT_VERSION = 2;
const ROUTE_LAYOUT_V2 = {
  dongfanghong1:       { order: 1, position: [0, 0, -90] },
  shenzhou5:           { order: 2, position: [3, 1, -235] },
  shenzhou7:           { order: 3, position: [-4, -1, -380] },
  tiangong1_shenzhou8: { order: 4, position: [5, 2, -525] },
  change3:             { order: 5, position: [-3, -2, -670] },
  change5:             { order: 6, position: [-5, 1, -815] },
  tianwen1:            { order: 7, position: [4, 0, -960] },
  tianhe:              { order: 8, position: [3, -1, -1105] },
  css_complete:        { order: 9, position: [-2, 2, -1250] },
  change6:             { order: 10, position: [0, 0, -1395] },
};

const ROUTE_SETTINGS_V2 = {
  route_layout_version: ROUTE_LAYOUT_VERSION,
  route_start_z: 30,
  route_end_z: -1815,
  timeline_depth: 1545,
  future_beacon_gap: 150,
  future_beacon_position: [0, 0, -1545],
  route_tail_depth: 270,
  wormhole_center_z: -892.5,
  wormhole_length: 1845,
  wormhole_radius: 30,
  flight_radius: 24,
  flight_z_min: -1625,
  flight_z_max: 25,
};

class GameData {
  constructor() {
    /** @type {{exhibits: Array, settings: Object}} 内存中的完整数据 */
    this.data = { exhibits: [], settings: {} };
    /** 数据来源：'storage' = localStorage；'json' = fetch；'fallback' = file:// 镜像 */
    this.source = null;
  }

  /**
   * 加载数据：优先 localStorage（编辑器保存过），再 fetch JSON，最后回退 window 镜像
   * @returns {Promise<{exhibits:Array, settings:Object}>}
   */
  async load() {
    // 1. 优先从 localStorage 读取（编辑器保存后的持久化数据）
    if (this.loadFromStorage()) {
      console.info('[GameData] 已从 localStorage 加载数据（编辑器上次保存）');
      return this.data;
    }

    // 2. 尝试 fetch JSON
    try {
      const res = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-cache' });
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

  /** 从 localStorage 加载，成功返回 true */
  loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.exhibits) && parsed.exhibits.length > 0) {
        this._apply(parsed);
        this.source = 'storage';
        return true;
      }
    } catch (e) {
      console.warn('[GameData] localStorage 数据损坏，忽略', e);
      localStorage.removeItem(STORAGE_KEY);
    }
    return false;
  }

  /** 将当前数据写入 localStorage（编辑器保存时调用） */
  saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      console.info('[GameData] 数据已写入 localStorage');
      return true;
    } catch (e) {
      console.warn('[GameData] localStorage 写入失败', e);
      return false;
    }
  }

  /** 清除 localStorage 中的缓存数据 */
  clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /** 深拷贝写入内存，保证与原始对象隔离 */
  _apply(raw) {
    this.data = JSON.parse(JSON.stringify(raw));
    this.data.settings = this.data.settings || {};
    const needsRouteMigration =
      Number(this.data.settings.route_layout_version || 0) < ROUTE_LAYOUT_VERSION;

    if (needsRouteMigration) {
      this.data.exhibits.forEach((exhibit) => {
        const route = ROUTE_LAYOUT_V2[exhibit.id];
        if (!route) return;
        exhibit.timeline_order = route.order;
        exhibit.position = [...route.position];
      });
      Object.assign(this.data.settings, ROUTE_SETTINGS_V2);
      console.info('[GameData] 已将旧缓存迁移到连续可抵达的 v2 航线');
    }
    // 旧数据曾把祝融号重复列成第 11 个节点；现在并入“天问一号 + 祝融号”。
    this.data.exhibits = this.data.exhibits.filter((exhibit) => exhibit.id !== 'zhurong_rover');
    // 旧版编辑器可能在 localStorage 中留下空模型路径；为内置展品补回真实 GLB。
    this.data.exhibits.forEach((exhibit) => {
      if (!exhibit.model_path && BUILTIN_MODEL_PATHS[exhibit.id]) {
        exhibit.model_path = BUILTIN_MODEL_PATHS[exhibit.id];
      }
      if (!exhibit.companion_model_path && BUILTIN_COMPANION_PATHS[exhibit.id]) {
        exhibit.companion_model_path = BUILTIN_COMPANION_PATHS[exhibit.id];
      }
    });
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
      ui_reveal_distance:
        this.data.settings.default_ui_reveal_distance || 20.0,
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
    this.clearStorage();
    return this.load();
  }
}

XINGTU.GameData = GameData;

})();
