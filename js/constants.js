/* =========================================================
 * 常量与全局工具函数
 * =======================================================*/

// 尺寸体系：大格 = 坦克尺寸，小格 = 砖块销毁单元
const TILE = 32; // 一个大格 / 坦克尺寸
const CELL = 16; // 一个小格（可破坏砖块单元）
const GRID = 13; // 每行/列大格数
const FIELD = TILE * GRID; // 416 像素战场
const SUB = GRID * 2; // 26 个小格

// 方向
const DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };
const DIR_VEC = {
  0: { x: 0, y: -1 },
  1: { x: 1, y: 0 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 0 },
};

// 瓦片类型
const TT = {
  EMPTY: 0,
  BRICK: 1,
  STEEL: 2,
  WATER: 3,
  TREE: 4,
  ICE: 5,
  BASE: 6,
  // 半砖：被子弹打掉一半后的残留状态
  BRICK_TOP: 7,    // 只剩上半
  BRICK_BOTTOM: 8, // 只剩下半
  BRICK_LEFT: 9,   // 只剩左半
  BRICK_RIGHT: 10, // 只剩右半
};

// 敌人类型
const ENEMY = {
  BASIC: "basic", // 普通
  FAST: "fast", // 快速
  POWER: "power", // 火力（子弹快）
  ARMOR: "armor", // 重甲（4 条命）
};

// 道具类型
const POWER = {
  STAR: "star", // 升级
  TANK: "tank", // 加命
  GRENADE: "grenade", // 全屏炸敌
  HELMET: "helmet", // 护盾
  TIMER: "timer", // 冻结敌人
  SHOVEL: "shovel", // 基地变钢
  GUN: "gun", // 手枪：相当于两颗星，低概率
  BOAT: "boat", // 船：可渡水 + 一次性护盾，仅含水地图
};

// 配色
const PALETTE = {
  player: {
    tread: "#6b4f00",
    body: "#d8a200",
    light: "#ffe27a",
    dark: "#7a5b00",
  },
  player2: {
    tread: "#1f5d2a",
    body: "#3fae54",
    light: "#9be6a8",
    dark: "#1b4a24",
  },
  basic: { tread: "#3a3d48", body: "#c9ccd4", light: "#ffffff", dark: "#7a7e88" },
  fast: { tread: "#234a5e", body: "#7fd6ef", light: "#d6f4ff", dark: "#2b6f8c" },
  power: { tread: "#5a2b2b", body: "#e98b5b", light: "#ffd2b0", dark: "#8a4a2a" },
  armor: { tread: "#4a3a1f", body: "#caa15a", light: "#ffe6a8", dark: "#7a5e2a" },
};

// 重甲坦克生命对应颜色（随血量变色）
const ARMOR_COLORS = ["#caa15a", "#7fd6ef", "#e98b5b", "#c9ccd4"];

// 游戏参数
const CONFIG = {
  playerSpeed: 1.2, // 玩家坦克移速
  bulletSpeed: 4, // 普通子弹速度
  fastBulletSpeed: 6, // 快速子弹速度，火力敌人和一星以上玩家使用
  enemiesPerStage: 20, // 每关敌人数量
  maxEnemiesOnScreen: 5, // 一屏内最多敌人数量
  maxBonusPerStage: 6, // 每关最多刷新的红坦克（带道具）数量
  // 刷新间隔根据场上敌人数量动态计算（见 _getSpawnInterval）
  spawnIntervalBase: 50,   // 场上 0 辆时基础间隔（最快）
  spawnIntervalStep: 50,   // 每多 1 辆敌人增加的帧数
  fps: 60,
  // 信令服务器地址（默认使用当前页面源地址）
  signalingUrl: "",
};

// 游戏事件子类型（GAME_EVENT 消息的 eventType 字段）
const GAME_EVT = {
  ENEMY_SPAWN:    1,  // 敌人出生
  POWERUP_SPAWN:  2,  // 道具出现
  AI_DIRECTION:   3,  // 敌人 AI 方向改变
  ENEMY_KILLED:   4,  // 敌人被消灭（子弹命中致死）
  PLAYER_HIT:     5,  // 玩家被击中（扣血/死亡）
  PLAYER_RESPAWN: 6,  // 玩家复活
  BULLET_FIRED:   7,  // 子弹发射（敌人开火）
  BASE_HIT:       8,  // 基地被摧毁
  PICKUP:         9,  // 道具被拾取
  FREEZE:        10,  // 冻结敌人（计时器道具）
};

/* ---------------- 工具函数 ---------------- */

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function randInt(n) {
  return Math.floor(Math.random() * n);
}

function choice(arr) {
  return arr[randInt(arr.length)];
}

// 把坐标对齐到最近的小格（用于转向时让坦克对准通道）
function snapToCell(v) {
  return Math.round(v / CELL) * CELL;
}
