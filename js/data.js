/**
 * data.js
 * ゲーム内で使用するすべての定数・テーブルデータを定義するファイル。
 * ロジック処理は一切書かない。値を変えたい場合はここだけ修正する。
 *
 * Godot移植時の対応: GameData.gd / const.gd に相当
 */

// =============================================================
// ゲーム全体の基本設定
// =============================================================
const GAME_CONFIG = {
  STAT_MAX:  100,   // 各能力値の上限
  STAT_MIN:  1,     // 各能力値の下限
  STAT_INITIAL: 10, // 振り分け前の初期値（最低保証）

  // キャラ作成時の振り分け可能ポイント
  CREATE_POINTS: 60,

  FATIGUE_MAX: 100,
  FATIGUE_INJURY_THRESHOLD: 85, // これを超えると故障リスク

  STARTING_MONEY: 500_000,
};

// =============================================================
// 能力値の定義
// =============================================================
const STAT_CATEGORIES = {
  PHYSIQUE: "体格",
  BASIC:    "基礎能力",
  PLAY:     "プレー能力",
};

/**
 * 各能力値の定義リスト
 * key      : 内部キー（英語）
 * label    : 表示名（日本語）
 * category : 所属カテゴリ
 * initial  : 振り分け前の初期値
 * isFixed  : true の場合、GP では上げられない（身長）
 * min/max  : 作成時に振り分けられる最小・最大値
 */
const STAT_DEFINITIONS = [
  // --- 体格 ---
  { key: "height",    label: "身長(cm)",  category: STAT_CATEGORIES.PHYSIQUE, initial: 170, isFixed: true,  createMin: 160, createMax: 210 },

  // --- 基礎能力 ---
  { key: "strength",  label: "筋力",      category: STAT_CATEGORIES.BASIC,    initial: 10,  isFixed: false },
  { key: "jump",      label: "ジャンプ",  category: STAT_CATEGORIES.BASIC,    initial: 10,  isFixed: false },
  { key: "speed",     label: "スピード",  category: STAT_CATEGORIES.BASIC,    initial: 10,  isFixed: false },
  { key: "stamina",   label: "スタミナ",  category: STAT_CATEGORIES.BASIC,    initial: 10,  isFixed: false },
  { key: "technique", label: "テクニック",category: STAT_CATEGORIES.BASIC,    initial: 10,  isFixed: false },

  // --- プレー能力 ---
  { key: "spike",     label: "スパイク",  category: STAT_CATEGORIES.PLAY,     initial: 10,  isFixed: false },
  { key: "receive",   label: "レシーブ",  category: STAT_CATEGORIES.PLAY,     initial: 10,  isFixed: false },
  { key: "block",     label: "ブロック",  category: STAT_CATEGORIES.PLAY,     initial: 10,  isFixed: false },
  { key: "serve",     label: "サーブ",    category: STAT_CATEGORIES.PLAY,     initial: 10,  isFixed: false },
  { key: "toss",      label: "トス",      category: STAT_CATEGORIES.PLAY,     initial: 10,  isFixed: false },
];

// =============================================================
// 成長ポイント（GP）コスト表
// 能力値が高いほど1ポイント上げるコストが増える
// =============================================================
const GP_COST_TABLE = [
  { thresholdBelow: 31,  gpCost: 1 }, // 1〜30
  { thresholdBelow: 51,  gpCost: 2 }, // 31〜50
  { thresholdBelow: 71,  gpCost: 3 }, // 51〜70
  { thresholdBelow: 91,  gpCost: 4 }, // 71〜90
  { thresholdBelow: 101, gpCost: 5 }, // 91〜100
];

