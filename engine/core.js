// Núcleo do motor: objeto, componente, transform, cena e tempo.
// O jogo monta cenas com GameObjects. Cada objeto carrega componentes
// com awake, start, update, lateUpdate e onRender.

(function (root) {
  const Salto = root.Salto || (root.Salto = {});
  let nextId = 1;
  const trash = [];

  class Component {
    constructor() {
      this.gameObject = null;
      this.enabled = true;
      this._awake = false;
      this._live = false;
      this._started = false;
    }

    get transform() {
      return this.gameObject.transform;
    }

    awake() {}
    onEnable() {}
    start() {}
    update() {}
    lateUpdate() {}
    onRender() {}
    onDisable() {}
    onDestroy() {}
  }

  class Behaviour extends Component {}

  class Transform extends Component {
    constructor() {
      super();
      this.localX = 0;
      this.localY = 0;
      this.rotation = 0;
      this.scaleX = 1;
      this.scaleY = 1;
      this._parent = null;
      this._children = [];
    }

    get x() {
      return this._parent ? this._parent.x + this.localX : this.localX;
    }

    set x(value) {
      this.localX = this._parent ? value - this._parent.x : value;
    }

    get y() {
      return this._parent ? this._parent.y + this.localY : this.localY;
    }

    set y(value) {
      this.localY = this._parent ? value - this._parent.y : value;
    }

    get childCount() {
      return this._children.length;
    }

    getChild(index) {
      return this._children[index] || null;
    }

    setParent(parent) {
      if (this._parent === parent) return;
      if (this._parent) {
        const list = this._parent._children;
        const index = list.indexOf(this);
        if (index >= 0) list.splice(index, 1);
      }
      this._parent = parent;
      if (parent) parent._children.push(this);
    }
  }

  class GameObject {
    constructor(name) {
      this.id = nextId++;
      this.name = name || "GameObject";
      this.active = true;
      this.tag = "";
      this.layer = 0;
      this.scene = null;
      this._dead = false;
      this._components = [];
      this.transform = this._attach(new Transform());
    }

    get activeInHierarchy() {
      if (this._dead || !this.active || !this.scene) return false;
      const parent = this.transform._parent;
      return parent ? parent.gameObject.activeInHierarchy : true;
    }

    _attach(component) {
      component.gameObject = this;
      this._components.push(component);
      return component;
    }

    addComponent(Type) {
      const component = new Type();
      if (!(component instanceof Component)) {
        throw new Error("addComponent espera um Component.");
      }
      return this._attach(component);
    }

    getComponent(Type) {
      return this._components.find((component) => component instanceof Type) || null;
    }

    static find(name) {
      const scene = Scene.active;
      return scene ? scene.find(name) : null;
    }

    static findWithTag(tag) {
      const scene = Scene.active;
      return scene ? scene.findWithTag(tag) : null;
    }
  }

  class Scene {
    constructor(name) {
      this.name = name || "Cena";
      this._objects = [];
    }

    add(gameObject) {
      if (gameObject.scene) return gameObject;
      gameObject.scene = this;
      this._objects.push(gameObject);
      return gameObject;
    }

    find(name) {
      return this._objects.find((gameObject) => !gameObject._dead && gameObject.name === name) || null;
    }

    findWithTag(tag) {
      return this._objects.find((gameObject) => !gameObject._dead && gameObject.tag === tag) || null;
    }

    behaviours() {
      const list = [];
      for (const gameObject of this._objects) {
        if (gameObject._dead) continue;
        for (const component of gameObject._components) {
          if (!(component instanceof Behaviour) || component instanceof Transform) continue;
          list.push(component);
        }
      }
      return list;
    }
  }

  Scene.active = null;

  function syncComponent(component) {
    const live = component.enabled && component.gameObject.activeInHierarchy && !component.gameObject._dead;
    if (live && !component._awake) {
      component._awake = true;
      component.awake();
    }
    if (live && !component._live) {
      component._live = true;
      component.onEnable();
    } else if (!live && component._live) {
      component._live = false;
      component.onDisable();
    }
    return live;
  }

  function destroyObject(gameObject) {
    if (!gameObject || gameObject._dead) return;
    gameObject._dead = true;
    gameObject.active = false;
    for (const component of gameObject._components) {
      if (component._live) {
        component._live = false;
        component.onDisable();
      }
      component.onDestroy();
    }
    if (gameObject.scene) {
      const list = gameObject.scene._objects;
      const index = list.indexOf(gameObject);
      if (index >= 0) list.splice(index, 1);
      gameObject.scene = null;
    }
  }

  Salto.Component = Component;
  Salto.Behaviour = Behaviour;
  Salto.Transform = Transform;
  Salto.GameObject = GameObject;
  Salto.Scene = Scene;
  Salto.Object = {
    destroy(target) {
      if (!target || trash.includes(target)) return;
      trash.push(target);
    },
  };
  Salto.Time = {
    time: 0,
    deltaTime: 0,
    unscaledDeltaTime: 0,
    timeScale: 1,
    frameCount: 0,
  };
  Salto._syncComponent = syncComponent;
  Salto._flushDestroy = function flushDestroy() {
    while (trash.length) {
      const target = trash.pop();
      if (target instanceof GameObject) destroyObject(target);
      else if (target instanceof Component && target.gameObject) {
        target.enabled = false;
        syncComponent(target);
        target.onDestroy();
        const list = target.gameObject._components;
        const index = list.indexOf(target);
        if (index >= 0) list.splice(index, 1);
      }
    }
  };
})(window);
