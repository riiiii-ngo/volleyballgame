/**
 * save.js
 * ゲームのセーブ・ロード処理を担当するファイル。
 *
 * 役割：
 *   - ゲーム状態（state.js の _state）を localStorage に保存する
 *   - 保存済みデータを読み込んで状態を復元する
 *   - セーブデータの存在確認・削除も行う
 *
 * 設計方針：
 *   - 保存先は localStorage（ブラウザに永続保存される）
 *   - データ形式は JSON 文字列
 *   - state.js の更新関数を通して復元する（直接書き換えはしない）
 *   - Godot移植時は SaveManager.gd / FileAccess に相当
 */

// セーブデータを保存する localStorage のキー名
const SAVE_KEY = "volleybak_save_v1";

// =============================================================
// セーブ処理
// =============================================================

/**
 * 現在のゲーム状態を localStorage に保存する。
 * getState() で取得した状態を JSON に変換して保存する。
 *
 * @returns {boolean} 保存成功なら true、失敗なら false
 */
function saveGame() {
  try {
    // 現在の状態を取得する
    const state = getState();
    if (!state) {
      console.warn("[save] 保存する状態がありません。");
      return false;
    }

    // 保存日時を付与する（ロード画面で「いつのデータか」を表示するため）
    const saveData = {
      savedAt: new Date().toISOString(), // 保存日時（ISO形式）
      version: SAVE_KEY,                // バージョン識別子（互換性チェック用）
      state: state,                      // ゲーム状態本体
    };

    // JSON 文字列に変換して保存する
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));

    console.log("[save] セーブ完了:", saveData.savedAt);
    return true;
  } catch (e) {
    // localStorage が使えない環境（プライベートモードなど）でもクラッシュしない
    console.error("[save] セーブに失敗しました:", e);
    return false;
  }
}

// =============================================================
// ロード処理
// =============================================================

/**
 * localStorage からセーブデータを読み込み、ゲーム状態を復元する。
 * state.js の _state を直接上書きする形で復元する。
 *
 * @returns {boolean} ロード成功なら true、データなし・失敗なら false
 */
function loadGame() {
  try {
    // localStorage からデータを取り出す
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      console.log("[save] セーブデータが見つかりません。");
      return false;
    }

    // JSON をパースしてオブジェクトに戻す
    const saveData = JSON.parse(raw);

    // バージョンチェック：異なるバージョンのデータは読み込まない
    if (saveData.version !== SAVE_KEY) {
      console.warn("[save] セーブデータのバージョンが異なります。ロードをスキップします。");
      return false;
    }

    // state.js の内部状態を復元する
    // ※ _state は state.js 内のプライベート変数のため、
    //   initState() で初期化してから各フィールドを上書きする方式をとる
    restoreState(saveData.state);

    console.log("[save] ロード完了。保存日時:", saveData.savedAt);
    return true;
  } catch (e) {
    console.error("[save] ロードに失敗しました:", e);
    return false;
  }
}

/**
 * 読み込んだデータで state.js の状態を復元する内部関数。
 * state.js の initState() を使って初期化した後、
 * 保存済みデータで各フィールドを上書きする。
 *
 * @param {Object} savedState - localStorage から読み込んだ状態オブジェクト
 */
function restoreState(savedState) {
  // まず initState() で初期状態を作る（フィールドの抜け漏れを防ぐ）
  initState(savedState.player.name, savedState.player.position);

  // 保存済みデータで上書きする
  // getState() で参照を取得し、各フィールドをコピーする
  const state = getState();

  // プレイヤー情報を復元
  state.player = { ...savedState.player };

  // 能力値を復元（保存データにないキーは初期値のまま）
  if (savedState.stats) {
    Object.keys(savedState.stats).forEach((key) => {
      if (key in state.stats) {
        state.stats[key] = savedState.stats[key];
      }
    });
  }

  // 時間を復元
  state.year    = savedState.year    ?? 1;
  state.month   = savedState.month   ?? 1;
  state.week    = savedState.week    ?? 1;

  // 資金・疲労・GPを復元
  state.money        = savedState.money        ?? GAME_CONFIG.STARTING_MONEY;
  state.fatigue      = savedState.fatigue      ?? 0;
  state.growthPoints = savedState.growthPoints ?? 0;

  // 対戦成績を復元
  if (savedState.record) {
    state.record = { ...state.record, ...savedState.record };
  }

  // 進行フラグを復元
  state.actionTakenThisWeek    = savedState.actionTakenThisWeek    ?? false;
  state.currentScheduledMatch  = savedState.currentScheduledMatch  ?? null;
  state.isGameOver             = savedState.isGameOver             ?? false;
  state.gameOverReason         = savedState.gameOverReason         ?? null;
  state.isEnding               = savedState.isEnding               ?? false;
}

// =============================================================
// セーブデータの存在確認
// =============================================================

/**
 * セーブデータが存在するか確認する。
 * タイトル画面で「コンティニュー」ボタンを表示するかの判定に使う。
 *
 * @returns {boolean} セーブデータが存在すれば true
 */
function hasSaveData() {
  return localStorage.getItem(SAVE_KEY) !== null;
}

/**
 * セーブデータの概要情報（選手名・日時など）を返す。
 * タイトル画面のコンティニュー表示に使う。
 *
 * @returns {Object|null} 概要情報オブジェクト、なければ null
 */
function getSaveInfo() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;

    const saveData = JSON.parse(raw);
    const s = saveData.state;

    return {
      savedAt:    saveData.savedAt,
      playerName: s.player?.name     ?? "不明",
      position:   s.player?.position ?? "不明",
      year:       s.year  ?? 1,
      month:      s.month ?? 1,
      week:       s.week  ?? 1,
      money:      s.money ?? 0,
    };
  } catch (e) {
    return null;
  }
}

// =============================================================
// セーブデータの削除
// =============================================================

/**
 * セーブデータを削除する。
 * 「最初からやり直す」機能で使う。
 */
function deleteSaveData() {
  localStorage.removeItem(SAVE_KEY);
  console.log("[save] セーブデータを削除しました。");
}
