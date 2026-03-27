/**
 * match.js
 * 試合ロジックを担当するファイル。
 *
 * 役割：
 *   - 1ラリーの勝敗を計算する（攻撃力 - 守備力 + 補正 + ランダム）
 *   - セットの進行（25点先取・デュース）を管理する
 *   - 試合全体（最大3セット）の結果を生成する
 *   - MVP判定を行う
 *
 * 設計方針：
 *   - DOM・画面表示には一切触れない（純粋なロジックのみ）
 *   - 試合結果を「ログ付きオブジェクト」として返し、UI側で表示する
 *   - Godot移植時は MatchManager.gd に相当
 */

// =============================================================
// 能力値から攻撃力・守備力を計算する
// （04_試合ロジック.docx 準拠: 攻撃力 - 守備力 + 補正 + ランダム）
// =============================================================

/**
 * プレイヤーの能力値から攻撃力を計算する。
 * スパイク・トス・筋力・ジャンプの重み付き合計。
 *
 * @param {Object} stats - プレイヤーの能力値オブジェクト
 * @returns {number} 攻撃力（小数を含む）
 */
function calcAttack(stats) {
  return (
    stats.spike     * MATCH_CONFIG.ATTACK_SPIKE_WEIGHT +
    stats.toss      * MATCH_CONFIG.ATTACK_TOSS_WEIGHT +
    stats.strength  * MATCH_CONFIG.ATTACK_STRENGTH_WEIGHT +
    stats.jump      * MATCH_CONFIG.ATTACK_JUMP_WEIGHT +
    stats.serve     * MATCH_CONFIG.SERVE_BONUS_WEIGHT
  );
}

/**
 * プレイヤーの能力値から守備力を計算する。
 * レシーブ・ブロック・スピード・スタミナの重み付き合計。
 *
 * @param {Object} stats - プレイヤーの能力値オブジェクト
 * @returns {number} 守備力（小数を含む）
 */
function calcDefense(stats) {
  return (
    stats.receive  * MATCH_CONFIG.DEFENSE_RECEIVE_WEIGHT +
    stats.block    * MATCH_CONFIG.DEFENSE_BLOCK_WEIGHT +
    stats.speed    * MATCH_CONFIG.DEFENSE_SPEED_WEIGHT +
    stats.stamina  * MATCH_CONFIG.DEFENSE_STAMINA_WEIGHT
  );
}

/**
 * テクニック値から補正値を計算する。
 * テクニックが高いほど有利になる固定ボーナス。
 *
 * @param {Object} stats - プレイヤーの能力値オブジェクト
 * @returns {number} 補正値
 */
function calcCorrection(stats) {
  return stats.technique * MATCH_CONFIG.CORRECTION_TECHNIQUE_WEIGHT;
}

/**
 * 対戦相手の攻撃力・守備力をランダムに生成する。
 * OPPONENT_TABLE の Min〜Max の範囲で決定する。
 *
 * @param {string} matchType - 試合種別（OPPONENT_TABLE のキー）
 * @returns {{ name: string, attack: number, defense: number }}
 */
function generateOpponent(matchType) {
  const table = OPPONENT_TABLE[matchType];
  if (!table) {
    // 定義がない場合はデフォルト値を返す
    return { name: "対戦相手", attack: 30, defense: 30 };
  }

  // 名前をランダムに選ぶ
  const name = table.names[Math.floor(Math.random() * table.names.length)];

  // 攻撃力・守備力を Min〜Max の範囲でランダムに決める
  const attack  = randInt(table.attackMin,  table.attackMax);
  const defense = randInt(table.defenseMin, table.defenseMax);

  return { name, attack, defense };
}

// =============================================================
// 1ラリーの勝敗判定
// =============================================================

