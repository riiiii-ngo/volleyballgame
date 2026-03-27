/**
 * match.js
 * インタラクティブ試合エンジン。
 *
 * 役割：
 *   - Canvas 2.5D コートの描画（courtToScreen による透視変換）
 *   - ラリーフェーズ状態機械（SERVE→RECEIVE→SET→ATTACK→OPP_RETURN→POINT）
 *   - プレイヤーのコート移動、コマンド選択による技術判定
 *   - AUTO モード（自動コマンド選択）
 *   - 試合全体（セット管理・勝敗確定）のフロー制御
 *   - 試合終了後に結果オブジェクトを生成し screens.js へ渡す
 *
 * 設計方針：
 *   - Canvas 描画は drawXxx 系関数に集約する
 *   - state.js の更新関数のみを通してゲーム状態を変更する
 *   - Godot 移植時は MatchEngine.gd + CourtRenderer.gd に相当
 */

// =============================================================
// モジュール内プライベート変数
// =============================================================

/** @type {CanvasRenderingContext2D|null} */
let _ctx = null;

/** @type {HTMLCanvasElement|null} */
let _canvas = null;

/**
 * 現在のラリーフェーズ
 * @type {string} MATCH_PHASE の値
 */
let _phase = MATCH_PHASE.SERVE;

/**
 * 各フェーズで選択されたコマンドID
 * @type {string|null}
 */
let _selectedCommand = null;

/**
 * フェーズ自動進行タイマーID
 * @type {number|null}
 */
let _phaseTimer = null;

/**
 * AUTO モードが ON かどうか
 * @type {boolean}
 */
let _autoMode = false;

/**
 * 移動ボタン押下状態（ポインターホールド検出用）
 * @type {{ left: boolean, right: boolean }}
 */
let _moveHeld = { left: false, right: false };

/**
 * requestAnimationFrame のID（停止用）
 * @type {number|null}
 */
let _rafId = null;

/**
 * 現在の試合スコア
 * @type {{ mySets: number, oppSets: number, myPts: number, oppPts: number, setNum: number }}
 */
let _score = {
  mySets: 0,
  oppSets: 0,
  myPts: 0,
  oppPts: 0,
  setNum: 1,
};

/**
 * 対戦相手情報（名前・攻撃力・守備力）
 * @type {{ name: string, attack: number, defense: number }}
 */
let _opponent = null;

/**
 * 現在の試合種別（MATCH_REWARDS のキー）
 * @type {string}
 */
let _matchType = null;

/**
 * ボールのCanvas上の描画位置（アニメーション用）
 * @type {{ x: number, y: number, visible: boolean }}
 */
let _ball = { x: 400, y: 200, visible: false };

/**
 * フェーズオーバーレイ表示中フラグ
 * @type {boolean}
 */
let _overlayVisible = false;

// =============================================================
// Canvas 透視変換
// =============================================================

/**
 * コート座標をCanvas上のスクリーン座標に変換する（2.5D透視変換）。
 *
 * コート座標:
 *   cx: -1.0（左端）〜 +1.0（右端）  ※コート幅を正規化
 *   cy:  0.0（ネット）〜 +1.0（手前）
 *
 * 透視変換の仕組み:
 *   - cy=0（奥=ネット側）→ 消失点（VP_X, VP_Y）付近
 *   - cy=1（手前）        → 画面下（NEAR_Y）のフル幅
 *   線形補間で中間も自然に縮小される。
 *
 * @param {number} cx - コートX座標（-1〜+1）
 * @param {number} cy - コートY座標（0=奥, 1=手前）
 * @returns {{ x: number, y: number }} Canvas上のピクセル座標
 */
function courtToScreen(cx, cy) {
  const d = COURT_DRAW;

  // 奥と手前それぞれの画面Y座標
  const screenY = d.FAR_Y + (d.NEAR_Y - d.FAR_Y) * cy;

  // 奥と手前それぞれの半幅をcyで補間する
  const halfW = d.FAR_HALF_W + (d.NEAR_HALF_W - d.FAR_HALF_W) * cy;

  // cx（-1〜+1）を画面幅にマッピング
  const screenX = d.VP_X + cx * halfW;

  return { x: screenX, y: screenY };
}

