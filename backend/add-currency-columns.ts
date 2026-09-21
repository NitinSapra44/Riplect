import { sql } from "drizzle-orm";
import { db } from "./db";

async function addCurrencyColumns() {
  console.log("Adding currency columns to tables...");
  
  try {
    // Add currency column to booking_sessions
    await db.execute(sql`
      ALTER TABLE booking_sessions 
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD'
    `);
    console.log("Added currency column to booking_sessions");
    
    // Add currency column to events
    await db.execute(sql`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD'
    `);
    console.log("Added currency column to events");
    
    // Add currency column to digital_products
    await db.execute(sql`
      ALTER TABLE digital_products 
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD'
    `);
    console.log("Added currency column to digital_products");
    
    // Add currency column to physical_products
    await db.execute(sql`
      ALTER TABLE physical_products 
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD'
    `);
    console.log("Added currency column to physical_products");
    
    // Add currency column to digital_product_purchases
    await db.execute(sql`
      ALTER TABLE digital_product_purchases 
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD'
    `);
    console.log("Added currency column to digital_product_purchases");
    
    console.log("All currency columns added successfully!");
  } catch (error) {
    console.error("Error adding currency columns:", error);
    throw error;
  }
}

addCurrencyColumns()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
