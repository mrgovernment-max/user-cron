const mysql = require("mysql2");
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
function sendAlertEmail(user, type) {
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
    html = `
  <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
    <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
      <h2 style="color: #c0392b; margin-bottom: 10px;">🚨 Stop-Loss Triggered</h2>
      <p style="font-size: 16px; color: #333;">Hello <strong>${user.username}</strong>,</p>
      <p style="font-size: 15px; color: #555;">
        Your mining account has been <strong>paused</strong> because your balance reached or fell below your stop-loss limit.
      </p>
      <ul style="font-size: 15px; color: #555;">
        <li>Current Balance: <strong>£${user.balance}</strong></li>
        <li>Stop-Loss Limit: <strong>£${user.stop_loss}</strong></li>
      </ul>
      <p style="font-size: 15px; color: #555;">
        You can log in to review your account and manually restart mining if you wish.
      </p>
      <p style="font-size: 13px; color: #999;">— HYPERCOIN Risk Management System</p>
    </div>
  </div>
  `;
  } else if (type === "takeProfit") {
    subject = "💰 Take-Profit Reached — Mining Paused";
    html = `
  <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
    <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
      <h2 style="color: #27ae60; margin-bottom: 10px;">💰 Take-Profit Reached</h2>
      <p style="font-size: 16px; color: #333;">Hello <strong>${user.username}</strong>,</p>
      <p style="font-size: 15px; color: #555;">
        Your mining account has been <strong>paused</strong> because your balance reached or exceeded your take-profit limit.
      </p>
      <ul style="font-size: 15px; color: #555;">
        <li>Current Balance: <strong>£${user.balance}</strong></li>
        <li>Take-Profit Limit: <strong>£${user.take_profit}</strong></li>
      </ul>
      <p style="font-size: 15px; color: #555;">
        You can log in to withdraw profits or adjust your plan.
      </p>
      <p style="font-size: 13px; color: #999;">— HYPERCOIN Risk Management System</p>
    </div>
  </div>
  `;
  }

  transporter.sendMail(
    {
      from: '"HYPERCOIN ALERTS" <efenteng1@gmail.com>',
      to: user.email,
      subject,
      html,
    },
    (err) => {
      if (err)
        console.error(`Error sending ${type} email to ${user.email}:`, err);
      else console.log(`${type} email sent to ${user.username}`);
    }
  );
}

// ============================
// Task: Update balances + SL/TP
// ============================
function updateUserBalances() {
  console.log("=== Cron Job Started ===", new Date().toLocaleString());

  pool.query(
    "SELECT * FROM hypercoin_users WHERE mining_state = 'active'",
    (err, miners) => {
      if (err) return console.error("Error selecting users:", err);

      console.log(`Found ${miners.length} active miners`);
      if (!miners.length) return console.log("No active miners found");

      // Total remaining queries: balance update + potential SL/TP updates per user
      let remaining = miners.length;

      miners.forEach((miner) => {
        const newBalance = calculateNewBalance(miner.balance, miner.user_type);

        // 1️⃣ Update balance
        pool.query(
          "UPDATE hypercoin_users SET balance = ?, last_updated = NOW() WHERE id = ?",
          [newBalance, miner.id],
          (err) => {
            if (err)
              console.error(
                `Error updating balance for ${miner.username}:`,
                err
              );
            else
              console.log(
                `Balance updated for ${miner.username}: £${newBalance}`
              );

            // After updating balance, check SL and TP for this user
            checkStopLoss(miner.id, newBalance, miner, () =>
              checkTakeProfit(miner.id, newBalance, miner, decrementRemaining)
            );
          }
        );
      });

      // Helper to decrement and close pool
      function decrementRemaining() {
        remaining--;
        if (remaining === 0) {
          console.log("All users processed. Closing pool...");
          pool.end(() => console.log("=== Cron Job Finished ==="));
        }
      }

      // Check stop-loss for a single user
      function checkStopLoss(userId, balance, user, cb) {
        if (user.stop_loss != null && balance <= user.stop_loss) {
          pool.query(
            "UPDATE hypercoin_users SET mining_state = ?, stop_loss = NULL WHERE id = ?",
            ["inactive", userId],
            (err) => {
              if (err) console.error(err);
              else console.log(`Stop-loss triggered for ${user.username}`);
              sendAlertEmail(user, "stopLoss");
              cb();
            }
          );
        } else cb();
      }

      // Check take-profit for a single user
      function checkTakeProfit(userId, balance, user, cb) {
        if (user.take_profit != null && balance >= user.take_profit) {
          pool.query(
            "UPDATE hypercoin_users SET mining_state = ?, take_profit = NULL WHERE id = ?",
            ["inactive", userId],
            (err) => {
              if (err) console.error(err);
              else console.log(`Take-profit triggered for ${user.username}`);
              sendAlertEmail(user, "takeProfit");
              cb();
            }
          );
        } else cb();
      }
    }
  );
}

// ============================
// Start Cron Job
// ============================
updateUserBalances();
