import { ChildProcess, spawn } from 'child_process';
import { createInterface, Interface } from 'readline';
import path from 'path';
import { EventEmitter } from 'events';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

export class SidecarManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private readline: Interface | null = null;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private nextId = 1;
  private eventCallback: ((event: string, data: any) => void) | null = null;

  spawn(binaryPath: string): void {
    // Resolve the binary path
    const resolvedPath = path.resolve(binaryPath);

    this.process = spawn(resolvedPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, RUST_LOG: 'info' },
    });

    this.process.on('error', (err) => {
      console.error('Sidecar process error:', err);
      this.emit('error', err);
    });

    this.process.on('exit', (code, signal) => {
      console.log(`Sidecar exited with code ${code}, signal ${signal}`);
      this.emit('exit', code, signal);
      this.rejectAllPending('Sidecar process exited');
    });

    // Read stderr for logging
    if (this.process.stderr) {
      this.process.stderr.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.log('[engine]', msg);
      });
    }

    // Read stdout line-by-line for JSON-RPC responses and events
    if (this.process.stdout) {
      this.readline = createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
      });

      this.readline.on('line', (line: string) => {
        if (!line.trim()) return;

        try {
          const msg = JSON.parse(line);

          if (msg.event) {
            // This is an event (no id field)
            if (this.eventCallback) {
              this.eventCallback(msg.event, msg.data);
            }
            this.emit('rpc-event', msg.event, msg.data);
          } else if (msg.id !== undefined && msg.id !== null) {
            // This is a response to a request
            const pending = this.pendingRequests.get(msg.id);
            if (pending) {
              this.pendingRequests.delete(msg.id);
              if (msg.error) {
                pending.reject(new Error(msg.error.message || 'RPC error'));
              } else {
                pending.resolve(msg.result);
              }
            }
          }
        } catch (e) {
          console.error('Failed to parse sidecar output:', line, e);
        }
      });
    }
  }

  async invoke(method: string, params?: any): Promise<any> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Sidecar not running');
    }

    const id = this.nextId++;
    const request = JSON.stringify({ id, method, params: params || {} });

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Set a timeout for the request
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`RPC timeout for method: ${method}`));
        }
      }, 30000);

      // Wrap resolve/reject to clear timeout
      const originalResolve = this.pendingRequests.get(id)!.resolve;
      const originalReject = this.pendingRequests.get(id)!.reject;
      this.pendingRequests.set(id, {
        resolve: (value: any) => {
          clearTimeout(timeout);
          originalResolve(value);
        },
        reject: (reason: any) => {
          clearTimeout(timeout);
          originalReject(reason);
        },
      });

      this.process!.stdin!.write(request + '\n', (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  onEvent(callback: (event: string, data: any) => void): void {
    this.eventCallback = callback;
  }

  shutdown(): void {
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    if (this.process) {
      const proc = this.process;

      // Try graceful shutdown first — close stdin so the engine sees EOF
      if (proc.stdin) {
        proc.stdin.end();
      }

      // Force kill after timeout
      const killTimeout = setTimeout(() => {
        if (this.process === proc) {
          proc.kill('SIGKILL');
        }
      }, 5000);

      proc.on('exit', () => {
        clearTimeout(killTimeout);
        if (this.process === proc) {
          this.process = null;
        }
      });

      // On Linux/macOS, send SIGTERM after a brief delay if stdin EOF
      // hasn't caused the process to exit yet.
      // On Windows, skip SIGTERM — rely on stdin EOF + SIGKILL timeout.
      if (process.platform !== 'win32') {
        setTimeout(() => {
          if (this.process === proc) {
            proc.kill('SIGTERM');
          }
        }, 500);
      }
    }

    this.rejectAllPending('Sidecar shutting down');
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }
}
