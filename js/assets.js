/* =========================================================
 * 图片资源加载器：预加载原版素材，加载完成后回调
 * =======================================================*/

const Assets = (function () {
  const images = {};
  let total = 0;
  let loaded = 0;

  function load(manifest, onComplete, onProgress) {
    const keys = Object.keys(manifest);
    total = keys.length;
    loaded = 0;
    if (total === 0) {
      if (onProgress) onProgress(1, 0, 0);
      if (onComplete) onComplete();
      return;
    }
    keys.forEach((key) => {
      const img = new Image();
      const done = () => {
        loaded++;
        if (onProgress) onProgress(loaded / total, loaded, total);
        if (loaded === total && onComplete) onComplete();
      };
      img.onload = done;
      img.onerror = () => {
        console.warn("资源加载失败：", manifest[key]);
        done();
      };
      img.src = manifest[key];
      images[key] = img;
    });
  }

  // 安全绘制：图片未就绪时返回 false，便于回退
  function blit(ctx, key, x, y, w, h) {
    const img = images[key];
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x, y, w, h);
      return true;
    }
    return false;
  }

  return { images, load, blit, get: (k) => images[k] };
})();

// 地块素材清单（原版 img/map）
const TILE_ASSETS = {
  brick: "img/map/wall.png",
  brick0: "img/map/wall0.png",
  brick1: "img/map/wall1.png",
  steel: "img/map/stone.png",
  water0: "img/map/river0.png",
  water1: "img/map/river1.png",
  ice: "img/map/ice.png",
  grass: "img/map/grass.png",
  base: "img/map/camp.png",
  baseBroken: "img/map/camp_break.png",
};

// 玩家坦克素材清单（原版 img/player/p1 与 p2，p{n}_{等级}_{动画帧}）
const PLAYER_ASSETS = (function () {
  const m = {};
  for (let p = 1; p <= 2; p++) {
    for (let lv = 0; lv < 4; lv++) {
      for (let f = 0; f < 2; f++) {
        m["p" + p + "_" + lv + "_" + f] = "img/player/p" + p + "/p" + p + "_" + lv + "_" + f + ".png";
      }
    }
  }
  return m;
})();

// 敌人坦克素材清单（原版 img/enemy）
//  e1 普通 / e2 快速 / e3 火力：e{n}_{变体}_{帧}，变体 0=常规，1=红色道具版，帧 0/1
//  e4 重型：e4_{颜色态}_{帧}，颜色态 1绿/2黄/0灰表示普通血量态，3红表示道具版，各 2 帧
const ENEMY_ASSETS = (function () {
  const m = {};
  [1, 2, 3].forEach((n) => {
    [0, 1].forEach((v) => {
      [0, 1].forEach((f) => {
        m["e" + n + "_" + v + "_" + f] = "img/enemy/e" + n + "_" + v + "_" + f + ".png";
      });
    });
  });
  [0, 1, 2, 3].forEach((tier) => {
    [0, 1].forEach((f) => {
      m["e4_" + tier + "_" + f] = "img/enemy/e4_" + tier + "_" + f + ".png";
    });
  });
  return m;
})();

// 道具图标素材清单（原版 img/prop，键名 = prop_{道具类型}）
const PROP_ASSETS = {
  prop_star: "img/prop/星星.png",
  prop_tank: "img/prop/坦克.png",
  prop_grenade: "img/prop/手雷.png",
  prop_helmet: "img/prop/头盔.png",
  prop_timer: "img/prop/时钟.png",
  prop_shovel: "img/prop/铁锹.png",
  prop_gun: "img/prop/手枪.png",
  prop_boat: "img/prop/船.png",
};

// 特效素材：出生/头盔护盾（两帧）、船护盾
const EFFECT_ASSETS = {
  bornShield0: "img/effect/born_shield/bornShield0.png",
  bornShield1: "img/effect/born_shield/bornShield1.png",
  riverShield: "img/effect/river_shield/river_shield.png",
};

// 子弹素材（原版 img/bullet，朝上）
const BULLET_ASSETS = {
  bullet: "img/bullet/bullet.png",
};

// 爆炸素材：boom1 普通死亡（3 帧）、boom2 大爆炸（e4/满级玩家，2 帧）
const BOOM_ASSETS = {
  boom1_1: "img/effect/boom/boom1/boom1_1.png",
  boom1_2: "img/effect/boom/boom1/boom1_2.png",
  boom1_3: "img/effect/boom/boom1/boom1_3.png",
  boom2_0: "img/effect/boom/boom2/boom2_0.png",
  boom2_1: "img/effect/boom/boom2/boom2_1.png",
};

// 出生星特效（原版 img/effect/star，4 帧）
const STAR_ASSETS = {
  star0: "img/effect/star/star0.png",
  star1: "img/effect/star/star1.png",
  star2: "img/effect/star/star2.png",
  star3: "img/effect/star/star3.png",
};

// UI 素材
const UI_ASSETS = {
  gameoverBig: "img/ui/gameoverBig.png",
};
