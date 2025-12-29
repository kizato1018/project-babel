const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 確保 data 資料夾存在
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)){
    fs.mkdirSync(dataDir);
}

// 連接資料庫 (如果檔案不存在會自動建立)
const db = new Database(path.join(dataDir, 'game.db'));

// 初始化資料表：如果 players 表不存在就建立
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    data TEXT
  )
`);

// 準備 SQL 語句 (Prepared Statements 效能較好且防注入)
const getPlayerStmt = db.prepare('SELECT data FROM players WHERE id = ?');
const insertPlayerStmt = db.prepare('INSERT INTO players (id, data) VALUES (?, ?)');
const updatePlayerStmt = db.prepare('UPDATE players SET data = ? WHERE id = ?');

module.exports = {
  // 取得玩家資料，如果沒有就回傳 null
  getPlayer: (id) => {
    const row = getPlayerStmt.get(id);
    return row ? JSON.parse(row.data) : null;
  },

  // 建立新玩家
  createPlayer: (id, initialData) => {
    const dataStr = JSON.stringify(initialData);
    insertPlayerStmt.run(id, dataStr);
    return initialData;
  },

  // 儲存玩家資料
  savePlayer: (id, data) => {
    const dataStr = JSON.stringify(data);
    updatePlayerStmt.run(dataStr, id);
  }
};