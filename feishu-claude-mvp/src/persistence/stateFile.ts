import fs from 'node:fs';
import path from 'node:path';
import type { PersistedState } from '../session/sessionTypes.js';

const EMPTY_STATE: PersistedState = {
  sessions: {},
  processedEventIds: [],
};

export class StateFile {
  public constructor(private readonly filePath: string) {}

  public load(): PersistedState {
    if (!fs.existsSync(this.filePath)) {
      this.ensureParentDir();
      this.save(EMPTY_STATE);
      return EMPTY_STATE;
    }

    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) {
      return EMPTY_STATE;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>;

    return {
      sessions: parsed.sessions ?? {},
      processedEventIds: parsed.processedEventIds ?? [],
    };
  }

  public save(state: PersistedState): void {
    this.ensureParentDir();
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(tempPath, this.filePath);
  }

  private ensureParentDir(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
  }
}
