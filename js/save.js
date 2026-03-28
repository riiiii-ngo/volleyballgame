/**
 * save.js
 * ゲームのセーブ・ロード処理を担当するファイル。
 *
 * 役割：
 *   - ゲーム状態（state.js）を localStorage に保存する
 *   - 保存済みデータを読み込んで状態を復元する
 *   - セーブデータの存在確認・削除も行う
 *
 * 設計方針：
 *   - state.js の exportState() / importState() を通してデータをやり取りする
 *   - Godot移植時は SaveManager.gd / FileAccess に相当
 */

// localStorage のキー名（バージョンが変わったら変更する）
const SAVE_KEY = "volleybak_career_v1";

// =============================================================
// セーブ処理
// =============================================================

/**
 * 現在のゲーム状態を localStorage に保存する。
 *
 * @returns {boolean} 成功なら true
 */
function saveGame() {
  try {
    const stateSnapshot = exportState(); // state.js の関数
    if (!stateSnapshot) {
      console.warn("[save] 保存する状態がありません。");
      return false;
    }

    const saveData = {
      savedAt: new Date().toISOString(),
      version: SAVE_KEY,
      state:   stateSnapshot,
    };

    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    console.log("[save] セーブ完了:", saveData.savedAt);
    return true;
  } catch (e) {
    console.error("[save] セーブに失敗しました:", e);
    return false;
  }
}

// =============================================================
// ロード処理
// =============================================================

/**
 * localStorage からセーブデータを読み込んでゲーム状態を復元する。
 *
 * @returns {boolean} 成功なら true
 */
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      console.log("[save] セーブデータが見つかりません。");
      return false;
    }

    const saveData = JSON.parse(raw);

    // バージョン不一致は読み込まない
    if (saveData.version !== SAVE_KEY) {
      console.warn("[save] バージョンが異なるためロードをスキップします。");
      return false;
    }

    // state.js の importState() で状態を復元する
    importState(saveData.state);

    console.log("[save] ロード完了。保存日時:", saveData.savedAt);
    return true;
  } catch (e) {
    console.error("[save] ロードに失敗しました:", e);
    return false;
  }
}

// =============================================================
// セーブデータの存在確認・概要取得
// =============================================================

/**
 * セーブデータが存在するか確認する。
 * @returns {boolean}
 */
function hasSaveData() {
  return localStorage.getItem(SAVE_KEY) !== null;
}

/**
 * セーブデータの概要情報を返す。タイトル画面のコンティニュー表示に使う。
 *
 * @returns {Object|null} 概要情報、なければ null
 */
function getSaveInfo() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;

    const saveData = JSON.parse(raw);
    const s = saveData.state;

    return {
      savedAt:    saveData.savedAt,
      playerName: s.player?.name              ?? "不明",
      position:   s.player?.position          ?? "不明",
      teamName:   s.career?.teamName          ?? "不明",
      teamTier:   s.career?.teamTier          ?? 1,
      matchIndex: s.career?.matchIndex        ?? 0,
      evaluation: s.career?.evaluation        ?? 0,
      money:      s.money                     ?? 0,
      wins:       s.record?.totalWins         ?? 0,
      losses:     s.record?.totalLosses       ?? 0,
    };
  } catch (e) {
    return null;
  }
}

// =============================================================
// セーブデータの削除
// =============================================================

/**
 * セーブデータを削除する。「最初からやり直す」で使う。
 */
function deleteSaveData() {
  localStorage.removeItem(SAVE_KEY);
  console.log("[save] セーブデータを削除しました。");
}
