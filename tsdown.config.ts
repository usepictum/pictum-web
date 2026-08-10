import { defineConfig } from "tsdown";

export default defineConfig({
	platform: "neutral",
	dts: true,
	entry: ["src/index.ts"],
	tsconfig: "./tsconfig.build.json",
});
