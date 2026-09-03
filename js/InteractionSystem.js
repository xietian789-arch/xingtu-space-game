/**
 * InteractionSystem.js —— 交互系统模块
 * ------------------------------------------------------------
 * 职责：
 *  1. 每帧检测宇航员与所有代表物的距离
 *  2. 找出最近的、处于 interaction_distance 范围内的代表物
 *  3. 距离变化时通知外部（HUD 提示、发光增强、标签高亮、相机聚焦）
 *  F 键触发逻辑由主状态机读取本模块的 current 属性完成。
 */

class InteractionSystem {
  /**
   * @param {AstronautController} astronaut 宇航员控制器
   * @param {ExhibitManager} exhibitManager 代表物管理器
   * @param {Object} hooks 回调钩子
   * @param {Function} hooks.onProximityChange 进入/离开交互范围时调用，参数为代表物数据或 null
   */
  constructor(astronaut, exhibitManager, hooks = {}) {
    this.astronaut = astronaut;
    this.exhibitManager = exhibitManager;
    this.onProximityChange = hooks.onProximityChange || (() => {});

    /** 当前处于交互范围内的最近代表物记录（或 null） */
    this.current = null;
    /** 当前距离（供 HUD 等展示） */
    this.currentDistance = Infinity;
  }

  /** 每帧更新距离检测 */
  update() {
    let nearest = null;
    let nearestDist = Infinity;

    for (const rec of this.exhibitManager.records.values()) {
      const d = this.astronaut.group.position.distanceTo(rec.root.position);
      const limit = rec.data.interaction_distance ?? 12.0;
      if (d < limit && d < nearestDist) {
        nearest = rec;
        nearestDist = d;
      }
    }

    const newId = nearest ? nearest.data.id : null;
    const oldId = this.current ? this.current.data.id : null;

    if (newId !== oldId) {
      this.current = nearest;
      this.currentDistance = nearestDist;
      // 代表物高亮（发光增强 + 标签放大）
      this.exhibitManager.setHighlight(newId);
      // 通知 HUD / 相机等外部系统
      this.onProximityChange(nearest ? nearest.data : null);
    } else if (nearest) {
      this.currentDistance = nearestDist;
    }
  }

  /** 强制清除当前交互状态（打开面板 / 数据重建时调用） */
  clear() {
    if (this.current) {
      this.current = null;
      this.currentDistance = Infinity;
      this.exhibitManager.setHighlight(null);
      this.onProximityChange(null);
    }
  }
}

export default InteractionSystem;
