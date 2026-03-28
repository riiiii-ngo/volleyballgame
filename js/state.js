/**
 * state.js
 * ゲームの「現在の状態」をすべて管理するファイル。
 *
 * 役割：
 *   - プレイヤーの能力値・資金・疲労度・キャリア情報を一元管理する
 *   - 状態を変更する関数もここに定義する
 *   - UIやロジックは書かない（状態の保持と更新に専念する）
 *
 * 設計方針：
 *   - 状態は _state オブジェクト1つにまとめる
 *   - 外部からは getState() で読み取り、専用の更新関数で変更する
 *   - Godot移植時は GameManager.gd の変数群に相当する
 */

// ゲーム状態オブジェクト（プライベート）
let _state = null;

// =============================================================
// 状態の初期化
// =============================================================

/**
 * ゲーム状態を初期値でリセットする。
 * キャラ作成完了時に呼ぶ。
 *
 * @param {string} playerName     - 選手名
 * @param {string} position       - ポジション
 * @param {Object} allocatedStats - 作成画面で振り分けた能力値 { key: value, ... }
 */
function initState(playerName, position, allocatedStats) {
  // 振り分け後の能力値をセットする（allocatedStats がなければ initial 値を使用）
  const initialStats = {};
  STAT_DEFINITIONS.forEach((def) => {
    initialStats[def.key] = allocatedStats
      ? (allocatedStats[def.key] ?? def.initial)
      : def.initial;
  });

  // 開始チームを取得する
  const startTeam = TEAM_TABLE.find((t) => t.id === CAREER_CONFIG.START_TEAM_ID)
    || TEAM_TABLE[0];

  _state = {
    // --- 選手情報 ---
    player: {
      name:     playerName,
      position: position,
      age:      18,
    },

    // --- 能力値 ---
    stats: initialStats,

    // --- 資金 ---
    money: GAME_CONFIG.STARTING_MONEY,

    // --- 疲労度（0〜100）---
    fatigue: 0,

    // --- 成長ポイント（GP）---
    growthPoints: 0,

    // --- キャリア情報 ---
    career: {
      teamId:      startTeam.id,     // 所属チームID
      teamName:    startTeam.name,   // 所属チーム名
      teamTier:    startTeam.tier,   // チームTier（1〜5）
      evaluation:  CAREER_CONFIG.INITIAL_EVALUATION, // 評価値
      matchIndex:  0,                // 次に行う試合のインデックス（MATCH_SCHEDULE参照）
      season:      1,                // 現在のシーズン番号
      transferOffers: [],            // 現在届いている移籍オファー [{ teamId, expiresAfterMatch }]
      trainedThisMatch: false,       // 次の試合までにトレーニング済みかどうか
    },

    // --- 対戦成績 ---
    record: {
      totalWins:       0,
      totalLosses:     0,
      mvpCount:        0,
      localCupWins:    0,
      nationalCupWins: 0,
      worldCupWins:    0,
      matchHistory:    [],  // [{ matchIndex, label, win, score, mvp, evalGain }]
    },

    // --- 試合中の一時状態（試合画面でのみ使用）---
    playerX: 0,  // コート上X位置（-1.0 〜 +1.0）
    currentMatchStats: {
      spikeAttempts:   0,
      spikeSuccess:    0,
      receiveAttempts: 0,
      receiveSuccess:  0,
      blockAttempts:   0,
      blockSuccess:    0,
      pointContrib:    0,
    },

    // --- ゲーム終了フラグ ---
    isGameOver:     false,
    gameOverReason: null,
    isEnding:       false,
    endingId:       null,
  };
}

// =============================================================
// 状態の読み取り
// =============================================================

/**
 * 現在のゲーム状態を返す。読み取り専用として扱うこと。
 * @returns {Object}
 */
function getState() {
  return _state;
}

/**
 * 指定した能力値を返す。
 * @param {string} key
 * @returns {number}
 */
function getStat(key) {
  return _state.stats[key];
}

/**
 * 疲労状態のラベル・色を返す。
 * @param {number} fatigue
 * @returns {{ label: string, color: string }}
 */
