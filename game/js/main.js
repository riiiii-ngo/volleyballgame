/**
 * main.js
 * ゲームの初期化とイベント登録を担当するファイル。
 *
 * 役割：
 *   - ページ読み込み完了時にゲームを起動する
 *   - 全ボタンにクリックイベントを登録する
 *   - 試合シミュレーションの演出（ログ送り）を制御する
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
  // 全ボタンのイベントを登録する
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
  // ポジションボタン（複数）は querySelectorAll でまとめて登録する
  document.querySelectorAll(".position-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // 選択済みクラスを一度全部外してから、押したボタンだけに付ける
      document.querySelectorAll(".position-btn").forEach((b) => b.classList.remove("selected"));
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

  // --- 試合結果画面 ---
  document.getElementById("btn-match-result").addEventListener("click", onMatchResult);
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
  const success = loadGame(); // save.js でロード処理を行う
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
  // 名前を取得して空欄チェックをする
  const name = document.getElementById("input-name").value.trim();
  if (!name) {
    alert("選手名を入力してください。");
    document.getElementById("input-name").focus();
    return;
  }

  // 選択中のポジションを取得する
  const selectedBtn = document.querySelector(".position-btn.selected");
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
  if (state.actionTakenThisWeek) return; // 行動済みなら何もしない
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

  // 試合画面を開いてシミュレーションを開始する
  openMatch(matchEvent.matchType, matchEvent.label);
}

/** 「次の週へ」ボタン */
function onNextWeek() {
  // progress.js で週を進めて発生イベントを取得する
  const result = advanceToNextWeek();

  // ゲームオーバー判定
  if (result.isGameOver) {
    const state = getState();
    openGameOver(state.gameOverReason);
    return;
  }

  // エンディング判定
  if (result.isEnding) {
    openEnding(result.endingId);
    return;
  }

  // 通常進行：メイン画面に戻る（状態を最新に更新して再描画）
  openMain();
}

/** 「セーブ」ボタン */
function onSave() {
  const success = saveGame();
  if (success) {
    _showToast("セーブしました");
  } else {
    _showToast("セーブに失敗しました", true);
  }
}

// =============================================================
// トレーニング画面のイベント
// =============================================================

/**
 * トレーニングカードをクリックした時の処理。
 * ui.js の uiRenderTrainingCards() からカード生成時に登録される。
 *
 * @param {string} trainingId - 選択したトレーニングのID
 */
