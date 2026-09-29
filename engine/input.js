// Teclado e botões. GetKey fica pressionado. GetKeyDown só no quadro em que começou.

(function (root) {
  const Salto = root.Salto || (root.Salto = {});
  const held = new Set();
  const pressed = new Set();
  const released = new Set();
  const axes = {
    Horizontal: ["ArrowRight", "KeyD", "right", "ArrowLeft", "KeyA", "left"],
    Vertical: ["ArrowUp", "KeyW", "jump", "Space", "ArrowDown", "KeyS"],
  };

  function allowed(event) {
    if (typeof Salto.Input.gate === "function") return Salto.Input.gate(event);
    const tag = event.target && event.target.tagName;
    return tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA" && tag !== "BUTTON";
  }

  const Input = {
    held,
    gate: null,
    getKey(code) {
      return held.has(code);
    },
    getKeyDown(code) {
      return pressed.has(code);
    },
    getKeyUp(code) {
      return released.has(code);
    },
    getAxis(name) {
      const pair = axes[name];
      if (!pair) return 0;
      const positive = pair.slice(0, pair.length / 2).some((code) => held.has(code));
      const negative = pair.slice(pair.length / 2).some((code) => held.has(code));
      return (positive ? 1 : 0) - (negative ? 1 : 0);
    },
    setHeld(code, down) {
      if (down) {
        if (!held.has(code)) pressed.add(code);
        held.add(code);
        return;
      }
      if (held.has(code)) released.add(code);
      held.delete(code);
    },
    clear() {
      held.clear();
      pressed.clear();
      released.clear();
    },
    _endFrame() {
      pressed.clear();
      released.clear();
    },
  };

  root.addEventListener("keydown", (event) => {
    const scroll = ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    if (scroll.includes(event.code) && allowed(event)) event.preventDefault();
    if (event.repeat || !allowed(event)) return;
    Input.setHeld(event.code, true);
  });

  root.addEventListener("keyup", (event) => {
    if (!allowed(event) && !held.has(event.code)) return;
    Input.setHeld(event.code, false);
  });

  root.addEventListener("blur", () => Input.clear());

  Salto.Input = Input;
})(window);
