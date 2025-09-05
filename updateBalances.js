const mysql = require("mysql2");
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
function sendAlertEmail(user, type) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "efenteng1@gmail.com",
      pass: "hrzc cuih sssd ttja", // Make sure this is an app password
    },
  });

  let subject, html;

  if (type === "stopLoss") {
    subject = "🚨 Stop-Loss Triggered — Mining Paused";
    html = `
      <div style="font-family: Arial; padding: 20px;">
        <h2 style="color:#c0392b;">🚨 Stop-Loss Triggered</h2>
        <p>Hello <strong>${user.username}</strong>,</p>
        <p>Your mining account has been paused because your balance reached or fell below your stop-loss limit.</p>
        <ul>
          <li>Current Balance: <strong>£${user.balance}</strong></li>
          <li>Stop-Loss Limit: <strong>£${user.stop_loss}</strong></li>
        </ul>
      </div>`;
  } else if (type === "takeProfit") {
    subject = "💰 Take-Profit Reached — Mining Paused";
    html = `
      <div style="font-family: Arial; padding: 20px;">
        <h2 style="color:#27ae60;">💰 Take-Profit Reached</h2>
        <p>Hello <strong>${user.username}</strong>,</p>
        <p>Your mining account has been paused because your balance reached or exceeded your take-profit limit.</p>
        <ul>
          <li>Current Balance: <strong>£${user.balance}</strong></li>
          <li>Take-Profit Limit: <strong>£${user.take_profit}</strong></li>
        </ul>
      </div>`;
  }

  console.log(`📧 Sending ${type} email to ${user.email}`);
  transporter.sendMail(
    {
      from: '"HYPERCOIN ALERTS" <efenteng1@gmail.com>',
      to: user.email,
      subject,
      html,
    },
    (err, info) => {
      if (err) {
        console.error(`❌ Failed to send ${type} email:`, err);
      } else {
        console.log(
          `✅ ${type} email sent to ${user.username}: ${info.response}`
        );
      }
    }
  );
}

// ============================
// Task: Update Balances + SL/TP
// ============================
function updateUserBalances() {
  console.log("=== Cron Job Started ===", new Date().toLocaleString());

  pool.query(
    "SELECT * FROM hypercoin_users WHERE mining_state = 'active'",
    (err, miners) => {
      if (err) {
        console.error("❌ Error selecting users:", err);
        return shutdown();
      }

      console.log(`Found ${miners.length} active miners`);
      if (!miners.length) return shutdown("No active miners found");

      let remaining = miners.length;

      miners.forEach((miner) => {
        const newBalance = calculateNewBalance(miner.balance, miner.user_type);

        pool.query(
          "UPDATE hypercoin_users SET balance = ?, last_updated = NOW() WHERE id = ?",
          [newBalance, miner.id],
          (err) => {
            if (err) {
              console.error(
                `❌ Error updating balance for ${miner.username}:`,
                err
              );
              return decrementRemaining();
            }

            console.log(
              `💰 Balance updated for ${miner.username}: £${newBalance}`
            );

            // Fresh user object with updated balance
            const updatedUser = { ...miner, balance: newBalance };

            checkStopLoss(updatedUser, () =>
              checkTakeProfit(updatedUser, decrementRemaining)
            );
          }
        );
      });

      function decrementRemaining() {
        remaining--;
        if (remaining === 0) shutdown("All users processed.");
      }

      function checkStopLoss(user, cb) {
        if (user.stop_loss != null && user.balance <= user.stop_loss) {
          console.log(`⛔ Stop-loss triggered for ${user.username}`);
          pool.query(
            "UPDATE hypercoin_users SET mining_state = ?, stop_loss = NULL WHERE id = ?",
            ["inactive", user.id],
            (err) => {
              if (err) console.error(err);
              sendAlertEmail(user, "stopLoss");
              cb();
            }
          );
        } else cb();
      }

      function checkTakeProfit(user, cb) {
        if (user.take_profit != null && user.balance >= user.take_profit) {
          console.log(`🏆 Take-profit triggered for ${user.username}`);
          pool.query(
            "UPDATE hypercoin_users SET mining_state = ?, take_profit = NULL WHERE id = ?",
            ["inactive", user.id],
            (err) => {
              if (err) console.error(err);
              sendAlertEmail(user, "takeProfit");
              cb();
            }
          );
        } else cb();
      }
    }
  );
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