// =============================================================
// コート描画
// =============================================================

/**
 * 試合Canvasを1フレーム描画する。
 * requestAnimationFrame から毎フレーム呼ばれる。
 */
function drawCourt() {
  if (!_ctx) return;
  const d = COURT_DRAW;

  // --- 背景クリア ---
  _ctx.fillStyle = "#060e1a";
  _ctx.fillRect(0, 0, d.CANVAS_W, d.CANVAS_H);

  // --- コートの地面（グラデーション）---
  const groundGrad = _ctx.createLinearGradient(0, d.FAR_Y, 0, d.NEAR_Y);
  groundGrad.addColorStop(0, "#1a3050");
  groundGrad.addColorStop(1, "#0d1e38");
  _ctx.fillStyle = groundGrad;

  // 台形の地面を描画（4頂点で台形）
  _ctx.beginPath();
  _ctx.moveTo(d.VP_X - d.FAR_HALF_W,  d.FAR_Y);
  _ctx.lineTo(d.VP_X + d.FAR_HALF_W,  d.FAR_Y);
  _ctx.lineTo(d.VP_X + d.NEAR_HALF_W, d.NEAR_Y);
  _ctx.lineTo(d.VP_X - d.NEAR_HALF_W, d.NEAR_Y);
  _ctx.closePath();
  _ctx.fill();

  // --- コートライン ---
  _ctx.strokeStyle = "rgba(80, 140, 240, 0.5)";
  _ctx.lineWidth = 1.5;

  // サイドライン（左・右）
  _drawCourtLine(-1, 0, -1, 1);
  _drawCourtLine( 1, 0,  1, 1);

  // エンドライン（手前）
  _drawCourtLine(-1, 1, 1, 1);

  // 奥のライン
  _drawCourtLine(-1, 0, 1, 0);

  // 3mライン（奥から 0.33 の位置）
  _ctx.strokeStyle = "rgba(80, 140, 240, 0.25)";
  _drawCourtLine(-1, 0.33, 1, 0.33);

  // --- ネット ---
  _drawNet();

  // --- プレイヤー ---
  _drawPlayer();

  // --- 相手チーム（奥側に2体） ---
  _drawOpponents();

  // --- ボール ---
  if (_ball.visible) {
    _drawBall(_ball.x, _ball.y);
  }

  // --- プレイヤーポジションインジケーター（理想位置） ---
  _drawPositionIndicator();
}

/**
 * コート座標で直線を描画するヘルパー。
 *
 * @param {number} cx1 - 始点X
 * @param {number} cy1 - 始点Y
 * @param {number} cx2 - 終点X
 * @param {number} cy2 - 終点Y
 */
function _drawCourtLine(cx1, cy1, cx2, cy2) {
  const p1 = courtToScreen(cx1, cy1);
  const p2 = courtToScreen(cx2, cy2);
  _ctx.beginPath();
  _ctx.moveTo(p1.x, p1.y);
  _ctx.lineTo(p2.x, p2.y);
  _ctx.stroke();
}

/**
 * ネットを描画する。
 * ネットはコートY=NET_DEPTH の位置に横一線で引く。
 */
function _drawNet() {
  const d = COURT_DRAW;
  const netDepth = d.NET_DEPTH;

  // ネット支柱の位置
  const leftPole  = courtToScreen(-1, netDepth);
  const rightPole = courtToScreen( 1, netDepth);

  // ネット上部（少し高く）
  const topY = leftPole.y - 18;

  // ネット本体（白帯）
  _ctx.strokeStyle = "#ffffff";
  _ctx.lineWidth = 3;
  _ctx.beginPath();
  _ctx.moveTo(leftPole.x, topY);
  _ctx.lineTo(rightPole.x, topY);
  _ctx.stroke();

  // ネットメッシュ（縦線）
  _ctx.strokeStyle = "rgba(180, 200, 255, 0.2)";
  _ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const cx = -1 + (2 / 8) * i;
    const pos = courtToScreen(cx, netDepth);
    _ctx.beginPath();
    _ctx.moveTo(pos.x, topY);
    _ctx.lineTo(pos.x, pos.y);
    _ctx.stroke();
  }

  // ネット下部のライン
  _ctx.strokeStyle = "rgba(180, 200, 255, 0.4)";
  _ctx.lineWidth = 1;
  _ctx.beginPath();
  _ctx.moveTo(leftPole.x, leftPole.y);
  _ctx.lineTo(rightPole.x, rightPole.y);
  _ctx.stroke();
}

