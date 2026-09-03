// PointerLockControls.js —— 经典脚本版本（适配 file:// 协议）
// 已改写为兼容 three-umd.js (r160)：不依赖 THREE.Controls（r169+ 才有），
// 改用 THREE.EventDispatcher 作为基类。

(function () {
  const { EventDispatcher, Euler, Vector3 } = THREE;

  const _euler = new Euler( 0, 0, 0, 'YXZ' );
  const _vector = new Vector3();

  const _changeEvent = { type: 'change' };
  const _lockEvent = { type: 'lock' };
  const _unlockEvent = { type: 'unlock' };

  const _PI_2 = Math.PI / 2;

  class PointerLockControls extends EventDispatcher {

    constructor( camera, domElement = null ) {

      super();

      this.object = camera;
      this.domElement = domElement;
      this.enabled = true;
      this.isLocked = false;
      this.minPolarAngle = 0;
      this.maxPolarAngle = Math.PI;
      this.pointerSpeed = 1.0;

      this._onMouseMove = onMouseMove.bind( this );
      this._onPointerlockChange = onPointerlockChange.bind( this );
      this._onPointerlockError = onPointerlockError.bind( this );

      if ( this.domElement !== null ) {
        this.connect();
      }

    }

    connect() {
      this.domElement.ownerDocument.addEventListener( 'mousemove', this._onMouseMove );
      this.domElement.ownerDocument.addEventListener( 'pointerlockchange', this._onPointerlockChange );
      this.domElement.ownerDocument.addEventListener( 'pointerlockerror', this._onPointerlockError );
    }

    disconnect() {
      this.domElement.ownerDocument.removeEventListener( 'mousemove', this._onMouseMove );
      this.domElement.ownerDocument.removeEventListener( 'pointerlockchange', this._onPointerlockChange );
      this.domElement.ownerDocument.removeEventListener( 'pointerlockerror', this._onPointerlockError );
    }

    dispose() {
      this.disconnect();
    }

    getObject() {
      return this.object;
    }

    getDirection( v ) {
      return v.set( 0, 0, - 1 ).applyQuaternion( this.object.quaternion );
    }

    moveForward( distance ) {
      if ( this.enabled === false ) return;
      const camera = this.object;
      _vector.setFromMatrixColumn( camera.matrix, 0 );
      _vector.crossVectors( camera.up, _vector );
      camera.position.addScaledVector( _vector, distance );
    }

    moveRight( distance ) {
      if ( this.enabled === false ) return;
      const camera = this.object;
      _vector.setFromMatrixColumn( camera.matrix, 0 );
      camera.position.addScaledVector( _vector, distance );
    }

    lock() {
      this.domElement.requestPointerLock();
    }

    unlock() {
      this.domElement.ownerDocument.exitPointerLock();
    }

  }

  function onMouseMove( event ) {
    if ( this.enabled === false || this.isLocked === false ) return;
    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
    const camera = this.object;
    _euler.setFromQuaternion( camera.quaternion );
    _euler.y -= movementX * 0.002 * this.pointerSpeed;
    _euler.x -= movementY * 0.002 * this.pointerSpeed;
    _euler.x = Math.max( _PI_2 - this.maxPolarAngle, Math.min( _PI_2 - this.minPolarAngle, _euler.x ) );
    camera.quaternion.setFromEuler( _euler );
    this.dispatchEvent( _changeEvent );
  }

  function onPointerlockChange() {
    if ( this.domElement.ownerDocument.pointerLockElement === this.domElement ) {
      this.dispatchEvent( _lockEvent );
      this.isLocked = true;
    } else {
      this.dispatchEvent( _unlockEvent );
      this.isLocked = false;
    }
  }

  function onPointerlockError() {
    console.error( 'THREE.PointerLockControls: Unable to use Pointer Lock API' );
  }

  THREE.PointerLockControls = PointerLockControls;
})();
