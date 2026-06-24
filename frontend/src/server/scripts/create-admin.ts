import "../env";

import { randomUUID } from "node:crypto";

import { hashPassword } from "../auth";
import { getDataSource } from "../db/data-source";
import { UserSchema } from "../db/entities";

function readArg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`--${name} is required`);
}

async function main() {
  const email = readArg("email").trim().toLowerCase();
  const password = readArg("password");
  const name = readArg("name", "مدیر").trim();
  const phone = readArg("phone", "09000000000").trim();

  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(UserSchema);
  let user = await repo.findOneBy({ email });
  if (!user) {
    user = repo.create({
      id: randomUUID(),
      email,
      full_name: name,
      phone,
      role: "admin",
      reset_token_hash: null,
      reset_token_expires_at: null
    });
  }

  user.full_name = name;
  user.phone = phone;
  user.role = "admin";
  user.password_hash = hashPassword(password);
  user.reset_token_hash = null;
  user.reset_token_expires_at = null;
  await repo.save(user);
  await dataSource.destroy();
  console.log(`Admin ready: ${email}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