/**
 * プレイヤーキャラクターを描画する。
 * 手前（cy=1.0）の位置に、state.playerX の X 位置で表示する。
 */
function _drawPlayer() {
  const state = getState();
  const pos = courtToScreen(state.playerX, 0.92);

  // 影
  _ctx.beginPath();
  _ctx.ellipse(pos.x, pos.y + 2, 16, 5, 0, 0, Math.PI * 2);
  _ctx.fillStyle = "rgba(0,0,0,0.4)";
  _ctx.fill();

  // 体（シルエット）
  _ctx.fillStyle = "#4a9fff";
  // 胴体
  _ctx.fillRect(pos.x - 9, pos.y - 28, 18, 22);
  // 頭
  _ctx.beginPath();
  _ctx.arc(pos.x, pos.y - 34, 9, 0, Math.PI * 2);
  _ctx.fill();
  // 足
  _ctx.fillStyle = "#2060cc";
  _ctx.fillRect(pos.x - 9, pos.y - 7, 8, 10);
  _ctx.fillRect(pos.x + 1, pos.y - 7, 8, 10);
}

/**
 * 相手チームのキャラクターを描画する（奥側に2体配置）。
 */
function _drawOpponents() {
  const positions = [-0.3, 0.3];
  positions.forEach((cx) => {
    const pos = courtToScreen(cx, 0.1);
    // 影
    _ctx.beginPath();
    _ctx.ellipse(pos.x, pos.y + 2, 10, 3, 0, 0, Math.PI * 2);
    _ctx.fillStyle = "rgba(0,0,0,0.3)";
    _ctx.fill();
    // 体（相手は赤系）
    _ctx.fillStyle = "#ff6060";
    _ctx.fillRect(pos.x - 6, pos.y - 18, 12, 14);
    _ctx.beginPath();
    _ctx.arc(pos.x, pos.y - 22, 6, 0, Math.PI * 2);
    _ctx.fill();
  });
}

/**
 * ボールを描画する。
 *
 * @param {number} screenX - Canvas上X
 * @param {number} screenY - Canvas上Y
 */
function _drawBall(screenX, screenY) {
  // ボールの光彩
  const glow = _ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 18);
  glow.addColorStop(0, "rgba(255, 255, 200, 0.6)");
  glow.addColorStop(1, "rgba(255, 200, 0, 0)");
  _ctx.beginPath();
  _ctx.arc(screenX, screenY, 18, 0, Math.PI * 2);
  _ctx.fillStyle = glow;
  _ctx.fill();

  // ボール本体
  _ctx.beginPath();
  _ctx.arc(screenX, screenY, 9, 0, Math.PI * 2);
  const ballGrad = _ctx.createRadialGradient(screenX - 3, screenY - 3, 1, screenX, screenY, 9);
  ballGrad.addColorStop(0, "#ffffff");
  ballGrad.addColorStop(0.4, "#ffe080");
  ballGrad.addColorStop(1, "#cc8820");
  _ctx.fillStyle = ballGrad;
  _ctx.fill();
}

/**
 * フェーズに応じた「理想ポジション」インジケーターを描画する。
 * 青い光る点で「ここに移動すると有利」を示す。
 */
function _drawPositionIndicator() {
  const idealX = _getIdealPositionX();
  const pos = courtToScreen(idealX, 0.92);

  _ctx.beginPath();
  _ctx.arc(pos.x, pos.y + 6, 5, 0, Math.PI * 2);
  _ctx.fillStyle = "rgba(80, 200, 255, 0.4)";
  _ctx.fill();
  _ctx.strokeStyle = "rgba(80, 200, 255, 0.8)";
  _ctx.lineWidth = 1.5;
  _ctx.stroke();
}

// =============================================================
// 試合の初期化・開始
// =============================================================

