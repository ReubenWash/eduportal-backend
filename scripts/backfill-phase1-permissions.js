// scripts/backfill-phase1-permissions.js
const { prisma } = require("../src/config/db");

const NEW_FINANCE_PERMISSIONS = ["manage_expenses", "view_ledger"];
const ROLES_TO_UPDATE = ["School Admin", "Accountant"];

const run = async () => {
  console.log("Backfilling Phase 1 finance permissions...\n");

  for (const name of ROLES_TO_UPDATE) {
    const role = await prisma.customRole.findUnique({ where: { name } });
    if (!role) {
      console.log(`Role "${name}" not found - skipping.`);
      continue;
    }

    const before = role.permissions;
    const merged = Array.from(new Set([...before, ...NEW_FINANCE_PERMISSIONS]));

    if (merged.length === before.length) {
      console.log(`${name}: already up to date (no change).`);
      continue;
    }

    await prisma.customRole.update({
      where: { name },
      data: { permissions: merged },
    });

    const added = merged.filter((p) => !before.includes(p));
    console.log(`${name}: added [${added.join(", ")}] (${before.length} -> ${merged.length}).`);
  }

  console.log("\nBackfill complete.");
  process.exit(0);
};

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});