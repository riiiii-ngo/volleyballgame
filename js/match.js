/**
 * match.js
 * インタラクティブな試合エンジン。
 *
 * フェーズフロー（ラリー内）:
 *   プレイヤーサーブ時: SERVE → [相手受け自動] → BLOCK または AUTO_RALLY
 *   相手サーブ時:       RECEIVE → TOSS → SPIKE → [BLOCK or AUTO_RALLY]
 *   BLOCK(ソフト) 後:   AUTO_RALLY
 *   POINT 後:           次ラリー開始
 *
 * 公開 API:
 *   startMatch(scheduleEntry, opponentEntry, opponentName)
 *   stopMatch()
 *   executeCommand(cmdId)
 *   setMoveLeft(active) / setMoveRight(active)
 *   toggleAutoMode() / isAutoMode()
 *   getMatchPhase() / getScore()
 *
 * 設計方針:
 *   - Canvas 2.5D 透視投影（COURT_DRAW 定数を使用）
 *   - プレイヤー入力は executeCommand / setMoveLeft / setMoveRight の 3 つだけ
 *   - 計算結果は state.js へ記録し、試合終了時に career.js processMatchEnd() を呼ぶ
 */

// ============================================================
// モジュール変数
// ============================================================

let _canvas  = null;
let _ctx     = null;
let _rafId   = null;

let _matchActive = false;
let _autoMode    = false;

// スコア
let _score = {
  playerSets:     0,
  opponentSets:   0,
  playerPoints:   0,
  opponentPoints: 0,
};

// 現在のフェーズ
let _phase = null;

// サーブ権（true = プレイヤーチーム）
let _playerServes = true;

// 対戦相手情報
let _opponentName    = "";
let _opponentAttack  = 50;
let _opponentDefense = 50;

// 試合メタ情報
let _scheduleEntry = null;

// ブロッカー配置（SPIKE フェーズ表示用）: -1〜+1 の配列
let _blockerPositions = [];

// ボール（Canvasピクセル座標）
let _ball = { x: 400, y: 300, visible: false };

// ボールアニメーション定義
let _ballAnim = null;
// { sx, sy, ex, ey, startTime, duration, arcH }

// フェーズタイマー
let _phaseTimer = null;

// 移動フラグ（main.js の pointerdown/up で制御）
let _moveLeft  = false;
let _moveRight = false;

// RECEIVE / BLOCK フェーズでの理想X位置（-1〜+1）
let _idealX = 0;

// 位置ボーナス（毎フレーム更新 -0.15〜+0.12）
let _positionBonus = 0;

// フェーズ内演出テキスト（POINT 時など）
let _phaseText = "";

// ============================================================
// 公開 API
// ============================================================

/**
 * 試合を開始する。
 *
 * @param {Object} scheduleEntry - MATCH_SCHEDULE のエントリ
 * @param {Object} opponentEntry - OPPONENT_TABLE[matchType] のエントリ
 * @param {string} opponentName  - 対戦相手名（表示用）
 */
function startMatch(scheduleEntry, opponentEntry, opponentName) {
  _canvas = document.getElementById("match-canvas");
  _ctx    = _canvas.getContext("2d");

  _scheduleEntry   = scheduleEntry;
  _opponentName    = opponentName;
  _opponentAttack  = _randInt(opponentEntry.attackMin,  opponentEntry.attackMax);
  _opponentDefense = _randInt(opponentEntry.defenseMin, opponentEntry.defenseMax);

  _score        = { playerSets: 0, opponentSets: 0, playerPoints: 0, opponentPoints: 0 };
  _phase        = null;
  _playerServes = true;
  _matchActive  = true;
  _autoMode     = false;
  _ball.visible = false;
  _ball.x       = COURT_DRAW.VP_X;
  _ball.y       = COURT_DRAW.FAR_Y + 30;
  _phaseText    = "";

  resetMatchStats(); // state.js

  // ゲームループ開始
  _rafId = requestAnimationFrame(_gameLoop);

  // 最初のラリー（少し遅らせてCanvasを先に描く）
  setTimeout(_startNewRally, 400);
}

/**
 * 試合を停止する。
 */