// =============================================================
// トレーニング種別の定義
// =============================================================
const TRAINING_TYPES = [
  {
    id: "basic_light",
    name: "基礎練（軽）",
    icon: "🏃",
    cost: 0,
    fatigue: 15,
    gpMin: 2, gpMax: 4,
    description: "体力・基礎力を軽めに鍛える。\n疲労が少なく試合前でも使いやすい。",
    boostStats: STAT_CATEGORIES.BASIC,
  },
  {
    id: "basic_hard",
    name: "基礎練（強）",
    icon: "💪",
    cost: 0,
    fatigue: 30,
    gpMin: 4, gpMax: 7,
    description: "ハードな基礎トレーニング。\nGPをしっかり稼げるが疲労大。",
    boostStats: STAT_CATEGORIES.BASIC,
  },
  {
    id: "skill_light",
    name: "技術練（軽）",
    icon: "🏐",
    cost: 0,
    fatigue: 15,
    gpMin: 2, gpMax: 4,
    description: "スパイク・レシーブなど技術を磨く。\n疲労少なめで継続しやすい。",
    boostStats: STAT_CATEGORIES.PLAY,
  },
  {
    id: "skill_hard",
    name: "技術練（強）",
    icon: "🎯",
    cost: 0,
    fatigue: 30,
    gpMin: 5, gpMax: 8,
    description: "集中的な技術トレーニング。\n多くのGPを獲得できる。",
    boostStats: STAT_CATEGORIES.PLAY,
  },
  {
    id: "rest",
    name: "休息",
    icon: "😴",
    cost: 0,
    fatigue: -40,
    gpMin: 0, gpMax: 0,
    description: "しっかり休んで疲労を回復する。\nGPは得られないが体調が戻る。",
    boostStats: null,
  },
];

// =============================================================
// チームテーブル（Tier 1〜5）
// =============================================================

/**
 * Tier 1：弱小チーム（スタート地点）
 * Tier 5：世界強豪チーム（最終目標）
 */
const TEAM_TABLE = [
  // --- Tier 1：弱小 ---
  { id: "seagulls",   name: "湘南シーガルズ",   tier: 1, salary: 150_000, attackBase: 18, defenseBase: 18 },
  { id: "eagles",     name: "東北イーグルス",    tier: 1, salary: 140_000, attackBase: 17, defenseBase: 20 },
  { id: "dolphins",   name: "名古屋ドルフィンズ",tier: 1, salary: 160_000, attackBase: 20, defenseBase: 17 },

  // --- Tier 2：中堅 ---
  { id: "tigers",     name: "関西タイガース",    tier: 2, salary: 280_000, attackBase: 35, defenseBase: 33 },
  { id: "wolves",     name: "北海道ウルブズ",    tier: 2, salary: 260_000, attackBase: 32, defenseBase: 36 },
  { id: "hawks",      name: "福岡ホークス",      tier: 2, salary: 300_000, attackBase: 38, defenseBase: 31 },

  // --- Tier 3：強豪 ---
  { id: "dragons",    name: "中部ドラゴンズ",    tier: 3, salary: 500_000, attackBase: 54, defenseBase: 52 },
  { id: "lions",      name: "埼玉ライオンズ",    tier: 3, salary: 520_000, attackBase: 57, defenseBase: 50 },
  { id: "bears",      name: "横浜ベアーズ",      tier: 3, salary: 480_000, attackBase: 51, defenseBase: 55 },

  // --- Tier 4：超強豪 ---
  { id: "giants",     name: "東京ジャイアンツ",  tier: 4, salary: 900_000, attackBase: 72, defenseBase: 70 },
  { id: "royals",     name: "神奈川ロイヤルズ",  tier: 4, salary: 950_000, attackBase: 75, defenseBase: 68 },

  // --- Tier 5：世界クラス ---
  { id: "phoenixes",  name: "Jフェニックス",     tier: 5, salary: 1_800_000, attackBase: 88, defenseBase: 86 },
  { id: "aces",       name: "全日本エース",       tier: 5, salary: 2_000_000, attackBase: 92, defenseBase: 90 },
];

