// TransformControls.classic.js —— 简化版 TransformControls（适配 file:// 协议）
// 基于 Three.js r160，支持 translate/rotate/scale 三种模式
(function () {

const {
  Group, Mesh, Line, Vector3, Quaternion, Matrix4, Euler,
  Raycaster, Plane, Color, DoubleSide, AdditiveBlending,
  CylinderGeometry, SphereGeometry, BoxGeometry, TorusGeometry, PlaneGeometry,
  MeshBasicMaterial, LineBasicMaterial,
} = THREE;

class TransformControls extends Group {
  constructor(camera, domElement) {
    super();

    console.log('[TransformControls] 初始化开始');

    this.camera = camera;
    this.domElement = domElement;

    this.enabled = true;
    this.axis = null;
    this.mode = 'translate'; // 'translate' | 'rotate' | 'scale'

    this._object = null;
    this._dragging = false;
    this._point = new Vector3();
    this._offset = new Vector3();
    this._start = new Vector3();
    this._parentInv = new Matrix4();
    this._raycaster = new Raycaster();
    this._plane = new Plane();
    this._mouse = { x: 0, y: 0 };
    this._listeners = {};

    // 默认隐藏，只有 attach() 时才显示
    this.visible = false;

    // 存储各轴 handle 引用
    this._handles = {};
    // 存储所有 handle 的根 Group
    this._handleRoot = new Group();
    this._handleRoot.name = 'handleRoot';
    this._handleRoot.visible = false;
    this.add(this._handleRoot);

    // 绑定事件
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);

    // 构建初始 gizmo
    this._buildGizmo();
  }

  /** 构建 Gizmo */
  _buildGizmo() {
    // 清空
    this._handleRoot.clear();
    this._handles = {};

    if (this.mode === 'translate') {
      this._buildTranslateGizmo();
    } else if (this.mode === 'rotate') {
      this._buildRotateGizmo();
    } else if (this.mode === 'scale') {
      this._buildScaleGizmo();
    }
  }

  /** 移动模式：箭头 */
  _buildTranslateGizmo() {
    const arrowLen = 1.0;
    const arrowRad = 0.03;
    const coneRad = 0.08;
    const coneLen = 0.2;

    // X 轴 - 红色
    const xMat = new MeshBasicMaterial({ color: 0xff4444, depthTest: false, transparent: true, opacity: 0.9 });
    const xShaft = new Mesh(new CylinderGeometry(arrowRad, arrowRad, arrowLen, 8), xMat);
    xShaft.position.set(arrowLen / 2, 0, 0);
    xShaft.rotation.z = -Math.PI / 2;
    const xCone = new Mesh(new CylinderGeometry(0, coneRad, coneLen, 8), xMat);
    xCone.position.set(arrowLen + coneLen / 2, 0, 0);
    xCone.rotation.z = -Math.PI / 2;
    const xGroup = new Group();
    xGroup.add(xShaft, xCone);
    xGroup.userData = { axis: 'X' };
    this._handleRoot.add(xGroup);
    this._handles['X'] = xGroup;

    // Y 轴 - 绿色
    const yMat = new MeshBasicMaterial({ color: 0x44ff44, depthTest: false, transparent: true, opacity: 0.9 });
    const yShaft = new Mesh(new CylinderGeometry(arrowRad, arrowRad, arrowLen, 8), yMat);
    yShaft.position.set(0, arrowLen / 2, 0);
    const yCone = new Mesh(new CylinderGeometry(0, coneRad, coneLen, 8), yMat);
    yCone.position.set(0, arrowLen + coneLen / 2, 0);
    const yGroup = new Group();
    yGroup.add(yShaft, yCone);
    yGroup.userData = { axis: 'Y' };
    this._handleRoot.add(yGroup);
    this._handles['Y'] = yGroup;

    // Z 轴 - 蓝色
    const zMat = new MeshBasicMaterial({ color: 0x4488ff, depthTest: false, transparent: true, opacity: 0.9 });
    const zShaft = new Mesh(new CylinderGeometry(arrowRad, arrowRad, arrowLen, 8), zMat);
    zShaft.position.set(0, 0, arrowLen / 2);
    zShaft.rotation.x = Math.PI / 2;
    const zCone = new Mesh(new CylinderGeometry(0, coneRad, coneLen, 8), zMat);
    zCone.position.set(0, 0, arrowLen + coneLen / 2);
    zCone.rotation.x = Math.PI / 2;
    const zGroup = new Group();
    zGroup.add(zShaft, zCone);
    zGroup.userData = { axis: 'Z' };
    this._handleRoot.add(zGroup);
    this._handles['Z'] = zGroup;

    // 中心球 - 黄色（整体移动）
    const centerMat = new MeshBasicMaterial({ color: 0xffdd44, depthTest: false, transparent: true, opacity: 0.6 });
    const center = new Mesh(new SphereGeometry(0.15, 16, 16), centerMat);
    center.userData = { axis: 'XYZ' };
    this._handleRoot.add(center);
    this._handles['XYZ'] = center;
  }

  /** 旋转模式：圆环 */
  _buildRotateGizmo() {
    const ringRadius = 0.9;
    const tubeRadius = 0.025;

    // X 轴 - 红色圆环
    const xMat = new MeshBasicMaterial({ color: 0xff4444, depthTest: false, transparent: true, opacity: 0.9 });
    const xRing = new Mesh(new TorusGeometry(ringRadius, tubeRadius, 8, 32), xMat);
    xRing.rotation.y = Math.PI / 2; // 圆环在 YZ 平面
    xRing.userData = { axis: 'X' };
    this._handleRoot.add(xRing);
    this._handles['X'] = xRing;

    // Y 轴 - 绿色圆环
    const yMat = new MeshBasicMaterial({ color: 0x44ff44, depthTest: false, transparent: true, opacity: 0.9 });
    const yRing = new Mesh(new TorusGeometry(ringRadius, tubeRadius, 8, 32), yMat);
    yRing.rotation.x = Math.PI / 2; // 圆环在 XZ 平面
    yRing.userData = { axis: 'Y' };
    this._handleRoot.add(yRing);
    this._handles['Y'] = yRing;

    // Z 轴 - 蓝色圆环
    const zMat = new MeshBasicMaterial({ color: 0x4488ff, depthTest: false, transparent: true, opacity: 0.9 });
    const zRing = new Mesh(new TorusGeometry(ringRadius, tubeRadius, 8, 32), zMat);
    zRing.rotation.z = Math.PI / 2; // 圆环在 XY 平面 -> 需要调整
    // TorusGeometry 默认在 XY 平面，不需要旋转就能看到 Z 轴旋转
    zRing.userData = { axis: 'Z' };
    this._handleRoot.add(zRing);
    this._handles['Z'] = zRing;

    // 中心球
    const centerMat = new MeshBasicMaterial({ color: 0xffdd44, depthTest: false, transparent: true, opacity: 0.5 });
    const center = new Mesh(new SphereGeometry(0.12, 16, 16), centerMat);
    center.userData = { axis: 'XYZ' };
    this._handleRoot.add(center);
    this._handles['XYZ'] = center;
  }

  /** 缩放模式：末端方块 */
  _buildScaleGizmo() {
    const lineLen = 1.0;
    const lineRad = 0.02;
    const cubeSize = 0.12;

    // X 轴 - 红色
    const xMat = new MeshBasicMaterial({ color: 0xff4444, depthTest: false, transparent: true, opacity: 0.9 });
    const xLine = new Mesh(new CylinderGeometry(lineRad, lineRad, lineLen, 6), xMat);
    xLine.position.set(lineLen / 2, 0, 0);
    xLine.rotation.z = -Math.PI / 2;
    const xCube = new Mesh(new BoxGeometry(cubeSize, cubeSize, cubeSize), xMat);
    xCube.position.set(lineLen + cubeSize / 2, 0, 0);
    const xGroup = new Group();
    xGroup.add(xLine, xCube);
    xGroup.userData = { axis: 'X' };
    this._handleRoot.add(xGroup);
    this._handles['X'] = xGroup;

    // Y 轴 - 绿色
    const yMat = new MeshBasicMaterial({ color: 0x44ff44, depthTest: false, transparent: true, opacity: 0.9 });
    const yLine = new Mesh(new CylinderGeometry(lineRad, lineRad, lineLen, 6), yMat);
    yLine.position.set(0, lineLen / 2, 0);
    const yCube = new Mesh(new BoxGeometry(cubeSize, cubeSize, cubeSize), yMat);
    yCube.position.set(0, lineLen + cubeSize / 2, 0);
    const yGroup = new Group();
    yGroup.add(yLine, yCube);
    yGroup.userData = { axis: 'Y' };
    this._handleRoot.add(yGroup);
    this._handles['Y'] = yGroup;

    // Z 轴 - 蓝色
    const zMat = new MeshBasicMaterial({ color: 0x4488ff, depthTest: false, transparent: true, opacity: 0.9 });
    const zLine = new Mesh(new CylinderGeometry(lineRad, lineRad, lineLen, 6), zMat);
    zLine.position.set(0, 0, lineLen / 2);
    zLine.rotation.x = Math.PI / 2;
    const zCube = new Mesh(new BoxGeometry(cubeSize, cubeSize, cubeSize), zMat);
    zCube.position.set(0, 0, lineLen + cubeSize / 2);
    const zGroup = new Group();
    zGroup.add(zLine, zCube);
    zGroup.userData = { axis: 'Z' };
    this._handleRoot.add(zGroup);
    this._handles['Z'] = zGroup;

    // 中心球
    const centerMat = new MeshBasicMaterial({ color: 0xffdd44, depthTest: false, transparent: true, opacity: 0.5 });
    const center = new Mesh(new SphereGeometry(0.12, 16, 16), centerMat);
    center.userData = { axis: 'XYZ' };
    this._handleRoot.add(center);
    this._handles['XYZ'] = center;
  }

  /** 更新 Gizmo 显示模式 */
  _updateGizmoMode() {
    this._buildGizmo();
  }

  /** 附加到目标对象 */
  attach(object) {
    this._object = object;
    this.visible = true;
    this._handleRoot.visible = true;
    this._updateGizmoMode();

    // 立即同步位置和缩放，不等下一帧 update()
    this.position.copy(object.position);
    this._updateHandleScale();

    console.log('[TransformControls] 已附加到对象:', object.name || object.userData?.id || '?',
      '位置:', object.position.toArray().map(v => v.toFixed(1)),
      '模式:', this.mode, '可见:', this.visible);
  }

  /** 分离 */
  detach() {
    this._object = null;
    this.visible = false;
    this._handleRoot.visible = false;
    this.axis = null;
  }

  /** 设置模式 */
  setMode(mode) {
    this.mode = mode;
    this._updateGizmoMode();
  }

  /** 设置 gizmo 大小 */
  setSize(s) {
    this._sizeMultiplier = s;
  }

  /** 事件监听 */
  addEventListener(name, callback) {
    if (!this._listeners[name]) this._listeners[name] = [];
    this._listeners[name].push(callback);
  }

  _dispatch(name, data) {
    const list = this._listeners[name];
    if (list) list.forEach(cb => cb(data));
  }

  /** 射线检测 gizmo */
  _intersectGizmo(event) {
    if (!this._object || !this.visible) return null;

    const rect = this.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera({ x, y }, this.camera);

    // 收集所有可点击的 gizmo 子对象
    const targets = [];
    this._handleRoot.traverse(obj => {
      if (obj.isMesh) targets.push(obj);
    });

    const intersects = this._raycaster.intersectObjects(targets, false);
    if (intersects.length > 0) {
      // 找到最近的有 userData.axis 的父级
      let hit = intersects[0].object;
      while (hit && !hit.userData.axis) {
        hit = hit.parent;
      }
      if (hit && hit.userData.axis) {
        return hit.userData.axis;
      }
    }
    return null;
  }

  _onPointerDown(event) {
    if (!this.enabled || !this._object) return;
    if (event.button !== 0) return; // 只响应左键

    const axis = this._intersectGizmo(event);
    if (!axis) return;

    this.axis = axis;
    this._dragging = true;
    this._dispatch('dragging-changed', { value: true });

    // 记录起始位置
    this._getMousePlanePoint(event, this._start);
    this._offset.copy(this._object.position);
    this._startRot = this._object.rotation.clone();
    this._startScale = this._object.scale.clone();

    event.stopPropagation();
    event.preventDefault();
  }

  _onPointerMove(event) {
    if (!this.enabled || !this._dragging || !this._object) return;

    const point = new Vector3();
    this._getMousePlanePoint(event, point);

    const delta = point.clone().sub(this._start);

    // 根据模式和轴应用变换
    if (this.mode === 'translate') {
      this._applyTranslation(delta);
    } else if (this.mode === 'rotate') {
      this._applyRotation(delta);
    } else if (this.mode === 'scale') {
      this._applyScale(delta);
    }

    this._dispatch('objectChange', {});
    event.stopPropagation();
    event.preventDefault();
  }

  _onPointerUp(event) {
    if (this._dragging) {
      this._dragging = false;
      this.axis = null;
      this._dispatch('dragging-changed', { value: false });
    }
  }

  /** 获取鼠标在参考平面上的交点 */
  _getMousePlanePoint(event, target) {
    const rect = this.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera({ x, y }, this.camera);

    // 使用相机朝向构建参考平面
    const camDir = new Vector3();
    this.camera.getWorldDirection(camDir);
    this._plane.setFromNormalAndCoplanarPoint(camDir.negate(), this._object.position);

    this._raycaster.ray.intersectPlane(this._plane, target);
  }

  /** 应用平移 */
  _applyTranslation(delta) {
    if (this.axis === 'XYZ') {
      this._object.position.copy(this._offset).add(delta);
    } else {
      const newPos = this._offset.clone();
      if (this.axis === 'X') newPos.x += delta.x;
      else if (this.axis === 'Y') newPos.y += delta.y;
      else if (this.axis === 'Z') newPos.z += delta.z;
      this._object.position.copy(newPos);
    }
  }

  /** 应用旋转 */
  _applyRotation(delta) {
    const sensitivity = 2.0;
    if (this.axis === 'X') {
      this._object.rotation.x = this._startRot.x + delta.y * sensitivity;
    } else if (this.axis === 'Y') {
      this._object.rotation.y = this._startRot.y + delta.x * sensitivity;
    } else if (this.axis === 'Z') {
      this._object.rotation.z = this._startRot.z + delta.y * sensitivity;
    } else if (this.axis === 'XYZ') {
      this._object.rotation.x = this._startRot.x + delta.y * sensitivity;
      this._object.rotation.y = this._startRot.y + delta.x * sensitivity;
    }
  }

  /** 应用缩放 */
  _applyScale(delta) {
    const factor = 1 + delta.x * 0.5;
    if (this.axis === 'XYZ') {
      const s = Math.max(0.01, this._startScale.x * factor);
      this._object.scale.set(s, s, s);
    } else {
      if (this.axis === 'X') this._object.scale.x = Math.max(0.01, this._startScale.x * factor);
      else if (this.axis === 'Y') this._object.scale.y = Math.max(0.01, this._startScale.y * factor);
      else if (this.axis === 'Z') this._object.scale.z = Math.max(0.01, this._startScale.z * factor);
    }
  }

  /** 根据相机距离计算并设置 gizmo 缩放（有上下限，保证任何距离下都可见） */
  _updateHandleScale() {
    if (!this._object) return;
    const dist = this.camera.position.distanceTo(this._object.position);
    const baseSize = this._sizeMultiplier || 1.0;
    // 原始公式：dist * 0.12 * baseSize，但限制在 [0.3, 2.5] 范围内
    const raw = dist * 0.12 * baseSize;
    const s = Math.max(0.3, Math.min(2.5, raw));
    this._handleRoot.scale.set(s, s, s);
  }

  /** 每帧更新（在渲染循环中调用） */
  update() {
    if (!this._object) return;

    // 跟随目标对象位置
    this.position.copy(this._object.position);

    // 根据距离调整 gizmo 大小（保持屏幕大小恒定，有上下限）
    this._updateHandleScale();

    // 调试日志（仅首次）
    if (!this._logged) {
      const dist = this.camera.position.distanceTo(this._object.position);
      console.log('[TransformControls] 首次更新 - 对象:', this._object.name || this._object.userData?.id,
        '位置:', this._object.position.toArray().map(v => v.toFixed(1)),
        '相机距离:', dist.toFixed(1),
        'gizmo 缩放:', this._handleRoot.scale.x.toFixed(3),
        'gizmo 可见:', this.visible);
      this._logged = true;
    }
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
  }
}

// 挂载到 THREE 命名空间
THREE.TransformControls = TransformControls;

})();
