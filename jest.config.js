/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  coverageDirectory: "coverage",
  verbose: true,
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          ignoreDeprecations: "6.0",
          noImplicitAny: false,
          skipLibCheck: true,
          esModuleInterop: true,
          module: "commonjs",
          moduleResolution: "node",
          types: ["node", "jest"],
        },
      },
    ],
  },
};