function getFatigueStatus(fatigue) {
  return FATIGUE_STATUS.find((s) => fatigue <= s.maxFatigue) || FATIGUE_STATUS[FATIGUE_STATUS.length - 1];
}

// =============================================================
// 能力値の更新
// =============================================================

/**
 * 指定した能力値に値を加算する。STAT_MAX/STAT_MIN でクランプ。
 * isFixed な能力値には適用しない。
 *
 * @param {string} key    - 能力値キー
 * @param {number} amount - 加算量（負で減算）
 * @returns {number} 実際に変化した量
 */
function addStat(key, amount) {
  const def = STAT_DEFINITIONS.find((d) => d.key === key);
  if (def && def.isFixed) return 0;

  const before = _state.stats[key];
  _state.stats[key] = Math.max(
    GAME_CONFIG.STAT_MIN,
    Math.min(GAME_CONFIG.STAT_MAX, before + amount)
  );
  return _state.stats[key] - before;
}

// =============================================================
// 資金の更新
// =============================================================

/**
 * 所持金を増減させる。
 * @param {number} amount - 正で収入、負で支出
 * @returns {boolean} 残高が0以上なら true
 */
function changeMoney(amount) {
  _state.money += amount;
  if (_state.money < 0) _state.money = 0;
  return _state.money > 0;
}

// =============================================================
// 疲労度の更新
// =============================================================

/**
 * 疲労度を増減させる。0〜FATIGUE_MAX にクランプ。
 * 上限に達した場合は一定確率で故障しゲームオーバーになる。
 *
 * @param {number} amount - 正で増加、負で回復
 * @returns {boolean} 故障が発生した場合は false
 */
