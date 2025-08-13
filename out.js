// 智能反作弊系统 v4.0
(function() {
    const SECURITY = {
        // 系统配置
        VERSION: "4.0",
        DEBUG: false,
        
        // 惩罚级别配置
        PENALTY: {
            WARNING: { level: 1, name: "警告", color: "#f1c40f", vibration: [200] },
            STRICT_WARNING: { level: 2, name: "严重警告", color: "#f39c12", vibration: [200, 100, 200] },
            LOSE_GAME: { level: 3, name: "判负", color: "#e74c3c", vibration: [500] },
            BAN: { level: 4, name: "封禁", color: "#c0392b", vibration: [1000], duration: 15 * 60 * 1000 }
        },
        
        // 检测阈值
        THRESHOLDS: {
            MIN_MOVE_TIME: 100,          // 最低合理反应时间(ms)
            MAX_CONSECUTIVE_FAST: 3,     // 连续快速操作次数
            PERFECT_MOVE_TIME_MIN: 300,  // 完美决策最小时间
            PERFECT_MOVE_TIME_MAX: 1500, // 完美决策最大时间
            PATTERN_REPEAT: 5,           // 重复模式检测次数
            INACTIVITY_LIMIT: 45000      // 不活动时间限制(ms)
        },
        
        // 违规积分系统
        VIOLATION: {
            WARNING_LIMIT: 3,    // 警告阈值
            STRICT_WARNING_LIMIT: 5, // 严重警告阈值
            LOSE_GAME_LIMIT: 8,  // 判负阈值
            DECAY_RATE: 0.2       // 违规积分衰减率(每分钟)
        },
        
        // 持久化配置
        STORAGE: {
            BAN_KEY: "gomoku_ac_ban",
            STATS_KEY: "gomoku_ac_stats"
        }
    };

    // 系统状态
    const state = {
        penaltyLevel: 0,
        violationScore: 0,
        bannedUntil: 0,
        gameLossCount: 0,
        lastActionTime: Date.now(),
        
        // 记录系统
        records: {
            moves: [],
            warnings: [],
            focusChanges: []
        },
        
        // 统计信息
        stats: {
            totalWarnings: 0,
            quickMoves: 0,
            perfectMoves: 0,
            tabSwitches: 0
        }
    };

    /* 核心功能 */
    function init() {
        loadPersistedData();
        setupEventListeners();
        startViolationDecay();
        exposeAPI();
        
        if (SECURITY.DEBUG) {
            console.debug(`[Anti-Cheat] 系统启动 v${SECURITY.VERSION}`);
        }
    }

    function loadPersistedData() {
        // 加载封禁状态
        const banData = localStorage.getItem(SECURITY.STORAGE.BAN_KEY);
        if (banData) {
            const { until, reason } = JSON.parse(banData);
            if (until > Date.now()) {
                state.bannedUntil = until;
                applyPenalty(SECURITY.PENALTY.BAN, `持续违规 (${reason})`);
            }
        }
        
        // 加载统计数据
        const stats = localStorage.getItem(SECURITY.STORAGE.STATS_KEY);
        if (stats) {
            Object.assign(state.stats, JSON.parse(stats));
        }
    }

    function setupEventListeners() {
        // 页面可见性事件
        document.addEventListener("visibilitychange", handleVisibilityChange);
        
        // 窗口焦点事件
        window.addEventListener("blur", () => handleFocusChange(false));
        window.addEventListener("focus", () => handleFocusChange(true));
        
        // 游戏结束钩子
        if (window.gameAPI?.endGame) {
            const originalEndGame = window.gameAPI.endGame;
            window.gameAPI.endGame = function(...args) {
                recordGameEnd();
                return originalEndGame.apply(this, args);
            };
        }
    }

    function startViolationDecay() {
        setInterval(() => {
            if (state.violationScore > 0) {
                state.violationScore = Math.max(0, 
                    state.violationScore - SECURITY.VIOLATION.DECAY_RATE);
                if (SECURITY.DEBUG) {
                    console.debug(`[Anti-Cheat] 违规积分衰减至: ${state.violationScore.toFixed(1)}`);
                }
            }
        }, 60000); // 每分钟衰减一次
    }

    function exposeAPI() {
        window.antiCheat = {
            version: SECURITY.VERSION,
            stats: getSystemStats,
            reset: resetViolationState,
            config: SECURITY
        };
    }

    /* 检测逻辑 */
    function checkCheating(data) {
        if (isBanned()) return;
        state.lastActionTime = Date.now();
        
        try {
            recordMove(data);
            
            // 执行检测流程（按误判可能性从低到高排序）
            validateGameState(data);       // 误判率最低
            checkTurnOrder(data);          // 误判率低
            detectAbnormalSpeed(data);     // 中等误判率
            detectPerfectMoves();          // 较高误判率
            detectRepeatedPatterns();      // 最高误判率
            
        } catch (error) {
            console.error("[Anti-Cheat] 检测异常:", error);
        }
    }

    function recordMove({ row, col, moveInterval, timestamp = Date.now() }) {
        const move = {
            position: [row, col],
            time: moveInterval,
            timestamp,
            suspicious: false
        };
        
        state.records.moves.push(move);
        if (state.records.moves.length > 20) {
            state.records.moves.shift();
        }
    }

    function validateGameState({ board }) {
        if (!window.gameAPI?.getBoard) return;
        
        const validBoard = window.gameAPI.getBoard();
        if (JSON.stringify(board) !== JSON.stringify(validBoard)) {
            addViolation("游戏状态异常", 2.5, true);
        }
    }

    function checkTurnOrder({ currentPlayer }) {
        const actualPlayer = window.gameAPI?.getCurrentPlayer?.();
        if (actualPlayer !== undefined && currentPlayer !== actualPlayer) {
            addViolation("回合顺序异常", 1.8, true);
        }
    }

    function detectAbnormalSpeed({ moveInterval }) {
        // 单次快速操作检测
        if (moveInterval < SECURITY.THRESHOLDS.MIN_MOVE_TIME) {
            state.stats.quickMoves++;
            addViolation(`操作过快 (${moveInterval}ms)`, 1.2, false);
        }
        
        // 连续快速操作检测
        const recentMoves = state.records.moves.slice(-SECURITY.THRESHOLDS.MAX_CONSECUTIVE_FAST);
        if (recentMoves.length >= SECURITY.THRESHOLDS.MAX_CONSECUTIVE_FAST &&
            recentMoves.every(m => m.time < SECURITY.THRESHOLDS.MIN_MOVE_TIME * 1.5)) {
            addViolation(`连续${recentMoves.length}次快速操作`, 1.5, true);
        }
    }

    function detectPerfectMoves() {
        const perfectMoves = state.records.moves.filter(m => 
            m.time > SECURITY.THRESHOLDS.PERFECT_MOVE_TIME_MIN && 
            m.time < SECURITY.THRESHOLDS.PERFECT_MOVE_TIME_MAX
        ).length;
        
        if (perfectMoves >= 8 && perfectMoves / state.records.moves.length > 0.7) {
            state.stats.perfectMoves++;
            addViolation("可疑的完美决策模式", 1.0, false);
        }
    }

    function detectRepeatedPatterns() {
        if (state.records.moves.length < SECURITY.THRESHOLDS.PATTERN_REPEAT) return;
        
        const lastMoves = state.records.moves
            .slice(-SECURITY.THRESHOLDS.PATTERN_REPEAT)
            .map(m => m.position.join(","));
        
        if (new Set(lastMoves).size <= 2) {
            addViolation("检测到重复操作模式", 0.8, false);
        }
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            recordActivity("page_hide");
        } else {
            checkInactivity();
        }
    }

    function handleFocusChange(gainedFocus) {
        const now = Date.now();
        recordActivity(gainedFocus ? "focus_gain" : "focus_lose");
        
        if (!gainedFocus) {
            state.stats.tabSwitches++;
            if (state.penaltyLevel > 0) {
                addViolation("窗口切换时处于警告状态", 0.5, false);
            }
        }
    }

    function checkInactivity() {
        const inactiveTime = Date.now() - state.lastActionTime;
        if (inactiveTime > SECURITY.THRESHOLDS.INACTIVITY_LIMIT) {
            addViolation("长时间无操作", 0.3, false);
        }
    }

    function recordGameEnd() {
        if (state.penaltyLevel >= SECURITY.PENALTY.LOSE_GAME.level) {
            state.gameLossCount++;
            persistSystemState();
        }
    }

    function recordActivity(type) {
        state.records.focusChanges.push({
            type,
            timestamp: Date.now()
        });
    }

    /* 惩罚系统 */
    function addViolation(reason, severity, isConclusive) {
        if (isBanned()) return;
        
        // 确凿证据直接应用，非确凿证据需要累计
        const effectiveSeverity = isConclusive ? 
            severity * 1.5 : 
            severity * (0.5 + Math.random() * 0.5); // 添加随机性减少误判
        
        state.violationScore += effectiveSeverity;
        state.stats.totalWarnings++;
        
        const warning = {
            timestamp: Date.now(),
            reason,
            severity: effectiveSeverity,
            isConclusive
        };
        
        state.records.warnings.push(warning);
        updatePenaltyLevel(warning);
        
        if (SECURITY.DEBUG) {
            console.warn(`[Anti-Cheat] 违规记录: ${reason} (严重度: ${effectiveSeverity.toFixed(1)})`);
        }
    }

    function updatePenaltyLevel(warning) {
        const newLevel = calculatePenaltyLevel();
        
        if (newLevel !== state.penaltyLevel) {
            state.penaltyLevel = newLevel;
            applyCurrentPenalty(warning);
        }
    }

    function calculatePenaltyLevel() {
        if (state.violationScore >= SECURITY.VIOLATION.LOSE_GAME_LIMIT * 1.5 && 
            state.gameLossCount >= 2) {
            return SECURITY.PENALTY.BAN.level;
        }
        if (state.violationScore >= SECURITY.VIOLATION.LOSE_GAME_LIMIT) {
            return SECURITY.PENALTY.LOSE_GAME.level;
        }
        if (state.violationScore >= SECURITY.VIOLATION.STRICT_WARNING_LIMIT) {
            return SECURITY.PENALTY.STRICT_WARNING.level;
        }
        if (state.violationScore >= SECURITY.VIOLATION.WARNING_LIMIT) {
            return SECURITY.PENALTY.WARNING.level;
        }
        return 0;
    }

    function applyCurrentPenalty(warning) {
        switch (state.penaltyLevel) {
            case SECURITY.PENALTY.WARNING.level:
                showWarning(SECURITY.PENALTY.WARNING, warning.reason);
                break;
                
            case SECURITY.PENALTY.STRICT_WARNING.level:
                showWarning(SECURITY.PENALTY.STRICT_WARNING, warning.reason);
                break;
                
            case SECURITY.PENALTY.LOSE_GAME.level:
                enforceGameLoss(warning.reason);
                break;
                
            case SECURITY.PENALTY.BAN.level:
                enforceBan(warning.reason);
                break;
        }
    }

    function showWarning(penalty, reason) {
        const message = `反作弊系统: ${penalty.name} - ${reason}`;
        
        if (window.gameAPI?.showCheatWarning) {
            window.gameAPI.showCheatWarning(message, {
                level: penalty.level,
                color: penalty.color
            });
        }
        
        triggerVibration(penalty.vibration);
    }

    function enforceGameLoss(reason) {
        state.gameLossCount++;
        persistSystemState();
        
        showWarning(SECURITY.PENALTY.LOSE_GAME, `多次违规 (${reason})`);
        if (window.gameAPI?.endGame) {
            window.gameAPI.endGame("因作弊行为判负");
        }
        
        // 重置违规积分但保留惩罚级别
        state.violationScore = SECURITY.VIOLATION.STRICT_WARNING_LIMIT - 1;
    }

    function enforceBan(reason) {
        state.bannedUntil = Date.now() + SECURITY.PENALTY.BAN.duration;
        persistSystemState();
        
        showWarning(SECURITY.PENALTY.BAN, `严重违规 (${reason})`);
        if (window.gameAPI?.endGame) {
            window.gameAPI.endGame("因多次作弊封禁");
        }
    }

    function isBanned() {
        if (state.bannedUntil && state.bannedUntil > Date.now()) {
            const minsLeft = Math.ceil((state.bannedUntil - Date.now()) / 60000);
            showWarning(SECURITY.PENALTY.BAN, `账号封禁中 (剩余 ${minsLeft} 分钟)`);
            return true;
        }
        return false;
    }

    function triggerVibration(pattern) {
        try {
            if (navigator.vibrate && pattern) {
                navigator.vibrate(pattern);
            }
        } catch (e) {
            if (SECURITY.DEBUG) console.debug("[Anti-Cheat] 震动不支持:", e);
        }
    }

    function persistSystemState() {
        localStorage.setItem(SECURITY.STORAGE.STATS_KEY, JSON.stringify(state.stats));
        
        if (state.bannedUntil) {
            localStorage.setItem(SECURITY.STORAGE.BAN_KEY, JSON.stringify({
                until: state.bannedUntil,
                reason: `累计 ${state.gameLossCount} 次判负`
            }));
        }
    }

    function getSystemStats() {
        return {
            version: SECURITY.VERSION,
            penaltyLevel: state.penaltyLevel,
            violationScore: parseFloat(state.violationScore.toFixed(1)),
            gameLossCount: state.gameLossCount,
            isBanned: isBanned(),
            stats: { ...state.stats }
        };
    }

    function resetViolationState() {
        state.violationScore = 0;
        state.penaltyLevel = 0;
        if (window.gameAPI?.showCheatWarning) {
            window.gameAPI.showCheatWarning("", { level: 0 });
        }
    }

    /* 初始化 */
    window.checkCheating = checkCheating;
    if (!window.antiCheat) init();
})();