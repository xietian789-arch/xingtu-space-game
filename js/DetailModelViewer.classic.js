// DetailModelViewer.classic.js —— 详情页右侧交互式 3D 模型预览
(function () {

const THREE = window.THREE;
const XINGTU = window.XINGTU;

class DetailModelViewer {
  constructor() {
    this.mount = document.getElementById('info-model-mount');
    this.status = document.getElementById('info-model-status');
    this.statusText = document.getElementById('info-model-status-text');
    this.visible = false;
    this.ready = false;
    this.dragging = false;
    this.pointer = { x: 0, y: 0 };
    this.loadToken = 0;
    this.frameId = 0;
    this.cameraDistance = 4;
    this.baseDistance = 4;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.addEventListener('xingtu:detail-model-change', (event) => {
      this._handleChange(event.detail || {});
    });
  }

  _ensureScene() {
    if (this.ready) return;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.01, 1000);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    if ('outputEncoding' in this.renderer && THREE.sRGBEncoding) {
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }
    if (THREE.ACESFilmicToneMapping !== undefined) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
    }
    this.renderer.domElement.className = 'info-model-canvas';
    this.renderer.domElement.setAttribute('aria-label', '可旋转的航天器三维模型');
    this.mount.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xe6f8ff, 0x07101d, 2.2);
    const key = new THREE.DirectionalLight(0xf1fbff, 3.4);
    const fill = new THREE.DirectionalLight(0x70bce7, 1.7);
    const rim = new THREE.DirectionalLight(0x9a73d8, 1.35);
    key.position.set(4, 5, 7);
    fill.position.set(-5, 1, 3);
    rim.position.set(2, -3, -5);
    this.scene.add(hemi, key, fill, rim);

    this.renderer.domElement.addEventListener('pointerdown', (event) => this._pointerDown(event));
    this.renderer.domElement.addEventListener('pointermove', (event) => this._pointerMove(event));
    this.renderer.domElement.addEventListener('pointerup', (event) => this._pointerUp(event));
    this.renderer.domElement.addEventListener('pointercancel', (event) => this._pointerUp(event));
    this.renderer.domElement.addEventListener('wheel', (event) => this._wheel(event), { passive: false });

    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => this._resize());
      this.resizeObserver.observe(this.mount);
    } else {
      window.addEventListener('resize', () => this._resize());
    }

    this.ready = true;
    this._resize();
  }

  _handleChange({ data, mount }) {
    if (mount) this.mount = mount;
    const token = ++this.loadToken;

    if (!data) {
      this.visible = false;
      this.dragging = false;
      this.mount.classList.remove('is-loading', 'has-model', 'model-error');
      this._stop();
      return;
    }

    this._ensureScene();
    this.visible = true;
    this._clearModel();
    this.mount.classList.remove('has-model', 'model-error');
    this.mount.classList.add('is-loading');
    this._setStatus('正在载入真实模型');
    this._resize();
    this._start();

    if (!data.model_path) {
      this._showError('该任务暂未配置模型');
      return;
    }

    const modelRequests = [XINGTU.ModelLibrary.clone(data.model_path)];
    if (data.companion_model_path) {
      modelRequests.push(XINGTU.ModelLibrary.clone(data.companion_model_path));
    }

    Promise.all(modelRequests).then((models) => {
      if (token !== this.loadToken || !this.visible) return;
      const model = new THREE.Group();
      model.add(models[0]);
      if (models[1]) {
        models[0].position.x = -0.48;
        models[1].position.set(0.68, -0.34, 0.12);
        models[1].scale.setScalar(0.68);
        model.add(models[1]);
      }
      this._mountModel(model, data);
    }).catch((error) => {
      if (token !== this.loadToken || !this.visible) return;
      console.warn('[DetailModelViewer] 模型加载失败：' + data.model_path, error);
      const fileMode = window.location.protocol === 'file:';
      this._showError(fileMode ? '请用“启动游戏.bat”打开 3D 模型' : '模型载入失败，已显示科普插画');
    });
  }

  _mountModel(model, data) {
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material && 'envMapIntensity' in material) material.envMapIntensity = 0.75;
      });
    });

    this.pivot.add(model);
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) {
      this._showError('模型内容为空，已显示科普插画');
      return;
    }

    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    model.position.sub(center);

    const radius = Math.max(sphere.radius, 0.01);
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    this.baseDistance = (radius / Math.sin(verticalFov / 2)) * 1.14;
    this.cameraDistance = this.baseDistance;
    this.camera.near = Math.max(this.baseDistance / 200, 0.001);
    this.camera.far = Math.max(this.baseDistance * 30, 100);
    this.camera.updateProjectionMatrix();
    this._placeCamera();

    const initialYaw = {
      dongfanghong1: -0.30,
      shenzhou5: -0.42,
      shenzhou7: -0.42,
      tiangong1_shenzhou8: -0.34,
      change3: -0.48,
      tianwen1: -0.36,
      change5: -0.45,
      tianhe: -0.35,
      css_complete: -0.30,
      change6: -0.45,
    };
    this.pivot.rotation.set(-0.08, initialYaw[data.id] || -0.35, 0);
    this.mount.classList.remove('is-loading', 'model-error');
    this.mount.classList.add('has-model');
    this._setStatus('三维模型已载入');
    this._render();
  }

  _clearModel() {
    if (!this.pivot) return;
    while (this.pivot.children.length) this.pivot.remove(this.pivot.children[0]);
  }

  _showError(message) {
    this.mount.classList.remove('is-loading', 'has-model');
    this.mount.classList.add('model-error');
    this._setStatus(message);
    this._clearModel();
    this._render();
  }

  _setStatus(text) {
    if (this.statusText) this.statusText.textContent = text;
  }

  _placeCamera() {
    const distance = this.cameraDistance;
    this.camera.position.set(distance * 0.58, distance * 0.24, distance * 0.78);
    this.camera.position.setLength(distance);
    this.camera.lookAt(0, 0, 0);
  }

  _resize() {
    if (!this.ready) return;
    const width = Math.max(this.mount.clientWidth, 1);
    const height = Math.max(this.mount.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this._render();
  }

  _pointerDown(event) {
    if (!this.mount.classList.contains('has-model')) return;
    this.dragging = true;
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  }

  _pointerMove(event) {
    if (!this.dragging) return;
    const dx = event.clientX - this.pointer.x;
    const dy = event.clientY - this.pointer.y;
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    this.pivot.rotation.y += dx * 0.008;
    this.pivot.rotation.x = THREE.MathUtils.clamp(this.pivot.rotation.x + dy * 0.006, -1.15, 1.15);
    this._render();
  }

  _pointerUp(event) {
    this.dragging = false;
    if (this.renderer && this.renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
  }

  _wheel(event) {
    if (!this.mount.classList.contains('has-model')) return;
    event.preventDefault();
    const factor = Math.exp(event.deltaY * 0.001);
    this.cameraDistance = THREE.MathUtils.clamp(
      this.cameraDistance * factor,
      this.baseDistance * 0.58,
      this.baseDistance * 2.1
    );
    this._placeCamera();
    this._render();
  }

  _start() {
    if (this.frameId) return;
    const tick = () => {
      this.frameId = 0;
      if (!this.visible) return;
      if (!this.dragging && !this.reduceMotion && this.mount.classList.contains('has-model')) {
        this.pivot.rotation.y += 0.0016;
      }
      this._render();
      this.frameId = requestAnimationFrame(tick);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  _stop() {
    if (!this.frameId) return;
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  _render() {
    if (this.ready) this.renderer.render(this.scene, this.camera);
  }
}

XINGTU.DetailModelViewer = DetailModelViewer;
new DetailModelViewer();

})();
