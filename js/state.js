/**
 * state.js
 * ゲームの「現在の状態」をすべて管理するファイル。
 *
 * 役割：
 *   - プレイヤーの能力値・資金・疲労度などを一元管理する
 *   - 状態を変更する関数もここに定義する
 *   - UIやロジックは書かない（状態の保持と更新に専念する）
 *
 * 設計方針：
 *   - 状態は GameState オブジェクト1つにまとめる
 *   - 外部からは getState() で読み取り、専用の更新関数で変更する
 *   - Godot移植時は GameManager.gd の変数群に相当する
 */

// =============================================================
// ゲーム状態オブジェクト（プライベート）
// 外部から直接書き換えず、必ず更新関数を通して変更する
// =============================================================
let _state = null;

// =============================================================
// 状態の初期化
// =============================================================

/**
 * ゲーム状態を初期値でリセットする。
 * 新しいゲーム開始時またはリスタート時に呼ぶ。
 *
 * @param {string} playerName - 選手名（キャラクター作成画面で入力）
 * @param {string} position   - ポジション（例: "エース"、"リベロ" など）
 */
function initState(playerName, position) {
  // 能力値の初期値を STAT_DEFINITIONS から自動生成する
  const initialStats = {};
  STAT_DEFINITIONS.forEach((def) => {
    initialStats[def.key] = def.initial;
  });

  _state = {
    // --- 選手情報 ---
    player: {
      name: playerName,         // 選手名
      position: position,       // ポジション
      age: 18,                  // 開始時の年齢
    },

    // --- 能力値（03_能力設計準拠）---
    // STAT_DEFINITIONS の initial 値で初期化される
    stats: initialStats,

    // --- 時間管理 ---
    year: 1,                    // 現在の年（1〜TOTAL_YEARS）
    month: 1,                   // 現在の月（1〜12）
    week: 1,                    // 現在の週（1〜4）

    // --- 資金（06_お金準拠）---
    money: GAME_CONFIG.STARTING_MONEY,

    // --- 疲労度（0〜100）---
    // 100に近いほど故障リスクが高まる
    fatigue: 0,

    // --- 成長ポイント（GP）---
    // トレーニングや試合で獲得し、能力値の上昇に使う
    growthPoints: 0,

    // --- 対戦成績 ---
    record: {
      totalWins: 0,           // 通算勝利数
      totalLosses: 0,         // 通算敗北数
      mvpCount: 0,            // MVP獲得回数
      localCupWins: 0,        // 地方大会優勝回数
      nationalCupWins: 0,     // 全国大会優勝回数
      worldCupWins: 0,        // 世界大会優勝回数
      matchHistory: [],       // 試合履歴（詳細）
    },

    // --- ファン数 ---
    // 試合の勝敗・内容に応じて増減する
    fans: 0,

    // --- 進行管理 ---
    // 今週に行動を実行済みかどうか
    actionTakenThisWeek: false,

    // 現在スケジュールされている試合（null = 試合なし）
    currentScheduledMatch: null,

    // ゲームが終了したかどうか
    isGameOver: false,
    gameOverReason: null,

    // ゲームが終了（エンディング到達）したかどうか
    isEnding: false,

    // --- 試合中の一時状態（試合画面でのみ使用）---
    // コート上のプレイヤーX位置（-1.0 〜 +1.0）
    playerX: 0,
    // 今の試合のプレー統計（試合終了後にリザルトで表示）
    currentMatchStats: {
      spikeAttempts: 0,   // スパイク試みた回数
      spikeSuccess: 0,    // スパイク成功回数
      receiveAttempts: 0, // レシーブ試みた回数
      receiveSuccess: 0,  // レシーブ成功回数
      pointContrib: 0,    // 得点への直接貢献数
    },
  };
}

// =============================================================
// 状態の読み取り
// =============================================================

/**
 * 現在のゲーム状態を返す。
 * 読み取り専用として扱うこと（直接書き換えないこと）。
 *
 * @returns {Object} 現在のゲーム状態
 */
function getState() {
  return _state;
}

/**
 * 指定したキーの能力値を返す。
 *
 * @param {string} key - 能力値キー（例: "spike", "strength"）
 * @returns {number} 現在の能力値
 */
function getStat(key) {
  return _state.stats[key];
}

/**
 * 現在の「時刻」情報をまとめて返す。
 *
 * @returns {{ year, month, week, totalWeeks }} 時刻情報
 */
function getTimeInfo() {
  const totalWeeks =
    (_state.year - 1) * GAME_CONFIG.MONTHS_PER_YEAR * GAME_CONFIG.WEEKS_PER_MONTH +
    (_state.month - 1) * GAME_CONFIG.WEEKS_PER_MONTH +
    _state.week;

  return {
    year: _state.year,
    month: _state.month,
    week: _state.week,
    totalWeeks,
  };
}

