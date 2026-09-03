// WormholeEditor.classic.js —— 虫洞调节面板
(function () {

class WormholeEditor {
  /**
   * @param {Object} environment SpaceEnvironment 实例
   * @param {Object} astronautCtrl AstronautController 实例
   */
  constructor(environment, astronautCtrl) {
    this.env = environment;
    this.astronaut = astronautCtrl;
    this.isOpen = false;

    // 默认值
    this.defaults = {
      posX: 0, posY: 0, posZ: environment?.wormholeCenterZ ?? -815,
      rotX: 90, rotY: 0, rotZ: 0,
      scaleX: 1, scaleY: 1, scaleZ: 1,
      radius: environment?.wormholeRadius ?? 28,
    };

    // DOM 引用
    this.panel = document.getElementById('wormhole-editor');
    this.closeBtn = document.getElementById('wormhole-close-btn');
    this.resetBtn = document.getElementById('wh-reset-btn');

    // 滑块引用
    this.sliders = {
      posX: document.getElementById('wh-pos-x'),
      posY: document.getElementById('wh-pos-y'),
      posZ: document.getElementById('wh-pos-z'),
      rotX: document.getElementById('wh-rot-x'),
      rotY: document.getElementById('wh-rot-y'),
      rotZ: document.getElementById('wh-rot-z'),
      scale: document.getElementById('wh-scale'),
      scaleX: document.getElementById('wh-scale-x'),
      scaleY: document.getElementById('wh-scale-y'),
      scaleZ: document.getElementById('wh-scale-z'),
      radius: document.getElementById('wh-radius'),
    };

    // 数值显示引用
    this.values = {
      posX: document.getElementById('wh-pos-x-val'),
      posY: document.getElementById('wh-pos-y-val'),
      posZ: document.getElementById('wh-pos-z-val'),
      rotX: document.getElementById('wh-rot-x-val'),
      rotY: document.getElementById('wh-rot-y-val'),
      rotZ: document.getElementById('wh-rot-z-val'),
      scale: document.getElementById('wh-scale-val'),
      scaleX: document.getElementById('wh-scale-x-val'),
      scaleY: document.getElementById('wh-scale-y-val'),
      scaleZ: document.getElementById('wh-scale-z-val'),
      radius: document.getElementById('wh-radius-val'),
    };

    // 编辑器初始值与实际虫洞半径保持一致，避免第一次调节时把飞行边界放大到墙外。
    this.sliders.radius.value = this.defaults.radius;
    this.values.radius.textContent = Math.round(this.defaults.radius);

    this._bindEvents();
  }

  _bindEvents() {
    // 关闭按钮
    this.closeBtn.addEventListener('click', () => this.close());

    // 重置按钮
    this.resetBtn.addEventListener('click', () => this.reset());

    // 滑块事件
    Object.keys(this.sliders).forEach((key) => {
      const slider = this.sliders[key];
      slider.addEventListener('input', () => this._onSliderChange(key));
    });
  }

  _onSliderChange(key) {
    const value = parseFloat(this.sliders[key].value);
    this._updateValue(key, value);
    this._applyToTunnel();
  }

  _updateValue(key, value) {
    if (key === 'scale') {
      // 统一缩放
      this.values.scale.textContent = value.toFixed(2);
      this.sliders.scaleX.value = value;
      this.sliders.scaleY.value = value;
      this.sliders.scaleZ.value = value;
      this.values.scaleX.textContent = value.toFixed(2);
      this.values.scaleY.textContent = value.toFixed(2);
      this.values.scaleZ.textContent = value.toFixed(2);
    } else if (key.startsWith('scale')) {
      this.values[key].textContent = value.toFixed(2);
    } else if (key === 'radius') {
      this.values[key].textContent = Math.round(value);
    } else {
      this.values[key].textContent = Math.round(value);
    }
  }

  _applyToTunnel() {
    if (!this.env || !this.env.wormholeTunnel) return;

    const tunnel = this.env.wormholeTunnel;
    const sphere = this.env.wormholeSphere;
    const ring = this.env.entranceRing;

    // 位置
    const posX = parseFloat(this.sliders.posX.value);
    const posY = parseFloat(this.sliders.posY.value);
    const posZ = parseFloat(this.sliders.posZ.value);
    tunnel.position.set(posX, posY, posZ);

    // 旋转（角度转弧度）
    const rotX = parseFloat(this.sliders.rotX.value) * Math.PI / 180;
    const rotY = parseFloat(this.sliders.rotY.value) * Math.PI / 180;
    const rotZ = parseFloat(this.sliders.rotZ.value) * Math.PI / 180;
    tunnel.rotation.set(rotX, rotY, rotZ);

    // 缩放
    const scaleX = parseFloat(this.sliders.scaleX.value);
    const scaleY = parseFloat(this.sliders.scaleY.value);
    const scaleZ = parseFloat(this.sliders.scaleZ.value);
    tunnel.scale.set(scaleX, scaleY, scaleZ);

    const halfLength = this.env.wormholeHalfLength || 845;
    const nearZ = posZ + halfLength * scaleZ;
    const farZ = posZ - halfLength * scaleZ;

    // 终点极光入口固定在最后一个飞行器之后，不跟随长背景隧道的近端移动。
    if (sphere) {
      sphere.position.set(posX, posY, this.env.portalZ);
    }
    if (ring) {
      ring.position.set(posX, posY, this.env.portalZ - 0.6);
    }

    this.env.routeStartZ = nearZ;
    this.env.routeEndZ = farZ;

    // 更新宇航员边界约束
    if (this.astronaut) {
      const radius = parseFloat(this.sliders.radius.value);
      this.astronaut.tunnelRadius = radius - 4; // 留 4 单位缓冲
      this.astronaut.tunnelZMin = farZ + 35;
      this.astronaut.tunnelZMax = nearZ - 5;
    }
  }

  /** 打开面板 */
  open() {
    this.isOpen = true;
    this.panel.classList.remove('hidden');
    this._syncFromTunnel();
  }

  /** 关闭面板 */
  close() {
    this.isOpen = false;
    this.panel.classList.add('hidden');
  }

  /** 切换面板 */
  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** 从隧道同步当前值到滑块 */
  _syncFromTunnel() {
    if (!this.env || !this.env.wormholeTunnel) return;

    const tunnel = this.env.wormholeTunnel;

    // 位置
    this.sliders.posX.value = tunnel.position.x;
    this.sliders.posY.value = tunnel.position.y;
    this.sliders.posZ.value = tunnel.position.z;
    this.values.posX.textContent = Math.round(tunnel.position.x);
    this.values.posY.textContent = Math.round(tunnel.position.y);
    this.values.posZ.textContent = Math.round(tunnel.position.z);

    // 旋转（弧度转角度）
    this.sliders.rotX.value = (tunnel.rotation.x * 180 / Math.PI) % 360;
    this.sliders.rotY.value = (tunnel.rotation.y * 180 / Math.PI) % 360;
    this.sliders.rotZ.value = (tunnel.rotation.z * 180 / Math.PI) % 360;
    this.values.rotX.textContent = Math.round(this.sliders.rotX.value);
    this.values.rotY.textContent = Math.round(this.sliders.rotY.value);
    this.values.rotZ.textContent = Math.round(this.sliders.rotZ.value);

    // 缩放
    this.sliders.scaleX.value = tunnel.scale.x;
    this.sliders.scaleY.value = tunnel.scale.y;
    this.sliders.scaleZ.value = tunnel.scale.z;
    this.sliders.scale.value = (tunnel.scale.x + tunnel.scale.y + tunnel.scale.z) / 3;
    this.values.scaleX.textContent = tunnel.scale.x.toFixed(2);
    this.values.scaleY.textContent = tunnel.scale.y.toFixed(2);
    this.values.scaleZ.textContent = tunnel.scale.z.toFixed(2);
    this.values.scale.textContent = this.sliders.scale.value.toFixed(2);
  }

  /** 重置到默认值 */
  reset() {
    Object.keys(this.defaults).forEach((key) => {
      if (this.sliders[key]) {
        this.sliders[key].value = this.defaults[key];
        this._updateValue(key, this.defaults[key]);
      }
    });
    this._applyToTunnel();
  }
}

XINGTU.WormholeEditor = WormholeEditor;

})();
