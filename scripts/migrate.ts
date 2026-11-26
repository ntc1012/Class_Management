import { initialize, closeDatabase } from "../src/lib/db";
initialize()
  .then(() => console.log("Database schema is ready."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
