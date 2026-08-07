import { ErrorScreen } from "@/components/error-screen.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { useMcpApp, useMcpHostContext, useMcpState } from "@/context.tsx";
import type { HelloInput, HelloOutput } from "../../../api/tools/hello.ts";

export default function HelloPage() {
  const state = useMcpState<HelloInput, HelloOutput>();
  const app = useMcpApp();
  const hostContext = useMcpHostContext();
  const isFullscreen = hostContext?.displayMode === "fullscreen";

  async function toggleDisplayMode() {
    await app?.requestDisplayMode({
      mode: isFullscreen ? "inline" : "fullscreen",
    });
  }

  if (state.status === "initializing") {
    return (
      <div className="flex justify-center items-center p-6 min-h-dvh">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="border-2 border-muted border-t-primary rounded-full w-4 h-4 animate-spin" />
          <span className="text-sm">Connecting to host...</span>
        </div>
      </div>
    );
  }

  if (state.status === "connected") {
    return (
      <div className="flex justify-center items-center p-6 min-h-dvh">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Hello MCP App</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Connected. Call the <Badge variant="secondary">hello_world</Badge> tool to see a greeting here.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.status === "error") {
    return <ErrorScreen title="Error" message={state.error ?? "Unknown error"} />;
  }

  if (state.status === "tool-cancelled") {
    return <ErrorScreen title="Cancelled" message="Tool call was cancelled." cancelled />;
  }

  if (state.status === "tool-input") {
    return (
      <div className="flex justify-center items-center p-6 min-h-dvh">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="border-2 border-muted border-t-primary rounded-full w-4 h-4 animate-spin" />
          <span className="text-sm">Greeting {state.toolInput?.name ?? "someone"}...</span>
        </div>
      </div>
    );
  }

  // tool-result
  return (
    <div className="flex justify-center items-center p-6 min-h-dvh">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">{state.toolResult?.greeting}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.toolResult?.timestamp ? (
            <p className="text-muted-foreground text-xs">{new Date(state.toolResult.timestamp).toLocaleString()}</p>
          ) : null}
          <div className="flex justify-center items-center gap-2">
            <Button
              onClick={() => {
                const name = state.toolInput?.name ?? "there";
                app?.sendMessage({
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Please greet ${name} warmly and tell them a little about yourself — who you are, what you can help with, and something interesting about how you work.`,
                    },
                  ],
                });
              }}
            >
              Send Message
            </Button>
            <Button variant="outline" onClick={toggleDisplayMode}>
              {isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