// =============================================================
// キャリア設定
// =============================================================
const CAREER_CONFIG = {
  // 開始チームID
  START_TEAM_ID: "seagulls",

  // 評価値の初期値
  INITIAL_EVALUATION: 0,

  // 試合ごとの最大評価獲得量
  EVAL_WIN_BASE:  20,
  EVAL_LOSE_BASE:  5,
  EVAL_MVP_BONUS: 30,
  EVAL_SPIKE_BONUS:   2, // スパイク成功1本あたり
  EVAL_RECEIVE_BONUS: 1, // レシーブ成功1本あたり

  // 移籍オファー発生のTier別評価閾値
  TRANSFER_OFFER_THRESHOLD: {
    2: 80,   // Tier2からオファーが来る評価値
    3: 200,  // Tier3
    4: 400,  // Tier4
    5: 700,  // Tier5
  },

  // 移籍申請が通る条件（評価値）
  TRANSFER_REQUEST_THRESHOLD: {
    2: 60,
    3: 160,
    4: 320,
    5: 600,
  },

  // 1シーズンの試合数（スケジュール参照）
  MATCHES_PER_SEASON: 8,

  // 月給（チームによって異なるがフォールバック用）
  DEFAULT_SALARY: 150_000,
};

// =============================================================
// 試合スケジュール（キャリア進行順）
// =============================================================

/**
 * 試合は matchIndex（0始まり）の順番で進行する。
 * tier     : この試合が解放されるプレイヤーのチームTier
 * matchType: MATCH_REWARDS のキー
 * label    : 表示名
 * evalMod  : 評価変動倍率（重要な試合ほど大きい）
 */
const MATCH_SCHEDULE = [
  // --- シーズン1（弱小〜中堅期）---
  { matchIndex: 0,  tier: 1, matchType: "practice",        label: "練習試合",           evalMod: 0.5 },
  { matchIndex: 1,  tier: 1, matchType: "practice",        label: "練習試合",           evalMod: 0.5 },
  { matchIndex: 2,  tier: 1, matchType: "local_league",    label: "地方リーグ 第1節",   evalMod: 1.0 },
  { matchIndex: 3,  tier: 1, matchType: "local_league",    label: "地方リーグ 第2節",   evalMod: 1.0 },
  { matchIndex: 4,  tier: 1, matchType: "local_league",    label: "地方リーグ 第3節",   evalMod: 1.0 },
  { matchIndex: 5,  tier: 1, matchType: "local_league",    label: "地方リーグ 第4節",   evalMod: 1.0 },
  { matchIndex: 6,  tier: 1, matchType: "local_cup",       label: "地方大会 準決勝",    evalMod: 1.5 },
  { matchIndex: 7,  tier: 1, matchType: "local_cup",       label: "地方大会 決勝",      evalMod: 2.0 },

  // --- シーズン2（中堅〜強豪期）---
  { matchIndex: 8,  tier: 2, matchType: "local_league",    label: "地方リーグ 開幕戦",  evalMod: 1.0 },
  { matchIndex: 9,  tier: 2, matchType: "national_league", label: "全国リーグ 第1節",   evalMod: 1.2 },
  { matchIndex: 10, tier: 2, matchType: "national_league", label: "全国リーグ 第2節",   evalMod: 1.2 },
  { matchIndex: 11, tier: 2, matchType: "national_league", label: "全国リーグ 第3節",   evalMod: 1.2 },
  { matchIndex: 12, tier: 2, matchType: "national_cup",    label: "全国大会 1回戦",     evalMod: 1.8 },
  { matchIndex: 13, tier: 2, matchType: "national_cup",    label: "全国大会 準決勝",    evalMod: 2.0 },
  { matchIndex: 14, tier: 2, matchType: "national_cup",    label: "全国大会 決勝",      evalMod: 2.5 },

  // --- シーズン3（強豪〜世界期）---
  { matchIndex: 15, tier: 3, matchType: "national_league", label: "全国リーグ 前半戦",  evalMod: 1.5 },
  { matchIndex: 16, tier: 3, matchType: "national_league", label: "全国リーグ 後半戦",  evalMod: 1.5 },
  { matchIndex: 17, tier: 3, matchType: "national_cup",    label: "全国大会 準々決勝",  evalMod: 2.0 },
  { matchIndex: 18, tier: 3, matchType: "national_cup",    label: "全国大会 準決勝",    evalMod: 2.5 },
  { matchIndex: 19, tier: 4, matchType: "world_cup",       label: "世界大会 予選",      evalMod: 2.5 },
  { matchIndex: 20, tier: 4, matchType: "world_cup",       label: "世界大会 準決勝",    evalMod: 3.0 },
  { matchIndex: 21, tier: 5, matchType: "world_cup",       label: "世界大会 決勝",      evalMod: 4.0 },
];

