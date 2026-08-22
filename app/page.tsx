import type { Metadata } from "next";
import { GameProvider } from "./ui/GameProvider";
import { GameShell } from "./ui/GameShell";
import { copy } from "./game/config/copy";

export const metadata: Metadata = {
  title: `${copy.brand.name} — ${copy.brand.tagline}`,
  description: copy.brand.promise,
};

export default function Home() {
  return (
    <GameProvider>
      <GameShell />
    </GameProvider>
  );
}
