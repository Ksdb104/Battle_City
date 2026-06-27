/* =========================================================
 * 精灵绘制：全部使用 Canvas 程序化绘制像素画
 * =======================================================*/

const Sprites = (function () {
  // 以“朝上”为基准绘制坦克，再通过旋转适配四个方向
  function drawTankUp(ctx, pal, level, animFrame) {
    // 履带
    ctx.fillStyle = pal.tread;
    ctx.fillRect(2, 4, 6, 24);
    ctx.fillRect(24, 4, 6, 24);
    // 履带纹路
    ctx.fillStyle = pal.dark;
    const offset = animFrame ? 0 : 4;
    for (let y = 4 + offset; y < 28; y += 8) {
      ctx.fillRect(2, y, 6, 2);
      ctx.fillRect(24, y, 6, 2);
    }
    // 车体
    ctx.fillStyle = pal.body;
    ctx.fillRect(8, 8, 16, 18);
    // 高光
    ctx.fillStyle = pal.light;
    ctx.fillRect(9, 9, 3, 16);
    // 炮塔
    ctx.fillStyle = pal.dark;
    ctx.fillRect(13, 14, 6, 6);
    ctx.fillStyle = pal.body;
    ctx.fillRect(14, 15, 4, 4);
    // 炮管（升级后更长更粗）
    ctx.fillStyle = pal.dark;
    const barrelW = level >= 2 ? 4 : 2;
    const barrelTop = level >= 1 ? 1 : 4;
    ctx.fillRect(16 - barrelW / 2, barrelTop, barrelW, 16);
    // 三星升级标记
    if (level >= 3) {
      ctx.fillStyle = pal.light;
      ctx.fillRect(11, 11, 2, 2);
      ctx.fillRect(19, 11, 2, 2);
    }
  }

  function drawTank(ctx, x, y, dir, pal, level, animFrame) {
    ctx.save();
    ctx.translate(x + TILE / 2, y + TILE / 2);
    ctx.rotate((dir * Math.PI) / 2);
    ctx.translate(-TILE / 2, -TILE / 2);
    drawTankUp(ctx, pal, level, animFrame);
    ctx.restore();
  }

  // 通用：按素材 key 绘制坦克（朝上精灵 → 旋转 + 几何居中 + 放大 2 倍）
  // 成功绘制返回 true，素材未就绪返回 false 便于回退
  function drawTankSprite(ctx, x, y, dir, key) {
    const img = Assets.images[key];
    if (!img || !img.complete || !img.naturalWidth) return false;
    const scale = TILE / 16; // 原版坦克 16px → 游戏内 32px
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.save();
    ctx.translate(x + TILE / 2, y + TILE / 2);
    ctx.rotate((dir * Math.PI) / 2);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  // 玩家坦克：使用原版 p1 素材，level 0-3 为吃星等级，animFrame 0/1 为履带帧
  function drawPlayerTank(ctx, x, y, dir, level, animFrame) {
    const lv = level < 0 ? 0 : level > 3 ? 3 : level;
    const key = "p1_" + lv + "_" + (animFrame ? 1 : 0);
    if (!drawTankSprite(ctx, x, y, dir, key)) {
      // 素材未就绪时回退到程序化绘制
      drawTank(ctx, x, y, dir, PALETTE.player, level, animFrame);
    }
  }

  // P2 坦克：使用 p2 素材
  function drawPlayer2Tank(ctx, x, y, dir, level, animFrame) {
    const lv = level < 0 ? 0 : level > 3 ? 3 : level;
    const key = "p2_" + lv + "_" + (animFrame ? 1 : 0);
    if (!drawTankSprite(ctx, x, y, dir, key)) {
      drawTank(ctx, x, y, dir, PALETTE.player2, level, animFrame);
    }
  }

  // 护盾
  function drawShield(ctx, x, y, frame) {
    // 出生保护 / 头盔护盾：原版 born_shield（两帧动画）
    if (!Assets.blit(ctx, frame ? "bornShield1" : "bornShield0", x, y, TILE, TILE)) {
      ctx.save();
      ctx.strokeStyle = frame ? "#9fe8ff" : "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
      ctx.restore();
    }
  }

  // 船护盾（获得船后显示，原版 river_shield）
  function drawRiverShield(ctx, x, y) {
    if (!Assets.blit(ctx, "riverShield", x, y, TILE, TILE)) {
      ctx.save();
      ctx.strokeStyle = "#ffae3d";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
      ctx.restore();
    }
  }

  // 出生 / 重生特效（原版 star 四帧脉冲）
  function drawSpawn(ctx, x, y, t, spawnMax) {
    const elapsed = (spawnMax || 48) - t;
    const seq = [0, 1, 2, 3, 3, 2, 1, 0];
    const idx = seq[(elapsed >> 1) % seq.length];
    const img = Assets.images["star" + idx];
    if (img && img.complete && img.naturalWidth > 0) {
      const w = img.naturalWidth * 2;
      const h = img.naturalHeight * 2;
      ctx.drawImage(img, x + TILE / 2 - w / 2, y + TILE / 2 - h / 2, w, h);
      return;
    }
    // 回退：程序化星形
    const cx = x + TILE / 2;
    const cy = y + TILE / 2;
    const r = t % 8 < 4 ? 14 : 9;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "#9fe8ff";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(0, r);
      ctx.stroke();
      ctx.rotate(Math.PI / 4);
    }
    ctx.restore();
  }

  /* -------- 瓦片绘制（使用原版素材，小格 CELL=16） -------- */

  function drawBrick(ctx, x, y) {
    if (!Assets.blit(ctx, "brick", x, y, CELL, CELL)) {
      ctx.fillStyle = "#a8431f";
      ctx.fillRect(x, y, CELL, CELL);
    }
  }

  // 半砖绘制：只画 CELL 的一半（8x16 或 16x8），使用原始 brick 贴图裁剪
  function drawBrickHalf(ctx, x, y, side) {
    const half = CELL / 2; // 8px
    const img = Assets.images["brick"];
    if (img && img.complete && img.naturalWidth > 0) {
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      switch (side) {
        case "top":
          ctx.drawImage(img, 0, 0, sw, sh / 2, x, y, CELL, half);
          break;
        case "bottom":
          ctx.drawImage(img, 0, sh / 2, sw, sh / 2, x, y + half, CELL, half);
          break;
        case "left":
          ctx.drawImage(img, 0, 0, sw / 2, sh, x, y, half, CELL);
          break;
        case "right":
          ctx.drawImage(img, sw / 2, 0, sw / 2, sh, x + half, y, half, CELL);
          break;
      }
    } else {
      // 回退：纯色
      ctx.fillStyle = "#a8431f";
      switch (side) {
        case "top":    ctx.fillRect(x, y, CELL, half); break;
        case "bottom": ctx.fillRect(x, y + half, CELL, half); break;
        case "left":   ctx.fillRect(x, y, half, CELL); break;
        case "right":  ctx.fillRect(x + half, y, half, CELL); break;
      }
    }
  }

  function drawSteel(ctx, x, y) {
    if (!Assets.blit(ctx, "steel", x, y, CELL, CELL)) {
      ctx.fillStyle = "#8a8e96";
      ctx.fillRect(x, y, CELL, CELL);
    }
  }

  function drawWater(ctx, x, y, frame) {
    if (!Assets.blit(ctx, frame ? "water1" : "water0", x, y, CELL, CELL)) {
      ctx.fillStyle = "#1b3a8c";
      ctx.fillRect(x, y, CELL, CELL);
    }
  }

  function drawIce(ctx, x, y) {
    if (!Assets.blit(ctx, "ice", x, y, CELL, CELL)) {
      ctx.fillStyle = "#cfe7ff";
      ctx.fillRect(x, y, CELL, CELL);
    }
  }

  function drawTree(ctx, x, y) {
    // 原版 grass.png 自带透明通道，天然实现半透明镂空草丛
    if (!Assets.blit(ctx, "grass", x, y, CELL, CELL)) {
      ctx.fillStyle = "#1f8a33";
      ctx.fillRect(x, y, CELL, CELL);
    }
  }

  /* -------- 基地（鹰，原版 camp.png 16x16 → 放大到 32x32） -------- */
  function drawBase(ctx, x, y, alive) {
    if (!Assets.blit(ctx, alive ? "base" : "baseBroken", x, y, TILE, TILE)) {
      ctx.fillStyle = alive ? "#caa15a" : "#3a3d48";
      ctx.fillRect(x + 4, y + 6, TILE - 8, TILE - 8);
    }
  }

  /* -------- 子弹（原版素材，朝上 → 按方向旋转） -------- */
  function drawBullet(ctx, b) {
    const img = Assets.images.bullet;
    if (img && img.complete && img.naturalWidth > 0) {
      const w = img.naturalWidth * 2;
      const h = img.naturalHeight * 2;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate((b.dir * Math.PI) / 2);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(b.x - 3, b.y - 3, 6, 6);
    }
  }

  /* -------- 爆炸帧（boom1 普通 / boom2 大；小火花为程序化） -------- */
  function drawExplosion(ctx, ex) {
    if (ex.frames) {
      const key = ex.frames[Math.min(ex.frame, ex.frames.length - 1)];
      const img = Assets.images[key];
      if (img && img.complete && img.naturalWidth > 0) {
        const w = img.naturalWidth * 2;
        const h = img.naturalHeight * 2;
        ctx.drawImage(img, ex.x - w / 2, ex.y - h / 2, w, h);
        return;
      }
    }
    // 小火花（子弹命中墙/对撞）：程序化
    const r = [5, 10, 14, 8][ex.frame] || 5;
    drawBurst(ctx, ex.x, ex.y, r, ["#fff2a8", "#ffb13d", "#ff5b2e"]);
  }

  function drawBurst(ctx, cx, cy, r, colors) {
    ctx.save();
    ctx.translate(cx, cy);
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = colors[layer];
      const rr = r * (1 - layer * 0.28);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rad = i % 2 === 0 ? rr : rr * 0.55;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /* -------- 道具图标 -------- */
  function drawPowerUp(ctx, p, frame) {
    ctx.save();
    ctx.globalAlpha = 0.65;
    // 闪烁：暗帧加一圈高亮底，制造原版道具闪烁感
    if (frame) {
      ctx.fillStyle = "rgba(255,211,77,0.18)";
      ctx.fillRect(p.x + 2, p.y + 2, TILE - 4, TILE - 4);
    }
    // 原版道具图标 16x15 → 居中放大 2 倍
    const key = "prop_" + p.type;
    const img = Assets.images[key];
    if (img && img.complete && img.naturalWidth > 0) {
      const w = img.naturalWidth * 2;
      const h = img.naturalHeight * 2;
      ctx.drawImage(img, p.x + (TILE - w) / 2, p.y + (TILE - h) / 2, w, h);
    } else {
      // 回退：色块
      ctx.fillStyle = "#ffd34d";
      ctx.fillRect(p.x + 8, p.y + 8, TILE - 16, TILE - 16);
    }
    ctx.restore();
  }

  return {
    drawTank,
    drawPlayerTank,
    drawPlayer2Tank,
    drawTankSprite,
    drawShield,
    drawRiverShield,
    drawSpawn,
    drawBrick,
    drawBrickHalf,
    drawSteel,
    drawWater,
    drawIce,
    drawTree,
    drawBase,
    drawBullet,
    drawExplosion,
    drawPowerUp,
  };
})();
