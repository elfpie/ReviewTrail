import { PortInUseError } from "@reviewtrail/server/remote";

/** Report an occupied review port without a stack trace. */
export function exitOnPortInUse<A extends unknown[], R>(
  start: (...args: A) => Promise<R>,
  exit: (message: string) => never,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try {
      return await start(...args);
    } catch (error) {
      if (error instanceof PortInUseError) exit(error.cliMessage);
      throw error;
    }
  };
}
