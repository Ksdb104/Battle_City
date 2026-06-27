/* =========================================================
 * Stream_Manager —— 画面串流模块（Canvas → WebRTC Video）
 *
 * 职责：
 *   1. Host 端：将 canvas 捕获为 MediaStream，通过 WebRTC 发送给 Guest
 *   2. Guest 端：接收视频流并渲染到 <video> 元素
 *   3. 管理串流模式下的连接生命周期
 *
 * 架构：
 *   Host（P1）：游戏正常运行 + captureStream → addTrack
 *   Guest（P2）：不运行游戏逻辑，显示远端视频 + 发送输入
 *
 * 依赖：
 *   - NetManager（全局）: pc（RTCPeerConnection）
 *   - 游戏 canvas 元素
 * ========================================================= */

const StreamManager = {

  /* ===================== 状态 ===================== */

  enabled: false,         // 是否启用画面串流模式
  role: null,             // "host" 或 "guest"
  stream: null,           // Host 端：canvas.captureStream() 返回的 MediaStream
  videoEl: null,          // Guest 端：用于显示远端视频的 <video> 元素
  sender: null,           // Host 端：RTCRtpSender 引用（用于调整编码参数）
  _encodingConfigured: false,  // 是否已配置编码参数
  _onStreamReady: null,   // Guest 端：收到视频流后的回调
  _combinedStream: null,  // Guest 端：合成 MediaStream（包含 video + audio 轨道）

  /* ===================== Host 端 ===================== */

  /**
   * Host 初始化：捕获 canvas 并添加视频轨道到 PeerConnection。
   * 必须在 RTCPeerConnection 创建之后、createOffer 之前调用。
   * @param {HTMLCanvasElement} canvas - 游戏画布
   */
  initHost(canvas) {
    if (!canvas || !NetManager.pc) {
      console.warn("[StreamManager] initHost: canvas or pc not available");
      return;
    }

    // 检查浏览器是否支持 captureStream
    if (!canvas.captureStream) {
      console.warn("[StreamManager] captureStream not supported — falling back to frame sync");
      return;
    }

    this.role = "host";
    this.enabled = true;

    // captureStream() 不传参数：让浏览器自动决定帧率
    // Chrome：每次 canvas 更新时自动捕获
    // Firefox：需要手动调 requestFrame()，但传参数 0 也有同样问题
    // 这里传 60 明确请求 60fps 捕获，兼容性最好
    this.stream = canvas.captureStream(60);

    const videoTrack = this.stream.getVideoTracks()[0];
    if (!videoTrack) {
      console.error("[StreamManager] No video track from captureStream");
      return;
    }

    // 设置 content hint 提示浏览器这是像素画/细节内容
    if ("contentHint" in videoTrack) {
      videoTrack.contentHint = "detail";
    }

    // 将视频轨道添加到 PeerConnection
    this.sender = NetManager.pc.addTrack(videoTrack, this.stream);

    console.log("[StreamManager] Host: video track added to PeerConnection");
  },

  /**
   * Host 端：设置音效事件转发。
   * 当 Host 播放任何音效时，通过 DataChannel 发送音效名称给 Guest。
   * Guest 本地预加载了相同的音效文件，收到后即时播放（延迟 = DataChannel 延迟，几 ms）。
   * 必须在 DataChannel 打开后调用。
   */
  startSoundForwarding() {
    if (this.role !== "host") return;

    // 构建音效名称→ID 映射（减少传输量，每个音效只发 1 字节 ID）
    this._soundNames = [
      "bulletShot", "bulletHit1", "bulletHit2", "bulletHit3", "explosion1", "explosion2",
      "powerupAppear", "powerupPick", "stageStart", "gameOver", "pause", "statistics1",
      "sliding", "oneUp"
    ];
    this._soundNameToId = {};
    for (let i = 0; i < this._soundNames.length; i++) {
      this._soundNameToId[this._soundNames[i]] = i;
    }

    // 注册 Sound 模块回调：每次播放音效时发送给 Guest
    Sound._setOnSoundPlayed((name) => {
      if (!NetManager.dc || NetManager.dc.readyState !== "open") return;
      const id = this._soundNameToId[name];
      if (id === undefined) return;
      // 发送 2 字节：[0xFD（音效消息标识）, soundId]
      const buf = new Uint8Array([0xFD, id]);
      NetManager.dc.send(buf.buffer);
    });
  },

  /**
   * Guest 端：处理收到的音效事件消息。
   * @param {ArrayBuffer} data - 原始 DataChannel 消息
   * @returns {boolean} - 是否已处理（true 表示是音效消息）
   */
  handleSoundMessage(data) {
    if (!this.enabled || this.role !== "guest") return false;
    const bytes = new Uint8Array(data);
    if (bytes.length === 2 && bytes[0] === 0xFD) {
      const soundNames = [
        "bulletShot", "bulletHit1", "bulletHit2", "bulletHit3", "explosion1", "explosion2",
        "powerupAppear", "powerupPick", "stageStart", "gameOver", "pause", "statistics1",
        "sliding", "oneUp"
      ];
      const name = soundNames[bytes[1]];
      if (name) {
        Sound.playByName(name);
      }
      return true;
    }
    return false;
  },

  /**
   * Host 端配置编码参数（在连接建立后调用以优化延迟）。
   * 降低编码延迟：限制码率、优先帧率、禁用关键帧间隔过长。
   */
  async configureEncoding() {
    if (this._encodingConfigured || !this.sender) return;
    this._encodingConfigured = true;

    try {
      const params = this.sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }

      // 针对 416×416 像素画优化的编码参数
      params.encodings[0].maxBitrate = 800000;        // 800kbps 上限（像素画不需要太高）
      params.encodings[0].maxFramerate = 60;           // 60fps
      params.degradationPreference = "maintain-framerate"; // 优先保帧率

      await this.sender.setParameters(params);
      console.log("[StreamManager] Encoding parameters configured");
    } catch (err) {
      console.warn("[StreamManager] Failed to configure encoding:", err);
    }
  },

  /* ===================== Guest 端 ===================== */

  /**
   * Guest 初始化：创建 <video> 元素，监听远端视频轨道。
   * 视频元素会叠加在 canvas 上方，完全覆盖它。
   * @param {HTMLCanvasElement} canvas - 原始游戏 canvas（用于定位参考）
   */
  initGuest(canvas) {
    if (!canvas) return;

    this.role = "guest";
    // 注意：enabled 在收到视频轨道后才设为 true

    // 创建 video 元素（如果还没有）
    if (!this.videoEl) {
      const video = document.createElement("video");
      video.id = "stream-video";
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;  // 必须先静音才能自动播放，用户交互后取消静音
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");

      // 样式：通过 CSS class 匹配 canvas 样式
      video.className = "stream-video";

      // 内联最小必要样式（其余由 CSS 处理）
      video.style.display = "none";

      // 插入到 canvas 的同级（game-area 容器内）
      const gameArea = canvas.parentElement;
      if (gameArea) {
        gameArea.appendChild(video);
      }

      this.videoEl = video;
    }

    // 监听 PeerConnection 上的远端轨道
    if (NetManager.pc) {
      NetManager.pc.ontrack = (event) => {
        console.log("[StreamManager] Guest: received remote track", event.track.kind);
        if (event.track.kind === "video") {
          this.enabled = true;
          this.videoEl.style.display = "block";

          // 设置视频流
          if (!this._combinedStream) {
            this._combinedStream = new MediaStream();
          }
          this._combinedStream.addTrack(event.track);
          this.videoEl.srcObject = this._combinedStream;

          // 静音播放（无音频轨道，只是确保视频显示）
          this.videoEl.muted = true;
          this.videoEl.play().catch(() => {});

          // 隐藏原始 canvas（Guest 不需要它渲染）
          canvas.style.visibility = "hidden";
          // 触发就绪回调
          if (this._onStreamReady) {
            this._onStreamReady();
            this._onStreamReady = null;
          }
        }
      };
    }

    console.log("[StreamManager] Guest: waiting for remote video track");
  },

  /* ===================== 清理 ===================== */

  /**
   * 重置所有状态（断线/会话结束时调用）。
   */
  reset() {
    // 停止 Host 端捕获流
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // 清除音效转发回调
    if (Sound._clearOnSoundPlayed) Sound._clearOnSoundPlayed();
    // 移除 Guest 端视频元素
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      if (this.videoEl.parentElement) {
        this.videoEl.parentElement.removeChild(this.videoEl);
      }
      this.videoEl = null;
    }

    // 恢复 canvas 可见性
    const canvas = document.getElementById("game");
    if (canvas) {
      canvas.style.visibility = "";
    }

    this.sender = null;
    this.enabled = false;
    this.role = null;
    this._encodingConfigured = false;
    this._onStreamReady = null;
    this._combinedStream = null;
    this._soundNames = null;
    this._soundNameToId = null;
  },

  /* ===================== 辅助方法 ===================== */

  /**
   * 判断当前是否为串流模式下的 Guest（即不需要运行游戏逻辑）。
   */
  isStreamGuest() {
    return this.enabled && this.role === "guest";
  },

  /**
   * 判断当前是否为串流模式下的 Host。
   */
  isStreamHost() {
    return this.enabled && this.role === "host";
  },
};
