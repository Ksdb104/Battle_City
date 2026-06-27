/* =========================================================
 * 启动入口：固定步长主循环 + 移动端适配 + 加载进度界面
 * =======================================================*/

(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const game = new Game(canvas);

  // 检查 URL 中的 room 参数（通过分享链接加入的客机）
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get("room");
  if (roomParam && roomParam.trim().length > 0) {
    const roomId = roomParam.trim();
    if (/^[A-Za-z0-9]{6}$/.test(roomId)) {
      // 房间 ID 有效——跳过标题画面，以客机身份进入大厅
      game.state = "lobby";
      game.onlineRole = "guest";
      game.pendingRoomId = roomId;
    } else {
      // 格式无效 — 在大厅显示错误
      game.state = "lobby";
      game.onlineRole = "guest";
      game.lobbyError = "房间ID格式无效";
    }
    // 清理 URL（从地址栏移除 ?room= 参数，不刷新页面）
    window.history.replaceState({}, "", window.location.pathname);
  }

  // 首次交互解锁音频
  window.addEventListener(
    "keydown",
    () => Sound.unlock(),
    { once: true }
  );
  // 移动端触摸也解锁音频
  window.addEventListener(
    "touchstart",
    () => Sound.unlock(),
    { once: true }
  );

  // 移动端检测：仅真正的手机/平板显示虚拟手柄，排除触屏笔记本
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && matchMedia("(pointer: coarse)").matches);
  if (isMobile) {
    document.body.classList.add("mobile");
    Input.initVirtualPad();

    // 监听系统横竖屏切换，自动添加/移除 sys-landscape
    function checkOrientation() {
      if (window.innerWidth > window.innerHeight) {
        document.body.classList.add("sys-landscape");
      } else {
        document.body.classList.remove("sys-landscape");
      }
    }
    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    if (screen.orientation) {
      screen.orientation.addEventListener("change", checkOrientation);
    }
  }
  game.isMobile = isMobile;

  const STEP = 1000 / CONFIG.fps;
  let last = performance.now();
  let acc = 0;

  function loop(now) {
    acc += now - last;
    last = now;
    // 防止页面切换后积累过多
    if (acc > 250) acc = 250;
    while (acc >= STEP) {
      Input.poll(); // 轮询手柄状态
      game.update();
      acc -= STEP;
    }
    game.render();
    requestAnimationFrame(loop);
  }

  /* ===== 加载进度界面 ===== */
  let imgLoaded = 0, imgTotal = 1;
  let audLoaded = 0, audTotal = 1;

  let loadingDone = false;

  function drawLoading() {
    if (loadingDone) return;

    const W = canvas.width;
    const H = canvas.height;

    // 背景
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // 标题
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center";
    ctx.fillText("BATTLE CITY", W / 2, H / 2 - 60);

    // 总进度
    const totalLoaded = imgLoaded + audLoaded;
    const totalAll = imgTotal + audTotal;
    const progress = totalAll > 0 ? totalLoaded / totalAll : 0;

    // 进度条背景
    const barW = 260;
    const barH = 16;
    const barX = (W - barW) / 2;
    const barY = H / 2 - 8;

    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // 进度条填充
    ctx.fillStyle = "#d8a200";
    ctx.fillRect(barX + 2, barY + 2, (barW - 4) * progress, barH - 4);

    // 百分比文字
    ctx.fillStyle = "#aaa";
    ctx.font = "12px monospace";
    ctx.fillText(
      "加载中... " + Math.floor(progress * 100) + "%",
      W / 2,
      barY + barH + 24
    );

    // 细节
    ctx.fillStyle = "#555";
    ctx.font = "10px monospace";
    ctx.fillText(
      "图片 " + imgLoaded + "/" + imgTotal + "  音效 " + audLoaded + "/" + audTotal,
      W / 2,
      barY + barH + 44
    );

    requestAnimationFrame(drawLoading);
  }

  // 立即开始渲染加载界面
  requestAnimationFrame(drawLoading);

  // 先预加载原版素材（地块 + 玩家 + 敌人 + 道具 + 特效）和音效，再启动主循环
  let assetsReady = false;
  let audioReady = false;

  function tryStart() {
    if (assetsReady && audioReady) {
      loadingDone = true;
      last = performance.now();
      requestAnimationFrame(loop);
    }
  }

  Assets.load(
    Object.assign(
      {},
      TILE_ASSETS,
      PLAYER_ASSETS,
      ENEMY_ASSETS,
      PROP_ASSETS,
      EFFECT_ASSETS,
      BULLET_ASSETS,
      BOOM_ASSETS,
      STAR_ASSETS,
      UI_ASSETS
    ),
    function () {
      assetsReady = true;
      tryStart();
    },
    function (ratio, loaded, total) {
      imgLoaded = loaded;
      imgTotal = total;
    }
  );

  Sound.preload(
    function () {
      audioReady = true;
      tryStart();
    },
    function (ratio, loaded, total) {
      audLoaded = loaded;
      audTotal = total;
    }
  );
})();