// =============================================================
// 能力値の更新
// =============================================================

/**
 * 指定した能力値に値を加算する。
 * 上限（STAT_MAX）と下限（STAT_MIN）を超えないようにクランプする。
 * isFixed な能力値（身長など）には適用しない。
 *
 * @param {string} key    - 能力値キー
 * @param {number} amount - 加算する量（マイナスで減算）
 * @returns {number} 実際に変化した量
 */
function addStat(key, amount) {
  // isFixed の能力値は変更不可
  const def = STAT_DEFINITIONS.find((d) => d.key === key);
  if (def && def.isFixed) {
    console.warn(`[state] ${key} は固定値のため変更できません。`);
    return 0;
  }

  const before = _state.stats[key];
  // 上限・下限を超えないようにクランプ
  const after = Math.max(
    GAME_CONFIG.STAT_MIN,
    Math.min(GAME_CONFIG.STAT_MAX, before + amount)
  );
  _state.stats[key] = after;

  return after - before; // 実際に変化した量を返す
}

// =============================================================
// 資金の更新
// =============================================================

/**
 * 所持金を増減させる。
 * 残高が0を下回った場合は 0 にクランプし、ゲームオーバーフラグを立てる。
 *
 * @param {number} amount - 変化量（正で収入、負で支出）
 * @returns {boolean} 支払い成功なら true、資金不足なら false
 */
function changeMoney(amount) {
  _state.money += amount;

  // 資金が尽きたらゲームオーバー
  if (_state.money <= 0) {
    _state.money = 0;
    _state.isGameOver = true;
    _state.gameOverReason = GAME_OVER_REASONS.NO_MONEY;
    return false;
  }
  return true;
}

// =============================================================
// 疲労度の更新
// =============================================================

/**
 * 疲労度を増減させる。
 * 0〜FATIGUE_MAX の範囲にクランプする。
 * 上限を超えた場合は故障フラグを立てる。
 *
 * @param {number} amount - 変化量（正で疲労増加、負で回復）
 * @returns {boolean} 故障が発生した場合は false
 */
function changeFatigue(amount) {
  _state.fatigue = Math.max(0, Math.min(GAME_CONFIG.FATIGUE_MAX, _state.fatigue + amount));

  // 疲労度が上限に達した場合は故障リスク判定
  if (_state.fatigue >= GAME_CONFIG.FATIGUE_MAX) {
    // 一定確率（30%）で故障になる
    if (Math.random() < 0.3) {
      _state.isGameOver = true;
      _state.gameOverReason = GAME_OVER_REASONS.INJURY;
      return false;
    }
  }
  return true;
}

// =============================================================
// 成長ポイント（GP）の更新
// =============================================================

/**
 * 成長ポイントを加算する。
 *
 * @param {number} amount - 加算するGP数
 */
function addGrowthPoints(amount) {
  _state.growthPoints += Math.max(0, amount);
}

/**
 * 成長ポイントを消費して能力値を1ポイント上昇させる。
 * GP が足りない場合は何もしない。
 *
 * @param {string} key - 上昇させる能力値キー
 * @returns {{ success: boolean, cost: number }} 成功フラグと消費GP
 */
function spendGPToUpgradeStat(key) {
  const currentVal = _state.stats[key];

  // 上限チェック
  if (currentVal >= GAME_CONFIG.STAT_MAX) {
    return { success: false, cost: 0 };
  }

  // 現在の能力値に応じた必要GPをコストテーブルから求める
  const costEntry = GP_COST_TABLE.find((entry) => currentVal < entry.thresholdBelow);
  const cost = costEntry ? costEntry.gpCost : 5; // テーブルになければ最大コスト

  // GP が足りない場合は失敗
  if (_state.growthPoints < cost) {
    return { success: false, cost };
  }

  // GP を消費して能力値を上げる
  _state.growthPoints -= cost;
  addStat(key, 1);

  return { success: true, cost };
}

// =============================================================
// 時間の進行
// =============================================================

/**
 * 1週間進める。
 * 月末・年末の処理は progress.js が担当するため、
 * ここでは純粋に週・月・年のカウントを進めるだけ。
 *
 * @returns {{ monthChanged: boolean, yearChanged: boolean }}
 *   月が変わったか、年が変わったかを返す
 */
