/* =========================================================
 * 关卡地图与瓦片网格
 * 地图用 26x26 字符定义，1 字符 = 1 小格（CELL 16px）
 *   ' ' 空地   B 砖墙   S 钢墙   W 水   T 树林   I 冰   E 基地(2x2)
 * 注意：E 占 2x2 小格（即一个 TILE），在地图中只需标记左上角位置
 * =======================================================*/

const LEVEL_MAPS = [
  // ─── 第 1 关：经典开场，纯砖墙 ───
  [
    "                          ",
    "                          ",
    "  BBBB  BBBB  BBBB  BBBB  ",
    "  BBBB  BBBB  BBBB  BBBB  ",
    "  BBBB  BBBB  BBBB  BBBB  ",
    "  BBBB  BBBB  BBBB  BBBB  ",
    "  BBBB  BBBBBBBBBB  BBBB  ",
    "  BBBB  BBBBBBBBBB  BBBB  ",
    "  BBBB  BB      BB  BBBB  ",
    "  BBBB  BB      BB  BBBB  ",
    "        BB      BB        ",
    "        BB      BB        ",
    "  BBBB  BBBBBBBBBB  BBBB  ",
    "  BBBB  BBBBBBBBBB  BBBB  ",
    "        BB      BB        ",
    "        BB      BB        ",
    "  BBBB  BB      BB  BBBB  ",
    "  BBBB  BB      BB  BBBB  ",
    "  BBBB  BBBBBBBBBB  BBBB  ",
    "  BBBB  BBBBBBBBBB  BBBB  ",
    "  BBBB  BBBBBBBBBB  BBBB  ",
    "  BBBB  BBBBBBBBBB  BBBB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 2 关：引入钢墙 ───
  [
    "                          ",
    "                          ",
    "  BBBB  SS  BBBB  SS  BBBB",
    "  BBBB  SS  BBBB  SS  BBBB",
    "  BBBB      BBBB      BBBB",
    "  BBBB      BBBB      BBBB",
    "      BBBB      BBBB      ",
    "      BBBB      BBBB      ",
    "  SS  BBBB  SS  BBBB  SS  ",
    "  SS  BBBB  SS  BBBB  SS  ",
    "      BBBB      BBBB      ",
    "      BBBB      BBBB      ",
    "  BBBB    SSSSSS    BBBB  ",
    "  BBBB    SSSSSS    BBBB  ",
    "      BBBB      BBBB      ",
    "      BBBB      BBBB      ",
    "  SS  BBBB  SS  BBBB  SS  ",
    "  SS  BBBB  SS  BBBB  SS  ",
    "      BBBB      BBBB      ",
    "      BBBB      BBBB      ",
    "  BBBB  SS  BBBB  SS  BBBB",
    "  BBBB  SS  BBBB  SS  BBBB",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 3 关：水域 + 树林 ───
  [
    "        SS      SS        ",
    "        SS      SS        ",
    "  BBBBBBBB      BBBBBBBB  ",
    "  BBBBBBBB      BBBBBBBB  ",
    "  BB    BB      BB    BB  ",
    "  BB    BB      BB    BB  ",
    "  BB    BBBB  BBBB    BB  ",
    "  BB    BBBB  BBBB    BB  ",
    "        BB      BB        ",
    "        BB      BB        ",
    "WWWW    BB  TT  BB    WWWW",
    "WWWW    BB  TT  BB    WWWW",
    "WWWW  SSBB  TT  BBSS  WWWW",
    "WWWW  SSBB  TT  BBSS  WWWW",
    "WWWW    BB  TT  BB    WWWW",
    "WWWW    BB  TT  BB    WWWW",
    "        BB      BB        ",
    "        BB      BB        ",
    "  BB    BBBBSSBBBB    BB  ",
    "  BB    BBBB  BBBB    BB  ",
    "  BB    BB      BB    BB  ",
    "  BB    BB      BB    BB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 4 关：冰面滑行 ───
  [
    "    SS              SS    ",
    "    SS              SS    ",
    "    SS  BBBBBB  SS  BBBB  ",
    "    SS  BBBBBB  SS  BBBB  ",
    "    SS  BB  BB  SS  BB    ",
    "    SS  BB  BB  SS  BB    ",
    "  IIII  BB  BB    IIIBB   ",
    "  IIII  BB  BB    IIIBB   ",
    "  IIII      BB    IIII    ",
    "  IIII      BB    IIII    ",
    "  BBBBBBBB  BB  BBBBBBBB  ",
    "  BBBBBBBB  BB  BBBBBBBB  ",
    "            BB            ",
    "            BB            ",
    "  BBBBBBBB  BB  BBBBBBBB  ",
    "  BBBBBBBB  BB  BBBBBBBB  ",
    "    IIII    BB    IIII    ",
    "    IIII    BB    IIII    ",
    "    IIII BB BB  BBIIII    ",
    "    IIII BB BB  BBIIII    ",
    "  BBBB  BB  BB  BB  BBBB  ",
    "  BBBB  BB  BB  BB  BBBB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 5 关：迷宫走廊 ───
  [
    "  BBBBBBBBBB  BBBBBBBBBB  ",
    "  BBBBBBBBBB  BBBBBBBBBB  ",
    "  BB                  BB  ",
    "  BB                  BB  ",
    "  BB  BBBBBB  BBBBBB  BB  ",
    "  BB  BBBBBB  BBBBBB  BB  ",
    "      BB          BB      ",
    "      BB          BB      ",
    "BBBB  BB  BBBBBB  BB  BBBB",
    "BBBB  BB  BBBBBB  BB  BBBB",
    "      BB  BB  BB  BB      ",
    "      BB  BB  BB  BB      ",
    "  SS  BB    SSBB  BB  SS  ",
    "  SS  BB    SSBB  BB  SS  ",
    "      BB  BB  BB  BB      ",
    "      BB  BB  BB  BB      ",
    "BBBB  BB  BBBBBB  BB  BBBB",
    "BBBB  BB  BBBBBB  BB  BBBB",
    "      BB          BB      ",
    "      BB          BB      ",
    "  BB  BBBBBBBBBBBBBB  BB  ",
    "  BB  BBBBBBBBBBBBBB  BB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 6 关：河流分割 ───
  [
    "                          ",
    "                          ",
    "  BBBB  WWWW  WWWW  BBBB  ",
    "  BBBB  WWWW  WWWW  BBBB  ",
    "  BBBB  WWWW  WWWW  BBBB  ",
    "  BBBB  WWWW  WWWW  BBBB  ",
    "  BBBB        WWWW  BBBB  ",
    "  BBBB        WWWW  BBBB  ",
    "  BBBB  BBBB  WWWW  BBBB  ",
    "  BBBB  BBBB  WWWW  BBBB  ",
    "        BBBBSS            ",
    "        BBBBBB            ",
    "  SSSS  BBBB  BBBB  SSSS  ",
    "  SSSS  BBBB  BBBB  SSSS  ",
    "        BBBB  BBBB        ",
    "        BBBB  BBBB        ",
    "  BBBB  WWWW  BBBB  BBBB  ",
    "  BBBB  WWWW  BBBB  BBBB  ",
    "  BBBB  WWWW        BBBB  ",
    "  BBBB  WWWW        BBBB  ",
    "  BBBB  WWWW  WWWW  BBBB  ",
    "  BBBB  WWWW  WWWW  BBBB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 7 关：丛林战 ───
  [
    "  TT    BBBB  BBBB    TT  ",
    "  TT    BBBB  BBBB    TT  ",
    "TTTT    BB      BB    TTTT",
    "TTTT    BB      BB    TTTT",
    "    TTTT    SS    TTTT    ",
    "    TTTT    SS    TTTT    ",
    "  BB    TTTTTTTTTT    BB  ",
    "  BB    TTTTTTTTTT    BB  ",
    "  BB    TT  BB  TT    BB  ",
    "  BB    TT  BB  TT    BB  ",
    "  BBBB  TT      TT  BBBB  ",
    "  BBBB  TT      TT  BBBB  ",
    "        TTTTTTTTTT        ",
    "        TTTTTTTTTT        ",
    "  BBBB  TT      TT  BBBB  ",
    "  BBBB  TT      TT  BBBB  ",
    "  BB    TT  BB  TT    BB  ",
    "  BB    TT  BB  TT    BB  ",
    "  BB    TTTTTTTTTT    BB  ",
    "  BB    TTTTTTTTTT    BB  ",
    "    TTTT    SS    TTTT    ",
    "    TTTT    SS    TTTT    ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 8 关：钢铁堡垒 ───
  [
    "  SS      SS  SS      SS  ",
    "  SS      SS  SS      SS  ",
    "  SS  BB  SS  SS  BB  SS  ",
    "  SS  BB  SS  SS  BB  SS  ",
    "      BB          BB      ",
    "      BB          BB      ",
    "BBBBBBBB  BBBBBB  BBBBBBBB",
    "BBBBBBBB  BBBBBB  BBBBBBBB",
    "          BB  BB          ",
    "          BB  BB          ",
    "  SSSS    BB  BB    SSSS  ",
    "  SSSS    BB  BB    SSSS  ",
    "          BB  BB          ",
    "          BB  BB          ",
    "  SSSS    BB  BB    SSSS  ",
    "  SSSS    BB  BB    SSSS  ",
    "          BB  BB          ",
    "          BB  BB          ",
    "BBBBBBBB  BBBBBB  BBBBBBBB",
    "BBBBBBBB  BBBBBB  BBBBBBBB",
    "      BB    SS    BB      ",
    "      BB          BB      ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 9 关：十字路口 ───
  [
    "  BB                  BB  ",
    "  BB                  BB  ",
    "      BBBB  BB  BBBB      ",
    "      BBBB  BB  BBBB      ",
    "      BBBB      BBBB      ",
    "      BBBB      BBBB      ",
    "  BBBBBBBB  BB  BBBBBBBB  ",
    "  BBBBBBBB  BB  BBBBBBBB  ",
    "            BB            ",
    "            BB            ",
    "SSBB    BBBBBBBBBB    BBSS",
    "SSBB    BBBBBBBBBB    BBSS",
    "                          ",
    "                          ",
    "SSBB    BBBBBBBBBB    BBSS",
    "SSBB    BBBBBBBBBB    BBSS",
    "            BB            ",
    "            BB            ",
    "  BBBBBBBB  BB  BBBBBBBB  ",
    "  BBBBBBBB  BB  BBBBBBBB  ",
    "      BBBB      BBBB      ",
    "      BBBB      BBBB      ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 10 关：混合地形 ───
  [
    "  WW  BBBB      BBBB  WW  ",
    "  WW  BBBB      BBBB  WW  ",
    "      BBBB  SS  BBBB      ",
    "      BBBB  SS  BBBB      ",
    "  IIII    BBBBBB    IIII  ",
    "  IIII    BBBBBB    IIII  ",
    "  IIII    BB  BB    IIII  ",
    "  IIII    BB  BB    IIII  ",
    "  TTTTBB  BB  BB  BBTTTT  ",
    "  TTTTBB  BB  BB  BBTTTT  ",
    "  TTTT    BB  BB    TTTT  ",
    "  TTTT    BB  BB    TTTT  ",
    "      SSSS      SSSS      ",
    "      SSSS      SSSS      ",
    "  TTTT    BB  BB    TTTT  ",
    "  TTTT    BB  BB    TTTT  ",
    "  TTTTBB  BB  BB  BBTTTT  ",
    "  TTTTBB  BB  BB  BBTTTT  ",
    "  IIII    BB  BB    IIII  ",
    "  IIII    BB  BB    IIII  ",
    "  IIII    BBBBBB    IIII  ",
    "  IIII    BBBBBB    IIII  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 11 关：螺旋 ───
  [
    "  BBBBBBBBBB  BBBBBBBBBB  ",
    "  BBBBBBBBBB  BBBBBBBBBB  ",
    "                          ",
    "                          ",
    "BB  BBBBBBBBBBBBBBBBBB  BB",
    "BB  BBBBBBBBBBBBBBBBBB  BB",
    "BB  BB              BB  BB",
    "BB  BB              BB  BB",
    "BB  BB  BBBBBBBBBB  BB  BB",
    "BB  BB  BBBBBBBBBB  BB  BB",
    "BB  BB  BB      BB  BB  BB",
    "BB  BB  BB      BB  BB  BB",
    "BB  BB  BB  SS  BB  BB  BB",
    "BB  BB  BB  SS  BB  BB  BB",
    "BB  BB  BB      BB  BB  BB",
    "BB  BB  BB      BB  BB  BB",
    "BB  BB  BBBBBBBBBB  BB  BB",
    "BB  BB  BBBBBBBBBB  BB  BB",
    "BB  BB              BB  BB",
    "BB  BB              BB  BB",
    "BB  BBBBBBBBBBBBBBBBBB  BB",
    "BB  BBBBBBBBBBBBBBBBBB  BB",
    "BB                      BB",
    "BB         BBBB         BB",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 12 关：四分格局 ───
  [
    "  BBBB  BB      BB  BBBB  ",
    "  BBBB  BB      BB  BBBB  ",
    "  BB    BBBBBBBBBB    BB  ",
    "  BB    BBBBBBBBBB    BB  ",
    "  BB    BB      BB    BB  ",
    "  BB    BB      BB    BB  ",
    "  BBBB  BB  WW  BB  BBBB  ",
    "  BBBB  BB  WW  BB  BBBB  ",
    "    BB      WW      BB    ",
    "    BB      WW      BB    ",
    "SSSSSSSSSS  WW  SSSSSSSSSS",
    "SSSSSSSSSS  WW  SSSSSSSSSS",
    "            WW            ",
    "            WW            ",
    "SSSSSSSSSS  WW  SSSSSSSSSS",
    "SSSSSSSSSS  WW  SSSSSSSSSS",
    "    BB      WW      BB    ",
    "    BB      WW      BB    ",
    "  BBBB  BB  WW  BB  BBBB  ",
    "  BBBB  BB  WW  BB  BBBB  ",
    "  BB    BB  SS  BB    BB  ",
    "  BB    BB  SS  BB    BB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 13 关：城堡 ───
  [
    "    SS  SS      SS  SS    ",
    "    SS  SS      SS  SS    ",
    "                          ",
    "                          ",
    "  BBBBBBBB  SS  BBBBBBBB  ",
    "  BBBBBBBB  SS  BBBBBBBB  ",
    "  BB    BB      BB    BB  ",
    "  BB    BB      BB    BB  ",
    "  BB    BBBBBBBBBB    BB  ",
    "  BB    BBBBBBBBBB    BB  ",
    "  BB        BB        BB  ",
    "  BB        BB        BB  ",
    "  BBBB  SS  BB  SS  BBBB  ",
    "  BBBB  SS  BB  SS  BBBB  ",
    "  BB        BB        BB  ",
    "  BB        BB        BB  ",
    "  BB    BBBBBBBBBB    BB  ",
    "  BB    BBBBBBBBBB    BB  ",
    "  BB    BB      BB    BB  ",
    "  BB    BB      BB    BB  ",
    "  BBBBBBBB      BBBBBBBB  ",
    "  BBBBBBBB      BBBBBBBB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 14 关：河流蜿蜒 ───
  [
    "  BB  BBBB    BB  BBBB    ",
    "  BB  BBBB    BB  BBBB    ",
    "      BB          BB    BB",
    "      BB          BB    BB",
    "BB  WWWWWW  BB  WWWWWW  BB",
    "BB  WWWWWW  BB  WWWWWW  BB",
    "BB      WW  BB  WW      BB",
    "BB      WW  BB  WW      BB",
    "BBBB    WW  BB  WW    BBBB",
    "BBBB    WW  BB  WW    BBBB",
    "    SS  WW      WW  SS    ",
    "    SS  WW      WW  SS    ",
    "        WWWWWWWWWW        ",
    "        WWWWWWWWWW        ",
    "    SS  WW  SS  WW  SS    ",
    "    SS  WW  SS  WW  SS    ",
    "BBBB    WW  BB  WW    BBBB",
    "BBBB    WW  BB  WW    BBBB",
    "BB      WW  BB  WW      BB",
    "BB      WW  BB  WW      BB",
    "BB  WWWWWW  BB  WWWWWW  BB",
    "BB  WWWWWW  BB  WWWWWW  BB",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 15 关：冰面竞速 ───
  [
    "  IIIIIIIIII  IIIIIIIIII  ",
    "  IIIIIIIIII  IIIIIIIIII  ",
    "    BBBB      BBBB        ",
    "    BBBB      BBBB        ",
    "II      SS  SS      BB  II",
    "II      SS  SS      BB  II",
    "II  BB      BB  BB  BB  II",
    "II  BB      BB  BB  BB  II",
    "II  BB  BB  BB  BB      II",
    "II  BB  BB  BB  BB      II",
    "II      BB      BB  BB  II",
    "II      BB      BB  BB  II",
    "II  SS      SS      BB  II",
    "II  SS      SS      BB  II",
    "II      BB      BB      II",
    "II      BB      BB      II",
    "II  BB  BB  SS  BB  BB  II",
    "II  BB  BB  SS  BB  BB  II",
    "II  BB      BB      BB  II",
    "II  BB      BB      BB  II",
    "II      BBBB  BBBB      II",
    "II      BBBB  BBBB      II",
    "IIIIIIIIII      IIIIIIIIII",
    "IIIIIIIIII BBBB IIIIIIIIII",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 16 关：密集火力 ───
  [
    "  BB  BB  BB  BB  BB  BB  ",
    "  BB  BB  BB  BB  BB  BB  ",
    "                          ",
    "                          ",
    "BB  BB  BB  BB  BB  BB  BB",
    "BB  BB  BB  BB  BB  BB  BB",
    "                          ",
    "                          ",
    "  BB  BB  SSSS  BB  BB    ",
    "  BB  BB  SSSS  BB  BB    ",
    "                          ",
    "                          ",
    "BB  BB  BB  BB  BB  BB  BB",
    "BB  BB  BB  BB  BB  BB  BB",
    "                          ",
    "                          ",
    "  BB  BB  SSSS  BB  BB    ",
    "  BB  BB  SSSS  BB  BB    ",
    "                          ",
    "                          ",
    "BB  BB  BB  BB  BB  BB  BB",
    "BB  BB  BB  BB  BB  BB  BB",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 17 关：角落防守 ───
  [
    "  SS                  SS  ",
    "  SS                  SS  ",
    "    BBBBBB      BBBBBB    ",
    "    BBBBBB      BBBBBB    ",
    "    BB  BB  TT  BB  BB    ",
    "    BB  BB  TT  BB  BB    ",
    "    BB  BBBBTTBBBB  BB    ",
    "    BB  BBBBTTBBBB  BB    ",
    "    BB      TT      BB    ",
    "    BB      TT      BB    ",
    "  TTTTTTTTTTBBTTTTTTTTTT  ",
    "  TTTTTTTTTTBBTTTTTTTTTT  ",
    "    BB      TT      BB    ",
    "    BB      TT      BB    ",
    "  TTTTTTTTTTSSTTTTTTTTTT  ",
    "  TTTTTTTTTTSSTTTTTTTTTT  ",
    "    BB      TT      BB    ",
    "    BB      TT      BB    ",
    "    BB  BBBBTTBBBB  BB    ",
    "    BB  BBBBTTBBBB  BB    ",
    "    BB  BB  TT  BB  BB    ",
    "    BB  BB  TT  BB  BB    ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 18 关：开阔战场 ───
  [
    "                          ",
    "                          ",
    "  SS          SS          ",
    "  SS          SS          ",
    "      BBBB        BBBB    ",
    "      BBBB        BBBB    ",
    "          SS          SS  ",
    "          SS          SS  ",
    "  BBBB        BBBB        ",
    "  BBBB        BBBB        ",
    "      SS          SS      ",
    "      SS          SS      ",
    "          BBBB            ",
    "          BBBB            ",
    "  SS          SS          ",
    "  SS          SS          ",
    "      BBBB        BBBB    ",
    "      BBBB        BBBB    ",
    "          SS          SS  ",
    "          SS          SS  ",
    "  BBBB        BBBB        ",
    "  BBBB        BBBB        ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 19 关：双河夹攻 ───
  [
    "                          ",
    "  BBBB  WWWW  WWWW  BBBB  ",
    "  BB    WWWW  WWWW    BB  ",
    "  BB    WWWW  WWWW    BB  ",
    "  BB    WWWW  WWWW    BB  ",
    "  BB    WWWW  WWWW    BB  ",
    "  BB    WWWW  WWWW    BB  ",
    "  BB    WWWW  WWWW    BB  ",
    "  BB                  BB  ",
    "  BB                  BB  ",
    "  BBBB  BBBBBBBBBB  BBBB  ",
    "  BBBB  BBBBBBBBBB  BBBB  ",
    "        BB  SS  BB        ",
    "        BB  SS  BB        ",
    "  BBBB  BBBBBBBBBB  BBBB  ",
    "  BBBB  BBBBBBBBBB  BBBB  ",
    "  BB                  BB  ",
    "  BB                  BB  ",
    "  BB    WWWW  WWWW    BB  ",
    "  BB    WWWW  WWWW    BB  ",
    "  BB    WWWW  WWWW    BB  ",
    "  BB    WWWW  WWWW    BB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 20 关：铁幕 ───
  [
    "                          ",
    "  SSSSSSSSSS  SSSSSSSSSS  ",
    "  SSSSSSSSSS  SSSSSSSSSS  ",
    "                          ",
    "SS  BBBBBB  SS  BBBBBB  SS",
    "SS  BBBBBB  SS  BBBBBB  SS",
    "SS  BB  BB      BB  BB  SS",
    "SS  BB  BB      BB  BB  SS",
    "    BB  BBBBBBBBBB  BB    ",
    "    BB  BBBBBBBBBB  BB    ",
    "    BB              BB    ",
    "    BB              BB    ",
    "SS  BB  BBBB  BBBB  BB  SS",
    "SS  BB  BBBB  BBBB  BB  SS",
    "    BB              BB    ",
    "    BB              BB    ",
    "    BB  BBBBBBBBBB  BB    ",
    "    BB  BBBBBBBBBB  BB    ",
    "SS  BB  BB      BB  BB  SS",
    "SS  BB  BB      BB  BB  SS",
    "SS  BBBBBB      BBBBBB  SS",
    "SS  BBBBBB      BBBBBB  SS",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 21 关：三叉路 ───
  [
    "                          ",
    "                          ",
    "  BBBBBB    BB    BBBBBB  ",
    "  BBBBBB    BB    BBBBBB  ",
    "  BB    BBBBBBBBBB    BB  ",
    "  BB    BBBBBBBBBB    BB  ",
    "  BB    BB      BB    BB  ",
    "  BB    BB      BB    BB  ",
    "  BB    BB  SS  BB    BB  ",
    "  BB    BB  SS  BB    BB  ",
    "  BB        SS        BB  ",
    "  BB        SS        BB  ",
    "  BBBBBBBBBBSSBBBBBBBBBB  ",
    "  BBBBBBBBBBSSBBBBBBBBBB  ",
    "  BB        SS        BB  ",
    "  BB        SS        BB  ",
    "  BB    BB  SS  BB    BB  ",
    "  BB    BB  SS  BB    BB  ",
    "  BB    BB      BB    BB  ",
    "  BB    BB      BB    BB  ",
    "  BB    BBBBBBBBBB    BB  ",
    "  BB    BBBBBBBBBB    BB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 22 关：水池中央 ───
  [
    "                          ",
    "  BBBB  BB      BB  BBBB  ",
    "  BBBB              BBBB  ",
    "  BBBB              BBBB  ",
    "  BB  WWWWWWBBWWWWWW  BB  ",
    "  BB  WWWWWWBBWWWWWW  BB  ",
    "      WW          WW      ",
    "      WW          WW      ",
    "  BB  WW  BBBBBB  WW  BB  ",
    "  BB  WW  BBBBBB  WW  BB  ",
    "  BB  WW  BBSSBB  WW  BB  ",
    "  BB  WW  BB  BB  WW  BB  ",
    "      BB  BB  BB  BB      ",
    "      BB  BBSSBB  BB      ",
    "  BB  WW  BBBBBB  WW  BB  ",
    "  BB  WW  BBBBBB  WW  BB  ",
    "  BB  WW          WW  BB  ",
    "  BB  WW          WW  BB  ",
    "  BB  WWWWWWBBWWWWWW  BB  ",
    "  BB  WWWWWWBBWWWWWW  BB  ",
    "  BB        BB        BB  ",
    "  BB        BB        BB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 23 关：钻石阵型 ───
  [
    "                          ",
    "                          ",
    "        BBBBBBBBBB        ",
    "        BBBBBBBBBB        ",
    "    BBBB    BB    BBBB    ",
    "    BBBB    BB    BBBB    ",
    "BBBB    SS  BB  SS    BBBB",
    "BBBB    SS  BB  SS    BBBB",
    "BB      BB      BB      BB",
    "BB      BB      BB      BB",
    "BB  TT  BB  SS  BB  TT  BB",
    "BB  TT  BB  SS  BB  TT  BB",
    "BB      BB      BB      BB",
    "BB      BB      BB      BB",
    "BB  TT  BB  SS  BB  TT  BB",
    "BB  TT  BB  SS  BB  TT  BB",
    "BB      BB      BB      BB",
    "BB      BB      BB      BB",
    "BBBB    SS  BB  SS    BBBB",
    "BBBB    SS  BB  SS    BBBB",
    "    BBBB    BB    BBBB    ",
    "    BBBB    BB    BBBB    ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 24 关：冰河大陆 ───
  [
    "  II  BBBB      BBBB  II  ",
    "  II  BBBB      BBBB  II  ",
    "  II  BB          BB  II  ",
    "  II  BB          BB  II  ",
    "IIII  BB  WWWWWW  BB  IIII",
    "IIII  BB  WWWWWW  BB  IIII",
    "      BB  WW  WW  BB      ",
    "      BB  WW  WW  BB      ",
    "  BBBBBB  WW  WW  BBBBBB  ",
    "  BBBBBB  WW  WW  BBBBBB  ",
    "          WW  WW          ",
    "          WW  WW          ",
    "  SS  SS  WW  WW  SS  SS  ",
    "  SS  SS  WW  WW  SS  SS  ",
    "          WW  WW          ",
    "          WW  WW          ",
    "  BBBBBB  WW  WW  BBBBBB  ",
    "  BBBBBB  WW  WW  BBBBBB  ",
    "      BB  WWWWWW  BB      ",
    "      BB  WWWWWW  BB      ",
    "IIII  BB          BB  IIII",
    "IIII  BB    SS    BB  IIII",
    "IIII                  IIII",
    "IIII       BBBB       IIII",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 25 关：锯齿阵 ───
  [
    "        BB      BB        ",
    "        BB      BB        ",
    "BBBB    BBBB    BBBB    BB",
    "BBBB    BBBB    BBBB    BB",
    "  BBBB    BBBB    BBBB    ",
    "  BBBB    BBBB    BBBB    ",
    "    BBBB    BBBB    BBBB  ",
    "    BBBB    BBBB    BBBB  ",
    "SS    SS    SS    SS    SS",
    "SS    SS    SS    SS    SS",
    "    BBBB    BBBB    BBBB  ",
    "    BBBB    BBBB    BBBB  ",
    "  BBBB    BBBB    BBBB    ",
    "  BBBB    BBBB    BBBB    ",
    "BBBB    BBBB    BBBB    BB",
    "BBBB    BBBB    BBBB    BB",
    "  BBBB    BBBB    BBBB    ",
    "  BBBB    BBBB    BBBB    ",
    "    BBBB    BBBB    BBBB  ",
    "    BBBB    BBBB    BBBB  ",
    "SS    SS    SS    SS    SS",
    "SS    SS    SS    SS    SS",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 26 关：密林深处 ───
  [
    "  TTTTTTTTTT  TTTTTTTTTT  ",
    "  TTTTTTTTTT  TTTTTTTTTT  ",
    "TT  BB  TT  BB  TT  BB  TT",
    "TT  BB  TT  BB  TT  BB  TT",
    "TT  BB  TT  BB  TT  BB  TT",
    "TT  BB  TT  BB  TT  BB  TT",
    "TT      TT      TT      TT",
    "TT      TT      TT      TT",
    "TTTTTTTTTTTTTTTTTTTTTTTTTT",
    "TTTTTTTTTTTTTTTTTTTTTTTTTT",
    "TT      TT      TT      TT",
    "TT      TT      TT      TT",
    "TT  SS  TT  SS  TT  SS  TT",
    "TT  SS  TT  SS  TT  SS  TT",
    "TT      TT      TT      TT",
    "TT      TT      TT      TT",
    "TTTTTTTTTTTTTTTTTTTTTTTTTT",
    "TTTTTTTTTTTTTTTTTTTTTTTTTT",
    "TT      TT      TT      TT",
    "TT      TT      TT      TT",
    "TT  BB  TT  BB  TT  BB  TT",
    "TT  BB  TT  BB  TT  BB  TT",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 27 关：环形防线 ───
  [
    "  BBBBBBBBBB  BBBBBBBBBB  ",
    "  BBBBBBBBBB  BBBBBBBBBB  ",
    "  BB                  BB  ",
    "  BB                  BB  ",
    "  BB  SSSSSSSSSSSSSS  BB  ",
    "  BB  SSSSSSSSSSSSSS  BB  ",
    "  BB  SS          SS  BB  ",
    "  BB  SS          SS  BB  ",
    "  BB  SS  BBBBBB  SS  BB  ",
    "  BB  SS  BBBBBB  SS  BB  ",
    "      BB  BB  BB  BB      ",
    "      SS  BB  BB  SS      ",
    "  WW  SS  BB  BB  SS  WW  ",
    "  WW  SS  BB  BB  SS  WW  ",
    "      SS  BBBBBB  SS      ",
    "      BB  BBBBBB  BB      ",
    "  BB  SS          SS  BB  ",
    "  BB  SS          SS  BB  ",
    "  BB  SSSSSSSSSSSSSS  BB  ",
    "  BB  SSSSSSSSSSSSSS  BB  ",
    "  BB                  BB  ",
    "  BB                  BB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 28 关：蛇形通道 ───
  [
    "        BBBB  BBBB        ",
    "        BBBB  BBBB        ",
    "  BBBB              BBBB  ",
    "  BBBB              BBBB  ",
    "  BB  BBBBBBBBBBBB  BB    ",
    "  BB  BBBBBBBBBBBB  BB    ",
    "  BB              BBBB    ",
    "  BB              BBBB    ",
    "  BBBBBBBBBB  BBBBBB      ",
    "  BBBBBBBBBB  BBBBBB      ",
    "          BBSSBB    SS    ",
    "          BBSSBB    SS    ",
    "  SS  BBBBBB  BBBBBB      ",
    "  SS  BBBBBB  BBBBBB      ",
    "      BB              BB  ",
    "      BB              BB  ",
    "  BBBBBB  BBBBBBBBBB  BB  ",
    "  BBBBBB  BBBBBBBBBB  BB  ",
    "              BB      BB  ",
    "              BB      BB  ",
    "  BBBBBBBBBBBBBB  BBBBBB  ",
    "  BBBBBBBBBBBBBB  BBBBBB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 29 关：钢铁丛林 ───
  [
    "    TT  SS      SS  TT    ",
    "    TT  SS      SS  TT    ",
    "    TT      TT      TT    ",
    "    TT      TT      TT    ",
    "BBBBTTBBBBBBTTBBBBBBTTBBBB",
    "BBBBTTBBBBBBTTBBBBBBTTBBBB",
    "    TT      TT      TT    ",
    "    TT      TT      TT    ",
    "SS  TT  SS  TT  SS  TT  SS",
    "SS  TT  SS  TT  SS  TT  SS",
    "    TT      SS      TT    ",
    "    TT      SS      TT    ",
    "BBBBTTBBBB  TT  BBBBTTBBBB",
    "BBBBTTBBBB  TT  BBBBTTBBBB",
    "    TT      TT      TT    ",
    "    TT      TT      TT    ",
    "SS  TT  SS  TT  SS  TT  SS",
    "SS  TT  SS  TT  SS  TT  SS",
    "    TT      TT      TT    ",
    "    TT      TT      TT    ",
    "BBBBTTBBBBBBTTBBBBBBTTBBBB",
    "BBBBTTBBBBBBTTBBBBBBTTBBBB",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 30 关：最终防线 ───
  [
    "                          ",
    "                          ",
    "  BB  BB  BB  BB  BB  BB  ",
    "  BB  BB  BB  BB  BB  BB  ",
    "  BB  BB  BB  BB  BB  BB  ",
    "  BB  BB  BB  BB  BB  BB  ",
    "                          ",
    "                          ",
    "BBBBBBBBBBBBBBBBBBBBBBBBBB",
    "BBBBBBBBBBBBBBBBBBBBBBBBBB",
    "  TT  WW  TT  WW  TT  WW  ",
    "  TT  WW  TT  WW  TT  WW  ",
    "  TT  WW  TT  WW  TT  WW  ",
    "  TT  WW  TT  WW  TT  WW  ",
    "                          ",
    "                          ",
    "BBBBBBBBBBBBBBBBBBBBBBBBBB",
    "BBBBBBBBBBBBSSBBBBBBBBBBBB",
    "  BB  BB  BB  BB  BB  BB  ",
    "  BB  BB  BB  BB  BB  BB  ",
    "  BB  BB  BB  BB  BB  BB  ",
    "  BB  BB  BB  BB  BB  BB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 31 关：双层城墙 ───
  [
    "  BBBBBBBBBB  BBBBBBBBBB  ",
    "  BBBBBBBBBB  BBBBBBBBBB  ",
    "      BB          BB    BB",
    "      BB          BB    BB",
    "BB SS BB  BBBB    BB SS BB",
    "BB SS BB  BBBB    BB SS BB",
    "BB    BB  BB      BB    BB",
    "BB    BB  BB      BB    BB",
    "BB    BB  BB    BBBB    BB",
    "BB    BB  BB    BBBB    BB",
    "            BB            ",
    "            BB            ",
    "  IIIIIIIIIIIIIIIIIIIIII  ",
    "  IIIIIIIIIIIIIIIIIIIIII  ",
    "            BB            ",
    "            BB            ",
    "BB    BB  BB    BBBB    BB",
    "BB    BB  BB    BBBB    BB",
    "BB SS BB  BBSS    BB SS BB",
    "BB SS BB  BBSS    BB SS BB",
    "BB    BB  BB      BB    BB",
    "BB    BB  BB      BB    BB",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 32 关：对角线 ───
  [
    "                          ",
    "                          ",
    "  BBBB              BBBB  ",
    "  BBBB              BBBB  ",
    "      BBBB  SS  BBBB      ",
    "      BBBB  SS  BBBB      ",
    "    SS    BBBB    SS      ",
    "    SS    BBBB    SS      ",
    "  BBBB        BBBBBB      ",
    "  BBBB        BBBBBB      ",
    "    BB  TTTT  BB    WW    ",
    "    BB  TTTT  BB    WW    ",
    "        TTTT        WW    ",
    "        TTTT        WW    ",
    "    WW  TTTT  BB    BB    ",
    "    WW  TTTT  BB    BB    ",
    "    WW        BBBBBB      ",
    "    WW        BBBBBB      ",
    "      SS  BBBB    SS      ",
    "      SS  BBBB    SS      ",
    "  BBBB  SS    SS  BBBB    ",
    "  BBBB  SS    SS  BBBB    ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 33 关：全地形挑战 ───
  [
    "  WW  TTTT      TTTT  WW  ",
    "  WW  TTTT      TTTT  WW  ",
    "      TT    BB    TT      ",
    "      TT    BB    TT      ",
    "  BB  TT  IIIIII  TT  BB  ",
    "  BB  TT  IIIIII  TT  BB  ",
    "  BB      IIIIII      BB  ",
    "  BB      IIIIII      BB  ",
    "  BBBBBB  IIIIII  BBBBBB  ",
    "  BBBBBB  IIIIII  BBBBBB  ",
    "          IIIIII          ",
    "          IIIIII          ",
    "SS  BBBB  IIIIII  BBBB  SS",
    "SS  BBBB  IIIIII  BBBB  SS",
    "          IIIIII          ",
    "          IIIIII          ",
    "  BBBBBB  IIIIII  BBBBBB  ",
    "  BBBBBB  IIIIII  BBBBBB  ",
    "  BB      IIIIII      BB  ",
    "  BB      IIIIII      BB  ",
    "WW    TT    SS    TT    WW",
    "WW    TT    SS    TT    WW",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 34 关：最后冲刺 ───
  [
    "  SS  SS  SS  SS  SS  SS  ",
    "  SS  SS  SS  SS  SS  SS  ",
    "  BB  BB  BB  BB  BB  BB  ",
    "  BB  BB  BB  BB  BB  BB  ",
    "                          ",
    "                          ",
    "WWBBWWBBWWBBWWBBWWBBWWBBWW",
    "WWBBWWBBWWBBWWBBWWBBWWBBWW",
    "                          ",
    "                          ",
    "  TTTTTTTTTTTTTTTTTTTTTT  ",
    "  TTTTTTTTTTTTTTTTTTTTTT  ",
    "    TT  BB      BB  TT    ",
    "    TT  BB      BB  TT    ",
    "  TTTTTTTTTTTTTTTTTTTTTT  ",
    "  TTTTTTTTTTTTTTTTTTTTTT  ",
    "                          ",
    "                          ",
    "IIIIIIIIIIIIIIIIIIIIIIIIII",
    "IIIIIIIIIIIIIIIIIIIIIIIIII",
    "  BB  BB  BBSSBB  BB  BB  ",
    "  BB  BB  BBSSBB  BB  BB  ",
    "                          ",
    "           BBBB           ",
    "           BEEB           ",
    "           B  B           "
  ],
  // ─── 第 35 关：终极决战 ───
  [
    "  SSSSSS          SSSSSS  ",
    "  SSSSSS          SSSSSS  ",
    "        BBBBBBBBBB        ",
    "        BBBBBBBBBB        ",
    "SS  WW  BB      BB  WW  SS",
    "SS  WW  BB      BB  WW  SS",
    "    WW  BB  TT  BB  WW    ",
    "    WW  BB  TT  BB  WW    ",
    "    WW  BB  TT  BB  WW    ",
    "    WW  BB  TT  BB  WW    ",
    "  BBBB  BB  TT  BB  BBBB  ",
    "  BBBB  BB  TT  BB  BBBB  ",
    "        BB      BB        ",
    "        BB      BB        ",
    "  BBBB  BB  TT  BB  BBBB  ",
    "  BBBB  BB  TT  BB  BBBB  ",
    "    WW  BB  TT  BB  WW    ",
    "    WW  BB  TT  BB  WW    ",
    "BB  WW  BB      BB  WW  BB",
    "BB  WW  BB      BB  WW  BB",
    "BB      BBBBSSBBBB      BB",
    "BB      BBBBSSBBBB      BB",
    "BB                      BB",
    "BB         BBBB         BB",
    "           BEEB           ",
    "           B  B           "
  ]
];

const CHAR_TO_TILE = {
  " ": TT.EMPTY,
  ".": TT.EMPTY,
  B: TT.BRICK,
  S: TT.STEEL,
  W: TT.WATER,
  T: TT.TREE,
  I: TT.ICE,
  E: TT.BASE,
};

class Level {
  constructor(mapRows) {
    this.grid = [];
    for (let y = 0; y < SUB; y++) {
      this.grid.push(new Array(SUB).fill(TT.EMPTY));
    }
    this.baseTile = { x: 6, y: 12 }; // 大格坐标（TILE 单位）
    this.baseAlive = true;
    this.hasWater = false;
    this._dirtyTiles = []; // 网络同步用：记录被修改的格子 [cx, cy, type, cx, cy, type, ...]
    this._build(mapRows);
    this._computeWallCells();
  }

  _build(mapRows) {
    for (let cy = 0; cy < SUB; cy++) {
      const row = mapRows[cy] || "";
      for (let cx = 0; cx < SUB; cx++) {
        const ch = row[cx] || " ";
        const type = CHAR_TO_TILE[ch] !== undefined ? CHAR_TO_TILE[ch] : TT.EMPTY;
        if (type === TT.BASE) {
          // 如果这个格子已经是 BASE（被之前的 E 填充过），跳过
          if (this.grid[cy][cx] === TT.BASE) continue;
          // E 标记左上角，展开为 2x2 小格
          this.baseTile = { x: (cx / 2) | 0, y: (cy / 2) | 0 };
          this.grid[cy][cx] = TT.BASE;
          if (cx + 1 < SUB) this.grid[cy][cx + 1] = TT.BASE;
          if (cy + 1 < SUB) this.grid[cy + 1][cx] = TT.BASE;
          if (cx + 1 < SUB && cy + 1 < SUB) this.grid[cy + 1][cx + 1] = TT.BASE;
        } else if (type === TT.WATER) {
          this.hasWater = true;
          this.grid[cy][cx] = type;
        } else {
          this.grid[cy][cx] = type;
        }
      }
    }
  }

  // 计算基地外围保护墙的小格坐标（用于铁锹道具）
  _computeWallCells() {
    // 找到 BASE 的左上角小格坐标
    let baseCX = -1, baseCY = -1;
    for (let cy = 0; cy < SUB && baseCX < 0; cy++) {
      for (let cx = 0; cx < SUB && baseCX < 0; cx++) {
        if (this.grid[cy][cx] === TT.BASE) {
          baseCX = cx;
          baseCY = cy;
        }
      }
    }
    if (baseCX < 0) return;

    // 基地占 2x2 小格，外围保护墙环绕
    // 原版保护：上方3格 + 左右各2格（单层砖）
    this.wallCells = [];
    // 上方一排（baseCX-1 到 baseCX+2）
    for (let dx = -1; dx <= 2; dx++) {
      const wx = baseCX + dx;
      const wy = baseCY - 1;
      if (wx >= 0 && wx < SUB && wy >= 0) {
        this.wallCells.push({ x: wx, y: wy });
      }
    }
    // 左侧（baseCX-1, baseCY 和 baseCY+1）
    {
      const wx = baseCX - 1;
      for (let dy = 0; dy <= 1; dy++) {
        const wy = baseCY + dy;
        if (wx >= 0 && wy < SUB) {
          this.wallCells.push({ x: wx, y: wy });
        }
      }
    }
    // 右侧（baseCX+2, baseCY 和 baseCY+1）
    {
      const wx = baseCX + 2;
      for (let dy = 0; dy <= 1; dy++) {
        const wy = baseCY + dy;
        if (wx < SUB && wy < SUB) {
          this.wallCells.push({ x: wx, y: wy });
        }
      }
    }
  }

  inBounds(cx, cy) {
    return cx >= 0 && cx < SUB && cy >= 0 && cy < SUB;
  }

  cellAt(cx, cy) {
    if (!this.inBounds(cx, cy)) return TT.STEEL; // 边界视为不可破坏墙
    return this.grid[cy][cx];
  }

  setCell(cx, cy, type) {
    if (this.inBounds(cx, cy)) {
      this.grid[cy][cx] = type;
      // 记录地图变化（用于网络同步）
      if (this._dirtyTiles) {
        this._dirtyTiles.push(cx, cy, type);
      }
    }
  }

  static isBrickType(type) {
    return (
      type === TT.BRICK ||
      type === TT.BRICK_TOP ||
      type === TT.BRICK_BOTTOM ||
      type === TT.BRICK_LEFT ||
      type === TT.BRICK_RIGHT
    );
  }

  static blocksTank(type) {
    return (
      type === TT.BRICK ||
      type === TT.BRICK_TOP ||
      type === TT.BRICK_BOTTOM ||
      type === TT.BRICK_LEFT ||
      type === TT.BRICK_RIGHT ||
      type === TT.STEEL ||
      type === TT.WATER ||
      type === TT.BASE
    );
  }

  static blocksBullet(type) {
    return (
      type === TT.BRICK ||
      type === TT.BRICK_TOP ||
      type === TT.BRICK_BOTTOM ||
      type === TT.BRICK_LEFT ||
      type === TT.BRICK_RIGHT ||
      type === TT.STEEL ||
      type === TT.BASE
    );
  }

  // 基地外墙加固 / 还原
  fortify(steel) {
    const type = steel ? TT.STEEL : TT.BRICK;
    for (const c of this.wallCells) {
      this.setCell(c.x, c.y, type);
    }
  }

  // 绘制地面层（砖/钢/水/冰 + 基地），树林单独在坦克之上绘制
  drawGround(ctx, frame) {
    for (let cy = 0; cy < SUB; cy++) {
      for (let cx = 0; cx < SUB; cx++) {
        const t = this.grid[cy][cx];
        const x = cx * CELL;
        const y = cy * CELL;
        switch (t) {
          case TT.BRICK:
            Sprites.drawBrick(ctx, x, y);
            break;
          case TT.BRICK_TOP:
            Sprites.drawBrickHalf(ctx, x, y, "top");
            break;
          case TT.BRICK_BOTTOM:
            Sprites.drawBrickHalf(ctx, x, y, "bottom");
            break;
          case TT.BRICK_LEFT:
            Sprites.drawBrickHalf(ctx, x, y, "left");
            break;
          case TT.BRICK_RIGHT:
            Sprites.drawBrickHalf(ctx, x, y, "right");
            break;
          case TT.STEEL:
            Sprites.drawSteel(ctx, x, y);
            break;
          case TT.WATER:
            Sprites.drawWater(ctx, x, y, frame);
            break;
          case TT.ICE:
            Sprites.drawIce(ctx, x, y);
            break;
        }
      }
    }
    // 基地（找到左上角的 BASE 格绘制一次）
    let baseDrawn = false;
    for (let cy = 0; cy < SUB && !baseDrawn; cy++) {
      for (let cx = 0; cx < SUB && !baseDrawn; cx++) {
        if (this.grid[cy][cx] === TT.BASE) {
          Sprites.drawBase(ctx, cx * CELL, cy * CELL, this.baseAlive);
          baseDrawn = true;
        }
      }
    }
  }

  drawTrees(ctx) {
    for (let cy = 0; cy < SUB; cy++) {
      for (let cx = 0; cx < SUB; cx++) {
        if (this.grid[cy][cx] === TT.TREE) {
          Sprites.drawTree(ctx, cx * CELL, cy * CELL);
        }
      }
    }
  }
}