function stopMatch() {
  _matchActive = false;
  _clearPhaseTimer();
  if (_rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}

/**
 * コマンドボタンが押されたときに呼ぶ。
 *
 * @param {string} cmdId
 */
function executeCommand(cmdId) {
  if (!_matchActive || !_phase) return;
  if (_autoMode) return;

  const interactive = [MATCH_PHASE.SERVE, MATCH_PHASE.RECEIVE, MATCH_PHASE.SPIKE, MATCH_PHASE.BLOCK];
  if (!interactive.includes(_phase)) return;

  _clearPhaseTimer();
  _resolvePhase(cmdId);
}

/** ← キー押下状態を設定する */
function setMoveLeft(active)  { _moveLeft  = active; }

/** → キー押下状態を設定する */
function setMoveRight(active) { _moveRight = active; }

/**
 * AUTOモードを切り替える。
 * @returns {boolean} 切り替え後の状態
 */
function toggleAutoMode() {
  _autoMode = !_autoMode;
  return _autoMode;
}

function isAutoMode()    { return _autoMode; }
function getMatchPhase() { return _phase; }
function getScore()      { return { ..._score }; }

// ============================================================
// フェーズ制御
// ============================================================

/**
 * 新しいラリーを開始する。
 */
function _startNewRally() {
  if (!_matchActive) return;
  _blockerPositions = [];
  _idealX           = 0;
  _positionBonus    = 0;
  _phaseText        = "";
  _moveLeft         = false;
  _moveRight        = false;
  getState().playerX = 0;

  _startPhase(_playerServes ? MATCH_PHASE.SERVE : MATCH_PHASE.RECEIVE);
}

/**
 * 指定フェーズへ遷移する。
 *
 * @param {string} phase - MATCH_PHASE の値
 */
function _startPhase(phase) {
  if (!_matchActive) return;
  _phase = phase;

  updatePhaseUI(phase);          // ui.js
  updateScoreUI(_scoreForUI());  // ui.js

  const timeout = PHASE_TIMEOUT[phase];

  if (phase === MATCH_PHASE.TOSS || phase === MATCH_PHASE.AUTO_RALLY || phase === MATCH_PHASE.POINT) {
    // 自動フェーズ：プレイヤー入力なし
    _phaseTimer = setTimeout(() => _handleAutoPhase(phase), timeout);
  } else {
    // インタラクティブフェーズ
    if (_autoMode) {
      _phaseTimer = setTimeout(() => _autoSelectCommand(phase), 700);
    } else {
      _phaseTimer = setTimeout(() => _autoSelectCommand(phase), timeout);
    }
  }
}

function _clearPhaseTimer() {
  if (_phaseTimer) {
    clearTimeout(_phaseTimer);
    _phaseTimer = null;
  }
}

/**
 * 自動フェーズ（TOSS / AUTO_RALLY / POINT）の処理。
 */
function _handleAutoPhase(phase) {
  if (!_matchActive) return;

  if (phase === MATCH_PHASE.TOSS) {
    // トス完了 → スパイクへ
    _setupBlockers();
    _startPhase(MATCH_PHASE.SPIKE);

  } else if (phase === MATCH_PHASE.AUTO_RALLY) {
    // 自動ラリー結果
    const playerWins = _calcAutoRallySuccess();
    _phaseText = playerWins ? "ラリー制した！" : "ラリー取られた…";
    _scorePoint(playerWins);

  } else if (phase === MATCH_PHASE.POINT) {
    _startNewRally();
  }
}

/**
 * AUTOモード / タイムアウト時の自動コマンド選択。
 */
function _autoSelectCommand(phase) {
  if (!_matchActive) return;
  const cmds = PHASE_COMMANDS[phase];
  if (!cmds || cmds.length === 0) return;

  const cmdId = _autoMode
    ? _pickBestCommand(phase)
    : cmds[0].id;

  _resolvePhase(cmdId);
}

/**
 * フェーズのコマンドを解決し、結果に応じて次フェーズへ遷移する。
 *
 * @param {string} cmdId
 */
function _resolvePhase(cmdId) {
  if (!_matchActive) return;
  const phase = _phase;

  // --- SERVE ---
  if (phase === MATCH_PHASE.SERVE) {
    const success = _calcServeSuccess(cmdId);
    _ball.visible = true;
    _animateBall(
      COURT_DRAW.VP_X, COURT_DRAW.NEAR_Y - 50,
      COURT_DRAW.VP_X + _randFloat(-80, 80), COURT_DRAW.FAR_Y + 20,
      850, -70
    );

    if (!success) {
      _phaseText = "サーブミス！";
      _phaseTimer = setTimeout(() => _scorePoint(false), 900);
      return;
    }

    // サーブ成功後の展開を決定する
    _phaseTimer = setTimeout(() => {
      if (!_matchActive) return;
      const roll = Math.random();
      if (roll < 0.22) {
        // サービスエース
        _phaseText = "サービスエース！";
        _scorePoint(true);
      } else if (roll < 0.55) {
        // 相手が反撃 → プレイヤーがブロック
        _idealX = _randFloat(-0.7, 0.7);
        _startPhase(MATCH_PHASE.BLOCK);
      } else {
        // 長いラリーへ
        _startPhase(MATCH_PHASE.AUTO_RALLY);
      }
    }, 900);
  }

  // --- RECEIVE ---
  else if (phase === MATCH_PHASE.RECEIVE) {
    const cmd = PHASE_COMMANDS[MATCH_PHASE.RECEIVE].find((c) => c.id === cmdId);

    if (cmd && cmd.id === "avoid") {
      // 避ける → レシーブしない → 相手得点
      _phaseText = "ボールを避けた";
      _phaseTimer = setTimeout(() => _scorePoint(false), 400);
      return;
    }

    const success = _calcReceiveSuccess(cmdId);
    recordReceive(success); // state.js

    if (success) {
      _phaseText = "レシーブ成功！";
      _animateBall(
        COURT_DRAW.VP_X + getState().playerX * COURT_DRAW.NEAR_HALF_W,
        COURT_DRAW.NEAR_Y - 30,
        COURT_DRAW.VP_X, (COURT_DRAW.NEAR_Y + COURT_DRAW.FAR_Y) / 2,
        600, -45
      );
      _phaseTimer = setTimeout(() => _startPhase(MATCH_PHASE.TOSS), 650);
    } else {
      _phaseText = "レシーブ失敗…";
      _phaseTimer = setTimeout(() => _scorePoint(false), 600);
    }
  }

  // --- SPIKE ---
  else if (phase === MATCH_PHASE.SPIKE) {
    const success = _calcSpikeSuccess(cmdId);
    recordSpike(success); // state.js

    const st = getState();
    _animateBall(
      COURT_DRAW.VP_X + st.playerX * COURT_DRAW.NEAR_HALF_W * 0.5,
      (COURT_DRAW.NEAR_Y + COURT_DRAW.FAR_Y) / 2,
      COURT_DRAW.VP_X + _randFloat(-100, 100), COURT_DRAW.FAR_Y + 15,
      700, success ? -25 : 20
    );

    if (success) {
      _phaseText = "スパイク決まった！";
      _phaseTimer = setTimeout(() => _scorePoint(true), 750);
    } else {
      // スパイクがカットされた
      _phaseText = "スパイク返された！";
      _phaseTimer = setTimeout(() => {
        if (!_matchActive) return;
        if (Math.random() < 0.55) {
          _idealX = _randFloat(-0.7, 0.7);
          _startPhase(MATCH_PHASE.BLOCK);
        } else {
          _startPhase(MATCH_PHASE.AUTO_RALLY);
        }
      }, 750);
    }
  }

  // --- BLOCK ---
  else if (phase === MATCH_PHASE.BLOCK) {
    const success = _calcBlockSuccess(cmdId);
    recordBlock(success); // state.js

    if (cmdId === "kill") {
      if (success) {
        _phaseText = "キルブロック！";
        _animateBall(
          COURT_DRAW.VP_X + getState().playerX * COURT_DRAW.NEAR_HALF_W,
          (COURT_DRAW.NEAR_Y + COURT_DRAW.FAR_Y) / 2,
          COURT_DRAW.VP_X + _randFloat(-120, 120), COURT_DRAW.FAR_Y + 10,
          500, -20
        );
        _phaseTimer = setTimeout(() => _scorePoint(true), 600);
      } else {
        _phaseText = "ブロック外した…";
        _phaseTimer = setTimeout(() => _scorePoint(false), 600);
      }
    } else if (cmdId === "soft") {
      _phaseText = "ソフトブロック、つなぐ！";
      _phaseTimer = setTimeout(() => _startPhase(MATCH_PHASE.AUTO_RALLY), 600);
    } else {
      // avoid
      if (Math.random() < 0.28) {
        _phaseText = "うまく回避した！";
        _phaseTimer = setTimeout(() => _startPhase(MATCH_PHASE.AUTO_RALLY), 600);
      } else {
        _phaseText = "避けて失点…";
        _phaseTimer = setTimeout(() => _scorePoint(false), 600);
      }
    }
  }
}

// ============================================================
// 得点・セット管理
// ============================================================

/**
 * 1点を記録し、セット/試合終了を確認する。
 *
 * @param {boolean} playerScored
 */
function _scorePoint(playerScored) {
  if (!_matchActive) return;

  if (playerScored) {
    _score.playerPoints++;
    _playerServes = true;
  } else {
    _score.opponentPoints++;
    _playerServes = false;
  }

  updateScoreUI(_scoreForUI()); // ui.js

  if (_checkSetOver()) return;

  _phaseTimer = setTimeout(() => _startPhase(MATCH_PHASE.POINT), 100);
}

/**
 * セット終了条件をチェックし、終了していれば次セットまたは試合終了へ。
 *
 * @returns {boolean} セットが終了した場合 true
 */
function _checkSetOver() {
  const pp  = _score.playerPoints;
  const op  = _score.opponentPoints;
  const max = MATCH_CONFIG.POINTS_PER_SET;
  const diff = MATCH_CONFIG.DEUCE_MIN_DIFF;

  let winner = null;
  if (pp >= max && pp - op >= diff) winner = "player";
  if (op >= max && op - pp >= diff) winner = "opponent";
  if (!winner) return false;

  if (winner === "player") _score.playerSets++;
  else                     _score.opponentSets++;

  _score.playerPoints  = 0;
  _score.opponentPoints = 0;
  updateScoreUI(_scoreForUI());

  // 試合終了チェック
  if (_score.playerSets  >= MATCH_CONFIG.SETS_TO_WIN ||
      _score.opponentSets >= MATCH_CONFIG.SETS_TO_WIN) {
    _clearPhaseTimer();
    _phaseTimer = setTimeout(_endMatch, 1800);
    return true;
  }

  // 次セット
  _phaseText = winner === "player" ? "セット獲得！" : "セット落とした…";
  _phaseTimer = setTimeout(_startNewRally, 2000);
  return true;
}

/**
 * 試合を終了して result 画面へ遷移する。
 */
function _endMatch() {
  if (!_matchActive) return;
  stopMatch();

  const win = _score.playerSets >= MATCH_CONFIG.SETS_TO_WIN;
  const st  = getState();
  const cs  = st.currentMatchStats;

  // MVP 判定（勝利 + プレー貢献3点以上）
  const mvp = win && cs.pointContrib >= 3;

  const matchStats = {
    spikeAttempts:   cs.spikeAttempts,
    spikeSuccess:    cs.spikeSuccess,
    receiveAttempts: cs.receiveAttempts,
    receiveSuccess:  cs.receiveSuccess,
    blockAttempts:   cs.blockAttempts,
    blockSuccess:    cs.blockSuccess,
    pointContrib:    cs.pointContrib,
  };

  const matchResult = {
    win,
    mvp,
    matchType:    _scheduleEntry.matchType,
    label:        _scheduleEntry.label,
    opponentName: _opponentName,
    scoreText:    `${_score.playerSets} - ${_score.opponentSets}`,
    matchStats,
  };

  // career.js で評価・報酬・移籍チェック
  const careerResult = processMatchEnd(matchResult);

  // リザルト画面へ渡すオブジェクトを組み立てる
  const resultForScreen = {
    ...matchResult,
    evalGain:   careerResult.evalGain,
    rewards:    careerResult.rewards,
    newOffers:  careerResult.newOffers,
    isEnding:   careerResult.isEnding,
    endingId:   careerResult.endingId,
  };

  // screens.js へ
  openResult(resultForScreen);
}

// ============================================================
// 成功率計算
// ============================================================

function _calcServeSuccess(cmdId) {
  const cmd = PHASE_COMMANDS[MATCH_PHASE.SERVE].find((c) => c.id === cmdId);
  const mod = cmd ? cmd.successMod : 0;
  const st  = getState();
  const base = 0.55 + (st.stats.serve / 100) * 0.28 + mod;
  return Math.random() < _clamp(base, 0.15, 0.95);
}

function _calcReceiveSuccess(cmdId) {
  const cmd  = PHASE_COMMANDS[MATCH_PHASE.RECEIVE].find((c) => c.id === cmdId);
  const mod  = cmd ? cmd.successMod : 0;
  const st   = getState();
  const base = 0.50
    + (st.stats.receive / 100) * 0.28
    + (st.stats.speed   / 100) * 0.10
    + mod
    + _positionBonus;
  return Math.random() < _clamp(base, 0.08, 0.94);
}

function _calcSpikeSuccess(cmdId) {
  const cmd = PHASE_COMMANDS[MATCH_PHASE.SPIKE].find((c) => c.id === cmdId);
  const mod = cmd ? cmd.successMod : 0;
  const st  = getState();

  // 自分のX位置がブロッカーと重なっているとペナルティ
  const px = st.playerX;
  const onBlocker = _blockerPositions.some((bx) => Math.abs(bx - px) < 0.22);
  const blockerMod = onBlocker ? -0.18 : 0.08;

  const atkPower = (
    st.stats.spike    * MATCH_CONFIG.ATTACK_SPIKE_WEIGHT +
    st.stats.strength * MATCH_CONFIG.ATTACK_STRENGTH_WEIGHT +
    st.stats.jump     * MATCH_CONFIG.ATTACK_JUMP_WEIGHT
  ) / (MATCH_CONFIG.ATTACK_SPIKE_WEIGHT + MATCH_CONFIG.ATTACK_STRENGTH_WEIGHT + MATCH_CONFIG.ATTACK_JUMP_WEIGHT);

  const base = 0.40
    + (atkPower         / 100) * 0.32
    - (_opponentDefense / 100) * 0.18
    + mod + blockerMod;
  return Math.random() < _clamp(base, 0.08, 0.92);
}

function _calcBlockSuccess(cmdId) {
  const cmd = PHASE_COMMANDS[MATCH_PHASE.BLOCK].find((c) => c.id === cmdId);
  const mod = cmd ? cmd.successMod : 0;
  const st  = getState();

  const defPower = (
    st.stats.block * MATCH_CONFIG.DEFENSE_BLOCK_WEIGHT +
    st.stats.speed * MATCH_CONFIG.DEFENSE_SPEED_WEIGHT
  ) / (MATCH_CONFIG.DEFENSE_BLOCK_WEIGHT + MATCH_CONFIG.DEFENSE_SPEED_WEIGHT);

  const base = 0.35
    + (defPower         / 100) * 0.38
    - (_opponentAttack  / 100) * 0.18
    + mod
    + _positionBonus;
  return Math.random() < _clamp(base, 0.05, 0.90);
}

function _calcAutoRallySuccess() {
  const st = getState();
  const playerPower = (
    st.stats.spike   * 0.35 +
    st.stats.receive * 0.30 +
    st.stats.block   * 0.15 +
    st.stats.speed   * 0.20
  );
  const oppPower = (_opponentAttack + _opponentDefense) / 2;
  const base = 0.45
    + (playerPower / 100) * 0.28
    - (oppPower    / 100) * 0.18;
  return Math.random() < _clamp(base, 0.18, 0.82);
}

/**
 * AUTOモード用：successMod が最高のコマンドを選ぶ。
 */
function _pickBestCommand(phase) {
  const cmds = PHASE_COMMANDS[phase];
  if (!cmds || cmds.length === 0) return null;
  return cmds.reduce((best, c) => c.successMod > best.successMod ? c : best, cmds[0]).id;
}

// ============================================================
// ブロッカー配置
// ============================================================

function _setupBlockers() {
  _blockerPositions = [];
  const count = _randInt(1, 3);
  const pool  = [-0.55, -0.25, 0.0, 0.25, 0.55, -0.75, 0.75];
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < count; i++) {
    _blockerPositions.push(shuffled[i]);
  }
}

