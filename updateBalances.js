const mysql = require("mysql2");
const nodemailer = require("nodemailer");

// ✅ MySQL Pool
const pool = mysql.createPool({
  host: "sql8.freesqldatabase.com",
  user: "sql8792916",
  password: "iEdb2pFif4",
  database: "sql8792916",
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

  transporter.sendMail(
    {
      from: '"HYPERCOIN ALERTS" <efenteng1@gmail.com>',
      to: user.email,
      subject,
      html,
    },
    (err) => {
      if (err) console.error(`Error sending ${type} email:`, err);
      else console.log(`${type} email sent to ${user.username}`);
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
        console.error("Error selecting users:", err);
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
            if (err)
              console.error(
                `Error updating balance for ${miner.username}:`,
                err
              );
            else
              console.log(
                `Balance updated for ${miner.username}: £${newBalance}`
              );

            checkStopLoss(miner.id, newBalance, miner, () =>
              checkTakeProfit(miner.id, newBalance, miner, decrementRemaining)
            );
          }
        );
      });

      function decrementRemaining() {
        remaining--;
        if (remaining === 0) shutdown("All users processed.");
      }

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
