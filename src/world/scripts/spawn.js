// 這個腳本會在沙盒中執行
// 變數 context 包含: player (玩家狀態), action (玩家指令)
// 1. 處理移動指令 (通用邏輯)
if (action.startsWith('go ')) {
    const direction = action.split(' ')[1]; // 例如 "north"
    
    // 檢查房間配置有沒有這個出口
    if (room.exits && room.exits[direction]) {
        // 修改玩家的位置 (這是關鍵！)
        player.currentRoomId = room.exits[direction];
        return `你離開了這裡，往 [${direction}] 走去... (請輸入 'look' 查看新環境)`;
    } else {
        return "那個方向沒有路，只有虛空。";
    }
}

if (action === "look") {
    // 稍微改進一下 look，顯示出口提示
    const exits = room.exits ? Object.keys(room.exits).join(', ') : "無";
    return `[環境掃描] ${room.description}\n[出口]: ${exits}\n[狀態] 金幣: ${player.gold}`;
}

if (action === "hack") {
    // 當玩家輸入 hack 時 (這是這個房間特有的指令)
    const luck = Math.random();
    
    if (luck > 0.5) {
        player.gold += 10;
        return "你成功駭入虛空，獲得了 10 Bit！";
    } else {
        player.hp -= 5;
        return "防火牆反擊！你受到了 5 點傷害。";
    }
}

// 預設回應
return "指令無效。試試: look, hack, go north";