function advanceWeek() {
  let monthChanged = false;
  let yearChanged = false;

  // 行動済みフラグをリセット
  _state.actionTakenThisWeek = false;

  _state.week++;

  // 月をまたぐ場合
  if (_state.week > GAME_CONFIG.WEEKS_PER_MONTH) {
    _state.week = 1;
    _state.month++;
    monthChanged = true;

    // 年をまたぐ場合
    if (_state.month > GAME_CONFIG.MONTHS_PER_YEAR) {
      _state.month = 1;
      _state.year++;
      _state.player.age++;
      yearChanged = true;
    }
  }

  return { monthChanged, yearChanged };
}

/**
 * 今週の行動を「実行済み」にマークする。
 * 1週間に1回しか行動できないので、二重実行を防ぐために使う。
 */
function markActionTaken() {
  _state.actionTakenThisWeek = true;
}

// =============================================================
// 試合結果の記録
// =============================================================

/**
 * 試合結果を成績に記録する。
 *
 * @param {Object} result - 試合結果オブジェクト
 * @param {boolean} result.win         - 勝利したか
 * @param {string}  result.matchType   - 試合種別（MATCH_REWARDS のキー）
 * @param {string}  result.opponentName - 対戦相手名
 * @param {string}  result.score       - セットスコア文字列（例: "2-1"）
 * @param {boolean} result.mvp        - MVP獲得したか
 */
function recordMatchResult(result) {
  if (result.win) {
    _state.record.totalWins++;

    // 試合種別ごとに優勝回数を記録
    if (result.matchType === "local_cup")    _state.record.localCupWins++;
    if (result.matchType === "national_cup") _state.record.nationalCupWins++;
    if (result.matchType === "world_cup")    _state.record.worldCupWins++;
  } else {
    _state.record.totalLosses++;
  }

  // MVP 獲得
  if (result.mvp) {
    _state.record.mvpCount++;
  }

  // 試合履歴に追記
  _state.record.matchHistory.push({
    year: _state.year,
    month: _state.month,
    week: _state.week,
    ...result,
  });
}

// =============================================================
// ゲームオーバー・エンディング設定
// =============================================================

/**
 * ゲームオーバー状態にする。
 *
 * @param {string} reason - ゲームオーバー理由（GAME_OVER_REASONS の値）
 */
function triggerGameOver(reason) {
  _state.isGameOver = true;
  _state.gameOverReason = reason;
}

/**
 * エンディング状態にする（3年終了時）。
 */
function triggerEnding() {
  _state.isEnding = true;
}

// =============================================================
// 現在スケジュールされている試合の管理
// =============================================================

/**
 * 今週の試合イベントをセットする。
 *
 * @param {Object|null} matchEvent - ANNUAL_SCHEDULE の要素、またはnull
 */
function setScheduledMatch(matchEvent) {
  _state.currentScheduledMatch = matchEvent;
}

// =============================================================
// ファン数の更新
// =============================================================

/**
 * ファン数を増減させる。
 * 0を下回らないようにクランプする。
 *
 * @param {number} amount - 変化量（正で増加、負で減少）
 */
function changeFans(amount) {
  _state.fans = Math.max(0, _state.fans + amount);
}

// =============================================================
// 試合中プレー統計の更新
// =============================================================

/**
 * 試合開始時にプレー統計をリセットする。
 */
function resetMatchStats() {
  _state.currentMatchStats = {
    spikeAttempts: 0,
    spikeSuccess: 0,
    receiveAttempts: 0,
    receiveSuccess: 0,
    pointContrib: 0,
  };
  _state.playerX = 0; // コート上のX位置もリセット
}

/**
 * スパイク統計を更新する。
 * @param {boolean} success - 成功したか
 */
function recordSpike(success) {
  _state.currentMatchStats.spikeAttempts++;
  if (success) {
    _state.currentMatchStats.spikeSuccess++;
    _state.currentMatchStats.pointContrib++;
  }
}

/**
 * レシーブ統計を更新する。
 * @param {boolean} success - 成功したか
 */
function recordReceive(success) {
  _state.currentMatchStats.receiveAttempts++;
  if (success) _state.currentMatchStats.receiveSuccess++;
}

/**
 * プレイヤーのコート上X位置を更新する。
 * PLAYER_MOVE.MIN_X 〜 MAX_X にクランプする。
 *
 * @param {number} dx - 移動量（正で右、負で左）
 */
function movePlayerX(dx) {
  _state.playerX = Math.max(
    PLAYER_MOVE.MIN_X,
    Math.min(PLAYER_MOVE.MAX_X, _state.playerX + dx)
  );
}

// =============================================================
// デバッグ用ユーティリティ
// =============================================================

/**
 * 現在の状態をコンソールに出力する（開発・デバッグ用）。
 */
function debugPrintState() {
  console.log("[state] 現在のゲーム状態:", JSON.parse(JSON.stringify(_state)));
}
