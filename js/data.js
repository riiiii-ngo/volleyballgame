/**
 * data.js
 * ゲーム内で使用するすべての定数・テーブルデータを定義するファイル。
 * ロジック処理は一切書かない。
 * 値を変えたい場合はここだけを修正すればよい設計にする。
 *
 * Godot移植時の対応: const.gd / GameData.gd に相当
 */

// =============================================================
// ゲーム全体の基本設定
// =============================================================
const GAME_CONFIG = {
  TOTAL_YEARS: 3,          // ゲーム全体の年数
  MONTHS_PER_YEAR: 12,     // 1年あたりの月数
  WEEKS_PER_MONTH: 4,      // 1ヶ月あたりの週数
  ACTIONS_PER_WEEK: 1,     // 1週間にできる行動回数

  STARTING_MONEY: 500_000, // 開始時の所持金（円）
  MONTHLY_LIVING_COST: 80_000, // 毎月かかる生活費（円）

  FATIGUE_MAX: 100,        // 疲労度の上限
  FATIGUE_INJURY_THRESHOLD: 85, // この疲労度を超えると故障リスクあり
  STAT_MAX: 100,           // 各能力値の上限
  STAT_MIN: 1,             // 各能力値の下限
};

// =============================================================
// 能力値の定義（03_能力設計.xlsx 準拠）
// =============================================================

/**
 * 能力値カテゴリ
 * 「基礎」「プレー」「体格」の3分類
 */
const STAT_CATEGORIES = {
  BASIC: "基礎",
  PLAY: "プレー",
  PHYSIQUE: "体格",
};

/**
 * 各能力値の定義リスト
 * key       : プログラム内部で使うキー名（英語）
 * label     : 画面に表示する日本語名
 * category  : 所属カテゴリ
 * initial   : ゲーム開始時の初期値
 * isFixed   : true の場合、成長ポイントで上げられない（身長など）
 */
const STAT_DEFINITIONS = [
  // --- 基礎能力 ---
  { key: "strength",  label: "筋力",      category: STAT_CATEGORIES.BASIC,    initial: 20, isFixed: false },
  { key: "jump",      label: "ジャンプ",  category: STAT_CATEGORIES.BASIC,    initial: 20, isFixed: false },
  { key: "speed",     label: "スピード",  category: STAT_CATEGORIES.BASIC,    initial: 20, isFixed: false },
  { key: "stamina",   label: "スタミナ",  category: STAT_CATEGORIES.BASIC,    initial: 20, isFixed: false },
  { key: "technique", label: "テクニック",category: STAT_CATEGORIES.BASIC,    initial: 20, isFixed: false },

  // --- プレー能力 ---
  { key: "spike",     label: "スパイク",  category: STAT_CATEGORIES.PLAY,     initial: 15, isFixed: false },
  { key: "receive",   label: "レシーブ",  category: STAT_CATEGORIES.PLAY,     initial: 15, isFixed: false },
  { key: "block",     label: "ブロック",  category: STAT_CATEGORIES.PLAY,     initial: 15, isFixed: false },
  { key: "serve",     label: "サーブ",    category: STAT_CATEGORIES.PLAY,     initial: 15, isFixed: false },
  { key: "toss",      label: "トス",      category: STAT_CATEGORIES.PLAY,     initial: 15, isFixed: false },

  // --- 体格 ---
  { key: "height",    label: "身長(cm)",  category: STAT_CATEGORIES.PHYSIQUE, initial: 175, isFixed: true },
];

// =============================================================
// 試合ロジック定数（04_試合ロジック.docx 準拠）
// 計算式: 攻撃力 - 守備力 + 補正 + ランダム
// =============================================================
const MATCH_CONFIG = {
  SETS_TO_WIN: 2,         // 何セット先取で勝利か（ベスト3の場合は2）
  MAX_SETS: 3,            // 最大セット数
  POINTS_PER_SET: 25,     // 1セットに必要な得点
  DEUCE_MIN_DIFF: 2,      // デュース時の勝利に必要な点差

  // 攻撃力の計算に使う重み
  ATTACK_SPIKE_WEIGHT: 1.0,    // スパイクの寄与度
  ATTACK_TOSS_WEIGHT: 0.5,     // トスの寄与度（セッター支援）
  ATTACK_STRENGTH_WEIGHT: 0.3, // 筋力の寄与度
  ATTACK_JUMP_WEIGHT: 0.3,     // ジャンプの寄与度

  // 守備力の計算に使う重み
  DEFENSE_RECEIVE_WEIGHT: 1.0, // レシーブの寄与度
  DEFENSE_BLOCK_WEIGHT: 0.8,   // ブロックの寄与度
  DEFENSE_SPEED_WEIGHT: 0.3,   // スピードの寄与度
  DEFENSE_STAMINA_WEIGHT: 0.2, // スタミナの寄与度

  // 補正の計算に使う重み
  CORRECTION_TECHNIQUE_WEIGHT: 0.3, // テクニックによる補正

  // ランダム幅（-RANDOM_RANGE 〜 +RANDOM_RANGE）
  RANDOM_RANGE: 12,

  // サーブ補正（サーブ値が高いほど攻撃に上乗せ）
  SERVE_BONUS_WEIGHT: 0.2,
};

