/**
 * main.js
 * ゲームの初期化とイベント登録を担当するファイル。
 *
 * 役割：
 *   - ページ読み込み完了時にゲームを起動する
 *   - 全ボタンにイベントを一括登録する
 *   - 試合画面の移動ボタン（ポインターホールド）・AUTOトグルを制御する
 *   - 各モジュールを「つなぐ」接着剤の役割を果たす
 *
 * 設計方針：
 *   - ゲームロジックはここに書かない（各モジュールの関数を呼ぶだけ）
 *   - イベントハンドラは短く保ち、処理の本体は専門ファイルに任せる
 *   - Godot移植時は Main.gd / GameBootstrap.gd に相当
 */

// =============================================================
// ゲーム起動
// =============================================================

/**
 * ページの読み込みが完了したらゲームを起動する。
 */
window.addEventListener("DOMContentLoaded", () => {
  // 全ボタンのイベントを一括登録する
  _registerAllEvents();

  // タイトル画面を表示する（セーブデータのチェックも内部で行う）
  openTitle();
});

// =============================================================
// 全イベントの登録
// =============================================================

/**
 * ゲーム内の全ボタン・入力欄にイベントを一括登録する。
 * DOMContentLoaded 後に1度だけ呼ぶ。
 */
function _registerAllEvents() {
  // --- タイトル画面 ---
  document.getElementById("btn-new-game").addEventListener("click", onNewGame);
  document.getElementById("btn-continue").addEventListener("click", onContinue);

  // --- 選手作成画面 ---
  // ポジションボタン：タップで選択状態を切り替える
  document.querySelectorAll(".pos-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pos-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
  document.getElementById("btn-start-game").addEventListener("click", onStartGame);

  // --- メイン画面 ---
  document.getElementById("btn-go-training").addEventListener("click", onGoTraining);
  document.getElementById("btn-go-growth").addEventListener("click", onGoGrowth);
  document.getElementById("btn-go-match").addEventListener("click", onGoMatch);
  document.getElementById("btn-next-week").addEventListener("click", onNextWeek);
  document.getElementById("btn-save").addEventListener("click", onSave);

  // --- トレーニング画面 ---
  document.getElementById("btn-training-back").addEventListener("click", onTrainingBack);

  // --- 成長画面 ---
  document.getElementById("btn-growth-back").addEventListener("click", onGrowthBack);

  // --- 試合画面：移動ボタン（ポインターホールド対応）---
  _registerMoveButtons();

  // --- 試合画面：AUTO トグル ---
  document.getElementById("btn-auto-toggle").addEventListener("click", onAutoToggle);

  // --- 試合結果画面 ---
  document.getElementById("btn-result-next").addEventListener("click", onResultNext);

  // --- エンディング画面 ---
  document.getElementById("btn-restart-from-ending").addEventListener("click", onRestart);

  // --- ゲームオーバー画面 ---
  document.getElementById("btn-restart-from-gameover").addEventListener("click", onRestart);
}

// =============================================================
// タイトル画面のイベント
// =============================================================

/** 「ニューゲーム」ボタン */
function onNewGame() {
  openCreate();
}

/** 「コンティニュー」ボタン */
function onContinue() {
  const success = loadGame();
  if (success) {
    openMain();
  } else {
    alert("セーブデータの読み込みに失敗しました。");
  }
}

// =============================================================
// 選手作成画面のイベント
// =============================================================

/** 「ゲームスタート」ボタン */
function onStartGame() {
  // 名前の空欄チェックをする
  const name = document.getElementById("input-name").value.trim();
  if (!name) {
    alert("選手名を入力してください。");
    document.getElementById("input-name").focus();
    return;
  }

  // 選択中のポジションを取得する
  const selectedBtn = document.querySelector(".pos-btn.selected");
  const position    = selectedBtn ? selectedBtn.dataset.position : "エース";

  // 状態を初期化してゲームを開始する
  initState(name, position);
  openMain();
}

// =============================================================
// メイン画面のイベント
// =============================================================

/** 「トレーニング」ボタン */
function onGoTraining() {
  const state = getState();
  if (state.actionTakenThisWeek) return;
  openTraining();
}

/** 「成長（GP振分）」ボタン */
function onGoGrowth() {
  openGrowth();
}

/** 「試合へ」ボタン */
function onGoMatch() {
  const state = getState();
  if (state.actionTakenThisWeek) return;

  const matchEvent = state.currentScheduledMatch;
  if (!matchEvent) return;

  // 試合画面を開いてインタラクティブエンジンを起動する
  openMatch(matchEvent.matchType, matchEvent.label);
}

/** 「次の週へ」ボタン */
function onNextWeek() {
  // progress.js で週を進めて発生イベントを取得する
  const result = advanceToNextWeek();

  if (result.isGameOver) {
    const state = getState();
    openGameOver(state.gameOverReason);
    return;
  }

  if (result.isEnding) {
    openEnding(result.endingId);
    return;
  }

  // 通常進行：メイン画面を最新状態で再描画する
  openMain();
}

/** 「セーブ」ボタン */
function onSave() {
  const success = saveGame();
  _showToast(success ? "セーブしました" : "セーブに失敗しました", !success);
}

// =============================================================
// トレーニング画面のイベント
// =============================================================

/**
 * トレーニングカードをクリックしたときの処理。
 * ui.js の uiRenderTrainingCards() からカード生成時に登録される。
 *
 * @param {string} trainingId - 選択したトレーニングのID
 */
function onTrainingCardClick(trainingId) {
  const result = executeTraining(trainingId);

  if (!result.success) {
    if (result.isGameOver) {
      openGameOver(result.reason);
      return;
    }
    alert(result.reason || "トレーニングを実行できませんでした。");
    return;
  }

  // 成功時：結果を短く通知してメイン画面に戻る
  const gpMsg   = result.gpGained > 0 ? `\n成長ポイント +${result.gpGained} GP` : "";
  const warnMsg = result.injuryWarning ? "\n⚠️ 疲労が高いです。休息をお勧めします。" : "";
  alert(`${result.trainingName} 完了！${gpMsg}${warnMsg}`);

  openMain();
}

/** 「もどる」ボタン（トレーニング画面） */
function onTrainingBack() {
  openMain();
}

// =============================================================
// 成長ポイント振り分け画面のイベント
// =============================================================

/** 「もどる」ボタン（成長画面） */
function onGrowthBack() {
  openMain();
}

// =============================================================
// 試合画面のイベント
// =============================================================

/**
 * 移動ボタン（◀ ▶）のポインターホールドイベントを登録する。
 * pointerdown で押しっぱなし開始、pointerup/pointerleave で解除。
 * match.js の startMove / stopMove を呼ぶ。
 */
function _registerMoveButtons() {
  const btnLeft  = document.getElementById("btn-move-left");
  const btnRight = document.getElementById("btn-move-right");

  // 左ボタン
  btnLeft.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btnLeft.classList.add("pressed");
    startMove("left");
  });
  btnLeft.addEventListener("pointerup",    () => { btnLeft.classList.remove("pressed");  stopMove("left");  });
  btnLeft.addEventListener("pointerleave", () => { btnLeft.classList.remove("pressed");  stopMove("left");  });

  // 右ボタン
  btnRight.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btnRight.classList.add("pressed");
    startMove("right");
  });
  btnRight.addEventListener("pointerup",    () => { btnRight.classList.remove("pressed"); stopMove("right"); });
  btnRight.addEventListener("pointerleave", () => { btnRight.classList.remove("pressed"); stopMove("right"); });
}

