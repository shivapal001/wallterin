import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("database.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    mobile TEXT UNIQUE,
    password TEXT,
    age INTEGER,
    dep_balance REAL DEFAULT 0,
    win_balance REAL DEFAULT 0,
    bonus_balance REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    description TEXT,
    amount REAL,
    type INTEGER,
    timestamp INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS game_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period INTEGER,
    color TEXT,
    num INTEGER,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    period INTEGER,
    bet_type TEXT,
    bet_val TEXT,
    amount REAL,
    pnl REAL DEFAULT 0,
    won INTEGER DEFAULT 0,
    resolved INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/register", (req, res) => {
    const { name, mobile, password, age } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO users (name, mobile, password, age, dep_balance, bonus_balance) VALUES (?, ?, ?, ?, ?, ?)");
      const info = stmt.run(name, mobile, password, age, 500, 50);
      
      const userId = info.lastInsertRowid;
      db.prepare("INSERT INTO transactions (user_id, description, amount, type, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(userId, "Welcome Bonus", 50, 1, Date.now());
      db.prepare("INSERT INTO transactions (user_id, description, amount, type, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(userId, "Signup Deposit", 500, 1, Date.now());

      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
      res.json({ success: true, user });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  app.post("/api/login", (req, res) => {
    const { mobile, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE mobile = ? AND password = ?").get(mobile, password);
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  });

  app.get("/api/user/:mobile", (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE mobile = ?").get(req.params.mobile);
    if (user) {
      const tx = db.prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20").all(user.id);
      const bets = db.prepare("SELECT * FROM bets WHERE user_id = ? ORDER BY id DESC LIMIT 30").all(user.id);
      res.json({ success: true, user, tx, bets });
    } else {
      res.status(404).json({ success: false });
    }
  });

  app.post("/api/bet", (req, res) => {
    const { mobile, period, type, val, amount } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE mobile = ?").get(mobile);
    if (!user) return res.status(404).json({ success: false });

    const total = user.dep_balance + user.win_balance + user.bonus_balance;
    if (amount > total) return res.status(400).json({ success: false, message: "Insufficient balance" });

    // Deduct balance
    let newDep = user.dep_balance;
    let newWin = user.win_balance;
    let newBonus = user.bonus_balance;

    if (newDep >= amount) {
      newDep -= amount;
    } else if (newWin + newDep >= amount) {
      const remaining = amount - newDep;
      newDep = 0;
      newWin -= remaining;
    } else {
      newBonus -= amount;
    }

    db.prepare("UPDATE users SET dep_balance = ?, win_balance = ?, bonus_balance = ? WHERE id = ?")
      .run(newDep, newWin, newBonus, user.id);

    db.prepare("INSERT INTO bets (user_id, period, bet_type, bet_val, amount) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, period, type, val, amount);

    db.prepare("INSERT INTO transactions (user_id, description, amount, type, timestamp) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, `Bet - ${val}`, -amount, -1, Date.now());

    res.json({ success: true });
  });

  app.get("/api/game-history", (req, res) => {
    const history = db.prepare("SELECT * FROM game_history ORDER BY id DESC LIMIT 50").all();
    res.json({ success: true, history });
  });

  app.post("/api/resolve-round", (req, res) => {
    const { period, color, num } = req.body;
    
    // Save game history
    db.prepare("INSERT INTO game_history (period, color, num, timestamp) VALUES (?, ?, ?, ?)")
      .run(period, color, num, Date.now());

    // Resolve bets
    const bets = db.prepare("SELECT * FROM bets WHERE period = ? AND resolved = 0").all(period);
    
    for (const bet of bets as any[]) {
      let won = 0;
      let pnl = -bet.amount;
      const COLOR_MULT: any = { Green: 2, Red: 2, Violet: 4.5 };
      const NUM_MULT = 9;

      if (bet.bet_type === 'color') {
        if (bet.bet_val === color || (bet.bet_val === 'Violet' && (color === 'Violet' || num === 5 || num === 0))) {
          won = 1;
          pnl = Math.round(bet.amount * COLOR_MULT[color === 'Violet' ? 'Violet' : color]);
        }
      } else {
        if (parseInt(bet.bet_val) === num) {
          won = 1;
          pnl = Math.round(bet.amount * NUM_MULT);
        }
      }

      db.prepare("UPDATE bets SET won = ?, pnl = ?, resolved = 1 WHERE id = ?").run(won, pnl, bet.id);

      if (won) {
        db.prepare("UPDATE users SET win_balance = win_balance + ? WHERE id = ?").run(pnl, bet.user_id);
        db.prepare("INSERT INTO transactions (user_id, description, amount, type, timestamp) VALUES (?, ?, ?, ?, ?)")
          .run(bet.user_id, `Win - ${color} (${num})`, pnl, 1, Date.now());
      } else {
        db.prepare("INSERT INTO transactions (user_id, description, amount, type, timestamp) VALUES (?, ?, ?, ?, ?)")
          .run(bet.user_id, `Loss - ${color} (${num})`, pnl, -1, Date.now());
      }
    }

    res.json({ success: true });
  });

  app.post("/api/wallet/deposit", (req, res) => {
    const { mobile, amount, method } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE mobile = ?").get(mobile);
    if (!user) return res.status(404).json({ success: false });

    db.prepare("UPDATE users SET dep_balance = dep_balance + ? WHERE id = ?").run(amount, user.id);
    db.prepare("INSERT INTO transactions (user_id, description, amount, type, timestamp) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, `Deposit via ${method}`, amount, 1, Date.now());

    res.json({ success: true });
  });

  app.post("/api/wallet/withdraw", (req, res) => {
    const { mobile, amount, method } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE mobile = ?").get(mobile);
    if (!user) return res.status(404).json({ success: false });

    if (user.win_balance < amount) return res.status(400).json({ success: false, message: "Insufficient winnings" });

    db.prepare("UPDATE users SET win_balance = win_balance - ? WHERE id = ?").run(amount, user.id);
    db.prepare("INSERT INTO transactions (user_id, description, amount, type, timestamp) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, `Withdrawal via ${method}`, -amount, -1, Date.now());

    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
