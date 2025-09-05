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
  let newBalance = currentBalance;

  switch (planType.toLowerCase()) {
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
        <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
          <h2 style="color: #c0392b;">🚨 Stop-Loss Triggered</h2>
          <p>Hello <strong>${user.username}</strong>,</p>
          <p>Your mining account has been <strong>paused</strong> because your balance reached or fell below your stop-loss limit.</p>
          <p>Current Balance: <strong>£${user.balance}</strong><br>Stop-Loss Limit: <strong>£${user.stop_loss}</strong></p>
          <p>You can log in to review and manually restart mining if you wish.</p>
          <p style="color: #777; font-size: 13px;">— The HYPERCOIN Risk Management System</p>
        </div>
      </div>
    `;
  } else if (type === "takeProfit") {
    subject = "💰 Take-Profit Reached — Mining Paused";
    html = `
      <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
          <h2 style="color: #27ae60;">💰 Take-Profit Reached</h2>
          <p>Hello <strong>${user.username}</strong>,</p>
          <p>Your mining account has been <strong>paused</strong> because your balance reached or exceeded your take-profit limit.</p>
          <p>Current Balance: <strong>£${user.balance}</strong><br>Take-Profit Limit: <strong>£${user.take_profit}</strong></p>
          <p>You can log in to withdraw profits or adjust your plan.</p>
          <p style="color: #777; font-size: 13px;">— The HYPERCOIN Risk Management System</p>
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
// Task 1: Update User Balances
// ============================
function updateUserBalances() {
  console.log("=== Cron Job Started ===", new Date().toLocaleString());

  pool.query(
    "SELECT * FROM hypercoin_users WHERE mining_state = 'active'",
    (err, miners) => {
      if (err) {
        console.error("Error selecting users:", err);
        return pool.end();
      }

      console.log(`Found ${miners.length} active miners`);

      if (miners.length === 0) {
        console.log("No active miners found, ending job.");
        return pool.end();
      }

      let remaining = miners.length;

      miners.forEach((miner) => {
        let newBalance = calculateNewBalance(miner.balance, miner.user_type);

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

            remaining--;
            if (remaining === 0) {
              // Run stop-loss and take-profit after all balances updated
              stopLoss();
              takeProfit();
              // Close pool after all tasks finished
              setTimeout(
                () => pool.end(() => console.log("=== Cron Job Finished ===")),
                5000
              );
            }
          }
        );
      });
    }
  );
}

// ============================
// Task 2: Stop-Loss Check
// ============================
function stopLoss() {
  pool.query(
    "SELECT * FROM hypercoin_users WHERE balance <= stop_loss AND mining_state = 'active'",
    (err, results) => {
      if (err) return console.error("Stop-Loss query error:", err);
      if (!results.length) return console.log("No stop-loss triggers");

      results.forEach((user) => {
        const sql = `
        UPDATE hypercoin_users
        SET mining_state = ?, stop_loss = NULL
        WHERE id = ?
      `;
        pool.query(sql, ["inactive", user.id], (err) => {
          if (err) return console.error(err);
          console.log(
            `Stop-loss triggered for ${user.username}, stop_loss reset to NULL`
          );
        });
      });
    }
  );
}

// ============================
// Task 3: Take-Profit Check
// ============================
function takeProfit() {
  pool.query(
    "SELECT * FROM hypercoin_users WHERE balance >= take_profit AND mining_state = 'active'",
    (err, results) => {
      if (err) return console.error("Take-Profit query error:", err);
      if (!results.length) return console.log("No take-profit triggers");

      results.forEach((user) => {
        const sql = `
        UPDATE hypercoin_users
        SET mining_state = ?, take_profit = NULL
        WHERE id = ?
      `;
        pool.query(sql, ["inactive", user.id], (err) => {
          if (err) return console.error(err);
          console.log(
            `Take-profit triggered for ${user.username}, take_profit reset to NULL`
          );
        });
      });
    }
  );
}

// ============================
// Run the cron job
// ============================
updateUserBalances();
