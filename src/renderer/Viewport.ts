import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SceneEnvironment } from "../scene/SceneEnvironment";

// Owns the WebGL renderer, scene, camera and orbit controls.
// Kept framework-free so later milestone systems attach without a Vue dependency.
export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly environment: SceneEnvironment;

  private readonly container: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private frameHandle = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14161a);

    this.camera = new THREE.PerspectiveCamera(
      50,
      this.aspect(),
      0.05,
      500,
    );
    this.camera.position.set(2.4, 2.0, 3.2);
    this.camera.lookAt(0, 0.9, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.9, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.update();

    this.environment = new SceneEnvironment(this.camera);
    this.environment.attach(this.scene);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  private aspect(): number {
    const { clientWidth, clientHeight } = this.container;
    return clientHeight === 0 ? 1 : clientWidth / clientHeight;
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  }

  start(): void {
    const loop = (): void => {
      this.frameHandle = requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop(): void {
    cancelAnimationFrame(this.frameHandle);
  }

  dispose(): void {
    this.stop();
    this.resizeObserver.disconnect();
    this.environment.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
