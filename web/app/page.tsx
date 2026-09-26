import { AssetManager } from "./components/AssetManager";
import { PageLock } from "./components/PageLock";

export const dynamic = "force-static";

export default function Home() {
  return <PageLock><AssetManager /></PageLock>;
}
