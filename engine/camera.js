// Câmera da cena. A principal publica posição, zoom e tremor para o desenho.

(function (root) {
  const Salto = root.Salto;
  const cameras = [];

  class Camera extends Salto.Behaviour {
    constructor() {
      super();
      this.zoom = 1;
      this.depth = 0;
      this.shake = 0;
    }

    onEnable() {
      cameras.push(this);
    }

    onDisable() {
      const index = cameras.indexOf(this);
      if (index >= 0) cameras.splice(index, 1);
    }

    onDestroy() {
      this.onDisable();
    }

    bind(graphics) {
      const step = Salto.Time.unscaledDeltaTime || 0;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - step * 28);
      graphics.camera.x = this.transform.x;
      graphics.camera.y = this.transform.y;
      graphics.camera.zoom = this.zoom;
      graphics.camera.shake = this.shake;
    }

    static get main() {
      let chosen = null;
      for (const camera of cameras) {
        if (!camera.enabled || !camera.gameObject.activeInHierarchy) continue;
        if (!chosen || camera.depth < chosen.depth) chosen = camera;
      }
      return chosen;
    }
  }

  Salto.Camera = Camera;
})(window);
