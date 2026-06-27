/* =========================================================
 * 游戏实体：坦克、子弹、爆炸、道具
 * =======================================================*/

const ENEMY_STATS = {
  basic: { speed: 1, health: 1, score: 100, fast: false, cooldown: 60 },//fast:是否使用快速子弹,cooldown:敌人开火冷却时间
  fast: { speed: 2, health: 1, score: 200, fast: false, cooldown: 60 },
  power: { speed: 1, health: 1, score: 300, fast: true, cooldown: 36 },
  armor: { speed: 0.75, health: 4, score: 400, fast: false, cooldown: 60 },
};

// 根据敌人状态计算原版精灵 key
//  flashBeat：当前闪烁节拍（道具版红闪 / 重型 HP2 的绿黄闪烁用）
//  animFrame：履带动画帧 0/1
function enemySpriteKey(tank, flashBeat, animFrame) {
  const f = animFrame ? 1 : 0;
  if (tank.type === ENEMY.ARMOR) {
    // 道具版：始终显示红色 e4_3
    if (tank.isBonus) return "e4_3_" + f;
    // 普通版按剩余血量变色：绿(4) → 黄(3) → 绿黄闪烁(2) → 灰(1)
    const hp = clamp(tank.health, 1, 4);
    let tier;
    if (hp >= 4) tier = 1; // 绿
    else if (hp === 3) tier = 2; // 黄
    else if (hp === 2) tier = flashBeat ? 1 : 2; // 绿/黄 交替闪烁
    else tier = 0; // 灰
    return "e4_" + tier + "_" + f;
  }
  const n = tank.type === ENEMY.FAST ? 2 : tank.type === ENEMY.POWER ? 3 : 1;
  const variant = tank.isBonus && flashBeat ? 1 : 0; // 1=红色道具版
  return "e" + n + "_" + variant + "_" + f;
}

class Tank {
  constructor(game, x, y, opts = {}) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.w = TILE;
    this.h = TILE;
    this.dir = opts.dir !== undefined ? opts.dir : DIR.UP;
    this.isPlayer = !!opts.isPlayer;
    this.playerIndex = opts.playerIndex || 1; // 1 = P1, 2 = P2
    this.alive = true;
    this.moving = false;
    this.animTick = 0;
    this.fireCooldown = 0;
    this.activeBullets = 0;
    this.spawnTimer = opts.spawnTimer || 0; // 出生保护
    this.spawnMax = this.spawnTimer; // 出生动画总时长
    this.shieldTimer = 0; // 护盾
    this.stunTimer = 0;  // 友军击中冻结
    this.slideTimer = 0; // 冰面滑行
    this.lastAxisV = false;

