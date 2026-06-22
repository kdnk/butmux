import React from "react";
import { render } from "ink";
import { createAppService } from "../core/app-service";
import { TuiApp } from "./App";

export async function renderTui(input: { configDir: string; stateDir: string }): Promise<void> {
  const service = createAppService(input);
  const instance = render(<TuiApp service={service} />);
  await instance.waitUntilExit();
}
