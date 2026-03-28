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

window.addEventListener("DOMContentLoaded", () => {
  _registerAllEvents();
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
  document.querySelectorAll(".pos-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pos-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
  document.getElementById("btn-start-game").addEventListener("click", onStartGame);

  // --- マップ画面：ロケーションボタン（クリックでポップアップ表示）---
  // ロケーションボタンは uiRenderMap() で動的生成されるため
  // マップコンテナに委任イベントを登録する
  const mapBtnContainer = document.getElementById("map-location-btns");
  if (mapBtnContainer) {
    mapBtnContainer.addEventListener("click", (e) => {
      const btn = e.target.closest(".map-loc-btn");
      if (btn && btn.dataset.locId) {
        uiOpenMapPopup(btn.dataset.locId); // ui.js
      }
    });
  }

  // マップポップアップ閉じるボタン
  document.getElementById("popup-close")?.addEventListener("click", () => {
    uiCloseMapPopup(); // ui.js
  });

  // --- ジム（トレーニング）画面 ---
  document.getElementById("btn-training-back").addEventListener("click", onTrainingBack);

  // --- 成長画面 ---
  document.getElementById("btn-growth-back").addEventListener("click", onGrowthBack);

  // --- エージェント画面 ---
  document.getElementById("btn-agent-back").addEventListener("click", onAgentBack);

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

/** 「NEW GAME」ボタン */
function onNewGame() {
  openCreate();
}

/** 「CONTINUE」ボタン */
function onContinue() {
  const success = loadGame(); // save.js
  if (success) {
    openMap();
  } else {
    alert("セーブデータの読み込みに失敗しました。");
  }
}

// =============================================================
// 選手作成画面のイベント
// =============================================================

/** 「ゲームスタート」ボタン */
function onStartGame() {
  const name = document.getElementById("input-name").value.trim();
  if (!name) {
    alert("選手名を入力してください。");
    document.getElementById("input-name").focus();
    return;
  }

  const selectedBtn = document.querySelector(".pos-btn.selected");
  const position    = selectedBtn ? selectedBtn.dataset.position : "エース";

  // 作成画面で振り分けたステータスを取得する
  const allocatedStats = uiGetCreateStats(); // ui.js

  // ゲーム状態を初期化する
  initState(name, position, allocatedStats); // state.js

  openMap();
}

// =============================================================
// マップ画面のイベント（ポップアップ内ハンドラ）
// =============================================================

/**
 * 自宅「休息」アクション。
 * ui.js の _getLocationActions から呼ばれる。
 */
function onHomeRest() {
  const result = doTraining("rest"); // career.js（restは疲労回復、トレーニングロックなし）

  const state = getState();
  if (result.isGameOver) {
    openGameOver(state.gameOverReason);
    return;
  }

  _showToast(`疲労が回復しました（${result.fatigueDelta}）`);
  openMap();
}

/**
 * 「セーブ」アクション。
 * 自宅ポップアップの「セーブ」ボタンおよびトーストから呼ばれる。
 */
function onSave() {
  const success = saveGame(); // save.js
  _showToast(success ? "セーブしました" : "セーブに失敗しました", !success);
}

// =============================================================
// ジム（トレーニング）画面のイベント
// =============================================================

/**
 * トレーニングカードをクリックしたときの処理。
 * ui.js の uiRenderTrainingCards() から登録される。
 *
 * @param {string} trainingId - 選択したトレーニングのID
 */
function onTrainingCardClick(trainingId) {
  const result = doTraining(trainingId); // career.js

  const state = getState();
  if (result.isGameOver) {
    openGameOver(state.gameOverReason);
    return;
  }

  if (!result.success) {
    alert(result.reason || "トレーニングを実行できませんでした。");
    return;
  }

  const gpMsg   = result.gpGained > 0 ? `　GP +${result.gpGained}` : "";
  const warnMsg = result.injuryWarning ? "\n⚠ 疲労が高いです。休息をお勧めします。" : "";
  _showToast(`${result.trainingName} 完了！${gpMsg}${warnMsg}`);

  openMap();
}

/** 「マップへ戻る」ボタン（トレーニング画面） */
function onTrainingBack() {
  openMap();
}

// =============================================================
// 成長ポイント画面のイベント
// =============================================================

/** 「マップへ戻る」ボタン（成長画面） */
function onGrowthBack() {
  openMap();
}

// =============================================================
// エージェント画面のイベント
// =============================================================

/** 「マップへ戻る」ボタン（エージェント画面） */
function onAgentBack() {
  openMap();
}

/**
 * 移籍オファーを承諾する。
 * ui.js の _renderAgentOffers から登録される。
 *
 * @param {string} teamId - 移籍先チームID
 */
function onAcceptTransferOffer(teamId) {
  const result = acceptTransferOffer(teamId); // career.js

  if (!result.success) {
    alert(result.reason || "移籍を承諾できませんでした。");
    return;
  }

  const state = getState();
  alert(`${state.career.teamName} への移籍が完了しました！`);

  // エージェント画面を再描画する
  uiRenderAgentScreen(); // ui.js
}

/**
 * 移籍申請を行う。
 * ui.js の _renderAgentRequestTargets から登録される。
 *
 * @param {string} teamId - 移籍希望先チームID
 */
function onRequestTransfer(teamId) {
  const result = requestTransfer(teamId); // career.js

  if (!result.success) {
    alert(result.reason || "移籍申請が承認されませんでした。");
    return;
  }

  const state = getState();
  alert(`${state.career.teamName} への移籍が完了しました！`);

  uiRenderAgentScreen(); // ui.js
}

// =============================================================
// 試合画面のイベント
// =============================================================

/**
 * 移動ボタン（◀ ▶）のポインターホールドを登録する。
 * pointerdown で移動開始、pointerup/pointerleave で停止。
 * match.js の setMoveLeft / setMoveRight を呼ぶ。
 */
function _registerMoveButtons() {
  const btnLeft  = document.getElementById("btn-move-left");
  const btnRight = document.getElementById("btn-move-right");

  // 左ボタン
  btnLeft.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btnLeft.classList.add("pressed");
    setMoveLeft(true); // match.js
  });
  btnLeft.addEventListener("pointerup",    () => { btnLeft.classList.remove("pressed");  setMoveLeft(false);  });
  btnLeft.addEventListener("pointerleave", () => { btnLeft.classList.remove("pressed");  setMoveLeft(false);  });

  // 右ボタン
  btnRight.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btnRight.classList.add("pressed");
    setMoveRight(true); // match.js
  });
  btnRight.addEventListener("pointerup",    () => { btnRight.classList.remove("pressed"); setMoveRight(false); });
  btnRight.addEventListener("pointerleave", () => { btnRight.classList.remove("pressed"); setMoveRight(false); });
}