// ============================================================
// ボールアニメーション
// ============================================================

/**
 * ボールアニメーションを設定する。
 *
 * @param {number} sx, sy - 開始ピクセル座標
 * @param {number} ex, ey - 終了ピクセル座標
 * @param {number} duration - ミリ秒
 * @param {number} arcH  - 弧の高さ（負で上に凸）
 */
function _animateBall(sx, sy, ex, ey, duration, arcH) {
  _ball.visible = true;
  _ballAnim = {
    sx, sy, ex, ey,
    startTime: performance.now(),
    duration,
    arcH: arcH || -50,
  };
}

// ============================================================
// ゲームループ・Canvas 描画
// ============================================================

function _gameLoop(timestamp) {
  if (!_matchActive || !_ctx) return;

  const st = getState();

  // ── プレイヤー移動 ──
  if (_phase === MATCH_PHASE.RECEIVE || _phase === MATCH_PHASE.BLOCK) {
    if (_moveLeft)  movePlayerX(-PLAYER_MOVE.SPEED); // state.js
    if (_moveRight) movePlayerX( PLAYER_MOVE.SPEED);

    const dist = Math.abs(st.playerX - _idealX);
    _positionBonus = dist < PLAYER_MOVE.IDEAL_TOL ? 0.12 : -0.08;
  }

  // ── 描画 ──
  _ctx.clearRect(0, 0, COURT_DRAW.CANVAS_W, COURT_DRAW.CANVAS_H);
  _renderCourt();
  _renderOpponentPlayers();

  if (_phase === MATCH_PHASE.SPIKE) {
    _renderBlockers();
  }

  _renderPlayer(st.playerX);
  _renderBall(timestamp);
  _renderOverlayText();

  _rafId = requestAnimationFrame(_gameLoop);
}