/**
 * 試合を初期化して開始する。
 * screens.js の openMatch から呼ばれる。
 *
 * @param {string} matchType - 試合種別（MATCH_REWARDS のキー）
 */
function initMatch(matchType) {
  _matchType = matchType;

  // --- Canvas コンテキスト取得 ---
  _canvas = document.getElementById("match-canvas");
  _ctx    = _canvas.getContext("2d");

  // --- スコアリセット ---
  _score = { mySets: 0, oppSets: 0, myPts: 0, oppPts: 0, setNum: 1 };

  // --- 対戦相手を生成 ---
  _opponent = _generateOpponent(matchType);

  // --- プレー統計リセット ---
  resetMatchStats();

  // --- AUTO モードは初期OFF ---
  _autoMode = false;
  _moveHeld = { left: false, right: false };

  // --- 最初のフェーズへ ---
  _enterPhase(MATCH_PHASE.SERVE);

  // --- ゲームループ開始 ---
  _startLoop();
}

/**
 * requestAnimationFrame ループを開始する。
 */
function _startLoop() {
  if (_rafId !== null) cancelAnimationFrame(_rafId);

  function loop() {
    // 移動ボタン押しっぱなし処理
    if (_moveHeld.left)  movePlayerX(-PLAYER_MOVE.SPEED);
    if (_moveHeld.right) movePlayerX( PLAYER_MOVE.SPEED);

    // コート描画
    drawCourt();

    _rafId = requestAnimationFrame(loop);
  }

  _rafId = requestAnimationFrame(loop);
}

/**
 * ゲームループを停止する。
 * 試合終了時または画面離脱時に呼ぶ。
 */
function stopMatchLoop() {
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  if (_phaseTimer !== null) {
    clearTimeout(_phaseTimer);
    _phaseTimer = null;
  }
}

// =============================================================
// フェーズ状態機械
// =============================================================

/**
 * 指定フェーズに移行する。
 * UI の更新（フェーズ名・コマンドボタン）も行う。
 *
 * @param {string} phase - MATCH_PHASE の値
 */
function _enterPhase(phase) {
  _phase = phase;
  _selectedCommand = null;

  // タイマーをリセット
  if (_phaseTimer !== null) {
    clearTimeout(_phaseTimer);
    _phaseTimer = null;
  }

  // UI 更新（ui.js）
  updatePhaseUI(phase);

  // ボール位置をフェーズに応じて設定
  _updateBallForPhase(phase);

  // AUTO モードの場合は自動でコマンドを選択する
  if (_autoMode && _phaseHasCommands(phase)) {
    // 少し遅延してから自動実行（演出のため）
    _phaseTimer = setTimeout(() => {
      _autoSelectCommand(phase);
    }, 600);
    return;
  }

  // タイムアウト（制限時間内に選択がなければ自動実行）
  const timeout = PHASE_TIMEOUT[phase];
  if (timeout && _phaseHasCommands(phase)) {
    _phaseTimer = setTimeout(() => {
      _autoSelectCommand(phase);
    }, timeout);
  }

  // コマンドなしフェーズ（SET, OPP_RETURN, POINT）は自動進行
  if (!_phaseHasCommands(phase)) {
    const delay = phase === MATCH_PHASE.POINT ? PHASE_TIMEOUT[MATCH_PHASE.POINT] : 900;
    _phaseTimer = setTimeout(() => {
      _resolvePhase(phase, null);
    }, delay);
  }
}

/**
 * フェーズにコマンド選択があるか判定する。
 *
 * @param {string} phase
 * @returns {boolean}
 */
function _phaseHasCommands(phase) {
  return !!(PHASE_COMMANDS[phase] && PHASE_COMMANDS[phase].length > 0);
}

/**
 * AUTO モード用：コマンドをランダムに自動選択する。
 * 成功率が高いコマンドをやや優先する。
 *
 * @param {string} phase
 */
function _autoSelectCommand(phase) {
  const commands = PHASE_COMMANDS[phase];
  if (!commands) {
    _resolvePhase(phase, null);
    return;
  }

  // successMod が高いほど選ばれやすい（重み付きランダム）
  const weights = commands.map((c) => Math.max(0.1, 0.5 + c.successMod));
  const total   = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;

  let chosen = commands[0];
  for (let i = 0; i < commands.length; i++) {
    rand -= weights[i];
    if (rand <= 0) {
      chosen = commands[i];
      break;
    }
  }

  executeCommand(chosen.id, phase);
}

