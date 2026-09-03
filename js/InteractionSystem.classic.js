// InteractionSystem.js —— 经典脚本版本（适配 file:// 协议）
(function () {

/** 旧版 localStorage 数据可能没有新字段，按任务 ID 提供稳定的显示距离。 */
const REVEAL_DISTANCE_BY_ID = {
  dongfanghong1: 28,
  shenzhou5: 30,
  shenzhou7: 30,
  tiangong1_shenzhou8: 34,
  change3: 30,
  tianwen1: 34,
  change5: 30,
  tianhe: 36,
  css_complete: 40,
  change6: 32,
};

/** 防止站在临界点时 UI 因微小位移反复闪烁。 */
const REVEAL_LEAVE_PADDING = 4;

/** 数据缺失时的默认近距操作（按 F）范围。 */
const DEFAULT_INTERACTION_DISTANCE = 18;

/**
 * UI 只在准心朝向目标时出现：进入 18°，离开 24°。
 * 双阈值能避免目标停在准心边缘时频繁显隐。
 */
const AIM_ENTER_DOT = 0.9510565163;
const AIM_LEAVE_DOT = 0.9135454576;

class InteractionSystem {
  /**
   * @param {AstronautController} astronaut 宇航员控制器
   * @param {ExhibitManager} exhibitManager 代表物管理器
   * @param {Object} hooks 回调钩子
   * @param {Function} hooks.onProximityChange 进入/离开 UI 识别范围时调用，参数为代表物数据或 null
   * @param {Function} hooks.onInteractabilityChange 进入/离开可操作范围时调用
   */
  constructor(astronaut, exhibitManager, hooks = {}) {
    this.astronaut = astronaut;
    this.exhibitManager = exhibitManager;
    this.onProximityChange = hooks.onProximityChange || (() => {});
    this.onInteractabilityChange = hooks.onInteractabilityChange || (() => {});

    /** 当前处于 UI 识别范围内的最近代表物记录（或 null） */
    this.current = null;
    /** 当前距离（供 HUD 等展示） */
    this.currentDistance = Infinity;
    /** 是否已经进入该代表物的近距操作范围 */
    this.isInteractive = false;
    this._cameraPosition = new THREE.Vector3();
    this._cameraForward = new THREE.Vector3();
    this._targetDirection = new THREE.Vector3();
  }

  /** 每帧更新距离与准心朝向检测 */
  update(camera) {
    let nearest = null;
    let nearestDist = Infinity;
    const hasCamera = camera
      && typeof camera.getWorldPosition === 'function'
      && typeof camera.getWorldDirection === 'function';

    if (hasCamera) {
      camera.getWorldPosition(this._cameraPosition);
      camera.getWorldDirection(this._cameraForward).normalize();
    }

    for (const rec of this.exhibitManager.records.values()) {
      const d = this.astronaut.group.position.distanceTo(rec.root.position);
      const interactionLimit = rec.data.interaction_distance ?? DEFAULT_INTERACTION_DISTANCE;
      const revealLimit = rec.data.ui_reveal_distance
        ?? REVEAL_DISTANCE_BY_ID[rec.data.id]
        ?? Math.max(interactionLimit + 10, interactionLimit * 1.6);
      const wasCurrent = this.current && this.current.data.id === rec.data.id;
      const leavePadding = wasCurrent ? REVEAL_LEAVE_PADDING : 0;

      // 距离合适但目标不在准心前方时不显示；穿过飞船后点积为负，会立即隐藏。
      if (hasCamera) {
        this._targetDirection
          .subVectors(rec.root.position, this._cameraPosition)
          .normalize();
        const aimDot = this._cameraForward.dot(this._targetDirection);
        const aimLimit = wasCurrent ? AIM_LEAVE_DOT : AIM_ENTER_DOT;
        if (aimDot < aimLimit) continue;
      }

      if (d < revealLimit + leavePadding && d < nearestDist) {
        nearest = rec;
        nearestDist = d;
      }
    }

    const newId = nearest ? nearest.data.id : null;
    const oldId = this.current ? this.current.data.id : null;
    const nextInteractive = !!nearest
      && nearestDist <= (nearest.data.interaction_distance ?? DEFAULT_INTERACTION_DISTANCE);

    if (newId !== oldId) {
      this.current = nearest;
      this.currentDistance = nearestDist;
      this.isInteractive = nextInteractive;
      // 代表物高亮（发光增强 + 标签放大）
      this.exhibitManager.setHighlight(newId);
      // 通知 HUD / 相机等外部系统
      this.onProximityChange(nearest ? nearest.data : null);
      this.onInteractabilityChange(nextInteractive, nearest ? nearest.data : null);
    } else if (nearest) {
      this.currentDistance = nearestDist;
      if (nextInteractive !== this.isInteractive) {
        this.isInteractive = nextInteractive;
        this.onInteractabilityChange(nextInteractive, nearest.data);
      }
    }
  }

  /** 强制清除当前交互状态（打开面板 / 数据重建时调用） */
  clear() {
    if (this.current || this.isInteractive) {
      this.current = null;
      this.currentDistance = Infinity;
      this.isInteractive = false;
      this.exhibitManager.setHighlight(null);
      this.onProximityChange(null);
      this.onInteractabilityChange(false, null);
    }
  }
}

XINGTU.InteractionSystem = InteractionSystem;

})();
