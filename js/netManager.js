/* =========================================================
 * Net_Manager — 网络管理模块（WebRTC + Socket.IO 信令）
 *
 * 职责：
 *   1. 通过 Socket.IO 与信令服务器通信（创建/加入房间、交换 SDP/ICE）
 *   2. 建立 WebRTC P2P 连接，创建 DataChannel 用于游戏数据传输
 *   3. 管理连接生命周期（状态机）、断线重连、延迟测量
 *
 * 状态机流转：
 *   idle → signaling → connecting → connected → disconnected
 *   │                                              │
 *   └──────────── 重连成功回到 connected ──────────┘
 *
 * 依赖：
 *   - Socket.IO 客户端（通过 CDN <script> 标签加载，提供全局 io()）
 *   - SyncMessage 全局对象（二进制消息编解码）
 * ========================================================= */

const NetManager = {

  /* ===================== 核心状态 ===================== */

  socket: null,           // Socket.IO 实例，与信令服务器的 WebSocket 连接
  pc: null,               // RTCPeerConnection 实例，P2P 连接载体
  dc: null,               // RTCDataChannel 实例，P2P 数据通道（标签“game-input”）
  role: null,             // 当前角色：“host”（房主/P1）或“guest”（加入者/P2）
  roomId: null,           // 房间 ID（6 位字母数字，如“A3xZ9b”）
  peerId: null,           // 对端的 Socket.IO ID（用于信令消息的路由目标）
  state: "idle",          // 连接状态机：idle=空闲 | signaling=信令交换中 | connecting=WebRTC 握手中 | connected=已连接 | disconnected=已断开
  reconnectTimer: null,   // 断线重连定时器句柄（10 秒窗口期）

  /* ===================== 内部定时器 ===================== */

  _roomTimeout: null,     // 房间操作超时定时器（10 秒内服务器未响应则报错）
  _webrtcTimeout: null,   // WebRTC 连接超时定时器（30 秒内 P2P 连不上则放弃）
  _iceTimeout: null,      // ICE 收集超时定时器（15 秒内无可用候选则判定 NAT 穿透失败）

  /* ===================== 延迟测量（Ping/Pong） ===================== */

  latency: null,          // 最近一次测量的往返延迟（毫秒），null 表示尚未测量
  _pingFrame: 0,          // 帧计数器，每 60 帧（1 秒）发送一次 PING
  _pendingPingTs: null,   // 当前待确认 PING 的发送时间戳（performance.now）
  _pongTimeout: null,     // PONG 超时定时器（2000ms 内未收到回复则视为超时）
  onLatencyUpdate: null,  // 延迟更新回调：收到测量结果时触发，参数为毫秒数或“timeout”字符串

  /* ===================== 外部回调钩子 ===================== */

  onStateChange: null,    // 状态变更回调：(newState: string) => void
  onRoomCreated: null,    // 房间创建成功回调：(roomId: string) => void
  onPeerJoined: null,     // 对端加入房间回调：() => void
  onDataChannelOpen: null,// 数据通道打开回调（此时可开始游戏）：() => void
  onMessage: null,        // 收到对端消息回调：(msgType, payload, frameNumber) => void
  onError: null,          // 错误回调：(errorMsg: string) => void（中文错误信息）
  onPeerDisconnected: null, // 对端断开连接回调（已连接状态下检测到断连）：() => void
  onPeerReconnected: null,  // 对端重连成功回调（10 秒窗口期内恢复连接）：() => void
  onPcCreated: null,        // PeerConnection 创建完成回调（addTrack 的时机）：(pc) => void

  /* ===================== 状态机管理 ===================== */

  /**
   * 切换连接状态。如果从 "connected" → "disconnected"，
   * 自动启动 10 秒重连计时器并触发 onPeerDisconnected 回调。
   */
  _setState(newState) {
    if (this.state === newState) return;
    const prevState = this.state;
    this.state = newState;
    if (this.onStateChange) this.onStateChange(newState);

    // 对端断线检测：从“connected”状态转移到“disconnected”
    if (prevState === "connected" && newState === "disconnected") {
      this._startReconnectTimer();
      if (this.onPeerDisconnected) this.onPeerDisconnected();
    }
  },

  /**
   * 启动 10 秒重连窗口期。
   * 在此期间如果对端重新建立了标签为“game-input”的数据通道，视为重连成功。
   * 超时后触发 onError("重连超时")。
   */
  _startReconnectTimer() {
    this._clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // 计时器超时未重连——触发错误
      if (this.state === "disconnected") {
        if (this.onError) this.onError("重连超时");
      }
    }, 10000);

    // 监听新的传入数据通道（对端可能使用新通道重连）
    if (this.pc) {
      this.pc.ondatachannel = (event) => {
        if (event.channel && event.channel.label === "game-input") {
          console.log("[NetManager] Reconnected: new data channel received");
          this.dc = event.channel;
          this._setupDataChannel();
          // 数据通道打开后将通过状态转换触发重连成功
        }
      };
    }
  },

  /**
   * 重连成功处理：清除计时器，恢复“connected”状态，触发回调。
   */
  _onReconnectSuccess() {
    this._clearReconnectTimer();
    this._setState("connected");
    if (this.onPeerReconnected) this.onPeerReconnected();
  },

  _clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  },

  /* ===================== 房间 ID 验证 ===================== */

  /** 验证房间 ID 格式：必须是恰好 6 位的字母数字组合 */
  _isValidRoomId(roomId) {
    return typeof roomId === "string" && /^[A-Za-z0-9]{6}$/.test(roomId);
  },

  /* ===================== Socket.IO 信令连接 ===================== */

  /**
   * 连接到信令服务器。
   * @param {string} serverUrl - 信令服务器地址（如 "https://holu.huan-yue.org:8001"）
   */
  connect(serverUrl) {
    if (this.socket) {
      this.socket.disconnect();
    }
    // io() 是 Socket.IO 客户端全局函数（通过 CDN 加载）
    this.socket = io(serverUrl, {
      transports: ["websocket"],  // 只使用 WebSocket，不走轮询
      reconnection: false,        // 禁用自动重连（由我们自己控制）
    });

    this.socket.on("connect", () => {
      console.log(
        "[NetManager] Connected to signaling server:",
        this.socket.id,
      );
    });

    this.socket.on("connect_error", (err) => {
      console.error("[NetManager] Connection error:", err.message);
      if (this.onError) this.onError("无法连接到服务器");
      this._setState("disconnected");
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[NetManager] Disconnected:", reason);
      if (this.state === "connected") {
        // 意外断线（游戏过程中）
        this._setState("disconnected");
      }
    });

    // 信令事件处理器
    this._setupSignalingListeners();
  },

  _setupSignalingListeners() {
    const socket = this.socket;
    if (!socket) return;

    // 房主接收：对端已加入房间
    socket.on("user-joined", (user) => {
      console.log("[NetManager] Peer joined:", user.id);
      this.peerId = user.id;
      if (this.onPeerJoined) this.onPeerJoined();
      // 房主发起 WebRTC 连接
      if (this.role === "host") {
        this.startWebRTC();
      }
    });

    // 加入者接收：来自房主的 SDP 邀请
    socket.on("offer", (data) => {
      console.log("[NetManager] Received offer from:", data.sender);
      this.peerId = data.sender;
      this.handleOffer(data.sdp);
    });

    // 房主接收：来自加入者的 SDP 应答
    socket.on("answer", (data) => {
      console.log("[NetManager] Received answer from:", data.sender);
      this.handleAnswer(data.sdp);
    });

    // 双方：来自远端对端的 ICE 候选
    socket.on("ice-candidate", (data) => {
      this.handleIceCandidate(data.candidate);
    });

    // 加入者/房主：对端离开房间
    socket.on("user-left", (userId) => {
      if (userId === this.peerId) {
        console.log("[NetManager] Peer left");
        this._setState("disconnected");
      }
    });
  },

  /* ===================== 房间操作 ===================== */

  /** 主机创建房间：发送“create-room”并等待“room-created”响应 */
  createRoom() {
    if (!this.socket || !this.socket.connected) {
      if (this.onError) this.onError("未连接到服务器");
      return;
    }

    this.role = "host";
    this._setState("signaling");

    // 设置 10 秒房间创建超时
    this._clearRoomTimeout();
    this._roomTimeout = setTimeout(() => {
      if (this.onError) this.onError("创建房间超时");
      this._setState("idle");
    }, 10000);

    this.socket.emit("create-room");

    // 监听房间创建响应（仅一次）
    this.socket.once("room-created", (data) => {
      this._clearRoomTimeout();
      if (data.status) {
        this.roomId = data.roomId;
        console.log("[NetManager] Room created:", data.roomId);
        if (this.onRoomCreated) this.onRoomCreated(data.roomId);
        // 加入房间以便接收房间事件
        this.socket.emit("join-room", {
          roomId: data.roomId,
          userName: "host",
          isDesktop: true,
        });
      } else {
        if (this.onError) this.onError("创建房间失败");
        this._setState("idle");
      }
    });
  },

  /** 客机加入房间：验证 ID 格式 → 发送“join-room” → 等待响应 */
  joinRoom(roomId) {
    // 验证房间 ID 格式
    if (!this._isValidRoomId(roomId)) {
      if (this.onError) this.onError("房间ID格式无效");
      return;
    }

    if (!this.socket || !this.socket.connected) {
      if (this.onError) this.onError("未连接到服务器");
      return;
    }

    this.role = "guest";
    this.roomId = roomId;
    this._setState("signaling");

    // 设置10秒加入超时
    this._clearRoomTimeout();
    this._roomTimeout = setTimeout(() => {
      if (this.onError) this.onError("加入房间超时");
      this._setState("idle");
    }, 10000);

    this.socket.emit("join-room", {
      roomId: roomId,
      userName: "guest",
      isDesktop: true,
    });

    // 监听房间用户响应（确认加入成功）
    this.socket.once("room-users", (userList) => {
      this._clearRoomTimeout();
      console.log("[NetManager] Joined room, users:", userList.length);

      // 查找房主（房间中的另一个用户）
      for (let i = 0; i < userList.length; i++) {
        if (userList[i].id !== this.socket.id) {
          this.peerId = userList[i].id;
          break;
        }
      }

      if (this.onPeerJoined) this.onPeerJoined();
      // 客机等待主机的 offer
    });

    // 监听加入错误
    this.socket.once("join-error", (data) => {
      this._clearRoomTimeout();
      if (this.onError) this.onError(data.message || "加入房间失败");
      this._setState("idle");
    });
  },

  _clearRoomTimeout() {
    if (this._roomTimeout) {
      clearTimeout(this._roomTimeout);
      this._roomTimeout = null;
    }
  },

  /* ===================== WebRTC 生命周期 ===================== */

  /**
   * 启动 WebRTC：创建 RTCPeerConnection，配置 ICE 服务器。
   * 主机侧创建数据通道并生成 Offer；客机侧等待数据通道。
   */
  startWebRTC() {
    this._setState("connecting");

    // ICE 服务器配置：
    //   STUN —— 用于 NAT 穿透（获取公网地址），轻量级
    //   TURN —— 当 STUN 打洞失败时作为中继转发流量（需要认证）
    //   TURNS —— TURN over TLS，用于严格防火墙环境（端口 5349）
    const config = {
      iceServers: [
        { urls: "stun:stun.cloudflare.com:3478" },   // Cloudflare 公共 STUN（备用）
        { urls: "stun:stun.l.google.com:19302" },    // Google 公共 STUN（备用）
      ],
    };
    this.pc = new RTCPeerConnection(config);

    // 通知外部 PeerConnection 已创建（StreamManager 在此添加视频轨道）
    if (this.onPcCreated) this.onPcCreated(this.pc);

    // 设置 30 秒 WebRTC 连接超时
    this._clearWebrtcTimeout();
    this._webrtcTimeout = setTimeout(() => {
      console.warn("[NetManager] WebRTC connection timeout (30s)");
      if (this.onError) this.onError("WebRTC连接超时");
      this._closePeerConnection();
      this._setState("disconnected");
    }, 30000);

    // 设置 15 秒 ICE 收集超时
    this._clearIceTimeout();
    this._iceTimeout = setTimeout(() => {
      console.warn("[NetManager] ICE gathering timeout (15s)");
      if (this.pc && this.pc.iceGatheringState !== "complete") {
        if (this.onError) this.onError("ICE收集超时，可能存在NAT穿透问题");
        this._closePeerConnection();
        this._setState("disconnected");
      }
    }, 15000);

    // ICE 候选处理
    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.socket && this.peerId) {
        this.socket.emit("ice-candidate", {
          target: this.peerId,
          candidate: event.candidate,
        });
      }
    };

    // ICE 收集状态变化——完成时清除超时定时器
    this.pc.onicegatheringstatechange = () => {
      if (this.pc && this.pc.iceGatheringState === "complete") {
        this._clearIceTimeout();
      }
    };

    // 连接状态变化
    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      const connState = this.pc.connectionState;
      console.log("[NetManager] Connection state:", connState);
      if (connState === "connected") {
        this._clearWebrtcTimeout();
        this._clearIceTimeout();
        this._setState("connected");
      } else if (connState === "disconnected" || connState === "failed") {
        this._clearWebrtcTimeout();
        this._clearIceTimeout();
        this._setState("disconnected");
      }
    };

    // ICE 连接状态（兼容不支持 connectionState 的浏览器）
    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return;
      const iceState = this.pc.iceConnectionState;
      console.log("[NetManager] ICE connection state:", iceState);
      if (iceState === "connected" || iceState === "completed") {
        this._clearWebrtcTimeout();
        this._clearIceTimeout();
        if (this.state !== "connected") {
          this._setState("connected");
        }
      } else if (iceState === "disconnected" || iceState === "failed") {
        this._clearWebrtcTimeout();
        this._clearIceTimeout();
        if (this.state !== "disconnected") {
          this._setState("disconnected");
        }
      }
    };

    if (this.role === "host") {
      // 主机创建数据通道并生成 offer
      this._createDataChannel();
      this._createOffer();
    } else {
      // 客机通过 ondatachannel 等待主机的数据通道
      this.pc.ondatachannel = (event) => {
        console.log("[NetManager] Received DataChannel from host");
        this.dc = event.channel;
        this._setupDataChannel();
      };
    }
  },

  _createDataChannel() {
    this.dc = this.pc.createDataChannel("game-input", {
      ordered: true,
    });
    this._setupDataChannel();
  },

  _setupDataChannel() {
    if (!this.dc) return;

    this.dc.binaryType = "arraybuffer";

    this.dc.onopen = () => {
      console.log("[NetManager] DataChannel open");
      this._clearWebrtcTimeout();
      this._clearIceTimeout();
      // 检查这是否是重连（在“disconnected”状态下重新打开了数据通道）
      if (this.state === "disconnected" && this.reconnectTimer) {
        this._onReconnectSuccess();
      } else {
        if (this.state !== "connected") {
          this._setState("connected");
        }
      }
      if (this.onDataChannelOpen) this.onDataChannelOpen();
    };

    this.dc.onclose = () => {
      console.log("[NetManager] DataChannel closed");
      if (this.state === "connected") {
        this._setState("disconnected");
      }
    };

    this.dc.onerror = (err) => {
      console.error("[NetManager] DataChannel error:", err);
      if (this.onError) this.onError("数据通道错误");
    };

    this.dc.onmessage = (event) => {
      this._handleDataChannelMessage(event.data);
    };
  },

  _handleDataChannelMessage(data) {
    // 画面串流音效消息拦截（2 字节，首字节 0xFD）
    if (typeof StreamManager !== "undefined" && StreamManager.handleSoundMessage(data)) {
      return;
    }

    // 如果可用，则尝试通过 SyncMessage 解码
    if (typeof SyncMessage !== "undefined" && SyncMessage.decode) {
      const msg = SyncMessage.decode(data);
      if (msg) {
        // 在内部处理 PING/PONG（传输层，不属于游戏层）
        if (msg.msgType === SyncMessage.MSG.PING) {
          this._handlePing(msg.payload);
          return;
        }
        if (msg.msgType === SyncMessage.MSG.PONG) {
          this._handlePong(msg.payload);
          return;
        }
        // 其他消息：通过 onMessage 回调转发给游戏层
        if (this.onMessage) {
          this.onMessage(msg.msgType, msg.payload, msg.frameNumber);
        }
        return;
      }
    }

    // 兜底：直接传递原始数据
    if (this.onMessage) {
      this.onMessage(null, data, 0);
    }
  },

  /* ===================== SDP 交换 ===================== */

  async _createOffer() {
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      console.log("[NetManager] Sending offer to peer");
      this.socket.emit("offer", {
        target: this.peerId,
        sdp: this.pc.localDescription,
      });
    } catch (err) {
      console.error("[NetManager] Failed to create offer:", err);
      if (this.onError) this.onError("创建SDP Offer失败");
      this._closePeerConnection();
      this._setState("disconnected");
    }
  },

  async handleOffer(sdp) {
    try {
      if (!this.pc) {
        // 客机在收到 offer 时需要创建 PC
        this.startWebRTC();
      }
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      console.log("[NetManager] Sending answer to peer");
      this.socket.emit("answer", {
        target: this.peerId,
        sdp: this.pc.localDescription,
      });
    } catch (err) {
      console.error("[NetManager] Failed to handle offer:", err);
      if (this.onError) this.onError("处理SDP Offer失败");
      this._closePeerConnection();
      this._setState("disconnected");
    }
  },

  async handleAnswer(sdp) {
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log("[NetManager] Remote description set (answer)");
    } catch (err) {
      console.error("[NetManager] Failed to handle answer:", err);
      if (this.onError) this.onError("处理SDP Answer失败");
      this._closePeerConnection();
      this._setState("disconnected");
    }
  },

  async handleIceCandidate(candidate) {
    try {
      if (this.pc && candidate) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error("[NetManager] Failed to add ICE candidate:", err);
      // 非致命：部分候选可能失败，但连接仍可能成功
    }
  },

  /* ===================== 延迟测量（Ping/Pong） ===================== */

  /**
   * 每帧调用（由游戏主循环驱动）。
   * 每 60 帧（约 1 秒）发送一次 PING 消息测量往返延迟。
   */
  tickPing() {
    if (this.state !== "connected") return;
    this._pingFrame++;
    if (this._pingFrame >= 60) {
      this._pingFrame = 0;
      this.sendPing();
    }
  },

  /**
   * 发送 PING 消息（携带 Float64 时间戳）。
   * 启动 2000ms 超时计时器；如果对端未及时回复 PONG，视为超时。
   */
  sendPing() {
    if (!this.dc || this.dc.readyState !== "open") return;
    const ts = performance.now();
    this._pendingPingTs = ts;
    const buf = SyncMessage.encode(SyncMessage.MSG.PING, 0, { timestamp: ts });
    this.dc.send(buf);
    // 为本次 ping 启动 2 秒超时
    this._clearPongTimeout();
    this._pongTimeout = setTimeout(() => {
      this._pendingPingTs = null;
      this.latency = null;
      if (this.onLatencyUpdate) this.onLatencyUpdate("timeout");
    }, 2000);
  },

  /** 收到对端 PING：立即回复 PONG，并原样回传时间戳 */
  _handlePing(payload) {
    if (!this.dc || this.dc.readyState !== "open") return;
    const ts = payload && payload.timestamp != null ? payload.timestamp : 0;
    const buf = SyncMessage.encode(SyncMessage.MSG.PONG, 0, { timestamp: ts });
    this.dc.send(buf);
  },

  /** 收到对端 PONG：计算 RTT = 当前时间 - 回传时间戳，更新延迟值 */
  _handlePong(payload) {
    if (this._pendingPingTs === null) return; // 没有待确认的 ping，丢弃
    this._clearPongTimeout();
    const echoedTs =
      payload && payload.timestamp != null ? payload.timestamp : 0;
    // 只有回传时间戳与待确认 ping 匹配时才接受
    if (echoedTs !== this._pendingPingTs) return;
    const rtt = performance.now() - echoedTs;
    this.latency = rtt;
    this._pendingPingTs = null;
    if (this.onLatencyUpdate) this.onLatencyUpdate(rtt);
  },

  _clearPongTimeout() {
    if (this._pongTimeout) {
      clearTimeout(this._pongTimeout);
      this._pongTimeout = null;
    }
  },

  /* ===================== 数据发送 ===================== */

  /** 通过数据通道发送消息（自动使用 SyncMessage 序列化） */
  send(msgType, payload) {
    if (!this.dc || this.dc.readyState !== "open") {
      // 数据通道未打开——静默跳过
      return;
    }

    // 如果可用，则通过 SyncMessage 序列化
    if (typeof SyncMessage !== "undefined" && SyncMessage.encode) {
      const data = SyncMessage.encode(msgType, payload);
      if (data) {
        this.dc.send(data);
        return;
      }
    }

    // 兜底：以 JSON 字符串发送（用于开发/测试）
    this.dc.send(JSON.stringify({ msgType, payload }));
  },

  /* ===================== 断开 / 销毁 ===================== */

  /** 发送 LEAVE 消息通知对端“我主动离开了”（页面关闭、返回标题时调用） */
  sendLeave() {
    if (this.dc && this.dc.readyState === "open") {
      try {
        const buf = SyncMessage.encode(SyncMessage.MSG.LEAVE, 0, null);
        this.dc.send(buf);
      } catch (e) {
        /* 关闭过程中忽略发送错误 */
      }
    }
  },

  /** 优雅断开：发送 LEAVE → 关闭数据通道/PeerConnection → 保留 Socket（可重新建房） */
  disconnect() {
    this.sendLeave();
    this._closePeerConnection();
    this._clearAllTimeouts();
    this._clearPingState();
    this.role = null;
    this.roomId = null;
    this.peerId = null;
    this._setState("idle");
  },

  /** 完全销毁：发送 LEAVE → 关闭一切连接（含 Socket）→ 清空所有回调 */
  destroy() {
    // 发送 LEAVE 后彻底关闭
    this.sendLeave();
    this._closePeerConnection();
    this._clearAllTimeouts();
    this._clearPingState();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.role = null;
    this.roomId = null;
    this.peerId = null;
    this._setState("idle");

    // 清空回调
    this.onStateChange = null;
    this.onRoomCreated = null;
    this.onPeerJoined = null;
    this.onDataChannelOpen = null;
    this.onMessage = null;
    this.onError = null;
    this.onPeerDisconnected = null;
    this.onPeerReconnected = null;
    this.onLatencyUpdate = null;
    this.onPcCreated = null;
  },

  _closePeerConnection() {
    if (this.dc) {
      try {
        this.dc.close();
      } catch (e) {
        /* 忽略 */
      }
      this.dc = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch (e) {
        /* 忽略 */
      }
      this.pc = null;
    }
  },

  _clearWebrtcTimeout() {
    if (this._webrtcTimeout) {
      clearTimeout(this._webrtcTimeout);
      this._webrtcTimeout = null;
    }
  },

  _clearIceTimeout() {
    if (this._iceTimeout) {
      clearTimeout(this._iceTimeout);
      this._iceTimeout = null;
    }
  },

  _clearAllTimeouts() {
    this._clearRoomTimeout();
    this._clearWebrtcTimeout();
    this._clearIceTimeout();
    this._clearReconnectTimer();
  },

  /** 重置所有延迟测量状态 */
  _clearPingState() {
    this._clearPongTimeout();
    this._pingFrame = 0;
    this._pendingPingTs = null;
    this.latency = null;
  },
};
