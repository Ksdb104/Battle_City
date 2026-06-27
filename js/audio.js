/* =========================================================
 * 音效模块：基于 Web Audio API 的 AudioBuffer 方案
 * 预加载 → 解码到内存缓冲区 → 播放时零开销创建源节点
 * 解决 iOS 上 HTMLAudioElement.play() 造成主线程卡顿的问题
 * =======================================================*/

const Sound = (function () {
  let ctx = null;       // 音频上下文
  let enabled = true;
  let loaded = false;
  const buffers = {};   // 名称 → 音频缓冲区
  let onSoundPlayed = null; // 画面串流回调：音效播放时通知外部

  // 音效文件清单
  const manifest = {
    bulletHit1: "sound/bullet_hit_1.ogg",
    bulletHit2: "sound/bullet_hit_2.ogg",
    bulletHit3: "sound/bullet_hit_3.mp3",
    bulletShot: "sound/bullet_shot.ogg",
    explosion1: "sound/explosion_1.ogg",
    explosion2: "sound/explosion_2.ogg",
    gameOver: "sound/game_over.ogg",
    pause: "sound/pause.ogg",
    powerupAppear: "sound/powerup_appear.ogg",
    powerupPick: "sound/powerup_pick.ogg",
    sliding: "sound/sliding.mp3",
    stageStart: "sound/stage_start.ogg",
    statistics1: "sound/statistics_1.ogg",
    oneUp: "sound/1UP.mp3",
  };

  function ensureContext() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        enabled = false;
      }
    }
    return ctx;
  }

  /** 预加载所有音效：fetch → decodeAudioData → 存入缓冲区 */
  function preload(onComplete, onProgress) {
    const ac = ensureContext();
    if (!ac) {
      loaded = true;
      if (onProgress) onProgress(1, 0, 0);
      if (onComplete) onComplete();
      return;
    }

    const keys = Object.keys(manifest);
    const totalCount = keys.length;
    let remaining = totalCount;
    let loadedCount = 0;
    let done = false;

    function finish() {
      if (done) return;
      done = true;
      loaded = true;
      if (onProgress) onProgress(1, totalCount, totalCount);
      if (onComplete) onComplete();
    }

    if (remaining === 0) {
      finish();
      return;
    }

    // 超时保底（iOS 首次可能无法 fetch 音频直到用户交互）
    const timeout = setTimeout(finish, 3000);

    keys.forEach((key) => {
      fetch(manifest[key])
        .then((res) => {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.arrayBuffer();
        })
        .then((arrayBuf) => ac.decodeAudioData(arrayBuf))
        .then((audioBuf) => {
          buffers[key] = audioBuf;
        })
        .catch((err) => {
          console.warn("音效加载失败:", key, err);
        })
        .finally(() => {
          remaining--;
          loadedCount++;
          if (onProgress) onProgress(loadedCount / totalCount, loadedCount, totalCount);
          if (remaining <= 0) {
            clearTimeout(timeout);
            finish();
          }
        });
    });
  }

  /** 播放一个已解码的音效缓冲区 */
  function play(name, volume) {
    if (!enabled || !ctx) return;
    const buf = buffers[name];
    if (!buf) return;
    // 确保上下文处于运行状态（iOS 需要 resume）
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const source = ctx.createBufferSource();
    source.buffer = buf;

    // 创建增益节点控制音量
    const gain = ctx.createGain();
    gain.gain.value = (volume !== undefined) ? volume : 1.0;
    source.connect(gain);

    // 输出到扬声器
    gain.connect(ctx.destination);

    source.start(0);

    // 通知外部（画面串流模式：Host 通过 DataChannel 发送音效事件给 Guest）
    if (onSoundPlayed) onSoundPlayed(name);
  }

  return {
    preload,

    unlock() {
      const ac = ensureContext();
      if (!ac) return;
      if (ac.state === "suspended") {
        ac.resume();
      }
      // 播放一个极短的静音缓冲区以解锁 iOS 音频
      const silentBuf = ac.createBuffer(1, 1, ac.sampleRate);
      const src = ac.createBufferSource();
      src.buffer = silentBuf;
      src.connect(ac.destination);
      src.start(0);
    },

    fire() { play("bulletShot", 0.5); },
    bulletHit1() { play("bulletHit1", 0.6); },
    bulletHit2() { play("bulletHit2", 0.6); },
    bulletHit3() { play("bulletHit3", 0.6); },
    brick() { play("bulletHit1", 0.6); },
    steel() { play("bulletHit1", 0.6); },
    explosion1() { play("explosion1", 0.7); },
    explosion2() { play("explosion2", 0.7); },
    explosion() { play("explosion2", 0.7); },
    bigExplosion() { play("explosion2", 0.8); },
    powerupAppear() { play("powerupAppear", 0.7); },
    powerupPick() { play("powerupPick", 0.7); },
    powerup() { play("powerupPick", 0.7); },
    lifeup() { play("oneUp", 0.8); },
    sliding() { play("sliding", 0.5); },
    stageStart() { play("stageStart", 0.8); },
    gameover() { play("gameOver", 0.8); },
    pause() { play("pause", 0.6); },
    menuMove() { play("statistics1", 0.6); },

    // 按名称播放（画面串流 Guest 端使用）
    playByName(name) { play(name, 0.7); },

    // 画面串流用：获取 AudioContext
    _getContext() { return ensureContext(); },

    // 画面串流用：设置音效播放回调（Host 每次播放时通知）
    _setOnSoundPlayed(cb) { onSoundPlayed = cb; },

    // 画面串流用：清除回调
    _clearOnSoundPlayed() { onSoundPlayed = null; },
  };
})();
