/**
 * screens.js
 * 画面の切り替えと、各画面を開く前の初期化処理を担当するファイル。
 *
 * 役割：
 *   - 現在表示中の画面を管理する
 *   - 画面を切り替える（active クラスの付け替え）
 *   - 各画面を開く前に必要なデータをUIに渡す
 *
 * 設計方針：
 *   - 画面IDは定数で管理して typo を防ぐ
 *   - 実際のDOM更新は ui.js の関数を呼ぶ
 *   - ゲームロジックはここに書かない
 *   - Godot移植時は SceneManager.gd に相当
 */

// =============================================================
// 画面ID定数
// index.html の各画面のIDと対応している
// =============================================================
const SCREEN = {
  TITLE:    "screen-title",
  CREATE:   "screen-create",
  MAIN:     "screen-main",
  TRAINING: "screen-training",
  GROWTH:   "screen-growth",
  MATCH:    "screen-match",
  RESULT:   "screen-result",
  ENDING:   "screen-ending",
  GAMEOVER: "screen-gameover",
};

// 現在表示中の画面IDを保持する変数
let _currentScreen = SCREEN.TITLE;

// =============================================================
// 画面切り替えの中心関数
// =============================================================

/**
 * 指定した画面に切り替える。
 * 現在の画面から active クラスを外し、次の画面に付ける。
 *
 * @param {string} screenId - SCREEN定数のいずれか
 */
function showScreen(screenId) {
  // 現在の画面を非表示にする
  const current = document.getElementById(_currentScreen);
  if (current) current.classList.remove("active");

  // 次の画面を表示する
  const next = document.getElementById(screenId);
  if (next) {
    next.classList.add("active");
    _currentScreen = screenId;
  } else {
    console.error(`[screens] 画面が見つかりません: ${screenId}`);
  }
}

// =============================================================
// 各画面を開く関数
// 画面を表示する前に必要な初期化・データ反映を行う
// =============================================================

/**
 * タイトル画面を開く。
 * セーブデータがあれば「コンティニュー」ボタンを表示する。
 */
function openTitle() {
  // セーブデータの有無でコンティニューボタンを切り替える
  const continueBtn = document.getElementById("btn-continue");
  const saveInfoEl  = document.getElementById("save-info");
  const info = getSaveInfo();

  if (info) {
    // セーブデータあり：コンティニューボタンを表示する
    continueBtn.style.display = "block";
    saveInfoEl.style.display  = "block";
    // 保存日時を読みやすい形式に変換する
    const savedDate = new Date(info.savedAt).toLocaleString("ja-JP");
    saveInfoEl.textContent =
      `${info.playerName}（${info.position}） ${info.year}年目${info.month}月 ／ ${savedDate}`;
  } else {
    // セーブデータなし：コンティニューボタンを非表示にする
    continueBtn.style.display = "none";
    saveInfoEl.style.display  = "none";
  }

  showScreen(SCREEN.TITLE);
}

/**
 * 選手作成画面を開く。
 * 入力欄をリセットしてから表示する。
 */
function openCreate() {
  // 名前入力欄を空にする
  document.getElementById("input-name").value = "";

  // ポジションの選択状態をリセットする（最初の選択肢を選ぶ）
  document.querySelectorAll(".position-btn").forEach((btn, i) => {
    btn.classList.toggle("selected", i === 0);
  });

  showScreen(SCREEN.CREATE);
}

/**
 * メイン育成画面を開く。
 * ヘッダー・カレンダー・能力値・状態を最新状態で表示する。
 */
function openMain() {
  const state = getState();

  // ヘッダー情報を更新する
  uiUpdateHeader();

  // 月間カレンダーを描画する
  uiRenderCalendar();

  // 能力値バーを描画する
  uiRenderStatBars();

  // 状態パネル（疲労・GP・成績）を更新する
  uiUpdateStatusPanel();

  // 今週すでに行動済みかどうかでボタンの有効/無効を切り替える
  _refreshMainButtons();

  showScreen(SCREEN.MAIN);
}

/**
 * トレーニング選択画面を開く。
 * 現在の状態に応じたトレーニングカードを生成して表示する。
 */
function openTraining() {
  const state = getState();

  // ヘッダーの資金・進行情報を更新する
  document.getElementById("training-progress-text").textContent =
    getProgressInfo().progressText;
  document.getElementById("training-money").textContent =
    formatMoney(state.money);

  // 疲労度表示を更新する
  const fatigueStatus = getFatigueStatus(state.fatigue);
  document.getElementById("training-fatigue-label").textContent = fatigueStatus.label;
  document.getElementById("training-fatigue-label").style.color = fatigueStatus.color;
  document.getElementById("training-fatigue-val").textContent   = state.fatigue;

  // トレーニングカード一覧を生成する
  uiRenderTrainingCards();

  showScreen(SCREEN.TRAINING);
}

/**
 * 成長ポイント振り分け画面を開く。
 * 現在の能力値とGP残量を表示する。
 */
function openGrowth() {
  const state = getState();

  // ヘッダーの資金を更新する
  document.getElementById("growth-money").textContent = formatMoney(state.money);

  // GP残量を更新する
  document.getElementById("growth-gp-remain").textContent = state.growthPoints;

  // 各カテゴリの能力値リストを描画する
  uiRenderGrowthStats();

  showScreen(SCREEN.GROWTH);
}

