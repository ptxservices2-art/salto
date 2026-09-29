// Tela do motor. Desenha na resolução da janela e separa mundo e interface.

(function (root) {
  const Salto = root.Salto || (root.Salto = {});

  function create(canvas, options) {
    const viewW = options.width;
    const viewH = options.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    const camera = { x: 0, y: 0, zoom: options.zoom || 1, shake: 0 };
    let jitterX = 0;
    let jitterY = 0;

    function resize() {
      const dpr = Math.min(root.devicePixelRatio || 1, 2);
      const cover = Math.max(root.innerWidth / viewW, root.innerHeight / viewH);
      const cssW = Math.max(1, Math.round(viewW * cover));
      const cssH = Math.max(1, Math.round(viewH * cover));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      let bufferW = Math.round(cssW * dpr);
      let bufferH = Math.round(cssH * dpr);
      const maxEdge = 4096;
      const limit = Math.min(1, maxEdge / Math.max(bufferW, bufferH));
      canvas.width = Math.max(1, Math.round(bufferW * limit));
      canvas.height = Math.max(1, Math.round(bufferH * limit));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }

    function visibleFrame() {
      const scale = Math.max(root.innerWidth / viewW, root.innerHeight / viewH);
      const cropX = Math.max(0, (viewW - root.innerWidth / scale) / 2);
      const cropY = Math.max(0, (viewH - root.innerHeight / scale) / 2);
      return { left: cropX, top: cropY, right: viewW - cropX, bottom: viewH - cropY };
    }

    function applyView() {
      const scale = canvas.width / viewW;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.translate(jitterX, jitterY);
    }

    function begin() {
      jitterX = camera.shake > 0 ? (Math.random() - 0.5) * camera.shake : 0;
      jitterY = camera.shake > 0 ? (Math.random() - 0.5) * camera.shake : 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function end() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function screen(draw) {
      ctx.save();
      applyView();
      draw();
      ctx.restore();
    }

    function world(draw) {
      ctx.save();
      applyView();
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-Math.round(camera.x), -Math.round(camera.y));
      draw();
      ctx.restore();
    }

    function roundRect(x, y, w, h, r) {
      const radius = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    }

    function text(str, x, y, size, color, align, weight) {
      ctx.fillStyle = color;
      ctx.font = `${weight || 700} ${size}px "Segoe UI", sans-serif`;
      ctx.textAlign = align || "center";
      ctx.textBaseline = "middle";
      ctx.fillText(str, x, y);
    }

    function textShadow(str, x, y, size, color, align) {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      text(str, x, y, size, color, align, 700);
      ctx.restore();
    }

    return {
      canvas,
      ctx,
      camera,
      viewW,
      viewH,
      resize,
      visibleFrame,
      begin,
      end,
      screen,
      world,
      roundRect,
      text,
      textShadow,
    };
  }

  Salto.Graphics = { create };
})(window);