function changeFatigue(amount) {
  _state.fatigue = Math.max(
    0,
    Math.min(GAME_CONFIG.FATIGUE_MAX, _state.fatigue + amount)
  );

  if (_state.fatigue >= GAME_CONFIG.FATIGUE_MAX) {
    if (Math.random() < 0.3) {
      triggerGameOver(GAME_OVER_REASONS.INJURY);
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
 * @param {number} amount
 */
function addGrowthPoints(amount) {
  _state.growthPoints += Math.max(0, amount);
}

/**
 * GP を消費して能力値を1ポイント上昇させる。
 * @param {string} key - 能力値キー
 * @returns {{ success: boolean, cost: number }}
 */
function spendGPToUpgradeStat(key) {
  const currentVal = _state.stats[key];

  if (currentVal >= GAME_CONFIG.STAT_MAX) return { success: false, cost: 0 };

  const costEntry = GP_COST_TABLE.find((e) => currentVal < e.thresholdBelow);
  const cost = costEntry ? costEntry.gpCost : 5;

  if (_state.growthPoints < cost) return { success: false, cost };

  _state.growthPoints -= cost;
  addStat(key, 1);
  return { success: true, cost };
}

// =============================================================
// キャリア情報の更新
// =============================================================

/**
 * 評価値を加算する。
 * @param {number} amount
 */
function addEvaluation(amount) {
  _state.career.evaluation = Math.max(0, _state.career.evaluation + amount);
}

/**
 * 試合インデックスを1進める。
 */
function advanceMatchIndex() {
  _state.career.matchIndex++;
}

/**
 * チームを移籍させる。
 * @param {string} teamId - 移籍先チームID
 */
function transferToTeam(teamId) {
  const team = TEAM_TABLE.find((t) => t.id === teamId);
  if (!team) return;
  _state.career.teamId   = team.id;
  _state.career.teamName = team.name;
  _state.career.teamTier = team.tier;
  // 移籍後はオファーリストをクリアする
  _state.career.transferOffers = [];
}

/**
 * 移籍オファーを追加する。
 * @param {{ teamId: string, expiresAfterMatch: number }} offer
 */
function addTransferOffer(offer) {
  // 同チームからの重複オファーは追加しない
  if (_state.career.transferOffers.some((o) => o.teamId === offer.teamId)) return;
  _state.career.transferOffers.push(offer);
}

/**
 * 期限切れの移籍オファーを削除する。
 * 試合終了後に呼ぶ。
 */
function pruneExpiredOffers() {
  const idx = _state.career.matchIndex;
  _state.career.transferOffers = _state.career.transferOffers.filter(
    (o) => o.expiresAfterMatch > idx
  );
}

/**
 * ジムトレーニング済みフラグを設定する。
 * @param {boolean} done
 */
function setTrainedThisMatch(done) {
  _state.career.trainedThisMatch = done;
}

// =============================================================
// 試合結果の記録
// =============================================================

/**
 * 試合結果を成績・履歴に記録する。
 *
 * @param {Object} result
 * @param {boolean} result.win
 * @param {string}  result.matchType
 * @param {string}  result.label
 * @param {string}  result.opponentName
 * @param {string}  result.score
 * @param {boolean} result.mvp
 * @param {number}  result.evalGain
 */
function recordMatchResult(result) {
  if (result.win) {
    _state.record.totalWins++;
    if (result.matchType === "local_cup")    _state.record.localCupWins++;
    if (result.matchType === "national_cup") _state.record.nationalCupWins++;
    if (result.matchType === "world_cup")    _state.record.worldCupWins++;
  } else {
    _state.record.totalLosses++;
  }

  if (result.mvp) _state.record.mvpCount++;

  _state.record.matchHistory.push({
    matchIndex:   _state.career.matchIndex,
    label:        result.label || "",
    win:          result.win,
    score:        result.score,
    mvp:          result.mvp,
    opponentName: result.opponentName,
    evalGain:     result.evalGain || 0,
  });
}

// =============================================================
// 試合中プレー統計の更新
// =============================================================

/**
 * 試合開始時にプレー統計をリセットする。
 */
function resetMatchStats() {
  _state.currentMatchStats = {
    spikeAttempts:   0,
    spikeSuccess:    0,
    receiveAttempts: 0,
    receiveSuccess:  0,
    blockAttempts:   0,
    blockSuccess:    0,
    pointContrib:    0,
  };
  _state.playerX = 0;
}

/**
 * スパイク統計を記録する。
 * @param {boolean} success
 */
function recordSpike(success) {
  _state.currentMatchStats.spikeAttempts++;
  if (success) {
    _state.currentMatchStats.spikeSuccess++;
    _state.currentMatchStats.pointContrib++;
  }
}

/**
 * レシーブ統計を記録する。
 * @param {boolean} success
 */
function recordReceive(success) {
  _state.currentMatchStats.receiveAttempts++;
  if (success) _state.currentMatchStats.receiveSuccess++;
}

/**
 * ブロック統計を記録する。
 * @param {boolean} success
 */
function recordBlock(success) {
  _state.currentMatchStats.blockAttempts++;
  if (success) {
    _state.currentMatchStats.blockSuccess++;
    _state.currentMatchStats.pointContrib++;
  }
}

/**
 * プレイヤーのコート上X位置を更新する。
 * @param {number} dx - 移動量（正で右、負で左）
 */
function movePlayerX(dx) {
  _state.playerX = Math.max(
    PLAYER_MOVE.MIN_X,
    Math.min(PLAYER_MOVE.MAX_X, _state.playerX + dx)
  );
}

// =============================================================
// ゲーム終了フラグ
// =============================================================

/**
 * ゲームオーバー状態にする。
 * @param {string} reason - GAME_OVER_REASONS の値
 */
function triggerGameOver(reason) {
  _state.isGameOver     = true;
  _state.gameOverReason = reason;
}

/**
 * エンディング状態にする。
 * @param {string} endingId - ENDINGS の id
 */
function triggerEnding(endingId) {
  _state.isEnding = true;
  _state.endingId = endingId;
}

// =============================================================
// セーブ・ロード用（save.js から呼ばれる）
// =============================================================

/**
 * 現在の状態をそのまま返す（セーブ用）。
 * @returns {Object}
 */
function exportState() {
  return JSON.parse(JSON.stringify(_state));
}

/**
 * 保存データから状態を復元する（ロード用）。
 * @param {Object} savedState
 */
function importState(savedState) {
  _state = savedState;
}
