import { expect, mock, test } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import register from "../integrations/pi";

function fixture(decision: string, switchSession = false) {
  let handler!: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  let session = "first";
  const exec = mock(async () => {
    if (switchSession) session = "second";
    return { code: 0, stdout: JSON.stringify({ decision, message: "Check the retry branch." }) };
  });
  const sendUserMessage = mock();
  register({
    on: mock(),
    registerCommand: (name: string, command: { handler: typeof handler }) => {
      expect(name).toBe("reviewtrail");
      handler = command.handler;
    },
    exec, sendUserMessage,
  } as unknown as ExtensionAPI);
  const ctx = { cwd: "/project", sessionManager: { getSessionId: () => session }, ui: { notify: mock() } } as unknown as ExtensionCommandContext;
  return { run: () => handler('--patch-file "two words.patch"', ctx), exec, sendUserMessage };
}

test("Pi returns reviewer feedback to the invoking session and preserves quoted arguments", async () => {
  const review = fixture("annotated");
  await review.run();
  expect(review.exec).toHaveBeenCalledWith("reviewtrail", ["--pi-command", '--patch-file "two words.patch"'], expect.objectContaining({ cwd: "/project" }));
  expect(review.sendUserMessage).toHaveBeenCalledWith("Check the retry branch.", { deliverAs: "followUp" });
});

test("help, dismissed reviews and switched sessions do not send a follow-up", async () => {
  for (const review of [fixture("info"), fixture("dismissed"), fixture("annotated", true)]) {
    await review.run();
    expect(review.sendUserMessage).not.toHaveBeenCalled();
  }
});