/**
 * プレイヤーがコマンドを選択したときに呼ぶ（UI からのエントリーポイント）。
 *
 * @param {string} commandId - コマンドID（"straight" など）
 * @param {string} phase     - 現在のフェーズ
 */
function executeCommand(commandId, phase) {
  if (_phase !== phase) return; // フェーズが変わっていれば無視

  const commands = PHASE_COMMANDS[phase];
  if (!commands) return;

  const command = commands.find((c) => c.id === commandId);
  if (!command) return;

  _selectedCommand = commandId;

  // タイマーをキャンセル（選択済みなので不要）
  if (_phaseTimer !== null) {
    clearTimeout(_phaseTimer);
    _phaseTimer = null;
  }

  // フェーズ解決へ
  _resolvePhase(phase, command);
}

/**
 * フェーズを解決して次フェーズへ進む。
 * フェーズごとの判定ロジックはここに集約する。
 *
 * @param {string} phase          - 解決するフェーズ
 * @param {Object|null} command   - 選択されたコマンド（nullなら自動）
 */
function _resolvePhase(phase, command) {
  const state = getState();

  switch (phase) {

    // --- サーブ ---
    case MATCH_PHASE.SERVE: {
      // サーブ成功率（ability.serve ベース + コマンド補正）
      const serveAbility = (state.stats.serve || 20) / GAME_CONFIG.STAT_MAX;
      const mod          = command ? command.successMod : 0;
      const success      = Math.random() < (serveAbility * 0.6 + 0.3 + mod);

      _showOverlay(success ? "SERVE!" : "サーブミス");

      if (success) {
        // サーブ成功 → 相手のレシーブ処理（OPP_RETURN扱い）
        _phaseTimer = setTimeout(() => _enterPhase(MATCH_PHASE.OPP_RETURN), 800);
      } else {
        // サーブミス → 相手の得点
        _phaseTimer = setTimeout(() => {
          _addPoint(false);
        }, 1000);
      }
      break;
    }

    // --- レシーブ ---
    case MATCH_PHASE.RECEIVE: {
      const receiveAbility = (state.stats.receive || 20) / GAME_CONFIG.STAT_MAX;
      const posBonus       = _calcPositioningBonus();
      const mod            = command ? command.successMod : 0;
      const successRate    = Math.min(0.95, receiveAbility * 0.55 + 0.2 + mod + posBonus);
      const success        = Math.random() < successRate;

      recordReceive(success);
      _showOverlay(success ? "RECEIVE!" : "レシーブ失敗");

      if (success) {
        _phaseTimer = setTimeout(() => _enterPhase(MATCH_PHASE.SET), 700);
      } else {
        _phaseTimer = setTimeout(() => {
          _addPoint(false);
        }, 1000);
      }
      break;
    }

    // --- セット（自動処理）---
    case MATCH_PHASE.SET: {
      const tossAbility = (state.stats.toss || 20) / GAME_CONFIG.STAT_MAX;
      const success     = Math.random() < (tossAbility * 0.5 + 0.45);

      _showOverlay(success ? "SET!" : "トスミス");

      if (success) {
        _phaseTimer = setTimeout(() => _enterPhase(MATCH_PHASE.ATTACK), 700);
      } else {
        // トスミス → 相手得点
        _phaseTimer = setTimeout(() => {
          _addPoint(false);
        }, 1000);
      }
      break;
    }

    // --- アタック ---
    case MATCH_PHASE.ATTACK: {
      const spikeAbility = (state.stats.spike || 20) / GAME_CONFIG.STAT_MAX;
      const jumpAbility  = (state.stats.jump  || 20) / GAME_CONFIG.STAT_MAX;
      const posBonus     = _calcPositioningBonus();
      const mod          = command ? command.successMod : 0;
      const successRate  = Math.min(0.92, (spikeAbility * 0.5 + jumpAbility * 0.2) + 0.15 + mod + posBonus);
      const success      = Math.random() < successRate;

      recordSpike(success);
      _showOverlay(success ? "SPIKE!" : "ブロック");

      if (success) {
        _phaseTimer = setTimeout(() => _addPoint(true), 700);
      } else {
        // ブロックされた → 相手の攻撃フェーズ（OPP_RETURN）へ
        _phaseTimer = setTimeout(() => _enterPhase(MATCH_PHASE.OPP_RETURN), 800);
      }
      break;
    }

    // --- 相手の攻撃（自動処理）---
    case MATCH_PHASE.OPP_RETURN: {
      // 相手の攻撃力 vs 自分の守備力で勝敗を決める
      const oppAttackRate  = (_opponent.attack  / GAME_CONFIG.STAT_MAX) * 0.6;
      const myDefenseRate  = (state.stats.receive || 20) / GAME_CONFIG.STAT_MAX * 0.4
                           + (state.stats.block   || 20) / GAME_CONFIG.STAT_MAX * 0.2;
      const oppScores      = Math.random() < Math.max(0.2, oppAttackRate - myDefenseRate + 0.3);

      _showOverlay(oppScores ? "被スパイク" : "ブロック成功");

      if (oppScores) {
        _phaseTimer = setTimeout(() => _addPoint(false), 800);
      } else {
        // 相手のスパイクをブロック → 自分の攻撃へ
        _phaseTimer = setTimeout(() => _enterPhase(MATCH_PHASE.RECEIVE), 800);
      }
      break;
    }

    // --- POINT（ポイント確定・次ラリーへ）---
    case MATCH_PHASE.POINT: {
      // このフェーズは _addPoint から呼ばれるため、ここでは何もしない
      break;
    }
  }
}

