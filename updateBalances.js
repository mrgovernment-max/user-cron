const mysql = require("mysql2");

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

// Update balances for active miners
function updateUserBalances() {
  pool.query(
    "SELECT * FROM hypercoin_users WHERE mining_state = 'active'",
    (err, miners) => {
      if (err) {
        console.error("Error selecting users:", err);
        return;
      }

      console.log(`Found ${miners.length} active miners`);

      miners.forEach((miner) => {
        let currentBalance = parseFloat(miner.balance || 0);

        // Use user_type instead of plan_type
        const planType = miner.user_type || "free";

        // Calculate new balance based on user_type
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
              return;
            }
            console.log(`Main balance updated for user ${miner.id}`);
          }
        );

        // 2️⃣ Insert into balance_history
        pool.query(
          "UPDATE balance_history SET user_id = ?, balance = ?, last_updated = NOW(), mining_state = ?, plan_type = ?",
          [miner.id, currentBalance, miner.mining_state || "active", planType],
          (err) => {
            if (err) {
              console.error(
                `Error inserting history for user ${miner.id}:`,
                err
              );
              return;
            }
            console.log(`History inserted for user ${miner.id}`);
          }
        );

        console.log(
          `Updated balance for user ${
            miner.id
          } (${planType}): £${currentBalance.toFixed(2)}`
        );
      });
    }
  );
}

// Helper function to calculate balance
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