    if (this.isPlayer) {
      this.pal = PALETTE.player;
      this.level = 0;
      this.speed = CONFIG.playerSpeed;
      this.health = 1;
      this.bulletSpeed = CONFIG.bulletSpeed;
      this.power = 1;
      this.maxBullets = 1;
      this.hasBoat = false; // 船：可渡水 + 一次性护盾
    } else {
      this.type = opts.type || ENEMY.BASIC;
      const s = ENEMY_STATS[this.type];
      this.pal = PALETTE[this.type];
      this.speed = s.speed;
      this.health = s.health;
      this.maxHealth = s.health;
      this.score = s.score;
      this.bulletSpeed = s.fast ? CONFIG.fastBulletSpeed : CONFIG.bulletSpeed;
      this.power = 1;
      this.maxBullets = 1;
      this.baseCooldown = s.cooldown;
      this.isBonus = !!opts.isBonus;
      this.aiTimer = randInt(40) + 20;
      this.fireTimer = randInt(60) + 30;
    }
  }

  rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  center() {
    return { x: this.x + TILE / 2, y: this.y + TILE / 2 };
  }

  applyLevel() {
    // 玩家升级效果
    this.level = clamp(this.level, 0, 3);
    this.bulletSpeed = this.level >= 1 ? CONFIG.fastBulletSpeed : CONFIG.bulletSpeed;
    this.maxBullets = this.level >= 2 ? 2 : 1;
    this.power = this.level >= 3 ? 2 : 1;
  }

  isOnIce() {
    const c = this.center();
    return this.game.level.cellAt((c.x / CELL) | 0, (c.y / CELL) | 0) === TT.ICE;
  }

  // 位置是否可放置（不与墙、边界、其它坦克重叠）
  _free(x, y) {
    if (x < 0 || y < 0 || x + TILE > FIELD || y + TILE > FIELD) return false;
    // 有船 或 当前已在水面上（失去船后仍能驶离）时，水面可通行
    const allowWater = this.hasBoat || this._onWaterNow();
    const cx0 = (x / CELL) | 0;
    const cy0 = (y / CELL) | 0;
    const cx1 = ((x + TILE - 1) / CELL) | 0;
    const cy1 = ((y + TILE - 1) / CELL) | 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const t = this.game.level.cellAt(cx, cy);
        if (Level.blocksTank(t)) {
          if (t === TT.WATER && allowWater) continue;
          return false;
        }
      }
    }
    const rect = { x, y, w: TILE, h: TILE };
    for (const t of this.game.allTanks()) {
      if (t === this || !t.alive) continue;
      if (rectsOverlap(rect, t.rect())) return false;
    }
    return true;
  }

  // 当前位置是否压在水面上（用于失去船后仍能驶离水面，避免卡死）
  _onWaterNow() {
    const cx0 = (this.x / CELL) | 0;
    const cy0 = (this.y / CELL) | 0;
    const cx1 = ((this.x + TILE - 1) / CELL) | 0;
    const cy1 = ((this.y + TILE - 1) / CELL) | 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (this.game.level.cellAt(cx, cy) === TT.WATER) return true;
      }
    }
    return false;
  }

  move(dir, speed) {
    this.dir = dir;
    const v = DIR_VEC[dir];
    // 转向时把垂直于运动方向的坐标对齐到小格，便于穿过通道
    if (v.x !== 0) {
      const sy = snapToCell(this.y);
      if (this.y !== sy && this._free(this.x, sy)) this.y = sy;
    } else {
      const sx = snapToCell(this.x);
      if (this.x !== sx && this._free(sx, this.y)) this.x = sx;
    }
    let nx = this.x + v.x * speed;
    let ny = this.y + v.y * speed;
    if (this._free(nx, ny)) {
      this.x = nx;
      this.y = ny;
      return true;
    }
    return false;
  }

  update(game) {
    if (this.spawnTimer > 0) this.spawnTimer--;
    if (this.shieldTimer > 0) this.shieldTimer--;
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.stunTimer > 0) this.stunTimer--;

    if (this.isPlayer) this._updatePlayer(game);
    else this._updateEnemy(game);

    if (this.moving) this.animTick++;
  }

  _updatePlayer(game) {
    // 出生星动画期间冻结，不可移动/开炮
    if (this.spawnTimer > 0) {
      this.moving = false;
      return;
    }
    // 被友军击中冻结：只能转方向，不能移动和射击
    const dir = this.playerIndex === 2 ? Input.getDirection2() : Input.getDirection();
    const fire = this.playerIndex === 2 ? Input.isFire2() : Input.isFire();

    if (this.stunTimer > 0) {
      // 冻结期间允许转方向
      if (dir !== null) this.dir = dir;
      this.moving = false;
      return;
    }

    const onIce = this.isOnIce();
    // 进入冰地块时播放打滑音效（仅在从非冰进入冰时触发一次）
    if (onIce && !this._wasOnIce) {
      Sound.sliding();
    }
    this._wasOnIce = onIce;
    const moveSpeed = onIce ? Math.ceil(this.speed * 1.5) : this.speed;
    if (dir !== null) {
      this.moving = this.move(dir, moveSpeed);
      this.slideTimer = onIce ? 24 : 0;
    } else if (onIce && this.slideTimer > 0) {
      this.slideTimer--;
      this.moving = this.move(this.dir, moveSpeed);
    } else {
      this.moving = false;
    }
    if (fire) this.fire(game);
  }

  _updateEnemy(game) {
    if (game.freezeTimer > 0) {
      this.moving = false;
      return;
    }
    if (this.spawnTimer > 0) {
      this.moving = false;
      return;
    }

    // AI：定时改变方向，受阻时立即重新选择
    this.aiTimer--;
    if (this.aiTimer <= 0) {
      this.dir = this._chooseDirection(game);
      this.aiTimer = randInt(50) + 25;
      // 向 Guest 广播 AI 方向改变（Host 也就是p1为主和nes主机逻辑一致）
      if (game._broadcastGameEvent && this.enemyId != null) {
        game._broadcastGameEvent(GAME_EVT.AI_DIRECTION, [
          this.enemyId,
          this.dir,
        ]);
      }
    }
    const onIce = this.isOnIce();
    const moveSpeed = onIce ? Math.ceil(this.speed * 1.5) : this.speed;
    const moved = this.move(this.dir, moveSpeed);
    this.moving = moved;
    if (!moved && !(onIce && this.slideTimer > 0)) {
      this.aiTimer = 0; // 撞墙立刻重新决策
    }

    // 开火
    this.fireTimer--;
    if (this.fireTimer <= 0) {
      this.fire(game);
      this.fireTimer = randInt(60) + this.baseCooldown;
    }
  }

  _chooseDirection(game) {
    // 35% 概率朝目标（基地或玩家）方向移动，其余随机巡逻
    if (Math.random() < 0.35) {
      const c = this.center();
      let target;
      if (Math.random() < 0.5) {
        target = {
          x: game.level.baseTile.x * TILE + TILE / 2,
          y: game.level.baseTile.y * TILE + TILE / 2,
        };
      } else {
        // 随机选择一个存活的玩家作为目标
        const players = [];
        if (game.player && game.player.alive) players.push(game.player);
        if (game.player2 && game.player2.alive) players.push(game.player2);
        if (players.length > 0) {
          target = choice(players).center();
        } else {
          target = { x: c.x, y: FIELD };
        }
      }
      const dx = target.x - c.x;
      const dy = target.y - c.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? DIR.RIGHT : DIR.LEFT;
      }
      return dy > 0 ? DIR.DOWN : DIR.UP;
    }
    return choice([DIR.UP, DIR.RIGHT, DIR.DOWN, DIR.LEFT]);
  }

  fire(game) {
    if (this.fireCooldown > 0) return;
    if (this.activeBullets >= this.maxBullets) return;
    if (this.spawnTimer > 0) return;
    const c = this.center();
    const v = DIR_VEC[this.dir];
    const bx = c.x + v.x * (TILE / 2);
    const by = c.y + v.y * (TILE / 2);
    const b = new Bullet(game, bx, by, this.dir, this, this.bulletSpeed, this.power);
    game.bullets.push(b);
    this.activeBullets++;
    this.fireCooldown = this.isPlayer ? 8 : 12;
    if (this.isPlayer) Sound.fire();
  }

  // 受击：返回 true 表示被摧毁
  takeDamage() {
    if (this.spawnTimer > 0 || this.shieldTimer > 0) return false;
    this.health--;
    if (this.health <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  draw(ctx, frame) {
    if (!this.alive) return;
    const animFrame = (this.animTick >> 2) & 1;

    // 出生星特效：出生期间只显示星，坦克随后出现
    if (this.spawnTimer > 0) {
      Sprites.drawSpawn(ctx, this.x, this.y, this.spawnTimer, this.spawnMax);
      return;
    }

    // 重甲坦克随血量变色
    let pal = this.pal;
    if (this.type === ENEMY.ARMOR) {
      pal = Object.assign({}, this.pal, {
        body: ARMOR_COLORS[clamp(this.health - 1, 0, 3)],
      });
    }
    // 奖励坦克闪烁红色
    if (this.isBonus && frame) {
      pal = Object.assign({}, pal, { body: "#ff4d4d", light: "#ffb3b3" });
    }
    if (this.isPlayer) {
      // 被冻结时闪烁（每4帧交替显示/半透明）
      if (this.stunTimer > 0 && ((this.stunTimer >> 2) & 1)) {
        ctx.globalAlpha = 0.4;
      }
      // 玩家坦克使用原版素材
      if (this.playerIndex === 2) {
        Sprites.drawPlayer2Tank(ctx, this.x, this.y, this.dir, this.level, animFrame);
      } else {
        Sprites.drawPlayerTank(ctx, this.x, this.y, this.dir, this.level, animFrame);
      }
      if (this.stunTimer > 0) {
        ctx.globalAlpha = 1;
      }
    } else {
      // 敌人坦克使用原版 e1-e4 素材
      const key = enemySpriteKey(this, frame, animFrame);
      if (!Sprites.drawTankSprite(ctx, this.x, this.y, this.dir, key)) {
        Sprites.drawTank(ctx, this.x, this.y, this.dir, pal, 0, animFrame);
      }
    }

    if (this.shieldTimer > 0) {
      Sprites.drawShield(ctx, this.x, this.y, frame);
    }
    // 船护盾（拥有船时显示）
    if (this.hasBoat) {
      Sprites.drawRiverShield(ctx, this.x, this.y);
    }
  }
}

/* ---------------- 子弹 ---------------- */

class Bullet {
  constructor(game, x, y, dir, owner, speed, power) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.owner = owner;
    this.speed = speed;
    this.power = power;
    this.size = 6;
    this.alive = true;
    this.fromPlayer = owner.isPlayer;
  }

  rect() {
    return {
      x: this.x - this.size / 2,
      y: this.y - this.size / 2,
      w: this.size,
      h: this.size,
    };
  }

  update(game) {
    const v = DIR_VEC[this.dir];
    const steps = Math.ceil(this.speed / 2);
    const step = this.speed / steps;
    for (let i = 0; i < steps && this.alive; i++) {
      this.x += v.x * step;
      this.y += v.y * step;
      this._collide(game);
    }
  }

  _collide(game) {
    // 出界
    if (this.x < 0 || this.x > FIELD || this.y < 0 || this.y > FIELD) {
      this.alive = false;
      game.addExplosion(this.x, this.y, "boom1");
      if (this.fromPlayer) Sound.bulletHit1();
      return;
    }
    // 瓦片
    if (this._hitTiles(game)) {
      this.alive = false;
      return;
    }
    // 坦克
    for (const t of game.allTanks()) {
      if (!t.alive || t === this.owner) continue;
      // 玩家子弹 vs 玩家坦克 → 冻结（不伤害）
      if (this.fromPlayer && t.isPlayer) {
        if (rectsOverlap(this.rect(), t.rect())) {
          this.alive = false;
          game.onPlayerStun(t, this);
          return;
        }
        continue;
      }
      // 敌人子弹不打敌人
      if (!this.fromPlayer && !t.isPlayer) continue;
      if (rectsOverlap(this.rect(), t.rect())) {
        this.alive = false;
        if (this.fromPlayer) {
          game.onEnemyHit(t, this);
        } else {
          game.onPlayerHit(t, this);
        }
        return;
      }
    }
  }

  _hitTiles(game) {
    const v = DIR_VEC[this.dir];
    // 撞击区域：以子弹前端为中心，垂直方向展开一个小格
    const fx = this.x + v.x * 3;
    const fy = this.y + v.y * 3;
    let rect;
    if (v.x !== 0) {
      rect = { x: fx - 3, y: fy - CELL / 2, w: 6, h: CELL };
    } else {
      rect = { x: fx - CELL / 2, y: fy - 3, w: CELL, h: 6 };
    }
    const cx0 = (rect.x / CELL) | 0;
    const cy0 = (rect.y / CELL) | 0;
    const cx1 = ((rect.x + rect.w - 1) / CELL) | 0;
    const cy1 = ((rect.y + rect.h - 1) / CELL) | 0;

    let hit = false;
    let hitBrick = false;
    let hitSteel = false;
    let hitBase = false;

    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const t = game.level.cellAt(cx, cy);
        if (Level.isBrickType(t)) {
          hit = true;
          hitBrick = true;
          this._destroyBrickHalf(game, cx, cy, t);
        } else if (t === TT.STEEL) {
          hit = true;
          hitSteel = true;
          if (this.power >= 2) game.level.setCell(cx, cy, TT.EMPTY);
        } else if (t === TT.BASE) {
          hit = true;
          hitBase = true;
        }
      }
    }

    if (hit) {
      game.addExplosion(this.x, this.y, "boom1");
      if (hitBase) {
        game.onBaseHit();
      } else if (this.fromPlayer) {
        if (hitSteel && this.power >= 2) {
          // 满级玩家击毁钢块
          Sound.bulletHit2();
        } else if (hitSteel) {
          // 玩家子弹打在钢块上无法消灭
          Sound.bulletHit1();
        } else if (hitBrick) {
          // 玩家子弹打在砖块上
          Sound.bulletHit2();
        }
      }
    }
    return hit;
  }

  // 砖块半破坏逻辑：子弹打掉砖块面向子弹的半边
  // 完整砖 → 半砖（保留背离子弹方向的一半）
  // 半砖被再次命中 → 空地
  _destroyBrickHalf(game, cx, cy, t) {
    // 高威力子弹（power>=2）直接摧毁整格
    if (this.power >= 2) {
      game.level.setCell(cx, cy, TT.EMPTY);
      return;
    }

    // 根据子弹方向决定打掉哪一半
    // 子弹向上 → 打掉下半，保留上半
    // 子弹向下 → 打掉上半，保留下半
    // 子弹向左 → 打掉右半，保留左半
    // 子弹向右 → 打掉左半，保留右半
    if (t === TT.BRICK) {
      // 完整砖 → 变半砖
      switch (this.dir) {
        case DIR.UP:    game.level.setCell(cx, cy, TT.BRICK_TOP); break;
        case DIR.DOWN:  game.level.setCell(cx, cy, TT.BRICK_BOTTOM); break;
        case DIR.LEFT:  game.level.setCell(cx, cy, TT.BRICK_LEFT); break;
        case DIR.RIGHT: game.level.setCell(cx, cy, TT.BRICK_RIGHT); break;
      }
    } else {
      // 已是半砖 → 直接摧毁（任何方向的子弹都能打掉残留半砖）
      game.level.setCell(cx, cy, TT.EMPTY);
    }
  }

  draw(ctx) {
    Sprites.drawBullet(ctx, this);
  }
}

