document.addEventListener('DOMContentLoaded', () => {
    const BOARD_SIZE = 15;
    const boardElement = document.getElementById('board');
    const statusElement = document.querySelector('.status');
    const scoreElement = document.querySelector('.score');
    const gameOverElement = document.getElementById('game-over');
    const resultTextElement = document.getElementById('result-text');
    const continueBtn = document.getElementById('continue-btn');
    const warningTextElement = document.getElementById('warning-text');
    const penaltyProgressElement = document.getElementById('penalty-progress');
    const cheatWarningElement = document.querySelector('.cheat-warning');

    let board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
    let currentPlayer = 1; // 1为玩家(黑棋)，2为AI(白棋)
    let gameOver = false;
    let scores = [0, 0]; // [玩家分数, AI分数]
    let lastMoveTime = Date.now();
    let moveInterval = 0;
    let aiThinking = false;

    // 初始化棋盘
    function initBoard() {
        boardElement.innerHTML = '';
        board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
        gameOver = false;
        currentPlayer = 1;
        
        for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = i;
                cell.dataset.col = j;
                cell.addEventListener('click', () => makeMove(i, j));
                boardElement.appendChild(cell);
            }
        }
        
        statusElement.textContent = '你的回合';
    }

    // 玩家落子
    async function makeMove(row, col) {
        if (gameOver || currentPlayer !== 1 || board[row][col] !== 0 || aiThinking) return;

        // 检测移动速度是否异常
        const now = Date.now();
        moveInterval = now - lastMoveTime;
        lastMoveTime = now;
        
        // 发送移动数据给作弊检测系统
        if (typeof checkCheating === 'function') {
            checkCheating({
                row,
                col,
                moveInterval,
                board: JSON.parse(JSON.stringify(board)),
                currentPlayer
            });
        }

        placePiece(row, col, 1);
        
        if (checkWin(row, col, 1)) {
            endGame('你赢了!');
            scores[0]++;
            updateScore();
            return;
        }
        
        if (isBoardFull()) {
            endGame('平局!');
            return;
        }
        
        currentPlayer = 2;
        statusElement.textContent = 'AI思考中...';
        aiThinking = true;
        
        // AI落子
        setTimeout(async () => {
            const [aiRow, aiCol] = await makeAIMove();
            placePiece(aiRow, aiCol, 2);
            
            if (checkWin(aiRow, aiCol, 2)) {
                endGame('AI赢了!');
                scores[1]++;
                updateScore();
                aiThinking = false;
                return;
            }
            
            if (isBoardFull()) {
                endGame('平局!');
                aiThinking = false;
                return;
            }
            
            currentPlayer = 1;
            statusElement.textContent = '你的回合';
            aiThinking = false;
        }, 100); // 最小延迟确保UI更新
    }

    // 放置棋子
    function placePiece(row, col, player) {
        board[row][col] = player;
        const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
        cell.classList.add(player === 1 ? 'black' : 'white');
    }

    // AI移动逻辑
    async function makeAIMove() {
        const startTime = Date.now();
        const aiParams = eloSystem.getAIParams();
        const thinkTime = 300 + (aiParams.searchDepth * 400) + Math.random() * 500;
        
        // 模拟AI犯错
        if (Math.random() < aiParams.mistakeRate) {
            const randomMove = selectRandomMove();
            if (randomMove) return completeMove(randomMove, startTime, thinkTime);
        }

        // 1. 检查AI是否有立即获胜的机会
        const winningMove = findWinningMove(2, aiParams.searchDepth);
        if (winningMove) return completeMove(winningMove, startTime, thinkTime);
        
        // 2. 检查玩家是否有立即获胜的机会需要阻止
        const blockingMove = findWinningMove(1, aiParams.searchDepth);
        if (blockingMove) return completeMove(blockingMove, startTime, thinkTime);
        
        // 3. 寻找战略性的最佳位置
        const bestMove = findStrategicMove(aiParams);
        if (bestMove) return completeMove(bestMove, startTime, thinkTime);
        
        // 4. 如果没有明显的好位置，选择最优位置
        return completeMove(selectOptimalMove(aiParams), startTime, thinkTime);
    }

    // 完成移动并确保思考时间合理
    async function completeMove(move, startTime, thinkTime) {
        const elapsed = Date.now() - startTime;
        if (elapsed < thinkTime) {
            await new Promise(resolve => setTimeout(resolve, thinkTime - elapsed));
        }
        return move;
    }

    // 寻找获胜机会 (带搜索深度)
    function findWinningMove(player, depth = 1) {
        // 先检查当前局面是否有立即获胜的机会
        for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
                if (board[i][j] === 0) {
                    board[i][j] = player;
                    if (checkWin(i, j, player)) {
                        board[i][j] = 0;
                        return [i, j];
                    }
                    board[i][j] = 0;
                }
            }
        }
        
        // 如果深度>1，检查下一步是否有必胜机会
        if (depth > 1) {
            for (let i = 0; i < BOARD_SIZE; i++) {
                for (let j = 0; j < BOARD_SIZE; j++) {
                    if (board[i][j] === 0) {
                        board[i][j] = player;
                        const opponent = player === 1 ? 2 : 1;
                        let canWin = true;
                        
                        // 检查对手是否有阻止方法
                        for (let x = 0; x < BOARD_SIZE && canWin; x++) {
                            for (let y = 0; y < BOARD_SIZE && canWin; y++) {
                                if (board[x][y] === 0) {
                                    board[x][y] = opponent;
                                    if (!findWinningMove(player, depth - 1)) {
                                        canWin = false;
                                    }
                                    board[x][y] = 0;
                                }
                            }
                        }
                        
                        board[i][j] = 0;
                        if (canWin) return [i, j];
                    }
                }
            }
        }
        
        return null;
    }

    // 寻找战略性的最佳位置
    function findStrategicMove(aiParams) {
        const attackScore = evaluateBoard(2, aiParams);
        const defenseScore = evaluateBoard(1, aiParams);
        
        let maxAttackScore = -Infinity;
        let maxDefenseScore = -Infinity;
        let bestAttackMove = null;
        let bestDefenseMove = null;
        
        for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
                if (board[i][j] === 0) {
                    // 应用难度参数调整评分
                    const attack = attackScore[i][j] * aiParams.aggressiveness;
                    const defense = defenseScore[i][j] * aiParams.defensiveness;
                    
                    if (attack > maxAttackScore) {
                        maxAttackScore = attack;
                        bestAttackMove = [i, j];
                    }
                    if (defense > maxDefenseScore) {
                        maxDefenseScore = defense;
                        bestDefenseMove = [i, j];
                    }
                }
            }
        }
        
        // 平衡进攻和防守 (根据难度调整权重)
        const attackWeight = 0.4 + (aiParams.aggressiveness * 0.4);
        const defenseWeight = 0.6 + (aiParams.defensiveness * 0.3);
        
        if (maxAttackScore * attackWeight >= maxDefenseScore * defenseWeight) {
            return bestAttackMove;
        } else {
            return bestDefenseMove;
        }
    }

    // 评估棋盘并返回评分矩阵
    function evaluateBoard(player, aiParams) {
        const scores = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
        const searchDepth = aiParams ? aiParams.searchDepth : 1;
        
        for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
                if (board[i][j] === 0) {
                    // 基础分数 - 中心优先 (受难度影响)
                    const centerDist = Math.sqrt(Math.pow(i - 7, 2) + Math.pow(j - 7, 2));
                    scores[i][j] = (14 - centerDist) * (1 + (searchDepth * 0.1));
                    
                    // 评估四个方向的潜力
                    scores[i][j] += evaluateDirection(i, j, 0, 1, player, searchDepth)
                                 + evaluateDirection(i, j, 1, 0, player, searchDepth)
                                 + evaluateDirection(i, j, 1, 1, player, searchDepth)
                                 + evaluateDirection(i, j, 1, -1, player, searchDepth);
                    
                    // 增加特殊位置的权重
                    if ((i === 3 || i === 11) && (j === 3 || j === 7 || j === 11)) {
                        scores[i][j] += 5 * searchDepth;
                    }
                }
            }
        }
        
        return scores;
    }

    // 评估特定方向的潜力
    function evaluateDirection(row, col, dx, dy, player, depth = 1) {
        let score = 0;
        let playerCount = 0;
        let emptyCount = 0;
        let potential = 0;
        
        // 检查两个方向（正向和反向）
        for (let direction = -1; direction <= 1; direction += 2) {
            let currentPlayerCount = 0;
            let currentEmptyCount = 0;
            let blocked = false;
            
            for (let step = 1; step <= 4; step++) {
                const r = row + step * direction * dx;
                const c = col + step * direction * dy;
                
                if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
                    if (board[r][c] === player) {
                        currentPlayerCount++;
                    } else if (board[r][c] === 0) {
                        currentEmptyCount++;
                        // 如果遇到空位后还有连续棋子，增加潜力
                        if (step > 1 && board[r - direction * dx][c - direction * dy] === player) {
                            potential++;
                        }
                        break;
                    } else {
                        blocked = true;
                        break;
                    }
                } else {
                    blocked = true;
                    break;
                }
            }
            
            if (!blocked) {
                playerCount += currentPlayerCount;
                emptyCount += currentEmptyCount;
            }
        }
        
        // 根据连子数和空位计算分数
        const total = playerCount + emptyCount;
        if (playerCount >= 4) score += 100000; // 连五
        else if (playerCount === 3 && emptyCount >= 1) score += 10000; // 活四
        else if (playerCount === 2 && emptyCount >= 2) score += 1000;  // 活三
        else if (playerCount === 1 && emptyCount >= 3) score += 100;   // 活二
        else if (potential >= 2) score += 500; // 潜在连子
        
        // 深度搜索增强
        if (depth > 1 && score > 0) {
            score *= (1 + (depth * 0.2));
        }
        
        return score;
    }

    // 选择最优位置（当没有明显好位置时）
    function selectOptimalMove(aiParams) {
        const scores = evaluateBoard(2, aiParams);
        let maxScore = -Infinity;
        const bestMoves = [];
        
        // 找出所有最高分的位置
        for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
                if (board[i][j] === 0) {
                    if (scores[i][j] > maxScore) {
                        maxScore = scores[i][j];
                        bestMoves.length = 0;
                        bestMoves.push([i, j]);
                    } else if (scores[i][j] === maxScore) {
                        bestMoves.push([i, j]);
                    }
                }
            }
        }
        
        // 随机选择一个最佳位置（增加不可预测性）
        return bestMoves.length > 0 
            ? bestMoves[Math.floor(Math.random() * bestMoves.length)]
            : selectRandomMove();
    }

    // 选择随机移动（备用方案）
    function selectRandomMove() {
        const emptyCells = [];
        const centerBias = 3; // 中心偏好范围
        
        for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
                if (board[i][j] === 0) {
                    // 给中心区域更高的权重
                    const distanceToCenter = Math.sqrt(Math.pow(i - 7, 2) + Math.pow(j - 7, 2));
                    const weight = 10 / (1 + distanceToCenter);
                    
                    // 如果在对战早期，更倾向于中心区域
                    const moveCount = Array(BOARD_SIZE).fill().reduce((sum, _, x) => 
                        sum + Array(BOARD_SIZE).fill().reduce((s, _, y) => 
                            s + (board[x][y] !== 0 ? 1 : 0), 0), 0);
                    const centerWeight = moveCount < 10 ? 5 : 1;
                    
                    emptyCells.push({
                        row: i,
                        col: j,
                        weight: weight * (distanceToCenter <= centerBias ? centerWeight : 1)
                    });
                }
            }
        }
        
        if (emptyCells.length === 0) return [0, 0];
        
        // 根据权重随机选择
        const totalWeight = emptyCells.reduce((sum, cell) => sum + cell.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const cell of emptyCells) {
            if (random < cell.weight) {
                return [cell.row, cell.col];
            }
            random -= cell.weight;
        }
        
        return [emptyCells[0].row, emptyCells[0].col];
    }

    // 检查胜利条件
    function checkWin(row, col, player) {
        const directions = [
            [0, 1],  // 水平
            [1, 0],  // 垂直
            [1, 1],  // 对角线
            [1, -1]  // 反对角线
        ];
        
        for (const [dx, dy] of directions) {
            let count = 1;
            
            // 正向检查
            for (let i = 1; i <= 4; i++) {
                const newRow = row + i * dx;
                const newCol = col + i * dy;
                if (newRow < 0 || newRow >= BOARD_SIZE || newCol < 0 || newCol >= BOARD_SIZE || board[newRow][newCol] !== player) {
                    break;
                }
                count++;
            }
            
            // 反向检查
            for (let i = 1; i <= 4; i++) {
                const newRow = row - i * dx;
                const newCol = col - i * dy;
                if (newRow < 0 || newRow >= BOARD_SIZE || newCol < 0 || newCol >= BOARD_SIZE || board[newRow][newCol] !== player) {
                    break;
                }
                count++;
            }
            
            if (count >= 5) return true;
        }
        
        return false;
    }

    // 检查棋盘是否已满
    function isBoardFull() {
        return board.every(row => row.every(cell => cell !== 0));
    }

    // 结束游戏
    function endGame(message) {
        gameOver = true;
        resultTextElement.textContent = message;
        gameOverElement.classList.remove('hidden');
        
        // 更新ELO评分
        if (message.includes('你赢了')) {
            eloSystem.updateEloRatings('player');
        } else if (message.includes('AI赢了')) {
            eloSystem.updateEloRatings('ai');
        }
    }

    // 更新分数显示
    function updateScore() {
        scoreElement.textContent = `${scores[0]} : ${scores[1]}`;
    }

    // 显示作弊警告
    function showCheatWarning(message, penaltyLevel) {
        warningTextElement.textContent = message;
        penaltyProgressElement.style.width = `${penaltyLevel * 25}%`;
        
        if (penaltyLevel > 0) {
            cheatWarningElement.classList.remove('hidden');
            
            if (penaltyLevel >= 3) {
                cheatWarningElement.style.backgroundColor = '#e74c3c';
            } else if (penaltyLevel >= 2) {
                cheatWarningElement.style.backgroundColor = '#f39c12';
            } else {
                cheatWarningElement.style.backgroundColor = '#f1c40f';
            }
        } else {
            cheatWarningElement.classList.add('hidden');
        }
    }

    // 继续游戏
    continueBtn.addEventListener('click', () => {
        gameOverElement.classList.add('hidden');
        initBoard();
    });

    // 初始化游戏
    initBoard();
    
    // 暴露一些函数给作弊检测系统
    window.gameAPI = {
        endGame,
        showCheatWarning,
        getCurrentPlayer: () => currentPlayer,
        getBoard: () => JSON.parse(JSON.stringify(board))
    };
});