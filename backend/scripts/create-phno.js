// Admin CLI: create a PHNO account.
//   node scripts/create-phno.js --clinic AC-002 --username nimasha --name "Nimasha P." [--password PW]
// If --password is omitted, reads AROGYA_PHNO_PASSWORD, else prompts (hidden) on a TTY.
import { openDb } from "../src/db.js";
import { createPhnoUser } from "../src/lib/phnoUsers.js";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

// Read a line without echoing it (raw mode on a TTY; falls back to a plain read
// when stdin is piped, e.g. automation). Control bytes are matched by code:
// 3=ctrl-c, 4=EOF, 8=backspace, 127=DEL.
function promptHidden(query) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(query);
    stdin.resume();
    stdin.setRawMode?.(true);
    let input = "";
    stdin.on("data", function onData(ch) {
      const s = ch.toString("utf8");
      const code = s.charCodeAt(0);
      if (s === "\n" || s === "\r" || code === 4) {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (code === 3) {
        process.exit(1); // ctrl-c
      } else if (code === 127 || code === 8) {
        input = input.slice(0, -1); // backspace
      } else {
        input += s;
      }
    });
  });
}

async function main() {
  const clinicId = arg("clinic");
  const username = arg("username");
  const fullName = arg("name");
  if (!clinicId || !username || !fullName) {
    console.error('Usage: node scripts/create-phno.js --clinic AC-002 --username nimasha --name "Full Name" [--password PW]');
    process.exit(2);
  }
  let password = arg("password") || process.env.AROGYA_PHNO_PASSWORD;
  if (!password) password = await promptHidden("Password: ");
  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(2);
  }

  const db = openDb();
  try {
    const user = createPhnoUser(db, { username, password, clinicId, fullName });
    console.log(`Created PHNO #${user.id}: ${username} @ ${clinicId} (${fullName})`);
  } catch (e) {
    console.error("Failed:", e.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