/* ---------------- 爆炸 ---------------- */

class Explosion {
  constructor(x, y, kind) {
    this.x = x;
    this.y = y;
    this.kind = kind || "small"; // small | boom1 | boom2
    this.frame = 0;
    this.timer = 0;
    if (this.kind === "boom1") this.frames = ["boom1_1", "boom1_2", "boom1_3"];
    else if (this.kind === "boom2") this.frames = ["boom2_0", "boom2_1", "boom2_1"];
    else this.frames = null; // 小火花用程序化
    this.maxFrames = this.frames ? this.frames.length : 4;
    this.alive = true;
  }

  update() {
    this.timer++;
    if (this.timer % 4 === 0) {
      this.frame++;
      if (this.frame >= this.maxFrames) this.alive = false;
    }
  }

  draw(ctx) {
    Sprites.drawExplosion(ctx, this);
  }
}

/* ---------------- 道具 ---------------- */

class PowerUp {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.w = TILE;
    this.h = TILE;
    this.type = type;
    this.timer = 0;
    this.life = 60 * 12; // 约 12 秒后消失
    this.alive = true;
  }

  rect() {
    return { x: this.x + 2, y: this.y + 2, w: this.w - 4, h: this.h - 4 };
  }

  update() {
    this.timer++;
    this.life--;
    if (this.life <= 0) this.alive = false;
  }

  draw(ctx) {
    Sprites.drawPowerUp(ctx, this, (this.timer >> 3) & 1);
  }
}
