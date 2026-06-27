/* =========================================================
 * Input_Bridge —— 远程输入桥接模块
 *
 * 负责：
 *   1. 每帧读取本地输入并通过数据通道发送给对端
 *   2. 接收对端输入并注入 Input 系统的“remote”虚拟设备
 *   3. 帧排序（丢弃旧帧）和过期输入保持
 *
 * 依赖：
 *   - Input（全局）: setRemoteInput, bindP1, bindP2,
 *         getDirection, isFire, getDirection2, isFire2
 *   - NetManager（全局）: dc（数据通道）
 *   - SyncMessage（全局）: MSG.INPUT, encode
 * ========================================================= */

const InputBridge = {

  /* ========== 状态 ========== */
  remoteDir: null,          // 最近一次收到的对端方向：0=上 1=右 2=下 3=左，null=无方向
  remoteFire: false,        // 最近一次收到的对端开火状态
  lastRemoteFrame: -1,      // 上一条已应用消息的帧号（用于排序，丢弃旧帧）
  framesSinceLastMsg: 0,    // 距上次收到消息已过去的帧数（≥5 时为"过期输入"，但不清除）
  localFrame: 0,            // 本地帧计数器（每帧+1，溢出到 0，用于标记发出消息的顺序）
  role: null,               // 当前角色：“host”（本地=P1）或“guest”（本地=P2）

  /* ========== 方法 ========== */

  /**
   * 初始化：将“remote”虚拟设备绑定到对应玩家槽位。
   * 主机（房主）本地控制 P1，远端控制 P2 → Input.bindP2("remote")
   * 客机（加入者）本地控制 P2，远端控制 P1 → Input.bindP1("remote")
   */
  init(role) {
    this.role = role;
    if (role === "host") {
      // 主机将远端绑定为 P2
      Input.bindP2("remote");
    } else {
      Input.bindP1("remote");
    }
  },

  /**
   * 发送本地输入到对端。
   * 将方向和开火状态编码为 7 字节 INPUT 消息，通过 DataChannel 发送。
   * 如果 DataChannel 未打开则跳过（不排队、不缓存）。
   */
  sendLocalInput(dir, fire) {
    // 如果数据通道不可用或未打开，则跳过发送
    if (!NetManager.dc || NetManager.dc.readyState !== "open") {
      return;
    }

    // 编码方向：0-3 对应 上/右/下/左，4 表示无方向（null）
    const dirValue = (dir != null) ? dir : 4;
    const buffer = SyncMessage.encode(
      SyncMessage.MSG.INPUT,
      this.localFrame,
      { dir: dirValue, fire: !!fire }
    );
    NetManager.dc.send(buffer);
  },

  /**
   * 接收对端输入。
   * 帧排序：如果收到的帧号 ≤ 上一条已应用的帧号，视为过期/重复消息，直接丢弃。
   * 否则更新远端输入状态并注入 Input 系统。
   */
  receiveRemoteInput(frameNum, dir, fire) {
    // 帧排序：丢弃过期/重复的消息
    if (frameNum <= this.lastRemoteFrame) {
      return;
    }

    // 更新远端输入状态
    this.remoteDir = dir;
    this.remoteFire = fire;
    this.lastRemoteFrame = frameNum;
    this.framesSinceLastMsg = 0;

    // 注入到 Input 系统
    Input.setRemoteInput(dir, fire);
  },

  /**
   * 每帧调用（在线游戏期间由游戏主循环调用）。
   * 1. 递增本地帧号（溢出后自动绕回 0）
   * 2. 读取本地玩家的当前方向和开火状态
   * 3. 发送给对端
   * 4. 递增"过期帧计数器"
   *
   * 关于过期输入：即使超过 5 帧未收到对端消息，也不会清除远端输入，
   * 继续使用上一次收到的值（避免远端角色突然停止）。
   */
  tick() {
    // 1. 递增本地帧计数器（在 2^32 处回绕）
    this.localFrame = (this.localFrame + 1) >>> 0;

    // 2. 根据角色读取本地玩家输入
    let dir, fire;
    if (this.role === "host") {
      // 主机是 P1 —— 读取 P1 的本地设备输入
      dir = Input.getDirection();
      fire = Input.isFire();
    } else {
      // 客机是 P2 —— 读取 P2 的本地设备输入
      dir = Input.getDirection2();
      fire = Input.isFire2();
    }

    // 3. 将本地输入发送到远端
    this.sendLocalInput(dir, fire);

    // 4. 递增过期计数器
    this.framesSinceLastMsg++;
  },

  /**
   * 重置所有状态（断线/会话结束时调用）。
   * 同时清空 Input 系统中的远端输入。
   */
  reset() {
    this.remoteDir = null;
    this.remoteFire = false;
    this.lastRemoteFrame = -1;
    this.framesSinceLastMsg = 0;
    this.localFrame = 0;
    this.role = null;

    // 清空 Input 系统中的远端输入
    Input.setRemoteInput(null, false);
  },

};
