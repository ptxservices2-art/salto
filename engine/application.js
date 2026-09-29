// Loop principal. Atualiza os componentes da cena ativa e depois desenha.

(function (root) {
  const Salto = root.Salto;

  const Application = {
    graphics: null,
    _running: false,
    create(options) {
      this.graphics = Salto.Graphics.create(options.canvas, options);
      this.graphics.resize();
      root.addEventListener("resize", () => {
        if (this.graphics) this.graphics.resize();
      });
      return this;
    },
    run() {
      if (this._running) return;
      this._running = true;
      let last = root.performance.now();
      const loop = (now) => {
        if (!this._running) return;
        const raw = Math.min(0.033, (now - last) / 1000);
        last = now;
        Salto.Time.unscaledDeltaTime = raw;
        Salto.Time.deltaTime = raw * Salto.Time.timeScale;
        Salto.Time.time += Salto.Time.deltaTime;
        Salto.Time.frameCount += 1;
        this._step();
        root.requestAnimationFrame(loop);
      };
      root.requestAnimationFrame(loop);
    },
    _step() {
      const scene = Salto.Scene.active;
      if (!scene || !this.graphics) {
        Salto.Input._endFrame();
        return;
      }
      const list = scene.behaviours();
      for (const component of list) {
        const live = Salto._syncComponent(component);
        if (live && !component._started) {
          component.start();
          component._started = true;
        }
      }
      for (const component of list) {
        if (component._live) component.update();
      }
      for (const component of list) {
        if (component._live) component.lateUpdate();
      }
      const main = Salto.Camera.main;
      if (main) main.bind(this.graphics);
      this.graphics.begin();
      for (const component of list) {
        if (component._live) component.onRender();
      }
      this.graphics.end();
      Salto._flushDestroy();
      Salto.Input._endFrame();
    },
  };

  Salto.Application = Application;
})(window);