/**
 * 1ラリーの勝敗を計算する。
 * 計算式: 攻撃力 - 守備力 + 補正 + ランダム
 *   結果が正なら自チームの得点、負なら相手の得点。
 *
 * @param {number} myAttack    - 自チームの攻撃力
 * @param {number} oppDefense  - 相手チームの守備力
 * @param {number} correction  - 補正値
 * @returns {{ myPoint: boolean, score: number, comment: string }}
 *   myPoint : 自チームが得点したなら true
 *   score   : 計算結果の数値（正負）
 *   comment : 演出用コメント
 */
function calcRally(myAttack, oppDefense, correction) {
  // ランダム値: -RANDOM_RANGE 〜 +RANDOM_RANGE
  const random = (Math.random() * 2 - 1) * MATCH_CONFIG.RANDOM_RANGE;

  // メインの計算式（docs 04 準拠）
  const score = myAttack - oppDefense + correction + random;

  const myPoint = score > 0;

  // 演出コメントをランダムに選ぶ
  const commentPool = myPoint ? COMMENT_MY_SCORE : COMMENT_OPP_SCORE;
  const comment = commentPool[Math.floor(Math.random() * commentPool.length)];

  return { myPoint, score, comment };
}

// =============================================================
// 1セットのシミュレーション
// =============================================================

/**
 * 1セットを最初から最後までシミュレーションする。
 * 25点先取（デュース考慮）でセット勝者を決める。
 *
 * @param {number} myAttack    - 自チームの攻撃力
 * @param {number} myDefense   - 自チームの守備力
 * @param {number} correction  - 補正値
 * @param {number} oppAttack   - 相手の攻撃力
 * @param {number} oppDefense  - 相手の守備力
 * @returns {{
 *   myWon     : boolean,          // 自チームがセットを取ったか
 *   myScore   : number,           // 自チームの最終得点
 *   oppScore  : number,           // 相手の最終得点
 *   rallies   : Array<Object>,    // 各ラリーの記録
 * }}
 */
function simulateSet(myAttack, myDefense, correction, oppAttack, oppDefense) {
  let myScore  = 0;
  let oppScore = 0;
  const rallies = []; // ラリーごとのログ

  // 25点先取、かつ2点差が付くまで続ける（デュースルール）
  while (true) {
    // --- 自チームの攻撃ターン ---
    const myTurn = calcRally(myAttack, oppDefense, correction);
    // --- 相手の攻撃ターン（相手目線で逆に計算）---
    const oppTurn = calcRally(oppAttack, myDefense, 0);

    // 両方のターンを1ラリー分として処理する
    // ※ どちらが先に得点するかをランダムで決める（交互でなくランダム）
    if (Math.random() < 0.5) {
      // 自チームターンを先に解決
      if (myTurn.myPoint) {
        myScore++;
        rallies.push({ myPoint: true, comment: myTurn.comment, my: myScore, opp: oppScore });
      } else if (oppTurn.myPoint) {
        // 相手ターンで相手得点（oppTurn.myPoint は相手視点のtrue）
        oppScore++;
        rallies.push({ myPoint: false, comment: oppTurn.comment, my: myScore, opp: oppScore });
      } else {
        // 両方相手得点の場合は相手に加算
        oppScore++;
        rallies.push({ myPoint: false, comment: oppTurn.comment, my: myScore, opp: oppScore });
      }
    } else {
      // 相手ターンを先に解決
      if (!oppTurn.myPoint) {
        oppScore++;
        rallies.push({ myPoint: false, comment: oppTurn.comment, my: myScore, opp: oppScore });
      } else if (myTurn.myPoint) {
        myScore++;
        rallies.push({ myPoint: true, comment: myTurn.comment, my: myScore, opp: oppScore });
      } else {
        myScore++;
        rallies.push({ myPoint: true, comment: myTurn.comment, my: myScore, opp: oppScore });
      }
    }

    // --- セット終了判定 ---
    const target = MATCH_CONFIG.POINTS_PER_SET;
    const minDiff = MATCH_CONFIG.DEUCE_MIN_DIFF;

    // どちらかが25点以上、かつ2点差ならセット終了
    if (myScore >= target || oppScore >= target) {
      if (Math.abs(myScore - oppScore) >= minDiff) {
        break;
      }
      // デュース（2点差がつくまで続ける）
    }

    // 無限ループ防止（理論上ありえないが安全のため）
    if (rallies.length > 200) break;
  }

  return {
    myWon:    myScore > oppScore,
    myScore,
    oppScore,
    rallies,
  };
}

