import type { Metadata } from "next";
import { NiumpiScene } from "./NiumpiScene";

export const metadata: Metadata = {
  title: "Niumpi — pierwszy kontakt",
  description: "The first playable prototype of the Niumpi virtual pet.",
};

export default function Home() {
  return <NiumpiScene />;
}