// =============================================================
// トレーニング種別の定義（05_成長.docx 準拠）
// =============================================================

/**
 * トレーニング種別ごとの設定
 * id         : 内部識別子
 * name       : 表示名
 * icon       : 絵文字アイコン
 * cost       : トレーニング費用（円）
 * fatigue    : 疲労増加量
 * gpMin/Max  : 獲得する成長ポイント（GP）の範囲
 * description: 説明文
 * boostStats : 効果が高い能力カテゴリ（ヒント表示用）
 */
const TRAINING_TYPES = [
  {
    id: "basic_light",
    name: "基礎練（軽）",
    icon: "🏃",
    cost: 10_000,
    fatigue: 15,
    gpMin: 2,
    gpMax: 4,
    description: "体力・基礎力を軽めに鍛える。\n疲労が少なく毎週続けやすい。",
    boostStats: STAT_CATEGORIES.BASIC,
  },
  {
    id: "basic_hard",
    name: "基礎練（強）",
    icon: "💪",
    cost: 20_000,
    fatigue: 30,
    gpMin: 4,
    gpMax: 7,
    description: "ハードな基礎トレーニング。\nGPをしっかり稼げるが疲労大。",
    boostStats: STAT_CATEGORIES.BASIC,
  },
  {
    id: "skill_light",
    name: "技術練（軽）",
    icon: "🏐",
    cost: 15_000,
    fatigue: 15,
    gpMin: 2,
    gpMax: 4,
    description: "スパイク・レシーブなど技術を磨く。\n疲労少なめで継続しやすい。",
    boostStats: STAT_CATEGORIES.PLAY,
  },
  {
    id: "skill_hard",
    name: "技術練（強）",
    icon: "🎯",
    cost: 30_000,
    fatigue: 30,
    gpMin: 5,
    gpMax: 8,
    description: "集中的な技術トレーニング。\n多くのGPを獲得できる。",
    boostStats: STAT_CATEGORIES.PLAY,
  },
  {
    id: "match_practice",
    name: "練習試合",
    icon: "⚔️",
    cost: 5_000,
    fatigue: 20,
    gpMin: 3,
    gpMax: 5,
    description: "実戦形式の練習。\n基礎・技術ともにバランスよく成長。",
    boostStats: null, // カテゴリ問わず全体
  },
  {
    id: "rest",
    name: "休息",
    icon: "😴",
    cost: 0,
    fatigue: -35, // 疲労を回復する（マイナス値）
    gpMin: 0,
    gpMax: 0,
    description: "しっかり休んで疲労を回復する。\nGPは得られないが体調が戻る。",
    boostStats: null,
  },
];

// =============================================================
// 成長ポイント（GP）コスト表（05_成長.docx 準拠）
// 能力値が高くなるほど、1ポイント上げるのにかかるGPが増える
// =============================================================

/**
 * 現在の能力値に応じた必要GPを返す関数ではなく、
 * コスト段階を定義したテーブル。
 * state.js や ui.js からこのテーブルを参照して必要GPを求める。
 *
 * thresholdBelow : この値未満の場合に適用
 * gpCost         : 1ポイント上げるのに必要なGP数
 */
const GP_COST_TABLE = [
  { thresholdBelow: 31,  gpCost: 1 }, // 1〜30: 1GP / 1ポイント
  { thresholdBelow: 51,  gpCost: 2 }, // 31〜50: 2GP / 1ポイント
  { thresholdBelow: 71,  gpCost: 3 }, // 51〜70: 3GP / 1ポイント
  { thresholdBelow: 91,  gpCost: 4 }, // 71〜90: 4GP / 1ポイント
  { thresholdBelow: 101, gpCost: 5 }, // 91〜100: 5GP / 1ポイント
];

// =============================================================
// お金・報酬テーブル（06_お金.docx 準拠）
// =============================================================

/**
 * 試合種別ごとの報酬設定
 * matchType  : 試合種別ID（progress.js のスケジュールと対応）
 * label      : 表示名
 * prizeMoney : 勝利時の賞金（円）
 * gpBonus    : 勝利時の追加GP
 */
