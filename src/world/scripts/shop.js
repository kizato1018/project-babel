// 初始化玩家背包 (如果沒有的話)
if (!player.inventory) player.inventory = [];

if (action === "look") {
    return `[地點] ${room.name}\n${room.description}\n[商人]: "要買點代碼嗎？輸入 'list' 查看商品。"`;
}

// 移動邏輯 (回頭路)
if (action.startsWith('go ')) {
    const direction = action.split(' ')[1];
    if (room.exits && room.exits[direction]) {
        player.currentRoomId = room.exits[direction];
        return `你往 [${direction}] 走去...`;
    }
    return "撞牆了。";
}

// 列出商品
if (action === "list") {
    return `
    === 黑市清單 ===
    1. potion (回復 50 HP) - 價格: 20 Bit
    2. firewall (防禦掛件) - 價格: 100 Bit
    (輸入 'buy potion' 購買)
    `;
}

// 購買邏輯
if (action.startsWith('buy ')) {
    const item = action.split(' ')[1];

    if (item === "potion") {
        if (player.gold >= 20) {
            player.gold -= 20;
            player.hp = Math.min(player.hp + 50, 100); // 補血，上限100
            player.inventory.push("potion");
            return `[交易成功] 你喝下了藥水，HP 回復了！剩餘金幣: ${player.gold}`;
        } else {
            return `[交易失敗] 你的錢不夠 (需要 20 Bit)。快去 'hack' 賺點錢吧。`;
        }
    }
    
    return "商人疑惑地看著你：「我們沒賣那個。」";
}

return "指令無效。試試: look, list, buy potion, go south";