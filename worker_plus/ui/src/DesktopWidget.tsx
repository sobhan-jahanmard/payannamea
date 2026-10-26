import { useEffect, useState } from "react";
import type { WorkerState } from "./global";
import { RunStatusWidget } from "./RunStatusWidget";

export function DesktopWidget() {
  const [state, setState] = useState<WorkerState | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => window.workerPlus.readState().then(value => { if (active) setState(value); });
    void refresh();
    const unsubscribe = window.workerPlus.onEvent(event => {
      if (event.type === "state") setState(event.value as WorkerState);
      if (event.type === "exit") void refresh();
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  return <RunStatusWidget state={state} desktop/>;
}