function onTrainingCardClick(trainingId) {
  // training.js でトレーニングを実行する
  const result = executeTraining(trainingId);

  if (!result.success) {
    // 故障やゲームオーバーの場合
    if (result.isGameOver) {
      openGameOver(result.reason);
      return;
    }
    alert(result.reason || "トレーニングを実行できませんでした。");
    return;
  }

  // 成功時：結果をポップアップで表示してからメイン画面に戻る
  const gpMsg   = result.gpGained > 0 ? `\n成長ポイント +${result.gpGained} GP` : "";
  const warnMsg = result.injuryWarning ? "\n⚠️ 疲労が高いです。休息を取ることをお勧めします。" : "";
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
// 試合画面のイベント・試合シミュレーション演出
// =============================================================

// 試合結果を一時保存する変数（結果画面に渡すため）
let _lastMatchResult  = null;
let _lastRewardResult = null;
let _lastMatchLabel   = "";

/**
 * 試合シミュレーションを開始する。
 * screens.js の openMatch() から呼ばれる。
 * ラリーログを一定間隔で1件ずつ表示する演出を行う。
 *
 * @param {string} matchType  - 試合種別
 * @param {string} matchLabel - 試合名
 */
function startMatchSimulation(matchType, matchLabel) {
  // --- 試合ロジックを一括実行する ---
  const matchResult = simulateMatch(matchType);

  // --- 試合結果を state.js に記録する ---
  recordMatchResult({
    win:          matchResult.win,
    matchType:    matchType,
    opponentName: matchResult.opponent.name,
    score:        matchResult.scoreText,
    mvp:          matchResult.mvp,
  });

  // --- 報酬を付与する ---
  const rewardResult = grantMatchReward(matchType, matchResult.win);

  // --- 後で結果画面に渡すために保存しておく ---
  _lastMatchResult  = matchResult;
  _lastRewardResult = rewardResult;
  _lastMatchLabel   = matchLabel;

  // --- 対戦相手名を画面に反映する ---
  document.getElementById("match-opponent-name").textContent =
    `vs. ${matchResult.opponent.name}`;

  // --- ラリーログを1件ずつ時間差で表示する演出 ---
  _playMatchAnimation(matchResult);
}

/**
 * ラリーログを1件ずつ時間差で表示するアニメーション処理。
 * 全ログを表示し終えたら「結果へ」ボタンを表示する。
 *
 * @param {Object} matchResult - simulateMatch() の戻り値
 */
function _playMatchAnimation(matchResult) {
  const logs = matchResult.allRallies;

  // ログ表示の間隔（ms）。ラリー数が多いほど短くする
  const interval = logs.length > 80 ? 40 : logs.length > 50 ? 60 : 80;

  let index      = 0;
  let myScore    = 0;
  let oppScore   = 0;
  let currentSet = 1;

  const timer = setInterval(() => {
    if (index >= logs.length) {
      // 全ログを表示し終えたらタイマーを止めて「結果へ」ボタンを出す
      clearInterval(timer);
      uiShowMatchResultButton();
      return;
    }

    const log = logs[index];
    index++;

    if (log.isSetResult) {
      // セット終了ログ：セットバッジを追加してログに区切りを入れる
      const setResult = matchResult.sets[currentSet - 1];
      uiAddSetBadge(
        currentSet,
        log.myWon,
        setResult ? setResult.myScore : 0,
        setResult ? setResult.oppScore : 0
      );
      uiAddMatchLog(log.comment, "set-result");
      currentSet++;

      // 次のセットのためにスコアをリセットする
      myScore  = 0;
      oppScore = 0;
      uiUpdateMatchScore(myScore, oppScore);
    } else {
      // 通常ラリーログ：スコアを更新してコメントを追加する
      if (log.myPoint) {
        myScore++;
        uiAddMatchLog(log.comment, "score-my");
      } else {
        oppScore++;
        uiAddMatchLog(log.comment, "score-opp");
      }
      uiUpdateMatchScore(myScore, oppScore);
    }
  }, interval);
}

/** 試合画面の「試合結果へ」ボタン */
function onMatchResult() {
  if (!_lastMatchResult) return;
  openResult(_lastMatchResult, _lastRewardResult, _lastMatchLabel);
}

// =============================================================
// 試合結果画面のイベント
// =============================================================

/** 「育成画面へもどる」ボタン */
function onResultNext() {
  // 行動済みフラグを立てる（試合も1週の行動として扱う）
  markActionTaken();

  // ゲームオーバーチェック（試合後に資金がなくなっている可能性がある）
  const state = getState();
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
  // セーブデータを削除して最初からやり直す
  deleteSaveData();
  openTitle();
}

// =============================================================
// トースト通知（セーブ完了などの一時メッセージ）
// =============================================================

/**
 * 画面下部に一時的なメッセージを表示する。
 * 2秒後に自動で消える。
 *
 * @param {string}  message - 表示するメッセージ
 * @param {boolean} isError - エラー表示なら true（赤色になる）
 */
function _showToast(message, isError = false) {
  // 既存のトーストがあれば削除する
  const existing = document.getElementById("toast-message");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast-message";
  toast.textContent = message;

  // トーストのスタイルをインラインで設定する
  Object.assign(toast.style, {
    position:        "absolute",
    bottom:          "100px",
    left:            "50%",
    transform:       "translateX(-50%)",
    padding:         "10px 24px",
    background:      isError ? "rgba(200,40,40,0.95)" : "rgba(26,111,219,0.95)",
    color:           "#ffffff",
    borderRadius:    "20px",
    fontSize:        "14px",
    fontWeight:      "bold",
    zIndex:          "200",
    pointerEvents:   "none",
    boxShadow:       "0 4px 16px rgba(0,0,0,0.4)",
    transition:      "opacity 0.3s ease",
  });

  document.getElementById("game-container").appendChild(toast);

  // 1.5秒後にフェードアウトして削除する
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 1500);
}
