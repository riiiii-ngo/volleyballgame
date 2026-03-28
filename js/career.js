/**
 * career.js
 * キャリア進行を管理するファイル。（旧 progress.js を完全に置き換え）
 *
 * 役割：
 *   - 試合ベースのキャリア進行（matchIndex で管理）
 *   - 試合後の評価値計算・移籍オファー判定
 *   - トレーニングロック管理（試合前1回のみ）
 *   - エンディング・ゲームオーバー判定
 *   - マップ画面用の情報提供
 *
 * 設計方針：
 *   - 週・月・年の概念を持たない（試合インデックスで進行する）
 *   - 各処理の結果をオブジェクトで返し、画面遷移は screens.js に任せる
 *   - Godot移植時は CareerManager.gd に相当
 */

// =============================================================
// 次の試合情報を取得する
// =============================================================

/**
 * 現在の matchIndex に対応する試合スケジュールを返す。
 * スタジアムの「試合へ」ボタン表示・有効判定に使う。
 *
 * @returns {Object|null} MATCH_SCHEDULE の要素、なければ null（全試合終了）
 */
function getNextMatch() {
  const state = getState();
  const idx   = state.career.matchIndex;
  return MATCH_SCHEDULE[idx] || null;
}

/**
 * 次の試合が「今プレイ可能か」を返す。
 * スタジアムのボタン有効/無効に使う。
 *
 * @returns {boolean}
 */
function canPlayNextMatch() {
  return getNextMatch() !== null;
}

// =============================================================
// トレーニング処理
// =============================================================

/**
 * ジムでのトレーニングを実行する。
 * 試合前1回のみ実行でき、実行後はロックされる。
 *
 * @param {string} trainingId - TRAINING_TYPES の id
 * @returns {{
 *   success      : boolean,
 *   reason       : string|null,
 *   trainingName : string,
 *   gpGained     : number,
 *   fatigueDelta : number,
 *   isGameOver   : boolean,
 * }}
 */
function doTraining(trainingId) {
  const state    = getState();
  const training = TRAINING_TYPES.find((t) => t.id === trainingId);

  if (!training) {
    return { success: false, reason: "不明なトレーニングIDです。", gpGained: 0, fatigueDelta: 0, isGameOver: false };
  }

  // トレーニングロックチェック（試合前1回のみ）
  if (state.career.trainedThisMatch && trainingId !== "rest") {
    return {
      success: false,
      reason:  "次の試合まで、トレーニングはもう実施できません。",
      trainingName: training.name,
      gpGained: 0,
      fatigueDelta: 0,
      isGameOver: false,
    };
  }

  // 疲労度が高い場合に休息以外を選んだら警告（ブロックはしない）
  const injuryWarning = state.fatigue >= GAME_CONFIG.FATIGUE_INJURY_THRESHOLD
    && trainingId !== "rest";

  // 疲労度を変化させる
  const notInjured = changeFatigue(training.fatigue);
  if (!notInjured) {
    // 故障でゲームオーバー
    return {
      success:      true,
      reason:       null,
      trainingName: training.name,
      gpGained:     0,
      fatigueDelta: training.fatigue,
      isGameOver:   true,
      injuryWarning,
    };
  }

  // GPを付与する（rest は GP なし）
  let gpGained = 0;
  if (training.gpMin > 0) {
    gpGained = _randInt(training.gpMin, training.gpMax);
    addGrowthPoints(gpGained);
  }

  // トレーニング済みフラグを立てる（rest は立てない）
  if (trainingId !== "rest") {
    setTrainedThisMatch(true);
  }

  return {
    success:       true,
    reason:        null,
    trainingName:  training.name,
    gpGained,
    fatigueDelta:  training.fatigue,
    isGameOver:    false,
    injuryWarning,
  };
}

/**
 * トレーニングメニューの表示用データを返す。
 * ui.js でカード描画に使う。
 *
 * @returns {Array<Object>} 各トレーニングの表示データ
 */