/** 「AUTO」トグルボタン */
function onAutoToggle() {
  const isAuto = toggleAutoMode();
  uiUpdateAutoButton(isAuto);
}

// =============================================================
// 試合結果画面のイベント
// =============================================================

/** 「育成画面へ ▶」ボタン */
function onResultNext() {
  // 試合を「今週の行動」として記録する
  markActionTaken();

  const state = getState();

  // 試合後のゲームオーバーチェック（賞金で資金がゼロになった等）
  if (state.isGameOver) {
    openGameOver(state.gameOverReason);
    return;
  }

  openMain();
}

// =============================================================
// エンディング・ゲームオーバー画面のイベント
// =============================================================

/** 「もう一度プレイ」ボタン（エンディング・ゲームオーバー共通） */
function onRestart() {
  deleteSaveData();
  openTitle();
}

// =============================================================
// トースト通知（セーブ完了などの一時メッセージ）
// =============================================================

/**
 * 画面中央下部に一時的なメッセージを表示する。
 * 1.5秒後に自動でフェードアウトして消える。
 *
 * @param {string}  message - 表示するメッセージ
 * @param {boolean} isError - true にすると赤背景（エラー用）
 */
function _showToast(message, isError = false) {
  // 既存のトーストがあれば先に削除する
  const existing = document.getElementById("toast-message");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast-message";
  toast.textContent = message;

  Object.assign(toast.style, {
    position:      "absolute",
    bottom:        "80px",
    left:          "50%",
    transform:     "translateX(-50%)",
    padding:       "10px 24px",
    background:    isError ? "rgba(200,40,40,0.95)" : "rgba(26,80,200,0.95)",
    color:         "#ffffff",
    borderRadius:  "20px",
    fontSize:      "13px",
    fontWeight:    "bold",
    zIndex:        "200",
    pointerEvents: "none",
    boxShadow:     "0 4px 16px rgba(0,0,0,0.5)",
    transition:    "opacity 0.3s ease",
    whiteSpace:    "nowrap",
  });

  document.getElementById("game-container").appendChild(toast);

  // 1.5秒後にフェードアウトして削除する
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 1500);
}
