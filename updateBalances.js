const mysql = require("mysql2");

// ✅ MySQL Pool with your DB info
const pool = mysql.createPool({
  host: process.env.DB_HOST || "sql8.freesqldatabase.com",
  user: process.env.DB_USER || "sql8792916",
  password: process.env.DB_PASS || "iEdb2pFif4",
  database: process.env.DB_NAME || "sql8792916",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Main function
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

      miners.forEach((miner) => {
        let currentBalance = parseFloat(miner.balance || 0);
        const planType = miner.user_type || "free";

        // Calculate new balance
        currentBalance = calculateNewBalance(currentBalance, planType);

        // 1️⃣ Update main balance in hypercoin_users
        pool.query(
          "UPDATE hypercoin_users SET balance = ?, last_updated = NOW() WHERE id = ?",
          [currentBalance, miner.id],
          (err) => {
            if (err) {
              console.error(
                `Error updating main balance for user ${miner.id}:`,
                err
              );
            } else {
              console.log(`Main balance updated for user ${miner.id}`);
            }
          }
        );

        // 2️⃣ Update balance_history instead of inserting
        pool.query(
          `UPDATE balance_history
           SET balance = ?, last_updated = NOW(), mining_state = ?, plan_type = ?
           WHERE user_id = ?`,
          [currentBalance, miner.mining_state || "active", planType, miner.id],
          (err, results) => {
            if (err) {
              console.error(
                `Error updating history for user ${miner.id}:`,
                err
              );
            } else if (results.affectedRows === 0) {
              console.log(
                `No history row found for user ${miner.id}, skipping update.`
              );
            } else {
              console.log(`History updated for user ${miner.id}`);
            }
          }
        );

        console.log(
          `Updated balance for user ${miner.id} (${planType}): £${currentBalance.toFixed(
            2
          )}`
        );
      });

      // End the pool after all queries
      pool.end(() => {
        console.log("=== Cron Job Finished ===\n");
      });
    }
  );
}

// Helper function
function calculateNewBalance(currentBalance, planType) {
  let newBalance = currentBalance;

  switch (planType.toLowerCase()) {
    case "free":
      newBalance = 0;
      break;
    case "basic":
      newBalance += Math.random() * 0.1 - 0.05;
      if (newBalance > 8) newBalance = 8 - Math.random() * 0.5;
      if (newBalance < 4) newBalance = 4 + Math.random() * 0.5;
      break;
    case "professional":
      newBalance += Math.random() * 0.2 - 0.1;
      if (newBalance > 15) newBalance = 15 - Math.random() * 0.5;
      if (newBalance < 10) newBalance = 10 + Math.random() * 0.5;
      break;
    case "expertise":
      newBalance += Math.random() * 0.3 - 0.15;
      if (newBalance > 20) newBalance = 20 - Math.random() * 0.5;
      if (newBalance < 15) newBalance = 15 + Math.random() * 0.5;
      break;
    default:
      newBalance += Math.random() * 0.1 - 0.05;
  }

  return parseFloat(newBalance.toFixed(2));
}

// Run once
updateUserBalances();
