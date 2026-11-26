import { randomUUID } from "node:crypto";
import {
  initialize,
  query,
  transaction,
  now,
  closeDatabase,
} from "../src/lib/db";
import { hashPassword } from "../src/lib/security";
async function main() {
  const name = process.env.OWNER_NAME,
    email = process.env.OWNER_EMAIL,
    password = process.env.OWNER_PASSWORD,
    center = process.env.CENTER_NAME;
  if (!name || !email || !center || !password || password.length < 12)
    throw new Error(
      "Set OWNER_NAME, OWNER_EMAIL, OWNER_PASSWORD (12+ chars), CENTER_NAME in the process environment.",
    );
  await initialize();
  await transaction(async () => {
    const centerId = randomUUID();
    await query("INSERT INTO centers(id,name,created_at) VALUES(?,?,?)", [
      centerId,
      center,
      now(),
    ]);
    await query(
      "INSERT INTO users(id,center_id,name,email,role,password_hash,created_at) VALUES(?,?,?,?,?,?,?)",
      [
        randomUUID(),
        centerId,
        name,
        email.toLowerCase(),
        "owner",
        hashPassword(password),
        now(),
      ],
    );
  });
  console.log("Center and owner created.");
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