function getTrainingMenuItems() {
  const state = getState();

  return TRAINING_TYPES.map((t) => {
    // トレーニングロック判定（rest は常に可）
    const locked  = state.career.trainedThisMatch && t.id !== "rest";
    const canDo   = !locked;
    const reason  = locked ? "次の試合が終わるまでトレーニングできません" : null;

    return {
      id:            t.id,
      name:          t.name,
      icon:          t.icon,
      cost:          t.cost,
      fatigue:       t.fatigue,
      fatigueChange: t.fatigue,
      gpMin:         t.gpMin,
      gpMax:         t.gpMax,
      description:   t.description,
      canDo,
      reason,
    };
  });
}

// =============================================================
// 試合終了後の処理
// =============================================================

/**
 * 試合終了後に呼ぶメイン処理。
 * 評価値更新・報酬付与・移籍オファー確認・エンディング判定をまとめて行う。
 *
 * @param {Object} matchResult - match.js から渡される試合結果
 * @param {boolean} matchResult.win
 * @param {string}  matchResult.matchType
 * @param {string}  matchResult.label
 * @param {string}  matchResult.opponentName
 * @param {string}  matchResult.scoreText
 * @param {boolean} matchResult.mvp
 * @param {Object}  matchResult.matchStats - { spikeSuccess, receiveSuccess, blockSuccess, ... }
 *
 * @returns {{
 *   evalGain      : number,   // 獲得した評価値
 *   rewards       : Object,   // 獲得した報酬 { prizeMoney, gpBonus, salary }
 *   newOffers     : Array,    // 新しく届いた移籍オファー
 *   isEnding      : boolean,
 *   endingId      : string|null,
 *   isGameOver    : boolean,
 * }}
 */
function processMatchEnd(matchResult) {
  const state = getState();

  // --- 評価値を計算・加算する ---
  const evalGain = _calcEvalGain(matchResult);
  addEvaluation(evalGain);

  // --- 試合結果を記録する ---
  recordMatchResult({
    win:          matchResult.win,
    matchType:    matchResult.matchType,
    label:        matchResult.label,
    opponentName: matchResult.opponentName,
    score:        matchResult.scoreText,
    mvp:          matchResult.mvp,
    evalGain,
  });

  // --- 報酬を付与する ---
  const rewards = _grantRewards(matchResult);

  // --- トレーニングロックを解除する ---
  setTrainedThisMatch(false);

  // --- 期限切れオファーを削除する ---
  pruneExpiredOffers();

  // --- 新しい移籍オファーを判定する ---
  const newOffers = _checkTransferOffers();

  // --- 試合インデックスを進める ---
  advanceMatchIndex();

  // --- エンディング判定（全試合終了または特定条件） ---
  const ending = _checkEnding();
  if (ending) {
    triggerEnding(ending.id);
    return { evalGain, rewards, newOffers, isEnding: true, endingId: ending.id, isGameOver: false };
  }

  return { evalGain, rewards, newOffers, isEnding: false, endingId: null, isGameOver: false };
}

// =============================================================
// 評価値の計算
// =============================================================

/**
 * 試合結果から獲得評価値を計算する。
 * 勝敗・MVP・スパイク/レシーブ/ブロック成功数・試合の重要度（evalMod）で決まる。
 *
 * @param {Object} matchResult
 * @returns {number} 評価値の増加量
 */
function _calcEvalGain(matchResult) {
  const state    = getState();
  const scheduleEntry = MATCH_SCHEDULE[state.career.matchIndex];
  const evalMod  = scheduleEntry ? scheduleEntry.evalMod : 1.0;

  let eval_ = matchResult.win
    ? CAREER_CONFIG.EVAL_WIN_BASE
    : CAREER_CONFIG.EVAL_LOSE_BASE;

  // MVP ボーナス
  if (matchResult.mvp) eval_ += CAREER_CONFIG.EVAL_MVP_BONUS;

  // プレー内容ボーナス
  const ms = matchResult.matchStats || {};
  eval_ += (ms.spikeSuccess   || 0) * CAREER_CONFIG.EVAL_SPIKE_BONUS;
  eval_ += (ms.receiveSuccess || 0) * CAREER_CONFIG.EVAL_RECEIVE_BONUS;

  // 試合重要度倍率をかける
  return Math.round(eval_ * evalMod);
}

