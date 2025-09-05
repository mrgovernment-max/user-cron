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
async function sendAlertEmail(user, type) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "efenteng1@gmail.com",
        pass: "hrzc cuih sssd ttja", // replace with app password
      },
    });

    let subject, html;
    if (type === "stopLoss") {
      subject = "🚨 Stop-Loss Triggered — Mining Paused";
      html = `<p>Hello ${user.username}, stop-loss hit. Current balance: £${user.balance}</p>`;
    } else {
      subject = "💰 Take-Profit Reached — Mining Paused";
      html = `<p>Hello ${user.username}, take-profit hit. Current balance: £${user.balance}</p>`;
    }

    console.log(`📧 Attempting to send ${type} email to ${user.email}...`);

    const info = await transporter.sendMail({
      from: '"HYPERCOIN ALERTS" <efenteng1@gmail.com>',
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