// =============================================================
// 得点・セット・試合の管理
// =============================================================

/**
 * 1ポイントを加算し、セット・試合終了を判定する。
 *
 * @param {boolean} myPoint - true なら自チームの得点
 */
function _addPoint(myPoint) {
  // フェーズオーバーレイを非表示
  _hideOverlay();

  if (myPoint) {
    _score.myPts++;
  } else {
    _score.oppPts++;
  }

  // スコア表示を更新
  updateScoreUI(_score);

  // --- セット終了判定 ---
  const target  = MATCH_CONFIG.POINTS_PER_SET;
  const minDiff = MATCH_CONFIG.DEUCE_MIN_DIFF;

  const setOver =
    (_score.myPts >= target || _score.oppPts >= target) &&
    Math.abs(_score.myPts - _score.oppPts) >= minDiff;

  if (setOver) {
    const myWonSet = _score.myPts > _score.oppPts;
    if (myWonSet) {
      _score.mySets++;
    } else {
      _score.oppSets++;
    }

    updateScoreUI(_score);

    // --- 試合終了判定 ---
    if (_score.mySets >= MATCH_CONFIG.SETS_TO_WIN || _score.oppSets >= MATCH_CONFIG.SETS_TO_WIN) {
      _phaseTimer = setTimeout(() => _endMatch(), 1200);
    } else {
      // 次のセットへ
      _score.myPts  = 0;
      _score.oppPts = 0;
      _score.setNum++;
      updateScoreUI(_score);
      _phaseTimer = setTimeout(() => _enterPhase(MATCH_PHASE.SERVE), 1500);
    }
    return;
  }

  // --- 次ラリーへ ---
  // 得点した側がサーブ権を持つ（バレーボールのラリーポイント制）
  _phaseTimer = setTimeout(() => {
    if (myPoint) {
      _enterPhase(MATCH_PHASE.SERVE);
    } else {
      // 相手サーブ → 自分はレシーブから
      _enterPhase(MATCH_PHASE.RECEIVE);
    }
  }, PHASE_TIMEOUT[MATCH_PHASE.POINT]);
}

/**
 * 試合を終了してリザルト画面へ遷移する。
 */
