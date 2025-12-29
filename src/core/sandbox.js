const ivm = require('isolated-vm');

// 初始化一個隔離的虛擬機環境 (Isolate)
// memoryLimit: 限制這個 VM 最多只能用 8MB 記憶體 (超過會報錯)
const isolate = new ivm.Isolate({ memoryLimit: 8 }); 

/**
 * 執行玩家腳本 (附帶物理限制)
 * @param {string} code - 玩家代碼
 * @param {object} context - { player, room, action }
 */
function runPlayerScript(code, context) {
    const start = process.hrtime.bigint(); // 開始計時 (奈秒級)

    try {
        // 1. 建立一個新的 Context (每一次執行都是乾淨的)
        const ivmContext = isolate.createContextSync();
        const jail = ivmContext.global;
        
        // 2. 注入全域變數 (只給白名單)
        // 為了讓玩家能用 console.log，我們需要把主程序的 log 傳進去
        jail.setSync('global', jail.derefInto());
        jail.setSync('log', new ivm.Reference(function(msg) {
             console.log(`[PlayerLog]: ${msg}`);
        }));

        // 3. 準備數據傳輸 (Copy In)
        // 因為是隔離環境，我們必須把 player 和 room 資料 "拷貝" 進去
        // 我們使用 JSON 序列化來傳輸 (最安全，雖然耗一點點效能)
        jail.setSync('_inputData', new ivm.ExternalCopy(context).copyInto());

        // 4. 包裝玩家代碼
        // 我們把玩家代碼包在一個函數裡，接收 input，回傳 { message, updatedPlayer }
        const wrappedCode = `
            const { player, room, action, lib } = _inputData;
            
            // 模擬一些基礎庫
            const Math = global.Math;
            const parseInt = global.parseInt;

            function run() {
                // --- 玩家代碼開始 ---
                ${code}
                // --- 玩家代碼結束 ---
            }
            
            // 執行玩家邏輯
            const msg = run();
            
            // 回傳結果與最新的 player 狀態 (因為玩家可能修改了 player.gold)
            JSON.stringify({ message: msg, player: player });
        `;

        // 5. 編譯並執行
        const script = isolate.compileScriptSync(wrappedCode);
        
        // timeout: 50ms (CPU 時間限制，這就是 Gas Limit 的硬上限)
        const resultStr = script.runSync(ivmContext, { timeout: 50 });
        
        // 6. 讀取結果 (Copy Out)
        const result = JSON.parse(resultStr);

        // 7. 計算消耗 (Ticks)
        const end = process.hrtime.bigint();
        const durationNs = end - start;
        const durationMs = Number(durationNs) / 1e6;
        const ticks = Math.ceil(durationMs); // 1 Tick = 1 ms

        return {
            success: true,
            result: result.message,
            updatedPlayer: result.player, // 這是玩家改過的新狀態
            metrics: {
                ticks: ticks,
                memory: 0 // IVM 難以精確取得單次執行記憶體，暫時忽略
            }
        };

    } catch (error) {
        // 就算失敗，也要計算時間消耗
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1e6;
        
        return { 
            success: false, 
            error: error.message,
            metrics: { ticks: Math.ceil(durationMs) }
        };
    }
}

module.exports = { runPlayerScript };