/** 「AUTO」トグルボタン */
function onAutoToggle() {
  const isAuto = toggleAutoMode(); // match.js
  uiUpdateAutoButton(isAuto);     // ui.js
}

// =============================================================
// 試合結果画面のイベント
// =============================================================

/** 「マップへ戻る」ボタン */
function onResultNext() {
  const btn = document.getElementById("btn-result-next");

  // エンディング pending がある場合はエンディングへ
  if (btn && btn._pendingEnding) {
    const endingId = btn._pendingEnding;
    btn._pendingEnding = null;
    btn.textContent = "マップへ戻る ▶";
    openEnding(endingId);
    return;
  }

  const state = getState();

  // ゲームオーバー確認
  if (state.isGameOver) {
    openGameOver(state.gameOverReason);
    return;
  }

  openMap();
}

// =============================================================
// エンディング・ゲームオーバー画面のイベント
// =============================================================

/** 「もう一度プレイ」ボタン（エンディング・ゲームオーバー共通） */
function onRestart() {
  deleteSaveData(); // save.js
  openTitle();
}

// =============================================================
// トースト通知
// =============================================================

/**
 * 画面下部に一時的なメッセージを表示する。
 * 2秒後に自動でフェードアウトして消える。
 *
 * @param {string}  message - 表示するメッセージ
 * @param {boolean} isError - true にすると赤背景（エラー用）
 */
function _showToast(message, isError = false) {
  const existing = document.getElementById("toast-message");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast-message";
  toast.textContent = message;

  Object.assign(toast.style, {
    position:      "absolute",
    bottom:        "70px",
    left:          "50%",
    transform:     "translateX(-50%)",
    padding:       "10px 24px",
    background:    isError ? "rgba(200,40,40,0.95)" : "rgba(20,80,200,0.95)",
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

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
