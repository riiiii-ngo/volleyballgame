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

/** 現在表示中の画面IDを保持する */
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
  const current = document.getElementById(_currentScreen);
  if (current) current.classList.remove("active");

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
// =============================================================

/**
 * タイトル画面を開く。
 * セーブデータがあれば「コンティニュー」ボタンを表示する。
 */
function openTitle() {
  const continueBtn = document.getElementById("btn-continue");
  const saveInfoEl  = document.getElementById("save-info");
  const info        = getSaveInfo();

  if (info) {
    continueBtn.style.display = "inline-block";
    if (saveInfoEl) {
      const savedDate = new Date(info.savedAt).toLocaleString("ja-JP");
      saveInfoEl.textContent =
        `${info.playerName}（${info.position}） ${info.year}年目${info.month}月 ／ ${savedDate}`;
    }
  } else {
    continueBtn.style.display = "none";
    if (saveInfoEl) saveInfoEl.textContent = "";
  }

  showScreen(SCREEN.TITLE);
}

/**
 * 選手作成画面を開く。
 * 入力欄・ポジション選択をリセットしてから表示する。
 */
function openCreate() {
  const nameInput = document.getElementById("input-name");
  if (nameInput) nameInput.value = "";

  // ポジション選択をリセットする（最初のボタンを選択状態にする）
  const posBtns = document.querySelectorAll(".pos-btn");
  posBtns.forEach((btn, i) => {
    btn.classList.toggle("selected", i === 0);
  });

  showScreen(SCREEN.CREATE);
}

/**
 * メイン育成画面を開く。
 * トップバー・選手カード・カレンダー・次の試合パネルをすべて更新する。
 */
function openMain() {
  const state = getState();

  // トップバーを更新する
  uiUpdateTopbar();

  // 選手カードを更新する
  uiRenderPlayerCard();

  // 月間カレンダーを描画する
  uiRenderCalendar();

  // 「次の試合」パネルを更新する
  uiUpdateNextMatchPanel();

  // 「試合へ」ボタンの有効/無効を設定する
  uiUpdateMatchButton();

  // 行動済み通知を更新する
  uiShowActionDoneNotice(state.actionTakenThisWeek);

  showScreen(SCREEN.MAIN);
}

/**
 * トレーニング選択画面を開く。
 * 現在の状態に応じたトレーニングカードを生成して表示する。
 */
function openTraining() {
  // トレーニング画面のヘッダー（疲労・資金）を更新する
  uiUpdateTrainingHeader();

  // トレーニングカード一覧を生成する
  uiRenderTrainingCards();

  showScreen(SCREEN.TRAINING);
}

/**
 * 成長ポイント振り分け画面を開く。
 * 現在の能力値とGP残量を表示する。
 */
function openGrowth() {
  // 能力値リストを描画する（GP残量更新を含む）
  uiRenderGrowthStats();

  showScreen(SCREEN.GROWTH);
}

/**
 * 試合画面を開いてインタラクティブ試合エンジンを起動する。
 * Canvas描画ループと入力イベントはこの関数から開始される。
 *
 * @param {string} matchType  - 試合種別（MATCH_REWARDS のキー）
 * @param {string} matchLabel - 試合名（表示用）
 */
function openMatch(matchType, matchLabel) {
  const state = getState();

  // スコアバーに選手名・相手名を仮設定する（initMatch で上書きされる）
  uiSetMatchNames(state.player.name, matchLabel || "相手チーム");

  // スコアをゼロリセットする
  updateScoreUI({ mySets: 0, oppSets: 0, myPts: 0, oppPts: 0, setNum: 1 });

  // AUTO ボタンを OFF 状態にリセットする
  uiUpdateAutoButton(false);

  // フェーズUI を初期状態にリセットする
  const phaseLabel = document.getElementById("phase-status-label");
  if (phaseLabel) phaseLabel.textContent = "待機中";

  const cmdBtns = document.getElementById("command-btns");
  if (cmdBtns) cmdBtns.innerHTML = "";

  // 画面切り替え
  showScreen(SCREEN.MATCH);

  // 画面表示後にインタラクティブ試合エンジンを初期化する
  // （Canvas が DOMに配置された後でないと getContext が動作しないため遅延）
  setTimeout(() => initMatch(matchType), 100);
}

/**
 * 試合結果画面を開く。
 * match.js の _endMatch から呼ばれる。
 *
 * @param {Object} result - 試合結果オブジェクト（ui.js の uiRenderResultScreen に渡す形式）
 */
function openResult(result) {
  // 試合ループを確実に停止する
  stopMatchLoop();

  // リザルト画面の各要素を描画する
  uiRenderResultScreen(result);

  showScreen(SCREEN.RESULT);
}

/**
 * エンディング画面を開く。
 *
 * @param {string} endingId - ENDINGS の id
 */
function openEnding(endingId) {
  const ending = ENDINGS.find((e) => e.id === endingId) || ENDINGS[ENDINGS.length - 1];

  // アイコン・タイトル・メッセージを設定する
  const rankEl    = document.getElementById("ending-rank");
  const titleEl   = document.getElementById("ending-title");
  const messageEl = document.getElementById("ending-message");

  if (rankEl)    rankEl.textContent    = ending.icon;
  if (titleEl)   titleEl.textContent   = ending.title;
  if (messageEl) messageEl.textContent = ending.message;

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
  const reasonEl = document.getElementById("gameover-reason");
  if (reasonEl) {
    reasonEl.textContent = reason || "ゲームオーバーになりました。";
  }

  showScreen(SCREEN.GAMEOVER);
}