const MATCH_REWARDS = {
  practice:        { label: "練習試合",         prizeMoney: 30_000,    gpBonus: 1 },
  local_league:    { label: "地方リーグ戦",      prizeMoney: 80_000,    gpBonus: 2 },
  national_league: { label: "全国リーグ戦",      prizeMoney: 200_000,   gpBonus: 3 },
  local_cup:       { label: "地方大会",          prizeMoney: 400_000,   gpBonus: 4 },
  national_cup:    { label: "全国大会",          prizeMoney: 1_000_000, gpBonus: 5 },
  world_cup:       { label: "世界大会",          prizeMoney: 5_000_000, gpBonus: 8 },
};

// =============================================================
// 対戦相手（CPU）の強さテーブル
// 試合種別に応じた相手の攻撃力・守備力の範囲を定義
// =============================================================

/**
 * 相手の能力レンジ
 * attackMin/Max  : 攻撃力の範囲
 * defenseMin/Max : 守備力の範囲
 * names          : 対戦相手名のリスト（ランダム選択）
 */
const OPPONENT_TABLE = {
  practice: {
    attackMin: 20, attackMax: 32,
    defenseMin: 20, defenseMax: 30,
    names: ["市立高校Aチーム", "地域クラブB", "大学サークルC"],
  },
  local_league: {
    attackMin: 32, attackMax: 48,
    defenseMin: 30, defenseMax: 45,
    names: ["県立北高校", "南スポーツクラブ", "東区バレーBC"],
  },
  national_league: {
    attackMin: 48, attackMax: 65,
    defenseMin: 45, defenseMax: 62,
    names: ["関東選抜A", "中部エリートクラブ", "関西強豪チーム"],
  },
  local_cup: {
    attackMin: 50, attackMax: 68,
    defenseMin: 48, defenseMax: 65,
    names: ["地方大会強豪", "伝統の雄校", "新鋭スパイカーズ"],
  },
  national_cup: {
    attackMin: 65, attackMax: 80,
    defenseMin: 62, defenseMax: 78,
    names: ["全国制覇を狙う鷹", "日本代表候補選抜", "強化指定クラブ"],
  },
  world_cup: {
    attackMin: 80, attackMax: 95,
    defenseMin: 78, defenseMax: 92,
    names: ["ブラジル代表", "ロシア選抜", "アメリカ最強チーム"],
  },
};

// =============================================================
// 年間スケジュールテーブル（全体進行）
// =============================================================

/**
 * 各月に発生するイベントを定義する。
 * year   : 何年目か（1〜3）
 * month  : 何月か（1〜12）
 * week   : 何週目か（1〜4）。null の場合は月末に自動発生
 * type   : イベント種別
 *   "match"    : 試合イベント
 *   "salary"   : 月次生活費の徴収（月末に自動）
 *   "narrative": ストーリー演出テキスト
 * matchType : MATCH_REWARDS のキーと対応（type="match" のとき使用）
 * text   : type="narrative" のときに表示するテキスト
 */
const ANNUAL_SCHEDULE = [
  // ========== 1年目 ==========
  // 1年目は練習試合・地方リーグで実力をつける時期

  { year: 1, month: 1,  week: 4, type: "match",    matchType: "practice",     label: "練習試合（1年目1月）" },
  { year: 1, month: 2,  week: 4, type: "match",    matchType: "practice",     label: "練習試合（1年目2月）" },
  { year: 1, month: 3,  week: 4, type: "match",    matchType: "practice",     label: "練習試合（1年目3月）" },
  { year: 1, month: 4,  week: 4, type: "match",    matchType: "local_league", label: "地方リーグ（1年目）前半" },
  { year: 1, month: 5,  week: 4, type: "match",    matchType: "local_league", label: "地方リーグ（1年目）中盤" },
  { year: 1, month: 6,  week: 4, type: "match",    matchType: "local_league", label: "地方リーグ（1年目）後半" },
  { year: 1, month: 7,  week: 4, type: "match",    matchType: "local_league", label: "地方リーグ（1年目）終盤" },
  { year: 1, month: 9,  week: 4, type: "match",    matchType: "local_cup",    label: "地方大会（1年目）" },
  { year: 1, month: 11, week: 4, type: "match",    matchType: "national_league", label: "全国リーグ（1年目）挑戦" },

  // ========== 2年目 ==========
  // 全国レベルに挑む時期

  { year: 2, month: 2,  week: 4, type: "match",    matchType: "local_league",    label: "地方リーグ（2年目）" },
  { year: 2, month: 4,  week: 4, type: "match",    matchType: "national_league", label: "全国リーグ（2年目）前半" },
  { year: 2, month: 6,  week: 4, type: "match",    matchType: "national_league", label: "全国リーグ（2年目）中盤" },
  { year: 2, month: 8,  week: 4, type: "match",    matchType: "national_league", label: "全国リーグ（2年目）後半" },
  { year: 2, month: 10, week: 4, type: "match",    matchType: "local_cup",       label: "地方大会（2年目）" },
  { year: 2, month: 12, week: 4, type: "match",    matchType: "national_cup",    label: "全国大会（2年目）挑戦" },

  // ========== 3年目 ==========
  // 世界大会を目指す最終年

  { year: 3, month: 2,  week: 4, type: "match",    matchType: "national_league", label: "全国リーグ（3年目）前半" },
  { year: 3, month: 5,  week: 4, type: "match",    matchType: "national_league", label: "全国リーグ（3年目）後半" },
  { year: 3, month: 7,  week: 4, type: "match",    matchType: "national_cup",    label: "全国大会（3年目）" },
  { year: 3, month: 9,  week: 4, type: "match",    matchType: "national_cup",    label: "全国大会（3年目）決勝進出" },
  { year: 3, month: 11, week: 4, type: "match",    matchType: "world_cup",       label: "世界大会（3年目）準決勝" },
  { year: 3, month: 12, week: 4, type: "match",    matchType: "world_cup",       label: "世界大会（3年目）決勝" },
];

