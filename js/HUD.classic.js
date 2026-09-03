// HUD.js —— 经典脚本版本（适配 file:// 协议）
(function () {

/** 默认航线深度；若数据中的最后节点更远，会在构建引导条时自动扩展。 */
const DEFAULT_TIMELINE_DEPTH = 690;

/** 十张概念图对应的任务专属布局与文字。 */
const PROXIMITY_UI = {
  dongfanghong1:       { variant: 'v01', index: '01', meta: '人造卫星', enterX: -16 },
  shenzhou5:           { variant: 'v02', index: '02', meta: '载人航天', enterX: 0 },
  shenzhou7:           { variant: 'v03', index: '03', meta: '首次出舱', enterX: 16 },
  tiangong1_shenzhou8: { variant: 'v04', index: '04', meta: '交会对接', enterX: 0 },
  change3:             { variant: 'v05', index: '05', meta: '落月', enterX: -12 },
  tianwen1:            { variant: 'v06', index: '06', meta: '火星绕落巡', enterX: 16 },
  change5:             { variant: 'v07', index: '07', meta: '月球采样返回', enterX: -16 },
  tianhe:              { variant: 'v08', index: '08', meta: '空间站核心舱', enterX: 0 },
  css_complete:        { variant: 'v09', index: '09', meta: 'T字构型建成', enterX: -16 },
  change6:             { variant: 'v10', index: '10', meta: '月背采样返回', enterX: 16 },
};

class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.crosshair = document.getElementById('crosshair');
    this.prompt = document.getElementById('interact-prompt');
    this.promptName = document.getElementById('prompt-name');
    this.promptEra = document.getElementById('prompt-era');
    this.promptTag = document.getElementById('prompt-tag');
    this.promptDistance = document.getElementById('prompt-distance');
    this.promptIndex = document.getElementById('prompt-index');
    this.promptStage = this.prompt.querySelector('.proximity-stage');
    this.promptTarget = this.prompt.querySelector('.proximity-target');
    this.promptLeader = this.prompt.querySelector('.proximity-leader');
    this.promptCard = this.prompt.querySelector('.proximity-card');
    this.promptDistanceBox = this.prompt.querySelector('.proximity-distance');
    this.promptAction = this.prompt.querySelector('.proximity-action');
    this.promptActionKey = document.getElementById('prompt-action-key');
    this.promptActionLabel = document.getElementById('prompt-action-label');
    this.promptActionEn = document.getElementById('prompt-action-en');
    this.promptOrbits = [...this.prompt.querySelectorAll('.proximity-orbit')];
    this.promptOrbitNodes = [...this.prompt.querySelectorAll('.proximity-orbit-node')];
    this.eraValue = document.getElementById('era-value');
    this.timelineFill = document.getElementById('timeline-fill');
    this.timelineDot = document.getElementById('timeline-dot');
    this.timelineNodes = document.getElementById('timeline-nodes');
    this.timelinePercent = document.getElementById('timeline-percent');
    this.timelineCurrent = document.getElementById('timeline-current');
    this.toastEl = document.getElementById('toast');

    /** 时间线节点 DOM 缓存：id → element */
    this.nodeEls = new Map();
    /** 当前代表物数据缓存（供年代指示计算） */
    this.exhibits = [];
    this.timelineDepth = DEFAULT_TIMELINE_DEPTH;
    this._toastTimer = null;
    this._projectedTarget = new THREE.Vector3();
    this._promptTimeline = null;
    this._idleTweens = [];
    this._promptToken = 0;
    this._promptReady = null;
    this._reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // GSAP matchMedia 会在系统动态效果设置改变时自动刷新此状态。
    if (window.gsap && gsap.matchMedia) {
      this._motionMedia = gsap.matchMedia();
      this._motionMedia.add({
        reduce: '(prefers-reduced-motion: reduce)',
        full: '(prefers-reduced-motion: no-preference)',
      }, (context) => {
        this._reduceMotion = !!context.conditions.reduce;
      });
    }
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
      const layout = PROXIMITY_UI[data.id] || {
        variant: 'v01', index: '--', meta: data.tag || '航天档案', enterX: -12,
      };

      this._promptToken += 1;
      this._killPromptMotion();
      this.prompt.dataset.variant = layout.variant;
      this.promptName.textContent = data.name;
      this.promptEra.textContent = (data.era || '----').replace('年', '');
      this.promptTag.textContent = layout.meta;
      this.promptIndex.textContent = layout.index;
      this.setPromptInteractive(false, false);
      this.prompt.classList.remove('hidden');
      this.prompt.setAttribute('aria-hidden', 'false');
      this.crosshair.classList.add('interact');
      this._animatePromptIn(layout);
    } else {
      this.crosshair.classList.remove('interact');
      this._animatePromptOut();
    }
  }

  /**
   * 切换远距识别 / 近距可操作状态。只有状态改变时才触发动效，避免逐帧创建 tween。
   */
  setPromptInteractive(isReady, animate = true) {
    const ready = !!isReady;
    if (ready === this._promptReady) return;
    this._promptReady = ready;
    this.prompt.dataset.ready = ready ? 'true' : 'false';
    this.promptActionKey.textContent = 'F';
    this.promptActionLabel.textContent = ready ? '查看档案' : '继续靠近';
    this.promptActionEn.textContent = ready ? 'OPEN ARCHIVE' : 'APPROACH TARGET';

    if (!animate || !window.gsap || this._reduceMotion) return;
    gsap.killTweensOf(this.promptAction);
    if (ready) {
      gsap.fromTo(this.promptAction,
        { autoAlpha: .72, scale: .97 },
        { autoAlpha: 1, scale: 1, duration: .32, ease: 'power3.out', overwrite: 'auto' });
    } else {
      gsap.fromTo(this.promptAction,
        { autoAlpha: .72, scale: 1.015 },
        { autoAlpha: 1, scale: 1, duration: .24, ease: 'power2.out', overwrite: 'auto' });
    }
  }

  /** 玩家在远距识别阶段按 F 时，给出克制的方向反馈。 */
  nudgePrompt() {
    if (!window.gsap || this._reduceMotion || this.prompt.classList.contains('hidden')) return;
    gsap.killTweensOf(this.promptAction);
    gsap.timeline()
      .to(this.promptAction, { autoAlpha: 1, x: 4, duration: .07, ease: 'power1.out' })
      .to(this.promptAction, { x: 0, duration: .18, ease: 'power2.out' });
  }

  _killPromptMotion() {
    if (this._promptTimeline) {
      this._promptTimeline.kill();
      this._promptTimeline = null;
    }
    this._idleTweens.forEach((tween) => tween.kill());
    this._idleTweens.length = 0;
    if (window.gsap) {
      gsap.killTweensOf([
        this.prompt, this.promptCard, this.promptTarget, this.promptLeader,
        this.promptDistanceBox, this.promptAction, ...this.promptOrbits,
        ...this.promptOrbitNodes,
      ]);
    }
  }

  _animatePromptIn(layout) {
    if (!window.gsap || this._reduceMotion) {
      this.prompt.style.opacity = '1';
      this.prompt.style.visibility = 'visible';
      return;
    }

    const parts = [
      this.promptTarget, this.promptLeader, this.promptCard,
      this.promptDistanceBox, this.promptAction,
      ...this.promptOrbits, ...this.promptOrbitNodes,
    ];
    gsap.set(parts, { clearProps: 'transform,opacity,visibility' });
    gsap.set(this.prompt, { autoAlpha: 1 });

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.addLabel('lock', 0)
      .fromTo(this.promptTarget,
        { autoAlpha: 0, scale: .68 },
        { autoAlpha: 1, scale: 1, duration: .30 },
        'lock')
      .fromTo(this.promptOrbits,
        { autoAlpha: 0, scale: .82 },
        { autoAlpha: 1, scale: 1, duration: .52, stagger: .055 },
        'lock+=.04')
      .fromTo(this.promptLeader,
        { autoAlpha: 0, scaleX: 0, transformOrigin: '0 50%' },
        { autoAlpha: 1, scaleX: 1, duration: .34 },
        'lock+=.12')
      .fromTo(this.promptCard,
        { autoAlpha: 0, x: layout.enterX, y: 7, scale: .975 },
        { autoAlpha: 1, x: 0, y: 0, scale: 1, duration: .38 },
        'lock+=.19')
      .fromTo([this.promptDistanceBox, this.promptAction],
        { autoAlpha: 0, y: 7 },
        { autoAlpha: 1, y: 0, duration: .30, stagger: .065 },
        'lock+=.29')
      .fromTo(this.promptOrbitNodes,
        { autoAlpha: 0, scale: .55 },
        { autoAlpha: 1, scale: 1, duration: .24, stagger: .045 },
        'lock+=.24');

    this._promptTimeline = tl;
    this._idleTweens.push(
      gsap.to(this.promptOrbitNodes, {
        autoAlpha: .38,
        scale: 1.28,
        duration: 1.45,
        repeat: -1,
        yoyo: true,
        stagger: .18,
        ease: 'sine.inOut',
        delay: .72,
      })
    );
  }

  _animatePromptOut() {
    const token = ++this._promptToken;
    this._killPromptMotion();

    const finish = () => {
      if (token !== this._promptToken) return;
      this.prompt.classList.add('hidden');
      this.prompt.setAttribute('aria-hidden', 'true');
      this.prompt.style.removeProperty('opacity');
      this.prompt.style.removeProperty('visibility');
    };

    if (this.prompt.classList.contains('hidden') || !window.gsap || this._reduceMotion) {
      finish();
      return;
    }

    this._promptTimeline = gsap.timeline({ onComplete: finish })
      .to([this.promptAction, this.promptDistanceBox], {
        autoAlpha: 0, y: 5, duration: .12, stagger: .025, ease: 'power1.in',
      })
      .to(this.promptCard, {
        autoAlpha: 0, scale: .98, duration: .15, ease: 'power2.in',
      }, '<.02')
      .to([this.promptLeader, ...this.promptOrbitNodes], {
        autoAlpha: 0, duration: .12, ease: 'power1.in',
      }, '<')
      .to([this.promptTarget, ...this.promptOrbits], {
        autoAlpha: 0, scale: .9, duration: .17, ease: 'power2.in',
      }, '<.02');
  }

  /**
   * 将接近提示贴到代表物的屏幕投影位置，并刷新实时距离。
   * 锚点会按当前变体的卡片占位向内收边，避免锁定框或信息卡飞出屏幕。
   */
  updatePromptTarget(worldPosition, distance, camera, isInteractive) {
    if (!worldPosition || !camera || this.prompt.classList.contains('hidden')) return;

    this._projectedTarget.copy(worldPosition).project(camera);

    // 目标位于相机后方时投影坐标会翻转，跳过更新避免 UI 跳到镜像位置。
    if (this._projectedTarget.z > 1) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const margins = this._promptMargins();

    const rawX = (this._projectedTarget.x * 0.5 + 0.5) * viewportW;
    const rawY = (-this._projectedTarget.y * 0.5 + 0.5) * viewportH;
    const targetX = Math.min(viewportW - margins.right, Math.max(margins.left, rawX));
    const targetY = Math.min(viewportH - margins.bottom, Math.max(margins.top, rawY));

    this.prompt.style.setProperty('--target-x', `${targetX.toFixed(1)}px`);
    this.prompt.style.setProperty('--target-y', `${targetY.toFixed(1)}px`);
    this.promptDistance.textContent = `${Math.max(0, distance).toFixed(1)} m`;
    this.setPromptInteractive(isInteractive);
  }

  /**
   * 计算当前变体 UI 相对锚点的占位，得出锚点到视口四边的安全边距。
   * 按「变体 + 视口宽度」缓存，避免每帧读计算样式。
   */
  _promptMargins() {
    const cacheKey = (this.prompt.dataset.variant || '') + ':' + window.innerWidth;
    if (this._promptMarginKey === cacheKey && this._promptMarginsCache) {
      return this._promptMarginsCache;
    }

    const styles = getComputedStyle(this.prompt);
    const num = (name, fallback) => {
      const v = parseFloat(styles.getPropertyValue(name));
      return isFinite(v) ? v : fallback;
    };
    const uiScale = num('--ui-scale', 1) || 1;
    const cardX = num('--card-x', -420);
    const cardW = num('--card-w', 300);
    const actionX = num('--action-x', -410);
    const distanceX = num('--distance-x', 138);

    let left = 92;
    let right = 92;
    if (cardX < 0) left = Math.max(left, -cardX + 18);
    right = Math.max(right, cardX + cardW + 18);
    if (actionX < 0) left = Math.max(left, -actionX + 18);
    right = Math.max(right, actionX + 210); // 操作条为可变宽度盒，预留 210px
    if (distanceX < 0) left = Math.max(left, -distanceX + 18);
    right = Math.max(right, distanceX + 150);

    // 纵向：卡片最高悬于目标上方约 248px，动作条最低下沉约 260px。
    const top = 272;
    const bottom = 292;

    this._promptMarginKey = cacheKey;
    this._promptMarginsCache = {
      left: left * uiScale,
      right: right * uiScale,
      top: top * uiScale,
      bottom: bottom * uiScale,
    };
    return this._promptMarginsCache;
  }

  /* ==================== 时间线进度条 ==================== */

  /** 依据数据生成进度条节点（数据变更时重新调用） */
  buildTimeline(exhibits, settings = {}) {
    this.exhibits = [...exhibits].sort((a, b) => a.timeline_order - b.timeline_order);
    this.timelineDepth = Math.max(
      DEFAULT_TIMELINE_DEPTH,
      Math.abs(Number(settings.timeline_depth) || 0),
      ...this.exhibits.map((ex) => Math.abs(Number(ex.position?.[2]) || 0))
    );
    this.timelineNodes.innerHTML = '';
    this.nodeEls.clear();

    this.exhibits.forEach((ex, index) => {
      const node = document.createElement('div');
      node.className = 'timeline-node';
      node.setAttribute('role', 'listitem');
      node.style.top = this._zToPercent(ex.position[2]) + '%';
      const year = document.createElement('span');
      year.className = 'timeline-node__year';
      year.textContent = ex.era.replace('年', '');
      const name = document.createElement('span');
      name.className = 'timeline-node__name';
      name.textContent = ex.name;
      node.append(year, name);
      node.title = `${ex.name}（${ex.era}）`;
      this.timelineNodes.appendChild(node);
      this.nodeEls.set(ex.id, node);
    });

    if (this.timelineCurrent) {
      const total = String(this.exhibits.length).padStart(2, '0');
      this.timelineCurrent.textContent = `01 / ${total}`;
    }
  }

  /** Z 坐标 → 当前数据航线内的进度百分比。 */
  _zToPercent(z) {
    return Math.min(100, Math.max(0, (-z / this.timelineDepth) * 100));
  }

  /**
   * 每帧刷新进度条与年代指示器
   * @param {number} playerZ 宇航员 Z 坐标
   */
  updateProgress(playerZ) {
    const percent = this._zToPercent(playerZ);
    this.timelineFill.style.height = percent + '%';
    this.timelineDot.style.top = percent + '%';
    if (this.timelinePercent) {
      const rounded = Math.round(percent);
      this.timelinePercent.value = String(rounded).padStart(2, '0') + '%';
      this.timelinePercent.textContent = this.timelinePercent.value;
    }

    let currentIndex = this.exhibits.findIndex((ex) => playerZ > ex.position[2] + 6);
    if (currentIndex < 0) currentIndex = Math.max(0, this.exhibits.length - 1);

    // 已飞过的节点点亮
    this.exhibits.forEach((ex, index) => {
      const el = this.nodeEls.get(ex.id);
      if (!el) return;
      const passed = playerZ <= ex.position[2] + 6; // 接近 / 飞过即点亮
      el.classList.toggle('passed', passed);
      el.classList.toggle('current', index === currentIndex);
      if (index === currentIndex) el.setAttribute('aria-current', 'step');
      else el.removeAttribute('aria-current');
    });

    if (this.timelineCurrent && this.exhibits.length) {
      const current = String(currentIndex + 1).padStart(2, '0');
      const total = String(this.exhibits.length).padStart(2, '0');
      this.timelineCurrent.textContent = `${current} / ${total}`;
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
      // 穿过最后一个历史坐标后，仍需抵达未来航标才算完成航程。
      this.eraValue.textContent = `${last.era} ${last.name} · 前往未来航标`;
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

XINGTU.HUD = HUD;

})();
