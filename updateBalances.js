const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");

// ✅ MySQL Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || "sql8.freesqldatabase.com",
  user: process.env.DB_USER || "sql8792916",
  password: process.env.DB_PASS || "iEdb2pFif4",
  database: process.env.DB_NAME || "sql8792916",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ============================
// Helper: Calculate New Balance
// ============================
function calculateNewBalance(currentBalance, planType) {
  let newBalance = parseFloat(currentBalance);
  if (isNaN(newBalance)) newBalance = 0;

  switch ((planType || "free").toLowerCase()) {
    case "free":
      newBalance = 0;
      break;
    case "basic":
      newBalance += Math.random() * 0.1 - 0.05;
      newBalance = Math.min(Math.max(newBalance, 4), 8);
      break;
    case "professional":
      newBalance += Math.random() * 0.2 - 0.1;
      newBalance = Math.min(Math.max(newBalance, 10), 15);
      break;
    case "expertise":
      newBalance += Math.random() * 0.3 - 0.15;
      newBalance = Math.min(Math.max(newBalance, 15), 20);
      break;
    default:
      newBalance += Math.random() * 0.1 - 0.05;
  }

  return parseFloat(newBalance.toFixed(2));
}

// ============================
// Helper: Send Alert Email
// ============================
async function sendAlertEmail(user, type) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "efenteng1@gmail.com",
        pass: "hrzc cuih sssd ttja",
      },
    });

    let subject, html;
    if (type === "stopLoss") {
      subject = "🚨 Stop-Loss Triggered — Mining Paused";
      html = `<div style="font-family: Arial, sans-serif; padding:20px;"><h2>Stop-Loss Triggered</h2><p>Hello ${user.username}, mining paused. Balance: £${user.balance}, Stop-Loss: £${user.stop_loss}</p></div>`;
    } else if (type === "takeProfit") {
      subject = "💰 Take-Profit Reached — Mining Paused";
      html = `<div style="font-family: Arial, sans-serif; padding:20px;"><h2>Take-Profit Reached</h2><p>Hello ${user.username}, mining paused. Balance: £${user.balance}, Take-Profit: £${user.take_profit}</p></div>`;
    }

    await transporter.sendMail({
      from: '"HYPERCOIN ALERTS" <efenteng1@gmail.com>',
      to: user.email,
      subject,
      html,
    });

    console.log(`${type} email sent to ${user.username}`);
  } catch (err) {
    console.error(`Error sending ${type} email to ${user.email}:`, err);
  }
}

// ============================
// Task: Process a single user
// ============================
async function processUser(user) {
  try {
    // 1️⃣ Update balance
    const newBalance = calculateNewBalance(user.balance, user.user_type);
    await pool.query(
      "UPDATE hypercoin_users SET balance = ?, last_updated = NOW() WHERE id = ?",
      [newBalance, user.id]
    );
    console.log(`Balance updated for ${user.username}: £${newBalance}`);

    // 2️⃣ Stop-Loss
    if (user.stop_loss != null && newBalance <= user.stop_loss) {
      await pool.query(
        "UPDATE hypercoin_users SET mining_state = ?, stop_loss = NULL WHERE id = ?",
        ["inactive", user.id]
      );
      console.log(`Stop-loss triggered for ${user.username}`);
      await sendAlertEmail({ ...user, balance: newBalance }, "stopLoss");
    }

    // 3️⃣ Take-Profit
    if (user.take_profit != null && newBalance >= user.take_profit) {
      await pool.query(
        "UPDATE hypercoin_users SET mining_state = ?, take_profit = NULL WHERE id = ?",
        ["inactive", user.id]
      );
      console.log(`Take-profit triggered for ${user.username}`);
      await sendAlertEmail({ ...user, balance: newBalance }, "takeProfit");
    }
  } catch (err) {
    console.error(`Error processing ${user.username}:`, err);
  }
}

// ============================
// Main Cron Job
// ============================
async function updateUserBalances() {
  console.log("=== Cron Job Started ===", new Date().toLocaleString());

  try {
    const [miners] = await pool.query(
      "SELECT * FROM hypercoin_users WHERE mining_state = 'active'"
    );

    console.log(`Found ${miners.length} active miners`);
    if (!miners.length) {
      console.log("No active miners found");
      return pool.end(() => console.log("=== Cron Job Finished ==="));
    }

    // Process all miners in parallel
    await Promise.all(miners.map(processUser));

    console.log("All users processed");
    await pool.end();
    console.log("=== Cron Job Finished ===");
  } catch (err) {
    console.error("Error running cron job:", err);
    await pool.end();
  }
}

// ============================
// Start Cron Job
// ============================
updateUserBalances();