function _endMatch() {
  stopMatchLoop();

  const win        = _score.mySets >= MATCH_CONFIG.SETS_TO_WIN;
  const scoreText  = `${_score.mySets}-${_score.oppSets}`;
  const state      = getState();

  // MVP 判定（勝利かつ全セット勝ち かつ スパイク成功率 >= 60%）
  const spikeRate =
    state.currentMatchStats.spikeAttempts > 0
      ? state.currentMatchStats.spikeSuccess / state.currentMatchStats.spikeAttempts
      : 0;
  const mvp = win && _score.oppSets === 0 && spikeRate >= 0.6;

  // 試合結果を state に記録
  recordMatchResult({
    win,
    matchType: _matchType,
    opponentName: _opponent.name,
    score: scoreText,
    mvp,
  });

  // 報酬計算（economy.js）
  const rewards = calcMatchRewards(_matchType, win, mvp);

  // ファン変動
  const fanKey = win
    ? `win_${_matchType}`
    : "lose";
  const fanDelta = (FAN_CHANGE[fanKey] || 0) + (mvp ? FAN_CHANGE.mvp_bonus : 0);
  changeFans(fanDelta);

  // グレード計算
  const grade = _calcGrade(win, spikeRate, state.currentMatchStats);

  // リザルト画面へ
  openResult({
    win,
    opponent: _opponent,
    scoreText,
    mvp,
    grade,
    rewards,
    matchStats: { ...state.currentMatchStats },
  });
}

// =============================================================
// グレード・補助計算
// =============================================================

/**
 * 試合のグレードを計算する。
 * 勝敗・スパイク成功率・レシーブ成功率・得点貢献で採点する。
 *
 * @param {boolean} win     - 試合勝利したか
 * @param {number}  spikeRate - スパイク成功率（0〜1）
 * @param {Object}  stats   - currentMatchStats
 * @returns {{ grade: string, color: string, message: string }}
 */
function _calcGrade(win, spikeRate, stats) {
  let score = 0;

  // 勝敗（50点満点）
  score += win ? 50 : 10;

  // スパイク成功率（25点満点）
  score += spikeRate * 25;

  // レシーブ成功率（15点満点）
  const receiveRate =
    stats.receiveAttempts > 0
      ? stats.receiveSuccess / stats.receiveAttempts
      : 0;
  score += receiveRate * 15;

  // 得点貢献（10点満点、最大10点）
  score += Math.min(10, stats.pointContrib);

  // GRADE_TABLE からグレードを決定する（minScore降順で最初にマッチしたもの）
  const entry = GRADE_TABLE.find((g) => score >= g.minScore);
  return entry || GRADE_TABLE[GRADE_TABLE.length - 1];
}

/**
 * プレイヤーの現在位置と理想位置の差からポジションボーナスを計算する。
 * 理想位置に近いほど成功率が上がる。
 *
 * @returns {number} ボーナス値（-0.1 〜 +0.1）
 */
function _calcPositioningBonus() {
  const state  = getState();
  const idealX = _getIdealPositionX();
  const dist   = Math.abs(state.playerX - idealX);

  if (dist < PLAYER_MOVE.IDEAL_TOL) {
    return 0.10; // 理想位置に近い → ボーナス
  } else if (dist < PLAYER_MOVE.IDEAL_TOL * 2) {
    return 0;    // 普通
  } else {
    return -0.10; // 遠い → ペナルティ
  }
}

/**
 * 現在フェーズの「理想ポジションX」を返す。
 * フェーズ・コマンドによって変わる（例：クロスなら左端が有利）。
 *
 * @returns {number} -1.0 〜 +1.0
 */
function _getIdealPositionX() {
  switch (_phase) {
    case MATCH_PHASE.RECEIVE:
    case MATCH_PHASE.OPP_RETURN:
      // 相手の攻撃に備えて中央
      return 0;
    case MATCH_PHASE.ATTACK:
      // コマンドに応じてポジションが変わる
      if (_selectedCommand === "cross")    return -0.6;
      if (_selectedCommand === "straight") return  0.6;
      return 0;
    default:
      return 0;
  }
}

// =============================================================
// 対戦相手の生成
// =============================================================

/**
 * 対戦相手を生成する。
 * OPPONENT_TABLE から試合種別に応じた強さ範囲でランダム生成する。
 *
 * @param {string} matchType
 * @returns {{ name: string, attack: number, defense: number }}
 */
