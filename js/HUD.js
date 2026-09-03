/**
 * HUD.js —— HUD 界面模块
 * ------------------------------------------------------------
 * 职责：管理覆盖在 3D 画布上的全部 HUD 元素：
 *  1. 屏幕中央准星（可交互时变为发光圆环）
 *  2. 顶部中央代表物接近提示
 *  3. 左上角当前年代指示器（根据宇航员 Z 坐标计算所处航段）
 *  4. 右下角时间线垂直进度条（标注全部代表物时间节点）
 *  5. 全局 Toast 轻提示
 */

/** 航线总深度：z=0 → z=-650 */
const TIMELINE_DEPTH = 650;

class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.crosshair = document.getElementById('crosshair');
    this.prompt = document.getElementById('interact-prompt');
    this.promptName = document.getElementById('prompt-name');
    this.eraValue = document.getElementById('era-value');
    this.timelineFill = document.getElementById('timeline-fill');
    this.timelineDot = document.getElementById('timeline-dot');
    this.timelineNodes = document.getElementById('timeline-nodes');
    this.toastEl = document.getElementById('toast');

    /** 时间线节点 DOM 缓存：id → element */
    this.nodeEls = new Map();
    /** 当前代表物数据缓存（供年代指示计算） */
    this.exhibits = [];
    this._toastTimer = null;
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  /* ==================== 接近提示 + 准星 ==================== */

  /**
   * 设置接近提示
   * @param {Object|null} data 代表物数据；null 表示离开范围
   */
  setPrompt(data) {
    if (data) {
      this.promptName.textContent = data.name;
      this.prompt.classList.remove('hidden');
      this.crosshair.classList.add('interact');
    } else {
      this.prompt.classList.add('hidden');
      this.crosshair.classList.remove('interact');
    }
  }

  /* ==================== 时间线进度条 ==================== */

  /** 依据数据生成进度条节点（数据变更时重新调用） */
  buildTimeline(exhibits) {
    this.exhibits = [...exhibits].sort((a, b) => a.timeline_order - b.timeline_order);
    this.timelineNodes.innerHTML = '';
    this.nodeEls.clear();

    this.exhibits.forEach((ex) => {
      const node = document.createElement('div');
      node.className = 'timeline-node';
      node.style.top = this._zToPercent(ex.position[2]) + '%';
      node.textContent = `${ex.era.replace('年', '')} ${ex.name}`;
      node.title = `${ex.name}（${ex.era}）`;
      this.timelineNodes.appendChild(node);
      this.nodeEls.set(ex.id, node);
    });
  }

  /** Z 坐标 → 进度百分比（z=0 → 0%，z=-650 → 100%） */
  _zToPercent(z) {
    return Math.min(100, Math.max(0, (-z / TIMELINE_DEPTH) * 100));
  }

  /**
   * 每帧刷新进度条与年代指示器
   * @param {number} playerZ 宇航员 Z 坐标
   */
  updateProgress(playerZ) {
    const percent = this._zToPercent(playerZ);
    this.timelineFill.style.height = percent + '%';
    this.timelineDot.style.top = percent + '%';

    // 已飞过的节点点亮
    for (const ex of this.exhibits) {
      const el = this.nodeEls.get(ex.id);
      if (!el) continue;
      const passed = playerZ <= ex.position[2] + 6; // 接近 / 飞过即点亮
      el.classList.toggle('passed', passed);
    }

    this._updateEra(playerZ);
  }

  /** 根据 Z 坐标计算当前所处年代区间 */
  _updateEra(playerZ) {
    const list = this.exhibits;
    if (!list.length) {
      this.eraValue.textContent = '起点 · 等待启航';
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];

    if (playerZ > first.position[2]) {
      // 尚未抵达第一个代表物
      this.eraValue.textContent = `起航 · 飞向 ${first.era} ${first.name}`;
      return;
    }
    if (playerZ <= last.position[2]) {
      // 已抵达终点之后
      this.eraValue.textContent = `${last.era} ${last.name} · 航程圆满`;
      return;
    }
    // 位于两个代表物之间：显示航段
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (playerZ <= a.position[2] && playerZ > b.position[2]) {
        this.eraValue.textContent =
          `${a.era.replace('年', '')} ${a.name} → ${b.era.replace('年', '')} ${b.name}`;
        return;
      }
    }
  }

  /* ==================== Toast ==================== */

  /**
   * 显示轻提示（2.6 秒后自动消失）
   * @param {string} msg 提示文字
   */
  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toastEl.classList.add('hidden');
    }, 2600);
  }
}

export default HUD;
