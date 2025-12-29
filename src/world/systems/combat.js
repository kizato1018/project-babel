// 定義在庫 (lib) 物件上，這樣所有房間都能用
lib.combat = {
    // 計算傷害公式
    attack: function(attacker, targetName) {
        // 簡單的命中率
        const hitChance = Math.random();
        if (hitChance < 0.3) {
            return { damage: 0, msg: "揮空了！" };
        }
        
        // 暴擊判定
        let damage = 10;
        let msg = "擊中了";
        
        if (hitChance > 0.9) {
            damage = 20;
            msg = "暴擊！重創了";
        }
        
        return { damage, msg };
    },
    
    // 死亡判定
    checkDead: function(hp) {
        return hp <= 0;
    }
};