/** Dibuja una textura (imagen ecográfica o sección anatómica) en una región del lienzo. */
import { DoubleSide, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, Texture, WebGLRenderer, Color } from 'three';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class ImageView {
  private scene = new Scene();
  private cam = new OrthographicCamera(0, 1, 0, 1, -1, 1);
  private quad: Mesh;
  private mat: MeshBasicMaterial;
  background = new Color('#000000');

  constructor() {
    this.mat = new MeshBasicMaterial({ side: DoubleSide, toneMapped: false });
    this.quad = new Mesh(new PlaneGeometry(1, 1), this.mat);
    this.scene.add(this.quad);
  }

  /**
   * @param view rectángulo de la vista en píxeles CSS (origen abajo-izquierda del lienzo)
   * @param img rectángulo de la imagen dentro de la vista (origen arriba-izquierda)
   */
  render(r: WebGLRenderer, view: Rect, img: Rect, tex: Texture, flipX = false) {
    this.cam.left = 0;
    this.cam.right = view.w;
    this.cam.top = 0;
    this.cam.bottom = view.h;
    this.cam.updateProjectionMatrix();
    if (this.mat.map !== tex) {
      this.mat.map = tex;
      this.mat.needsUpdate = true;
    }
    this.quad.position.set(img.x + img.w / 2, img.y + img.h / 2, 0);
    this.quad.scale.set(flipX ? -img.w : img.w, img.h, 1);
    r.setViewport(view.x, view.y, view.w, view.h);
    r.setScissor(view.x, view.y, view.w, view.h);
    r.setScissorTest(true);
    r.setClearColor(this.background, 1);
    r.clear(true, true, false);
    r.render(this.scene, this.cam);
  }
}

/** Rectángulo de un elemento en coordenadas del lienzo WebGL (origen abajo-izquierda). */
export function elementRect(el: HTMLElement, canvas: HTMLCanvasElement): Rect | null {
  const r = el.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  if (r.bottom < c.top || r.top > c.bottom || r.right < c.left || r.left > c.right) return null;
  return { x: r.left - c.left, y: c.bottom - r.bottom, w: r.width, h: r.height };
}