/**
 * 試合画面を開く。
 * 対戦相手名・スコアをリセットしてからシミュレーションを開始する。
 *
 * @param {string} matchType - 試合種別（MATCH_REWARDS のキー）
 * @param {string} matchLabel - 試合名（ヘッダー表示用）
 */
function openMatch(matchType, matchLabel) {
  // ヘッダーに試合名を表示する
  document.getElementById("match-title").textContent = matchLabel || "試合";

  // スコアをリセットする
  document.getElementById("match-my-score").textContent  = "0";
  document.getElementById("match-opp-score").textContent = "0";

  // セットスコア表示をリセットする
  document.getElementById("match-set-scores").innerHTML = "";

  // ログエリアをリセットする
  document.getElementById("match-log").innerHTML = "";

  // 「結果へ」ボタンを隠し、「試合中...」メッセージを表示する
  document.getElementById("btn-match-result").style.display       = "none";
  document.getElementById("match-in-progress-msg").style.display  = "block";

  // 自チームラベルに選手名を表示する
  const state = getState();
  document.getElementById("match-my-team-label").textContent = state.player.name;

  showScreen(SCREEN.MATCH);

  // 画面に切り替わってから少し待ってシミュレーションを開始する
  setTimeout(() => startMatchSimulation(matchType, matchLabel), 300);
}

/**
 * 試合結果画面を開く。
 *
 * @param {Object} matchResult  - simulateMatch() の戻り値
 * @param {Object} rewardResult - grantMatchReward() の戻り値
 * @param {string} matchLabel   - 試合名
 */
function openResult(matchResult, rewardResult, matchLabel) {
  // 勝敗タイトルを設定する
  const titleEl = document.getElementById("result-title");
  if (matchResult.win) {
    titleEl.textContent = matchResult.mvp ? "勝利！ MVP獲得！" : "勝利！";
    titleEl.className   = "result-title win";
  } else {
    titleEl.textContent = "敗北…";
    titleEl.className   = "result-title lose";
  }

  // セットスコアを表示する
  document.getElementById("result-score").textContent =
    `${matchResult.mySetWins} - ${matchResult.oppSetWins}`;

  // 対戦相手名を表示する
  document.getElementById("result-opponent").textContent =
    `vs. ${matchResult.opponent.name}　（${matchLabel}）`;

  // 報酬情報を描画する
  uiRenderRewards(matchResult, rewardResult);

  showScreen(SCREEN.RESULT);
}

/**
 * エンディング画面を開く。
 *
 * @param {string} endingId - ENDINGS の id
 */
function openEnding(endingId) {
  // エンディングデータを取得する
  const ending = ENDINGS.find((e) => e.id === endingId) || ENDINGS[ENDINGS.length - 1];

  // アイコン・タイトル・メッセージを設定する
  document.getElementById("ending-rank").textContent    = ending.icon;
  document.getElementById("ending-title").textContent   = ending.title;
  document.getElementById("ending-message").textContent = ending.message;

  // 3年間の成績まとめを描画する
  uiRenderEndingStats();

  showScreen(SCREEN.ENDING);
}

/**
 * ゲームオーバー画面を開く。
 *
 * @param {string} reason - ゲームオーバーの理由テキスト
 */
function openGameOver(reason) {
  document.getElementById("gameover-reason").textContent =
    reason || "ゲームオーバーになりました。";

  showScreen(SCREEN.GAMEOVER);
}

// =============================================================
// メイン画面のボタン状態を更新する内部関数
// =============================================================

/**
 * 現在の状態に応じてメイン画面のボタンを有効/無効にする。
 * 行動済み・試合週・GP量などによって変化する。
 */
function _refreshMainButtons() {
  const state = getState();
  const alreadyActed = state.actionTakenThisWeek;
  const hasMatch     = !!state.currentScheduledMatch;
  const hasGP        = state.growthPoints > 0;

  // 行動済みの場合、トレーニングと試合ボタンを無効にする
  document.getElementById("btn-go-training").disabled = alreadyActed;
  document.getElementById("btn-go-match").disabled    = alreadyActed || !hasMatch;

  // 試合ボタンは試合週のみ有効にする
  const matchBtn = document.getElementById("btn-go-match");
  if (hasMatch && !alreadyActed) {
    matchBtn.classList.add("primary");
    matchBtn.querySelector(".btn-label").textContent = "試合へ ⚡";
  } else {
    matchBtn.querySelector(".btn-label").textContent = "試合へ";
  }

  // GPがない場合は振り分けボタンを視覚的に抑制する（無効にはしない）
  const growthBtn = document.getElementById("btn-go-growth");
  growthBtn.style.opacity = hasGP ? "1" : "0.5";

  // 行動済み通知の表示切り替え
  document.getElementById("main-action-done-notice").style.display =
    alreadyActed ? "block" : "none";
}

/**
 * メイン画面のボタン状態を外部から更新するための公開関数。
 * トレーニング・試合完了後に openMain() を経由せず呼ぶ場合に使う。
 */
function refreshMainButtons() {
  _refreshMainButtons();
}
