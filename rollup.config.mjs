import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { builtinModules } from "node:module";

const external = [
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`),
];

export default {
  input: "src/index.ts",
  external,
  output: {
    dir: "dist",
    entryFileNames: "index.js",
    format: "cjs",
    inlineDynamicImports: true,
    exports: "auto",
    sourcemap: false,
  },
  plugins: [
    nodeResolve({
      preferBuiltins: true,
      exportConditions: ["node", "import", "default"],
    }),
    typescript({
      tsconfig: "./tsconfig.rollup.json",
    }),
    commonjs({
      ignoreDynamicRequires: true,
    }),
  ],
};