// =============================================================
// 試合報酬テーブル
// =============================================================
const MATCH_REWARDS = {
  practice:        { label: "練習試合",     prizeMoney: 0,         gpBonus: 1 },
  local_league:    { label: "地方リーグ",   prizeMoney: 50_000,    gpBonus: 2 },
  national_league: { label: "全国リーグ",   prizeMoney: 150_000,   gpBonus: 3 },
  local_cup:       { label: "地方大会",     prizeMoney: 300_000,   gpBonus: 4 },
  national_cup:    { label: "全国大会",     prizeMoney: 800_000,   gpBonus: 5 },
  world_cup:       { label: "世界大会",     prizeMoney: 3_000_000, gpBonus: 8 },
};

// =============================================================
// 対戦相手（CPU）強さテーブル
// matchType と playerTeamTier の両方を参照して難易度を決める
// =============================================================
const OPPONENT_TABLE = {
  practice: {
    attackMin: 15, attackMax: 28,
    defenseMin: 15, defenseMax: 26,
    names: ["市立高校Aチーム", "地域クラブB", "大学サークルC", "隣町スポーツクラブ"],
  },
  local_league: {
    attackMin: 25, attackMax: 45,
    defenseMin: 22, defenseMax: 42,
    names: ["県立北高校", "南スポーツクラブ", "東区バレーBC", "西部ファルコンズ"],
  },
  national_league: {
    attackMin: 44, attackMax: 65,
    defenseMin: 40, defenseMax: 60,
    names: ["関東選抜A", "中部エリートクラブ", "関西強豪チーム", "北日本アタッカーズ"],
  },
  local_cup: {
    attackMin: 35, attackMax: 55,
    defenseMin: 32, defenseMax: 52,
    names: ["地方大会強豪", "伝統の雄校", "新鋭スパイカーズ", "県代表チーム"],
  },
  national_cup: {
    attackMin: 58, attackMax: 78,
    defenseMin: 55, defenseMax: 75,
    names: ["全国制覇を狙う鷹", "日本代表候補選抜", "強化指定クラブ", "黒鷹スポーツ"],
  },
  world_cup: {
    attackMin: 75, attackMax: 95,
    defenseMin: 72, defenseMax: 92,
    names: ["ブラジル代表", "ロシア選抜", "アメリカ最強チーム", "ポーランド代表", "フランス代表"],
  },
};

// =============================================================
// マップロケーション定義
// Canvas（800×600）上の各場所の位置・情報
// =============================================================
const MAP_LOCATIONS = [
  {
    id:    "home",
    label: "自宅",
    icon:  "🏠",
    x: 130, y: 400,   // マップ上のCanvas座標
    desc:  "疲労を回復・セーブができる",
  },
  {
    id:    "gym",
    label: "ジム",
    icon:  "🏋️",
    x: 300, y: 290,
    desc:  "トレーニングでGPを獲得（試合前1回のみ）",
  },
  {
    id:    "stadium",
    label: "スタジアム",
    icon:  "🏟️",
    x: 560, y: 180,
    desc:  "試合に出場する（スケジュール到来時）",
  },
  {
    id:    "agent",
    label: "エージェント",
    icon:  "🏢",
    x: 640, y: 360,
    desc:  "移籍オファー確認・移籍申請",
  },
  {
    id:    "shop",
    label: "ショップ",
    icon:  "🏪",
    x: 180, y: 210,
    desc:  "アイテム・コスメ（近日公開）",
  },
];

// =============================================================
// ラリーフェーズ定義
// =============================================================

/**
 * SERVE       : サーブ（コマンド選択）
 * RECEIVE     : レシーブ（← → 移動 + コマンド）
 * TOSS        : トス（自動進行）
 * SPIKE       : スパイク（コマンド選択、相手ブロック見える）
 * BLOCK       : ブロック（← → 移動 + コマンド）
 * AUTO_RALLY  : 自動ラリー中（プレイヤー関与なし）
 * POINT       : 得点演出（次ラリーへ）
 */