// =============================================================
// エンディング条件の定義
// =============================================================

/**
 * 各エンディングの発動条件と表示内容
 * priority が低いほど優先度が高い（複数条件を満たした場合に最上位を表示）
 */
const ENDINGS = [
  {
    id: "world_champion",
    priority: 1,
    title: "世界チャンピオン",
    icon: "🏆",
    condition: (record) => record.worldCupWins >= 1 && record.mvpCount >= 1,
    message: "世界大会を制し、MVPを獲得した！\nあなたはバレーボール界の頂点に立った。",
  },
  {
    id: "world_runner_up",
    priority: 2,
    title: "世界準優勝",
    icon: "🥈",
    condition: (record) => record.worldCupWins >= 1,
    message: "世界大会で優勝！\nしかしMVPはまだ遠い。次の目標へ。",
  },
  {
    id: "national_champion",
    priority: 3,
    title: "全国チャンピオン",
    icon: "🥇",
    condition: (record) => record.nationalCupWins >= 1,
    message: "全国大会を制した！\n日本最強の称号を手に入れた。",
  },
  {
    id: "local_champion",
    priority: 4,
    title: "地方の雄",
    icon: "🏅",
    condition: (record) => record.localCupWins >= 1,
    message: "地方大会を制した！\nもっと高みを目指せたかもしれない。",
  },
  {
    id: "journeyman",
    priority: 5,
    title: "バレーボール人生",
    icon: "🌟",
    condition: () => true, // 上記に該当しない場合のデフォルト
    message: "3年間、バレーボールに打ち込んだ。\n優勝はできなかったが、成長した自分がいる。",
  },
];

// =============================================================
// ゲームオーバー条件
// =============================================================
const GAME_OVER_REASONS = {
  NO_MONEY: "所持金が尽きた。\nトレーニング費用が払えなくなってしまった。",
  INJURY:   "重大な故障を負ってしまった。\n疲労を無視し続けたのがたたった。",
};

// =============================================================
// 試合中コメント（演出用テキスト）
// =============================================================

/** 自チーム得点時のコメント候補 */
const COMMENT_MY_SCORE = [
  "強烈なスパイクが決まった！",
  "レシーブで粘り、最後はスパイクで締めた！",
  "完璧なトスからの速攻！",
  "ブロックをかわしてエース！",
  "サーブで崩してそのまま得点！",
  "チームの連携が光った！",
  "鋭いコースを突いたスパイク！",
];

/** 相手チーム得点時のコメント候補 */
const COMMENT_OPP_SCORE = [
  "相手のスパイクを止められなかった…",
  "レシーブが乱れてしまった。",
  "ブロックの上からたたき込まれた。",
  "相手サーブに翻弄された。",
  "連続失点を止められなかった…",
  "相手の速攻に反応できなかった。",
  "ミスが続いてしまった。",
];

/** セット勝利時のコメント */
const COMMENT_SET_WIN = [
  "セット奪取！流れをつかんだ！",
  "1セット先取！このまま勝ち切れ！",
  "粘り強い戦いでセットを制した！",
];

/** セット敗北時のコメント */
const COMMENT_SET_LOSE = [
  "セットを落としてしまった…。切り替えていけ！",
  "1セット失った。しかし諦めるな！",
  "相手に流れを持っていかれた。立て直せ！",
];
