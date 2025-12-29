const fastify = require('fastify')({ 
    logger: true,
    bodyLimit: 2048 // ★ 限制 1: 請求封包最大 2KB (防止上傳大檔案)
});
const { runPlayerScript } = require('./sandbox');
const fs = require('fs');
const path = require('path');
const db = require('./database');

fastify.register(require('@fastify/cors'), {
    origin: '*', // 開發階段允許所有來源。正式上線可改成您的 GitHub Pages 網址
    methods: ['GET', 'POST']
});

// --- 限制 2: 請求頻率限制 (每秒 20 次) ---
fastify.register(require('@fastify/rate-limit'), {
    max: 20,
    timeWindow: '1 second',
    errorResponseBuilder: () => ({ error: "OVERHEAT: 操作過快，系統冷卻中..." })
});

// --- 限制 3: 回傳大小監控 (Bandwidth Limiter) ---
fastify.addHook('onSend', (request, reply, payload, done) => {
    if (payload && payload.length > 4096) { // 限制回傳最大 4KB (給一點寬容度)
        const err = JSON.stringify({ error: "BANDWIDTH_EXCEEDED: 該區域數據量過大，連線被截斷。" });
        done(null, err);
    } else {
        done(null, payload);
    }
});

fastify.register(require('@fastify/websocket'));

function loadRoom(roomId) {
    try {
        const mapPath = path.join(__dirname, '../world/maps', `${roomId}.json`);
        const roomData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        const scriptPath = path.join(__dirname, '../world/scripts', roomData.script_file);
        const scriptCode = fs.readFileSync(scriptPath, 'utf8');
        return { ...roomData, scriptCode };
    } catch (err) {
        return null;
    }
}

function loadSystems() {
    const systems = {};
    const systemDir = path.join(__dirname, '../world/systems');
    if (fs.existsSync(systemDir)) {
        const files = fs.readdirSync(systemDir);
        files.forEach(file => {
            if (file.endsWith('.js')) {
                const name = file.replace('.js', '');
                systems[name] = fs.readFileSync(path.join(systemDir, file), 'utf8'); 
            }
        });
    }
    return systems;
}

// 核心 API
fastify.post('/game/action', async (request, reply) => {
    const { playerId, action } = request.body || {};
    const safePlayerId = playerId || "player1";
    
    let player = db.getPlayer(safePlayerId); 
    if (!player) {
        player = db.createPlayer(safePlayerId, {
            id: safePlayerId,
            hp: 100,
            gold: 0,
            ticks: 1000, // ★ 初始電量
            currentRoomId: "spawn",
            inventory: [],
            modules: {} // 預留給未來擴充
        });
    }

    // ★ 檢查電量
    // 預設每秒回復 1 Tick (簡單模擬)
    if (player.ticks < 1000) player.ticks += 1;
    if (player.ticks <= 0) {
        return { error: "LOW_BATTERY: 運算能量耗盡，請等待充能。" };
    }

    const room = loadRoom(player.currentRoomId);
    if (!room) return { error: "Room data corrupted" };

    const context = {
        player: player,
        room: room,
        action: action,
        lib: {} // 暫時為空，之後接上 loadSystems
    };

    // 執行沙盒
    const execution = runPlayerScript(room.scriptCode, context);

    // ★ 扣除電量 (成本 = 執行時間)
    const cost = execution.metrics.ticks;
    player.ticks -= cost;

    if (execution.success) {
        // 更新玩家狀態 (使用沙盒回傳的新狀態)
        const newPlayerState = execution.updatedPlayer;
        newPlayerState.ticks = player.ticks; // 確保電量是最新扣除後的

        db.savePlayer(safePlayerId, newPlayerState);
        
        return {
            message: execution.result,
            player_status: newPlayerState,
            metrics: { // 告訴前端花了多少資源
                cost_ticks: cost,
                remaining_ticks: newPlayerState.ticks
            }
        };
    } else {
        // 就算報錯也要扣電！
        db.savePlayer(safePlayerId, player);
        return { 
            error: "Script Error", 
            details: execution.error,
            metrics: { cost_ticks: cost }
        };
    }
});

const start = async () => {
    try {
        await fastify.listen({ port: 3000, host: '0.0.0.0' });
        console.log('★ Project Babel Core Running with Physics...');
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();