// ============================================================
// コート描画
// ============================================================

/**
 * 2.5D 透視投影コートを描画する。
 * 手前（NEAR_Y）がプレイヤー側、奥（FAR_Y）が相手側。
 */
function _renderCourt() {
  const c   = COURT_DRAW;
  const ctx = _ctx;

  // ── アリーナ背景 ──
  const bg = ctx.createLinearGradient(0, 0, 0, c.CANVAS_H);
  bg.addColorStop(0, "#0d1b2a");
  bg.addColorStop(1, "#1a2a3a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.CANVAS_W, c.CANVAS_H);

  // 客席エリア（台形の外側）
  ctx.fillStyle = "#1c2d40";
  ctx.fillRect(0, 0, c.CANVAS_W, c.FAR_Y + 10);

  // 観客ライト効果（上部グロー）
  const glow = ctx.createRadialGradient(c.VP_X, c.VP_Y, 0, c.VP_X, c.VP_Y, 260);
  glow.addColorStop(0, "rgba(200,200,255,0.10)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, c.CANVAS_W, c.CANVAS_H);

  // ── コート床（台形）──
  ctx.beginPath();
  ctx.moveTo(c.VP_X - c.FAR_HALF_W,  c.FAR_Y);
  ctx.lineTo(c.VP_X + c.FAR_HALF_W,  c.FAR_Y);
  ctx.lineTo(c.VP_X + c.NEAR_HALF_W, c.NEAR_Y);
  ctx.lineTo(c.VP_X - c.NEAR_HALF_W, c.NEAR_Y);
  ctx.closePath();
  const floor = ctx.createLinearGradient(0, c.FAR_Y, 0, c.NEAR_Y);
  floor.addColorStop(0, "#1a5580");
  floor.addColorStop(1, "#0e3a5c");
  ctx.fillStyle = floor;
  ctx.fill();

  // ── コートライン ──
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth   = 1.5;

  // 奥エンドライン
  _line(c.VP_X - c.FAR_HALF_W,  c.FAR_Y,  c.VP_X + c.FAR_HALF_W,  c.FAR_Y);
  // 手前エンドライン
  _line(c.VP_X - c.NEAR_HALF_W, c.NEAR_Y, c.VP_X + c.NEAR_HALF_W, c.NEAR_Y);
  // サイドライン
  _line(c.VP_X - c.FAR_HALF_W,  c.FAR_Y,  c.VP_X - c.NEAR_HALF_W, c.NEAR_Y);
  _line(c.VP_X + c.FAR_HALF_W,  c.FAR_Y,  c.VP_X + c.NEAR_HALF_W, c.NEAR_Y);

  // 奥行きグリッド線
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth   = 0.8;
  for (let d = 1; d <= 3; d++) {
    const t  = d / 4;
    const y  = c.FAR_Y + (c.NEAR_Y - c.FAR_Y) * t;
    const hw = c.FAR_HALF_W + (c.NEAR_HALF_W - c.FAR_HALF_W) * t;
    _line(c.VP_X - hw, y, c.VP_X + hw, y);
  }
  // 縦収束線
  for (let i = -2; i <= 2; i++) {
    const fx = c.VP_X + i * (c.FAR_HALF_W  / 2.2);
    const nx = c.VP_X + i * (c.NEAR_HALF_W / 2.2);
    _line(fx, c.FAR_Y, nx, c.NEAR_Y);
  }

  // ── ネット ──
  const nd    = c.NET_DEPTH;
  const netY  = c.FAR_Y + (c.NEAR_Y - c.FAR_Y) * nd;
  const netHW = c.FAR_HALF_W + (c.NEAR_HALF_W - c.FAR_HALF_W) * nd;
  const netH  = 30 + nd * 10;

  ctx.fillStyle   = "rgba(255,255,255,0.10)";
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.rect(c.VP_X - netHW, netY - netH, netHW * 2, netH);
  ctx.fill();
  ctx.stroke();

  // ネット上テープ
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth   = 3;
  _line(c.VP_X - netHW, netY - netH, c.VP_X + netHW, netY - netH);

  // センターライン
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth   = 1;
  _line(c.VP_X - netHW, netY, c.VP_X + netHW, netY);
}

// ============================================================
// プレイヤー・相手描画
// ============================================================

/**
 * プレイヤーシルエットを描画する。
 *
 * @param {number} normX - 正規化X（-1〜+1）
 */
function _renderPlayer(normX) {
  const c   = COURT_DRAW;
  const sx  = c.VP_X + normX * c.NEAR_HALF_W;
  const sy  = c.NEAR_Y - 8;
  const ctx = _ctx;

  // 位置インジケーター
  if (_phase === MATCH_PHASE.RECEIVE || _phase === MATCH_PHASE.BLOCK) {
    const good = _positionBonus > 0;
    ctx.strokeStyle = good ? "#40ff88" : "#ff5050";
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(sx, sy - 30, 18, 0, Math.PI * 2);
    ctx.stroke();

    // 理想位置マーカー
    const ix = c.VP_X + _idealX * c.NEAR_HALF_W;
    ctx.strokeStyle = "rgba(255,220,50,0.6)";
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 4]);
    _line(ix, sy - 2, ix, sy - 60);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,220,50,0.5)";
    ctx.beginPath();
    ctx.arc(ix, sy - 60, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // シルエット（頭）
  ctx.fillStyle = "#60c8ff";
  ctx.beginPath();
  ctx.arc(sx, sy - 30, 13, 0, Math.PI * 2);
  ctx.fill();

  // 胴体
  ctx.fillRect(sx - 9, sy - 17, 18, 22);

  // 足
  ctx.fillRect(sx - 10, sy + 5,  8, 15);
  ctx.fillRect(sx + 2,  sy + 5,  8, 15);

  // ジャンプポーズ（SPIKE フェーズ）
  if (_phase === MATCH_PHASE.SPIKE) {
    ctx.fillStyle = "rgba(255,200,50,0.5)";
    ctx.beginPath();
    ctx.arc(sx, sy - 30, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#60c8ff";
    ctx.beginPath();
    ctx.arc(sx, sy - 30, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(sx - 9, sy - 17, 18, 22);
    // 腕を上げる
    ctx.strokeStyle = "#60c8ff";
    ctx.lineWidth   = 4;
    _line(sx - 9, sy - 12, sx - 20, sy - 28);
    _line(sx + 9, sy - 12, sx + 20, sy - 30);
  }
}

/**
 * 相手チームのシルエットを描画する（奥に 3 人）。
 */
function _renderOpponentPlayers() {
  const c   = COURT_DRAW;
  const oy  = c.FAR_Y + (c.NEAR_Y - c.FAR_Y) * 0.12;
  const s   = 0.52;

  [-0.45, 0.0, 0.45].forEach((ox) => {
    const osx = c.VP_X + ox * c.FAR_HALF_W * 0.85;
    _ctx.fillStyle = "#e05050";
    _ctx.beginPath();
    _ctx.arc(osx, oy - 14 * s, 11 * s, 0, Math.PI * 2);
    _ctx.fill();
    _ctx.fillRect(osx - 7 * s, oy - 3 * s, 14 * s, 16 * s);
    _ctx.fillRect(osx - 8 * s, oy + 13 * s, 6 * s, 11 * s);
    _ctx.fillRect(osx + 2 * s, oy + 13 * s, 6 * s, 11 * s);
  });
}

/**
 * SPIKE フェーズ：相手ブロッカーを強調表示する。
 */
function _renderBlockers() {
  const c    = COURT_DRAW;
  const nd   = c.NET_DEPTH;
  const netY = c.FAR_Y + (c.NEAR_Y - c.FAR_Y) * nd;
  const netHW = c.FAR_HALF_W + (c.NEAR_HALF_W - c.FAR_HALF_W) * nd;
  const s    = 0.72;
  const ctx  = _ctx;

  _blockerPositions.forEach((bx) => {
    const sx = c.VP_X + bx * netHW;
    const sy = netY - 8;

    ctx.fillStyle = "rgba(255,70,70,0.88)";
    ctx.beginPath();
    ctx.arc(sx, sy - 20 * s, 13 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(sx - 9 * s, sy - 7 * s, 18 * s, 22 * s);

    // 腕を高く上げているポーズ
    ctx.strokeStyle = "rgba(255,70,70,0.88)";
    ctx.lineWidth   = 4 * s;
    _line(sx - 9 * s, sy - 2 * s, sx - 19 * s, sy - 25 * s);
    _line(sx + 9 * s, sy - 2 * s, sx + 19 * s, sy - 27 * s);

    // 警告グロー
    ctx.strokeStyle = "rgba(255,120,50,0.45)";
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(sx, sy - 20 * s, 20 * s, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/**
 * ボールを描画する。アニメーション中は補間位置で表示。
 *
 * @param {number} timestamp - requestAnimationFrame のタイムスタンプ
 */
function _renderBall(timestamp) {
  if (!_ball.visible) return;

  let bx = _ball.x;
  let by = _ball.y;

  if (_ballAnim) {
    const elapsed = timestamp - _ballAnim.startTime;
    const t = Math.min(1, elapsed / _ballAnim.duration);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    bx = _ballAnim.sx + (_ballAnim.ex - _ballAnim.sx) * ease;
    const arcOffset = Math.sin(t * Math.PI) * _ballAnim.arcH;
    by = _ballAnim.sy + (_ballAnim.ey - _ballAnim.sy) * ease + arcOffset;

    if (t >= 1) {
      _ball.x   = _ballAnim.ex;
      _ball.y   = _ballAnim.ey;
      _ballAnim = null;
    }
  }

  const r   = COURT_DRAW.BALL_RADIUS;
  const ctx = _ctx;

  // 影（床への投影）
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(bx, COURT_DRAW.NEAR_Y - 8, r * 1.3, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // ボール本体（ラジアルグラデーション）
  const grad = ctx.createRadialGradient(bx - 3, by - 3, 1, bx, by, r);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.5, "#f5e090");
  grad.addColorStop(1, "#c8a030");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();

  // ボールの縫い目
  ctx.strokeStyle = "rgba(160,80,20,0.45)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.arc(bx, by, r, Math.PI * 0.3, Math.PI * 1.1);
  ctx.stroke();
}

/**
 * フェーズヒントと演出テキストを Canvas 上部に描画する。
 */
function _renderOverlayText() {
  const ctx = _ctx;
  const cx  = COURT_DRAW.CANVAS_W / 2;

  const hints = {
    [MATCH_PHASE.SERVE]:      "コマンドを選んでサーブ",
    [MATCH_PHASE.RECEIVE]:    "◀ ▶ で移動してレシーブ",
    [MATCH_PHASE.TOSS]:       "味方がトス...",
    [MATCH_PHASE.SPIKE]:      "コマンドでスパイク（赤 = ブロッカー）",
    [MATCH_PHASE.BLOCK]:      "◀ ▶ で移動してブロック",
    [MATCH_PHASE.AUTO_RALLY]: "ラリー中...",
    [MATCH_PHASE.POINT]:      _phaseText,
  };
  const hint = _phase ? (hints[_phase] || "") : "";
  if (hint) {
    ctx.font      = "bold 13px 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(255,255,210,0.90)";
    ctx.textAlign = "center";
    ctx.fillText(hint, cx, 20);
  }

  // 得点テキスト（大きく中央に一瞬表示）
  if (_phaseText && _phase !== MATCH_PHASE.POINT) {
    ctx.font      = "bold 22px 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(255,240,80,0.95)";
    ctx.textAlign = "center";
    ctx.fillText(_phaseText, cx, COURT_DRAW.CANVAS_H / 2 - 20);
  }

  ctx.textAlign = "left";
}

// ============================================================
// Canvas 描画ユーティリティ
// ============================================================

function _line(x1, y1, x2, y2) {
  _ctx.beginPath();
  _ctx.moveTo(x1, y1);
  _ctx.lineTo(x2, y2);
  _ctx.stroke();
}

// ============================================================
// 汎用ユーティリティ
// ============================================================

/**
 * _score を updateScoreUI が期待する形式に変換する。
 */
function _scoreForUI() {
  return {
    myPts:  _score.playerPoints,
    oppPts: _score.opponentPoints,
    mySets: _score.playerSets,
    oppSets: _score.opponentSets,
    setNum: _score.playerSets + _score.opponentSets + 1,
  };
}

function _randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function _randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function _clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