const MATCH_PHASE = {
  SERVE:      "SERVE",
  RECEIVE:    "RECEIVE",
  TOSS:       "TOSS",
  SPIKE:      "SPIKE",
  BLOCK:      "BLOCK",
  AUTO_RALLY: "AUTO_RALLY",
  POINT:      "POINT",
};

/**
 * フェーズごとのコマンドボタン定義
 * successMod : 成功率補正（正で有利、負で不利）
 * description: 短い効果説明
 */
const PHASE_COMMANDS = {
  // サーブコマンド
  [MATCH_PHASE.SERVE]: [
    { id: "jump",   label: "ジャンプ",    successMod: -0.05, description: "強力だが難しい" },
    { id: "float",  label: "フローター",  successMod:  0.05, description: "変化球で崩す" },
    { id: "short",  label: "ショート",    successMod:  0.00, description: "前に落とす奇襲" },
    { id: "safe",   label: "安全",        successMod:  0.15, description: "確実に入れる" },
  ],
  // レシーブコマンド（← → 移動と組み合わせ）
  [MATCH_PHASE.RECEIVE]: [
    { id: "receive",  label: "レシーブ",   successMod:  0.10, description: "正確に上げる" },
    { id: "flying",   label: "フライング", successMod: -0.05, description: "無理な体勢で拾う" },
    { id: "avoid",    label: "避ける",     successMod:  0.00, description: "危険なボールを回避" },
  ],
  // スパイクコマンド（相手ブロック位置を見て選択）
  [MATCH_PHASE.SPIKE]: [
    { id: "straight", label: "ストレート", successMod:  0.05, description: "直線の強打" },
    { id: "cross",    label: "クロス",     successMod:  0.05, description: "斜め方向へ" },
    { id: "inner",    label: "インナー",   successMod:  0.00, description: "ブロックの内側へ" },
    { id: "feint",    label: "フェイント", successMod: -0.05, description: "軟打でかわす" },
  ],
  // ブロックコマンド（← → 移動と組み合わせ）
  [MATCH_PHASE.BLOCK]: [
    { id: "kill",  label: "キルブロック", successMod: -0.10, description: "叩き落とす（リスク高）" },
    { id: "soft",  label: "ソフトブロック",successMod:  0.05, description: "拾いやすく弾く" },
    { id: "avoid", label: "避ける",       successMod:  0.10, description: "無理せずレシーブへ" },
  ],
};

// =============================================================
// プレイヤー移動設定
// =============================================================
const PLAYER_MOVE = {
  SPEED:     0.045, // 1フレームあたりの移動量（コート相対値）
  MIN_X:    -0.9,   // 移動できる左端
  MAX_X:     0.9,   // 移動できる右端
  IDEAL_TOL: 0.20,  // この範囲内なら「良いポジション」と判定する許容誤差
};

// =============================================================
// 各フェーズの制限時間（ミリ秒）
// =============================================================
const PHASE_TIMEOUT = {
  [MATCH_PHASE.SERVE]:      3000, // サーブ：3秒
  [MATCH_PHASE.RECEIVE]:    4000, // レシーブ：4秒（移動時間確保）
  [MATCH_PHASE.TOSS]:        800, // トス：自動
  [MATCH_PHASE.SPIKE]:      4000, // スパイク：4秒
  [MATCH_PHASE.BLOCK]:      3500, // ブロック：3.5秒
  [MATCH_PHASE.AUTO_RALLY]: 1200, // 自動ラリー：1.2秒
  [MATCH_PHASE.POINT]:      1500, // 得点演出：1.5秒
};

// =============================================================
// 試合設定
// =============================================================
const MATCH_CONFIG = {
  SETS_TO_WIN:    2,  // 何セット先取で勝利か（ベスト3）
  MAX_SETS:       3,
  POINTS_PER_SET: 25, // 1セット先取点数
  DEUCE_MIN_DIFF: 2,  // デュース時の必要点差

  // 攻撃力の計算重み
  ATTACK_SPIKE_WEIGHT:    1.0,
  ATTACK_STRENGTH_WEIGHT: 0.3,
  ATTACK_JUMP_WEIGHT:     0.4,

  // 守備力の計算重み
  DEFENSE_RECEIVE_WEIGHT: 1.0,
  DEFENSE_BLOCK_WEIGHT:   0.6,
  DEFENSE_SPEED_WEIGHT:   0.3,

  // 補正
  CORRECTION_TECHNIQUE_WEIGHT: 0.3,
  RANDOM_RANGE: 10,
};

