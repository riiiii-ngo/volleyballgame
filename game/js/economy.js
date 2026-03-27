/**
 * economy.js
 * お金・報酬に関する処理を担当するファイル。
 *
 * 役割：
 *   - トレーニング費用の支払い処理
 *   - 試合報酬（賞金・GP）の付与処理
 *   - 月次生活費の徴収処理
 *   - 資金不足チェック
 *
 * 設計方針：
 *   - 「いくら変動したか」を計算してから state.js の changeMoney() を呼ぶ
 *   - 結果オブジェクトを返すことで、UI 側が表示内容を判断できるようにする
 *   - ロジックのみ。画面表示は ui.js に任せる
 *   - Godot移植時は EconomyManager.gd に相当
 */

// =============================================================
// トレーニング費用の支払い
// =============================================================

/**
 * トレーニングの費用を支払う。
 * 支払い後の残高が足りない場合は失敗を返す。
 *
 * @param {string} trainingId - TRAINING_TYPES の id（例: "basic_hard"）
 * @returns {{ success: boolean, cost: number, reason: string|null }}
 *   success : 支払い成功なら true
 *   cost    : 支払った金額
 *   reason  : 失敗時の理由メッセージ
 */
function payTrainingCost(trainingId) {
  // トレーニング定義をデータから取得する
  const training = TRAINING_TYPES.find((t) => t.id === trainingId);
  if (!training) {
    return { success: false, cost: 0, reason: "不明なトレーニング種別です。" };
  }

  // 休息はコスト0なので支払い不要
  if (training.cost === 0) {
    return { success: true, cost: 0, reason: null };
  }

  // 現在の残高を確認する
  const state = getState();
  if (state.money < training.cost) {
    return {
      success: false,
      cost: training.cost,
      reason: `所持金が足りません。必要: ¥${training.cost.toLocaleString()}、所持: ¥${state.money.toLocaleString()}`,
    };
  }

  // 費用を差し引く（state.js の changeMoney を使って残高を更新）
  changeMoney(-training.cost);

  return { success: true, cost: training.cost, reason: null };
}

// =============================================================
// 試合報酬の付与
// =============================================================

/**
 * 試合の勝敗に応じて賞金と GP を付与する。
 * MATCH_REWARDS テーブルを参照して報酬額を決定する。
 *
 * @param {string}  matchType - 試合種別（MATCH_REWARDS のキー）
 * @param {boolean} isWin     - 勝利したかどうか
 * @returns {{
 *   prizeMoney : number,  // 付与した賞金（敗北時は0）
 *   gpBonus    : number,  // 付与したGP（敗北時は0）
 *   consolation: number,  // 敗北時の慰労金（参加費として少額付与）
 * }}
 */
function grantMatchReward(matchType, isWin) {
  // 試合種別に対応する報酬定義を取得する
  const reward = MATCH_REWARDS[matchType];
  if (!reward) {
    console.warn("[economy] 不明な試合種別:", matchType);
    return { prizeMoney: 0, gpBonus: 0, consolation: 0 };
  }

  if (isWin) {
    // 勝利：賞金と GP を全額付与する
    changeMoney(reward.prizeMoney);
    addGrowthPoints(reward.gpBonus);

    return {
      prizeMoney:  reward.prizeMoney,
      gpBonus:     reward.gpBonus,
      consolation: 0,
    };
  } else {
    // 敗北：賞金の20%を「参加費」として付与する（まったく収入がないと詰まるため）
    const consolation = Math.floor(reward.prizeMoney * 0.2);
    changeMoney(consolation);

    // 敗北時もGPはわずかに付与する（経験として）
    const gpConsolation = Math.max(1, Math.floor(reward.gpBonus * 0.5));
    addGrowthPoints(gpConsolation);

    return {
      prizeMoney:  0,
      gpBonus:     gpConsolation,
      consolation: consolation,
    };
  }
}

// =============================================================
// 月次生活費の徴収
// =============================================================

/**
 * 月末に生活費を徴収する。
 * GAME_CONFIG.MONTHLY_LIVING_COST を差し引く。
 * 残高が足りない場合はゲームオーバーになる（changeMoney内で判定）。
 *
 * @returns {{ paid: number, isGameOver: boolean }}
 *   paid       : 実際に支払った金額
 *   isGameOver : 支払い後に資金切れになった場合 true
 */
function payMonthlyCost() {
  const cost = GAME_CONFIG.MONTHLY_LIVING_COST;
  const success = changeMoney(-cost);

  return {
    paid: cost,
    isGameOver: !success,
  };
}

// =============================================================
// 資金チェック系のユーティリティ
// =============================================================

/**
 * 指定金額が支払えるかどうかを確認する（実際には支払わない）。
 *
 * @param {number} amount - 確認したい金額
 * @returns {boolean} 支払えるなら true
 */
function canAfford(amount) {
  return getState().money >= amount;
}

/**
 * トレーニングが実行可能かどうかを確認する。
 * 費用の支払いが可能か、かつ疲労度が上限でないかをチェックする。
 *
 * @param {string} trainingId - 確認するトレーニングの id
 * @returns {{ canDo: boolean, reason: string|null }}
 */
function checkTrainingFeasibility(trainingId) {
  const training = TRAINING_TYPES.find((t) => t.id === trainingId);
  if (!training) {
    return { canDo: false, reason: "不明なトレーニング種別です。" };
  }

  const state = getState();

  // 休息は常に実行可能
  if (training.id === "rest") {
    return { canDo: true, reason: null };
  }

  // 資金チェック
  if (state.money < training.cost) {
    return {
      canDo: false,
      reason: `所持金が足りません（必要: ¥${training.cost.toLocaleString()}）`,
    };
  }

  // 疲労度チェック（疲労上限に近い場合は警告を出すが実行は可能）
  if (state.fatigue >= GAME_CONFIG.FATIGUE_MAX) {
    return {
      canDo: false,
      reason: "疲労が限界です。まず休息を取ってください。",
    };
  }

  return { canDo: true, reason: null };
}

// =============================================================
// 所持金の表示用フォーマット
// =============================================================

/**
 * 金額を「¥xxx,xxx」形式の文字列に変換する。
 * ui.js から呼んで画面表示に使う。
 *
 * @param {number} amount - フォーマットしたい金額
 * @returns {string} フォーマット済みの金額文字列
 */
function formatMoney(amount) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}