// =============================================================
// 試合全体のシミュレーション
// =============================================================

/**
 * 試合全体（最大3セット）をシミュレーションする。
 * SETS_TO_WIN セット先取した側が試合勝者となる。
 *
 * @param {string} matchType - 試合種別（MATCH_REWARDS のキー）
 * @returns {{
 *   win          : boolean,       // 自チームが試合に勝ったか
 *   opponent     : Object,        // 対戦相手情報
 *   sets         : Array<Object>, // 各セットの結果
 *   mySetWins    : number,        // 自チームのセット勝利数
 *   oppSetWins   : number,        // 相手のセット勝利数
 *   scoreText    : string,        // スコア表示文字列（例: "2-1"）
 *   mvp          : boolean,       // MVP獲得したか
 *   allRallies   : Array<Object>, // 全ラリーのログ（UI表示用）
 * }}
 */
function simulateMatch(matchType) {
  const state = getState();

  // --- 自チームの能力値から攻守を計算する ---
  const myAttack    = calcAttack(state.stats);
  const myDefense   = calcDefense(state.stats);
  const correction  = calcCorrection(state.stats);

  // --- 対戦相手を生成する ---
  const opponent = generateOpponent(matchType);

  // --- セットを順番にシミュレーションする ---
  const sets = [];
  let mySetWins  = 0;
  let oppSetWins = 0;
  const allRallies = []; // 全セットのラリーをまとめたログ

  while (mySetWins < MATCH_CONFIG.SETS_TO_WIN && oppSetWins < MATCH_CONFIG.SETS_TO_WIN) {
    const setNum = sets.length + 1;

    // 1セット分をシミュレート
    const setResult = simulateSet(
      myAttack, myDefense, correction,
      opponent.attack, opponent.defense
    );
    sets.push({ setNum, ...setResult });

    // ラリーログにセット番号情報を付けて追加
    setResult.rallies.forEach((r) => {
      allRallies.push({ ...r, setNum });
    });

    // セットスコアを集計
    if (setResult.myWon) {
      mySetWins++;
      allRallies.push({
        isSetResult: true,
        myWon: true,
        comment: COMMENT_SET_WIN[Math.floor(Math.random() * COMMENT_SET_WIN.length)],
        setNum,
      });
    } else {
      oppSetWins++;
      allRallies.push({
        isSetResult: true,
        myWon: false,
        comment: COMMENT_SET_LOSE[Math.floor(Math.random() * COMMENT_SET_LOSE.length)],
        setNum,
      });
    }
  }

  const win = mySetWins >= MATCH_CONFIG.SETS_TO_WIN;
  const scoreText = `${mySetWins}-${oppSetWins}`;

  // --- MVP判定 ---
  // 勝利 かつ スコアが圧勝（2-0）かつ 能力値が一定以上なら MVP
  const mvp = win && mySetWins === MATCH_CONFIG.SETS_TO_WIN && oppSetWins === 0
    && (myAttack + myDefense) > (opponent.attack + opponent.defense) * 1.2;

  return {
    win,
    opponent,
    sets,
    mySetWins,
    oppSetWins,
    scoreText,
    mvp,
    allRallies,
  };
}

// =============================================================
// 内部ユーティリティ
// =============================================================

/**
 * min 以上 max 以下の整数をランダムに返す。
 *
 * @param {number} min - 最小値
 * @param {number} max - 最大値
 * @returns {number} ランダムな整数
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