// =============================================================
// 試合評価グレード
// =============================================================
const GRADE_TABLE = [
  { grade: "S", minScore: 85, color: "#ffd700", message: "完璧な試合だ！" },
  { grade: "A", minScore: 70, color: "#40ff80", message: "素晴らしいプレーだった！" },
  { grade: "B", minScore: 50, color: "#4a9fff", message: "良い試合だった。" },
  { grade: "C", minScore: 30, color: "#a0c4ff", message: "まだ伸びしろがある。" },
  { grade: "D", minScore:  0, color: "#ff8080", message: "課題が見えた試合だった。" },
];

// =============================================================
// Canvas コート描画定数（後方視点・2.5D透視変換用）
// =============================================================
const COURT_DRAW = {
  CANVAS_W:    800,  // Canvasの幅（px）
  CANVAS_H:    420,  // Canvasの高さ（px）―試合画面のCanvas高さ

  // 透視変換パラメータ
  VP_X:        400,  // 消失点X（画面中央）
  VP_Y:         40,  // 消失点Y（上部）
  NEAR_Y:      400,  // 手前のY（プレイヤー側）
  FAR_Y:        90,  // 奥のY（ネット・相手側）
  NEAR_HALF_W: 360,  // 手前半幅（px）
  FAR_HALF_W:  160,  // 奥半幅（px）

  // ネット位置（0=手前, 1=奥。0.5が中央）
  NET_DEPTH:   0.48,

  // ボールアニメーション
  BALL_RADIUS: 10,
};

// =============================================================
// エンディング定義
// =============================================================
const ENDINGS = [
  {
    id: "world_champion",
    priority: 1,
    title: "世界チャンピオン！",
    icon: "🏆",
    condition: (state) => state.record.worldCupWins >= 1 && state.record.mvpCount >= 1,
    message: "世界大会を制し、MVPを獲得した！\nあなたはバレーボール界の頂点に立った。",
  },
  {
    id: "world_finalist",
    priority: 2,
    title: "世界の舞台へ",
    icon: "🥈",
    condition: (state) => state.record.worldCupWins >= 1,
    message: "世界大会で優勝！\n日本を代表するアスリートとなった。",
  },
  {
    id: "national_champion",
    priority: 3,
    title: "全国制覇",
    icon: "🥇",
    condition: (state) => state.record.nationalCupWins >= 1,
    message: "全国大会を制した！\n日本最強の称号を手に入れた。",
  },
  {
    id: "local_hero",
    priority: 4,
    title: "地方の英雄",
    icon: "🏅",
    condition: (state) => state.record.localCupWins >= 1,
    message: "地方大会を制した！\nまだまだ上を目指せる可能性がある。",
  },
  {
    id: "career_end",
    priority: 5,
    title: "キャリア終了",
    icon: "🌟",
    condition: () => true,
    message: "長いキャリアを駆け抜けた。\n勝敗を超え、この道を選んだことに誇りを持て。",
  },
];

// =============================================================
// ゲームオーバー理由
// =============================================================
const GAME_OVER_REASONS = {
  INJURY:   "重大な故障を負ってしまった。\n無理しすぎたのがたたった。",
  NO_MONEY: "所持金が尽きた。",
};

// =============================================================
// 疲労状態ラベル
// =============================================================
const FATIGUE_STATUS = [
  { maxFatigue: 30,  label: "良好",   color: "#40e080" },
  { maxFatigue: 55,  label: "普通",   color: "#a0c4ff" },
  { maxFatigue: 75,  label: "疲労",   color: "#ffd040" },
  { maxFatigue: 90,  label: "高疲労", color: "#ff9040" },
  { maxFatigue: 100, label: "限界",   color: "#ff4040" },
];