// =============================================================
// 報酬の付与
// =============================================================

/**
 * 試合報酬（賞金・GP・月給）を計算してステートに反映する。
 *
 * @param {Object} matchResult
 * @returns {{ prizeMoney: number, gpBonus: number, salary: number }}
 */
function _grantRewards(matchResult) {
  const state   = getState();
  const reward  = MATCH_REWARDS[matchResult.matchType] || {};
  const team    = TEAM_TABLE.find((t) => t.id === state.career.teamId);

  // 賞金（勝利時のみ）
  const prizeMoney = matchResult.win ? (reward.prizeMoney || 0) : 0;

  // GP ボーナス
  const gpBonus = matchResult.win ? (reward.gpBonus || 0) : Math.ceil((reward.gpBonus || 0) * 0.4);

  // 月給（チームから固定支給）
  const salary = team ? team.salary : CAREER_CONFIG.DEFAULT_SALARY;

  // ステートに反映する
  changeMoney(prizeMoney + salary);
  addGrowthPoints(gpBonus);

  return { prizeMoney, gpBonus, salary };
}

// =============================================================
// 移籍オファーの判定
// =============================================================

/**
 * 評価値・実績に基づいて移籍オファーを生成する。
 * 上位Tier のチームからオファーが来るかを判定する。
 *
 * @returns {Array<{ teamId, teamName, tier }>} 新しいオファーのリスト
 */
function _checkTransferOffers() {
  const state       = getState();
  const currentTier = state.career.teamTier;
  const evaluation  = state.career.evaluation;
  const nextMatchIdx = state.career.matchIndex + 1; // advanceMatchIndex 後の値
  const newOffers   = [];

  // 現在のTierより1つ上のチームからオファーが来る可能性をチェックする
  // （いきなり2段階以上は来ない）
  const targetTier = currentTier + 1;
  if (targetTier > 5) return newOffers; // Tier5が上限

  const threshold = CAREER_CONFIG.TRANSFER_OFFER_THRESHOLD[targetTier];
  if (!threshold || evaluation < threshold) return newOffers;

  // 対象Tierのチームをランダムに1チーム選んでオファーを送る
  const candidates = TEAM_TABLE.filter((t) => t.tier === targetTier);
  if (candidates.length === 0) return newOffers;

  const offerTeam = candidates[Math.floor(Math.random() * candidates.length)];

  // 同チームへの重複オファーは無視する
  if (state.career.transferOffers.some((o) => o.teamId === offerTeam.id)) {
    return newOffers;
  }

  const offer = {
    teamId:              offerTeam.id,
    teamName:            offerTeam.name,
    tier:                offerTeam.tier,
    salary:              offerTeam.salary,
    expiresAfterMatch:   nextMatchIdx + 2, // 2試合後に期限切れ
  };

  addTransferOffer(offer);
  newOffers.push(offer);
  return newOffers;
}

// =============================================================
// 移籍処理
// =============================================================

/**
 * 移籍オファーを承諾して移籍する。
 *
 * @param {string} teamId - 移籍先チームID
 * @returns {{ success: boolean, reason: string|null }}
 */
function acceptTransferOffer(teamId) {
  const state = getState();
  const offer = state.career.transferOffers.find((o) => o.teamId === teamId);

  if (!offer) {
    return { success: false, reason: "このオファーは存在しないか期限切れです。" };
  }

  transferToTeam(teamId);
  return { success: true, reason: null };
}

/**
 * 移籍申請を行う。評価値が閾値以上なら承認される。
 *
 * @param {string} teamId - 移籍希望先チームID
 * @returns {{ success: boolean, reason: string|null }}
 */
function requestTransfer(teamId) {
  const state      = getState();
  const targetTeam = TEAM_TABLE.find((t) => t.id === teamId);

  if (!targetTeam) {
    return { success: false, reason: "チームが見つかりません。" };
  }

  // 現在のチームと同Tier以下への申請は却下
  if (targetTeam.tier <= state.career.teamTier) {
    return { success: false, reason: "現在のチームよりも格下への移籍申請はできません。" };
  }

  // 評価値チェック
  const threshold = CAREER_CONFIG.TRANSFER_REQUEST_THRESHOLD[targetTeam.tier];
  if (!threshold || state.career.evaluation < threshold) {
    return {
      success: false,
      reason:  `評価値が足りません（必要: ${threshold}、現在: ${state.career.evaluation}）。`,
    };
  }

  transferToTeam(teamId);
  return { success: true, reason: null };
}

