if (action === "look") {
    return `${room.description} 怪物 HP: 50`; // 簡化處理，怪物暫時沒狀態
}

if (action === "attack bug") {
    // ★ 呼叫全域系統 ★
    const result = lib.combat.attack(player, "Bug");
    
    if (result.damage > 0) {
        // 這裡只是演示，怪物血量應該要存在 room state 裡
        return `你${result.msg}怪物，造成 ${result.damage} 點傷害！`;
    } else {
        player.hp -= 5;
        return `你揮空了！怪物反擊，你受到 5 點傷害。`;
    }
}

return "試試看: attack bug";