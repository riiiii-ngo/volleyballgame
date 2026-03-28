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
  MAP:      "screen-map",
  TRAINING: "screen-training",
  GROWTH:   "screen-growth",
  AGENT:    "screen-agent",
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
  const info        = getSaveInfo(); // save.js

  if (info) {
    continueBtn.style.display = "inline-block";
    if (saveInfoEl) {
      const savedDate = new Date(info.savedAt).toLocaleString("ja-JP");
      saveInfoEl.textContent =
        `${info.playerName} ／ ${info.teamName} ／ 試合${info.matchIndex + 1} ／ ${savedDate}`;
    }
  } else {
    continueBtn.style.display = "none";
    if (saveInfoEl) saveInfoEl.textContent = "";
  }

  showScreen(SCREEN.TITLE);
}

/**
 * 選手作成画面を開く。
 * 入力欄・ポジション選択・ステータス振り分けをリセットしてから表示する。
 */
function openCreate() {
  const nameInput = document.getElementById("input-name");
  if (nameInput) nameInput.value = "";

  // ポジション選択をリセットする（最初のボタンを選択状態にする）
  const posBtns = document.querySelectorAll(".pos-btn");
  posBtns.forEach((btn, i) => {
    btn.classList.toggle("selected", i === 0);
  });

  // ステータス振り分けUIを初期化する
  uiInitCreateStats(); // ui.js

  showScreen(SCREEN.CREATE);
}

/**
 * マップ画面（キャリアのハブ）を開く。
 * トップバー・マップCanvas・ロケーションボタンを更新する。
 */
function openMap() {
  uiUpdateMapTopbar(); // ui.js
  uiRenderMap();       // ui.js

  showScreen(SCREEN.MAP);
}

/**
 * ジム（トレーニング選択）画面を開く。
 * ui.js から openTraining() として呼ばれることもある。
 */
function openTraining() {
  uiUpdateTrainingHeader(); // ui.js
  uiRenderTrainingCards();  // ui.js

  showScreen(SCREEN.TRAINING);
}

/** openTraining の別名（互換性のため） */
const openGym = openTraining;

/**
 * 成長ポイント振り分け画面を開く。
 * 現在の能力値とGP残量を表示する。
 */
function openGrowth() {
  uiRenderGrowthStats(); // ui.js

  showScreen(SCREEN.GROWTH);
}

/**
 * エージェント（移籍）画面を開く。
 */
function openAgent() {
  uiRenderAgentScreen(); // ui.js

  showScreen(SCREEN.AGENT);
}

/**
 * 試合画面を開き、インタラクティブ試合エンジンを起動する。
 * スタジアムポップアップの「試合へ」ボタンから呼ばれる。
 * 引数は互換性のために受け取るが、内部では getNextMatch() を使う。
 *
 * @param {string} [_matchType]  - 未使用（互換性のため）
 * @param {string} [_matchLabel] - 未使用（互換性のため）
 */
function openMatch(_matchType, _matchLabel) {
  const scheduleEntry = getNextMatch(); // career.js
  if (!scheduleEntry) {
    console.warn("[screens] 試合スケジュールが見つかりません。");
    openMap();
    return;
  }

  const opponentEntry = OPPONENT_TABLE[scheduleEntry.matchType];
  if (!opponentEntry) {
    console.warn("[screens] 対戦相手テーブルが見つかりません:", scheduleEntry.matchType);
    openMap();
    return;
  }

  // 対戦相手名をランダムに選ぶ
  const opponentName = opponentEntry.names[
    Math.floor(Math.random() * opponentEntry.names.length)
  ];

  const state = getState();

  // スコアバーに名前を設定する
  uiSetMatchNames(state.player.name, opponentName); // ui.js

  // スコアをゼロリセットする
  updateScoreUI({ myPts: 0, oppPts: 0, mySets: 0, oppSets: 0, setNum: 1 }); // ui.js

  // AUTO ボタンを OFF 状態にリセットする
  uiUpdateAutoButton(false); // ui.js

  // フェーズラベル・コマンドボタンをリセットする
  const phaseLabel = document.getElementById("phase-status-label");
  if (phaseLabel) phaseLabel.textContent = "待機中";
  const cmdBtns = document.getElementById("command-btns");
  if (cmdBtns) cmdBtns.innerHTML = "";

  showScreen(SCREEN.MATCH);

  // Canvas が DOM に配置された後で試合エンジンを起動する
  setTimeout(() => startMatch(scheduleEntry, opponentEntry, opponentName), 200);
}

/**
 * 試合リザルト画面を開く。
 * match.js の _endMatch() から呼ばれる。
 *
 * @param {Object} result - 試合結果オブジェクト
 */
function openResult(result) {
  // リザルト画面の各要素を描画する
  uiRenderResultScreen(result); // ui.js

  showScreen(SCREEN.RESULT);

  // エンディング/ゲームオーバーの遅延チェック
  if (result.isEnding) {
    // 「マップへ戻る」ボタンをエンディング遷移に差し替える
    const nextBtn = document.getElementById("btn-result-next");
    if (nextBtn) {
      nextBtn.textContent = "エンディングへ ▶";
      nextBtn._pendingEnding = result.endingId;
    }
  }
}

/**
 * エンディング画面を開く。
 *
 * @param {string} endingId - ENDINGS の id
 */
function openEnding(endingId) {
  const ending = ENDINGS.find((e) => e.id === endingId) || ENDINGS[ENDINGS.length - 1];

  const rankEl    = document.getElementById("ending-rank");
  const titleEl   = document.getElementById("ending-title");
  const messageEl = document.getElementById("ending-message");

  if (rankEl)    rankEl.textContent    = ending.icon;
  if (titleEl)   titleEl.textContent   = ending.title;
  if (messageEl) messageEl.textContent = ending.message;

  uiRenderEndingStats(); // ui.js

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
