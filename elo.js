// elo.js - 智能动态难度调整系统
(function() {
    const ELO_CONFIG = {
        INITIAL_PLAYER_ELO: 1500,
        INITIAL_AI_ELO: 1500,
        K_FACTOR: 32,
        MIN_ELO: 1000,
        MAX_ELO: 2500,
        BASE_DIFFICULTY: 1.0,
        MAX_DIFFICULTY: 3.0,
        ADJUSTMENT_RATE: 0.1,
        WIN_STREAK_BONUS: 0.2,
        LOSS_STREAK_PENALTY: 0.15
    };

    let playerElo = ELO_CONFIG.INITIAL_PLAYER_ELO;
    let aiElo = ELO_CONFIG.INITIAL_AI_ELO;
    let currentDifficulty = ELO_CONFIG.BASE_DIFFICULTY;
    let playerStreak = 0;
    let aiStreak = 0;
    let gameHistory = [];

    // 计算预期胜率 (使用更平滑的曲线)
    function expectedWinRate(a, b) {
        return 1 / (1 + Math.pow(10, (b - a) / 400));
    }

    // 更新连胜记录
    function updateStreak(winner) {
        if (winner === 'player') {
            playerStreak = Math.max(0, playerStreak) + 1;
            aiStreak = Math.min(0, aiStreak) - 1;
        } else if (winner === 'ai') {
            aiStreak = Math.max(0, aiStreak) + 1;
            playerStreak = Math.min(0, playerStreak) - 1;
        }
    }

    // 根据游戏历史调整K因子 (更动态的调整)
    function getDynamicKFactor() {
        const recentGames = gameHistory.slice(-5);
        if (recentGames.length < 3) return ELO_CONFIG.K_FACTOR;
        
        const playerWins = recentGames.filter(r => r === 'player').length;
        const winRate = playerWins / recentGames.length;
        
        if (winRate > 0.7) return ELO_CONFIG.K_FACTOR * 1.5;
        if (winRate < 0.3) return ELO_CONFIG.K_FACTOR * 0.7;
        return ELO_CONFIG.K_FACTOR;
    }

    // 更新ELO评分 (考虑连胜因素)
    function updateEloRatings(winner) {
        updateStreak(winner);
        gameHistory.push(winner);
        if (gameHistory.length > 10) gameHistory.shift();
        
        const kFactor = getDynamicKFactor();
        const expectedPlayer = expectedWinRate(playerElo, aiElo);
        const expectedAI = 1 - expectedPlayer;
        
        if (winner === 'player') {
            const streakBonus = playerStreak > 2 ? ELO_CONFIG.WIN_STREAK_BONUS * playerStreak : 0;
            playerElo += kFactor * (1 - expectedPlayer + streakBonus);
            aiElo += kFactor * (0 - expectedAI - streakBonus);
        } else if (winner === 'ai') {
            const streakBonus = aiStreak > 2 ? ELO_CONFIG.LOSS_STREAK_PENALTY * aiStreak : 0;
            playerElo += kFactor * (0 - expectedPlayer - streakBonus);
            aiElo += kFactor * (1 - expectedAI + streakBonus);
        }
        
        // 确保ELO在合理范围内
        playerElo = Math.max(ELO_CONFIG.MIN_ELO, Math.min(ELO_CONFIG.MAX_ELO, playerElo));
        aiElo = Math.max(ELO_CONFIG.MIN_ELO, Math.min(ELO_CONFIG.MAX_ELO, aiElo));
        
        adjustDifficulty();
    }

    // 更智能的难度调整算法
    function adjustDifficulty() {
        const eloDifference = playerElo - aiElo;
        const baseDifficulty = 1 + (1 / (1 + Math.exp(-eloDifference / 200))) * (ELO_CONFIG.MAX_DIFFICULTY - 1);
        
        // 考虑连胜因素
        let streakAdjustment = 0;
        if (playerStreak > 2) {
            streakAdjustment = ELO_CONFIG.WIN_STREAK_BONUS * playerStreak;
        } else if (aiStreak > 2) {
            streakAdjustment = -ELO_CONFIG.LOSS_STREAK_PENALTY * aiStreak;
        }
        
        // 平滑过渡
        currentDifficulty = Math.min(ELO_CONFIG.MAX_DIFFICULTY, 
            Math.max(ELO_CONFIG.BASE_DIFFICULTY, 
                baseDifficulty + streakAdjustment));
    }

    // 根据难度调整AI行为
    function getAIParams() {
        const d = currentDifficulty;
        return {
            searchDepth: Math.floor(d),  // 搜索深度 (1-3)
            aggressiveness: 0.4 + (d * 0.2),  // 进攻性 (0.4-1.0)
            defensiveness: 0.5 + (d * 0.25),  // 防守性 (0.5-1.25)
            mistakeRate: Math.max(0, 0.3 - (d * 0.08))  // 犯错概率 (0.3-0.06)
        };
    }

    // 暴露接口
    window.eloSystem = {
        updateEloRatings,
        getAIParams,
        getCurrentDifficulty: () => currentDifficulty,
        getPlayerElo: () => Math.round(playerElo),
        getAIElo: () => Math.round(aiElo)
    };
})();