function _generateOpponent(matchType) {
  const table = OPPONENT_TABLE[matchType];
  if (!table) {
    return { name: "対戦相手", attack: 30, defense: 30 };
  }

  const name    = table.names[Math.floor(Math.random() * table.names.length)];
  const attack  = _randInt(table.attackMin,  table.attackMax);
  const defense = _randInt(table.defenseMin, table.defenseMax);

  return { name, attack, defense };
}

// =============================================================
// Canvas UI ヘルパー（フェーズオーバーレイ）
// =============================================================

/**
 * フェーズ名オーバーレイを一時表示する。
 *
 * @param {string} text - 表示テキスト
 */
function _showOverlay(text) {
  const overlay = document.getElementById("phase-overlay");
  const label   = document.getElementById("phase-overlay-text");
  if (!overlay || !label) return;

  label.textContent = text;
  overlay.style.display = "block";
  _overlayVisible = true;

  // アニメーション終了後に非表示
  setTimeout(() => _hideOverlay(), 800);
}

/**
 * フェーズ名オーバーレイを非表示にする。
 */
function _hideOverlay() {
  const overlay = document.getElementById("phase-overlay");
  if (overlay) overlay.style.display = "none";
  _overlayVisible = false;
}

// =============================================================
// ボール位置のアニメーション更新
// =============================================================

/**
 * フェーズに応じてボールのCanvas位置を更新する。
 *
 * @param {string} phase
 */
function _updateBallForPhase(phase) {
  const d = COURT_DRAW;

  switch (phase) {
    case MATCH_PHASE.SERVE:
      _ball = { x: d.VP_X, y: d.FAR_Y + 50, visible: true };
      break;
    case MATCH_PHASE.RECEIVE: {
      // 相手コートから飛んでくる → 手前のランダム位置
      const rx = d.VP_X + (_randInt(-200, 200));
      _ball = { x: rx, y: d.NEAR_Y - 60, visible: true };
      break;
    }
    case MATCH_PHASE.SET:
      _ball = { x: d.VP_X, y: d.FAR_Y + 120, visible: true };
      break;
    case MATCH_PHASE.ATTACK:
      _ball = { x: d.VP_X, y: d.FAR_Y + 80, visible: true };
      break;
    case MATCH_PHASE.OPP_RETURN:
      _ball = { x: d.VP_X, y: d.FAR_Y + 60, visible: true };
      break;
    case MATCH_PHASE.POINT:
      _ball.visible = false;
      break;
    default:
      _ball.visible = false;
  }
}

// =============================================================
// AUTO モードの切り替え
// =============================================================

/**
 * AUTO モードをトグルする。
 * screens.js またはメインのボタンから呼ばれる。
 *
 * @returns {boolean} 変更後の AUTO 状態
 */
function toggleAutoMode() {
  _autoMode = !_autoMode;
  return _autoMode;
}

/**
 * 現在の AUTO モード状態を返す。
 *
 * @returns {boolean}
 */
function isAutoMode() {
  return _autoMode;
}

// =============================================================
// 移動ボタンのホールド状態管理
// =============================================================

/**
 * 移動ボタンのホールドを開始する（pointerdown）。
 *
 * @param {"left"|"right"} dir - 移動方向
 */
function startMove(dir) {
  _moveHeld[dir] = true;
}

/**
 * 移動ボタンのホールドを終了する（pointerup / pointerleave）。
 *
 * @param {"left"|"right"} dir - 移動方向
 */
function stopMove(dir) {
  _moveHeld[dir] = false;
}

// =============================================================
// 現在フェーズの公開
// =============================================================

/**
 * 現在のラリーフェーズを返す。
 * ui.js からコマンドボタン生成時に参照する。
 *
 * @returns {string} MATCH_PHASE の値
 */
function getCurrentPhase() {
  return _phase;
}

/**
 * 現在のスコアを返す。
 *
 * @returns {{ mySets, oppSets, myPts, oppPts, setNum }}
 */
function getCurrentScore() {
  return { ..._score };
}

/**
 * 現在の対戦相手を返す。
 *
 * @returns {{ name, attack, defense }|null}
 */
function getCurrentOpponent() {
  return _opponent;
}

// =============================================================
// 内部ユーティリティ
// =============================================================

/**
 * min 以上 max 以下の整数をランダムに返す。
 *
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function _randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
