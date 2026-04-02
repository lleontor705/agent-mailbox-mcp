import type Database from "better-sqlite3";
import { MessageRepository } from "./messages.js";
import { ThreadRepository } from "./threads.js";
import { AgentRepository } from "./agents.js";
import { TaskRepository } from "./tasks.js";
import { LeaseRepository } from "./leases.js";
import { DeadLetterRepository } from "./dead-letter.js";

export { MessageRepository } from "./messages.js";
export { ThreadRepository } from "./threads.js";
export { AgentRepository } from "./agents.js";
export { TaskRepository } from "./tasks.js";
export { LeaseRepository } from "./leases.js";
export { DeadLetterRepository } from "./dead-letter.js";

export interface Repositories {
  messages: MessageRepository;
  threads: ThreadRepository;
  agents: AgentRepository;
  tasks: TaskRepository;
  leases: LeaseRepository;
  deadLetter: DeadLetterRepository;
}

export function createRepositories(db: Database.Database): Repositories {
  return {
    messages: new MessageRepository(db),
    threads: new ThreadRepository(db),
    agents: new AgentRepository(db),
    tasks: new TaskRepository(db),
    leases: new LeaseRepository(db),
    deadLetter: new DeadLetterRepository(db),
  };
}
