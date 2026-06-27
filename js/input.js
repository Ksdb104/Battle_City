/* =========================================================
 * 输入系统：键盘 + 手柄（Gamepad API）+ 移动端虚拟手柄
 *
 * 三套键盘方案 + 手柄 + 触屏，共 6 类设备：
 *   kbA  — WASD + 空格开炮 + Enter（开始）
 *   kbB  — 方向键 + 小键盘 1 开炮 + 小键盘 2（开始）
 *   kbC  — IJKL + U 开炮 + O（开始）
 *   gp0~gp3 — 手柄（按浏览器索引）
 *   touch — 移动端虚拟手柄
 *
 * 设备绑定由 Game 层控制：先按开始的设备为 P1，
 * 之后其他设备按开始加入为 P2
 * =======================================================*/

const Input = (function () {

  /* ========== 设备状态 ========== */

  // 键盘方案 A：WASD + 空格 + Enter
  const kbA = { dirStack: [], fire: false };
  // 键盘方案 B：方向键 + 小键盘 1（开炮）+ 小键盘 2（开始）
  const kbB = { dirStack: [], fire: false };
  // 键盘方案 C：IJKL + U（开炮）+ O（开始）
  const kbC = { dirStack: [], fire: false };

  const MOVE_KEYS_A = {
    KeyW: DIR.UP,
    KeyD: DIR.RIGHT,
    KeyS: DIR.DOWN,
    KeyA: DIR.LEFT,
  };

  const MOVE_KEYS_B = {
    ArrowUp: DIR.UP,
    ArrowRight: DIR.RIGHT,
    ArrowDown: DIR.DOWN,
    ArrowLeft: DIR.LEFT,
  };

  const MOVE_KEYS_C = {
    KeyI: DIR.UP,
    KeyL: DIR.RIGHT,
    KeyK: DIR.DOWN,
    KeyJ: DIR.LEFT,
  };

  // 手柄状态数组（最多 4 个）
  const gamepads = [
    { dir: null, fire: false, prevButtons: [] },
    { dir: null, fire: false, prevButtons: [] },
    { dir: null, fire: false, prevButtons: [] },
    { dir: null, fire: false, prevButtons: [] },
  ];

  // 触屏虚拟手柄
  const touch = { dir: null, fire: false };

  // 远程虚拟设备（网络对端输入）
  const remote = { dir: null, fire: false };

  // 事件队列：{ name: "start"|"pause", device: string }
  const events = [];

  /* ========== 设备绑定 ========== */
  let p1Device = null;
  let p2Device = null;

  /* ========== 键盘 ========== */

  function onKeyDown(e) {
    // 方案 C 方向（IJKL）
    if (MOVE_KEYS_C.hasOwnProperty(e.code)) {
      const d = MOVE_KEYS_C[e.code];
      if (!kbC.dirStack.includes(d)) kbC.dirStack.push(d);
      e.preventDefault();
      return;
    }
    // 方案 B 方向（方向键）
    if (MOVE_KEYS_B.hasOwnProperty(e.code)) {
      const d = MOVE_KEYS_B[e.code];
      if (!kbB.dirStack.includes(d)) kbB.dirStack.push(d);
      e.preventDefault();
      return;
    }
    // 方案 A 方向（WASD）
    if (MOVE_KEYS_A.hasOwnProperty(e.code)) {
      const d = MOVE_KEYS_A[e.code];
      if (!kbA.dirStack.includes(d)) kbA.dirStack.push(d);
      e.preventDefault();
      return;
    }

    switch (e.code) {
      // 方案 A 开火：空格
      case "Space":
        kbA.fire = true;
        e.preventDefault();
        break;
      // 方案 B 开火：小键盘 1
      case "Numpad1":
        kbB.fire = true;
        e.preventDefault();
        break;
      // 方案 C 开火：U
      case "KeyU":
        kbC.fire = true;
        e.preventDefault();
        break;
      // 方案 A 开始：Enter
      case "Enter":
        events.push({ name: "start", device: "kbA" });
        break;
      // 方案 B 开始：小键盘 2
      case "Numpad2":
        events.push({ name: "start", device: "kbB" });
        break;
      // 方案 C 开始：O
      case "KeyO":
        events.push({ name: "start", device: "kbC" });
        break;
      // 暂停：P（全局）
      case "KeyP":
        events.push({ name: "pause", device: "kbA" });
        break;
    }
  }

  function onKeyUp(e) {
    if (MOVE_KEYS_C.hasOwnProperty(e.code)) {
      const d = MOVE_KEYS_C[e.code];
      const i = kbC.dirStack.indexOf(d);
      if (i >= 0) kbC.dirStack.splice(i, 1);
      return;
    }
    if (MOVE_KEYS_B.hasOwnProperty(e.code)) {
      const d = MOVE_KEYS_B[e.code];
      const i = kbB.dirStack.indexOf(d);
      if (i >= 0) kbB.dirStack.splice(i, 1);
      return;
    }
    if (MOVE_KEYS_A.hasOwnProperty(e.code)) {
      const d = MOVE_KEYS_A[e.code];
      const i = kbA.dirStack.indexOf(d);
      if (i >= 0) kbA.dirStack.splice(i, 1);
      return;
    }
    if (e.code === "Space") kbA.fire = false;
    if (e.code === "Numpad1") kbB.fire = false;
    if (e.code === "KeyU") kbC.fire = false;
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  /* ========== 手柄（Gamepad API） ========== */

  const GP_DEADZONE = 0.4;

  function pollGamepads() {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      const gp = gps[i] || null;
      const gs = gamepads[i];
      const prev = gs.prevButtons;

      if (!gp) {
        gs.dir = null;
        gs.fire = false;
        gs.prevButtons = [];
        continue;
      }

      // 方向
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      let dir = null;
      if (Math.abs(ax) > Math.abs(ay)) {
        if (ax < -GP_DEADZONE) dir = DIR.LEFT;
        else if (ax > GP_DEADZONE) dir = DIR.RIGHT;
      } else {
        if (ay < -GP_DEADZONE) dir = DIR.UP;
        else if (ay > GP_DEADZONE) dir = DIR.DOWN;
      }
      if (gp.buttons[12] && gp.buttons[12].pressed) dir = DIR.UP;
      if (gp.buttons[13] && gp.buttons[13].pressed) dir = DIR.DOWN;
      if (gp.buttons[14] && gp.buttons[14].pressed) dir = DIR.LEFT;
      if (gp.buttons[15] && gp.buttons[15].pressed) dir = DIR.RIGHT;
      gs.dir = dir;

      // 开火：A(0) / R1(5) / R2(7)
      gs.fire = !!(
        (gp.buttons[0] && gp.buttons[0].pressed) ||
        (gp.buttons[5] && gp.buttons[5].pressed) ||
        (gp.buttons[7] && gp.buttons[7].pressed)
      );

      // 开始键：按钮 9（松开触发）
      const startBtn = gp.buttons[9] ? gp.buttons[9].pressed : false;
      if (startBtn && !prev[9]) {
        events.push({ name: "start", device: "gp" + i });
      }
      // 暂停：选择键(8) / X键(2)（松开触发）
      const selBtn = gp.buttons[8] ? gp.buttons[8].pressed : false;
      if (selBtn && !prev[8]) {
        events.push({ name: "pause", device: "gp" + i });
      }
      const xBtn = gp.buttons[2] ? gp.buttons[2].pressed : false;
      if (xBtn && !prev[2]) {
        events.push({ name: "pause", device: "gp" + i });
      }

      gs.prevButtons = gp.buttons
        ? Array.from(gp.buttons).map((b) => b.pressed)
        : [];
    }
  }

  /* ========== 虚拟手柄（触屏） ========== */

  // 震动反馈：利用 Vibration API，不支持时静默忽略
  function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function initVirtualPad() {
    const container = document.getElementById("virtual-pad");
    if (!container) return;

    const dpad = document.getElementById("vpad-dpad");
    const fireBtn = document.getElementById("vpad-fire");
    const startBtn = document.getElementById("vpad-start");
    const pauseBtn = document.getElementById("vpad-pause");

    let dpadTouchId = null;
    let lastDpadDir = null; // 用于方向切换时触发震动
    const dpadRect = () => dpad.getBoundingClientRect();

    function getDirFromTouch(tx, ty) {
      const r = dpadRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = tx - cx;
      const dy = ty - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < r.width * 0.12) return null;
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx < 0 ? DIR.LEFT : DIR.RIGHT;
      } else {
        return dy < 0 ? DIR.UP : DIR.DOWN;
      }
    }

    dpad.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      dpadTouchId = t.identifier;
      const dir = getDirFromTouch(t.clientX, t.clientY);
      touch.dir = dir;
      if (dir !== null) {
        lastDpadDir = dir;
        vibrate(12); // 轻触反馈
      }
    }, { passive: false });

    dpad.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === dpadTouchId) {
          const dir = getDirFromTouch(t.clientX, t.clientY);
          touch.dir = dir;
          // 方向变化时给一个短震动
          if (dir !== null && dir !== lastDpadDir) {
            lastDpadDir = dir;
            vibrate(8);
          }
          break;
        }
      }
    }, { passive: false });

    const clearDpad = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === dpadTouchId) {
          touch.dir = null;
          dpadTouchId = null;
          lastDpadDir = null;
          break;
        }
      }
    };
    dpad.addEventListener("touchend", clearDpad);
    dpad.addEventListener("touchcancel", clearDpad);

    fireBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      touch.fire = true;
      vibrate(20); // 开炮反馈，稍强
    }, { passive: false });
    fireBtn.addEventListener("touchend", () => { touch.fire = false; });
    fireBtn.addEventListener("touchcancel", () => { touch.fire = false; });

    startBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      events.push({ name: "start", device: "touch" });
      vibrate(15);
    }, { passive: false });

    pauseBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      events.push({ name: "pause", device: "touch" });
      vibrate(15);
    }, { passive: false });

    // 横屏切换按钮
    const landscapeBtn = document.getElementById("vpad-landscape");
    if (landscapeBtn) {
      landscapeBtn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        const body = document.body;
        body.classList.toggle("landscape");
        // 尝试请求全屏 + 横屏锁定
        if (body.classList.contains("landscape")) {
          const el = document.documentElement;
          if (el.requestFullscreen) {
            el.requestFullscreen().then(() => {
              if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock("landscape").catch(() => {});
              }
            }).catch(() => {});
          } else if (el.webkitRequestFullscreen) {
            el.webkitRequestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
          if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
          }
        }
      }, { passive: false });
    }
  }

  /* ========== 内部：根据设备 ID 获取输入状态 ========== */

  function _getDeviceDir(device) {
    if (!device) return null;
    if (device === "remote") return remote.dir;
    if (device === "kbA") return kbA.dirStack.length ? kbA.dirStack[kbA.dirStack.length - 1] : null;
    if (device === "kbB") return kbB.dirStack.length ? kbB.dirStack[kbB.dirStack.length - 1] : null;
    if (device === "kbC") return kbC.dirStack.length ? kbC.dirStack[kbC.dirStack.length - 1] : null;
    if (device === "touch") return touch.dir;
    if (device.startsWith("gp")) {
      const idx = parseInt(device.substring(2), 10);
      return gamepads[idx] ? gamepads[idx].dir : null;
    }
    return null;
  }

  function _getDeviceFire(device) {
    if (!device) return false;
    if (device === "remote") return remote.fire;
    if (device === "kbA") return kbA.fire;
    if (device === "kbB") return kbB.fire;
    if (device === "kbC") return kbC.fire;
    if (device === "touch") return touch.fire;
    if (device.startsWith("gp")) {
      const idx = parseInt(device.substring(2), 10);
      return gamepads[idx] ? gamepads[idx].fire : false;
    }
    return false;
  }

  /* ========== 公共接口 ========== */

  return {
    poll() {
      pollGamepads();
    },

    /* --- 设备绑定管理 --- */
    bindP1(device) { p1Device = device; },
    bindP2(device) { p2Device = device; },
    getP1Device() { return p1Device; },
    getP2Device() { return p2Device; },
    clearBindings() { p1Device = null; p2Device = null; },

    /* --- P1 输入 --- */
    getDirection() {
      return _getDeviceDir(p1Device);
    },
    isFire() {
      return _getDeviceFire(p1Device);
    },

    /* --- P2 输入 --- */
    getDirection2() {
      return _getDeviceDir(p2Device);
    },
    isFire2() {
      return _getDeviceFire(p2Device);
    },

    /* --- 标题菜单用：任意设备的方向 --- */
    getAnyDirection() {
      if (kbA.dirStack.length) return kbA.dirStack[kbA.dirStack.length - 1];
      if (kbB.dirStack.length) return kbB.dirStack[kbB.dirStack.length - 1];
      if (kbC.dirStack.length) return kbC.dirStack[kbC.dirStack.length - 1];
      if (touch.dir !== null) return touch.dir;
      for (let i = 0; i < 4; i++) {
        if (gamepads[i].dir !== null) return gamepads[i].dir;
      }
      return null;
    },

    /* --- 事件消费 --- */
    consumeEvent(name) {
      for (let i = 0; i < events.length; i++) {
        if (events[i].name === name) {
          const evt = events[i];
          events.splice(i, 1);
          return evt;
        }
      }
      return null;
    },

    consumeAllEvents(name) {
      const result = [];
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].name === name) {
          result.push(events[i]);
          events.splice(i, 1);
        }
      }
      return result;
    },

    flushEvents() {
      events.length = 0;
    },

    reset() {
      kbA.dirStack.length = 0;
      kbA.fire = false;
      kbB.dirStack.length = 0;
      kbB.fire = false;
      kbC.dirStack.length = 0;
      kbC.fire = false;
      events.length = 0;
    },

    initVirtualPad,

    /* --- 远程输入注入（由 InputBridge 调用） --- */
    setRemoteInput(dir, fire) {
      remote.dir = dir;
      remote.fire = fire;
    },
  };
})();
