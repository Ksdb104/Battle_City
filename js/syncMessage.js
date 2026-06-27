/* =========================================================
 * Sync_Message —— 紧凑二进制协议，用于 WebRTC 数据通道
 *
 * 格式：
 *   字节 0      : msgType  (Uint8)
 *   字节 1-4    : frameNumber (Uint32，大端序)
 *   字节 5+     : payload（按类型而定）
 *
 * 约束：
 *   - INPUT 消息恰好 7 字节
 *   - 固定格式消息不超过 16 字节
 *   - 除 STATE_SNAPSHOT 外，任何消息不超过 64 字节
 * =======================================================*/

const SyncMessage = (function () {

  /* ========== 消息类型常量 ========== */

  const MSG = {
    INPUT:            0x01,  // 输入消息：每帧发送一次，包含方向和开火状态（7 字节）
    PING:             0x02,  // 延迟探测请求：携带 Float64 时间戳（13 字节）
    PONG:             0x03,  // 延迟探测回复：原样回传 PING 中的时间戳（13 字节）
    STAGE_TRANSITION: 0x10,  // 关卡切换：主机通知客机进入下一关（6 字节）
    PAUSE:            0x11,  // 暂停：仅主机可发，客机收到后暂停游戏（5 字节）
    UNPAUSE:          0x12,  // 取消暂停：主机恢复游戏（5 字节）
    SESSION_RESTART:  0x13,  // 会话重启：游戏结束后重新开始（5 字节）
    LEAVE:            0x14,  // 主动离开：通知对端“我退出了”（5 字节）
    GAME_EVENT:       0x20,  // 游戏事件：主机广播非确定性事件（敌人出生/道具/AI 方向）
    STATE_SNAPSHOT:   0x30,  // 完整状态快照：新关卡开始时主机发送全量数据（JSON，可超 64 字节）
    RESYNC_REQUEST:   0x31,  // 重同步请求：客机检测到状态不一致时请求主机发送快照（5 字节）
  };

  /* ========== 头部大小 ========== */

  const HEADER_SIZE = 5; // 头部固定 5 字节：1 字节类型 + 4 字节帧号（Uint32 大端序）

  /* ========== 编码 ========== */

  /**
   * encode(msgType, frameNumber, payload) → ArrayBuffer
   *
   * payload 根据 msgType 不同而不同：
   *   INPUT:            { dir: 0-4（4=null），fire: boolean }
   *   PING/PONG:        { timestamp: number（Float64） }
   *   STAGE_TRANSITION: { nextStageIndex: number（Uint8）}
   *   PAUSE/UNPAUSE/SESSION_RESTART/LEAVE/RESYNC_REQUEST:（无 payload，忽略）
   *   GAME_EVENT:       { eventType: number（Uint8），data: Uint8Array }
   *   STATE_SNAPSHOT:   { json: string }
   */
  function encode(msgType, frameNumber, payload) {
    let buffer;
    let view;

    switch (msgType) {
      case MSG.INPUT: {
        // 总计 7 字节：1 字节类型 + 4 字节帧号 + 1 字节方向 + 1 字节开火
        buffer = new ArrayBuffer(7);
        view = new DataView(buffer);
        view.setUint8(0, msgType);
        view.setUint32(1, frameNumber >>> 0, false); // 大端序
        const dir = (payload && payload.dir != null) ? payload.dir : 4;
        view.setUint8(5, dir);
        view.setUint8(6, payload && payload.fire ? 1 : 0);
        break;
      }

      case MSG.PING:
      case MSG.PONG: {
        // 总计 13 字节：1 字节类型 + 4 字节帧号 + 8 字节时间戳（Float64）
        buffer = new ArrayBuffer(13);
        view = new DataView(buffer);
        view.setUint8(0, msgType);
        view.setUint32(1, frameNumber >>> 0, false);
        view.setFloat64(5, payload ? payload.timestamp : 0, false);
        break;
      }

      case MSG.STAGE_TRANSITION: {
        // 总计 6 字节：1 字节类型 + 4 字节帧号 + 1 字节下一关索引
        buffer = new ArrayBuffer(6);
        view = new DataView(buffer);
        view.setUint8(0, msgType);
        view.setUint32(1, frameNumber >>> 0, false);
        view.setUint8(5, payload ? payload.nextStageIndex : 0);
        break;
      }

      case MSG.PAUSE:
      case MSG.UNPAUSE:
      case MSG.SESSION_RESTART:
      case MSG.LEAVE:
      case MSG.RESYNC_REQUEST: {
        // 总计 5 字节：只有头部（无载荷）
        buffer = new ArrayBuffer(5);
        view = new DataView(buffer);
        view.setUint8(0, msgType);
        view.setUint32(1, frameNumber >>> 0, false);
        break;
      }

      case MSG.GAME_EVENT: {
        // 5 字节头部 + 1 字节事件类型 + 可变长度数据
        const eventType = payload ? payload.eventType : 0;
        const data = (payload && payload.data) ? payload.data : new Uint8Array(0);
        const totalSize = HEADER_SIZE + 1 + data.length;
        buffer = new ArrayBuffer(totalSize);
        view = new DataView(buffer);
        view.setUint8(0, msgType);
        view.setUint32(1, frameNumber >>> 0, false);
        view.setUint8(5, eventType);
        const byteArr = new Uint8Array(buffer);
        byteArr.set(data, 6);
        break;
      }

      case MSG.STATE_SNAPSHOT: {
        // 5 字节头部 + 可变长度 JSON
        const jsonStr = (payload && payload.json) ? payload.json : "{}";
        const encoder = new TextEncoder();
        const jsonBytes = encoder.encode(jsonStr);
        buffer = new ArrayBuffer(HEADER_SIZE + jsonBytes.length);
        view = new DataView(buffer);
        view.setUint8(0, msgType);
        view.setUint32(1, frameNumber >>> 0, false);
        const byteArr = new Uint8Array(buffer);
        byteArr.set(jsonBytes, HEADER_SIZE);
        break;
      }

      default: {
        // 未知类型——只编码头部
        buffer = new ArrayBuffer(HEADER_SIZE);
        view = new DataView(buffer);
        view.setUint8(0, msgType);
        view.setUint32(1, frameNumber >>> 0, false);
        break;
      }
    }

    return buffer;
  }

  /* ========== 解码 ========== */

  /**
   * decode(arrayBuffer) → { msgType, frameNumber, payload }
   *
   * payload 结构与 encode 对应
   */
  function decode(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const msgType = view.getUint8(0);
    const frameNumber = view.getUint32(1, false); // 大端序

    let payload = null;

    switch (msgType) {
      case MSG.INPUT: {
        const dir = view.getUint8(5);
        payload = {
          dir: dir >= 4 ? null : dir,
          fire: view.getUint8(6) !== 0,
        };
        break;
      }

      case MSG.PING:
      case MSG.PONG: {
        payload = {
          timestamp: view.getFloat64(5, false),
        };
        break;
      }

      case MSG.STAGE_TRANSITION: {
        payload = {
          nextStageIndex: view.getUint8(5),
        };
        break;
      }

      case MSG.PAUSE:
      case MSG.UNPAUSE:
      case MSG.SESSION_RESTART:
      case MSG.LEAVE:
      case MSG.RESYNC_REQUEST: {
        // 无载荷
        payload = null;
        break;
      }

      case MSG.GAME_EVENT: {
        const eventType = view.getUint8(5);
        const data = new Uint8Array(arrayBuffer, 6);
        payload = { eventType, data };
        break;
      }

      case MSG.STATE_SNAPSHOT: {
        const jsonBytes = new Uint8Array(arrayBuffer, HEADER_SIZE);
        const decoder = new TextDecoder();
        payload = { json: decoder.decode(jsonBytes) };
        break;
      }

      default: {
        payload = null;
        break;
      }
    }

    return { msgType, frameNumber, payload };
  }

  /* ========== 公共接口 ========== */

  return {
    MSG,
    HEADER_SIZE,
    encode,
    decode,
  };

})();
