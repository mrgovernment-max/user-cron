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
// Helper: Send Transaction Email
// ============================
async function sendTransactionEmail(user, transaction, status) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "shypercoin@gmail.com",
        pass: "kqqy ptdr syib nlye",
      },
    });

    let subject, html;
    if (status === "confirmed") {
      subject = "✅ Transaction Confirmed – HyperCoin";
      html = `
      <div style="font-family: Arial, sans-serif; padding: 24px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e0e0e0; max-width: 600px; margin: auto;">
        <h2 style="color:#27ae60; text-align:center; margin-bottom: 24px;">✅ Transaction Successful</h2>
        <p style="font-size: 16px; color:#333;">Hello <strong>${user.username}</strong>,</p>
        <p style="font-size: 15px; color:#555; line-height: 1.6;">
          Your recent transaction has been <strong>successfully processed</strong>. Here are the details:
        </p>
        <table style="width:100%; margin-top:16px; border-collapse: collapse;">
          <tr>
            <td style="padding:8px; border:1px solid #e0e0e0;">Amount</td>
            <td style="padding:8px; border:1px solid #e0e0e0;">$${transaction.amount}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #e0e0e0;">Status</td>
            <td style="padding:8px; border:1px solid #e0e0e0;">Completed</td>
          </tr>
        </table>
        <p style="font-size: 14px; color:#777; margin-top: 24px;">
          You can log in to your dashboard to view more details or download a receipt.
        </p>
        <p style="font-size: 14px; color:#777;">Thank you for using HyperCoin!</p>
      </div>`;
    } else {
      subject = "❌ Transaction Failed – HyperCoin";
      html = `
      <div style="font-family: Arial, sans-serif; padding: 24px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e0e0e0; max-width: 600px; margin: auto;">
        <h2 style="color:#c0392b; text-align:center; margin-bottom: 24px;">❌ Transaction Failed</h2>
        <p style="font-size: 16px; color:#333;">Hello <strong>${user.username}</strong>,</p>
        <p style="font-size: 15px; color:#555; line-height: 1.6;">
          Unfortunately, your recent transaction could not be processed. Here are the details:
        </p>
        <table style="width:100%; margin-top:16px; border-collapse: collapse;">
          <tr>
            <td style="padding:8px; border:1px solid #e0e0e0;">Amount</td>
            <td style="padding:8px; border:1px solid #e0e0e0;">$${transaction.amount}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #e0e0e0;">Status</td>
            <td style="padding:8px; border:1px solid #e0e0e0;">Failed</td>
          </tr>
        </table>
        <p style="font-size: 14px; color:#777; margin-top: 24px;">
          Please check your payment method or contact support if the issue persists.
        </p>
        <p style="font-size: 14px; color:#777;">Thank you for using HyperCoin!</p>
      </div>`;
    }

    console.log(`📧 Sending ${status} email to ${user.email}...`);
    await transporter.sendMail({
      from: '"HYPERCOIN ALERTS" <shypercoin@gmail.com>',
      to: user.email,
      subject,
      html,
    });

    console.log(`✅ ${status.toUpperCase()} email sent to ${user.email}`);
  } catch (err) {
    console.error(`❌ Failed to send ${status} email:`, err);
  }
}

// ============================
// Check Transactions
// ============================
async function checkTransactions() {
  console.log("=== Transaction Check Started ===", new Date().toLocaleString());

  let connection;
  try {
    connection = await pool.getConnection();

    const [transactions] = await connection.query(
      "SELECT * FROM transactions WHERE status IN ('confirmed', 'failed') AND notified = 0"
    );

    console.log(`Found ${transactions.length} transactions to process`);
    if (!transactions.length) return console.log("No transactions to process");

    for (const transaction of transactions) {
      try {
        const [users] = await connection.query(
          "SELECT username, email FROM hypercoin_users WHERE username = ?",
          [transaction.username]
        );

        if (!users.length) {
          console.warn(
            `⚠️ No user found for username: ${transaction.username}`
          );
          continue;
        }

        const user = users[0];

        await sendTransactionEmail(user, transaction, transaction.status);

        await connection.query(
          "UPDATE transactions SET notified = 1 WHERE id = ?",
          [transaction.id]
        );

        console.log(
          `✅ Transaction ${transaction.reference} marked as notified`
        );
      } catch (txErr) {
        console.error(
          `❌ Error processing transaction ${transaction.reference}:`,
          txErr
        );
      }
    }

    console.log("All transactions processed ✅");
  } catch (err) {
    console.error("❌ Error checking transactions:", err);
  } finally {
    if (connection) connection.release();
  }
}

