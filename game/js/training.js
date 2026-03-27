/**
 * training.js
 * トレーニング処理を担当するファイル。
 *
 * 役割：
 *   - トレーニング種別に応じた GP の獲得量を計算する
 *   - 疲労度の増減を処理する
 *   - 故障リスクの判定を行う
 *   - トレーニング実行の一連の流れをまとめる
 *
 * 設計方針：
 *   - economy.js で費用を払い、ここで効果を適用する、という役割分担
 *   - 結果オブジェクトを返し、UI への表示は ui.js に任せる
 *   - Godot移植時は TrainingManager.gd に相当
 */

// =============================================================
// トレーニングの実行
// =============================================================

/**
 * トレーニングを実行する。
 * 費用支払い → 疲労変化 → GP獲得 の順に処理する。
 *
 * @param {string} trainingId - TRAINING_TYPES の id（例: "skill_hard"）
 * @returns {{
 *   success     : boolean,  // 実行成功なら true
 *   trainingName: string,   // トレーニング名（ログ表示用）
 *   gpGained    : number,   // 獲得したGP
 *   fatigueChange: number,  // 疲労の変化量（正で増加、負で回復）
 *   isInjured   : boolean,  // 故障が発生したなら true
 *   isGameOver  : boolean,  // ゲームオーバーになったなら true
 *   reason      : string|null, // 失敗・故障時の理由メッセージ
 * }}
 */
function executeTraining(trainingId) {
  // --- トレーニング定義を取得する ---
  const training = TRAINING_TYPES.find((t) => t.id === trainingId);
  if (!training) {
    return _failResult("不明なトレーニング種別です。");
  }

  // --- 実行可否チェック（費用・疲労上限）---
  const feasibility = checkTrainingFeasibility(trainingId);
  if (!feasibility.canDo) {
    return _failResult(feasibility.reason);
  }

  // --- 費用を支払う ---
  const payResult = payTrainingCost(trainingId);
  if (!payResult.success) {
    return _failResult(payResult.reason);
  }

  // --- 疲労度を変化させる ---
  // 休息はマイナス値なので回復する、トレーニングはプラス値で増加する
  const fatigueChange = training.fatigue;
  const noInjury = changeFatigue(fatigueChange);

  // 故障発生チェック（changeFatigue が false を返した場合）
  if (!noInjury) {
    return {
      success:      false,
      trainingName: training.name,
      gpGained:     0,
      fatigueChange,
      isInjured:    true,
      isGameOver:   true,
      reason:       GAME_OVER_REASONS.INJURY,
    };
  }

  // --- 疲労度が閾値を超えている場合は警告（故障確率UP）---
  const state = getState();
  let injuryWarning = false;
  if (state.fatigue >= GAME_CONFIG.FATIGUE_INJURY_THRESHOLD && training.id !== "rest") {
    injuryWarning = true;
  }

  // --- GP を獲得する ---
  // 疲労度が高いほど獲得GPが少し下がる（疲弊時は集中力が落ちる演出）
  const gpGained = calcGainedGP(training, state.fatigue);
  addGrowthPoints(gpGained);

  // --- 行動済みマークを付ける ---
  markActionTaken();

  return {
    success:       true,
    trainingName:  training.name,
    gpGained,
    fatigueChange,
    isInjured:     false,
    isGameOver:    false,
    injuryWarning, // true のとき「疲労が高い」警告を UI に出す
    reason:        null,
  };
}

// =============================================================
// GP 獲得量の計算
// =============================================================

/**
 * トレーニングで獲得する GP を計算する。
 * 基本はランダム範囲内だが、疲労度が高いほど少し減少する。
 *
 * @param {Object} training     - TRAINING_TYPES の要素
 * @param {number} currentFatigue - 現在の疲労度（0〜100）
 * @returns {number} 獲得する GP 数（0以上）
 */
function calcGainedGP(training, currentFatigue) {
  // 休息はGP0
  if (training.gpMax === 0) return 0;

  // gpMin〜gpMax のランダム値を計算する
  const range = training.gpMax - training.gpMin;
  let gp = training.gpMin + Math.floor(Math.random() * (range + 1));

  // 疲労度が高いと効率が落ちる
  // 疲労 0〜60   : 影響なし
  // 疲労 61〜80  : GP が 10% 減
  // 疲労 81〜100 : GP が 30% 減
  if (currentFatigue > 80) {
    gp = Math.floor(gp * 0.7);
  } else if (currentFatigue > 60) {
    gp = Math.floor(gp * 0.9);
  }

  return Math.max(0, gp);
}

// =============================================================
// トレーニング選択画面用の情報取得
// =============================================================

/**
 * トレーニング選択画面に表示する情報リストを返す。
 * 各トレーニングの実行可否・費用・効果をまとめて返す。
 *
 * @returns {Array<{
 *   id          : string,
 *   name        : string,
 *   icon        : string,
 *   cost        : number,
 *   fatigueChange: number,
 *   gpMin       : number,
 *   gpMax       : number,
 *   description : string,
 *   canDo       : boolean,
 *   reason      : string|null,
 * }>}
 */
function getTrainingMenuItems() {
  return TRAINING_TYPES.map((training) => {
    const feasibility = checkTrainingFeasibility(training.id);
    return {
      id:            training.id,
      name:          training.name,
      icon:          training.icon,
      cost:          training.cost,
      fatigueChange: training.fatigue,
      gpMin:         training.gpMin,
      gpMax:         training.gpMax,
      description:   training.description,
      canDo:         feasibility.canDo,
      reason:        feasibility.reason,
    };
  });
}

/**
 * 現在の疲労度に応じた状態テキストを返す。
 * UI の疲労度表示に使う。
 *
 * @param {number} fatigue - 現在の疲労度（0〜100）
 * @returns {{ label: string, color: string }}
 *   label : 状態テキスト（例: "良好"、"疲労注意"）
 *   color : 対応するカラーコード
 */
function getFatigueStatus(fatigue) {
  if (fatigue <= 20) return { label: "良好",     color: "#40ff80" };
  if (fatigue <= 40) return { label: "普通",     color: "#a0c4ff" };
  if (fatigue <= 60) return { label: "やや疲労", color: "#ffd700" };
  if (fatigue <= 80) return { label: "疲労注意", color: "#ff9040" };
  return                    { label: "限界寸前", color: "#ff4040" };
}

// =============================================================
// 内部ユーティリティ
// =============================================================

/**
 * 失敗結果オブジェクトを生成する内部ヘルパー関数。
 * 失敗時の共通フォーマットをまとめる。
 *
 * @param {string} reason - 失敗理由メッセージ
 * @returns {Object} 失敗結果オブジェクト
 */
function _failResult(reason) {
  return {
    success:      false,
    trainingName: "",
    gpGained:     0,
    fatigueChange: 0,
    isInjured:    false,
    isGameOver:   false,
    reason,
  };
}
