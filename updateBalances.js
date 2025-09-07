const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");

// ✅ MySQL Pool using environment variables
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
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
        user: "shypercoin@gmail.com",
        pass: "kqqy ptdr syib nlye", // 🔑 Replace with Google App Password
      },
    });

    let subject, html;
    if (type === "stopLoss") {
      subject = "🚨 Stop-Loss Triggered — Mining Paused";
      html = `
      <div style="font-family: Arial, sans-serif; padding: 24px; background-color: #f9f9f9; border-radius: 10px; border: 1px solid #ddd; max-width: 500px; margin: auto;">
        <h2 style="color:#c0392b; text-align:center; margin-bottom: 16px;">🚨 Stop-Loss Triggered</h2>
        <p style="font-size: 16px; color:#333;">Dear <strong>${user.username}</strong>,</p>
        <p style="font-size: 15px; color:#555; line-height: 1.6;">
          Your mining session has been <strong>paused</strong> because your balance dropped below your stop-loss threshold.
        </p>
        <p style="font-size: 15px; color:#333;">
          <strong>Current Balance:</strong> $${user.balance}
        </p>
        <p style="font-size: 14px; color:#777; margin-top: 16px;">
          You can log in to your dashboard to review your settings and resume mining when ready.
        </p>
      </div>`;
    } else {
      subject = "💰 Take-Profit Reached — Mining Paused";
      html = `
      <div style="font-family: Arial, sans-serif; padding: 24px; background-color: #f9f9f9; border-radius: 10px; border: 1px solid #ddd; max-width: 500px; margin: auto;">
        <h2 style="color:#27ae60; text-align:center; margin-bottom: 16px;">💰 Take-Profit Reached</h2>
        <p style="font-size: 16px; color:#333;">Dear <strong>${user.username}</strong>,</p>
        <p style="font-size: 15px; color:#555; line-height: 1.6;">
          Congratulations! Your mining session has been <strong>paused</strong> as your balance reached your take-profit target.
        </p>
        <p style="font-size: 15px; color:#333;">
          <strong>Current Balance:</strong> $${user.balance}
        </p>
        <p style="font-size: 14px; color:#777; margin-top: 16px;">
          You can log in to your dashboard to withdraw profits or adjust your mining preferences.
        </p>
      </div>`;
    }

    console.log(`📧 Attempting to send ${type} email to ${user.email}...`);
    const info = await transporter.sendMail({
      from: '"HYPERCOIN ALERTS" <shypercoin@gmail.com>',
      to: user.email,
      subject,
      html,
    });

    console.log(`✅ ${type} email sent: ${info.response}`);
  } catch (err) {
    console.error(`❌ Failed to send ${type} email:`, err);
  }
}

// ============================
// Helper: Log User Message
// ============================
async function logUserMessage(connection, username, message, type) {
  try {
    await connection.query(
      "INSERT INTO user_messages (username, message, type, interactions) VALUES (?, ?, ?, 'notseen')",
      [username, message, type]
    );
    console.log(`📝 Logged message for ${username}: ${message}`);
  } catch (err) {
    console.error("❌ Failed to insert user message:", err);
  }
}

// ============================
// Main Task: Update Balances
// ============================
async function updateUserBalances() {
  console.log("=== Cron Job Started ===", new Date().toLocaleString());

  let connection;
  try {
    connection = await pool.getConnection();

    const [miners] = await connection.query(
      "SELECT * FROM hypercoin_users WHERE mining_state = 'active'"
    );

    console.log(`Found ${miners.length} active miners`);
    if (!miners.length) return shutdown("No active miners found");

    for (const miner of miners) {
      try {
        const newBalance = calculateNewBalance(miner.balance, miner.user_type);

        await connection.query(
          "UPDATE hypercoin_users SET balance = ?, last_updated = NOW() WHERE id = ?",
          [newBalance, miner.id]
        );

        console.log(`💰 Balance updated for ${miner.username}: $${newBalance}`);

        miner.balance = newBalance;

        if (miner.stop_loss != null && newBalance <= miner.stop_loss) {
          console.log(`⛔ Stop-loss triggered for ${miner.username}`);
          await connection.query(
            "UPDATE hypercoin_users SET mining_state = ?, stop_loss = NULL WHERE id = ?",
            ["inactive", miner.id]
          );
          await sendAlertEmail(miner, "stopLoss");
          await logUserMessage(
            connection,
            miner.username,
            `Stop-loss triggered. Mining paused. Balance: $${newBalance}`,
            "stop_loss"
          );
        }

        if (miner.take_profit != null && newBalance >= miner.take_profit) {
          console.log(`🏆 Take-profit triggered for ${miner.username}`);
          await connection.query(
            "UPDATE hypercoin_users SET mining_state = ?, take_profit = NULL WHERE id = ?",
            ["inactive", miner.id]
          );
          await sendAlertEmail(miner, "takeProfit");
          await logUserMessage(
            connection,
            miner.username,
            `Take-profit triggered. Mining paused. Balance: $${newBalance}`,
            "take_profit"
          );
        }
      } catch (minerErr) {
        console.error(`❌ Error processing ${miner.username}:`, minerErr);
      }
    }

    shutdown("All users processed.");
  } catch (err) {
    console.error("❌ Error running balance update:", err);
    shutdown();
  } finally {
    if (connection) connection.release();
  }
}

// ✅ Properly close pool and exit
function shutdown(message) {
  if (message) console.log(message);
  console.log("Closing DB pool...");
  pool.end(() => {
    console.log("=== Cron Job Finished ===");
    process.exit(0);
  });
}

updateUserBalances();