// ============================
// Calculate New Balance
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
      newBalance = Math.min(Math.max(newBalance, -Infinity), 20);
      break;
    case "professional":
      newBalance += Math.random() * 0.2 - 0.1;
      newBalance = Math.min(Math.max(newBalance, -Infinity), 30);
      break;
    case "expertise":
      newBalance += Math.random() * 0.3 - 0.15;
      newBalance = Math.min(Math.max(newBalance, 0), 40);
      break;
    default:
      newBalance += Math.random() * 0.1 - 0.05;
  }

  return parseFloat(newBalance.toFixed(2));
}

// ============================
// Send Alert Email
// ============================
async function sendAlertEmail(user, type) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "shypercoin@gmail.com",
        pass: "kqqy ptdr syib nlye",
      },
    });

    let subject, html;
    if (type === "stopLoss") {
      subject = "🚨 Stop-Loss Triggered — Investment Paused";
      html = `
      <div style="font-family: Arial, sans-serif; padding: 24px; background-color: #f9f9f9; border-radius: 10px; border: 1px solid #ddd; max-width: 500px; margin: auto;">
        <h2 style="color:#c0392b; text-align:center; margin-bottom: 16px;">🚨 Stop-Loss Triggered</h2>
        <p>Dear <strong>${user.username}</strong>,</p>
        <p>Your investment session has been paused because your balance dropped below your stop-loss threshold.</p>
        <p><strong>Current Balance:</strong> $${user.balance}</p>
      </div>`;
    } else {
      subject = "💰 Take-Profit Reached — Investment Paused";
      html = `
      <div style="font-family: Arial, sans-serif; padding: 24px; background-color: #f9f9f9; border-radius: 10px; border: 1px solid #ddd; max-width: 500px; margin: auto;">
        <h2 style="color:#27ae60; text-align:center; margin-bottom: 16px;">💰 Take-Profit Reached</h2>
        <p>Dear <strong>${user.username}</strong>,</p>
        <p>Congratulations! Your investment session has been paused as your balance reached your take-profit target.</p>
        <p><strong>Current Balance:</strong> $${user.balance}</p>
      </div>`;
    }

    console.log(`📧 Attempting to send ${type} email to ${user.email}...`);
    await transporter.sendMail({
      from: '"HYPERCOIN ALERTS" <shypercoin@gmail.com>',
      to: user.email,
      subject,
      html,
    });

    console.log(`✅ ${type} email sent`);
  } catch (err) {
    console.error(`❌ Failed to send ${type} email:`, err);
  }
}

// ============================
// Log User Message
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
// Update User Balances
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
    if (!miners.length) return console.log("No active miners found");

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
            `Stop-loss triggered. Investment Paused. Balance: $${newBalance}`,
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
            `Take-profit triggered. Investment Paused. Balance: $${newBalance}`,
            "take_profit"
          );
        }
      } catch (minerErr) {
        console.error(`❌ Error processing ${miner.username}:`, minerErr);
      }
    }

    console.log("All users processed.");
  } catch (err) {
    console.error("❌ Error running balance update:", err);
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

// ============================
// Main Execution
// ============================
async function main() {
  await updateUserBalances();
  await checkTransactions();
  shutdown("✅ Finished balances & transactions check.");
}

main();