/**
 * 自チームへの現在の移籍オファーリストを返す。
 * エージェント画面の表示に使う。
 *
 * @returns {Array<Object>}
 */
function getTransferOffers() {
  return getState().career.transferOffers;
}

/**
 * 移籍申請できるチームの一覧を返す。
 * 現在のTierより上で、申請閾値に近いものを表示する。
 *
 * @returns {Array<{ team, threshold, evalRequired, canRequest }>}
 */
function getTransferRequestTargets() {
  const state      = getState();
  const currentTier = state.career.teamTier;
  const evaluation  = state.career.evaluation;

  // 現在のTierより上のチームをTier順で返す
  return TEAM_TABLE
    .filter((t) => t.tier > currentTier)
    .sort((a, b) => a.tier - b.tier)
    .map((team) => {
      const threshold  = CAREER_CONFIG.TRANSFER_REQUEST_THRESHOLD[team.tier] || 9999;
      const canRequest = evaluation >= threshold;
      return { team, threshold, evalRequired: threshold, canRequest };
    });
}

// =============================================================
// エンディング判定
// =============================================================

/**
 * エンディング条件をチェックする。
 * 全試合終了 or 世界大会優勝でエンディングへ。
 *
 * @returns {Object|null} 該当エンディング or null
 */
function _checkEnding() {
  const state = getState();

  // 全試合終了
  const allMatchesDone = state.career.matchIndex >= MATCH_SCHEDULE.length;

  // 世界大会優勝で即エンディング
  const worldChampion = state.record.worldCupWins >= 1;

  if (!allMatchesDone && !worldChampion) return null;

  // ENDINGS テーブルを priority 昇順で評価する
  const sorted = [...ENDINGS].sort((a, b) => a.priority - b.priority);
  for (const ending of sorted) {
    if (ending.condition(state)) return ending;
  }

  return ENDINGS[ENDINGS.length - 1]; // フォールバック
}

// =============================================================
// マップ画面用の情報提供
// =============================================================

/**
 * マップ画面のトップバーに表示する情報を返す。
 *
 * @returns {{
 *   progressText : string,  // "シーズン1 / 第3試合"
 *   teamName     : string,
 *   teamTier     : number,
 *   evaluation   : number,
 *   nextMatchLabel: string|null,
 * }}
 */
function getProgressInfo() {
  const state     = getState();
  const nextMatch = getNextMatch();
  const matchNum  = state.career.matchIndex + 1;
  const totalMatch = MATCH_SCHEDULE.length;

  return {
    progressText:   `試合 ${matchNum} / ${totalMatch}`,
    teamName:       state.career.teamName,
    teamTier:       state.career.teamTier,
    evaluation:     state.career.evaluation,
    nextMatchLabel: nextMatch ? nextMatch.label : null,
  };
}

/**
 * マップロケーションの状態（解放・ロック）を返す。
 * マップ画面でアイコンの表示制御に使う。
 *
 * @returns {Object} { locationId: { available: boolean, reason: string|null } }
 */
function getMapLocationStatus() {
  const state = getState();

  return {
    home: {
      available: true,
      reason:    null,
    },
    gym: {
      available: true,
      reason:    state.career.trainedThisMatch
        ? "次の試合が終わるまでトレーニングできません"
        : null,
    },
    stadium: {
      available: canPlayNextMatch(),
      reason:    canPlayNextMatch() ? null : "試合の予定がありません",
    },
    agent: {
      available: true,
      reason:    null,
    },
    shop: {
      available: false,
      reason:    "近日公開",
    },
  };
}

// =============================================================
// 内部ユーティリティ
// =============================================================

/**
 * min 以上 max 以下の整数をランダムに返す。
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function _randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
