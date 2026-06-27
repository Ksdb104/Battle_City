/* =========================================================
 * 主游戏类：状态机、生成、碰撞、关卡流程、渲染、HUD
 * 支持双人模式：设备动态绑定，先按开始的设备为 P1，
 * 后续其他设备按开始加入为 P2
 * =======================================================*/

const SPAWN_POINTS = [
  { x: 0, y: 0 },
  { x: 6 * TILE, y: 0 },
  { x: 12 * TILE, y: 0 },
];

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;

    this.dom = {
      score: document.getElementById("score"),
      hiscore: document.getElementById("hiscore"),
      stage: document.getElementById("stage"),
      lifeIcons: document.getElementById("lifeIcons"),
      lifeIcons2: document.getElementById("lifeIcons2"),
      enemyIcons: document.getElementById("enemyIcons"),
      p2Panel: document.getElementById("p2Panel"),
      // 移动端紧凑型 HUD
      mhudStage: document.getElementById("mhudStage"),
      mhudEnemy: document.getElementById("mhudEnemy"),
      mhudP1: document.getElementById("mhudP1"),
      mhudP2: document.getElementById("mhudP2"),
      mhudP2Wrap: document.getElementById("mhudP2Wrap"),
    };

    // 预创建敌军图标格子
    this.enemyCells = [];
    for (let i = 0; i < CONFIG.enemiesPerStage; i++) {
      const d = document.createElement("div");
      d.className = "e";
      this.dom.enemyIcons.appendChild(d);
      this.enemyCells.push(d);
    }

    this.state = "title"; // 标题 | 游戏中 | 过关 | 游戏结束 | 大厅
    this.paused = false;
    this.frame = 0;
    this.hiScore = parseInt(localStorage.getItem("battleCity_hiScore"), 10);
    if (!this.hiScore || this.hiScore < 20000) this.hiScore = 20000;
    this.score = 0;

    // 标题菜单选项：PC：0=1P，1=2P，2=网络联机；移动端：0=1P，1=网络联机
    this.titleCursor = 0;
    this._lastTitleDir = null;

    // 网络联机角色
    this.onlineRole = null;

    // 联机模式选项：false=帧同步（默认），true=画面串流
    this.streamMode = false;

    // 大厅模式切换方向记忆
    this._lastLobbyDir = null;

    // 对端断线遮罩状态
    this.disconnectOverlay = false;

    // 主动离开遮罩状态
    this.leaveOverlay = false;
    this.leaveTimer = 0;

    // 延迟 HUD 状态
    this.latencyDisplay = "";
    this.latencyWarning = false;

    // 大厅分享链接状态
    this.lobbyCopyMsg = "";
    this.lobbyCopyTimer = 0;
    this._lobbyCKeyDown = false;

    // 监听 C 键（仅大厅中用于复制链接）
    this._onLobbyCKey = (e) => {
      if (e.code === "KeyC" && this.state === "lobby") {
        this._lobbyCKeyDown = true;
      }
    };
    window.addEventListener("keydown", this._onLobbyCKey);

    this.bullets = [];
    this.enemies = [];
    this.explosions = [];
    this.powerups = [];

    // ESC 键状态（大厅返回导航）
    this._escapePressed = false;
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape") this._escapePressed = true;
    });

    // 初始化 HUD 显示（确保标题画面就能看到正确的最高分）
    this.updateHUD();
  }

  /* -------------------- 流程控制 -------------------- */

  startGame(twoPlayer, startDevice) {
    Sound.unlock();
    this.score = 0;
    this.lives = 2;
    this.stageIndex = 0;
    this.playerState = { level: 0, hasBoat: false };

    // 设备绑定：startDevice 为 P1 的设备
    Input.clearBindings();
    Input.bindP1(startDevice);

    // P2 状态
    this.twoPlayer = !!twoPlayer;
    this.lives2 = twoPlayer ? 2 : 0;
    this.player2State = { level: 0, hasBoat: false };
    this.p2Active = !!twoPlayer;
    this.respawnTimer2 = 0;

    // 双人模式：自动给 P2 分配剩余设备中最“自然”的一个
    if (twoPlayer) {
      this._autoBindP2(startDevice);
    }

    this.loadStage(this.stageIndex);
  }

  /** 自动为 P2 绑定一个与 P1 不同类别的设备 */
  _autoBindP2(p1Device) {
    // P1 用手柄 → P2 用键盘 A（WASD + 空格）
    // P1 用键盘 A → P2 用键盘 B（方向键 + 小键盘）
    // P1 用键盘 B → P2 用键盘 A
    // P1 用键盘 C → P2 用键盘 A
    // P1 用触屏 → P2 用键盘 A
    if (p1Device && p1Device.startsWith("gp")) {
      Input.bindP2("kbA");
    } else if (p1Device === "kbA") {
      Input.bindP2("kbB");
    } else if (p1Device === "kbB") {
      Input.bindP2("kbA");
    } else if (p1Device === "kbC") {
      Input.bindP2("kbA");
    } else {
      Input.bindP2("kbB");
    }
  }

  loadStage(index) {
    this.level = new Level(LEVEL_MAPS[index % LEVEL_MAPS.length]);
    this.bullets = [];
    this.enemies = [];
    this.explosions = [];
    this.powerups = [];

    this.enemyQueue = this._buildEnemyQueue(index);
    this.enemiesRemaining = this.enemyQueue.length;
    this.enemiesKilled = 0;
    this.bonusSpawned = 0;

    this.spawnTimer = 150; //关卡初期不刷怪的保护时间
    this.spawnIndex = 0;
    this._nextEnemyId = 0; // 敌人唯一 ID 计数器（联机同步用）
    this.freezeTimer = 0;
    this.shovelTimer = 0;
    this.respawnTimer = 0;
    this.respawnTimer2 = 0;

    this.introTimer = 150; //关卡前的等待时长
    this.stageClearTimer = 0;
    this.stageClearDelay = 0;

    // 关卡加载时重置客机事件队列
    if (this.isOnline && this.onlineRole === "guest") {
      this._pendingEvents = [];
      this._divergenceCount = 0;
    }

    this.state = "playing";
    this.paused = false;

    this.player = null;
    this.player2 = null;
    this.updateHUD();
    Sound.stageStart();
  }

  _buildEnemyQueue(index) {
    const t = Math.min(index, 4);
    const counts = {
      basic: 9 - t,
      fast: 5,
      power: 3 + Math.floor(t / 2),
      armor: 3 + t,
    };
    const list = [];
    for (const type in counts) {
      for (let i = 0; i < counts[type]; i++) list.push(type);
    }
    while (list.length < CONFIG.enemiesPerStage) list.push(ENEMY.BASIC);
    list.length = CONFIG.enemiesPerStage;
    for (let i = list.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    // 预先决定哪些是红坦克（bonus），写入队列中（避免刷出时随机不一致）
    const queue = list.map((type) => ({ type, isBonus: false }));
    let bonusAssigned = 0;
    for (let i = 0; i < queue.length && bonusAssigned < CONFIG.maxBonusPerStage; i++) {
      // 将 bonus 均匀分散到队列中（大约每隔几辆出一个）
      const spacing = Math.floor(CONFIG.enemiesPerStage / CONFIG.maxBonusPerStage);
      if (i > 0 && i % spacing === Math.floor(spacing / 2)) {
        queue[i].isBonus = true;
        bonusAssigned++;
      }
    }
    return queue;
  }

  spawnPlayer() {
    const spawnX = this.level.baseTile.x * TILE - TILE - CELL;
    const spawnY = this.level.baseTile.y * TILE;
    this.player = new Tank(this, spawnX, spawnY, {
      isPlayer: true,
      playerIndex: 1,
      dir: DIR.UP,
      spawnTimer: 48,
    });
    this.player.shieldTimer = 110;
    if (this.playerState) {
      this.player.level = this.playerState.level;
      this.player.hasBoat = this.playerState.hasBoat;
      this.player.applyLevel();
    }
  }

  spawnPlayer2() {
    const spawnX = this.level.baseTile.x * TILE + TILE + CELL;
    const spawnY = this.level.baseTile.y * TILE;
    this.player2 = new Tank(this, spawnX, spawnY, {
      isPlayer: true,
      playerIndex: 2,
      dir: DIR.UP,
      spawnTimer: 48,
    });
    this.player2.shieldTimer = 110;
    if (this.player2State) {
      this.player2.level = this.player2State.level;
      this.player2.hasBoat = this.player2State.hasBoat;
      this.player2.applyLevel();
    }
  }

  /* -------------------- 主循环 -------------------- */

  update() {
    this.frame++;

    // 离开遮罩计时器：无论游戏状态或暂停都会计时
    if (this.leaveOverlay && this.leaveTimer > 0) {
      this.leaveTimer--;
      if (this.leaveTimer <= 0) {
        // 已经过了 3 秒——返回标题画面
        this.leaveOverlay = false;
        this.paused = false;
        this.isOnline = false;
        this.onlineRole = null;
        this.p2Active = false;
        this._removeBeforeUnloadHandler();
        InputBridge.reset();
        StreamManager.reset();
        NetManager.destroy();
        this.state = "title";
        this.titleCursor = 0;
        this.streamMode = false;
        this.updateHUD();
        return;
      }
      return; // 显示离开遮罩期间不处理其他更新
    }

    // 画面串流模式 Guest：仅发送输入 + ping，不运行游戏逻辑
    if (StreamManager.isStreamGuest() || (this.streamMode && this.onlineRole === "guest")) {
      if (!this.paused) {
        InputBridge.tick();
        NetManager.tickPing();
      }
      // 检测设备绑定（PC 端首次按键）
      if (this._needsDeviceDetection) {
        const detectEvt = Input.consumeEvent("start");
        if (detectEvt && detectEvt.device) {
          this._needsDeviceDetection = false;
          this.onlineStartDevice = detectEvt.device;
          Input.bindP2(detectEvt.device);
        }
      } else {
        // 处理 START 事件：借命请求（P2 向 P1 借）
        const startEvt = Input.consumeEvent("start");
        if (startEvt) {
          // 发送借命请求给 Host（Host 会验证条件是否满足）
          this._borrowLife(2);
        }
      }
      // 暂停事件只消费不处理（暂停由 Host 控制）
      Input.consumeEvent("pause");
      return;
    }

    if (this.state === "title") {
      this._updateTitle();
      return;
    }

    if (this.state === "lobby") {
      this._updateLobby();
      return;
    }

    if (this.state === "gameover") {
      this._updateGameOver();
      return;
    }

    // 暂停（任何设备的 pause 事件）
    const pauseEvt = Input.consumeEvent("pause");
    if (pauseEvt) {
      if (this.isOnline) {
        // 联机模式：仅主机（P1）可暂停；客机输入被忽略
        if (this.onlineRole === "host") {
          this._onlinePause();
        }
        // 客机的暂停输入被静默丢弃
      } else {
        this.paused = !this.paused;
        if (this.paused) Sound.pause();
      }
    }
    if (this.paused) return;

    // 联机模式：每帧驱动 InputBridge 和 NetManager
    if (this.isOnline) {
      InputBridge.tick();
      NetManager.tickPing();

      // 画面串流模式 Host：每 30 帧（~0.5 秒）发送 HUD 数据给 Guest
      if (this.streamMode && this.onlineRole === "host" && this.state === "playing") {
        this._streamHudTimer = (this._streamHudTimer || 0) + 1;
        if (this._streamHudTimer >= 30) {
          this._streamHudTimer = 0;
          this._sendStreamHud();
        }
      }
    }
    if (this.state === "stageclear") {
      this.stageClearTimer--;
      this._updateExplosions();
      if (this.stageClearTimer <= 0) {
        // 联机客机：等待主机发送 STAGE_TRANSITION 后加载新关
        if (this.isOnline && this.onlineRole === "guest") {
          // 本地加载关卡（stageIndex 已由 _handleStageTransitionMsg 设置）
          this.loadStage(this.stageIndex);
          return;
        }

        // 联机模式关卡递进（35 关循环：索引 0-34）
        if (this.isOnline) {
          this.stageIndex = (this.stageIndex + 1) % 35;
        } else {
          this.stageIndex++;
        }
        this.loadStage(this.stageIndex);

        // 联机模式（主机）：过关后发送敌人队列给客机
        if (this.isOnline && this.onlineRole === "host") {
          this._sendEnemyQueue();
        }
      }
      return;
    }

    // playing（游戏中）
    if (this.introTimer > 0) {
      this.introTimer--;
      if (this.introTimer === 0) {
        if (!this.player) this.spawnPlayer();
        if (this.p2Active && !this.player2) this.spawnPlayer2();
      }
      return;
    }

    // 处理开始事件：P2 加入 / 借命
    // 联机客机 PC 端：首次开始事件用于检测并绑定控制方案
    if (this._needsDeviceDetection && this.isOnline) {
      const detectEvt = Input.consumeEvent("start");
      if (detectEvt && detectEvt.device) {
        this._needsDeviceDetection = false;
        this.onlineStartDevice = detectEvt.device;
        if (this.onlineRole === "host") {
          Input.bindP1(detectEvt.device);
        } else {
          Input.bindP2(detectEvt.device);
        }
      }
    }
    this._handleStartEvents();

    if (this.freezeTimer > 0) this.freezeTimer--;
    if (this.shovelTimer > 0) {
      this.shovelTimer--;
      if (this.shovelTimer === 0) {
        this.level.fortify(false);
      } else if (this.shovelTimer < 180) {
        const flash = ((this.shovelTimer >> 3) & 1) === 0;
        this.level.fortify(flash);
      }
    }

    this._handleSpawning();

    // 客机：应用来自主机的待处理游戏事件
    this._applyPendingEvents();

    // P1 更新
    if (this.player && this.player.alive) {
      this.player.update(this);
    } else if (this.respawnTimer > 0) {
      this.respawnTimer--;
      if (this.respawnTimer === 0) this.spawnPlayer();
    }

    // P2 更新
    if (this.player2 && this.player2.alive) {
      this.player2.update(this);
    } else if (this.respawnTimer2 > 0) {
      this.respawnTimer2--;
      if (this.respawnTimer2 === 0) this.spawnPlayer2();
    }

    for (const e of this.enemies) {
      // 客机不运行敌人 AI 移动——位置由主机每帧同步
      // 但保留开火逻辑 + 帧间外推（丢帧时按当前方向继续滑动）
      if (this.isOnline && this.onlineRole === "guest") {
        if (e.spawnTimer > 0) { e.spawnTimer--; e.moving = false; continue; }
        if (e.shieldTimer > 0) e.shieldTimer--;
        if (e.fireCooldown > 0) e.fireCooldown--;
        if (e.stunTimer > 0) e.stunTimer--;
        // 帧间外推：如果本帧还没收到新位置，按当前方向和速度继续前进
        if (e._needsExtrapolation && this.freezeTimer <= 0) {
          const v = DIR_VEC[e.dir];
          const spd = e.speed || 1;
          const nx = e.x + v.x * spd;
          const ny = e.y + v.y * spd;
          // 简单边界检测：不出战场即可
          if (nx >= 0 && nx + TILE <= FIELD && ny >= 0 && ny + TILE <= FIELD) {
            e.x = nx;
            e.y = ny;
          }
          e.moving = true;
        }
        e._needsExtrapolation = true; // 下一帧如果没被实体帧覆盖就外推
        // 敌人开火（使用主机同步过来的位置/方向）
        if (this.freezeTimer <= 0 && e.alive) {
          if (e.fireTimer == null) e.fireTimer = randInt(60) + (e.baseCooldown || 40);
          e.fireTimer--;
          if (e.fireTimer <= 0) {
            e.fire(this);
            e.fireTimer = randInt(60) + (e.baseCooldown || 40);
          }
        }
      } else {
        e.update(this);
      }
    }

    for (const b of this.bullets) b.update(this);
    this._bulletVsBullet();

    this._updateExplosions();

    for (const p of this.powerups) p.update();
    this._handlePickup();

    // 清理
    this.bullets = this.bullets.filter((b) => {
      if (!b.alive) b.owner.activeBullets--;
      return b.alive;
    });
    this.enemies = this.enemies.filter((e) => e.alive);
    this.powerups = this.powerups.filter((p) => p.alive);

    // 主机：每帧发送实体状态帧给客机（帧同步模式才需要，串流模式跳过）
    if (this.isOnline && this.onlineRole === "host" && !this.streamMode) {
      this._sendEntityFrame();
    }

    this._checkStageEnd();
    this.updateHUD();
  }

  /* --- 标题画面 --- */
  _updateTitle() {
    // 菜单选择（任意设备方向键）
    // PC：0=1P，1=2P，2=网络联机
    // 移动端：0=1P，1=网络联机
    const maxCursor = this.isMobile ? 1 : 2;

    if (!this.isMobile) {
      const dir = Input.getAnyDirection();
      if (dir === DIR.DOWN && this._lastTitleDir !== DIR.DOWN) {
        if (this.titleCursor < maxCursor) {
          this.titleCursor++;
          Sound.menuMove();
        }
      } else if (dir === DIR.UP && this._lastTitleDir !== DIR.UP) {
        if (this.titleCursor > 0) {
          this.titleCursor--;
          Sound.menuMove();
        }
      }
      this._lastTitleDir = dir;
    } else {
      const dir = Input.getAnyDirection();
      if (dir === DIR.DOWN && this._lastTitleDir !== DIR.DOWN) {
        if (this.titleCursor < maxCursor) {
          this.titleCursor++;
          Sound.menuMove();
        }
      } else if (dir === DIR.UP && this._lastTitleDir !== DIR.UP) {
        if (this.titleCursor > 0) {
          this.titleCursor--;
          Sound.menuMove();
        }
      }
      this._lastTitleDir = dir;
    }

    // 任意设备按开始 → 该设备绑定为 P1，开始游戏或进入大厅
    const startEvt = Input.consumeEvent("start");
    if (startEvt) {
      const onlineIndex = this.isMobile ? 1 : 2;
      if (this.titleCursor === onlineIndex) {
        // 网络联机 → 进入大厅状态，记住启动设备
        this.state = "lobby";
        this.onlineRole = "host";
        this.onlineStartDevice = startEvt.device; // 记录哪个设备触发了联机
      } else {
        this.startGame(this.titleCursor === 1, startEvt.device);
      }
    }
    Input.consumeEvent("pause");
  }

  /* --- 游戏结束画面 --- */
  _updateGameOver() {
    const startEvt = Input.consumeEvent("start");
    if (startEvt) {
      if (this.isOnline) {
        // 联机模式：仅主机可重启；客机等待 SESSION_RESTART 消息
        if (this.onlineRole === "host") {
          // 主机发送 SESSION_RESTART 给客机并本地重启
          if (NetManager.dc && NetManager.dc.readyState === "open") {
            NetManager.dc.send(SyncMessage.encode(SyncMessage.MSG.SESSION_RESTART, this.frame, null));
          }
          this._restartOnlineSession();
        }
        // 客机：忽略本地开始按键——重启由 _handleSessionRestartMsg 触发
      } else {
        Input.clearBindings();
        this.state = "title";
        this.titleCursor = 0;
      }
    }
    Input.consumeEvent("pause");
  }

  /* --- 大厅画面 --- */

  _initLobby() {
    this.lobbyInited = true;
    this.lobbyStatus = "";
    this.lobbyError = this.lobbyError || null;
    this.lobbyRoomId = null;
    this.lobbyRetryAvailable = false;

    // 如果已有 URL 验证错误，则不连接服务器
    if (this.lobbyError) return;

    // 连接信令服务器
    const serverUrl = CONFIG.signalingUrl || window.location.origin;

    if (this.onlineRole === "host") {
      this.lobbyStatus = "正在创建房间...";
    } else {
      this.lobbyStatus = "正在加入房间...";
    }

    // 设置 NetManager 回调
    NetManager.onRoomCreated = (roomId) => {
      this.lobbyRoomId = roomId;
      this.lobbyStatus = "房间ID: " + roomId + "\n等待对方加入...";
    };

    NetManager.onPeerJoined = () => {
      if (this.onlineRole === "host") {
        this.lobbyStatus = "对方已加入，正在建立连接...";
      } else {
        this.lobbyStatus = "已加入房间，正在建立连接...";
      }
    };

    NetManager.onDataChannelOpen = () => {
      // 串流模式 Host：在数据通道打开后配置编码参数 + 启动音效转发
      if (this.streamMode && this.onlineRole === "host") {
        StreamManager.configureEncoding();
        StreamManager.startSoundForwarding();
      }
      this._startOnlineGame();
    };

    // 画面串流模式：在 PeerConnection 创建后添加视频轨道
    NetManager.onPcCreated = (pc) => {
      if (this.streamMode && this.onlineRole === "host") {
        // Host 串流模式：添加 canvas 视频轨道
        StreamManager.initHost(this.canvas);
      } else if (this.onlineRole === "guest") {
        // Guest 总是初始化 StreamManager（设置 ontrack 监听器）
        // 如果 Host 是串流模式，Guest 会收到视频轨道；否则什么都不会发生
        StreamManager.initGuest(this.canvas);
      }
    };

    NetManager.onPeerDisconnected = () => {
      // 大厅中对端断连 — 显示错误 + 返回按钮
      if (this.state === "lobby") {
        this.lobbyError = "对方已断开连接";
        this.lobbyRetryAvailable = false;
      }
    };

    NetManager.onError = (errorMsg) => {
      this.lobbyError = errorMsg;
      // WebRTC 连接失败时提供重试选项
      if (errorMsg.indexOf("WebRTC") !== -1 ||
          errorMsg.indexOf("SDP") !== -1 ||
          errorMsg.indexOf("ICE") !== -1 ||
          errorMsg.indexOf("数据通道") !== -1 ||
          errorMsg.indexOf("连接超时") !== -1) {
        this.lobbyRetryAvailable = true;
      }
    };

    NetManager.onStateChange = (newState) => {
      if (newState === "connecting") {
        this.lobbyStatus = "正在建立连接...";
      }
    };

    // 连接并启动相应流程
    NetManager.connect(serverUrl);

    // 等待 Socket.IO 连接成功后再执行房间操作（不用 setTimeout 猜时机）
    const onSocketConnected = () => {
      if (this.state !== "lobby" || this.lobbyError) return;
      if (this.onlineRole === "host") {
        NetManager.createRoom();
      } else if (this.onlineRole === "guest" && this.pendingRoomId) {
        NetManager.joinRoom(this.pendingRoomId);
      }
    };

    // 如果 socket 已经连上了（极快的本地连接），立即执行
    if (NetManager.socket && NetManager.socket.connected) {
      onSocketConnected();
    } else if (NetManager.socket) {
      // 否则等待 connect 事件
      NetManager.socket.once("connect", onSocketConnected);
    }
  }

  _updateLobby() {
    // 首帧初始化大厅
    if (!this.lobbyInited) {
      this._initLobby();
    }

    // 更新复制确认计时器
    this._updateLobbyCopyTimer();

    // 检测 ESC/P 键返回标题
    const pauseEvt = Input.consumeEvent("pause");
    if (this._escapePressed || pauseEvt) {
      this._escapePressed = false;
      this._leaveLobby();
      return;
    }

    // 主机模式切换：上下方向键切换帧同步/画面串流（仅在对端未加入时）
    if (this.onlineRole === "host" && !this.lobbyError && NetManager.state !== "connected") {
      const dir = Input.getAnyDirection();
      if ((dir === DIR.UP || dir === DIR.DOWN) && this._lastLobbyDir !== dir) {
        this.streamMode = !this.streamMode;
      }
      this._lastLobbyDir = dir;
    }

    // 检查复制输入（PC：C 键；移动端：START 键，当有房间且无错误时）
    if (!this.lobbyError && NetManager.roomId && this.onlineRole === "host") {
      this._checkLobbyCopyInput();
      // 移动端开始键会被复制功能消费，不再往下走
      if (this.isMobile) return;
    }

    // 检查开始按钮（错误时：重试/返回）
    const startEvt = Input.consumeEvent("start");
    if (startEvt) {
      // 记住 PC 端使用的控制方案（用于后续绑定玩家设备）
      if (!this.onlineStartDevice && !this.isMobile) {
        this.onlineStartDevice = startEvt.device;
      }
      if (this.lobbyError && this.lobbyRetryAvailable) {
        // 重试连接
        this._retryLobby();
      } else if (this.lobbyError) {
        // 有错误但不可重试：返回标题
        this._leaveLobby();
      } else if (this.isMobile && !NetManager.roomId) {
        // 移动端：还没创建房间时返回标题
        this._leaveLobby();
      }
      return;
    }
  }

  _drawLobby() {
    const ctx = this.ctx;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, FIELD, FIELD);

    // 标题
    this._text("网络联机", FIELD / 2, 60, 24, "#ffd34d", "bold");

    if (this.lobbyError) {
      // 错误状态
      this._text(this.lobbyError, FIELD / 2, FIELD / 2 - 20, 16, "#ff5b4d");

      if (this.lobbyRetryAvailable) {
        if ((this.frame >> 4) & 1) {
          this._text("按 START 重试", FIELD / 2, FIELD / 2 + 30, 14, "#aab0bb");
        }
        if (!this.isMobile) {
          this._text("P键/ESC 返回标题", FIELD / 2, FIELD / 2 + 60, 13, "#7a7e88");
        } else {
          this._text("点击 START 重试", FIELD / 2, FIELD / 2 + 60, 13, "#7a7e88");
        }
      } else {
        if (!this.isMobile) {
          if ((this.frame >> 4) & 1) {
            this._text("P键/ESC 返回标题", FIELD / 2, FIELD / 2 + 30, 14, "#aab0bb");
          }
        } else {
          if ((this.frame >> 4) & 1) {
            this._text("点击 START 返回", FIELD / 2, FIELD / 2 + 30, 14, "#aab0bb");
          }
        }
      }
    } else {
      // 正常连接状态
      // 按换行符分割并逐行渲染
      const statusText = this.lobbyStatus || "";
      const lines = statusText.split("\n");
      const lineHeight = 28;
      const startY = 120;
      for (let i = 0; i < lines.length; i++) {
        this._text(lines[i], FIELD / 2, startY + i * lineHeight, 16, "#e8e8e8");
      }

      // 等待状态的动画省略号
      if (statusText.indexOf("...") !== -1) {
        const dots = ".".repeat((Math.floor(this.frame / 20) % 3) + 1);
        this._text(dots, FIELD / 2 + 100, startY + (lines.length - 1) * lineHeight, 16, "#aab0bb");
      }

      // 分享链接区域（仅主机在创建房间后显示）
      if (this.onlineRole === "host" && NetManager.roomId) {
        const shareLinkY = startY + lines.length * lineHeight + 30;
        this._drawShareLink(shareLinkY);
      }

      // 同步模式指示器（仅主机等待对端时显示切换选项）
      if (this.onlineRole === "host") {
        const modeY = FIELD - 80;
        const modeLabel = this.streamMode ? "画面串流" : "帧同步";
        const modeColor = this.streamMode ? "#7fd6ef" : "#5fd96a";
        this._text("模式: " + modeLabel, FIELD / 2, modeY, 14, modeColor);
        // 只有对端还没加入时允许切换
        if (!NetManager.peerId && NetManager.state !== "connected") {
          this._text("↑↓ 切换模式", FIELD / 2, modeY + 20, 11, "#7a7e88");
        }
      } else if (this.onlineRole === "guest") {
        // Guest 显示模式信息（由 Host 在连接时通知，这里只做说明）
        const modeY = FIELD - 80;
        this._text("等待主机选择模式...", FIELD / 2, modeY, 12, "#7a7e88");
      }

      // 返回按钮提示
      if (!this.isMobile) {
        this._text("P键/ESC 返回", FIELD / 2, FIELD - 40, 12, "#7a7e88");
      } else {
        this._text("START 返回", FIELD / 2, FIELD - 40, 12, "#7a7e88");
      }
    }
  }

  _leaveLobby() {
    // 如果有活跃的数据通道，先发送 LEAVE
    NetManager.sendLeave();
    InputBridge.reset();
    StreamManager.reset();
    NetManager.destroy();
    this._removeBeforeUnloadHandler();
    this.lobbyInited = false;
    this.lobbyStatus = "";
    this.lobbyError = null;
    this.lobbyRoomId = null;
    this.lobbyRetryAvailable = false;
    this.lobbyCopyMsg = "";
    this.lobbyCopyTimer = 0;
    this.onlineRole = null;
    this.pendingRoomId = null;
    this.streamMode = false;
    this.state = "title";
    this.titleCursor = 0;
  }

  _retryLobby() {
    // 清除错误状态并重新初始化
    this.lobbyError = null;
    this.lobbyRetryAvailable = false;
    this.lobbyInited = false;
    NetManager.destroy();
  }

  _startOnlineGame() {
    // 标记联机模式开始
    this.isOnline = true;

    // 清除大厅状态
    this.lobbyInited = false;

    // 画面串流模式 Guest：检查是否已收到视频流
    // 如果 StreamManager 已检测到视频轨道（enabled=true），直接进入串流观看模式
    if (this.onlineRole === "guest" && StreamManager.isStreamGuest()) {
      this.streamMode = true;
      this._startStreamGuest();
      return;
    }

    // Guest 还没收到视频轨道，但 StreamManager 已初始化（说明 Host 是串流模式）
    // 注册回调：一旦收到视频流，切换到串流 Guest 模式
    if (this.onlineRole === "guest" && StreamManager.role === "guest" && !StreamManager.enabled) {
      StreamManager._onStreamReady = () => {
        // 视频流到达后，将游戏切换为串流 Guest
        this.streamMode = true;
        console.log("[Game] Stream ready — switching to stream guest mode");
      };
    }

    // 根据平台确定本地设备（或使用触发联机时的设备）
    let localDevice;
    if (this.isMobile) {
      localDevice = "touch";
    } else if (this.onlineStartDevice) {
      localDevice = this.onlineStartDevice;
    } else {
      // 客机 PC 端没有记录到启动设备时，默认使用 kbA
      // 同时监听第一个开始事件来动态切换
      localDevice = "kbA";
      this._needsDeviceDetection = true;
    }

    // 清除现有绑定后重新设置
    Input.clearBindings();

    // 初始化 InputBridge（设置“remote”设备绑定）
    // 主机：InputBridge.init("host") 调用 Input.bindP2("remote")
    // 客机：InputBridge.init("guest") 调用 Input.bindP1("remote")
    InputBridge.init(this.onlineRole);

    // 绑定本地设备到对应玩家
    if (this.onlineRole === "host") {
      // 主机是 P1：本地设备驱动 P1，远端已由 InputBridge 绑到 P2
      Input.bindP1(localDevice);
    } else {
      // 客机是 P2：本地设备驱动 P2，远端已由 InputBridge 绑到 P1
      Input.bindP2(localDevice);
    }

    // 连接数据通道消息处理器
    NetManager.onMessage = (msgType, payload, frameNumber) => {
      this._handleOnlineMessage(msgType, payload, frameNumber);
    };

    // 连接断线/重连处理器
    NetManager.onPeerDisconnected = () => {
      // 大厅状态下显示错误而非游戏内遮罩
      if (this.state === "lobby") {
        this.lobbyError = "对方已断开连接";
        this.lobbyRetryAvailable = false;
        return;
      }
      this.disconnectOverlay = true;
      this.paused = true;
    };

    NetManager.onPeerReconnected = () => {
      this.disconnectOverlay = false;
      this.paused = false;
    };

    NetManager.onError = (errorMsg) => {
      // 游戏过程中，“重连超时”表示重连窗口已过期
      if (errorMsg === "重连超时" && this.isOnline) {
        this._handleReconnectTimeout();
      }
    };

    // 绑定延迟显示回调
    NetManager.onLatencyUpdate = (value) => {
      if (value === "timeout") {
        this.latencyDisplay = "timeout";
        this.latencyWarning = true;
      } else {
        const ms = Math.round(value);
        this.latencyWarning = ms > 200;
        this.latencyDisplay = (this.latencyWarning ? "⚠ " : "") + ms + "ms";
      }
    };

    // 注册 beforeunload：在浏览器关闭或离开页面时发送 LEAVE
    this._beforeUnloadHandler = () => {
      NetManager.sendLeave();
    };
    window.addEventListener("beforeunload", this._beforeUnloadHandler);

    // 初始化与 startGame(true, ...) 相同的游戏状态，用于双人模式
    Sound.unlock();
    this.score = 0;
    this.lives = 2;
    this.lives2 = 2;
    this.stageIndex = 0;
    this.playerState = { level: 0, hasBoat: false };
    this.player2State = { level: 0, hasBoat: false };

    // 联机模式下从一开始就激活两名玩家
    this.twoPlayer = true;
    this.p2Active = true;
    this.respawnTimer2 = 0;

    // 客机事件队列和重同步状态
    this._pendingEvents = [];
    this._resyncAttempts = 0;
    this._resyncTimer = 0;
    this._divergenceCount = 0;

    // 开始第一关
    this.loadStage(this.stageIndex);

    // 主机：发送初始敌人队列给客机（确保两边队列顺序一致）
    if (this.onlineRole === "host") {
      this._sendEnemyQueue();
    }
  }

  /**
   * 画面串流模式 Guest 初始化。
   * Guest 不运行游戏逻辑，只：
   *   1. 采集本地输入
   *   2. 通过 DataChannel 发送给 Host
   *   3. 显示 Host 推来的视频流
   */
  _startStreamGuest() {
    // 根据平台确定本地设备
    let localDevice;
    if (this.isMobile) {
      localDevice = "touch";
    } else if (this.onlineStartDevice) {
      localDevice = this.onlineStartDevice;
    } else {
      localDevice = "kbA";
      this._needsDeviceDetection = true;
    }

    Input.clearBindings();

    // 串流模式下 Guest 的输入直接作为 P2 发送
    // 使用 InputBridge 发送本地输入给 Host
    InputBridge.init("guest");
    Input.bindP2(localDevice);

    // 连接消息处理器（只需处理 LEAVE / PAUSE 等控制消息）
    NetManager.onMessage = (msgType, payload, frameNumber) => {
      this._handleStreamGuestMessage(msgType, payload, frameNumber);
    };

    // 断线处理
    NetManager.onPeerDisconnected = () => {
      this.disconnectOverlay = true;
      this.paused = true;
    };
    NetManager.onPeerReconnected = () => {
      this.disconnectOverlay = false;
      this.paused = false;
    };
    NetManager.onError = (errorMsg) => {
      if (errorMsg === "重连超时" && this.isOnline) {
        this._handleReconnectTimeout();
      }
    };

    // 延迟显示
    NetManager.onLatencyUpdate = (value) => {
      if (value === "timeout") {
        this.latencyDisplay = "timeout";
        this.latencyWarning = true;
      } else {
        const ms = Math.round(value);
        this.latencyWarning = ms > 200;
        this.latencyDisplay = (this.latencyWarning ? "⚠ " : "") + ms + "ms";
      }
    };

    // beforeunload
    this._beforeUnloadHandler = () => { NetManager.sendLeave(); };
    window.addEventListener("beforeunload", this._beforeUnloadHandler);

    // 进入 stream-guest 状态：标记为 playing（虽然不运行逻辑）
    this.state = "playing";

    // 确保视频正在播放（可能在 lobby→game 过渡期间暂停了）
    if (StreamManager.videoEl && StreamManager.videoEl.paused) {
      StreamManager.videoEl.play().catch(() => {});
    }
  }

  /**
   * 画面串流模式 Guest 的消息处理器。
   * 只处理控制消息（LEAVE、PAUSE、UNPAUSE）和 HUD 同步，忽略游戏数据。
   */
  _handleStreamGuestMessage(msgType, payload, frameNumber) {
    switch (msgType) {
      case SyncMessage.MSG.INPUT:
        // Host 不该发 INPUT 给 Guest，忽略
        break;
      case SyncMessage.MSG.PAUSE:
        this._handlePauseMsg();
        break;
      case SyncMessage.MSG.UNPAUSE:
        this._handleUnpauseMsg();
        break;
      case SyncMessage.MSG.LEAVE:
        this._handleLeaveMsg();
        break;
      case SyncMessage.MSG.GAME_EVENT:
        // 只处理 HUD 同步（0xFE）
        if (payload && payload.eventType === 0xFE) {
          this._applyStreamHud(payload.data);
        }
        break;
      case SyncMessage.MSG.SESSION_RESTART:
        // 串流模式下重启由 Host 驱动，Guest 什么都不做（画面会自动更新）
        break;
      default:
        break;
    }
  }

  /**
   * 画面串流模式 Guest：应用来自 Host 的 HUD 数据。
   */
  _applyStreamHud(data) {
    if (!data || data.length < 8) return;
    this.lives = data[0];
    this.lives2 = data[1];
    this.stageIndex = data[2];
    this.enemiesKilled = data[3];
    this.score = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
    this.p2Active = true;
    this.updateHUD();
  }

  /* --- 联机暂停/恢复 --- */

  /** 主机切换暂停状态，并向客机发送 PAUSE/UNPAUSE */
  _onlinePause() {
    this.paused = !this.paused;
    if (this.paused) Sound.pause();
    const msgType = this.paused ? SyncMessage.MSG.PAUSE : SyncMessage.MSG.UNPAUSE;
    if (NetManager.dc && NetManager.dc.readyState === "open") {
      NetManager.dc.send(SyncMessage.encode(msgType, this.frame, null));
    }
  }

  /** 客机收到主机发送的 PAUSE 消息 */
  _handlePauseMsg() {
    this.paused = true;
  }

  /** 客机收到主机发送的 UNPAUSE 消息 */
  _handleUnpauseMsg() {
    this.paused = false;
  }

  /* --- 联机会话重启 --- */

  /** 重启联机会话：重置分数和状态，回到第 1 关 */
  _restartOnlineSession() {
    this.score = 0;
    this.lives = 2;
    this.lives2 = 2;
    this.stageIndex = 0;
    this.playerState = { level: 0, hasBoat: false };
    this.player2State = { level: 0, hasBoat: false };
    this.twoPlayer = true;
    this.p2Active = true;
    this.loadStage(0);
  }

  /** 客机收到主机发送的 SESSION_RESTART 消息 */
  _handleSessionRestartMsg() {
    this._restartOnlineSession();
  }

  /** 处理收到 LEAVE 消息：对手主动离开 */
  _handleLeaveMsg() {
    // 不要启动重连计时器——这是主动离开
    NetManager._clearReconnectTimer();
    // 如果有断线遮罩，先关闭它
    this.disconnectOverlay = false;
    // 显示“对方已退出”遮罩 3 秒（60fps 下 180 帧）
    this.leaveOverlay = true;
    this.leaveTimer = 180;
    // 在遮罩显示期间暂停游戏
    this.paused = true;
  }

  /** 移除 beforeunload 处理器（会话结束时清理） */
  _removeBeforeUnloadHandler() {
    if (this._beforeUnloadHandler) {
      window.removeEventListener("beforeunload", this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
  }

  /** 按类型分发收到的数据通道消息 */
  _handleOnlineMessage(msgType, payload, frameNumber) {
    switch (msgType) {
      case SyncMessage.MSG.INPUT:
        // 输入消息由 InputBridge 处理——交给它
        if (payload) {
          InputBridge.receiveRemoteInput(
            frameNumber || 0,
            payload.dir,
            payload.fire
          );
        }
        break;
      case SyncMessage.MSG.PAUSE:
        this._handlePauseMsg();
        break;
      case SyncMessage.MSG.UNPAUSE:
        this._handleUnpauseMsg();
        break;
      case SyncMessage.MSG.SESSION_RESTART:
        this._handleSessionRestartMsg();
        break;
      case SyncMessage.MSG.GAME_EVENT:
        // 主机端：处理客机发来的借命请求
        if (this.isOnline && this.onlineRole === "host" && payload && payload.eventType === GAME_EVT.PLAYER_RESPAWN) {
          this._handleRemoteBorrowRequest(payload.data);
        } else {
          this._handleGameEventMsg(payload, frameNumber);
        }
        break;
      case SyncMessage.MSG.STATE_SNAPSHOT:
        this._handleStateSnapshotMsg(payload);
        break;
      case SyncMessage.MSG.STAGE_TRANSITION:
        this._handleStageTransitionMsg(payload);
        break;
      case SyncMessage.MSG.RESYNC_REQUEST:
        // 主机用完整状态快照响应客机的重同步请求
        if (this.isOnline && this.onlineRole === "host") {
          this._sendStateSnapshot();
        }
        break;
      case SyncMessage.MSG.LEAVE:
        this._handleLeaveMsg();
        break;
      default:
        break;
    }
  }

  /* --- 客机：游戏事件的排队与应用 --- */

  /**
   * Guest receives a GAME_EVENT message from host.
   * Queue it by frame number for application at the correct simulation frame.
   */
  _handleGameEventMsg(payload, frameNumber) {
    if (!this.isOnline || this.onlineRole !== "guest") return;
    if (!payload) return;
    // 直接应用事件（主机/客机帧号独立递增，不做帧级排队）
    this._applyGameEvent({
      frameNum: frameNumber || 0,
      eventType: payload.eventType,
      data: payload.data,
    });
  }

  /**
   * Called each frame during update (guest only).
   * Apply all pending events whose frame number has been reached.
   */
  _applyPendingEvents() {
    if (!this.isOnline || this.onlineRole !== "guest") return;

    // 应用到期事件
    if (this._pendingEvents && this._pendingEvents.length > 0) {
      while (this._pendingEvents.length > 0 && this._pendingEvents[0].frameNum <= this.frame) {
        const evt = this._pendingEvents.shift();
        this._applyGameEvent(evt);
      }
    }

    // 如果重同步计时器在运行，则递增（独立于待处理事件）
    if (this._resyncTimer > 0) {
      this._resyncTimer--;
      if (this._resyncTimer <= 0) {
        // 未及时收到重同步响应——重试
        this._requestResync();
      }
    }
  }

  /**
   * Apply a single game event on the guest side.
   * Handles: ENEMY_SPAWN, POWERUP_SPAWN, AI_DIRECTION
   */
  _applyGameEvent(evt) {
    // 实体帧（0xFF）：高频全量同步，直接交给专门的处理器
    if (evt.eventType === 0xFF) {
      this._applyEntityFrame(evt.data);
      return;
    }

    switch (evt.eventType) {
      case GAME_EVT.ENEMY_SPAWN:
        this._applyEnemySpawn(evt.data);
        break;
      case GAME_EVT.POWERUP_SPAWN:
        this._applyPowerupSpawn(evt.data);
        break;
      case GAME_EVT.AI_DIRECTION:
        this._applyAiDirection(evt.data);
        break;
      case GAME_EVT.ENEMY_KILLED:
        this._applyEnemyKilled(evt.data);
        break;
      case GAME_EVT.PLAYER_HIT:
        this._applyPlayerHit(evt.data);
        break;
      case GAME_EVT.PLAYER_RESPAWN:
        this._applyBorrowLife(evt.data);
        break;
      case GAME_EVT.BASE_HIT:
        this._applyBaseHit();
        break;
      default:
        break;
    }
  }

  /**
   * Guest applies an ENEMY_SPAWN event.
   * Data format: [spawnPointIndex, enemyTypeId, isBonusFlag, enemyId]
   */
  _applyEnemySpawn(data) {
    if (!data || data.length < 4) return;
    const spawnPointIdx = data[0];
    const typeId = data[1];
    const isBonus = data[2] !== 0;
    const enemyId = data[3];

    const typeNames = ["basic", "fast", "power", "armor"];
    const typeName = typeNames[typeId] || "basic";
    const pt = SPAWN_POINTS[spawnPointIdx % SPAWN_POINTS.length];

    const enemy = new Tank(this, pt.x, pt.y, {
      type: typeName,
      dir: DIR.DOWN,
      isBonus: isBonus,
      spawnTimer: 50,
    });
    enemy.enemyId = enemyId;
    this.enemies.push(enemy);

    // 同步客机侧计数器
    if (this.enemiesRemaining > 0) {
      this.enemiesRemaining--;
    }
    if (isBonus) {
      this.bonusSpawned = (this.bonusSpawned || 0) + 1;
    }
  }

  /**
   * Guest applies a POWERUP_SPAWN event.
   * Data format: [px_lo, px_hi, py_lo, py_hi, typeIndex]
   */
  _applyPowerupSpawn(data) {
    if (!data || data.length < 5) return;
    const px = data[0] | (data[1] << 8);
    const py = data[2] | (data[3] << 8);
    const typeIndex = data[4];

    const typeList = [POWER.STAR, POWER.TANK, POWER.GRENADE, POWER.HELMET,
                      POWER.TIMER, POWER.SHOVEL, POWER.GUN, POWER.BOAT];
    const powerType = typeList[typeIndex] || POWER.STAR;

    // 清除已有道具（与主机的 dropPowerUp 逻辑一致）
    this.powerups = [];
    this.powerups.push(new PowerUp(px, py, powerType));
    Sound.powerupAppear();
  }

  /**
   * Guest applies an AI_DIRECTION event.
   * Data format: [enemyId, newDirection]
   * Detects divergence if the enemy doesn't exist locally.
   */
  _applyAiDirection(data) {
    if (!data || data.length < 2) return;
    const enemyId = data[0];
    const newDir = data[1];

    const enemy = this.enemies.find((e) => e.alive && e.enemyId === enemyId);
    if (enemy) {
      enemy.dir = newDir;
      enemy.aiTimer = randInt(50) + 25;
      // 成功应用后重置分歧计数
      if (this._divergenceCount > 0) this._divergenceCount = 0;
    } else {
      // 检测到分歧：引用的敌人本地不存在
      this._onDivergenceDetected();
    }
  }

  /**
   * Guest 处理敌人被消灭事件。
   * Data: [enemyId]
   */
  _applyEnemyKilled(data) {
    if (!data || data.length < 1) return;
    const enemyId = data[0];
    const idx = this.enemies.findIndex((e) => e.alive && e.enemyId === enemyId);
    if (idx >= 0) {
      const enemy = this.enemies[idx];
      const c = enemy.center();
      this.addExplosion(c.x, c.y, "boom2");
      this.score += enemy.score || 100;
      this._updateHiScore();
      this.enemiesKilled++;
      enemy.alive = false;
      this.enemies.splice(idx, 1);
    }
  }

  /**
   * Guest 处理玩家被击中/击杀事件。
   * Data: [playerIndex, destroyed(1=死亡)]
   */
  _applyPlayerHit(data) {
    if (!data || data.length < 2) return;
    const playerIndex = data[0];
    const destroyed = data[1] !== 0;
    if (!destroyed) return;

    const player = playerIndex === 2 ? this.player2 : this.player;
    if (player && player.alive) {
      const c = player.center();
      this.addExplosion(c.x, c.y, "boom2");
      player.alive = false;
      Sound.bulletHit2();

      if (playerIndex === 2) {
        this.player2State = { level: 0, hasBoat: false };
        if (this.lives2 > 0) {
          this.lives2--;
          this.respawnTimer2 = 80;
        }
      } else {
        this.playerState = { level: 0, hasBoat: false };
        if (this.lives > 0) {
          this.lives--;
          this.respawnTimer = 80;
        }
      }
      this.updateHUD();
      this._checkBothDead();
    }
  }

  /**
   * Guest 处理基地被摧毁事件。
   */
  _applyBaseHit() {
    if (!this.level.baseAlive) return;
    this.level.baseAlive = false;
    const bx = this.level.baseTile.x * TILE + TILE / 2;
    const by = this.level.baseTile.y * TILE + TILE / 2;
    this.addExplosion(bx, by, "boom2");
    this.gameOver();
  }

  /**
   * 收到对端的借命事件：在本地执行相同的借命操作（保持同步）。
   * Data: [borrower] (1=P1向P2借, 2=P2向P1借)
   */
  _applyBorrowLife(data) {
    if (!data || data.length < 1) return;
    const borrower = data[0];
    if (borrower === 1) {
      if (this.lives2 > 0) {
        this.lives2--;
        this.playerState = { level: 0, hasBoat: false };
        this.respawnTimer = 80;
        Sound.powerupPick();
        this.updateHUD();
      }
    } else if (borrower === 2) {
      if (this.lives > 0) {
        this.lives--;
        this.player2State = { level: 0, hasBoat: false };
        this.respawnTimer2 = 80;
        Sound.powerupPick();
        this.updateHUD();
      }
    }
  }

  /**
   * Called when a divergence is detected between guest and host state.
   * After sufficient divergence signals, request a full resync.
   */
  _onDivergenceDetected() {
    this._divergenceCount = (this._divergenceCount || 0) + 1;
    // 在触发重同步前允许少量不一致（应对瞬时刷怪时序）
    if (this._divergenceCount >= 3) {
      this._divergenceCount = 0;
      this._requestResync();
    }
  }

  /**
   * Send a RESYNC_REQUEST to the host.
   * Retry up to 2 additional times (3 total attempts, 3s each).
   * Treat as connection lost if all attempts fail.
   */
  _requestResync() {
    if (!NetManager.dc || NetManager.dc.readyState !== "open") return;
    this._resyncAttempts = (this._resyncAttempts || 0) + 1;
    if (this._resyncAttempts > 3) {
      // 所有重试次数都已耗尽——视为连接丢失
      this._resyncAttempts = 0;
      this._resyncTimer = 0;
      this._handleResyncFailure();
      return;
    }
    NetManager.dc.send(SyncMessage.encode(SyncMessage.MSG.RESYNC_REQUEST, this.frame, null));
    this._resyncTimer = 180; // 60fps 下 3 秒
  }

  /**
   * Handle resync failure after all retry attempts exhausted.
   * Treat as connection lost — return to title screen.
   */
  _handleResyncFailure() {
    // 因不可恢复的状态分歧而结束联机会话
    this.isOnline = false;
    this.onlineRole = null;
    this.p2Active = false;
    this._removeBeforeUnloadHandler();
    InputBridge.reset();
    NetManager.destroy();
    this.state = "title";
    this.titleCursor = 0;
    this.updateHUD();
  }

  /**
   * Handle reconnection timeout: the 10s reconnection window expired.
   * End the online session and return to the title screen.
   */
  _handleReconnectTimeout() {
    this.disconnectOverlay = false;
    this.paused = false;
    this.isOnline = false;
    this.onlineRole = null;
    this.p2Active = false;
    this._removeBeforeUnloadHandler();
    InputBridge.reset();
    StreamManager.reset();
    NetManager.destroy();
    this.state = "title";
    this.titleCursor = 0;
    this.streamMode = false;
    this.updateHUD();
  }

  /* --- 大厅：分享链接构造与复制 --- */

  /** 构造分享链接 */
  _buildShareLink() {
    const roomId = typeof NetManager !== "undefined" ? NetManager.roomId : null;
    if (!roomId) return "";
    return window.location.origin + window.location.pathname + "?room=" + roomId;
  }

  /** 触发复制/分享操作 */
  _copyShareLink() {
    const link = this._buildShareLink();
    if (!link) return;

    if (this.isMobile && navigator.share) {
      navigator.share({ title: "坦克大战联机", url: link }).catch(() => {
        this._clipboardCopy(link);
      });
    } else {
      this._clipboardCopy(link);
    }
  }

  /** 使用 Clipboard API 复制，失败时回退到备用方案 */
  _clipboardCopy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this._showCopyConfirmation();
      }).catch(() => {
        this._fallbackCopy(text);
      });
    } else {
      this._fallbackCopy(text);
    }
  }

  /** 手动复制备用方案（临时 textarea + execCommand） */
  _fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    this._showCopyConfirmation();
  }

  /** 显示“已复制”确认，持续 2 秒（60fps 下 120 帧） */
  _showCopyConfirmation() {
    this.lobbyCopyMsg = "已复制";
    this.lobbyCopyTimer = 120;
  }

  /** 每帧调用：递减复制确认计时器 */
  _updateLobbyCopyTimer() {
    if (this.lobbyCopyTimer > 0) {
      this.lobbyCopyTimer--;
      if (this.lobbyCopyTimer <= 0) {
        this.lobbyCopyMsg = "";
      }
    }
  }

  /** 检查大厅中的复制按键（PC：C 键，移动端：开始按钮） */
  _checkLobbyCopyInput() {
    // PC：按 C 键复制（使用直接键盘监听）
    if (!this.isMobile) {
      if (this._lobbyCKeyDown) {
        this._lobbyCKeyDown = false;
        this._copyShareLink();
      }
    } else {
      // 移动端：开始按钮触发复制/分享
      const startEvt = Input.consumeEvent("start");
      if (startEvt) {
        this._copyShareLink();
      }
    }
  }

  /** 在大厅画面绘制分享链接区域 */
  _drawShareLink(baseY) {
    const ctx = this.ctx;
    const roomId = typeof NetManager !== "undefined" ? NetManager.roomId : null;
    if (!roomId) return baseY;

    const link = this._buildShareLink();
    const y = baseY;

    // 显示分享链接
    this._text("分享链接:", FIELD / 2, y, 12, "#aab0bb");
    this._text(link, FIELD / 2, y + 20, 10, "#5fd96a");

    // 复制按钮提示
    const btnY = y + 46;
    if (this.isMobile) {
      this._text("点击 START 分享/复制链接", FIELD / 2, btnY, 12, "#8bf");
    } else {
      this._text("按 C 复制链接", FIELD / 2, btnY, 12, "#8bf");
    }

    // "已复制" 确认
    if (this.lobbyCopyMsg) {
      this._text(this.lobbyCopyMsg, FIELD / 2, btnY + 22, 14, "#5fd96a", "bold");
    }

    return btnY + 40;
  }

  /* --- 游戏中处理开始事件：P2 加入 / 借命 --- */
  _handleStartEvents() {
    const startEvents = Input.consumeAllEvents("start");
    for (const evt of startEvents) {
      const device = evt.device;
      const p1Dev = Input.getP1Device();
      const p2Dev = Input.getP2Device();

      const isP1 = (device === p1Dev);
      const isP2 = (device === p2Dev);

      if (isP2 || (!isP1 && !isP2 && !this.p2Active)) {
        // 移动端不允许本地 P2 加入（单设备），但联机模式下允许借命
        if (this.isMobile && !this.isOnline) continue;

        if (!this.p2Active) {
          // 本地模式：新设备加入为 P2（联机模式不会走到这里，p2Active 已激活）
          if (this.isMobile) continue; // 移动端本地不允许加入
          this.p2Active = true;
          this.lives2 = 2;
          this.player2State = { level: 0, hasBoat: false };
          Input.bindP2(device);
          this.spawnPlayer2();
          Sound.powerupPick();
          this.updateHUD();
        } else if ((!this.player2 || !this.player2.alive) && this.lives2 <= 0) {
          // P2 没命了且已被击毁 → 向 P1 借命（Host 会验证 P1 是否有剩余生命）
          this._borrowLife(2);
        }
      } else if (isP1) {
        // P1 设备按开始：P1 没命且已被击毁时向 P2 借命
        if ((!this.player || !this.player.alive) && this.lives <= 0 && this.p2Active) {
          this._borrowLife(1);
        }
      } else if (!isP1 && !isP2 && this.p2Active) {
        // 移动端不允许换设备
        if (this.isMobile) continue;
        // 第三个设备按开始且 P2 已激活：重新绑定 P2 到新设备
        Input.bindP2(device);
      }
    }
  }

  /** 借命逻辑：borrower=1 表示 P1 向 P2 借，borrower=2 表示 P2 向 P1 借 */
  _borrowLife(borrower) {
    // 联机模式客机端：只发送借命请求给主机，不本地修改
    // （等主机处理后通过实体帧同步回来，避免竞态覆盖）
    if (this.isOnline && this.onlineRole === "guest") {
      if (NetManager.dc && NetManager.dc.readyState === "open") {
        const data = new Uint8Array([borrower]);
        const buf = SyncMessage.encode(SyncMessage.MSG.GAME_EVENT, this.frame, { eventType: GAME_EVT.PLAYER_RESPAWN, data });
        NetManager.dc.send(buf);
      }
      return;
    }

    // 主机端或本地模式：验证条件并执行借命
    if (borrower === 1) {
      // P1 向 P2 借：P1 必须已死亡且无剩余生命，P2 必须有剩余生命
      const p1Dead = !this.player || !this.player.alive;
      if (p1Dead && this.lives <= 0 && this.lives2 > 0) {
        this.lives2--;
        this.playerState = { level: 0, hasBoat: false };
        this.respawnTimer = 80;
        Sound.lifeup();
        this.updateHUD();
      } else {
        return; // 条件不满足，不执行
      }
    } else {
      // P2 向 P1 借：P2 必须已死亡且无剩余生命，P1 必须有剩余生命
      const p2Dead = !this.player2 || !this.player2.alive;
      if (p2Dead && this.lives2 <= 0 && this.lives > 0) {
        this.lives--;
        this.player2State = { level: 0, hasBoat: false };
        this.respawnTimer2 = 80;
        Sound.lifeup();
        this.updateHUD();
      } else {
        return; // 条件不满足，不执行
      }
    }
    // 联机模式主机端：通知客机（客机通过实体帧获取最新状态，这里额外发事件触发音效）
    if (this.isOnline && this.onlineRole === "host") {
      if (NetManager.dc && NetManager.dc.readyState === "open") {
        const data = new Uint8Array([borrower]);
        const buf = SyncMessage.encode(SyncMessage.MSG.GAME_EVENT, this.frame, { eventType: GAME_EVT.PLAYER_RESPAWN, data });
        NetManager.dc.send(buf);
      }
    }
  }

  /**
   * 主机处理客机发来的借命请求。
   * 直接调用 _borrowLife 执行借命逻辑（主机权威）。
   */
  _handleRemoteBorrowRequest(data) {
    if (!data || data.length < 1) return;
    const borrower = data[0];
    // 验证合法性：客机只能请求 P2 向 P1 借命（borrower=2）
    // 或者 P1 向 P2 借命（borrower=1，如果 Host 按了 START 但通过某种方式到这里——不太可能）
    this._borrowLife(borrower);
  }

  /**
   * 画面串流模式：Host 发送 HUD 数据给 Guest（轻量，每 0.5 秒一次）。
   * 格式：GAME_EVENT + eventType=0xFE + [lives, lives2, stageIndex, enemiesKilled, score(4 bytes)]
   */
  _sendStreamHud() {
    if (!NetManager.dc || NetManager.dc.readyState !== "open") return;
    const score = this.score & 0xFFFFFFFF;
    const data = new Uint8Array([
      this.lives,
      this.lives2,
      this.stageIndex,
      this.enemiesKilled,
      score & 0xFF, (score >> 8) & 0xFF, (score >> 16) & 0xFF, (score >> 24) & 0xFF,
    ]);
    const buf = SyncMessage.encode(SyncMessage.MSG.GAME_EVENT, this.frame, { eventType: 0xFE, data });
    NetManager.dc.send(buf);
  }

  /* -------------------- 由主机权威驱动的游戏事件广播 -------------------- */

  /**
   * Broadcast a non-deterministic game event to the guest (host-only).
   * Uses SyncMessage.encode directly with the current frame number.
   * @param {number} eventType - One of GAME_EVT.* constants
   * @param {number[]} dataBytes - Payload bytes specific to the event type
   */
  _broadcastGameEvent(eventType, dataBytes) {
    if (!this.isOnline || this.onlineRole !== "host") return;
    if (this.streamMode) return; // 串流模式不需要发送游戏事件
    if (!NetManager.dc || NetManager.dc.readyState !== "open") return;
    const data = new Uint8Array(dataBytes);
    const buf = SyncMessage.encode(SyncMessage.MSG.GAME_EVENT, this.frame, { eventType, data });
    NetManager.dc.send(buf);
  }

  _handleSpawning() {
    // 客机不自己刷怪——敌人完全由主机的实体帧同步
    if (this.isOnline && this.onlineRole === "guest") return;
    if (this.enemiesRemaining <= 0) return;
    if (this.enemies.length >= CONFIG.maxEnemiesOnScreen) return;
    this.spawnTimer--;
    if (this.spawnTimer > 0) return;

    const pt = SPAWN_POINTS[this.spawnIndex % SPAWN_POINTS.length];
    const rect = { x: pt.x, y: pt.y, w: TILE, h: TILE };
    for (const t of this.allTanks()) {
      if (rectsOverlap(rect, t.rect())) {
        this.spawnTimer = 20;
        return;
      }
    }

    const spec = this.enemyQueue[this.enemyQueue.length - this.enemiesRemaining];
    // 联机帧同步模式：从队列预先决定的值读取 isBonus（确保两端一致）
    // 单机/本地/画面串流模式：运行时随机判定（更自然的节奏）
    let isBonus = false;
    if (this.isOnline && !this.streamMode) {
      isBonus = spec.isBonus;
    } else {
      const hasBonusOnScreen = this.enemies.some((e) => e.alive && e.isBonus);
      if (!hasBonusOnScreen && this.bonusSpawned < CONFIG.maxBonusPerStage) {
        const remaining = this.enemiesRemaining;
        const chance = remaining <= CONFIG.maxBonusPerStage - this.bonusSpawned ? 1 : 0.35;
        if (Math.random() < chance) isBonus = true;
      }
    }
    if (isBonus) this.bonusSpawned++;

    const enemy = new Tank(this, pt.x, pt.y, {
      type: spec.type,
      dir: DIR.DOWN,
      isBonus: isBonus,
      spawnTimer: 50,
    });
    enemy.enemyId = this._nextEnemyId++;
    this.enemies.push(enemy);
    this.enemiesRemaining--;
    this.spawnIndex++;
    this.spawnTimer = this._getSpawnInterval();

    // 不再向客机广播 ENEMY_SPAWN（客机自己独立运行 _handleSpawning）
    // 只保留 AI_DIRECTION / ENEMY_KILLED / PLAYER_HIT 等关键事件的广播
  }

  _getSpawnInterval() {
    const onScreen = this.enemies.length;
    return CONFIG.spawnIntervalBase + onScreen * CONFIG.spawnIntervalStep;
  }

  _bulletVsBullet() {
    const bs = this.bullets;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (!b.alive) continue;
        if (a.fromPlayer === b.fromPlayer) continue;
        if (rectsOverlap(a.rect(), b.rect())) {
          a.alive = false;
          b.alive = false;
        }
      }
    }
  }

  _updateExplosions() {
    for (const ex of this.explosions) ex.update();
    this.explosions = this.explosions.filter((ex) => ex.alive);
  }

  _handlePickup() {
    const players = [];
    if (this.player && this.player.alive) players.push(this.player);
    if (this.player2 && this.player2.alive) players.push(this.player2);
    if (players.length === 0) return;

    for (const p of this.powerups) {
      if (!p.alive) continue;
      for (const pl of players) {
        if (rectsOverlap(pl.rect(), p.rect())) {
          p.alive = false;
          this.applyPowerUp(p.type, pl);
          break;
        }
      }
    }
  }

  _checkStageEnd() {
    if (
      this.state === "playing" &&
      this.enemiesRemaining <= 0 &&
      this.enemies.length === 0
    ) {
      // 所有敌人消灭后，延迟几秒再进入过关画面，给玩家捡道具的时间
      if (!this.stageClearDelay) {
        this.stageClearDelay = 180; // 3 秒延迟
      }
      this.stageClearDelay--;
      if (this.stageClearDelay <= 0) {
        this.stageClearDelay = 0;
        if (this.player && this.player.alive) {
          this.playerState = {
            level: this.player.level,
            hasBoat: this.player.hasBoat,
          };
        }
        if (this.player2 && this.player2.alive) {
          this.player2State = {
            level: this.player2.level,
            hasBoat: this.player2.hasBoat,
          };
        }

        // 联机模式（主机）：在进入 stageclear 前向客机发送 STAGE_TRANSITION
        if (this.isOnline && this.onlineRole === "host") {
          const nextStageIndex = (this.stageIndex + 1) % 35;
          this._sendStageTransition(nextStageIndex);
        }

        this.state = "stageclear";
        this.stageClearTimer = 180;
      }
    }
  }

  /* -------------------- 网络同步辅助 -------------------- */

  /**
   * Host 每帧发送紧凑实体帧给 Guest。
   * 格式（二进制 ArrayBuffer）：
   *   [msgType=0x20] [frame(4)] [eventType=0xFF 标识实体帧]
   *   [enemyCount(1)]
   *   每辆敌人: [x_lo, x_hi, y_lo, y_hi, dir, alive, hp, type, spawnTimer>0?1:0] = 9 字节
   *   [bulletCount(1)]
   *   每颗子弹: [x_lo, x_hi, y_lo, y_hi, dir, fromPlayer] = 6 字节
   *   [p1x_lo, p1x_hi, p1y_lo, p1y_hi, p1dir, p1alive]
   *   [p2x_lo, p2x_hi, p2y_lo, p2y_hi, p2dir, p2alive]
   *   [enemiesRemaining, enemiesKilled, lives, lives2]
   *
   * 总大小：~头部7 + 敌人(5×9=45) + 子弹(~10×6=60) + 玩家12 + 计数4 ≈ 128 字节/帧
   */
  _sendEntityFrame() {
    if (!NetManager.dc || NetManager.dc.readyState !== "open") return;

    const enemies = this.enemies;
    const bullets = this.bullets;
    const enemyCount = Math.min(enemies.length, 20);
    const bulletCount = Math.min(bullets.length, 30);

    // 计算总大小：头部 6 + 1（enemyCount）+ enemies*9 + 1（bulletCount）+ bullets*6 + 12（players）+ 4（counters）+ 1（dirtyCount）+ dirty*3
    const dirtyTiles = this.level._dirtyTiles || [];
    const maxDirty = Math.min(Math.floor(dirtyTiles.length / 3), 50);
    const size = 6 + 1 + enemyCount * 9 + 1 + bulletCount * 6 + 12 + 4 + 1 + maxDirty * 3;
    const buf = new ArrayBuffer(size);
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);

    // 头部：使用 GAME_EVENT + eventType=0xFF 标识这是实体帧
    view.setUint8(0, SyncMessage.MSG.GAME_EVENT);
    view.setUint32(1, this.frame >>> 0, false);
    view.setUint8(5, 0xFF); // 特殊 eventType 表示实体帧

    let offset = 6;

    // 敌人数据
    bytes[offset++] = enemyCount;
    for (let i = 0; i < enemyCount; i++) {
      const e = enemies[i];
      const ex = Math.round(e.x) & 0xFFFF;
      const ey = Math.round(e.y) & 0xFFFF;
      bytes[offset++] = ex & 0xFF;
      bytes[offset++] = (ex >> 8) & 0xFF;
      bytes[offset++] = ey & 0xFF;
      bytes[offset++] = (ey >> 8) & 0xFF;
      bytes[offset++] = e.dir;
      bytes[offset++] = e.alive ? 1 : 0;
      bytes[offset++] = e.health || 1;
      const typeMap = { basic: 0, fast: 1, power: 2, armor: 3 };
      bytes[offset++] = typeMap[e.type] || 0;
      bytes[offset++] = e.spawnTimer > 0 ? 1 : 0;
    }

    // 子弹数据
    bytes[offset++] = bulletCount;
    for (let i = 0; i < bulletCount; i++) {
      const b = bullets[i];
      const bx = Math.round(b.x) & 0xFFFF;
      const by = Math.round(b.y) & 0xFFFF;
      bytes[offset++] = bx & 0xFF;
      bytes[offset++] = (bx >> 8) & 0xFF;
      bytes[offset++] = by & 0xFF;
      bytes[offset++] = (by >> 8) & 0xFF;
      bytes[offset++] = b.dir;
      bytes[offset++] = b.fromPlayer ? 1 : 0;
    }

    // 玩家状态
    const p1 = this.player;
    const p1x = p1 && p1.alive ? Math.round(p1.x) & 0xFFFF : 0;
    const p1y = p1 && p1.alive ? Math.round(p1.y) & 0xFFFF : 0;
    bytes[offset++] = p1x & 0xFF;
    bytes[offset++] = (p1x >> 8) & 0xFF;
    bytes[offset++] = p1y & 0xFF;
    bytes[offset++] = (p1y >> 8) & 0xFF;
    bytes[offset++] = p1 ? p1.dir : 0;
    bytes[offset++] = (p1 && p1.alive) ? 1 : 0;

    const p2 = this.player2;
    const p2x = p2 && p2.alive ? Math.round(p2.x) & 0xFFFF : 0;
    const p2y = p2 && p2.alive ? Math.round(p2.y) & 0xFFFF : 0;
    bytes[offset++] = p2x & 0xFF;
    bytes[offset++] = (p2x >> 8) & 0xFF;
    bytes[offset++] = p2y & 0xFF;
    bytes[offset++] = (p2y >> 8) & 0xFF;
    bytes[offset++] = p2 ? p2.dir : 0;
    bytes[offset++] = (p2 && p2.alive) ? 1 : 0;

    // 计数器
    bytes[offset++] = this.enemiesRemaining;
    bytes[offset++] = this.enemiesKilled;
    bytes[offset++] = this.lives;
    bytes[offset++] = this.lives2;

    // 地图变化（脏格子）
    const dirty = this.level._dirtyTiles || [];
    const dirtyCount = Math.min(Math.floor(dirty.length / 3), 50); // 每组 3 个值（cx, cy, type），最多 50 个
    bytes[offset++] = dirtyCount;
    for (let i = 0; i < dirtyCount * 3; i++) {
      bytes[offset++] = dirty[i];
    }
    // 清空脏队列
    this.level._dirtyTiles = [];

    // 发送实际使用的字节数
    NetManager.dc.send(buf.slice(0, offset));
  }

  /**
   * Guest 处理实体帧：直接覆盖本地敌人/子弹/玩家的位置和状态。
   * @param {Uint8Array} data - eventType(0xFF) 之后的原始数据
   */
  _applyEntityFrame(data) {
    if (!data || data.length < 2) return;
    let offset = 0;

    // 敌人
    const enemyCount = data[offset++];
    const typeNames = ["basic", "fast", "power", "armor"];

    // 调整本地敌人列表大小
    while (this.enemies.length < enemyCount) {
      // 需要新增敌人（主机刷出了新的）
      const e = new Tank(this, 0, 0, { type: "basic", dir: DIR.DOWN, spawnTimer: 0 });
      e.alive = true;
      this.enemies.push(e);
    }
    // 多余的移除
    if (this.enemies.length > enemyCount) {
      this.enemies.length = enemyCount;
    }

    for (let i = 0; i < enemyCount; i++) {
      const e = this.enemies[i];
      const ex = data[offset] | (data[offset + 1] << 8); offset += 2;
      const ey = data[offset] | (data[offset + 1] << 8); offset += 2;
      const dir = data[offset++];
      const alive = data[offset++] !== 0;
      const hp = data[offset++];
      const typeId = data[offset++];
      const spawning = data[offset++] !== 0;

      e.x = ex;
      e.y = ey;
      e.dir = dir;
      e.alive = alive;
      e.health = hp;
      e.type = typeNames[typeId] || "basic";
      e.pal = PALETTE[e.type];
      e._needsExtrapolation = false; // 收到实体帧，不需要外推了
      e.moving = true;
      if (spawning && e.spawnTimer <= 0) e.spawnTimer = 1; // 保持出生动画
      if (!spawning) e.spawnTimer = 0;
    }

    // 子弹：客机自己跑子弹模拟（碰撞/爆炸/音效），不从实体帧覆盖
    // 只需跳过子弹数据段
    const bulletCount = data[offset++];
    offset += bulletCount * 6; // 每颗子弹 6 字节，直接跳过

    // 玩家状态
    if (this.player) {
      const p1x = data[offset] | (data[offset + 1] << 8); offset += 2;
      const p1y = data[offset] | (data[offset + 1] << 8); offset += 2;
      const p1dir = data[offset++];
      const p1alive = data[offset++] !== 0;
      // 只同步主机控制的 P1 位置（客机本地 P2 由本地输入驱动）
      this.player.x = p1x;
      this.player.y = p1y;
      this.player.dir = p1dir;
      if (!p1alive && this.player.alive) {
        this.player.alive = false;
        const c = this.player.center();
        this.addExplosion(c.x, c.y, "boom2");
      }
      this.player.alive = p1alive;
    } else {
      offset += 6;
    }

    if (this.player2) {
      const p2x = data[offset] | (data[offset + 1] << 8); offset += 2;
      const p2y = data[offset] | (data[offset + 1] << 8); offset += 2;
      const p2dir = data[offset++];
      const p2alive = data[offset++] !== 0;
      // P2 是客机本地控制的——不覆盖位置（保持本地响应性）
      // 但同步存活状态
      if (!p2alive && this.player2.alive) {
        this.player2.alive = false;
        const c = this.player2.center();
        this.addExplosion(c.x, c.y, "boom2");
      }
      // 不覆盖 p2 的 x/y/dir（由本地输入驱动）
    } else {
      offset += 6;
    }

    // 计数器
    if (offset + 4 <= data.length) {
      this.enemiesRemaining = data[offset++];
      this.enemiesKilled = data[offset++];
      this.lives = data[offset++];
      this.lives2 = data[offset++];
    }

    // 地图变化（脏格子）
    if (offset < data.length) {
      const dirtyCount = data[offset++];
      for (let i = 0; i < dirtyCount && offset + 2 < data.length; i++) {
        const cx = data[offset++];
        const cy = data[offset++];
        const type = data[offset++];
        if (this.level && this.level.inBounds && this.level.inBounds(cx, cy)) {
          this.level.grid[cy][cx] = type;
        }
      }
    }

    this.updateHUD();
  }

  /**
   * Host sends STAGE_TRANSITION to guest with the next stage index.
   */
  _sendStageTransition(nextStageIndex) {
    if (this.streamMode) return; // 串流模式不需要
    if (!NetManager.dc || NetManager.dc.readyState !== "open") return;
    const buffer = SyncMessage.encode(
      SyncMessage.MSG.STAGE_TRANSITION,
      this.frame,
      { nextStageIndex }
    );
    NetManager.dc.send(buffer);
  }

  /**
   * Host 发送当前关卡的敌人队列给 Guest（用 STATE_SNAPSHOT 消息承载）。
   * 这确保两边用同一个队列顺序刷怪，消除随机洗牌导致的差异。
   */
  _sendEnemyQueue() {
    if (this.streamMode) return; // 串流模式不需要
    if (!NetManager.dc || NetManager.dc.readyState !== "open") return;
    const data = JSON.stringify({ enemyQueue: this.enemyQueue });
    const buffer = SyncMessage.encode(
      SyncMessage.MSG.STATE_SNAPSHOT,
      this.frame,
      { json: data }
    );
    NetManager.dc.send(buffer);
  }

  /**
   * Host sends STATE_SNAPSHOT to guest containing the full game state
   * so the guest can synchronize map, enemy queue, player positions, etc.
   */
  _sendStateSnapshot() {
    if (this.streamMode) return; // 串流模式不需要
    if (!NetManager.dc || NetManager.dc.readyState !== "open") return;
    const json = this._buildStateSnapshot();
    const buffer = SyncMessage.encode(
      SyncMessage.MSG.STATE_SNAPSHOT,
      this.frame,
      { json }
    );
    NetManager.dc.send(buffer);
  }

  /**
   * Build a JSON string representing the current full game state for syncing.
   */
  _buildStateSnapshot() {
    const snapshot = {
      frame: this.frame,
      stageIndex: this.stageIndex,
      score: this.score,
      lives: this.lives,
      lives2: this.lives2,
      freezeTimer: this.freezeTimer,
      shovelTimer: this.shovelTimer,
      enemyQueue: this.enemyQueue.slice(
        this.enemyQueue.length - this.enemiesRemaining
      ),
      enemiesKilled: this.enemiesKilled,
      mapGrid: this.level.grid,
      baseAlive: this.level.baseAlive,
      players: {
        p1: this._snapshotPlayer(this.player, this.playerState, this.lives),
        p2: this._snapshotPlayer(this.player2, this.player2State, this.lives2),
      },
      enemies: this.enemies.map((e, i) => ({
        x: e.x,
        y: e.y,
        dir: e.dir,
        type: e.type,
        hp: e.hp,
        isBonus: e.isBonus,
        id: i,
      })),
      bullets: this.bullets.map((b) => ({
        x: b.x,
        y: b.y,
        dir: b.dir,
        speed: b.speed,
        fromPlayer: b.fromPlayer,
      })),
      powerups: this.powerups.map((p) => ({
        x: p.x,
        y: p.y,
        type: p.type,
      })),
      spawnIndex: this.spawnIndex,
      spawnTimer: this.spawnTimer,
      bonusSpawned: this.bonusSpawned,
    };
    return JSON.stringify(snapshot);
  }

  /**
   * Helper to snapshot a player's relevant state.
   */
  _snapshotPlayer(player, playerState, lives) {
    if (player && player.alive) {
      return {
        x: player.x,
        y: player.y,
        dir: player.dir,
        level: player.level,
        hasBoat: player.hasBoat,
        alive: true,
        lives,
      };
    }
    return {
      x: 0,
      y: 0,
      dir: DIR.UP,
      level: playerState ? playerState.level : 0,
      hasBoat: playerState ? playerState.hasBoat : false,
      alive: false,
      lives,
    };
  }

  /**
   * Guest handler: receive STAGE_TRANSITION and advance to the indicated stage.
   * Called from the message routing layer when a STAGE_TRANSITION message arrives.
   */
  _handleStageTransitionMsg(payload) {
    if (!payload || payload.nextStageIndex == null) return;
    const nextIndex = payload.nextStageIndex % 35;

    // 保存玩家状态（与主机逻辑一致）
    if (this.player && this.player.alive) {
      this.playerState = {
        level: this.player.level,
        hasBoat: this.player.hasBoat,
      };
    }
    if (this.player2 && this.player2.alive) {
      this.player2State = {
        level: this.player2.level,
        hasBoat: this.player2.hasBoat,
      };
    }

    this.stageIndex = nextIndex;
    this.state = "stageclear";
    this.stageClearTimer = 180;
  }

  /**
   * Guest handler: receive STATE_SNAPSHOT and replace local state.
   * Called from the message routing layer when a STATE_SNAPSHOT message arrives.
   */
  _handleStateSnapshotMsg(payload) {
    if (!payload || !payload.json) return;
    let snapshot;
    try {
      snapshot = JSON.parse(payload.json);
    } catch (e) {
      console.error("[Game] Failed to parse STATE_SNAPSHOT:", e);
      return;
    }

    // 轻量同步：只包含 enemyQueue（用于开局/过关时同步队列顺序）
    if (snapshot.enemyQueue && !snapshot.hasOwnProperty("stageIndex")) {
      this.enemyQueue = snapshot.enemyQueue;
      this.enemiesRemaining = snapshot.enemyQueue.length;
      return;
    }

    // 重置重同步状态——快照接收成功
    this._resyncAttempts = 0;
    this._resyncTimer = 0;
    this._divergenceCount = 0;
    // 由于正在重置状态，清空待处理事件
    this._pendingEvents = [];

    // 将快照应用到本地游戏状态
    this.frame = snapshot.frame || this.frame;
    this.stageIndex = snapshot.stageIndex;
    this.score = snapshot.score;
    this.lives = snapshot.lives;
    this.lives2 = snapshot.lives2;
    this.freezeTimer = snapshot.freezeTimer || 0;
    this.shovelTimer = snapshot.shovelTimer || 0;
    this.enemiesKilled = snapshot.enemiesKilled || 0;

    // 根据快照网格重新加载关卡地图（不重建 Level 对象，只更新网格数据）
    if (snapshot.mapGrid && this.level && this.level.grid) {
      for (let y = 0; y < snapshot.mapGrid.length && y < SUB; y++) {
        for (let x = 0; x < snapshot.mapGrid[y].length && x < SUB; x++) {
          this.level.grid[y][x] = snapshot.mapGrid[y][x];
        }
      }
    }
    if (snapshot.baseAlive !== undefined && this.level) {
      this.level.baseAlive = snapshot.baseAlive;
    }

    // 恢复敌人队列
    if (snapshot.enemyQueue) {
      this.enemyQueue = snapshot.enemyQueue;
      this.enemiesRemaining = Math.min(snapshot.enemyQueue.length, this.enemyQueue.length);
    }

    // 恢复动态实体
    // 子弹不从快照恢复（生命周期极短，客机自己模拟会产生）
    // 只清除旧的爆炸动画
    this.explosions = [];

    // 从快照中恢复道具
    this.powerups = [];
    if (snapshot.powerups && snapshot.powerups.length > 0) {
      for (const pData of snapshot.powerups) {
        this.powerups.push(new PowerUp(pData.x, pData.y, pData.type));
      }
    }

    // 从快照中恢复敌人列表
    this.enemies = [];
    if (snapshot.enemies && snapshot.enemies.length > 0) {
      for (const eData of snapshot.enemies) {
        const enemy = new Tank(this, eData.x, eData.y, {
          type: eData.type || "basic",
          dir: eData.dir != null ? eData.dir : DIR.DOWN,
          isBonus: eData.isBonus || false,
          spawnTimer: 0,
        });
        enemy.enemyId = eData.id != null ? eData.id : 0;
        enemy.hp = eData.hp != null ? eData.hp : 1;
        enemy.alive = true;
        this.enemies.push(enemy);
      }
    }

    // 恢复刷怪计数器
    if (snapshot.spawnIndex != null) this.spawnIndex = snapshot.spawnIndex;
    if (snapshot.spawnTimer != null) this.spawnTimer = snapshot.spawnTimer;
    if (snapshot.bonusSpawned != null) this.bonusSpawned = snapshot.bonusSpawned;

    // 恢复玩家状态
    if (snapshot.players) {
      if (snapshot.players.p1 && this.player) {
        const p1 = snapshot.players.p1;
        this.player.x = p1.x;
        this.player.y = p1.y;
        this.player.dir = p1.dir;
        this.player.level = p1.level;
        this.player.hasBoat = p1.hasBoat;
        this.player.alive = p1.alive;
      }
      if (snapshot.players.p2 && this.player2) {
        const p2 = snapshot.players.p2;
        this.player2.x = p2.x;
        this.player2.y = p2.y;
        this.player2.dir = p2.dir;
        this.player2.level = p2.level;
        this.player2.hasBoat = p2.hasBoat;
        this.player2.alive = p2.alive;
      }
    }

    // 只在非 playing 状态时才切换（定时对齐时已经是 playing，不需要重设）
    if (this.state !== "playing" && this.state !== "stageclear" && this.state !== "gameover") {
      this.state = "playing";
    }
    this.updateHUD();
  }

  /* -------------------- 事件回调 -------------------- */

  allTanks() {
    const list = [];
    if (this.player && this.player.alive) list.push(this.player);
    if (this.player2 && this.player2.alive) list.push(this.player2);
    for (const e of this.enemies) if (e.alive) list.push(e);
    return list;
  }

  addExplosion(x, y, kind) {
    this.explosions.push(new Explosion(x, y, kind));
    if (kind === "boom2") Sound.explosion2();
  }

  onEnemyHit(enemy, bullet) {
    if (enemy.spawnTimer > 0 || enemy.shieldTimer > 0) return;

    if (enemy.isBonus) {
      this.dropPowerUp();
      enemy.isBonus = false;
    }

    const destroyed = enemy.takeDamage();
    if (destroyed) {
      const c = enemy.center();
      this.addExplosion(c.x, c.y, "boom2");
      this.score += enemy.score;
      this._updateHiScore();
      this.enemiesKilled++;

      // 向客机广播敌人被消灭事件
      if (enemy.enemyId != null) {
        this._broadcastGameEvent(GAME_EVT.ENEMY_KILLED, [enemy.enemyId]);
      }
    } else {
      // e4 坦克被击中后变色但未被消灭
      Sound.bulletHit3();
    }
  }

  /** 玩家子弹击中另一名玩家 → 冻结（不造成伤害） */
  onPlayerStun(player, bullet) {
    if (player.spawnTimer > 0 || player.shieldTimer > 0) return;
    // 冻结约 3 秒（60fps 下 180 帧）
    player.stunTimer = 180;
    Sound.bulletHit1();
  }

  onPlayerHit(player, bullet) {
    if (player.spawnTimer > 0 || player.shieldTimer > 0) return;
    if (player.hasBoat) {
      player.hasBoat = false;
      this._syncPlayerState(player);
      Sound.bulletHit1();
      return;
    }
    const destroyed = player.takeDamage();
    if (destroyed) {
      const c = player.center();
      this.addExplosion(c.x, c.y, "boom2");
      Sound.bulletHit2();

      // 向客机广播玩家被击杀事件（playerIndex: 1=P1，2=P2）
      this._broadcastGameEvent(GAME_EVT.PLAYER_HIT, [player.playerIndex, 1]);

      if (player.playerIndex === 2) {
        this.player2State = { level: 0, hasBoat: false };
        if (this.lives2 > 0) {
          this.lives2--;
          this.respawnTimer2 = 80;
        }
      } else {
        this.playerState = { level: 0, hasBoat: false };
        if (this.lives > 0) {
          this.lives--;
          this.respawnTimer = 80;
        }
      }
      this.updateHUD();
      this._checkBothDead();
    }
  }

  _checkBothDead() {
    const p1Alive = this.player && this.player.alive;
    const p2Alive = this.player2 && this.player2.alive;
    const p1CanRespawn = this.lives > 0 || this.respawnTimer > 0;
    const p2CanRespawn = this.p2Active && (this.lives2 > 0 || this.respawnTimer2 > 0);

    if (!p1Alive && !p2Alive && !p1CanRespawn && !p2CanRespawn) {
      this.gameOver();
    }
  }

  onBaseHit() {
    if (!this.level.baseAlive) return;
    this.level.baseAlive = false;
    const bx = this.level.baseTile.x * TILE + TILE / 2;
    const by = this.level.baseTile.y * TILE + TILE / 2;
    this.addExplosion(bx, by, "boom2");
    // 广播基地被毁事件
    this._broadcastGameEvent(GAME_EVT.BASE_HIT, []);
    this.gameOver();
  }

  gameOver() {
    this.state = "gameover";
    this.gameOverTimer = 0;
    Sound.gameover();
  }

  dropPowerUp() {
    this.powerups = [];
    let tx, ty;
    for (let tries = 0; tries < 30; tries++) {
      tx = 1 + randInt(GRID - 2);
      ty = 1 + randInt(GRID - 2);
      if (this._tileAreaFree(tx, ty)) break;
    }
    const powerType = this._randomPowerType();
    const px = tx * TILE;
    const py = ty * TILE;
    this.powerups.push(new PowerUp(px, py, powerType));
    Sound.powerupAppear();

    // 向客机广播道具出生事件（由主机权威驱动）
    // 将 x、y 编码为 16 位小端值 + 类型索引
    const typeList = [POWER.STAR, POWER.TANK, POWER.GRENADE, POWER.HELMET,
                      POWER.TIMER, POWER.SHOVEL, POWER.GUN, POWER.BOAT];
    const typeIndex = typeList.indexOf(powerType);
    this._broadcastGameEvent(GAME_EVT.POWERUP_SPAWN, [
      px & 0xFF, (px >> 8) & 0xFF,
      py & 0xFF, (py >> 8) & 0xFF,
      typeIndex >= 0 ? typeIndex : 0,
    ]);
  }

  _randomPowerType() {
    const pool = [];
    const add = (t, w) => {
      for (let i = 0; i < w; i++) pool.push(t);
    };
    add(POWER.STAR, 5);
    add(POWER.TANK, 4);
    add(POWER.GRENADE, 4);
    add(POWER.HELMET, 4);
    add(POWER.TIMER, 4);
    add(POWER.SHOVEL, 4);
    add(POWER.GUN, 1);
    if (this.level.hasWater) add(POWER.BOAT, 3);
    return choice(pool);
  }

  _tileAreaFree(tx, ty) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const t = this.level.cellAt(tx * 2 + dx, ty * 2 + dy);
        if (t === TT.STEEL || t === TT.WATER || t === TT.BASE) return false;
      }
    }
    return true;
  }

  applyPowerUp(type, player) {
    this.score += 500;
    Sound.powerupPick();
    switch (type) {
      case POWER.STAR:
        if (player) {
          player.level = clamp(player.level + 1, 0, 3);
          player.applyLevel();
          this._syncPlayerState(player);
        }
        break;
      case POWER.TANK:
        if (player && player.playerIndex === 2) {
          this.lives2++;
        } else {
          this.lives++;
        }
        Sound.lifeup();
        break;
      case POWER.GRENADE:
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const c = e.center();
          this.addExplosion(c.x, c.y, "boom2");
          this.score += e.score;
          this.enemiesKilled++;
          e.alive = false;
        }
        break;
      case POWER.HELMET:
        if (player) player.shieldTimer = 60 * 8;
        break;
      case POWER.TIMER:
        this.freezeTimer = 60 * 8;
        break;
      case POWER.SHOVEL:
        this.level.fortify(true);
        this.shovelTimer = 60 * 15;
        break;
      case POWER.GUN:
        if (player) {
          player.level = clamp(player.level + 2, 0, 3);
          player.applyLevel();
          this._syncPlayerState(player);
        }
        break;
      case POWER.BOAT:
        if (player) {
          player.hasBoat = true;
          this._syncPlayerState(player);
        }
        break;
    }
    this._updateHiScore();
    this.updateHUD();
  }

  _syncPlayerState(player) {
    if (!player || !player.alive) return;
    if (player.playerIndex === 2) {
      this.player2State = { level: player.level, hasBoat: player.hasBoat };
    } else {
      this.playerState = { level: player.level, hasBoat: player.hasBoat };
    }
  }

  /* -------------------- 渲染 -------------------- */

  render() {
    const ctx = this.ctx;

    // 画面串流模式 Guest：视频元素已显示画面，canvas 不渲染游戏
    // 但仍需绘制连接状态遮罩（断线/离开提示）
    if (StreamManager.isStreamGuest() || (this.streamMode && this.onlineRole === "guest")) {
      if (this.disconnectOverlay || this.leaveOverlay) {
        // 暂时让 canvas 可见并置于 video 之上，用于绘制遮罩
        this.canvas.style.visibility = "visible";
        this.canvas.style.zIndex = "10";
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, FIELD, FIELD);
        if (this.disconnectOverlay) this._drawDisconnectOverlay();
        if (this.leaveOverlay) this._drawLeaveOverlay();
      } else {
        // 正常情况：canvas 隐藏，video 显示
        this.canvas.style.visibility = "hidden";
        this.canvas.style.zIndex = "";
      }
      return;
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, FIELD, FIELD);

    if (this.state === "title") {
      this._drawTitle();
      return;
    }

    if (this.state === "lobby") {
      this._drawLobby();
      return;
    }

    // 地面层
    this.level.drawGround(ctx, (this.frame >> 4) & 1);

    // 坦克
    const blink = (this.frame >> 2) & 1;
    for (const e of this.enemies) e.draw(ctx, blink);
    if (this.player && this.player.alive) this.player.draw(ctx, blink);
    if (this.player2 && this.player2.alive) this.player2.draw(ctx, blink);

    // 子弹
    for (const b of this.bullets) b.draw(ctx);

    // 树林
    this.level.drawTrees(ctx);

    // 道具
    for (const p of this.powerups) p.draw(ctx);

    // 爆炸
    for (const ex of this.explosions) ex.draw(ctx);

    // 覆盖层文字
    if (this.introTimer > 0) this._drawIntro();
    if (this.state === "stageclear") this._drawStageClear();
    if (this.state === "gameover") this._drawGameOver();
    if (this.paused && !this.disconnectOverlay && !this.leaveOverlay) this._drawPause();
    if (this.disconnectOverlay) this._drawDisconnectOverlay();
    if (this.leaveOverlay) this._drawLeaveOverlay();

    // 延迟 HUD（仅联机模式）
    if (this.isOnline && this.latencyDisplay) {
      this._drawLatency();
    }
  }

  _drawTitle() {
    const ctx = this.ctx;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, FIELD, FIELD);
    this._text("坦 克 大 战", FIELD / 2, 100, 34, "#ffd34d", "bold");
    this._text("BATTLE CITY", FIELD / 2, 132, 16, "#8b8f99", "bold");

    Sprites.drawPlayerTank(ctx, FIELD / 2 - 16, 165, DIR.UP, 1, 0);

    // 菜单选项
    const menuY = 235;
    const spacing = 36;
    this._text("1 PLAYER", FIELD / 2, menuY, 16, "#e8e8e8");

    if (!this.isMobile) {
      this._text("2 PLAYERS", FIELD / 2, menuY + spacing, 16, "#e8e8e8");
      this._text("网络联机", FIELD / 2, menuY + spacing * 2, 16, "#e8e8e8");
      // 光标
      const cursorY = menuY + this.titleCursor * spacing;
      Sprites.drawPlayerTank(ctx, FIELD / 2 - 80, cursorY - 16, DIR.RIGHT, 0, (this.frame >> 3) & 1);
    } else {
      this._text("网络联机", FIELD / 2, menuY + spacing, 16, "#e8e8e8");
      // 光标
      const cursorY = menuY + this.titleCursor * spacing;
      Sprites.drawPlayerTank(ctx, FIELD / 2 - 80, cursorY - 16, DIR.RIGHT, 0, (this.frame >> 3) & 1);
    }

    if ((this.frame >> 4) & 1) {
      this._text("任意设备按 START 开始", FIELD / 2, 335, 13, "#aab0bb");
    }
    if (!this.isMobile) {
      this._text("A: WASD+空格 | B: 方向键+Num1 | C: IJKL+U", FIELD / 2, 362, 10, "#aab0bb");
      this._text("游戏中其他设备按START加入为P2", FIELD / 2, 382, 11, "#aab0bb");
    }
    this._text("保卫基地 · 消灭 20 辆敌军坦克", FIELD / 2, 400, 11, "#7a7e88");
  }

  _drawIntro() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(0, FIELD / 2 - 34, FIELD, 68);
    this._text("第 " + (this.stageIndex + 1) + " 关", FIELD / 2, FIELD / 2 + 6, 26, "#ffd34d", "bold");
  }

  _drawStageClear() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, FIELD / 2 - 40, FIELD, 80);
    this._text("关 卡 完 成", FIELD / 2, FIELD / 2 - 4, 26, "#5fd96a", "bold");
    this._text("得分 " + this.score, FIELD / 2, FIELD / 2 + 24, 14, "#e8e8e8");
  }

  _drawGameOver() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(0, 0, FIELD, FIELD);
    const img = Assets.images["gameoverBig"];
    if (img && img.complete && img.naturalWidth > 0) {
      const scale = 2;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, (FIELD - w) / 2, FIELD / 2 - h / 2 - 40, w, h);
    } else {
      this._text("游 戏 结 束", FIELD / 2, FIELD / 2 - 40, 34, "#ff5b4d", "bold");
    }
    this._text("最终得分 " + this.score, FIELD / 2, FIELD / 2 + 70, 16, "#e8e8e8");
    if ((this.frame >> 4) & 1) {
      this._text("按 START 重新开始", FIELD / 2, FIELD / 2 + 100, 14, "#aab0bb");
    }
  }

  _drawPause() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, FIELD / 2 - 30, FIELD, 60);
    this._text("暂 停", FIELD / 2, FIELD / 2 + 8, 28, "#ffd34d", "bold");
  }

  _drawDisconnectOverlay() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, FIELD / 2 - 50, FIELD, 100);
    this._text("对方已断开连接", FIELD / 2, FIELD / 2 - 10, 22, "#ff5b4d", "bold");
    if ((this.frame >> 4) & 1) {
      this._text("等待重连中...", FIELD / 2, FIELD / 2 + 24, 14, "#aab0bb");
    }
  }

  _drawLeaveOverlay() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, FIELD / 2 - 50, FIELD, 100);
    this._text("对方已退出", FIELD / 2, FIELD / 2 - 10, 22, "#ff5b4d", "bold");
    this._text("返回标题画面...", FIELD / 2, FIELD / 2 + 24, 14, "#aab0bb");
  }

  _drawLatency() {
    const ctx = this.ctx;
    const color = this.latencyWarning ? "#ff5b4d" : "#5fd96a";
    const size = this.isMobile ? 10 : 11;
    // 绘制在右上角区域，左对齐
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px "Microsoft YaHei", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(this.latencyDisplay, FIELD - 4, 4);
    // 为其他绘制调用重置对齐
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  }

  _text(str, x, y, size, color, weight = "normal") {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px "Microsoft YaHei", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(str, x, y);
  }

  /* -------------------- HUD -------------------- */

  /** 更新最高分：只在分数超越记录时写入 localStorage */
  _updateHiScore() {
    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      try { localStorage.setItem("battleCity_hiScore", String(this.hiScore)); } catch (e) {}
    }
  }

  updateHUD() {
    this.dom.score.textContent = this.score;
    this.dom.hiscore.textContent = this.hiScore;
    this.dom.stage.textContent = (this.stageIndex || 0) + 1;

    // P1 生命图标
    const lifeContainer = this.dom.lifeIcons;
    const currentLifeCount = lifeContainer.children.length;
    const targetLives = this.lives;
    if (currentLifeCount !== targetLives) {
      lifeContainer.innerHTML = "";
      for (let i = 0; i < targetLives; i++) {
        const d = document.createElement("div");
        d.className = "p";
        lifeContainer.appendChild(d);
      }
    }

    // P2 生命图标
    const p2Panel = this.dom.p2Panel;
    if (this.p2Active) {
      p2Panel.style.display = "";
      const lifeContainer2 = this.dom.lifeIcons2;
      const currentLifeCount2 = lifeContainer2.children.length;
      const targetLives2 = this.lives2;
      if (currentLifeCount2 !== targetLives2) {
        lifeContainer2.innerHTML = "";
        for (let i = 0; i < targetLives2; i++) {
          const d = document.createElement("div");
          d.className = "p p2";
          lifeContainer2.appendChild(d);
        }
      }
    } else {
      p2Panel.style.display = "none";
    }

    const remaining = CONFIG.enemiesPerStage - (this.enemiesKilled || 0);
    for (let i = 0; i < this.enemyCells.length; i++) {
      this.enemyCells[i].classList.toggle("alive", i < remaining);
    }

    // 移动端紧凑 HUD
    if (this.dom.mhudStage) {
      this.dom.mhudStage.textContent = (this.stageIndex || 0) + 1;
      this.dom.mhudEnemy.textContent = remaining;
      this.dom.mhudP1.textContent = this.lives;
      if (this.p2Active) {
        this.dom.mhudP2Wrap.classList.add("active");
        this.dom.mhudP2.textContent = this.lives2;
      } else {
        this.dom.mhudP2Wrap.classList.remove("active");
      }
    }
  }
}

// Node.js 环境导出（用于测试）
if (typeof module !== "undefined" && module.exports) {
  module.exports = Game;
}
