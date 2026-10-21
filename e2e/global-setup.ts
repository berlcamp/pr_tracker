import { execSync } from "node:child_process";

export default function globalSetup() {
  execSync("supabase db reset", { stdio: "inherit" });
}
