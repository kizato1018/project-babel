require('dotenv').config();

const fastify = require('fastify')({ 
    logger: true,
    bodyLimit: 2048 // ★ 限制 1: 請求封包最大 2KB (防止上傳大檔案)
});
const { runPlayerScript } = require('./sandbox');
const fs = require('fs');
const path = require('path');
const db = require('./database');

// --- 新增依賴 ---
const crypto = require('crypto');
const simpleGit = require('simple-git');
const git = simpleGit();
// ----------------

// ★ 請設定一個秘密金鑰，之後要在 GitHub 網頁填入一樣的
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
    console.error("FATAL: WEBHOOK_SECRET is not set in .env");
    process.exit(1);
}

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

// 這是多重宇宙的入口，當有 PR 開啟或更新時觸發
fastify.post('/webhooks/github', async (request, reply) => {
    // 1. 安全驗證 (確保請求真的來自 GitHub)
    const signature = request.headers['x-hub-signature-256'];
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    const digest = 'sha256=' + hmac.update(JSON.stringify(request.body)).digest('hex');
    
    if (signature !== digest) {
        return reply.code(401).send({ error: 'Invalid signature' });
    }

    const event = request.headers['x-github-event'];
    const { action, pull_request, number } = request.body;

    // 2. 只處理 PR 開啟或更新事件
    if (event === 'pull_request' && (action === 'opened' || action === 'synchronize')) {
        console.log(`★ Multiverse Detected: PR #${number} is changing...`);
        
        try {
            await syncUniverse(number);
            return { status: 'Universe Synced', universe: `pr-${number}` };
        } catch (err) {
            console.error(err);
            return reply.code(500).send({ error: 'Universe Creation Failed' });
        }
    }

    return { status: 'Ignored' };
});

// ★★★ 新增：同步平行宇宙邏輯 ★★★
async function syncUniverse(prId) {
    // 定義平行宇宙的資料夾： data/universes/pr-{id}
    // 這樣做的好處是可以用 git worktree 讓它們共用 .git 資料，省空間
    const universeDir = path.join(__dirname, '../../data/universes', `pr-${prId}`);
    const universesRoot = path.dirname(universeDir);

    if (!fs.existsSync(universesRoot)) {
        fs.mkdirSync(universesRoot, { recursive: true });
    }

    // 1. 抓取該 PR 的最新程式碼
    // 指令等同於：git fetch origin pull/10/head:pr-10
    console.log(`Fetching PR #${prId}...`);
    await git.fetch('origin', `pull/${prId}/head:pr-${prId}`);

    // 2. 建立或更新 Worktree (工作樹)
    if (!fs.existsSync(universeDir)) {
        console.log(`Creating new universe at ${universeDir}...`);
        // 建立一個新資料夾，裡面裝著該 PR 的程式碼
        await git.worktree(['add', universeDir, `pr-${prId}`]);
    } else {
        console.log(`Updating existing universe #${prId}...`);
        // 如果宇宙已經存在，就強制更新到最新狀態
        // 必須切換到該目錄執行 reset
        await simpleGit(universeDir).reset(['--hard', `pr-${prId}`]);
    }
}
// ------------------------------------

function loadRoom(roomId, universe = 'main') {
    try {
        // 定義標準路徑 (主宇宙)
        const mainMapPath = path.join(__dirname, '../world/maps', `${roomId}.json`);
        let targetMapPath = mainMapPath;
        let activeUniverse = 'main';

        // 1. 如果玩家不在主宇宙，嘗試尋找平行宇宙的檔案
        if (universe !== 'main') {
            // PR 的檔案路徑： data/universes/pr-ID/src/world/maps/xxx.json
            const prMapPath = path.join(__dirname, '../../data/universes', universe, 'src/world/maps', `${roomId}.json`);
            
            if (fs.existsSync(prMapPath)) {
                targetMapPath = prMapPath;
                activeUniverse = universe;
                console.log(`[Overlay] Loaded ${roomId} from ${universe}`);
            }
        }

        // 2. 讀取地圖資料
        if (!fs.existsSync(targetMapPath)) return null;
        const roomData = JSON.parse(fs.readFileSync(targetMapPath, 'utf8'));

        // 3. 處理腳本 (Script) 的覆蓋
        // 腳本也要依樣畫葫蘆：先找 PR 版，再找主宇宙版
        const scriptName = roomData.script_file;
        let targetScriptPath = path.join(__dirname, '../world/scripts', scriptName); // 預設主宇宙

        if (universe !== 'main') {
            const prScriptPath = path.join(__dirname, '../../data/universes', universe, 'src/world/scripts', scriptName);
            if (fs.existsSync(prScriptPath)) {
                targetScriptPath = prScriptPath;
            }
        }

        // 讀取腳本內容
        const scriptCode = fs.readFileSync(targetScriptPath, 'utf8');

        // 回傳資料 (多加一個 source 欄位方便 Debug)
        return { 
            ...roomData, 
            scriptCode, 
            _source: activeUniverse 
        };

    } catch (err) {
        console.error(`LoadRoom Error: ${err.message}`);
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
            currentRoomId: "spawn",
            universe: "main", // ★ 新增：預設在主宇宙
            inventory: [],
            modules: {} 
        });
    }

    // 確保舊玩家也有 universe 欄位 (資料庫遷移)
    if (!player.universe) player.universe = "main";

    // ★★★ 新增：時空跳躍指令 (系統級指令，不進沙盒) ★★★
    if (action.startsWith('/switch ')) {
        const targetUniverse = action.split(' ')[1]; // 例如 "pr-5" 或 "main"
        
        // 檢查目標宇宙是否存在
        if (targetUniverse === 'main') {
            player.universe = 'main';
        } else {
            const universePath = path.join(__dirname, '../../data/universes', targetUniverse);
            if (!fs.existsSync(universePath)) {
                return { error: `Universe '${targetUniverse}' not found. (尚未同步或不存在)` };
            }
            player.universe = targetUniverse;
        }

        db.savePlayer(safePlayerId, player);
        return { 
            message: `[SYSTEM] 時空跳躍成功。當前宇宙: ${player.universe}\n請輸入 'look' 確認周遭環境。`,
            player_status: player 
        };
    }
    // ------------------------------------------------

    // ★ 傳入 player.universe 給載入器
    const room = loadRoom(player.currentRoomId, player.universe);
    if (!room) return { error: "Room data corrupted or missing in this universe." };

    const context = {
        player: player,
        room: room,
        action: action,
        lib: {} 
    };

    const execution = runPlayerScript(room.scriptCode, context);

    if (execution.success) {
        const newPlayerState = execution.updatedPlayer;
        db.savePlayer(safePlayerId, newPlayerState);
        return {
            message: execution.result,
            player_status: newPlayerState
        };
    } else {
        db.savePlayer(safePlayerId, player);
        return { 
            error: "Script Error", 
            details: execution.error
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