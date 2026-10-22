import { useTideCloak, useAuthCallback, Authenticated, Unauthenticated } from "@tidecloak/react";
import Console from "./Console";

// IMPORTANT: isInitializing must be checked BEFORE Authenticated/Unauthenticated guards.
function App() {
  const { isInitializing } = useTideCloak();

  const { isCallback, isProcessing, error: callbackError } = useAuthCallback({
    onSuccess: (returnUrl) => window.location.assign(returnUrl || "/"),
    onError: () => window.location.assign("/"),
    onMissingVerifierRedirectTo: "/",
  });

  if (isCallback) {
    if (callbackError) return <Center>Authentication failed: {callbackError.message}</Center>;
    return <Center>{isProcessing ? "Completing login..." : "Redirecting..."}</Center>;
  }
  if (isInitializing) return <Center>Initializing TideCloak...</Center>;

  return (
    <>
      <Authenticated>
        <Console />
      </Authenticated>
      <Unauthenticated>
        <LoginPage />
      </Unauthenticated>
    </>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen grid place-items-center font-mono text-sm text-zinc-400">{children}</div>;
}

function LoginPage() {
  const { login } = useTideCloak();
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="max-w-md w-full border border-zinc-800 rounded-lg p-8 bg-zinc-900/50">
        <div className="font-mono text-xs text-cyan-400 tracking-widest">SPACE TRAFFIC COORDINATION</div>
        <h1 className="text-3xl font-semibold mt-2">BlindOrbit</h1>
        <p className="text-zinc-400 mt-3 text-sm">
          Collision avoidance between operators who will not share trajectories. Nobody holds a master key:
          authority to read both orbits emerges only when the operators approve.
        </p>
        <button onClick={login} className="mt-6 w-full rounded bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold py-2">
          Sign in with Tide
        </button>
        <p className="mt-4 font-mono text-[11px] text-zinc-500">
          Demo identities: dod-operator · commercial-operator · platform-admin (one browser profile each)
        </p>
      </div>
    </div>
  );
}

export default App;
