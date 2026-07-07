import db from "#db/client";
import { createUser } from "#db/queries/users";
import { createWord } from "#db/queries/words";
import { createLobby, addPlayerToLobby } from "#db/queries/lobby";

await seed();
await db.end();
console.log("🌱 Database seeded.");

async function seed() {
  const words = [
    ["dog", "animals", 1],
    ["cat", "animals", 1],
    ["elephant", "animals", 2],
    ["pizza", "food", 1],
    ["sushi", "food", 2],
    ["guitar", "objects", 1],
    ["umbrella", "objects", 1],
    ["volcano", "nature", 2],
    ["astronaut", "people", 2],
    ["dinosaur", "animals", 2],
    ["skateboard", "objects", 1],
    ["rainbow", "nature", 1],
    ["robot", "objects", 2],
    ["lighthouse", "objects", 3],
    ["octopus", "animals", 2],
  ];
  for (const [text, category, difficulty] of words) {
    await createWord(text, category, difficulty);
  }

  const alice = await createUser("alice", "preset", "fox");
  const bob = await createUser("bob", "preset", "robot");

  const lobby = await createLobby(alice.id);
  await addPlayerToLobby(lobby.id, bob.id);

  console.log(`Sample lobby code: ${lobby.code}`);
}
